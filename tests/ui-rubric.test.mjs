/**
 * ui-rubric.mjs — every rule must be able to fail.
 *
 * The judgement is pure and tested on plain measurements. The live half renders the fixtures under
 * tests/fixtures/{valid,broken}/ui-rubric/ in a real browser: the valid pages must come out clean,
 * and each broken page must fail with exactly the rule it was built to break (release-management's
 * faults, one per page).
 * It is skipped where no Edge or Chrome is found.
 *
 *   node --test tests/ui-rubric.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { judge, parseArgs, runRubric, summarise, typeScale, HARD } from '../workspace/dev/scripts/ui-rubric.mjs';
import { findBrowser } from '../workspace/dev/scripts/ui-snap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PRESET = JSON.parse(readFileSync(join(here, '..', 'skills', 'dev-defining-design-system', 'presets', 'clean-saas.json'), 'utf8'));
let liveBrowser = null;
try { liveBrowser = findBrowser(); } catch { liveBrowser = null; }

const clean = () => ({ viewport: 1024, scrollWidth: 1024, clipped: [], primaries: [{ view: 'page', count: 1, labels: ['button "New"'] }], fonts: { 14: ['p'], 28: ['h1'] }, spacing: { 8: ['x'], 16: ['y'] }, nesting: [], wrappingLinks: [], statuses: [], headings: { h1: 28 }, bodySize: 14 });
const rules = (findings) => findings.map((f) => f.rule).sort();

test('judge: a clean measurement has no findings', () => {
  assert.deepEqual(judge(clean(), { scale: [12, 14, 28] }), []);
});

test('judge: overflow, clipped cells and two primaries are hard fails; the rest advisory', () => {
  const m = clean();
  m.scrollWidth = 1400;
  m.clipped = ['td "x"'];
  m.primaries = [{ view: 'page', count: 2, labels: ['a', 'b'] }, { view: 'dialog', count: 1, labels: ['c'] }];
  const f = judge(m);
  assert.deepEqual(rules(f), ['clipped-column', 'overflow', 'primary-count']);
  assert.ok(f.every((x) => x.level === 'fail'));
  assert.deepEqual(HARD, ['overflow', 'clipped-column', 'primary-count', 'axe-serious', 'target-size', 'focus-obscured']);
});

test('judge: off-scale type, off-grid spacing, deep nesting, wrapping links, close statuses and a flat heading are advisory', () => {
  const m = clean();
  m.fonts[13] = ['td'];
  m.spacing[13] = ['div paddingTop'];
  m.spacing[6] = ['div gap'];
  m.nesting = [{ depth: 4, el: 'div.card' }];
  m.wrappingLinks = ['a "long"'];
  m.statuses = [{ status: 'warning', color: 'rgb(180, 83, 9)' }, { status: 'danger', color: 'rgb(220, 38, 38)' }];
  m.headings = { h1: 15 };
  const f = judge(m, { scale: [12, 14, 28], space: [0, 4, 6, 8] });
  assert.deepEqual(rules(f), ['heading-ratio', 'nesting', 'space-off-grid', 'status-delta-e', 'type-off-scale', 'wrapping-link']);
  assert.ok(f.every((x) => x.level === 'advisory'));
  assert.match(f.find((x) => x.rule === 'space-off-grid').message, /13px/);
  assert.doesNotMatch(f.find((x) => x.rule === 'space-off-grid').message, /6px/, 'a token space step is allowed off the 4px grid');
  assert.equal(summarise([{ findings: f }]).fails, 0);
});

test('typeScale reads schema 1 scale steps and schema 2 roles', () => {
  const s = typeScale(PRESET);
  for (const px of [12, 14, 28, 36]) assert.ok(s.includes(px), `${px}`);
  assert.equal(typeScale(null), null);
});

test('parseArgs: name=url pairs, file paths become file:// URLs, widths default to 1024, 768 and 360', () => {
  const o = parseArgs(['--url', 'a=tests/x.html', '--url', 'b=http://localhost/b']);
  assert.match(o.urls[0].url, /^file:\/\//);
  assert.equal(o.urls[1].url, 'http://localhost/b');
  assert.deepEqual(o.widths, [1024, 768, 360]);
  assert.equal(parseArgs(['--url', 'a=http://x', '--pseudo']).pseudo, true);
  assert.throws(() => parseArgs([]), /--url/);
  assert.throws(() => parseArgs(['--url', 'nourl']), /name=url/);
  assert.deepEqual(parseArgs(['--url', 'a=http://x', '--widths', 'lg'], { tokens: { breakpoints: { lg: 1024 } } }).widths, [1024]);
});

// Each broken page breaks one rule; the valid pages break none. A rubric that passes its own
// counter-examples does not work (CONTRIBUTING, Tests). One page per design-checklist row.
const VALID = join(here, 'fixtures', 'valid', 'ui-rubric');
const BROKEN = join(here, 'fixtures', 'broken', 'ui-rubric');
const EXPECT = {
  'two-primaries': { 1024: ['primary-count'], 360: ['primary-count'] },
  overflow: { 1024: ['overflow'], 360: ['overflow'] },
  clipped: { 1024: ['clipped-column'], 360: ['clipped-column'] },
  'status-close': { 1024: ['status-delta-e'], 360: ['status-delta-e'] },
  'flat-nested': { 1024: ['heading-ratio', 'nesting', 'space-off-grid', 'type-off-scale'], 360: ['heading-ratio', 'nesting', 'space-off-grid', 'type-off-scale'] },
  'wrapping-link': { 1024: ['wrapping-link'], 360: ['wrapping-link'] },
  'numbers-left': { 1024: ['numeric-alignment'], 360: ['numeric-alignment'] },
  'status-colour-only': { 1024: ['status-encoding'], 360: ['status-encoding'] },
  'empty-blank': { 1024: ['empty-state'], 360: ['empty-state'] },
  'sign-in-unbranded': { 1024: ['auth-branding'], 360: ['auth-branding'] },
  'header-crowded': { 1024: [], 360: ['header-actions'] },
  'crushed-column': { 1024: ['crushed-column'], 360: ['crushed-column'] },
  // §13.13: WCAG 2.2 target size and focus not obscured are hard; rendering rules advisory
  'small-targets': { 1024: ['target-size'], 360: ['target-size'] },
  'focus-obscured': { 1024: ['focus-obscured'], 360: ['focus-obscured'] },
  'long-list': { 1024: ['long-list'], 360: ['long-list'] },
  'image-assets': { 1024: ['image-assets'], 360: ['image-assets'] },
  'motion-reduce': { 1024: ['motion-reduce'], 360: ['motion-reduce'] },
  // clean as written; clipped once the text is 40% longer (the pseudo-locale test below)
  'pseudo-truncation': { 1024: [], 360: [] },
};

test('live: the valid pages are clean and every broken page fails with exactly its rule', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 240_000 }, async () => {
  const urls = [
    ...readdirSync(VALID).map((f) => ({ name: `valid/${f}`, url: pathToFileURL(join(VALID, f)).href })),
    ...Object.keys(EXPECT).map((n) => ({ name: n, url: pathToFileURL(join(BROKEN, `${n}.html`)).href })),
  ];
  assert.deepEqual(readdirSync(BROKEN).map((f) => f.replace(/\.html$/, '')).sort(), Object.keys(EXPECT).sort(), 'every broken page has an expectation');
  const results = await runRubric({ urls, widths: [1024, 360], height: 900, wait: 3000, tokens: PRESET, primary: parseArgs(['--url', 'x=http://x']).primary, status: '[data-status]' });
  for (const r of results) {
    const want = r.name.startsWith('valid/') ? [] : EXPECT[r.name][r.width];
    assert.deepEqual([...new Set(rules(r.findings))], want, `${r.name} @${r.width}: ${r.findings.map((f) => f.message).join(' | ')}`);
  }
});

test('judge: target size and focus obscured are hard fails; long lists, images and motion advisory', () => {
  const m = clean();
  m.smallTargets = ['button 16×16'];
  m.obscured = ['a under div.bar'];
  m.longLists = ['tbody 240 rows'];
  m.images = ['img — no width/height'];
  m.moving = ['span animation spin 1s'];
  const f = judge(m);
  assert.deepEqual(f.filter((x) => x.level === 'fail').map((x) => x.rule).sort(), ['focus-obscured', 'target-size']);
  assert.deepEqual(f.filter((x) => x.level === 'advisory').map((x) => x.rule).sort(), ['image-assets', 'long-list', 'motion-reduce']);
});

test('live: the pseudo-locale run clips the cell that fits in English, and leaves the valid pages clean', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const urls = [
    { name: 'tight', url: pathToFileURL(join(BROKEN, 'pseudo-truncation.html')).href },
    ...readdirSync(VALID).map((f) => ({ name: `valid/${f}`, url: pathToFileURL(join(VALID, f)).href })),
  ];
  const results = await runRubric({ urls, widths: [1024, 360], height: 900, wait: 3000, tokens: PRESET, primary: parseArgs(['--url', 'x=http://x']).primary, status: '[data-status]', pseudo: true });
  for (const r of results) {
    assert.ok(r.name.endsWith('~pseudo') && r.pseudo);
    assert.deepEqual([...new Set(rules(r.findings))], r.name.startsWith('tight') ? ['clipped-column'] : [], `${r.name} @${r.width}`);
  }
});

// V2: the visual-design starter, rendered on a preset, is the look reference G7 builds to. It must
// itself pass the checklist it asks of the product, at every width, on more than one preset.
test('live: the visual-design starter passes the rubric on clean-saas and dense-enterprise, every archetype, 1440/1024/768/360', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 300_000 }, async () => {
  const { renderStarter, renderCss } = await import('../workspace/dev/scripts/design-system.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const starter = readFileSync(join(here, '..', 'skills', 'dev-designing-visuals', 'starter', 'index.html'), 'utf8');
  for (const id of ['clean-saas', 'dense-enterprise']) {
    const p = JSON.parse(readFileSync(join(here, '..', 'skills', 'dev-defining-design-system', 'presets', `${id}.json`), 'utf8'));
    const dir = mkdtempSync(join(tmpdir(), `starter-${id}-`));
    writeFileSync(join(dir, 'index.html'), renderStarter(starter, p, { product: 'Kestrel' }));
    writeFileSync(join(dir, 'tokens.css'), renderCss(p));
    assert.doesNotMatch(readFileSync(join(dir, 'index.html'), 'utf8'), /__[A-Z_]+__/, 'every placeholder filled');
    const urls = ['shell', 'list', 'detail', 'form', 'empty', 'sign-in'].map((s) => ({ name: s, url: `${pathToFileURL(join(dir, 'index.html')).href}#${s}` }));
    const results = await runRubric({ urls, widths: [1440, 1024, 768, 360], height: 900, wait: 3000, tokens: p, primary: parseArgs(['--url', 'x=http://x']).primary, status: '[data-status]' });
    const findings = results.flatMap((r) => r.findings.map((f) => `${id} ${r.name} @${r.width} ${f.rule}: ${f.message}`));
    assert.deepEqual(findings, [], findings.join('\n'));
  }
});

// axe-core (§13.3): serious and critical are hard fails, moderate and minor advisory, and with no
// axe-core the run says NOT RUN instead of passing silently.
test('judge: axe serious/critical are hard fails, moderate and minor advisory', () => {
  const m = clean();
  m.axe = [{ id: 'label', impact: 'critical', help: 'Form elements must have labels', nodes: ['input'] }, { id: 'color-contrast', impact: 'serious', help: 'contrast', nodes: ['p'] }, { id: 'region', impact: 'moderate', help: 'landmarks', nodes: ['div'] }, { id: 'x', impact: 'minor', help: 'minor', nodes: [] }];
  const f = judge(m);
  assert.deepEqual(f.map((x) => `${x.level}:${x.rule}`), ['fail:axe-serious', 'fail:axe-serious', 'advisory:axe-moderate', 'advisory:axe-moderate']);
  assert.ok(HARD.includes('axe-serious'));
});

test('findAxe: --axe wins; a missing install is a reason, not a throw', async () => {
  const { findAxe } = await import('../workspace/dev/scripts/ui-rubric.mjs');
  const { tmpdir } = await import('node:os');
  assert.match(findAxe({ path: join(here, 'fixtures', 'ui-a11y', 'axe-stub.js') }).source, /window\.axe/);
  const none = findAxe({ from: tmpdir() });
  assert.equal(none.source, null);
  assert.match(none.reason, /npm i -D axe-core/);
  assert.match(findAxe({ path: join(tmpdir(), 'no-such-axe.js') }).reason, /does not exist/);
  assert.match(summarise([{ findings: [], axe: 'not-run', axeReason: none.reason }]).line, /axe: NOT RUN — axe-core is not installed/);
  assert.match(summarise([{ findings: [], axe: 'run' }]).line, /axe: run/);
});

const A11Y = join(here, 'fixtures', 'broken', 'ui-a11y');
test('live: an injected axe build runs on every page view, and a critical result fails the page', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const urls = [{ name: 'good', url: pathToFileURL(join(VALID, 'good.html')).href }];
  const results = await runRubric({ urls, widths: [1024], height: 900, wait: 3000, tokens: PRESET, primary: parseArgs(['--url', 'x=http://x']).primary, status: '[data-status]', axePath: join(here, 'fixtures', 'ui-a11y', 'axe-stub.js') });
  assert.deepEqual(results[0].findings.map((f) => `${f.level}:${f.rule}`), ['fail:axe-serious', 'advisory:axe-moderate']);
  assert.equal(results[0].axe, 'run');
  assert.equal(summarise(results).fails, 1);
});

// The real axe-core: AXE_CORE_PATH, else a project install above the working directory. The bundle
// does not ship it; this runs wherever a developer or CI has it.
let realAxe = process.env.AXE_CORE_PATH ?? null;
if (!realAxe) {
  const { findAxe } = await import('../workspace/dev/scripts/ui-rubric.mjs');
  realAxe = findAxe().path ?? null;
}
test('live: real axe-core passes the valid pages and hard-fails the page built with violations', { skip: (!liveBrowser && 'no Edge or Chrome found') || (!realAxe && 'axe-core not installed — set AXE_CORE_PATH to an axe.min.js'), timeout: 180_000 }, async () => {
  const urls = [
    ...readdirSync(VALID).map((f) => ({ name: `valid/${f}`, url: pathToFileURL(join(VALID, f)).href })),
    { name: 'axe-violations', url: pathToFileURL(join(A11Y, 'axe-violations.html')).href },
  ];
  const results = await runRubric({ urls, widths: [1024, 360], height: 900, wait: 3000, tokens: PRESET, primary: parseArgs(['--url', 'x=http://x']).primary, status: '[data-status]', axePath: realAxe });
  for (const r of results) {
    const axe = r.findings.filter((f) => f.rule.startsWith('axe-')).map((f) => f.message.split(' (')[0]).sort();
    if (r.name.startsWith('valid/')) assert.deepEqual(axe, [], `${r.name} @${r.width}`);
    else assert.deepEqual(axe, ['axe button-name', 'axe color-contrast', 'axe image-alt', 'axe label'], `${r.name} @${r.width}`);
  }
  assert.ok(summarise(results).fails >= 8);
});
