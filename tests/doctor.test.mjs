/**
 * doctor.mjs finds what the installer left behind: dev-* / sdlc-* entries in .claude/ that no
 * bundle's install manifest owns, and prunes them only on --prune --yes.
 *
 *   node --test tests/doctor.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(here, '..', 'workspace', 'dev', 'scripts');

/** An installed project: one owned skill, one renamed leftover, one project-own skill, and a manifest. */
function project({ manifest = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-doctor-'));
  const claude = join(root, '.claude');
  for (const rel of ['skills/dev-modeling-data', 'skills/dev-data-modeling', 'skills/team-own', 'agents', 'commands']) {
    mkdirSync(join(claude, rel), { recursive: true });
  }
  writeFileSync(join(claude, 'skills', 'dev-modeling-data', 'SKILL.md'), 'x');
  writeFileSync(join(claude, 'skills', 'dev-data-modeling', 'SKILL.md'), 'x');
  writeFileSync(join(claude, 'skills', 'team-own', 'SKILL.md'), 'x');
  writeFileSync(join(claude, 'commands', 'sdlc-old.md'), 'x');
  writeFileSync(join(claude, 'commands', 'sdlc-api.md'), 'x');
  if (manifest) {
    writeFileSync(join(claude, '.agentic-fx.json'), JSON.stringify({
      dev: { claude: ['skills/dev-modeling-data/SKILL.md', 'commands/sdlc-api.md'] },
    }));
  }
  mkdirSync(join(root, 'dev'));
  cpSync(SCRIPTS, join(root, 'dev', 'scripts'), { recursive: true });
  return { root, claude };
}

function doctor(root, ...args) {
  const r = spawnSync(process.execPath, [join(root, 'dev', 'scripts', 'doctor.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('the health check warns about entries no manifest owns, and leaves the project own skill alone', () => {
  const { root } = project();
  const { out } = doctor(root);
  assert.match(out, /\[WARN\] stale\s+2 entry\(ies\) no bundle owns, still loaded: skills\/dev-data-modeling, commands\/sdlc-old\.md/);
  assert.doesNotMatch(out, /team-own/);
});

test('--prune is a dry run; --prune --yes removes exactly the leftovers', () => {
  const { root, claude } = project();
  const dry = doctor(root, '--prune');
  assert.match(dry.out, /would remove \.claude\/skills\/dev-data-modeling/);
  assert.match(dry.out, /Dry run/);
  assert.ok(existsSync(join(claude, 'skills', 'dev-data-modeling')));

  const real = doctor(root, '--prune', '--yes');
  assert.equal(real.status, 0);
  assert.ok(!existsSync(join(claude, 'skills', 'dev-data-modeling')));
  assert.ok(!existsSync(join(claude, 'commands', 'sdlc-old.md')));
  for (const kept of ['skills/dev-modeling-data', 'skills/team-own', 'commands/sdlc-api.md']) assert.ok(existsSync(join(claude, kept)), kept);
  assert.match(doctor(root).out, /\[PASS\] stale/);
});

test('with no manifest, --prune refuses to guess', () => {
  const { root, claude } = project({ manifest: false });
  const r = doctor(root, '--prune', '--yes');
  assert.equal(r.status, 2);
  assert.match(r.out, /refusing to guess/);
  assert.ok(existsSync(join(claude, 'skills', 'dev-data-modeling')));
});

// Capabilities: what this machine cannot run that CI can (DEV-CONTRACTS §5.6). On release-management
// -race and the DB roles were NOT RUN for want of a C compiler and psql, found only by failing.
test('probeCapabilities maps each missing tool to the G8 gates it defers to CI', async () => {
  const { probeCapabilities } = await import('../workspace/dev/scripts/doctor.mjs');
  const none = probeCapabilities(() => false, () => false);
  assert.deepEqual(none.map((c) => [c.name, c.present]), [['cgo C compiler', false], ['psql', false], ['docker', false]]);
  assert.ok(none[0].defers.includes('Unit tests (Go) -race'));
  assert.ok(none[2].defers.includes('DAST baseline'));

  const docker = probeCapabilities((b) => b === 'docker' || b === 'clang', () => false);
  assert.equal(docker[0].present, true, 'any one C compiler is enough');
  assert.equal(docker[2].present, false, 'a docker CLI with no daemon cannot run a container');
  assert.match(docker[2].detail, /daemon is not running/);
  assert.equal(probeCapabilities(() => true, () => true).every((c) => c.present), true);
});

test('--capabilities --json lists what is deferred, and always exits 0', () => {
  const { root } = project();
  const r = spawnSync(process.execPath, [join(root, 'dev', 'scripts', 'doctor.mjs'), '--capabilities', '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.capabilities.length, 3);
  for (const d of out.deferred_to_ci) assert.match(d.reason, /missing on this machine/);
});

// Vendored-script drift (DEV-CONTRACTS §18.6). On release-management 5 of 9 vendored dev/scripts had
// been edited in place, so the project ran neither the bundle's code nor a reviewed fork of it.
test('scripts/.manifest.json is current: every shipped script, hashed', async () => {
  const { scriptHashes } = await import('../workspace/dev/scripts/doctor.mjs');
  const { readFileSync } = await import('node:fs');
  const shipped = JSON.parse(readFileSync(join(SCRIPTS, '.manifest.json'), 'utf8'));
  assert.deepEqual(shipped.files, scriptHashes(SCRIPTS), 'run: node workspace/dev/scripts/doctor.mjs --write-manifest');
});

test('the health check warns on a vendored script edited in place, and is quiet when none is', () => {
  const { root } = project();
  assert.match(doctor(root).out, /\[PASS\] vendored\s+\d+ script\(s\) match the bundle manifest/);
  appendFileSync(join(root, 'dev', 'scripts', 'lint-dev.mjs'), '');
  appendFileSync(join(root, 'dev', 'scripts', 'lint-dev.mjs'), '\n// local patch\n');
  assert.match(doctor(root).out, /\[WARN\] vendored\s+1 script\(s\) differ from the bundle: lint-dev\.mjs/);
});

test('the health check flags the CI template the profile does not use', () => {
  const { root, claude } = project();
  mkdirSync(join(root, 'dev', 'ci'), { recursive: true });
  writeFileSync(join(root, 'dev', 'ci', 'gitlab-ci.yml'), 'x');
  writeFileSync(join(root, 'dev', 'ci', 'github-workflow.yml'), 'x');
  writeFileSync(join(claude, 'DEV-PROFILE.md'), '## Delivery\n\n- **CI:** `gitlab` — templates in `dev/ci/`\n');
  assert.match(doctor(root).out, /\[WARN\] ci\s+dev\/ci\/github-workflow\.yml is unused \(CI is gitlab\)/);
  doctor(root, '--prune', '--yes');
  assert.ok(!existsSync(join(root, 'dev', 'ci', 'github-workflow.yml')), '--prune --yes removes it');
  assert.ok(existsSync(join(root, 'dev', 'ci', 'gitlab-ci.yml')));
});

test('the health check warns when the derived index is tracked despite dev/.gitignore (§18.5)', () => {
  const { root } = project();
  const git = (...a) => spawnSync('git', ['-C', root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...a], { encoding: 'utf8' });
  git('init', '-q');
  writeFileSync(join(root, 'dev', 'state.json'), '{}');
  writeFileSync(join(root, 'dev', 'DASHBOARD.md'), '# d');
  git('add', '-f', 'dev');
  git('commit', '-q', '-m', 'chore(sdlc): start');
  assert.match(doctor(root).out, /\[WARN\] git\s+dev\/DASHBOARD\.md, dev\/state\.json tracked although dev\/\.gitignore excludes them \(§18\.5\) — git rm --cached dev\/DASHBOARD\.md dev\/state\.json/);
  git('rm', '-q', '--cached', 'dev/state.json', 'dev/DASHBOARD.md');
  git('commit', '-q', '-m', 'chore(sdlc): untrack the derived index');
  assert.doesNotMatch(doctor(root).out, /tracked although/);
});
