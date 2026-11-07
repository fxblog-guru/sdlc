/**
 * design-system.mjs preview — the reference shots a person chooses a preset by.
 *
 * The starter page is generated from a preset's tokens alone, so it must be deterministic: the same
 * preset gives the same bytes, and the page committed beside the shots is the one the generator
 * makes today. When a preset changes, this test says its shots are stale; when a shot is missing,
 * it says which. The PNG optimiser is held to a round trip (same size, colours close) and to being
 * smaller than what the browser wrote. The live half re-renders one preset in a real browser and
 * holds it to ui-rubric's hard rules; it is skipped where no Edge or Chrome is found.
 *
 *   node --test tests/design-preview.test.mjs
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { test } from 'node:test';
import { presetStarter } from '../workspace/dev/scripts/design-system.mjs';
import { shotProblems, shotName, SHOT_WIDTHS } from '../workspace/dev/scripts/lib/starter.mjs';
import { decodePng, optimisePng, quantise } from '../workspace/dev/scripts/lib/png.mjs';
import { findBrowser } from '../workspace/dev/scripts/ui-snap.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, '..', 'workspace', 'dev', 'scripts', 'design-system.mjs');
const PRESETS = join(here, '..', 'skills', 'dev-defining-design-system', 'presets');
const SHOTS = join(PRESETS, 'shots');
const presets = readdirSync(PRESETS).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(PRESETS, f), 'utf8')));
let liveBrowser = null;
try { liveBrowser = findBrowser(); } catch { liveBrowser = null; }

test('the starter page is deterministic and built from tokens only', () => {
  for (const p of presets) {
    const a = presetStarter(p);
    assert.equal(a, presetStarter(structuredClone(p)), `${p.id}: two runs differ`);
    assert.doesNotMatch(a, /https?:\/\//, `${p.id}: the page reaches the network`);
    assert.doesNotMatch(a, /<script|<link /, `${p.id}: the page loads something`);
    for (const part of ['data-variant="primary"', 'data-status="success"', 'data-status="warning"', 'data-status="danger"', 'data-status="info"', 'data-empty', '<table', '<form', 'class="stats"', `data-shell="${p.shell}"`]) {
      assert.ok(a.includes(part), `${p.id}: the starter page has no ${part}`);
    }
    assert.equal(a.match(/data-variant="primary"/g).length, 1, `${p.id}: one primary action, not more`);
  }
  assert.notEqual(presetStarter(presets[0]), presetStarter(presets[1]), 'two presets draw two different pages');
});

test('every preset has current reference shots at both widths', () => {
  assert.deepEqual(shotProblems(SHOTS, presets, presetStarter), []);
  const manifest = JSON.parse(readFileSync(join(SHOTS, 'manifest.json'), 'utf8'));
  let total = 0;
  for (const p of presets) {
    const e = manifest.presets[p.id];
    assert.equal(e.rubric.hard_fails, 0, `${p.id}: its starter page fails ui-rubric's hard rules`);
    for (const w of SHOT_WIDTHS) {
      const size = statSync(join(SHOTS, shotName(p.id, w))).size;
      assert.equal(e.shots[w], size, `${p.id}@${w}: manifest.json records ${e.shots[w]} bytes, the file is ${size}`);
      assert.ok(size < 150 * 1024, `${p.id}@${w}: ${size} bytes — re-run preview, which optimises`);
      const { width } = decodePng(readFileSync(join(SHOTS, shotName(p.id, w))));
      assert.equal(width, w, `${p.id}@${w}: the picture is ${width}px wide`);
      total += size;
    }
  }
  assert.ok(total < 1.5 * 1024 * 1024, `the shots total ${total} bytes; the budget is 1.5 MB`);
  assert.equal(manifest.total_bytes, total);
});

test('a missing shot, a missing page or a changed preset is reported, by name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preset-shots-'));
  try {
    cpSync(SHOTS, dir, { recursive: true });
    rmSync(join(dir, shotName('clean-saas', 360)));
    rmSync(join(dir, 'editorial.html'));
    const changed = presets.map((p) => (p.id === 'field-mobile' ? { ...p, color: { ...p.color, light: { ...p.color.light, primary: '#0b5e55' } } } : p));
    const problems = shotProblems(dir, changed, presetStarter);
    assert.ok(problems.some((x) => x.startsWith('clean-saas: no shot at 360px')), problems.join('\n'));
    assert.ok(problems.some((x) => x.startsWith('editorial: no starter page')), problems.join('\n'));
    assert.ok(problems.some((x) => x.startsWith('field-mobile: the starter page is stale')), problems.join('\n'));
    assert.ok(!problems.some((x) => x.startsWith('carbon-enterprise')), 'an untouched preset is not reported');
    rmSync(join(dir, 'manifest.json'));
    assert.ok(shotProblems(dir, presets, presetStarter).some((x) => x.includes('manifest.json is missing')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A truecolour PNG of `w`×`h` from `px(x, y) → [r, g, b]`, written the way a browser does. */
function rgbPng(w, h, px) {
  const chunk = (kind, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(kind, 'latin1'), body])) >>> 0);
    return Buffer.concat([len, Buffer.from(kind, 'latin1'), body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) raw.set(px(x, y), y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

test('optimisePng: same size, flat colours exact, gradients close, smaller, deterministic', () => {
  const flat = rgbPng(64, 32, (x) => (x < 32 ? [255, 255, 255] : [79, 70, 229]));
  const a = decodePng(optimisePng(flat));
  assert.deepEqual([a.width, a.height], [64, 32]);
  assert.deepEqual(a.rgb, decodePng(flat).rgb, 'two colours come back exactly');
  const grad = rgbPng(256, 64, (x, y) => [x, (x + y * 3) & 255, 255 - x]);
  const small = optimisePng(grad);
  const back = decodePng(small).rgb;
  const orig = decodePng(grad).rgb;
  let worst = 0;
  for (let i = 0; i < orig.length; i += 1) worst = Math.max(worst, Math.abs(orig[i] - back[i]));
  assert.ok(worst <= 40, `a channel moved ${worst} levels`);
  assert.ok(quantise(orig).palette.length <= 256);
  assert.ok(small.length < grad.length, `${small.length} >= ${grad.length}`);
  assert.deepEqual(optimisePng(grad), small, 'the same picture gives the same bytes');
});

test('preview: refuses an unknown preset and needs its two directories', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'preview', 'no-such', '--presets', PRESETS, '--out', join(tmpdir(), 'x')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no preset no-such/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, 'preview'], { encoding: 'utf8' }).status, 2);
});

test('live: preview shoots a preset at both widths and its page passes the hard rules', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, () => {
  const out = mkdtempSync(join(tmpdir(), 'preset-preview-'));
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const r = spawnSync(process.execPath, [SCRIPT, 'preview', 'dense-enterprise', '--presets', PRESETS, '--out', out], { encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok {3}dense-enterprise .* 0 hard fail/);
    for (const w of SHOT_WIDTHS) assert.ok(statSync(join(out, shotName('dense-enterprise', w))).size > 1000);
    assert.equal(readFileSync(join(out, 'dense-enterprise.html'), 'utf8'), readFileSync(join(SHOTS, 'dense-enterprise.html'), 'utf8'), 'the committed page is what preview writes');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
