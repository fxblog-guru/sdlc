/**
 * Tests for the realtime layer: which file events matter, how a burst becomes one redraw, how
 * "2 min ago" is worded, and how a file written after the index changes the view model.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { Debouncer, LiveReader, Throttle, Timers, applyLive, classify, parseFindings, parseLedger, parseLogHead, parseProgress, parseReflog, relativeTime } from '../live';
import { State, loadState } from '../model';
import { buildViewModel } from '../viewmodel';

const FIXTURE = path.resolve(__dirname, '../../../../tests/fixtures/state.sample.json');

/** A clock and timer queue the test drives by hand. */
function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 1_000_000;
  let seq = 0;
  const queue = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      queue.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(h) {
      queue.delete(h as number);
    },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

// ---- classify -------------------------------------------------------------------------------------

test('classify names every source the board watches', () => {
  assert.equal(classify('dev/state.json'), 'state');
  assert.equal(classify('dev/implementation/demo/progress.md'), 'progress');
  assert.equal(classify('dev\\implementation\\demo\\lanes\\lane-qc2.md'), 'lane');
  assert.equal(classify('dev/reviews/demo/G7-implementation-20261013-045948-e0bc-a2.md'), 'gate-log');
  assert.equal(classify('dev/reviews/_repo/GK-knowledge-20260918-101500-4c7b.md'), 'gate-log');
  assert.equal(classify('dev/verification/demo/runs/20261013-071718-50c4/verify.md'), 'verification');
  assert.equal(classify('dev/verification/demo/runs/20261013-071718-50c4/logs/go-lint.txt'), 'verification');
  assert.equal(classify('dev/decisions/demo.md'), 'decision');
  assert.equal(classify('.git/HEAD'), 'git');
  assert.equal(classify('.git/logs/HEAD'), 'git');
  assert.equal(classify('.git/refs/heads/feature/release-management'), 'git');
});

test('classify reads a .sdlc root, though it is a dot folder, and still skips dot folders inside it', () => {
  assert.equal(classify('.sdlc/state.json', '.sdlc'), 'state');
  assert.equal(classify('.sdlc/reviews/demo/G7-implementation-20261013-045948-e0bc-a2.md', '.sdlc'), 'gate-log');
  assert.equal(classify('.sdlc/implementation/demo/progress.md', '.sdlc'), 'progress');
  assert.equal(classify('.sdlc/reviews/demo/.reaffirm-G0-20261001-083030-4a26.diff', '.sdlc'), null);
  assert.equal(classify('.claude/worktrees/agent-1/.sdlc/state.json', '.sdlc'), null);
  assert.equal(classify('dev/state.json', '.sdlc'), null);
});

test('classify ignores dot folders, scratch files and everything else', () => {
  assert.equal(classify('.claude/worktrees/agent-1/dev/implementation/demo/progress.md'), null);
  assert.equal(classify('dev/reviews/demo/.reaffirm-G0-20261001-083030-4a26.diff'), null);
  assert.equal(classify('dev/implementation/.scratch/progress.md'), null);
  assert.equal(classify('dev/reviews/.old/G7-implementation-20261013-045948-e0bc.md'), null);
  assert.equal(classify('dev/plan/demo/tasks.md'), null);
  assert.equal(classify('.git/objects/ab/cdef'), null);
  assert.equal(classify('.git/index'), null);
  assert.equal(classify('src/main.go'), null);
  assert.equal(classify('docs/dev/state.json'), null);
});

test('classify follows a custom dev root', () => {
  assert.equal(classify('pipeline/dev/state.json', 'pipeline/dev'), 'state');
  assert.equal(classify('dev/state.json', 'pipeline/dev'), null);
});

// ---- debounce and throttle ----------------------------------------------------------------------

test('a burst of events becomes one flush, 300 ms after the last, carrying every kind', () => {
  const t = fakeTimers();
  const flushes: string[][] = [];
  const d = new Debouncer<string>((k) => flushes.push([...k].sort()), 300, t);
  d.push('progress');
  t.advance(100);
  d.push('gate-log');
  t.advance(100);
  d.push('progress');
  t.advance(299);
  assert.equal(flushes.length, 0, 'flushed before the burst was over');
  t.advance(1);
  assert.deepEqual(flushes, [['gate-log', 'progress']]);
  t.advance(5000);
  assert.equal(flushes.length, 1, 'flushed again with nothing pending');
});

test('a file rewritten without pause still redraws, bounded by maxWait', () => {
  const t = fakeTimers();
  let flushes = 0;
  const d = new Debouncer<string>(() => flushes++, 300, t, 1500);
  for (let n = 0; n < 20; n++) {
    d.push('progress');
    t.advance(200);
  }
  // 4 s of continuous writes: a pure trailing debounce would never fire.
  assert.ok(flushes >= 2 && flushes <= 4, `expected 2–4 flushes, got ${flushes}`);
});

test('dispose drops what was pending', () => {
  const t = fakeTimers();
  let flushes = 0;
  const d = new Debouncer<string>(() => flushes++, 300, t);
  d.push('lane');
  d.dispose();
  t.advance(1000);
  assert.equal(flushes, 0);
});

test('the background rebuild runs at most once per interval, with one trailing run', async () => {
  const t = fakeTimers();
  let runs = 0;
  const th = new Throttle(async () => {
    runs++;
  }, 60_000, t);
  th.request();
  await Promise.resolve();
  assert.equal(runs, 1);
  th.request();
  th.request();
  th.request();
  await Promise.resolve();
  assert.equal(runs, 1, 'ran again inside the interval');
  t.advance(60_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 2, 'the trailing request did not run');
  t.advance(600_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(runs, 2, 'ran with nothing requested');
});

// ---- relative time ------------------------------------------------------------------------------

test('relative time reads like a person would say it', () => {
  const now = Date.parse('2026-10-13T12:00:00Z');
  assert.equal(relativeTime(now - 10_000, now), 'just now');
  assert.equal(relativeTime(now - 2 * 60_000, now), '2 min ago');
  assert.equal(relativeTime(now - 59 * 60_000, now), '59 min ago');
  assert.equal(relativeTime(now - 3 * 3600_000, now), '3 h ago');
  assert.equal(relativeTime('2026-10-11T12:00:00Z', now), '2 d ago');
  assert.equal(relativeTime('2026-09-18T21:00:00Z', now), 'Sep 18');
  assert.equal(relativeTime(now + 60_000, now), 'just now', 'a clock a little ahead is not "in the future"');
  assert.equal(relativeTime('not a date', now), '');
});

test('relative time keeps ticking: the same event reads differently a few minutes later', () => {
  const at = Date.parse('2026-10-13T12:00:00Z');
  assert.equal(relativeTime(at, at + 30_000), 'just now');
  assert.equal(relativeTime(at, at + 5 * 60_000), '5 min ago');
});

// ---- parsers ------------------------------------------------------------------------------------

test('progress.md: last row per task wins, columns by header, in_progress accepted', () => {
  const rows = parseProgress(
    [
      '| Task | Status | Commit | Note | Source |',
      '|---|---|---|---|---|',
      '| TASK-001 | in-progress | — | started | lane-a |',
      '| TASK-002 | blocked | — | waiting on DEC-002 \\| the page size | lane-a |',
      '| TASK-001 | done | 3a3c66e | — | lane-a |',
      '| TASK-003 | in_progress | — | — | lane-b |',
      '| TASK-004 | finished | — | — | lane-b |',
    ].join('\n'),
  );
  assert.equal(rows.get('TASK-001')?.status, 'done');
  assert.equal(rows.get('TASK-001')?.commit, '3a3c66e');
  assert.equal(rows.get('TASK-002')?.note, 'waiting on DEC-002 \\| the page size');
  assert.equal(rows.get('TASK-003')?.status, 'in-progress');
  assert.equal(rows.has('TASK-004'), false, 'an unknown status was read');
});

test('ledger and gate-log front matter read the fields the overlay needs', () => {
  const ledger = parseLedger('| Id | Question | Status | Answer |\n|---|---|---|---|\n| DEC-001 | Q? | answered | Yes — Luan |\n| DEC-002 | Q2? | open | — |');
  assert.equal(ledger.get('DEC-001')?.status, 'answered');
  assert.equal(ledger.get('DEC-002')?.answer, null);

  const head = parseLogHead('---\nslug: demo\ngate: G7\nstage: implementation\nrun_id: 20261013-045948-e0bc\nattempt: 2\nverdict: PASS\nscope: null\n---\n# body');
  assert.deepEqual(head, { gate: 'G7', runId: '20261013-045948-e0bc', attempt: 2, verdict: 'PASS', scope: null });
  assert.equal(parseLogHead('no front matter'), undefined);
});

test('findings carry severity and a short problem from the log table', () => {
  const f = parseFindings(
    '## Checklist\n\n| Id | Severity |\n|---|---|\n| CR-999 | BLOCKER |\n\n## Findings\n\n| Id | Severity | Location | Problem |\n|---|---|---|---|\n| CR-468 | MINOR | `x.tsx` | The fallback trusts a `last` note that nothing ever clears. More text. |\n| CR-469 | INFO | y | Carried, and narrowed. The artifact half stands. |\n\n## Verdict\n',
  );
  assert.equal(f.has('CR-999'), false, 'read a table outside ## Findings');
  assert.equal(f.get('CR-468')?.severity, 'minor');
  assert.equal(f.get('CR-468')?.problem, 'The fallback trusts a last note that nothing ever clears.');
  assert.equal(f.get('CR-469')?.problem, 'Carried, and narrowed. The artifact half stands.', 'a lead-in sentence alone says nothing');
});

test('the reflog gives commits and merges newest first, and skips checkouts', () => {
  const z = '0'.repeat(40);
  const a = 'a'.repeat(40);
  const b = 'b'.repeat(40);
  const c = 'c'.repeat(40);
  const log = [
    `${z} ${a} Harry <h@x> 1791873602 +0700\tcommit (initial): first`,
    `${a} ${b} Harry <h@x> 1791873700 +0700\tcheckout: moving from main to lane`,
    `${b} ${c} Harry <h@x> 1791875766 +0700\tmerge lane-qc2: Merge made by the 'ort' strategy.`,
    `${c} ${a} Harry <h@x> 1791888491 +0700\tcommit: docs(verification): G8 run`,
  ].join('\n');
  const commits = parseReflog(log);
  assert.deepEqual(
    commits.map((x) => x.subject),
    ['docs(verification): G8 run', 'Merge lane-qc2', 'first'],
  );
  assert.equal(commits[0].at, 1791888491 * 1000);
  assert.equal(commits[0].sha, 'aaaaaaa');
});

// ---- the event → view model path ------------------------------------------------------------------

function project(): { root: string; state: State; touch(rel: string, text: string, at: number): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdlc-live-'));
  const state = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as State;
  const touch = (rel: string, text: string, at: number): void => {
    const file = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    fs.utimesSync(file, at / 1000, at / 1000);
  };
  fs.mkdirSync(path.join(root, 'dev'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'state.json'), JSON.stringify(state));
  return { root, state, touch };
}

test('a progress row written after the index changes the task and its counts', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  const task = p.state.initiatives[0].tasks.find((t) => t.status !== 'done');
  assert.ok(task, 'the fixture has no unfinished task');

  const result = loadState(p.root, 'dev/state.json');
  assert.ok(result.ok);
  const before = buildViewModel(result, { live: new LiveReader().snapshot(p.root, result.state) });
  assert.ok(before.ok);
  const doneBefore = before.initiatives[0].counts.done;

  p.touch(`dev/implementation/${slug}/progress.md`, `| Task | Status | Commit | Note |\n|---|---|---|---|\n| ${task.id} | done | abc1234 | — |\n`, indexAt + 60_000);
  const after = buildViewModel(result, { live: new LiveReader().snapshot(p.root, result.state) });
  assert.ok(after.ok);
  assert.equal(after.initiatives[0].counts.done, doneBefore + 1);
  assert.equal(after.initiatives[0].tasks.find((t) => t.id === task.id)?.status, 'done');
  assert.equal(after.initiatives[0].tasksLive, true);
  assert.equal(after.live.ahead, true);
});

test('a progress.md older than the index does not override it', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  const task = p.state.initiatives[0].tasks.find((t) => t.status !== 'done');
  assert.ok(task);
  p.touch(`dev/implementation/${slug}/progress.md`, `| Task | Status |\n|---|---|\n| ${task.id} | done |\n`, indexAt - 60_000);
  const snap = new LiveReader().snapshot(p.root, p.state);
  assert.equal(applyLive(p.state, snap).initiatives[0].tasks.find((t) => t.id === task.id)?.status, task.status);
});

test('a second read names the transition: "TASK-x done"', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  const task = p.state.initiatives[0].tasks.find((t) => t.status !== 'done');
  assert.ok(task);
  const file = `dev/implementation/${slug}/progress.md`;
  p.touch(file, `| Task | Status |\n|---|---|\n| ${task.id} | in-progress |\n`, indexAt + 1000 * 60);
  let clock = indexAt + 1000 * 120;
  const reader = new LiveReader('dev', () => clock);
  reader.snapshot(p.root, p.state);
  p.touch(file, `| Task | Status |\n|---|---|\n| ${task.id} | in-progress |\n| ${task.id} | done |\n`, indexAt + 1000 * 180);
  clock = indexAt + 1000 * 181;
  const snap = reader.snapshot(p.root, p.state);
  assert.equal(snap.activity[0].title, `${task.id} done`);
  assert.equal(snap.lastEventAt, clock);
});

test('a gate log newer than the index shows its verdict beside the builder state, never in place of it', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  const g7 = p.state.initiatives[0].stages.find((s) => s.gate === 'G7');
  assert.ok(g7);
  p.touch(
    `dev/reviews/${slug}/G7-implementation-29990101-000000-ffff.md`,
    `---\nslug: ${slug}\ngate: G7\nstage: implementation\nrun_id: 29990101-000000-ffff\nattempt: 1\nverdict: CHANGES_REQUESTED\n---\n`,
    indexAt + 60_000,
  );
  const result = loadState(p.root, 'dev/state.json');
  assert.ok(result.ok);
  const vm = buildViewModel(result, { live: new LiveReader().snapshot(p.root, result.state) });
  assert.ok(vm.ok);
  const gate = vm.initiatives[0].gates.find((g) => g.gate === 'G7');
  assert.equal(gate?.state, g7.state, 'the builder state was overwritten');
  assert.equal(gate?.live?.state, 'CHANGES_REQUESTED');
  assert.equal(gate?.live?.source, 'log');
  assert.match(gate?.live?.note ?? '', /not been rebuilt/);
  assert.equal(vm.live.activity.some((a) => a.kind === 'gate-log' && a.title.startsWith('G7')), true);
});

test('a verification run with no G8 log yet shows G8 as reviewing, marked inferred', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  p.touch(`dev/verification/${slug}/runs/29990101-000000-aaaa/verify.md`, '# verify', indexAt + 60_000);
  const snap = new LiveReader().snapshot(p.root, p.state);
  const g8 = snap.slugs.get(slug)?.gates.get('G8');
  assert.equal(g8?.state, 'REVIEWING');
  assert.equal(g8?.source, 'inferred');
});

test('lane notes under a dot folder are not activity', () => {
  const p = project();
  const indexAt = Date.parse(p.state.generated_at);
  const slug = p.state.initiatives[0].slug;
  p.touch(`.claude/worktrees/a/dev/implementation/${slug}/lanes/lane-x.md`, 'x', indexAt + 60_000);
  p.touch(`dev/implementation/${slug}/lanes/lane-y.md`, 'y', indexAt + 60_000);
  const snap = new LiveReader().snapshot(p.root, p.state);
  const lanes = snap.activity.filter((a) => a.kind === 'lane').map((a) => a.title);
  assert.deepEqual(lanes, ['Lane y notes updated']);
});

test('with no live files the view model is the index alone, and says it is not ahead', () => {
  const p = project();
  const result = loadState(p.root, 'dev/state.json');
  assert.ok(result.ok);
  const plain = buildViewModel(result);
  const live = buildViewModel(result, { live: new LiveReader().snapshot(p.root, result.state), watching: true });
  assert.ok(plain.ok && live.ok);
  assert.equal(live.live.ahead, false);
  assert.equal(live.live.watching, true);
  assert.deepEqual(
    live.initiatives[0].counts,
    plain.initiatives[0].counts,
  );
});
