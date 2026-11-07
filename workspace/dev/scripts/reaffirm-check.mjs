#!/usr/bin/env node
/**
 * reaffirm-check.mjs — is an edit to a gate's own artifact inside the self-edit reaffirm bound?
 * (DEV-CONTRACTS §4.4)
 *
 *   node dev/scripts/reaffirm-check.mjs <artifact> --against <prior-file | recorded-sha256>
 *   node dev/scripts/reaffirm-check.mjs --cascade <slug> [--root dev] [--out <dir>] [--json]
 *   node dev/scripts/reaffirm-check.mjs --since <prior gate log> --out <dir> [--json]
 *
 * `--since` is the re-review brief (§4.3): for each output of the prior log, the diff from the
 * committed version that log judged to the file on disk, plus the code since `reviewed_commit`
 * on a G7 log (whose generated change-summary and lane notes are listed, not diffed), plus the
 * log's open findings. Outputs whose judged version is not in history are
 * listed under `readInFull`. Exit 0 · 2 on a usage or git error.
 *
 * `--cascade` plans a batch reaffirm (`/sdlc-gate <slug> --reaffirm-all`): which STALE gates one
 * reviewer pass may reaffirm, which follow their origin, and which are excluded (§4.4). With `--out`
 * it writes each changed input's diff once, `<file>-<commit>.diff`, and names it per gate.
 * Exit 0 when at least one gate is to be reaffirmed · 1 when none is · 2 on a usage or git error.
 *
 * With a sha256 — the hash the last full review recorded for this output — the reviewed version is
 * found in git history (§4.4 has every PASS commit its artifacts). Prints the verdict, the reasons,
 * and the diff as a ```diff block the reviewer pastes into the reaffirm log's `## Scope`.
 *
 * Exit 0 inside the bound · 1 outside it · 2 the prior version cannot be found.
 *
 * The script checks the mechanical half only. The reviewer still checks that no changed line sits
 * in a section a checklist row judged, and reads every line of the diff.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { DEPENDS_ON, LANE_FRAGMENT, buildState } from './build-state.mjs';
import { decisionRowsHash, parseDoc, plain, readDoc, readTable, sha256, normalise, splitRef } from './lib/doc.mjs';
import { MAX_BUFFER, codePathspec, findVersion } from './lib/history.mjs';
import { MAX_CHANGED_LINES, boundedDiff, planCascade } from './lib/reaffirm.mjs';
import { hasRootPrefix, rootFromArgv, stripRoot } from './lib/root.mjs';

function hashOf(path, text) {
  return path.toLowerCase().endsWith('.md') ? parseDoc(text).bodyHash : sha256(normalise(text));
}

/** The cascade plan for one slug, with the diffs written to `out` when given. */
function cascade(argv) {
  const slug = argv[argv.indexOf('--cascade') + 1];
  const rootAt = argv.indexOf('--root');
  const root = rootFromArgv(argv);
  const outAt = argv.indexOf('--out');
  const out = outAt !== -1 ? resolve(process.cwd(), argv[outAt + 1]) : null;
  if (!slug || slug.startsWith('--') || !existsSync(root)) {
    console.error('usage: reaffirm-check.mjs --cascade <slug> [--root dev] [--out <dir>] [--json]');
    process.exit(2);
  }
  const initiative = buildState(root).initiatives.find((i) => i.slug === slug);
  if (!initiative) {
    console.error(`reaffirm-check: no initiative \`${slug}\` under ${root}`);
    process.exit(2);
  }

  // An input path is `<root>/...` (`dev/` or `.sdlc/`), relative to the project root (§2).
  const project = dirname(root);
  // `.claude/DEV-PROFILE.md` and other project-root inputs are not under the root: join them to the project.
  const abs = (file) => (hasRootPrefix(file) ? join(root, stripRoot(file)) : join(project, file));
  const located = new Map();
  const locate = (path, was) => {
    const key = `${path}|${was}`;
    if (!located.has(key)) {
      const { file, ids } = splitRef(path);
      if (!existsSync(abs(file))) { located.set(key, null); return null; }
      const hash = (text) => (ids ? decisionRowsHash(text, ids) ?? '' : hashOf(file, text));
      located.set(key, findVersion(abs(file), was, hash)?.commit ?? null);
    }
    return located.get(key);
  };

  let plan;
  try {
    plan = planCascade(initiative.stages, locate, DEPENDS_ON);
  } catch (err) {
    console.error(`reaffirm-check: cannot read git history: ${err.message.split(/\r?\n/)[0]}`);
    process.exit(2);
  }

  if (out) {
    mkdirSync(out, { recursive: true });
    const written = new Map();
    for (const g of plan.reaffirm) {
      for (const input of g.inputs) {
        const { file } = splitRef(input.path);
        const key = `${file}|${input.commit}`;
        if (!written.has(key)) {
          const name = `${stripRoot(file).replace(/[\\/]/g, '-')}-${input.commit.slice(0, 12)}.diff`;
          const diff = execFileSync('git', ['diff', input.commit, '--', relative(project, abs(file)).split('\\').join('/')], { cwd: project, encoding: 'utf8', maxBuffer: MAX_BUFFER });
          writeFileSync(join(out, name), diff);
          written.set(key, relative(process.cwd(), join(out, name)).split('\\').join('/'));
        }
        input.diff = written.get(key);
      }
    }
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    console.log(`reaffirm cascade for ${slug}`);
    for (const g of plan.reaffirm) {
      console.log(`  reaffirm  ${g.gate}  from ${g.log}`);
      for (const i of g.inputs) console.log(`      ${i.path}  reviewed at ${i.commit.slice(0, 12)}${i.diff ? `  diff ${i.diff}` : ''}`);
    }
    for (const g of plan.follows) console.log(`  follows   ${g.gate}  clears with ${g.origin}`);
    for (const g of plan.excluded) console.log(`  excluded  ${g.gate}  ${g.reason}`);
    if (!plan.reaffirm.length && !plan.follows.length && !plan.excluded.length) console.log('  no gate is STALE');
  }
  process.exit(plan.reaffirm.length ? 0 : 1);
}

/** Findings the log raised that its own resolution table did not close (as build-state reads them). */
function openFindings(body) {
  const closed = new Set(readTable(body, 'Finding resolution')
    .filter((r) => /RESOLVED|ACCEPTED/i.test(plain(r['reviewer verdict'] ?? r.resolution ?? '')))
    .map((r) => plain(r.id)));
  return readTable(body, 'Findings')
    .filter((r) => /^CR-\d+$/.test(plain(r.id)) && !closed.has(plain(r.id)))
    .map((r) => ({ id: plain(r.id), severity: plain(r.severity), where: plain(r.location ?? r.where ?? r.artifact ?? '') }));
}

/** The re-review brief: diffs since the prior log judged its outputs, and its open findings. */
function since(argv) {
  const logArg = argv[argv.indexOf('--since') + 1];
  const outAt = argv.indexOf('--out');
  if (!logArg || logArg.startsWith('--') || outAt === -1 || !argv[outAt + 1] || !existsSync(logArg)) {
    console.error('usage: reaffirm-check.mjs --since <prior gate log> --out <dir> [--json]');
    process.exit(2);
  }
  const out = resolve(process.cwd(), argv[outAt + 1]);
  // A log lives at <project>/<root>/reviews/<slug>/<file>; its paths are `<root>/...` from <project>.
  const logAbs = resolve(process.cwd(), logArg);
  const root = dirname(dirname(dirname(logAbs)));
  const project = dirname(root);
  // `.claude/DEV-PROFILE.md` and other project-root inputs are not under the root: join them to the project.
  const abs = (file) => (hasRootPrefix(file) ? join(root, stripRoot(file)) : join(project, file));
  const rel = (p) => relative(process.cwd(), p).split('\\').join('/');
  const posix = (p) => relative(project, p).split('\\').join('/');
  const log = readDoc(logAbs);
  const fm = log.frontMatter;
  const brief = { log: rel(logAbs), gate: fm.gate ?? null, open_findings: openFindings(log.body), diffs: [], unchanged: [], derived: [], readInFull: [] };
  // A G7 log that names its commit judged the code, not change-summary.md or the lane notes: those
  // are generated from it (§4.4), so their diff is the code diff again, often megabytes of it.
  const bindsCode = fm.gate === 'G7' && !fm.scope && Boolean(fm.reviewed_commit);
  mkdirSync(out, { recursive: true });
  const git = (args) => execFileSync('git', args, { cwd: project, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  const write = (name, text) => { const p = join(out, name); writeFileSync(p, text); return rel(p); };
  const safe = (s) => stripRoot(s).replace(/[\\/#,]/g, '-');

  try {
    for (const ref of Array.isArray(fm.outputs) ? fm.outputs : []) {
      const { file } = splitRef(ref?.path ?? '');
      if (bindsCode && LANE_FRAGMENT.test(file)) { brief.derived.push(ref.path); continue; }
      if (!file || !existsSync(abs(file))) { brief.readInFull.push({ path: ref?.path, reason: 'not on disk' }); continue; }
      const now = hashOf(file, readFileSync(abs(file), 'utf8'));
      const want = String(ref.sha256 ?? '').replace(/[….]+$/, '');
      if (want && now.startsWith(want)) { brief.unchanged.push(ref.path); continue; }
      const judged = findVersion(abs(file), want, (text) => hashOf(file, text));
      if (!judged) { brief.readInFull.push({ path: ref.path, reason: 'the judged version is not in git history' }); continue; }
      const diff = git(['diff', judged.commit, '--', posix(abs(file))]);
      brief.diffs.push({ path: ref.path, commit: judged.commit, diff: write(`${safe(file)}-${judged.commit.slice(0, 12)}.diff`, diff) });
    }
    if (bindsCode) {
      const sha = String(fm.reviewed_commit);
      const diff = git(['diff', sha, '--', ...codePathspec(relative(project, root).split('\\').join('/'))]);
      if (diff) brief.diffs.push({ path: 'code', commit: sha, diff: write(`code-${sha.slice(0, 12)}.diff`, diff) });
      else brief.unchanged.push('code');
    }
  } catch (err) {
    console.error(`reaffirm-check: cannot read git history: ${err.message.split(/\r?\n/)[0]}`);
    process.exit(2);
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(brief, null, 2));
  } else {
    console.log(`re-review brief for ${brief.log}`);
    for (const f of brief.open_findings) console.log(`  open      ${f.id} ${f.severity}${f.where ? `  ${f.where}` : ''}`);
    for (const d of brief.diffs) console.log(`  diff      ${d.path}  since ${d.commit.slice(0, 12)}  ${d.diff}`);
    for (const p of brief.unchanged) console.log(`  unchanged ${p}`);
    for (const p of brief.derived) console.log(`  generated ${p}  (not diffed: the code diff covers it)`);
    for (const r of brief.readInFull) console.log(`  read all  ${r.path}  (${r.reason})`);
  }
}

/** Flags of the self-edit form that take a value; the value is never the artifact. */
const VALUED = new Set(['--against', '--root']);

/**
 * The self-edit form's arguments, or the one thing wrong with them. On Recall a G7 reaffirm ran
 * `reaffirm-check code --against <sha>` — G7's output `code` is not a file — and got back only the
 * usage line; `--root dev` before the artifact made `dev` the artifact. Each case now says why.
 */
export function selfEditArgs(argv) {
  const positional = argv.filter((a, i) => !a.startsWith('--') && !VALUED.has(argv[i - 1]));
  const i = argv.indexOf('--against');
  const against = i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
  const artifact = positional[0] ?? null;
  let problem = null;
  if (!artifact) problem = 'no artifact given';
  else if (positional.length > 1) problem = `one artifact at a time (got ${positional.join(', ')})`;
  else if (artifact === 'code') problem = 'G7\'s `code` output has no self-edit bound: a code change since `reviewed_commit` re-runs G7. `--since <G7 log> --out <dir>` writes the code diff for that re-review (§4.3, §4.4)';
  else if (!against) problem = '--against needs the prior file or the sha256 the last full review recorded';
  else if (!existsSync(artifact)) problem = `no such file: ${artifact}`;
  return { artifact, against, problem };
}

function main(argv) {
  if (argv.includes('--cascade')) return cascade(argv);
  if (argv.includes('--since')) return since(argv);
  const { artifact, against, problem } = selfEditArgs(argv);
  if (problem) {
    console.error(`reaffirm-check: ${problem}`);
    console.error('usage: reaffirm-check.mjs <artifact> --against <prior-file | recorded-sha256>');
    process.exit(2);
  }

  let prior;
  if (existsSync(against)) {
    prior = { text: readFileSync(against, 'utf8'), commit: null };
  } else if (/^[0-9a-f]{6,64}$/i.test(against)) {
    try {
      prior = findVersion(artifact, against, (text) => hashOf(artifact, text));
    } catch (err) {
      // A git failure (not a repository, a file over the buffer) is not "no such version".
      console.error(`reaffirm-check: cannot read the history of ${artifact}: ${err.message.split(/\r?\n/)[0]}`);
      process.exit(2);
    }
  }
  if (!prior) {
    console.error(`reaffirm-check: no committed version of ${artifact} hashes to ${against}. Without the reviewed version the edit cannot be bounded — re-run the stage (§4.4).`);
    process.exit(2);
  }

  const r = boundedDiff(prior.text, readFileSync(artifact, 'utf8'));
  const from = prior.commit ? ` (reviewed version: commit ${prior.commit.slice(0, 12)})` : '';
  if (r.ok) {
    console.log(`within the bound: ${r.changedLines} changed line(s), at most ${MAX_CHANGED_LINES}${r.amendmentOnly ? ', amendment-only' : ''}${from}`);
  } else {
    console.log(`outside the bound${from}:`);
    for (const reason of r.reasons) console.log(`  - ${reason}`);
  }
  console.log(`\n\`\`\`diff\n${r.diff}\n\`\`\``);
  process.exit(r.ok ? 0 : 1);
}

if (process.argv[1]?.endsWith('reaffirm-check.mjs')) main(process.argv.slice(2));
