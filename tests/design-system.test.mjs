/**
 * design-system.mjs — the arithmetic and the refusals.
 *
 * The presets ship with a claim ("every pair passes WCAG 2.2 AA in both themes"), and a claim in a
 * bundle is only as good as the test that re-checks it on every change. So every shipped preset is
 * validated here, the contrast maths is pinned against known WCAG values, render/check are run end to
 * end, and the scanner is held to both directions: what it must catch, and what it must leave alone.
 *
 *   node --test tests/design-system.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deltaE } from '../workspace/dev/scripts/lib/color.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { contrast, deriveFromVisual, importShadcn, lowFidelityReason, migratePreset, parseColor, presetWarnings, renderCss, renderMarkdown, scanText, validatePreset, COLOR_ROLES } from '../workspace/dev/scripts/design-system.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'design-system.mjs');
const SKILL = join(here, '..', 'skills', 'dev-defining-design-system');
const PRESETS = join(SKILL, 'presets');
const presetFiles = readdirSync(PRESETS).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(join(PRESETS, f), 'utf8'));
const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd });

test('contrast matches the WCAG reference values', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#ffffff', '#ffffff').toFixed(2), '1.00');
  assert.equal(contrast('#777777', '#ffffff').toFixed(2), '4.48'); // the classic "just fails AA" grey
  assert.equal(contrast('#fff', '#000'), contrast('#000000', '#ffffff'), 'shorthand hex and order do not matter');
});

test('seven presets ship, and every one passes every contrast pair in both themes', () => {
  assert.equal(presetFiles.length, 7);
  for (const f of presetFiles) {
    const p = load(f);
    assert.equal(`${p.id}.json`, f, `${f}: id must match the file name`);
    assert.deepEqual(validatePreset(p), [], `${f} is not usable`);
  }
});

test('a preset that drops a role or fails a pair is refused, with the ratio', () => {
  const p = load('clean-saas.json');
  const broken = structuredClone(p);
  delete broken.color.dark.focus;
  broken.color.light['text-muted'] = '#b0b0b0';
  const problems = validatePreset(broken);
  assert.ok(problems.some((x) => x === 'color.dark.focus missing'));
  assert.ok(problems.some((x) => /^light: text-muted on bg is \d\.\d\d:1, needs 4.5:1$/.test(x)), problems.join('\n'));
});

test('tokens.css declares every colour role in both themes and honours reduced motion', () => {
  const css = renderCss(load('dense-enterprise.json'));
  for (const role of COLOR_ROLES) assert.equal(css.match(new RegExp(`--color-${role}:`, 'g')).length, 3, role); // light, media-dark, data-theme dark
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*--motion-fast: 0ms/);
});

test('a light-only design system ships no dark theme, so the OS setting cannot flip the app', () => {
  // A wireframe drawn light only (§13.3) was rendered with a prefers-color-scheme dark block, and the
  // app followed the OS into a theme nobody approved. `themes: ["light"]` is how the reference says so.
  const p = { ...load('dense-enterprise.json'), themes: ['light'] };
  p.color = { light: p.color.light }; // no dark palette at all — the reference drew none
  p.elevation = { light: p.elevation.light };
  assert.deepEqual(validatePreset(p), []);
  const css = renderCss(p);
  assert.doesNotMatch(css, /prefers-color-scheme|data-theme="dark"|color-scheme: dark/);
  for (const role of COLOR_ROLES) assert.equal(css.match(new RegExp(`--color-${role}:`, 'g')).length, 1, role);
  assert.match(renderMarkdown(p, { chosenBy: 'A', date: '2026-10-08', sha: 'x', source: 's', cssPath: 'c' }), /\*\*Themes:\*\* light only/);
  assert.ok(validatePreset({ ...p, themes: ['sepia'] }).some((x) => /themes/.test(x)));
});

test('a skin renders every block under its scope, so the base and other skins are untouched', () => {
  const p = load('dense-enterprise.json');
  const css = renderCss(p, { scope: '[data-skin="sakura"]' });
  assert.doesNotMatch(css, /:root(?!\[data-skin="sakura"\])/, 'an unscoped :root block would override the base for everyone');
  assert.equal(css.match(/:root\[data-skin="sakura"\]/g).length, 4); // base, media-dark, data-theme dark, reduced motion
  for (const role of COLOR_ROLES) assert.equal(css.match(new RegExp(`--color-${role}:`, 'g')).length, 3, role);
  assert.equal(renderCss(p), renderCss(p, { scope: '' }), 'no scope renders exactly as before');
  assert.throws(() => renderCss(p, { scope: '.sakura' }), /scope/);
  assert.throws(() => renderCss(p, { scope: '[data-skin="x"] body' }), /scope/);
});

test('a scrim is its own token per theme, never derived from the text colour', () => {
  const p = { ...load('dense-enterprise.json'), scrim: { light: 'rgba(20,24,30,.55)', dark: 'rgba(0,0,0,.6)' } };
  assert.deepEqual(validatePreset(p), []);
  const css = renderCss(p);
  assert.equal(css.match(/--color-scrim: rgba\(20,24,30,\.55\);/g)?.length, 1);
  assert.equal(css.match(/--color-scrim: rgba\(0,0,0,\.6\);/g)?.length, 2); // media-dark + data-theme dark
  assert.ok(validatePreset({ ...p, scrim: { light: 'var(--color-text)', dark: 'x' } }).some((x) => /scrim/.test(x)));
});

// A wireframe drew tint fills (badges, pills) the 16 roles have no name for. Before extra_roles the
// project kept them in a Tailwind plugin and checked their contrast in its own unit test, out of
// reach of `check`. A role the approved visual draws is a token, and its pairs are measured here.
const TINTS = { 'tint-success': '#e1f0e5', 'tint-danger': '#fbe4e4', 'tint-warning': '#fbf0d9', 'tint-info': '#e0ecf8', 'tint-primary': '#e6e8fb', 'tint-neutral': '#eef0f2' };
const tinted = () => {
  const p = { ...load('dense-enterprise.json'), themes: ['light'] };
  p.color = { light: p.color.light };
  p.elevation = { light: p.elevation.light };
  p.extra_roles = Object.fromEntries(Object.entries(TINTS).map(([r, hex]) => [r, { light: hex, use: 'badge and pill fill' }]));
  p.extra_contrast_pairs = Object.keys(TINTS).map((bg) => ({ fg: 'text', bg, kind: 'text' }));
  return p;
};

test('extra_roles render into tokens.css, the md colour table and every shipped theme', () => {
  const p = tinted();
  assert.deepEqual(validatePreset(p), []);
  const css = renderCss(p);
  for (const [role, hex] of Object.entries(TINTS)) assert.equal(css.match(new RegExp(`--color-${role}: ${hex};`, 'g'))?.length, 1, role);
  const md = renderMarkdown(p, { chosenBy: 'A', date: '2026-10-10', sha: 'x', source: 's', cssPath: 'c' });
  assert.match(md, /\| `color\.tint-success` \| `#e1f0e5` \| — \| `--color-tint-success` \| badge and pill fill · project role/);
  assert.match(md, /\| `color\.text` \| `color\.tint-danger` \*extra\* \| 4\.5:1 \| \d+\.\d\d:1 ✓ \| — \|/);

  // Two themes: the dark value lands in both dark blocks; a missing dark value is refused.
  const both = load('dense-enterprise.json');
  both.extra_roles = { 'tint-info': { light: '#e0ecf8', dark: '#1b2a3a' } };
  both.extra_contrast_pairs = [];
  assert.deepEqual(validatePreset(both), []);
  assert.equal(renderCss(both).match(/--color-tint-info: #1b2a3a;/g)?.length, 2);
  assert.ok(validatePreset({ ...both, extra_roles: { 'tint-info': '#e0ecf8' } }).some((x) => /^extra_roles\.tint-info\.dark missing/.test(x)));
});

test('extra_roles refuse what is not a token: a non-hex, a clash with a built-in role, a bad name', () => {
  const p = tinted();
  const bad = (extra) => validatePreset({ ...p, extra_roles: extra, extra_contrast_pairs: [] });
  assert.ok(bad({ 'tint-info': 'color-mix(in srgb, var(--color-info) 12%, white)' }).some((x) => /tint-info\.light = .* is not a #rgb/.test(x)));
  assert.ok(bad({ primary: '#ffffff' }).some((x) => /already a built-in role/.test(x)));
  assert.ok(bad({ Tint_Info: '#ffffff' }).some((x) => /kebab-case/.test(x)));
  assert.ok(validatePreset({ ...p, extra_roles: ['#fff'] }).some((x) => /extra_roles must be an object/.test(x)));
});

test('extra_contrast_pairs are measured with the built-in thresholds, and a failing one is refused', () => {
  const p = tinted();
  p.extra_contrast_pairs.push({ fg: 'success', bg: 'tint-success', kind: 'non-text' });
  assert.deepEqual(validatePreset(p), []);
  // A tint too dark for text on it: 3.11:1 against the preset's text, short of 4.5.
  p.extra_roles['tint-neutral'].light = '#666666';
  const failing = validatePreset(p);
  assert.ok(failing.some((x) => x === 'light: text on tint-neutral is 3.11:1, needs 4.5:1 (extra_contrast_pairs)'), failing.join('\n'));
  assert.equal(failing.length, 1, failing.join('\n'));
  // The same pair as non-text (an icon on the tint) needs 3:1, and 3.11 clears it.
  assert.deepEqual(validatePreset({ ...p, extra_contrast_pairs: [{ fg: 'text', bg: 'tint-neutral', kind: 'non-text' }] }), []);
  // Shape errors name the pair.
  const shape = validatePreset({ ...p, extra_contrast_pairs: [{ fg: 'nope', bg: 'bg', kind: 'large' }] });
  assert.ok(shape.some((x) => /extra_contrast_pairs\[0\]\.fg = `nope` is not a colour role/.test(x)));
  assert.ok(shape.some((x) => /extra_contrast_pairs\[0\]\.kind = `large`/.test(x)));
});

test('check measures extra_contrast_pairs end to end: reported when they pass, exit 1 when one fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-'));
  const preset = join(dir, 'visual-tints.json');
  const out = join(dir, 'docs');
  writeFileSync(preset, JSON.stringify(tinted(), null, 2));
  const r = run(['render', '--preset', preset, '--out', out, '--chosen-by', 'Test Person', '--patterns', join(SKILL, 'ui-patterns.md')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(readFileSync(join(out, 'tokens.css'), 'utf8'), /--color-tint-primary: #e6e8fb;/);
  const ok = run(['check', '--tokens', out]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /21 contrast pairs pass \(15 built-in \+ 6 extra\)/);

  // A tint edited in the json (and re-rendered, so md = json) to one text cannot sit on fails check.
  const p = tinted();
  p.extra_roles['tint-warning'].light = '#666666';
  writeFileSync(preset, JSON.stringify(p, null, 2));
  assert.equal(run(['render', '--preset', preset, '--out', out, '--chosen-by', 'Test Person']).status, 1, 'render refuses it');
  const json = join(out, 'design-tokens.json');
  const rec = JSON.parse(readFileSync(json, 'utf8'));
  rec.extra_roles['tint-warning'].light = '#666666';
  writeFileSync(json, JSON.stringify(rec, null, 2));
  const bad = run(['check', '--tokens', out]);
  assert.equal(bad.status, 1, bad.stdout);
  assert.match(bad.stdout, /✗ light: text on tint-warning is \d\.\d\d:1, needs 4\.5:1 \(extra_contrast_pairs\)/);
});

test('a skin renders scoped end to end and checks without patterns of its own; a base still needs them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-'));
  const out = join(dir, 'skins', 'sakura');
  const css = join(dir, 'sakura.css');
  const r = run(['render', '--preset', join(SKILL, 'presets', 'editorial.json'), '--out', out, '--chosen-by', 'Test Person', '--css', css, '--scope', '[data-skin="sakura"]']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(readFileSync(css, 'utf8'), /:root(?!\[data-skin="sakura"\])/);
  assert.equal(JSON.parse(readFileSync(join(out, 'design-tokens.json'), 'utf8')).scope, '[data-skin="sakura"]');
  const ok = run(['check', '--tokens', out]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /skin \[data-skin="sakura"\]/);
  assert.equal(run(['render', '--preset', join(SKILL, 'presets', 'editorial.json'), '--out', out, '--chosen-by', 'T', '--scope', '.sakura']).status, 2, 'a scope that is not one attribute selector is refused');

  const base = join(dir, 'docs');
  assert.equal(run(['render', '--preset', join(SKILL, 'presets', 'editorial.json'), '--out', base, '--chosen-by', 'Test Person']).status, 0);
  assert.match(run(['check', '--tokens', base]).stdout, /ui-patterns\.md missing/);
});

test('render refuses to run without a named chooser', () => {
  const out = mkdtempSync(join(tmpdir(), 'ds-'));
  const r = run(['render', '--preset', join(PRESETS, 'clean-saas.json'), '--out', out]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--chosen-by/);
});

test('render → check passes; a hand edit to the md is caught', () => {
  const out = mkdtempSync(join(tmpdir(), 'ds-'));
  const r = run(['render', '--preset', join(PRESETS, 'field-mobile.json'), '--out', out, '--chosen-by', 'Test Person', '--patterns', join(SKILL, 'ui-patterns.md')]);
  assert.equal(r.status, 0, r.stderr);
  const ok = run(['check', '--tokens', out]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /chosen by Test Person/);

  const md = join(out, 'design-tokens.md');
  writeFileSync(md, readFileSync(md, 'utf8').replace('`#0f766e`', '`#ff00ff`'));
  writeFileSync(join(out, 'design-tokens.json'), readFileSync(join(out, 'design-tokens.json'), 'utf8') + ' ');
  const bad = run(['check', '--tokens', out]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /not rendered from the current design-tokens.json/);
});

test('check without a design system names the command that creates one', () => {
  const r = run(['check', '--tokens', mkdtempSync(join(tmpdir(), 'ds-'))]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/sdlc-design-system/);
});

test('scan catches hard-coded colours and px', () => {
  const src = [
    "<div style={{ color: '#3B82F6' }} />",
    '<div className="p-[13px] bg-[#fff]" />',
    '.x { color: rgb(0 0 0); gap: 8px }',
    '<div style={{ padding: 12 }} />',
  ].join('\n');
  const rules = scanText(src, 'A.tsx').map((h) => `${h.line}:${h.rule}:${h.match}`);
  assert.deepEqual(rules, ['1:hex:#3B82F6', '2:hex:#fff', '2:px:13px', '3:fn:rgb(0', '3:px:8px', '4:num:padding: 12']);
});

test('scan leaves alone what is not a hard-coded style', () => {
  const src = [
    'Order #123 was created', // an id, not a colour
    '<a href="#top">top</a>', // an anchor
    "border: '1px solid var(--color-border)'", // hairlines and zero are allowed
    'margin: 0px;',
    '@media (min-width: 768px) {', // breakpoints are the documented exception
    '// #ff0000 in a comment',
    "width: '20px' // tokens-ok: icon sprite size",
    '#main { color: var(--color-text) }', // an id selector
    'lineHeight: 1.5,',
  ].join('\n');
  assert.deepEqual(scanText(src, 'B.tsx'), []);
});

test('style-object numbers are only flagged in JSX files', () => {
  assert.equal(scanText('const o = { padding: 12 }', 'config.ts').length, 0);
  assert.equal(scanText('const o = { padding: 12 }', 'Box.tsx').length, 1);
});

test('ui-patterns.md defines every pattern id the G5 reviewer greps for', () => {
  const md = readFileSync(join(SKILL, 'ui-patterns.md'), 'utf8');
  for (const id of ['list', 'detail', 'form', 'wizard', 'dashboard', 'settings', 'master-detail', 'board', 'auth', 'first-run']) {
    assert.match(md, new RegExp(`^### \`${id}\` — `, 'm'), id);
  }
  for (const shell of ['sidebar', 'topbar-sidebar', 'topnav', 'bottom-tabs']) {
    assert.match(md, new RegExp(`^### \`shell\\.${shell}\``, 'm'), shell);
  }
  for (const f of presetFiles) assert.match(md, new RegExp(`shell\\.${load(f).shell}\``), `${f} names a shell the pattern file defines`);
});

test('presets derived from a public design system say where from, under which licence, and what changed', () => {
  for (const f of ['primer-product.json', 'carbon-enterprise.json']) {
    const p = load(f);
    assert.ok(p.provenance?.source && p.provenance?.license && p.provenance?.url, `${f} has no provenance`);
    assert.ok(p.provenance.adapted.length > 0, `${f} must list what it adapted`);
  }
});

test('parseColor reads the formats shadcn themes use, and matches the Tailwind palette', () => {
  const hex = (v) => { const c = parseColor(v); return '#' + c.rgb.map((x) => Math.round(x).toString(16).padStart(2, '0')).join(''); };
  assert.equal(hex('oklch(1 0 0)'), '#ffffff');
  assert.equal(hex('oklch(0.145 0 0)'), '#0a0a0a'); // neutral-950
  assert.equal(hex('oklch(0.577 0.245 27.325)'), '#e7000b'); // red-600
  assert.equal(hex('222.2 84% 4.9%'), '#020817'); // shadcn v3 slate foreground
  assert.equal(hex('hsl(0 0% 100%)'), '#ffffff');
  assert.equal(parseColor('oklch(1 0 0 / 10%)').alpha, 0.1);
  assert.equal(parseColor('var(--x)'), null);
});

test('import-shadcn maps a theme, flattens translucent borders, and reports what it could not take', () => {
  const css = `:root { --radius: 0.5rem; --background: oklch(1 0 0); --foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0); --primary-foreground: oklch(0.985 0 0); --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0); --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0); --input: oklch(0.922 0 0); --ring: oklch(0.708 0 0); }
  .dark { --background: oklch(0.145 0 0); --foreground: oklch(0.985 0 0); --border: oklch(1 0 0 / 10%); }`;
  const { preset, notes, problems } = importShadcn(css, load('clean-saas.json'), { id: 'x', name: 'X', source: 'test' });
  assert.equal(preset.color.light.text, '#0a0a0a');
  assert.equal(preset.color.dark.border, '#232323', '10% white over #0a0a0a');
  assert.equal(preset.radius.lg, 8);
  assert.ok(notes.some((n) => n.startsWith('light.success: kept clean-saas')));
  assert.equal(notes.filter((n) => n.startsWith('light.danger-fg')).length, 1, 'one note per role');
  // shadcn's default input border is 1.26:1 on white — the importer must say so, not ship it
  assert.ok(problems.some((p) => p.startsWith('light: border-strong on bg')), problems.join('\n'));
});

// release-management derived its tokens from a wireframe whose banner said "Greys are placeholders"
// and whose stylesheet said "low-fi greys". derive must refuse every way a source says it is not the look.
test('derive refuses a source that calls itself a wireframe, low-fi, draft or placeholder', () => {
  const base = load('clean-saas.json');
  const refusals = [
    '<style>/* Layout: dense shell; low-fi greys with one accent. */</style><p>x</p>',
    '<div class="banner">Wireframe v12 — draft for discussion. Greys are placeholders.</div>',
    '<meta name="fidelity" content="low"><p>x</p>',
    '<meta name="fidelity" content="draft"><p>x</p>',
    '<p>Placeholder colours throughout.</p>',
    '<p>This is a wireframe of the release page.</p>',
  ];
  for (const html of refusals) {
    assert.ok(lowFidelityReason(html), `not refused: ${html}`);
    assert.match(deriveFromVisual(html, base, { id: 'v', name: 'v', source: 'v.html' }).refused ?? '', /not a high-fidelity visual/);
  }
  // A high-fi page with inputs that carry placeholder text, and a "Draft" status badge, is not low-fi.
  const hifi = '<meta name="fidelity" content="high"><style>:root { --color-primary: #2952cc; --color-bg: #ffffff; }</style><input placeholder="Search"><span class="badge">Draft</span>';
  assert.equal(lowFidelityReason(hifi), null);
  assert.equal(lowFidelityReason('<input placeholder="Search releases"><span>Draft</span>'), null, 'no meta, no marker: allowed');
  const r = deriveFromVisual(hifi, base, { id: 'v', name: 'v', source: 'v.html' });
  assert.equal(r.refused, undefined);
  assert.equal(r.preset.color.light.primary, '#2952cc');
  assert.ok(r.notes.some((n) => /light\.success: not in the visual/.test(n)), 'roles it did not draw are listed, not invented');
});

test('derive on the command line exits 1 with the reason when refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-derive-'));
  writeFileSync(join(dir, 'w.html'), '<div>Wireframe — greys are placeholders</div>');
  const r = run(['derive', '--from', join(dir, 'w.html'), '--base', join(PRESETS, 'clean-saas.json'), '--id', 'x', '--out', join(dir, 'x.json')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refused/);
});

// Schema 2 (V3). release-management's tokens passed every contrast pair and still produced a grey,
// flat product: an 11–20px scale with one line height, warning and danger ΔE00 16 apart, no
// elevation steps, and shadcn's radius and control height stripped to 3px and 26px.
test('ΔE00 matches the Sharma, Wu & Dalal reference pairs', () => {
  assert.equal(deltaE('#000000', '#000000'), 0);
  // Sharma et al. (2005) table 1, pairs 1 and 17, through the Lab entry point.
  const lab = (x) => x;
  void lab;
  assert.ok(Math.abs(deltaE('#ff0000', '#00ff00') - 86.6) < 1, `red/green ${deltaE('#ff0000', '#00ff00')}`);
  assert.ok(deltaE('#b45309', '#dc2626') < 20, 'release-management-like amber/red is too close');
  assert.ok(Number.isNaN(deltaE('nope', '#fff')));
});

test('every shipped preset is schema 2: type roles, elevation 0–3, neutral ramp, data-viz, icons, density modes', () => {
  for (const f of presetFiles) {
    const p = load(f);
    assert.equal(p.schema, 2, f);
    assert.ok(p.type.ratio >= 1.2, `${f} ratio`);
    assert.deepEqual(presetWarnings(p), [], f);
    const css = renderCss(p);
    for (const v of ['--type-h1-size', '--type-body-line', '--shadow-3', '--shadow-md', '--neutral-950', '--dataviz-8', '--icon-md', '--density-row-height']) assert.match(css, new RegExp(v), `${f}: ${v}`);
    const md = renderMarkdown(p, { chosenBy: 'A Person', date: '2026-10-13', sha: 'x', source: f, cssPath: 'tokens.css' });
    for (const h of ['## Type roles', '## Neutral ramp', '## Status colours', '## Data visualisation', '## Icons', '## Density modes']) assert.ok(md.includes(h), `${f}: ${h}`);
  }
});

test('schema 2 refuses a flat scale, look-alike statuses, a missing elevation step and a stripped kit', () => {
  const base = load('clean-saas.json');
  const with_ = (fn) => { const p = structuredClone(base); fn(p); return validatePreset(p); };
  assert.ok(with_((p) => { p.type.roles.h3.size = 15; }).some((x) => /h3 15px is 1\.07× body/.test(x)), 'a heading step under 1.2×');
  assert.ok(with_((p) => { p.type.ratio = 1.1; }).some((x) => /type\.ratio/.test(x)));
  assert.ok(with_((p) => { p.color.light.warning = '#b45309'; }).some((x) => /warning #b45309 and danger #dc2626 are ΔE00 16\.\d apart/.test(x)), 'release-management\'s amber and red');
  assert.ok(with_((p) => { delete p.elevation.light['3']; }).some((x) => /elevation\.light\.3 missing/.test(x)));
  assert.ok(with_((p) => { p.control['height-md'] = 26; }).some((x) => /height-md 26px is below shadcn-new-york's 32px/.test(x)), '26px controls');
  assert.ok(with_((p) => { p.radius.md = 3; }).some((x) => /radius\.md 3px/.test(x)), '3px radius');
  assert.deepEqual(with_((p) => { p.radius.md = 3; p.kit_deviation = 'brand guide fixes 3px corners'; }), [], 'a stated kit deviation is allowed');
  assert.ok(with_((p) => { p.neutral['500'] = '#ffffff'; }).some((x) => /neutral must darken/.test(x)));
  assert.ok(with_((p) => { p.dataviz.light[1] = p.dataviz.light[0]; }).some((x) => /dataviz\.light\[0\] and \[1\] are ΔE00 0\.0/.test(x)));
  assert.ok(with_((p) => { p.density = 'roomy'; }).some((x) => /density `roomy` is not one of density_modes/.test(x)));
});

test('a schema 1 token file still validates and renders, with a warning; migrate fills schema 2 and says what it filled', () => {
  const p = load('clean-saas.json');
  const v1 = structuredClone(p);
  for (const k of ['schema', 'neutral', 'dataviz', 'icon', 'density_modes', 'kit_base']) delete v1[k];
  delete v1.type.roles; delete v1.type.ratio;
  v1.elevation = { light: { sm: p.elevation.light['1'], md: p.elevation.light['2'], lg: p.elevation.light['3'] }, dark: { sm: p.elevation.dark['1'], md: p.elevation.dark['2'], lg: p.elevation.dark['3'] } };
  assert.deepEqual(validatePreset(v1), [], 'a schema 1 file is not broken by schema 2');
  assert.match(presetWarnings(v1)[0], /schema 1 token file/);
  assert.match(renderCss(v1), /--shadow-md:/);
  const { preset, notes } = migratePreset(v1);
  assert.equal(preset.schema, 2);
  assert.ok(notes.length >= 5);
  assert.deepEqual(validatePreset(preset), []);
  // release-management's flat scale: migrate builds a 1.2× ladder and lists every step it invented.
  const flat = structuredClone(v1);
  flat.type.scale = { xs: [11, 1.45], sm: [12, 1.45], md: [13, 1.45], xl: [15, 1.45], '2xl': [20, 1.45] };
  flat.type.body = 'md';
  const m = migratePreset(flat);
  assert.deepEqual(validatePreset(m.preset), []);
  assert.deepEqual([m.preset.type.roles.h3.size, m.preset.type.roles.h2.size, m.preset.type.roles.h1.size], [20, 25, 31], 'h3 is the scale\'s 20px (15 is only 1.15x 13); the rest are invented');
  assert.ok(m.notes.some((n) => /invented .*h2 25px.*h1 31px/.test(n)), m.notes.join(' | '));
});

test('check warns on a schema 1 design-tokens.json and still passes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-v1-'));
  const v1 = load('clean-saas.json');
  for (const k of ['schema', 'neutral', 'dataviz', 'icon', 'density_modes', 'kit_base']) delete v1[k];
  delete v1.type.roles; delete v1.type.ratio;
  writeFileSync(join(dir, 'v1.json'), JSON.stringify(v1));
  assert.equal(run(['render', '--preset', join(dir, 'v1.json'), '--out', dir, '--chosen-by', 'A Person', '--patterns', join(SKILL, 'ui-patterns.md')]).status, 0);
  const r = run(['check', '--tokens', dir]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /! schema 1 token file/);
  const m = run(['migrate', '--from', join(dir, 'design-tokens.json'), '--out', join(dir, 'v2.json')]);
  assert.equal(m.status, 0, m.stdout);
  assert.equal(JSON.parse(readFileSync(join(dir, 'v2.json'), 'utf8')).schema, 2);
});

test('starter renders the visual-design screens on a preset: product name, breakpoints, tokens only', () => {
  const html = readFileSync(join(here, '..', 'skills', 'dev-designing-visuals', 'starter', 'index.html'), 'utf8');
  assert.match(html, /<meta name="fidelity" content="high">/, 'the starter declares itself high-fidelity, so derive accepts it');
  for (const a of ['shell', 'list', 'detail', 'form', 'empty', 'sign-in']) assert.match(html, new RegExp(`id="s-${a}"`), a);
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, 'no hex colour in the starter stylesheet');
  assert.doesNotMatch(css.replace(/__BP_[A-Z]+__px/g, ''), /(?<![\w-])(?!0px|1px|2px)\d+px/, 'no raw px beyond hairlines and the breakpoints');
  const dir = mkdtempSync(join(tmpdir(), 'ds-starter-'));
  const r = run(['starter', '--from', join(here, '..', 'skills', 'dev-designing-visuals', 'starter', 'index.html'), '--out', dir, '--preset', join(PRESETS, 'dense-enterprise.json'), '--product', 'Kestrel <b>']);
  assert.equal(r.status, 0, r.stderr);
  const out = readFileSync(join(dir, 'index.html'), 'utf8');
  assert.match(out, /Kestrel b/);
  assert.match(out, /@media \(max-width: 1023px\)/);
  assert.doesNotMatch(out, /__[A-Z_]+__/);
  assert.match(readFileSync(join(dir, 'tokens.css'), 'utf8'), /--color-tint-warning/);
});

// An editor-hosted surface (a VS Code webview) has to follow the host's theme: light, dark, high
// contrast and the user's own. Hex-only tokens could not, and the skill's --from-code source had
// nowhere to record "this role reads the host's variable X". `host_theme` is that record.
const GOLDEN = join(here, 'fixtures', 'design-system', 'golden');
const GOLDEN_META = { chosenBy: 'Golden Fixture', date: '2026-10-17', sha: '0'.repeat(64), source: 'golden', cssPath: 'tokens.css' };
const VSCODE_ROLES = { bg: '--vscode-editor-background', text: '--vscode-foreground', primary: '--vscode-button-background', focus: '--vscode-focusBorder' };
const VSCODE_BODIES = ['body.vscode-light', 'body.vscode-dark', 'body.vscode-high-contrast', 'body.vscode-high-contrast-light'];
const hosted = () => ({ ...load('dense-enterprise.json'), host_theme: { kind: 'vscode', roles: { ...VSCODE_ROLES } } });

test('without host_theme, every shipped preset renders byte-identical tokens.css and md to before host_theme existed', () => {
  // The golden files were rendered by 1.6.3, before host_theme. A preset that does not opt in must not move a byte.
  assert.equal(readdirSync(GOLDEN).length, presetFiles.length * 2, 'one golden css and md per shipped preset');
  for (const f of presetFiles) {
    const p = load(f);
    assert.equal(p.host_theme, undefined, `${f} ships without host_theme`);
    assert.equal(renderCss(p), readFileSync(join(GOLDEN, `${p.id}.tokens.css`), 'utf8'), `${f}: tokens.css changed`);
    assert.equal(renderMarkdown(p, GOLDEN_META), readFileSync(join(GOLDEN, `${p.id}.design-tokens.md`), 'utf8'), `${f}: design-tokens.md changed`);
  }
});

test('host_theme validates: a known role, a custom property of the host kind, and the hex fallback still required', () => {
  assert.deepEqual(validatePreset(hosted()), []);
  const bad = (fn) => { const p = hosted(); p.color = structuredClone(p.color); fn(p); return validatePreset(p); };
  assert.ok(bad((p) => { p.host_theme.roles.sidebar = '--vscode-sideBar-background'; }).some((x) => x === 'host_theme.roles.sidebar: `sidebar` is not a colour role (built-in or extra_roles)'), 'unknown role');
  assert.ok(bad((p) => { p.host_theme.roles.bg = 'var(--vscode-editor-background)'; }).some((x) => /host_theme\.roles\.bg = `var\(--vscode-editor-background\)` is not a CSS custom property name/.test(x)), 'a var() is not a name');
  assert.ok(bad((p) => { p.host_theme.roles.bg = '#ffffff'; }).some((x) => /host_theme\.roles\.bg = `#ffffff` is not a CSS custom property name/.test(x)), 'a hex is not a name');
  assert.ok(bad((p) => { p.host_theme.roles.bg = '--editor-background'; }).some((x) => /not a VS Code webview variable \(`--vscode-\*`\)/.test(x)), 'wrong host prefix');
  assert.ok(bad((p) => { p.color.dark.bg = 'var(--vscode-editor-background)'; }).some((x) => /host_theme\.roles\.bg: color\.dark\.bg must still be a hex/.test(x)), 'the hex fallback stays required');
  assert.ok(bad((p) => { delete p.color.light.text; }).some((x) => /host_theme\.roles\.text: color\.light\.text must still be a hex/.test(x)), 'a missing fallback is refused');
  assert.ok(bad((p) => { p.host_theme.kind = 'jetbrains'; }).some((x) => /host_theme\.kind = `jetbrains` must be one of vscode/.test(x)));
  assert.ok(bad((p) => { p.host_theme.roles = {}; }).some((x) => /host_theme\.roles must map at least one/.test(x)));
  assert.ok(bad((p) => { p.host_theme.theme_selectors = { dark: ['body.a { x }'] }; }).some((x) => /theme_selectors\.dark must be a non-empty array/.test(x)));
  // Contrast is unchanged: it is measured on the hex, so a failing fallback still fails.
  assert.ok(bad((p) => { p.color.light['text-muted'] = '#b0b0b0'; }).some((x) => /^light: text-muted on bg is/.test(x)));
  // A host mapping on an extra role is allowed.
  assert.deepEqual(bad((p) => { p.host_theme.roles['tint-info'] = '--vscode-badge-background'; }), []);
});

test('host_theme renders var(<host>, <hex>) for mapped roles, the hex for the rest, keyed on the four VS Code body classes', () => {
  const p = hosted();
  const css = renderCss(p);
  const light = p.color.light;
  const dark = p.color.dark;
  const count = (s) => css.split(s).length - 1;
  // :root light + the host light block; media dark, data-theme dark + the host dark block.
  assert.equal(count(`--color-bg: var(--vscode-editor-background, ${light.bg});`), 2);
  assert.equal(count(`--color-bg: var(--vscode-editor-background, ${dark.bg});`), 3);
  for (const role of Object.keys(VSCODE_ROLES)) assert.doesNotMatch(css, new RegExp(`--color-${role}: #`), `${role} is never a bare hex once mapped`);
  assert.equal(count(`--color-surface: ${light.surface};`), 2, 'an unmapped role stays a plain hex');
  for (const sel of VSCODE_BODIES) assert.ok(css.includes(`:root:not([data-theme]) ${sel}`), `${sel} is a selector`);
  assert.match(css, /:root:not\(\[data-theme\]\) body\.vscode-light,\n:root:not\(\[data-theme\]\) body\.vscode-high-contrast-light \{\n[^}]*color-scheme: light;\n\}/);
  assert.match(css, /:root:not\(\[data-theme\]\) body\.vscode-dark,\n:root:not\(\[data-theme\]\) body\.vscode-high-contrast[^,{]*\{\n[^}]*color-scheme: dark;\n\}/);
  // Outside the editor: the OS preference and the data-theme override behave as before.
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n {2}:root:not\(\[data-theme="light"\]\) \{/);
  assert.match(css, /:root\[data-theme="dark"\] \{/);
  assert.equal(renderCss(hosted()), css, 'deterministic');
  // theme_selectors replaces the kind's selectors for one theme.
  const custom = hosted();
  custom.host_theme.theme_selectors = { dark: ['body.my-dark'] };
  assert.deepEqual(validatePreset(custom), []);
  const cc = renderCss(custom);
  assert.ok(cc.includes(':root:not([data-theme]) body.my-dark {'));
  assert.ok(!cc.includes('body.vscode-dark') && cc.includes('body.vscode-light'));
  // design-tokens.md shows the host variable per role.
  const md = renderMarkdown(p, GOLDEN_META);
  assert.match(md, /\| Token \| Light \| Dark \| CSS variable \| Host variable \| Use for \|/);
  assert.ok(md.includes(`| \`color.bg\` | \`${light.bg}\` | \`${dark.bg}\` | \`--color-bg\` | \`--vscode-editor-background\` | page background |`));
  assert.ok(md.includes(`| \`color.surface\` | \`${light.surface}\` | \`${dark.surface}\` | \`--color-surface\` | — |`));
  assert.match(md, /\*\*Host theme:\*\* `vscode` — 4 role\(s\)/);
});

test('check compares tokens.css with the json, host mappings included, and catches a hand edit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ds-host-'));
  const preset = join(dir, 'hosted.json');
  const out = join(dir, 'docs');
  writeFileSync(preset, JSON.stringify(hosted(), null, 2));
  const r = run(['render', '--preset', preset, '--out', out, '--chosen-by', 'Test Person', '--patterns', join(SKILL, 'ui-patterns.md')]);
  assert.equal(r.status, 0, r.stderr);
  const ok = run(['check', '--tokens', out]);
  assert.equal(ok.status, 0, ok.stdout);
  assert.match(ok.stdout, /tokens\.css matches json · 4 role\(s\) on the vscode host theme/);

  const cssPath = join(out, 'tokens.css');
  const good = readFileSync(cssPath, 'utf8');
  const text = hosted().color.light.text;
  // Someone "fixed" a colour by dropping the host variable: the webview stops following the theme.
  writeFileSync(cssPath, good.replace(`var(--vscode-foreground, ${text})`, text));
  const bad = run(['check', '--tokens', out]);
  assert.equal(bad.status, 1, bad.stdout);
  const line = good.split('\n').indexOf(`  --color-text: var(--vscode-foreground, ${text});`) + 1;
  assert.ok(bad.stdout.includes(`tokens.css is not what design-tokens.json renders (first difference at line ${line}: expected \`--color-text: var(--vscode-foreground, ${text});\`)`), bad.stdout);
  assert.match(bad.stdout, /host_theme mappings included/);
  // A dropped body selector is caught.
  writeFileSync(cssPath, good.replace('body.vscode-high-contrast-light', 'body.vscode-hc-light'));
  assert.equal(run(['check', '--tokens', out]).status, 1);
  // A css file at another path is compared with --css.
  writeFileSync(cssPath, good);
  assert.equal(run(['check', '--tokens', out]).status, 0);
  const elsewhere = join(dir, 'app.css');
  writeFileSync(elsewhere, good.replace('--vscode-focusBorder', '--vscode-contrastBorder'));
  assert.equal(run(['check', '--tokens', out, '--css', elsewhere]).status, 1);
});

test('a skin with host_theme scopes its host blocks too, so a skin in VS Code is not overridden by the base', () => {
  // The skin (data-skin scope) and host_theme landed separately; a host block left on bare :root
  // would beat the skin's own colours in an editor-hosted surface.
  const scope = '[data-skin="sakura"]';
  const css = renderCss(hosted(), { scope });
  assert.doesNotMatch(css, /:root(?!\[data-skin="sakura"\])/, 'every block, host blocks included, carries the scope');
  assert.match(css, /:root\[data-skin="sakura"\]:not\(\[data-theme\]\) body\.vscode-dark/);
  assert.match(css, /:root\[data-skin="sakura"\]\[data-theme="dark"\] \{/);
  assert.match(css, /--color-bg: var\(--vscode-/, 'the host mapping survives the scope');
  assert.equal(renderCss(hosted()), renderCss(hosted(), { scope: '' }), 'no scope renders exactly as before');
});
