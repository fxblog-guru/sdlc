#!/usr/bin/env node
/**
 * doctor.mjs — is this installation able to run the pipeline?
 *
 * A diagnostic that can hallucinate is worse than none, so this is a script: it checks files exist,
 * commands resolve, and the index agrees with the disk. It runs in two layouts — an installed
 * project (`.claude/` + `dev/`) and the bundle repository itself (`commands/` + `workspace/dev/`) —
 * because the bundle should be able to check its own shape before it is ever installed anywhere.
 *
 *   node dev/scripts/doctor.mjs [--root dev]
 *   node dev/scripts/doctor.mjs --prune [--yes]
 *   node dev/scripts/doctor.mjs --capabilities [--json]
 *
 *   --prune   list the dev-* / sdlc-* folders and files under .claude/{skills,agents,commands} that no
 *             bundle's install manifest (.claude/.agentic-fx.json) owns — a renamed skill's old copy,
 *             still loaded on every session — and the dev/ci template DEV-PROFILE `CI` does not
 *             name. A dry run: nothing is removed without --yes.
 *
 *   --write-manifest   (bundle repository only) rewrite dev/scripts/.manifest.json, the sha256 of each
 *             shipped script; an installed project's doctor warns on a script that differs (§18.6).
 *
 *   --capabilities   what this machine cannot run that CI can — a cgo C compiler (go test -race), psql,
 *             docker (integration DB, DAST baseline) — each with the G8 gates it defers. The
 *             verifier records those gates NOT RUN, "deferred to CI", and G9 needs the CI proof
 *             (DEV-CONTRACTS §5.6). Always exit 0: a missing capability is a fact, not a failure.
 *
 * Exit 1 on any FAIL. WARN never fails the run; it names something that will bite later.
 */

import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRoot } from './lib/root.mjs';
import { toolsFor } from './lib/langs.mjs';
import { coverage } from './lib/coverage.mjs';

const results = [];
const ok = (area, msg) => results.push(['PASS', area, msg]);
const warn = (area, msg) => results.push(['WARN', area, msg]);
const fail = (area, msg) => results.push(['FAIL', area, msg]);

function main(argv) {
  const cwd = process.cwd();
  const layout = detectLayout(cwd, argFor(argv, '--root'));
  if (!layout) {
    console.error('doctor: this is neither an installed project (.claude/ + .sdlc/ or dev/) nor the bundle repo (commands/ + workspace/dev/).');
    process.exit(2);
  }

  if (argv.includes('--write-manifest')) return writeManifest(layout);
  if (argv.includes('--prune')) return prune(layout, argv.includes('--yes'));
  if (argv.includes('--capabilities')) return printCapabilities(probeCapabilities(), argv.includes('--json'));

  checkStructure(layout);
  checkStale(layout);
  checkBundleFiles(layout);
  checkVendored(layout);
  checkCiTemplates(layout);
  const profile = checkProfile(layout);
  checkToolchain(profile);
  checkDesignSystem(layout, profile);
  checkState(layout);
  checkGit(cwd, layout);
  for (const c of probeCapabilities()) {
    (c.present ? ok : warn)('capability', c.present ? `${c.name} — ${c.detail}` : `${c.name} missing — ${c.detail}; G8 defers to CI: ${c.defers.join(', ')}`);
  }

  print(layout);
  process.exit(results.some(([level]) => level === 'FAIL') ? 1 : 0);
}

function detectLayout(cwd, rootArg) {
  if (existsSync(join(cwd, '.claude', 'commands')) || (rootArg && existsSync(join(cwd, '.claude')))) {
    return {
      kind: 'installed',
      claude: join(cwd, '.claude'),
      dev: findRoot({ explicit: rootArg, cwd }).root,
      profile: join(cwd, '.claude', 'DEV-PROFILE.md'),
      contracts: join(cwd, '.claude', 'DEV-CONTRACTS.md'),
      settings: join(cwd, '.claude', 'settings.json'),
      hooks: join(cwd, '.claude', 'hooks'),
    };
  }
  if (existsSync(join(cwd, 'commands')) && existsSync(join(cwd, 'workspace', 'dev'))) {
    return {
      kind: 'bundle',
      claude: cwd,
      dev: join(cwd, 'workspace', 'dev'),
      profile: join(cwd, 'DEV-PROFILE.md'),
      contracts: join(cwd, 'DEV-CONTRACTS.md'),
      settings: join(cwd, 'settings.json'),
      hooks: join(cwd, 'hooks'),
    };
  }
  return null;
}

function checkStructure(l) {
  const commands = listFiles(join(l.claude, 'commands'), (f) => /^sdlc-.*\.md$/.test(f));
  const agents = listFiles(join(l.claude, 'agents'), (f) => /^dev-.*\.md$/.test(f));
  const skills = listDirs(join(l.claude, 'skills'), (d) => /^dev-/.test(d)).filter((d) =>
    existsSync(join(l.claude, 'skills', d, 'SKILL.md')),
  );

  (commands.length ? ok : fail)('commands', `${commands.length} /sdlc-* command file(s)`);
  (agents.length ? ok : warn)('agents', `${agents.length} dev-* agent(s)${agents.length ? '' : ' — none yet (Phase 3)'}`);
  (skills.length ? ok : warn)('skills', `${skills.length} dev-* skill(s) with a SKILL.md${skills.length ? '' : ' — none yet (Phase 3)'}`);

  if (!existsSync(l.settings)) {
    fail('settings', `${rel(l.settings)} missing`);
  } else {
    try {
      const settings = JSON.parse(readFileSync(l.settings, 'utf8'));
      const hooks = settings.hooks ?? {};
      const have = ['PostToolUse', 'Stop', 'SessionStart'].filter((h) => Array.isArray(hooks[h]) && hooks[h].length);
      (have.length === 3 ? ok : warn)('hooks', `${have.length}/3 wired (${have.join(', ') || 'none'})`);
      const asks = settings.permissions?.ask ?? [];
      (asks.some((a) => /push|migrate|kubectl|deploy/.test(a)) ? ok : warn)(
        'permissions',
        asks.length ? `${asks.length} command pattern(s) require confirmation` : 'nothing in permissions.ask — push/migrate/deploy would run unconfirmed',
      );
    } catch (err) {
      fail('settings', `settings.json is not valid JSON: ${err.message}`);
    }
  }

  const hookScripts = listFiles(l.hooks, (f) => f.endsWith('.mjs'));
  (hookScripts.length ? ok : warn)('hook scripts', `${hookScripts.length} in ${rel(l.hooks)}`);
}

/**
 * The installer copies file by file and removes only what its manifest says it owned, so a skill the
 * bundle renamed before the manifest existed stays behind — and is still listed, and still loaded.
 * Only names this bundle family uses (dev-*, sdlc-*) are judged; a project's own skills are left alone.
 */
export function staleEntries(claudeDir) {
  const manifestPath = join(claudeDir, '.agentic-fx.json');
  if (!existsSync(manifestPath)) return null;
  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch { return null; }
  const owned = new Set();
  for (const entry of Object.values(manifest ?? {})) {
    for (const path of entry?.claude ?? []) owned.add(String(path).split('/').slice(0, 2).join('/'));
  }
  const stale = [];
  for (const dir of ['skills', 'agents', 'commands']) {
    let names = [];
    try { names = readdirSync(join(claudeDir, dir)); } catch { continue; }
    for (const name of names.sort()) {
      if (!/^(dev|sdlc)-/.test(name)) continue;
      if (!owned.has(`${dir}/${name}`)) stale.push(`${dir}/${name}`);
    }
  }
  return stale;
}

function checkStale(l) {
  if (l.kind !== 'installed') return;
  const stale = staleEntries(l.claude);
  if (stale === null) {
    warn('stale', 'no .claude/.agentic-fx.json install manifest — cannot tell bundle files from leftovers; run afx update --bundle dev');
  } else if (stale.length) {
    warn('stale', `${stale.length} entry(ies) no bundle owns, still loaded: ${stale.slice(0, 4).join(', ')}${stale.length > 4 ? ' …' : ''} — node ${rootName(l)}/scripts/doctor.mjs --prune`);
  } else {
    ok('stale', 'every dev-*/sdlc-* entry in .claude/ is owned by an installed bundle');
  }
}

function prune(l, yes) {
  if (l.kind !== 'installed') {
    console.log('doctor --prune: only an installed project (.claude/ + its SDLC root) has leftovers to prune.');
    return;
  }
  // The unused CI template is known from the profile alone, so it is pruned with or without a manifest.
  for (const u of unusedCiTemplates(l)) {
    if (yes) rmSync(join(l.dev, u.file), { force: true });
    console.log(`${yes ? 'removed' : 'would remove'} ${rootName(l)}/${u.file} (CI is ${u.ci})`);
  }
  const stale = staleEntries(l.claude);
  if (stale === null) {
    console.log('doctor --prune: no .claude/.agentic-fx.json — refusing to guess what the bundle owns. Run afx update --bundle dev first.');
    process.exitCode = 2;
    return;
  }
  if (!stale.length) {
    console.log('doctor --prune: nothing to prune.');
    return;
  }
  for (const rel of stale) {
    if (yes) rmSync(join(l.claude, rel), { recursive: true, force: true });
    console.log(`${yes ? 'removed' : 'would remove'} .claude/${rel}`);
  }
  if (!yes) console.log(`
${stale.length} entry(ies). Dry run — re-run with --prune --yes to remove them.`);
}

/**
 * dev/scripts/ is bundle code (§18.6): the installer replaces it on update, so a fix made in place is
 * lost on the next `afx update`, and until then the project runs code nobody reviewed. The manifest
 * the bundle ships names each script's sha256 (CRLF folded, so a Windows checkout matches).
 */
export function scriptHashes(dir) {
  const out = {};
  const visit = (sub) => {
    for (const name of readdirSync(join(dir, sub)).sort()) {
      const relPath = sub ? `${sub}/${name}` : name;
      if (statSync(join(dir, relPath)).isDirectory()) visit(relPath);
      else if (name.endsWith('.mjs')) out[relPath] = createHash('sha256').update(readFileSync(join(dir, relPath), 'utf8').replace(/\r\n?/g, '\n')).digest('hex');
    }
  };
  visit('');
  return out;
}

function writeManifest(l) {
  if (l.kind !== 'bundle') {
    console.error('doctor --write-manifest: run it in the bundle repository; a project never rewrites the manifest');
    process.exitCode = 2;
    return;
  }
  const files = scriptHashes(join(l.dev, 'scripts'));
  writeFileSync(join(l.dev, 'scripts', '.manifest.json'), `${JSON.stringify({ note: 'sha256 of each shipped script, LF-normalised — doctor.mjs compares the vendored copies (DEV-CONTRACTS §18.6)', files }, null, 2)}\n`);
  console.log(`wrote ${rootName(l)}/scripts/.manifest.json (${Object.keys(files).length} scripts)`);
}

function checkVendored(l) {
  const path = join(l.dev, 'scripts', '.manifest.json');
  if (!existsSync(path)) {
    warn('vendored', `no ${rootName(l)}/scripts/.manifest.json — cannot tell a vendored script edited in place; run afx update --bundle dev`);
    return;
  }
  let shipped;
  try { shipped = JSON.parse(readFileSync(path, 'utf8')).files ?? {}; } catch { fail('vendored', `${rootName(l)}/scripts/.manifest.json is not valid JSON`); return; }
  const now = scriptHashes(join(l.dev, 'scripts'));
  const differ = Object.keys(shipped).filter((f) => now[f] && now[f] !== shipped[f]);
  if (differ.length) warn('vendored', `${differ.length} script(s) differ from the bundle: ${differ.join(', ')} — send the fix upstream with /sdlc-feedback; afx update overwrites it`);
  else ok('vendored', `${Object.keys(shipped).length} script(s) match the bundle manifest`);
}

/** The CI template DEV-PROFILE §Delivery `CI` does not name (§18.3). `--prune --yes` removes it. */
function unusedCiTemplates(l) {
  if (l.kind !== 'installed' || !existsSync(l.profile)) return [];
  const ci = /^- \*\*CI:\*\*\s*`(gitlab|github|azure)`/m.exec(readFileSync(l.profile, 'utf8'))?.[1];
  if (!ci) return [];
  const templates = { gitlab: 'gitlab-ci.yml', github: 'github-workflow.yml' };
  return Object.entries(templates).filter(([k, f]) => k !== ci && existsSync(join(l.dev, 'ci', f))).map(([, f]) => ({ ci, file: `ci/${f}` }));
}

function checkCiTemplates(l) {
  for (const u of unusedCiTemplates(l)) warn('ci', `${rootName(l)}/${u.file} is unused (CI is ${u.ci}) — node ${rootName(l)}/scripts/doctor.mjs --prune --yes removes it`);
}

function checkBundleFiles(l) {
  (existsSync(l.contracts) ? ok : fail)('contracts', rel(l.contracts));
  const templates = walk(join(l.dev, '_templates')).filter((f) => /\.(md|yaml)$/.test(f));
  (templates.length >= 30 ? ok : templates.length ? warn : fail)('templates', `${templates.length} in ${rootName(l)}/_templates`);
  for (const script of ['lint-dev.mjs', 'build-state.mjs', 'status.mjs', 'design-system.mjs', 'ui-snap.mjs', 'ui-rubric.mjs', 'change-summary.mjs', 'migrate-ledger-inputs.mjs', 'lib/doc.mjs', 'lib/history.mjs', 'lib/color.mjs', 'threat-trace.mjs', 'lib/source.mjs', 'data-guard.mjs', 'risk-paths.mjs', 'lane-brief.mjs', 'visual-extract.mjs', 'perf-smoke.mjs', 'lib/perf.mjs', 'web-perf.mjs', 'layout-check.mjs', 'lib/behaviour.mjs', 'lib/code.mjs', 'pattern-check.mjs', 'timeout-check.mjs', 'mutation-score.mjs', 'explore.mjs', 'ui-inventory.mjs', 'copy-lint.mjs', 'ui-consistency.mjs', 'lib/classes.mjs', 'lib/kit.mjs', 'lib/error-ux.mjs', 'lib/yaml.mjs', 'lib/check.mjs', 'lib/langs.mjs', 'problems-check.mjs', 'api-style-check.mjs', 'limits-check.mjs', 'obs-check.mjs', 'schema-lint.mjs', 'conventions-check.mjs', 'commit-lint.mjs', 'propagate-dec.mjs', 'skeleton-check.mjs', 'lib/profile.mjs', 'run-id.mjs', 'ui-score.mjs', 'ui-privacy.mjs', 'fixture-check.mjs', 'eol-check.mjs', 'deploy-plan-check.mjs', 'lib/ui-spec.mjs', 'lib/ui-score.mjs', 'lib/root.mjs', 'lib/activity.mjs', 'autonomy.mjs', 'env-doctor.mjs']) {
    (existsSync(join(l.dev, 'scripts', script)) ? ok : fail)('scripts', `${rootName(l)}/scripts/${script}`);
  }
}

function checkProfile(l) {
  if (!existsSync(l.profile)) {
    fail('profile', `${rel(l.profile)} missing — copy it from the bundle and fill it in`);
    return null;
  }
  const text = readFileSync(l.profile, 'utf8');
  const name = /^- \*\*Name:\*\*\s*`?([^`\n]+)`?/m.exec(text)?.[1]?.trim();
  if (!name || name.startsWith('<')) warn('profile', 'Name is still a placeholder — stages will stop with "Project setup required"');
  else ok('profile', `project "${name}"`);

  const maturity = /\*\*Project maturity:\*\*\s*`?([^`\n]+)`?/.exec(text)?.[1]?.trim();
  if (!maturity || maturity.startsWith('<')) warn('profile', 'Project maturity not set — brownfield obligations (§16.4) will not be enforced');
  else ok('profile', `maturity ${maturity}`);

  const stacks = [];
  const stores = [];
  for (const row of text.split('\n')) {
    const m = /^\| `(\w+)` \| (yes|no) \|/.exec(row);
    if (!m) continue;
    const [, key, enabled] = m;
    if (['postgres', 'mysql'].includes(key)) {
      if (enabled === 'yes') stores.push(key);
    } else if (enabled === 'yes') {
      stacks.push(key);
    }
  }
  ok('profile', `stacks: ${stacks.join(', ') || 'none enabled'} · stores: ${stores.join(', ') || 'none enabled'}`);
  // A stack with no adapter is read by no checker, so a green check would be a lie. It is not a reason
  // to refuse the project either: the gates still run, on the repository's own conventions (§25).
  const type = /^- \*\*Product type:\*\*\s*`([a-z]+)`/m.exec(text)?.[1] ?? 'web';
  const cov = coverage(stacks, type);
  (cov.summary === 'full' || cov.summary === 'none' ? ok : warn)('coverage', `${type} · ${cov.tiers.map((t) => `${t.stack} ${t.tier}`).join(' · ') || 'no stack'}`);
  for (const n of cov.notes) warn('coverage', n);
  return { stacks, stores };
}

function checkToolchain(profile) {
  const node = process.versions.node.split('.')[0];
  (Number(node) >= 20 ? ok : fail)('node', `v${process.versions.node}${Number(node) >= 20 ? '' : ' — 20+ required'}`);

  if (!profile) return;
  const need = toolsFor(profile.stacks);
  if (profile.stores.includes('postgres')) need.set('psql', 'store postgres (schema introspection)');
  if (profile.stores.includes('mysql')) need.set('mysql', 'store mysql (schema introspection)');
  if (profile.stores.length) need.set('migrate', 'migration round-trip gate (or your declared tool)');

  for (const [bin, why] of need) {
    (onPath(bin) ? ok : warn)('toolchain', `${bin}${onPath(bin) ? '' : ' not on PATH'} — ${why}`);
  }
}

/**
 * A UI stack with no design system reaches G5 and stops there. Saying so at install time is cheaper
 * than finding out at the first /sdlc-ui. Only the installed layout is checked: the bundle repo
 * ships presets, not a chosen design system, and has nothing to choose for.
 */
function checkDesignSystem(l, profile) {
  if (l.kind !== 'installed' || !profile) return;
  if (!profile.stacks.includes('react') && !profile.stacks.includes('nextjs')) return;
  if (!existsSync(join(l.dev, 'docs', 'design-tokens.json'))) {
    warn('design', `no design system yet: ${rootName(l)}/docs/design-tokens.json is missing, and /sdlc-ui will stop until /sdlc-design-system has run`);
    return;
  }
  const check = spawnSync(process.execPath, [join(l.dev, 'scripts', 'design-system.mjs'), 'check', '--tokens', join(l.dev, 'docs')], { encoding: 'utf8' });
  const line = (check.stdout || check.stderr).trim().split('\n')[0];
  (check.status === 0 ? ok : warn)('design', line);
}

function checkState(l) {
  const statePath = join(l.dev, 'state.json');
  if (!existsSync(statePath)) {
    warn('state', `${rootName(l)}/state.json not built yet — run node ${rootName(l)}/scripts/build-state.mjs`);
    return;
  }
  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    ok('state', `schema ${state.schema} · ${state.initiatives?.length ?? 0} initiative(s) · generated ${state.generated_at}`);
    const stale = (state.initiatives ?? []).flatMap((i) => i.stages.filter((s) => s.state === 'STALE').map((s) => `${i.slug} ${s.gate}`));
    if (stale.length) warn('state', `${stale.length} stale gate(s): ${stale.slice(0, 4).join(', ')}${stale.length > 4 ? ' …' : ''}`);
  } catch (err) {
    fail('state', `state.json unreadable: ${err.message}`);
    return;
  }
  const check = spawnSync(process.execPath, [join(l.dev, 'scripts', 'build-state.mjs'), '--root', l.dev, '--check', '--quiet'], { encoding: 'utf8' });
  (check.status === 0 ? ok : warn)('state', check.status === 0 ? 'index matches the files on disk' : 'index is out of date — run build-state.mjs (it is derived; never edit it)');
}

/**
 * `--reaffirm` reads the diff of a changed input and judges whether the prior verdict survives it
 * (§4.4). That needs a prior version, which means `dev/` has to be in git — and a repository that
 * exists is not the same as artifacts that are tracked in it.
 *
 * The distinction is not pedantic: the first time anything upstream changes, the reaffirm path is
 * exactly the one that is reached, and an untracked `dev/` fails it at the worst moment — after a
 * stage has already gone STALE and someone is trying to avoid eleven full re-reviews.
 */
function checkGit(cwd, l) {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
  } catch {
    warn('git', 'not a git repository — /sdlc-gate --reaffirm has no prior version to diff against');
    return;
  }

  const devRoot = l.kind === 'installed' && existsSync(l.dev) ? rootName(l) : null;
  if (!devRoot) {
    ok('git', 'repository present');
    return;
  }

  try {
    const tracked = execSync(`git ls-files ${devRoot}`, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    if (!tracked) {
      warn(
        'git',
        `${devRoot}/ is not tracked in git — /sdlc-gate --reaffirm cannot diff a changed input, and will refuse rather than reaffirm what it could not read. Commit ${devRoot}/.`,
      );
      return;
    }
    // §18.5: dev/.gitignore keeps the derived index out of git, but a file committed before the
    // ignore file shipped stays tracked and every hook run dirties it (release-management at 1.3.0).
    const derived = tracked.split('\n').filter((p) => [`${devRoot}/state.json`, `${devRoot}/DASHBOARD.md`].includes(p));
    if (derived.length) {
      warn('git', `${derived.join(', ')} tracked although ${devRoot}/.gitignore excludes ${derived.length === 1 ? 'it' : 'them'} (§18.5) — git rm --cached ${derived.join(' ')}`);
    }
    const dirty = execSync(`git status --porcelain ${devRoot}`, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
    const n = dirty ? dirty.split('\n').length : 0;
    if (n > 0) {
      ok('git', `${devRoot}/ tracked — ${n} uncommitted change(s); commit before relying on --reaffirm`);
    } else {
      ok('git', `${devRoot}/ tracked and clean — --reaffirm can diff prior versions`);
    }
  } catch {
    ok('git', 'repository present — could not read the index, --reaffirm may not find a prior version');
  }
}

/**
 * Machine capabilities the G8 gates need and a developer laptop often lacks. On release-management
 * the verifier found each of these by failing: -race needs cgo and there was no C compiler, the DB
 * roles needed psql. `probe` is injectable so the test does not depend on this machine.
 */
export const CAPABILITIES = [
  {
    name: 'cgo C compiler',
    bins: ['gcc', 'clang', 'cc'],
    detail: 'go test -race needs CGO_ENABLED=1 and a C compiler',
    defers: ['Unit tests (Go) -race'],
  },
  { name: 'psql', bins: ['psql'], detail: 'applies DB roles and introspects the schema', defers: ['DB roles in the migration round trip', 'schema introspection'] },
  { name: 'docker', bins: ['docker'], detail: 'runs the integration database and the ZAP baseline', defers: ['Integration tests (container DB)', 'DAST baseline'], daemon: true },
];

export function probeCapabilities(probe = onPath, daemonUp = dockerDaemonUp) {
  return CAPABILITIES.map((c) => {
    const bin = c.bins.find((b) => probe(b));
    const present = Boolean(bin) && (!c.daemon || daemonUp());
    const detail = bin && c.daemon && !present ? `${bin} on PATH but the daemon is not running` : bin ? `${bin} on PATH` : c.detail;
    return { name: c.name, present, detail: present ? `${bin} on PATH` : detail, defers: c.defers };
  });
}

function dockerDaemonUp() {
  return spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: 'ignore', timeout: 8000 }).status === 0;
}

function printCapabilities(caps, asJson) {
  const deferred = caps.filter((c) => !c.present).flatMap((c) => c.defers.map((gate) => ({ gate, reason: `${c.name} missing on this machine` })));
  if (asJson) {
    console.log(JSON.stringify({ capabilities: caps, deferred_to_ci: deferred }, null, 2));
    return;
  }
  for (const c of caps) console.log(`[${c.present ? 'HAVE' : 'MISS'}] ${c.name.padEnd(15)} ${c.detail}`);
  console.log(deferred.length
    ? `\nDeferred to CI (record NOT RUN with this reason; G9 needs the CI proof, DEV-CONTRACTS §5.6):\n${deferred.map((d) => `  - ${d.gate}: ${d.reason}`).join('\n')}`
    : '\nNothing deferred: this machine can run every G8 gate here.');
}

// ---------------------------------------------------------------------------------------------

function print(l) {
  console.log(`Agentic SDLC Doctor — ${l.kind} layout at ${process.cwd()}\n`);
  const width = Math.max(...results.map(([, a]) => a.length));
  for (const [level, area, msg] of results) console.log(`[${level}] ${area.padEnd(width)}  ${msg}`);
  const fails = results.filter(([x]) => x === 'FAIL').length;
  const warns = results.filter(([x]) => x === 'WARN').length;
  console.log(`\n${fails ? `${fails} failure(s)` : 'ready'}${warns ? ` · ${warns} warning(s)` : ''}`);
}

function listFiles(dir, pred) {
  try { return readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile() && pred(f)); } catch { return []; }
}
function listDirs(dir, pred) {
  try { return readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory() && pred(f)); } catch { return []; }
}
function walk(dir) {
  try {
    return readdirSync(dir).flatMap((e) => {
      const full = join(dir, e);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  } catch { return []; }
}
function onPath(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [bin], { stdio: 'ignore' }).status === 0;
}
function rel(p) { return p.replace(process.cwd(), '.').replace(/\\/g, '/'); }
/** The SDLC root as a project-relative name (`.sdlc`, `dev`), or `workspace/dev` in the bundle repo. */
function rootName(l) { return relative(process.cwd(), l.dev).split(sep).join('/') || '.'; }
function argFor(argv, flag) { const i = argv.indexOf(flag); return i !== -1 && argv[i + 1] ? argv[i + 1] : null; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
