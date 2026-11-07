/**
 * Step 5b of docs/learning-roadmap.md (DEV-CONTRACTS §22): the most destructive commands are refused
 * whoever asks, approved outward commands are recorded, and each gate's catches and escapes are
 * counted. Every deny rule has commands it must block and near-misses it must let through.
 *
 *   node --test tests/gate-effect.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const HOOK = join(ROOT, 'hooks', 'bash-guard.mjs');
const guard = await import(pathToFileURL(HOOK).href);
const SCRIPT = join(ROOT, 'workspace', 'dev', 'scripts', 'gate-effect.mjs');
const fx = await import(pathToFileURL(SCRIPT).href);
process.env.SDLC_RUN_LOG = 'off';

const BLOCK = {
  'force-push': ['git push --force', 'git push origin main -f', 'git push origin +main', 'git push origin main --force-with-lease', 'git push -u origin feat/x --force'],
  'rm-root': ['rm -rf /', 'rm -rf ~', 'rm -rf .', 'rm -r -f .', 'rm -fr *', 'rm -rf $HOME', 'cd x && rm -rf ./'],
  'drop-database': ['psql -c "DROP DATABASE app"', 'echo "drop schema public cascade" | psql'],
  'truncate': ['psql -c "TRUNCATE users"', 'mysql -e "truncate table orders"', 'echo "TRUNCATE x" | psql'],
  'reset-hard-remote': ['git reset --hard origin/main', 'git reset --hard upstream/dev'],
  'env-write': ['echo KEY=1 > .env', 'echo x >> .env', 'echo x > app/.env', 'echo x > .env.local', 'printf x | tee .env'],
  'no-verify': ['git commit --no-verify -m x', 'git push origin feat/x --no-verify'],
};
const ALLOW = [
  'git push', 'git push origin feat/x', 'git push -u origin feat/x', 'git commit -m "drop the force flag"',
  'rm -rf node_modules', 'rm -rf ./build', 'rm -rf dist/', 'rm -f a.txt', 'rm -r tmp',
  'grep TRUNCATE migrations/*.sql', 'grep -rn "DROP TABLE" .', 'git reset --hard HEAD~1',
  'cat .env', 'echo x > .env.example', 'echo x > .env.sample', 'echo x > config.env.ts', 'echo x > my.env',
];

for (const [rule, cmds] of Object.entries(BLOCK)) {
  test(`deny ${rule}: every form is refused, and the hook says why`, () => {
    for (const c of cmds) {
      assert.equal(guard.denied(c)?.id, rule, c);
      const out = guard.handle({ tool_name: 'Bash', hook_event_name: 'PreToolUse', tool_input: { command: c } });
      assert.equal(out.exit, 2, c);
      assert.match(out.message, new RegExp(`\\(${rule}\\): .+ If a human really means it, they run it themselves`));
    }
  });
}

test('near-misses are allowed: the guard blocks the dangerous form, not the word', () => {
  for (const c of ALLOW) assert.equal(guard.denied(c), null, c);
});

test('the hook, as Claude Code runs it: stdin JSON in, exit 2 and stderr on a deny, exit 0 otherwise, never a crash', () => {
  const run = (input) => spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  const blocked = run(JSON.stringify({ tool_name: 'Bash', hook_event_name: 'PreToolUse', tool_input: { command: 'git push --force' } }));
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /force-push/);
  assert.equal(run(JSON.stringify({ tool_name: 'Bash', hook_event_name: 'PreToolUse', tool_input: { command: 'ls' } })).status, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '.env' } })).status, 0, 'only Bash is this hook\'s concern');
  assert.equal(run('not json').status, 0, 'a parse error never blocks work');
  assert.equal(run('').status, 0);
});

test('run audit: an approved outward command is logged after it ran, redacted; others are not', () => {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-guard-')), '.sdlc');
  mkdirSync(root, { recursive: true });
  const post = (command) => guard.handle({ tool_name: 'Bash', hook_event_name: 'PostToolUse', session_id: 's1', tool_input: { command } }, { root, env: {}, now: new Date('2026-10-23T10:00:00Z') });
  assert.equal(post('git push origin feat/x').logged, 'push');
  assert.equal(post('terraform apply -auto-approve').logged, 'apply');
  assert.equal(post('npm publish --token=abc123secret').logged, 'publish');
  assert.equal(post('ls -la').logged, null);
  const lines = readFileSync(join(root, 'logs', 'commands.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.class), ['push', 'apply', 'publish']);
  assert.equal(lines[0].at, '2026-10-23T10:00:00.000Z');
  assert.doesNotMatch(lines[2].command, /abc123secret/);
  assert.match(lines[2].command, /--token=\[REDACTED\]/);
  const off = join(mkdtempSync(join(tmpdir(), 'sdlc-guard-')), '.sdlc');
  mkdirSync(off, { recursive: true });
  guard.handle({ tool_name: 'Bash', hook_event_name: 'PostToolUse', tool_input: { command: 'git push' } }, { root: off, env: { SDLC_RUN_LOG: 'off' } });
  assert.ok(!existsSync(join(off, 'logs', 'commands.jsonl')), 'SDLC_RUN_LOG=off stops it');
});

test('settings.json wires the guard on Pre and Post Bash, and its deny list carries the same rules', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'settings.json'), 'utf8'));
  for (const ev of ['PreToolUse', 'PostToolUse']) {
    assert.ok(s.hooks[ev].some((h) => h.matcher === 'Bash' && h.hooks.some((x) => x.command === 'node .claude/hooks/bash-guard.mjs')), ev);
  }
  for (const p of ['Bash(git push --force*)', 'Bash(rm -rf /*)', 'Bash(git commit --no-verify*)', 'Write(**/.env)']) assert.ok(s.permissions.deny.includes(p), p);
  assert.ok(!s.permissions.allow.some((a) => /--force|--no-verify/.test(a)), 'nothing allowed contradicts a deny');
});

// ---- gate effectiveness --------------------------------------------------------------------------

const LOG = (slug, gate, attempt, findings = [], resolutions = []) => `---
slug: ${slug}
gate: ${gate}
attempt: ${attempt}
---

## Findings

| Id | Severity | Class | Location | Problem | Evidence | Required change | Owner |
|---|---|---|---|---|---|---|---|
${findings.map(([id, sev]) => `| ${id} | ${sev} | defect | x | p | e | c | o |`).join('\n')}

## Finding resolution

| Id | Author's action | Reviewer verdict | Evidence |
|---|---|---|---|
${resolutions.map(([id, v]) => `| ${id} | fixed | ${v} | x |`).join('\n')}
`;
const POST = (rows) => `---\nslug: orders\nartifact: post-release\n---\n\n## Escaped\n\n| Defect | Found by | Should have been caught at | Why it was not |\n|---|---|---|---|\n${rows}\n\n## Next\n`;

function project(files) {
  const root = join(mkdtempSync(join(tmpdir(), 'sdlc-effect-')), '.sdlc');
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

test('caught counts BLOCKER and MAJOR findings a later attempt resolved; MINOR and unresolved do not count', () => {
  const root = project({
    'reviews/orders/G4-api-1.md': LOG('orders', 'G4', 1, [['CR-001', 'MAJOR'], ['CR-002', 'BLOCKER'], ['CR-003', 'MINOR'], ['CR-004', 'MAJOR']]),
    'reviews/orders/G4-api-1-a2.md': LOG('orders', 'G4', 2, [], [['CR-001', 'RESOLVED'], ['CR-002', 'RESOLVED'], ['CR-003', 'RESOLVED'], ['CR-004', 'REOPENED']]),
    'reviews/invoices/G4-api-2.md': LOG('invoices', 'G4', 1, [['CR-001', 'MAJOR']]),
  });
  const [g4] = fx.effect(root);
  assert.deepEqual({ gate: g4.gate, caught: g4.caught, raised: g4.raised, initiatives: g4.initiatives }, { gate: 'G4', caught: 2, raised: 4, initiatives: 2 });
});

test('a CR id repeated on another slug is another finding, not the same one', () => {
  const root = project({
    'reviews/a/G4-1.md': LOG('a', 'G4', 1, [['CR-001', 'MAJOR']]),
    'reviews/a/G4-1-a2.md': LOG('a', 'G4', 2, [], [['CR-001', 'RESOLVED']]),
    'reviews/b/G4-1.md': LOG('b', 'G4', 1, [['CR-001', 'MAJOR']]),
  });
  const [g4] = fx.effect(root);
  assert.equal(g4.raised, 2);
  assert.equal(g4.caught, 1, 'b\'s CR-001 was never resolved');
});

test('escaped counts post-release rows by the gate named; none and unknown gates are not counted', () => {
  const root = project({
    'reviews/orders/G4-1.md': LOG('orders', 'G4', 1, [['CR-001', 'MAJOR']]),
    'monitoring/orders/post-release.md': POST('| Export times out at 40k rows | support ticket | G4 | no page size asked |\n| Typo in footer | user | none | cosmetic |\n| Slow login | monitoring | G8 | no load test |'),
  });
  const rows = fx.effect(root);
  assert.deepEqual(rows.map((r) => [r.gate, r.escaped]), [['G4', 1], ['G8', 1]]);
  assert.match(fx.verdict(rows[0]), /escapes outnumber catches/);
});

test('verdicts: escapes ≥ catches, any escape, and a gate silent across ten initiatives', () => {
  assert.match(fx.verdict({ caught: 1, escaped: 1, initiatives: 3 }), /escapes outnumber catches/);
  assert.match(fx.verdict({ caught: 5, escaped: 1, initiatives: 3 }), /something escaped/);
  assert.match(fx.verdict({ caught: 0, escaped: 0, initiatives: 10 }), /removal candidate/);
  assert.equal(fx.verdict({ caught: 0, escaped: 0, initiatives: 9 }), null);
  assert.equal(fx.verdict({ caught: 4, escaped: 0, initiatives: 12 }), null);
});

test('the CLI prints the table, the flag line, and the approved-command count', () => {
  const root = project({
    'reviews/orders/G4-1.md': LOG('orders', 'G4', 1, [['CR-001', 'MAJOR']]),
    'monitoring/orders/post-release.md': POST('| Export times out | support | G4 | no page size |'),
    'logs/commands.jsonl': '{"class":"push"}\n{"class":"push"}\n{"class":"migrate"}\ntorn',
  });
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', env: { ...process.env } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^G4 +0\/1 +1 +1$/m);
  assert.match(r.stdout, /↳ escapes outnumber catches — find the missing check \(\/sdlc-improve\): orders — Export times out/);
  assert.match(r.stdout, /approved outward commands that ran: push ×2 · migrate ×1/);
});

test('the template and G11 carry ## Escaped before ## Next', () => {
  const tpl = readFileSync(join(ROOT, 'workspace', 'dev', '_templates', 'post-release.md'), 'utf8');
  assert.ok(tpl.indexOf('## Escaped') > 0 && tpl.indexOf('## Escaped') < tpl.indexOf('## Next'));
  assert.match(tpl, /\| Defect \| Found by \| Should have been caught at \| Why it was not \|/);
  assert.match(readFileSync(join(ROOT, 'skills', 'dev-reviewing-monitoring', 'SKILL.md'), 'utf8'), /^\| 22 \| `## Escaped` lists every defect/m);
});
