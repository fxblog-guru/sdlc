/**
 * brand.mjs: a product's brand as code (DEV-CONTRACTS §13.3, brand slots). One brand.json is
 * validated, held to WCAG AA in both themes, and drawn into every slot file a screen references,
 * so a brand chosen later is a rebuild into the same paths.
 *
 *   node --test tests/brand.test.mjs
 *   node tests/mutate.mjs brand        (each rule disabled in turn must fail this file)
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const url = (...p) => pathToFileURL(join(...p)).href;
const SCRIPTS = join(here, '..', 'workspace', 'dev', 'scripts');
const B = await import(url(SCRIPTS, 'brand.mjs'));
const { findBrowser } = await import(url(SCRIPTS, 'ui-snap.mjs'));
const { contrast } = await import(url(SCRIPTS, 'design-system.mjs'));

let liveEdge = null;
try { liveEdge = findBrowser({ exists: (p) => /edge/i.test(p) && existsSync(p) }); } catch { liveEdge = null; }

const GOOD = () => ({
  name: 'Larkspur',
  tagline: 'Field service scheduling that crews actually trust',
  colors: { primary: '#3f6fd8', accent: '#b8690a', ink: '#16213a', muted: '#5a6478', paper: '#ffffff', bg: '#f6f8fc' },
  mark: { style: 'tile' },
});

// ---- brand.json -------------------------------------------------------------------------------

test('validate: a complete brand.json has no problems and passes AA in both themes', () => {
  assert.deepEqual(B.validateBrand(GOOD()), []);
  assert.deepEqual(B.contrastProblems(GOOD()), []);
});

test('validate: each missing or malformed field is named', () => {
  const v = (mut) => { const b = GOOD(); mut(b); return B.validateBrand(b).join('\n'); };
  assert.match(v((b) => { delete b.name; }), /name is required/);
  assert.match(v((b) => { b.tagline = ''; }), /tagline is required/);
  assert.match(v((b) => { b.tagline = 'x'.repeat(91); }), /longer than 90/);
  assert.match(v((b) => { b.colors.primary = 'blue'; }), /colors\.primary = `blue` is not a #rrggbb hex/);
  assert.match(v((b) => { delete b.colors.bg; }), /colors\.bg/);
  assert.match(v((b) => { b.colors.brandish = '#000000'; }), /colors\.brandish is not a brand colour/);
  assert.match(v((b) => { b.logo = 'x.svg'; }), /unknown key `logo`/);
  assert.match(v((b) => { b.mark.style = 'owl'; }), /mark\.style `owl`/);
  assert.match(v((b) => { b.dark = { bg: 'nope' }; }), /dark\.bg = `nope`/);
});

test('validate: a font must exist and carry an OFL-like licence, because its letters ship in the logo', () => {
  const font = join(SCRIPTS, 'lib', 'fonts', 'nunito-700.woff');
  const ok = { ...GOOD(), fonts: { display: { file: font, license: 'OFL-1.1' } } };
  assert.deepEqual(B.validateBrand(ok), []);
  assert.match(B.validateBrand({ ...GOOD(), fonts: { display: { file: font, license: 'Proprietary, desktop use only' } } }).join(), /must be OFL-like/);
  assert.match(B.validateBrand({ ...GOOD(), fonts: { display: { file: 'missing.ttf', license: 'OFL-1.1' } } }).join(), /does not exist/);
});

// ---- contrast: the check must fail when it should --------------------------------------------

test('contrast: a light accent on a light page fails at 3:1 and is moved within its hue, never the bar', () => {
  const b = GOOD();
  b.colors.accent = '#f2a541';
  const probs = B.contrastProblems(b);
  assert.equal(probs.length, 1, JSON.stringify(probs));
  const [p] = probs;
  assert.deepEqual([p.theme, p.fg, p.bg, p.need], ['light', 'accent', 'bg', 3]);
  assert.ok(p.ratio < 3);
  assert.ok(contrast(p.to, b.colors.bg) >= 3, 'the suggested shade passes');
  const hue = (hex) => Math.round(B.rgbToHsl(hex.match(/\w\w/g).map((h) => parseInt(h, 16)))[0]);
  assert.ok(Math.abs(hue(p.to) - hue('#f2a541')) <= 2, 'same hue');
  const { brand, changes } = B.applyAdjustments(b);
  assert.deepEqual(B.contrastProblems(brand), []);
  assert.equal(changes.length, 1);
  assert.match(brand.adjusted[0], /colors\.accent #f2a541 → #/);
});

test('contrast: text below 4.5:1 fails, a mark below 3:1 fails, white on a pale primary fails', () => {
  const at = (mut) => { const b = GOOD(); mut(b); return B.contrastProblems(b).map((p) => `${p.theme}:${p.fg}/${p.bg}`); };
  assert.ok(at((b) => { b.colors.muted = '#7a8396'; }).includes('light:muted/bg'), 'a tagline at 3.6:1 passes for a shape, not for text');
  assert.ok(at((b) => { b.colors.ink = '#7d8696'; }).includes('light:ink/bg'));
  assert.ok(at((b) => { b.colors.primary = '#a9c1f5'; }).includes('light:paper/primary'), 'white letter on a pastel tile');
  assert.ok(at((b) => { b.dark = { primary: '#1d2a48' }; }).includes('dark:primary/bg'), 'a dark override is held to the bar as given');
  assert.ok(at((b) => { b.colors.ink = '#c0c0c0'; }).includes('light:ink/paper'));
});

test('contrast: the dark palette is derived to pass, and the pairs cover both themes', () => {
  const { dark } = B.palettes(GOOD());
  assert.equal(dark.bg, GOOD().colors.ink);
  for (const p of B.pairsFor('dark')) assert.ok(contrast(dark[p.fg], dark[p.bg]) >= p.need, `${p.fg} on ${p.bg}`);
  assert.ok(B.pairsFor('light').length >= 6 && B.pairsFor('dark').length >= 5);
});

// ---- drawing ----------------------------------------------------------------------------------

test('the mark: letters are outlined paths, no <text>, no font needed; the small mark is its own drawing', () => {
  const fonts = B.brandFonts(GOOD());
  const files = B.vectorFiles(GOOD(), fonts);
  for (const [rel, svg] of Object.entries(files).filter(([f]) => f.endsWith('.svg'))) {
    assert.doesNotMatch(svg, /<text\b|font-family/, `${rel} draws letters as paths`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ \d+"/, rel);
  }
  assert.notEqual(files['logo/mark.svg'], files['logo/mark-small.svg'], 'a simplified drawing, not the big one scaled');
  for (const style of B.STYLES) assert.notEqual(B.markBody(GOOD(), fonts, { style }), B.markBody(GOOD(), fonts, { style, small: true }), style);
  assert.match(files['brand.css'], /--brand-primary: #3f6fd8;[\s\S]*prefers-color-scheme: dark[\s\S]*:root\[data-theme="dark"\]/);
  const m = JSON.parse(files['icons/site.webmanifest']);
  assert.equal(m.name, 'Larkspur');
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('the font reader outlines a string and refuses what it cannot read', async () => {
  const { loadFont } = await import(url(SCRIPTS, 'lib', 'font.mjs'));
  const f = loadFont(join(SCRIPTS, 'lib', 'fonts', 'nunito-700.woff'));
  const o = f.outline('Ag', 100);
  assert.ok(o.width > 100 && o.width < 140, `width ${o.width}`);
  assert.match(o.d, /^M[\d.\- ]+/);
  assert.equal((o.d.match(/Z/g) ?? []).length >= 3, true, 'A has two contours, g at least one');
  const dir = mkdtempSync(join(tmpdir(), 'font-'));
  writeFileSync(join(dir, 'x.woff2'), Buffer.from('wOF2xxxxxxxxxxxxxxxx'));
  assert.throws(() => loadFont(join(dir, 'x.woff2')), /woff2/);
  assert.ok(readFileSync(join(SCRIPTS, 'lib', 'fonts', 'OFL.txt'), 'utf8').includes('SIL Open Font License'), 'the bundled font ships its licence');
});

test('a glyph the font lacks fails the build instead of drawing a hole', async () => {
  const out = mkdtempSync(join(tmpdir(), 'brand-'));
  await assert.rejects(B.buildKit({ ...GOOD(), name: 'Café 線' }, { out, svgOnly: true }), /no glyph for "線"/);
});

test('the placeholder kit has the real kit\'s file names, so a later brand swaps files, not screens', async () => {
  const out = mkdtempSync(join(tmpdir(), 'brand-ph-'));
  assert.equal(await B.main(['placeholder', '--name', 'Acme', '--out', out, '--svg-only']), 0);
  const ph = JSON.parse(readFileSync(join(out, 'brand.json'), 'utf8'));
  assert.equal(ph.placeholder, true);
  assert.deepEqual(B.validateBrand(ph), []);
  assert.deepEqual(B.contrastProblems(ph), []);
  for (const s of B.SLOTS.filter((x) => !x.raster)) assert.ok(existsSync(join(out, s.file)), s.file);
  assert.match(readFileSync(join(out, 'README.md'), 'utf8'), /Placeholder brand/);
  const missing = await B.checkKit(out);
  assert.deepEqual(missing.map((m) => m.split(':')[0]).sort(), B.SLOTS.filter((x) => x.raster).map((x) => x.file).sort(), 'check names exactly the raster files an --svg-only build skipped');
});

test('the CLI: build refuses a failing palette unless --adjust, which rewrites brand.json and lists the change', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-cli-'));
  const b = GOOD();
  b.colors.accent = '#f2a541';
  writeFileSync(join(dir, 'brand.json'), JSON.stringify(b));
  assert.equal(await B.main(['validate', '--brand', join(dir, 'brand.json')]), 1);
  assert.equal(await B.main(['build', '--brand', join(dir, 'brand.json'), '--svg-only']), 1);
  assert.ok(!existsSync(join(dir, 'logo', 'mark.svg')), 'nothing written for a palette that fails');
  assert.equal(await B.main(['build', '--brand', join(dir, 'brand.json'), '--svg-only', '--adjust']), 0);
  const after = JSON.parse(readFileSync(join(dir, 'brand.json'), 'utf8'));
  assert.notEqual(after.colors.accent, '#f2a541');
  assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /Adjusted within the hue/);
  assert.equal(await B.main(['validate', '--brand', join(dir, 'brand.json')]), 0);
  assert.equal(await B.main(['concepts', '--brand', join(dir, 'brand.json'), '--svg-only']), 0);
  assert.equal((readFileSync(join(dir, 'concepts.html'), 'utf8').match(/<h2/g) ?? []).length, B.STYLES.length, 'every direction on one sheet');
  assert.equal(await B.main(['build']), 2);
});

test('Edge only: a --browser that is not Edge is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-edge-'));
  writeFileSync(join(dir, 'brand.json'), JSON.stringify(GOOD()));
  assert.equal(await B.main(['build', '--brand', join(dir, 'brand.json'), '--browser', 'C:/Program Files/Google/Chrome/Application/chrome.exe']), 1);
});

test('live: every slot file is produced, every PNG at its size and not blank, the ICO holds 16/32/48', { skip: !liveEdge && 'no Edge found', timeout: 180_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'brand-live-'));
  writeFileSync(join(dir, 'brand.json'), JSON.stringify(GOOD()));
  assert.equal(await B.main(['build', '--brand', join(dir, 'brand.json')]), 0);
  assert.deepEqual(await B.checkKit(dir), []);
  for (const s of B.SLOTS) assert.ok(existsSync(join(dir, s.file)), s.file);
  const icoBuf = readFileSync(join(dir, 'icons', 'favicon.ico'));
  assert.equal(icoBuf.readUInt16LE(4), 3);
  assert.deepEqual([0, 1, 2].map((i) => icoBuf[6 + i * 16]), [16, 32, 48]);
  assert.ok(B.pngSize(readFileSync(join(dir, 'preview.png')))[1] > 1000, 'a preview sheet with everything on it');
});
