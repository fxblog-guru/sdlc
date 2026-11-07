// Bundle self-lint: the shape of the bundle itself — names, sizes, wiring, citations.
//
// lint-dev.mjs checks the artifacts a project writes. This file checks the bundle: that every
// command, agent and skill is named by the convention, stays inside its context budget, refers
// only to things that exist, and cites only sections the contract has. It is what makes "small,
// consistent, trustworthy" a property CI can fail on rather than a hope.
//
// Set SDLC_BUNDLE_ROOT to lint a different checkout (used by the mutation check in CONTRIBUTING.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.SDLC_BUNDLE_ROOT ?? join(here, '..'));
const CONTRACTS_MJS = pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'contracts.mjs')).href;
const { indexSections } = await import(CONTRACTS_MJS);

// ---------------------------------------------------------------------------------------------
// Budgets. Change them here, deliberately, and say why in CHANGELOG.md.
// ---------------------------------------------------------------------------------------------
const BUDGET = {
  commandDescriptionChars: 120, // shows in the / menu; one line
  agentDescriptionChars: 220, // always in the agent listing
  skillDescriptionChars: 200, // always in the skill listing (1% of context is shared by all skills)
  listingChars: 8000, // every skill + agent description together — must fit a 200k-context listing budget
  stageCommandWords: 750, // a stage command carries only its deltas; the protocol holds the rest
  commandWords: 1100, // non-stage commands (gate, ask, onboard, debug, refactor, design-system…)
  agentWords: 1600,
  skillLines: 500, // Claude Code guidance: move reference material to sibling files past this
  protocolWords: 950, // loaded once per session; the only always-on prose besides descriptions
  agentPreloads: 2, // `skills:` injects the full file at spawn — preload only what every run uses (GK uses two)
};

// An agent may preload more than the budget only when every run uses every preloaded skill.
const PRELOAD_EXCEPTIONS = {
  'dev-solution-architect': 4, // brainstorming, technical design, impact, threat model — all four, every G2
};

// Names ---------------------------------------------------------------------------------------
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// The stage vocabulary a gate log is named with (DEV-CONTRACTS §10 / §5.1).
const STAGES = ['knowledge', 'intake', 'requirements', 'design', 'data', 'api', 'ui', 'plan', 'implementation', 'verification', 'release', 'deployment', 'monitoring'];
// Reviewing skills are `dev-reviewing-<stage>`; authoring skills are `dev-<verb-ing>-<object>`;
// protocol skills (shared procedure, not a stage) are `dev-<noun>-protocol`.
const PROTOCOL = /-protocol$/;

// Helpers -------------------------------------------------------------------------------------
function frontmatter(text) {
  const m = text.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) { key = kv[1]; fm[key] = kv[2] === '' ? [] : kv[2]; continue; }
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key && Array.isArray(fm[key])) fm[key].push(item[1]);
  }
  return fm;
}
const words = (t) => t.split(/\s+/).filter(Boolean).length;
const lines = (t) => t.replace(/\r\n/g, '\n').split('\n').length;
const read = (p) => readFileSync(p, 'utf8');
const list = (dir, pred = () => true) => (existsSync(dir) ? readdirSync(dir).filter(pred) : []);

const commands = list(join(ROOT, 'commands'), (f) => f.endsWith('.md')).map((f) => ({ name: f.replace(/\.md$/, ''), path: join(ROOT, 'commands', f) }));
const agents = list(join(ROOT, 'agents'), (f) => f.endsWith('.md')).map((f) => ({ name: f.replace(/\.md$/, ''), path: join(ROOT, 'agents', f) }));
const skills = list(join(ROOT, 'skills'), (d) => existsSync(join(ROOT, 'skills', d, 'SKILL.md'))).map((d) => ({ name: d, path: join(ROOT, 'skills', d, 'SKILL.md') }));
const templates = list(join(ROOT, 'workspace', 'dev', '_templates'), (f) => f.endsWith('.md')).map((f) => join(ROOT, 'workspace', 'dev', '_templates', f));

const skillNames = new Set(skills.map((s) => s.name));
const agentNames = new Set(agents.map((a) => a.name));
const isStageCommand = (text) => /^Run G\d+ for `\$1`/m.test(text);

// ---------------------------------------------------------------------------------------------
test('the bundle has its three parts and the shared protocol', () => {
  assert.ok(commands.length >= 20, `expected the command set, found ${commands.length}`);
  assert.ok(agents.length >= 10, `expected the agent set, found ${agents.length}`);
  assert.ok(skills.length >= 30, `expected the skill set, found ${skills.length}`);
  assert.ok(skillNames.has('dev-stage-protocol'), 'skills/dev-stage-protocol/SKILL.md is missing');
  for (const f of ['LICENSE', 'VERSION', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'README.md', 'DEV-CONTRACTS.md', 'DEV-PROFILE.md']) {
    assert.ok(existsSync(join(ROOT, f)), `${f} is missing at the bundle root`);
  }
  assert.match(read(join(ROOT, 'VERSION')).trim(), /^\d+\.\d+\.\d+$/, 'VERSION is not semver');
});

// Versions -------------------------------------------------------------------------------------
// `afx` compares the installed VERSION with the latest one, and the board shows the builder's
// constant, so every place a version is written must agree, or an update notice tells a lie.

/** The released `## [x.y.z]` headings of a Keep-a-Changelog file, newest first, each with its body. */
function releases(text) {
  const out = [];
  const parts = text.replace(/\r\n/g, '\n').split(/^## /m).slice(1);
  for (const part of parts) {
    const m = part.match(/^\[(\d+)\.(\d+)\.(\d+)\]/);
    if (m) out.push({ version: `${m[1]}.${m[2]}.${m[3]}`, major: Number(m[1]), body: part });
    else assert.match(part, /^\[Unreleased\]/, `CHANGELOG heading "## ${part.split('\n')[0]}" is neither [x.y.z] nor [Unreleased]`);
  }
  return out;
}

test('versions: VERSION, the latest CHANGELOG release, the builder constant and the sample index agree', () => {
  const version = read(join(ROOT, 'VERSION')).trim();
  const changelog = read(join(ROOT, 'CHANGELOG.md'));
  const rel = releases(changelog);
  assert.ok(rel.length, 'CHANGELOG.md has no released version heading');
  assert.equal(rel[0].version, version, 'VERSION differs from the latest released CHANGELOG heading ([Unreleased] may sit above it)');
  const unreleasedAt = changelog.search(/^## \[Unreleased\]/m);
  if (unreleasedAt >= 0) assert.ok(unreleasedAt < changelog.indexOf(`## [${version}]`), '[Unreleased] must sit above the latest release');
  const builder = read(join(ROOT, 'workspace', 'dev', 'scripts', 'build-state.mjs')).match(/export const GENERATOR_VERSION = '([^']+)'/);
  assert.ok(builder, 'build-state.mjs no longer declares GENERATOR_VERSION');
  assert.equal(builder[1], version, 'build-state.mjs GENERATOR_VERSION differs from VERSION');
  const badge = read(join(ROOT, 'README.md')).match(/\*\*v(\d+\.\d+\.\d+)\*\*/);
  assert.ok(badge, 'README.md lost its **vX.Y.Z** version badge');
  assert.equal(badge[1], version, 'README.md version badge differs from VERSION');
  const sample = JSON.parse(read(join(ROOT, 'tests', 'fixtures', 'state.sample.json')));
  assert.equal(sample.generator_version, version, 'tests/fixtures/state.sample.json is from another builder; run tests/regen-sample.mjs');
});

test('versions: CHANGELOG headings descend, and every new MAJOR has ### Breaking and an UPGRADE.md section', () => {
  const rel = releases(read(join(ROOT, 'CHANGELOG.md')));
  const upgrade = existsSync(join(ROOT, 'UPGRADE.md')) ? read(join(ROOT, 'UPGRADE.md')) : '';
  const num = (v) => v.split('.').map(Number);
  for (let i = 0; i < rel.length - 1; i++) {
    const [a, b] = [num(rel[i].version), num(rel[i + 1].version)];
    const newer = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    assert.ok(newer > 0, `CHANGELOG: ${rel[i].version} is listed above ${rel[i + 1].version} but is not newer`);
    if (rel[i].major > rel[i + 1].major) {
      assert.match(rel[i].body, /^### Breaking\b/m, `CHANGELOG ${rel[i].version} is a MAJOR and has no "### Breaking" subsection`);
      assert.match(upgrade, new RegExp(`^## .*\\b${rel[i].major}\\.0\\.0\\b`, 'm'), `UPGRADE.md has no section for ${rel[i].major}.0.0`);
    }
  }
});

test('versions: the add-on CHANGELOG names the add-on package version', () => {
  const dir = join(ROOT, 'editor', 'vscode-sdlc');
  const pkg = JSON.parse(read(join(dir, 'package.json')));
  assert.equal(releases(read(join(dir, 'CHANGELOG.md')))[0]?.version, pkg.version, 'editor/vscode-sdlc CHANGELOG top release differs from package.json');
});

test('UPGRADE.md exists, has the template, and README points to it', () => {
  const upgrade = read(join(ROOT, 'UPGRADE.md'));
  assert.match(upgrade, /afx update --bundle dev/);
  assert.match(upgrade, /^## Template\b/m, 'UPGRADE.md lost its template section');
  assert.match(read(join(ROOT, 'README.md')), /\(UPGRADE\.md\)/, 'README does not link UPGRADE.md');
  assert.match(read(join(ROOT, 'CONTRIBUTING.md')), /### Breaking/, 'CONTRIBUTING does not state the MAJOR rule');
});

test('naming: commands are sdlc-<kebab>, agents and skills are dev-<kebab>, names match files', () => {
  for (const c of commands) {
    assert.match(c.name, /^sdlc-/, `command ${c.name} must start with sdlc-`);
    assert.match(c.name, KEBAB, `command ${c.name} is not lowercase kebab-case`);
  }
  for (const a of agents) {
    assert.match(a.name, /^dev-/, `agent ${a.name} must start with dev-`);
    assert.match(a.name, KEBAB, `agent ${a.name} is not lowercase kebab-case`);
    const fm = frontmatter(read(a.path));
    assert.ok(fm, `${a.name}: no front matter`);
    assert.equal(fm.name, a.name, `${a.name}: front matter name "${fm.name}" differs from the file name`);
  }
  for (const s of skills) {
    assert.match(s.name, /^dev-/, `skill ${s.name} must start with dev-`);
    assert.match(s.name, KEBAB, `skill ${s.name} is not lowercase kebab-case`);
    const fm = frontmatter(read(s.path));
    assert.ok(fm, `${s.name}: no front matter`);
    assert.equal(fm.name, s.name, `${s.name}: front matter name "${fm.name}" differs from the directory name`);
  }
  // No name may be shared across kinds — the installer merges all three into one .claude/ tree.
  for (const a of agents) assert.ok(!skillNames.has(a.name), `${a.name} is both an agent and a skill`);
});

// Mechanical agents run on the cheaper model; authors and reviewers keep the default (opus).
const MECHANICAL_AGENTS = { 'dev-reaffirmer': 'sonnet', 'dev-bookkeeper': 'sonnet' };

test('models: mechanical agents declare sonnet, every author and reviewer declares opus', () => {
  for (const a of agents) {
    const fm = frontmatter(read(a.path));
    const want = MECHANICAL_AGENTS[a.name] ?? 'opus';
    assert.equal(fm.model, want, `${a.name}: model is "${fm.model}", expected ${want}${MECHANICAL_AGENTS[a.name] ? ' — mechanical work does not need the judgement model' : ' — authors and reviewers keep the default'}`);
  }
  for (const name of Object.keys(MECHANICAL_AGENTS)) assert.ok(agentNames.has(name), `mechanical agent ${name} does not exist`);
});

test('naming: reviewing skills are dev-reviewing-<stage>; authoring skills use the verb-ing form', () => {
  // dev-reviewing-pull-request reviews a teammate's PR, not a gate (/sdlc-review-pr): the one
  // reviewing skill whose object is not a stage, and it writes dev/pr-reviews/, never a gate log.
  const NOT_A_GATE = new Set(['dev-reviewing-pull-request']);
  const reviewing = skills.filter((s) => s.name.startsWith('dev-reviewing-') && !NOT_A_GATE.has(s.name));
  assert.ok(reviewing.length >= 13, `expected one reviewing skill per gate, found ${reviewing.length}`);
  for (const name of NOT_A_GATE) assert.ok(skillNames.has(name), `${name} is missing`);
  for (const s of reviewing) {
    const stage = s.name.replace(/^dev-reviewing-/, '');
    assert.ok(STAGES.includes(stage), `${s.name}: "${stage}" is not a stage name (${STAGES.join(', ')})`);
  }
  for (const s of skills) {
    if (s.name.startsWith('dev-reviewing-') || PROTOCOL.test(s.name)) continue;
    const verb = s.name.split('-')[1];
    assert.match(verb, /ing$/, `${s.name}: an authoring skill is named dev-<verb-ing>-<object>, e.g. dev-writing-go-code`);
  }
});

test('descriptions: one short trigger line each, and the whole listing fits the context budget', () => {
  let listing = 0;
  for (const c of commands) {
    const fm = frontmatter(read(c.path));
    assert.ok(fm?.description, `${c.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.commandDescriptionChars, `${c.name}: description is ${fm.description.length} chars (max ${BUDGET.commandDescriptionChars})`);
    assert.equal(fm['disable-model-invocation'], 'true', `${c.name}: commands are user-invoked; set disable-model-invocation: true so the description leaves the always-on listing`);
  }
  for (const a of agents) {
    const fm = frontmatter(read(a.path));
    assert.ok(fm?.description, `${a.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.agentDescriptionChars, `${a.name}: description is ${fm.description.length} chars (max ${BUDGET.agentDescriptionChars})`);
    listing += fm.description.length;
  }
  for (const s of skills) {
    const fm = frontmatter(read(s.path));
    assert.ok(fm?.description, `${s.name}: no description`);
    assert.ok(fm.description.length <= BUDGET.skillDescriptionChars, `${s.name}: description is ${fm.description.length} chars (max ${BUDGET.skillDescriptionChars})`);
    assert.ok(!/^The G\d+ gate review\. Judges/.test(fm.description), `${s.name}: description is a summary, not a trigger`);
    listing += fm.description.length;
  }
  assert.ok(listing <= BUDGET.listingChars, `skill + agent descriptions total ${listing} chars (max ${BUDGET.listingChars})`);
});

test('sizes: stage commands carry deltas only, skills stay under 500 lines, agents preload at most one skill', () => {
  for (const c of commands) {
    const text = read(c.path);
    const limit = isStageCommand(text) ? BUDGET.stageCommandWords : BUDGET.commandWords;
    assert.ok(words(text) <= limit, `${c.name}: ${words(text)} words (max ${limit}) — move shared protocol into dev-stage-protocol`);
  }
  for (const a of agents) {
    const text = read(a.path);
    assert.ok(words(text) <= BUDGET.agentWords, `${a.name}: ${words(text)} words (max ${BUDGET.agentWords})`);
    const fm = frontmatter(text);
    const preloads = Array.isArray(fm.skills) ? fm.skills.length : 0;
    const allowed = PRELOAD_EXCEPTIONS[a.name] ?? BUDGET.agentPreloads;
    assert.ok(preloads <= allowed, `${a.name}: preloads ${preloads} skills; each is injected in full on every spawn — invoke by name instead`);
    for (const s of fm.skills ?? []) assert.ok(skillNames.has(s), `${a.name}: preloads unknown skill ${s}`);
  }
  for (const s of skills) {
    const text = read(s.path);
    assert.ok(lines(text) <= BUDGET.skillLines, `${s.name}: ${lines(text)} lines (max ${BUDGET.skillLines}) — move reference material to a sibling file`);
  }
  const protocol = read(join(ROOT, 'skills', 'dev-stage-protocol', 'SKILL.md'));
  assert.ok(words(protocol) <= BUDGET.protocolWords, `dev-stage-protocol: ${words(protocol)} words (max ${BUDGET.protocolWords})`);
});

test('wiring: every stage command runs the protocol, names an existing agent and an existing reviewing skill', () => {
  const stage = commands.filter((c) => isStageCommand(read(c.path)));
  assert.ok(stage.length >= 12, `expected 12 stage commands, found ${stage.length}`);
  for (const c of stage) {
    const text = read(c.path);
    assert.match(text, /`dev-stage-protocol`/, `${c.name}: does not invoke dev-stage-protocol`);
    const spawns = [...text.matchAll(/Spawn \*\*`(dev-[a-z-]+)`\*\*/g)].map((m) => m[1]);
    assert.ok(spawns.length >= 1, `${c.name}: names no authoring agent (Spawn **\`dev-…\`**)`);
    for (const a of spawns) assert.ok(agentNames.has(a), `${c.name}: spawns unknown agent ${a}`);
    const reviewers = [...text.matchAll(/`(dev-reviewing-[a-z]+)`/g)].map((m) => m[1]);
    assert.ok(reviewers.length >= 1, `${c.name}: names no reviewing skill`);
    for (const r of reviewers) assert.ok(skillNames.has(r), `${c.name}: names unknown reviewing skill ${r}`);
  }
});

test('wiring: every dev-* name mentioned in a command, agent or skill exists', () => {
  const files = [...commands, ...agents, ...skills].map((x) => x.path);
  const known = new Set([...skillNames, ...agentNames]);
  const problems = [];
  for (const p of files) {
    const text = read(p);
    for (const m of text.matchAll(/`(dev-[a-z][a-z0-9-]*)`/g)) {
      const name = m[1];
      // Paths and file names also start with dev- (dev-root, dev:lint); only agent/skill-shaped names count.
      if (name.endsWith('-code') || name.includes('reviewing') || name.includes('writing') || /^dev-[a-z]+-[a-z-]+$/.test(name)) {
        if (!known.has(name) && !['dev-root', 'dev-reviews', 'dev-design-tokens'].includes(name)) problems.push(`${p.slice(ROOT.length + 1)}: \`${name}\``);
      }
    }
  }
  assert.deepEqual(problems, [], `references to agents/skills that do not exist:\n  ${problems.join('\n  ')}`);
});

test('wiring: DEV-PROFILE.md and README.md name only skills that exist, by their dev-* directory name', () => {
  // The profile is the file a project edits first; a skill column that points at an upstream or a
  // renamed skill sends the reader (and the agent) to nothing.
  const known = new Set([...skillNames, ...agentNames]);
  const problems = [];
  for (const f of ['DEV-PROFILE.md', 'README.md']) {
    const text = read(join(ROOT, f)).replace(/\r\n/g, '\n');
    // 1. Skill-shaped names: dev-<verb-ing>-…, or the same without the prefix (writing-go-code).
    for (const m of text.matchAll(/`((?:dev-)?[a-z]+ing-[a-z0-9-]+)`/g)) {
      if (!known.has(m[1])) problems.push(`${f}: \`${m[1]}\``);
    }
    // 2. Every backticked name in a table column whose header says "skill" must be a skill.
    let skillCols = null;
    for (const line of text.split('\n')) {
      if (!line.startsWith('|')) { skillCols = null; continue; }
      const cells = line.split('|').slice(1, -1);
      if (skillCols === null) { skillCols = cells.map((c, i) => (/skill/i.test(c) ? i : -1)).filter((i) => i >= 0); continue; }
      for (const i of skillCols) {
        for (const m of (cells[i] ?? '').matchAll(/`([^`]+)`/g)) {
          if (!skillNames.has(m[1])) problems.push(`${f}: \`${m[1]}\` in a skill column`);
        }
      }
    }
  }
  assert.deepEqual(problems, [], `DEV-PROFILE/README name skills that do not exist:\n  ${problems.join('\n  ')}`);
});

test('citations: every §N / §N.M cited anywhere resolves to a section of DEV-CONTRACTS.md', () => {
  const contract = read(join(ROOT, 'DEV-CONTRACTS.md'));
  const idx = indexSections(contract);
  const ids = new Set(idx.map((s) => s.id));
  const hasSubsections = (n) => idx.some((s) => s.level === 3 && s.id.startsWith(n + '.'));
  const files = [...commands, ...agents, ...skills].map((x) => x.path).concat(templates, [join(ROOT, 'README.md'), join(ROOT, 'DEV-PROFILE.md')]);
  const bad = new Map();
  for (const p of files) {
    for (const m of read(p).matchAll(/§(\d+(?:\.\d+[a-z]?)?)/g)) {
      const id = m[1];
      const top = id.split('.')[0];
      const ok = ids.has(id) || (id.includes('.') && ids.has(top) && !hasSubsections(top)); // §12.3 → numbered item of §12
      if (!ok) bad.set(`§${id}`, (bad.get(`§${id}`) ?? []).concat(p.slice(ROOT.length + 1)));
    }
  }
  assert.equal(bad.size, 0, `citations with no section:\n  ${[...bad].map(([k, v]) => `${k} in ${[...new Set(v)].join(', ')}`).join('\n  ')}`);
});

test('contracts.mjs slices by section and refuses unknown ones', async () => {
  const { slice } = await import(CONTRACTS_MJS);
  const contract = read(join(ROOT, 'DEV-CONTRACTS.md'));
  const r = slice(contract, ['4.5', '12.3', '99']);
  assert.match(r.text, /^### 4\.5 /m);
  assert.match(r.text, /^## 12\. /m);
  assert.deepEqual(r.missing, ['99']);
  assert.ok(words(r.text) < words(contract) / 5, 'slicing must cost a fraction of the whole file');
});

test('the workspace scripts the hooks and commands call all exist', () => {
  for (const s of ['build-state.mjs', 'status.mjs', 'lint-dev.mjs', 'doctor.mjs', 'design-system.mjs', 'contracts.mjs', 'ui-snap.mjs', 'ui-rubric.mjs', 'change-summary.mjs', 'reaffirm-check.mjs', 'migrate-ledger-inputs.mjs', 'threat-trace.mjs', 'data-guard.mjs', 'risk-paths.mjs', 'lane-brief.mjs', 'visual-extract.mjs', 'security-scan.mjs', 'perf-smoke.mjs', 'lib/perf.mjs', 'web-perf.mjs', 'layout-check.mjs', 'lib/behaviour.mjs', 'lib/code.mjs', 'pattern-check.mjs', 'timeout-check.mjs', 'mutation-score.mjs', 'explore.mjs', 'ui-inventory.mjs', 'copy-lint.mjs', 'ui-consistency.mjs', 'problems-check.mjs', 'api-style-check.mjs', 'api-contract-check.mjs', 'contract-compat.mjs', 'api-score.mjs', 'limits-check.mjs', 'obs-check.mjs', 'schema-lint.mjs', 'conventions-check.mjs', 'commit-lint.mjs', 'propagate-dec.mjs', 'skeleton-check.mjs', 'lib/profile.mjs', 'profile.mjs', 'ui-score.mjs', 'ui-privacy.mjs', 'fixture-check.mjs', 'eol-check.mjs', 'deploy-plan-check.mjs', 'lib/ui-spec.mjs', 'lib/ui-score.mjs', 'lib/root.mjs', 'migrate-root.mjs', 'diagram.mjs', 'env-doctor.mjs']) {
    const p = join(ROOT, 'workspace', 'dev', 'scripts', s);
    assert.ok(existsSync(p) && statSync(p).size > 0, `workspace/dev/scripts/${s} is missing`);
  }
});

// Token diet: the profile is printed by section, never read whole; an agent that no longer
// preloads its skills must name each one it invokes.
test('profile: no file asks for a full Read of DEV-PROFILE.md; profile.mjs slices it and flags placeholders', async () => {
  const offenders = [...commands, ...agents, ...skills].filter((x) => /Read `DEV-PROFILE\.md`/.test(read(x.path))).map((x) => x.name);
  assert.deepEqual(offenders, [], `full profile reads — print the sections with profile.mjs instead: ${offenders.join(', ')}`);
  const lib = await import(pathToFileURL(join(ROOT, 'workspace', 'dev', 'scripts', 'profile.mjs')).href);
  const profile = read(join(ROOT, 'DEV-PROFILE.md'));
  const one = lib.print(profile, ['Stacks']);
  assert.match(one.text, /^## Stacks/);
  assert.doesNotMatch(one.text, /^## Services/m, 'the next section leaked into the slice');
  assert.ok(one.text.length < profile.length / 4, 'a one-section slice is not much smaller than the file');
  assert.deepEqual(lib.print(profile, ['quality']).missing, [], 'a heading prefix does not resolve');
  assert.deepEqual(lib.print(profile, ['No such section']).missing, ['No such section']);
  assert.ok(lib.print(profile, ['Project']).holes.some((h) => /§Project line \d+ `<your product name>`/.test(h)), 'the template placeholder in §Project is not flagged');
  assert.deepEqual(lib.print('## A\n- **x:** `value`\n## B\n', ['A']).holes, [], 'a filled value is flagged as a placeholder');
  // After the dash a line documents its options; `<none>` is the value "none" — neither is a hole.
  assert.deepEqual(lib.print('## A\n- **Class:** `fix` — `<initiative | change | fix>`, the default\n- **Prefixes:** `<none>` — none added\n## B\n', ['A']).holes, [], 'documented options or <none> flagged as placeholders');
  assert.equal(lib.print('## A\n- **Blueprint:** `<path to the ADR>` — written at G2\n| `prod` | `<not hosted yet>` |\n## B\n', ['A']).holes.length, 2, 'an unfilled setting or table cell is not flagged');
  const idx = lib.sections(profile.split('\n'));
  const unknown = new Set();
  for (const x of [...commands, ...agents, ...skills]) {
    // `DEV-PROFILE §Name…`: the longest run of capitalised-or-lowercase words that is a heading prefix.
    for (const m of read(x.path).matchAll(/`?DEV-PROFILE(?:\.md)?`?\s+§([A-Z][A-Za-z]*(?: [a-z]+)?)/g)) {
      const two = m[1];
      const one = two.split(' ')[0];
      if (!lib.find(idx, two) && !lib.find(idx, one)) unknown.add(`${x.name}: §${one}`);
    }
  }
  assert.deepEqual([...unknown], [], 'profile sections named that profile.mjs cannot find');
});

test('clarify: --clarify is wired, capped at 5, asks one at a time, and never answers for the human', () => {
  const cmd = read(join(ROOT, 'commands', 'sdlc-requirements.md'));
  const fm = frontmatter(cmd);
  assert.match(fm['argument-hint'] ?? '', /\[--clarify\]/, 'sdlc-requirements: argument-hint does not offer --clarify');
  assert.match(cmd, /^## Clarify \(`--clarify` only\)$/m, 'sdlc-requirements: no Clarify section');
  assert.match(cmd, /\*\*one at a time\*\*/, 'sdlc-requirements: clarify does not ask one question at a time');
  assert.match(cmd, /`dev-writing-prd\/clarify\.md`|dev-writing-prd\/clarify\.md/, 'sdlc-requirements: does not pass the clarify procedure');
  const ref = join(ROOT, 'skills', 'dev-writing-prd', 'clarify.md');
  assert.ok(existsSync(ref), 'skills/dev-writing-prd/clarify.md is missing');
  const proc = read(ref);
  assert.match(proc, /top \*\*5\*\*/, 'clarify.md: the five-question cap is gone');
  assert.match(proc, /impact\*\* \([^)]*\) times\s+\*\*uncertainty\*\*/, 'clarify.md: gaps are not ranked by impact x uncertainty');
  for (const c of ['Functional scope', 'Data model', 'Non-functional', 'Edge cases', 'Integration', 'Terminology', 'Completion signals']) {
    assert.match(proc, new RegExp(`^\\s*\\| ${c} \\|`, 'm'), `clarify.md: taxonomy category "${c}" is missing`);
  }
  assert.match(proc, /Answer, or pick the default for, a question the human skipped/, 'clarify.md: the never-answer rule is gone');
  assert.match(read(join(ROOT, 'agents', 'dev-requirements-analyst.md')), /dev-writing-prd\/clarify\.md/, 'dev-requirements-analyst: does not know the clarify spawns');
  assert.match(read(join(ROOT, 'DEV-CONTRACTS.md')), /`\/sdlc-requirements <slug> --clarify`/, 'DEV-CONTRACTS §15.2: no clarify rule');
});

test('implement: spawns are bounded and fresh, never a continued long-lived implementer', () => {
  const text = read(join(ROOT, 'commands', 'sdlc-implement.md'));
  assert.match(text, /\*\*Bounded spawns:\*\* give each spawn at most \d+ `TASK`s/);
  assert.match(text, /never resume or continue a spent one/);
});

test('receiving review: the procedure exists, has its rules, and every author re-spawn points at it', () => {
  const ref = 'dev-stage-protocol/receiving-review.md';
  const p = join(ROOT, 'skills', 'dev-stage-protocol', 'receiving-review.md');
  assert.ok(existsSync(p), `skills/${ref} is missing`);
  const text = read(p);
  for (const [rule, re] of [
    ['read all findings first', /Read every finding before changing anything/],
    ['stop if any is unclear', /unclear: stop before fixing any/],
    ['three classes', /\*\*accept\*\*[\s\S]*\*\*push back\*\*[\s\S]*\*\*needs-decision\*\*/],
    ['push-back needs evidence', /Push-back evidence is something the reviewer can re-check/],
    ['one fix at a time, with a test', /Fix accepted findings one at a time/],
    ['no performative agreement', /absolutely right/],
    ['fresh evidence', /run \*\*in this turn\*\*/],
  ]) assert.match(text, re, `${ref}: lost the "${rule}" rule`);
  for (const f of ['skills/dev-stage-protocol/SKILL.md', 'agents/dev-implementer.md', 'commands/sdlc-review-pr.md', 'DEV-CONTRACTS.md']) {
    assert.ok(read(join(ROOT, f)).includes(ref), `${f} does not point at ${ref}`);
  }
});

// Long agent runs fail the same few ways: one huge tool call stalls past the 600 s limit and loses
// everything since the last commit, tests wipe a shared database, a contract defect gets "fixed" in
// the code. The brief carries one line per failure; the protocol sends it on every spawn.
test('agent brief: every rule is present, and the stage protocol sends it with every spawn', () => {
  const p = join(ROOT, 'skills', 'dev-stage-protocol', 'agent-brief.md');
  assert.ok(existsSync(p), 'skills/dev-stage-protocol/agent-brief.md is missing');
  const block = /```text\n([\s\S]*?)```/.exec(read(p))?.[1] ?? '';
  for (const [rule, re] of [
    ['small scope', /^- Scope:/m],
    ['short tool calls, no giant heredoc', /Tool calls stay short[\s\S]*heredoc/],
    ['timeouts', /has a timeout/],
    ['commit after each step', /Commit after each step/],
    ['author identity, no co-author', /author <name> <email>[\s\S]*No\s+co-author/],
    ['no push', /Never push/],
    ['test database only', /test database only/],
    ['ids from run-id.mjs', /--next-cr\|--next-dec/],
    ['stop on a contract defect', /Contract defect:[\s\S]*stop/],
    ['report format', /status: done \| partial \| blocked[\s\S]*commits:[\s\S]*tests:[\s\S]*blocked by:/],
  ]) assert.match(block, re, `agent-brief.md lost its rule: ${rule}`);
  assert.match(read(join(ROOT, 'skills', 'dev-stage-protocol', 'SKILL.md')), /Every spawn prompt ends with `dev-stage-protocol\/agent-brief\.md`/);
});
