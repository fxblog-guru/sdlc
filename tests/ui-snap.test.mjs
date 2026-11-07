/**
 * ui-snap.mjs — argument parsing, screen discovery, the shot plan and compare.html.
 *
 * The browser is driven over a DevTools pipe; `takeShot` is tested against a scripted fake of it,
 * the rest is pure. One live test shoots a real page, and is skipped where no Edge or Chrome is found.
 *
 *   node --test tests/ui-snap.test.mjs
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { blankColours, browserArgs, deadLinks, discoverScreens, findBrowser, judgeShot, parseArgs, planShots, renderCompare, takeShot } from '../workspace/dev/scripts/ui-snap.mjs';

const WIRE = `<!doctype html><html><body>
<nav id="sidebar"></nav>
<section class="screen" id="s-login" data-auth="1">a</section>
<section class="screen on" id="s-projects">b</section>
<section id="s-not-a-screen">c</section>
<div class="screen" id="s-release">d</div>
</body></html>`;

test('parseArgs reads name=url pairs, widths, a reference and a browser path', () => {
  const o = parseArgs(['--app', 'login=http://localhost:5173/login', '--app', 'projects=http://localhost:5173/projects',
    '--reference', 'dev/ui/x/wireframe.html', '--widths', '360,1280', '--out', '/tmp/snap', '--browser', 'C:/edge/msedge.exe', '--height', '1000']);
  assert.deepEqual(o.app, [{ name: 'login', url: 'http://localhost:5173/login' }, { name: 'projects', url: 'http://localhost:5173/projects' }]);
  assert.equal(o.reference, 'dev/ui/x/wireframe.html');
  assert.deepEqual(o.widths, [360, 1280]);
  assert.equal(o.out, '/tmp/snap');
  assert.equal(o.browser, 'C:/edge/msedge.exe');
  assert.equal(o.height, 1000);
});

test('parseArgs resolves breakpoint names through the design tokens, and refuses what it cannot', () => {
  const tokens = { breakpoints: { sm: 640, lg: 1024 } };
  assert.deepEqual(parseArgs(['--app', 'a=http://x', '--widths', '360,lg'], { tokens }).widths, [360, 1024]);
  assert.throws(() => parseArgs(['--app', 'a=http://x', '--widths', '360,xl'], { tokens }), /xl/);
  assert.throws(() => parseArgs(['--app', 'a=http://x', '--widths', 'lg']), /--tokens/);
  assert.throws(() => parseArgs(['--app', 'no-equals-sign']), /name=url/);
  assert.throws(() => parseArgs(['--widths', '360']), /--app or --reference/);
  assert.throws(() => parseArgs(['--app', 'a=http://x', '--wat']), /unknown option --wat/);
  assert.throws(() => parseArgs(['--app', 'a=http://x', '--app', 'a=http://y']), /twice/);
});

test('parseArgs defaults: 360 and 1280, a 900px viewport, the screen anchor convention', () => {
  const o = parseArgs(['--reference', 'w.html']);
  assert.deepEqual(o.widths, [360, 1280]);
  assert.equal(o.height, 900);
  assert.equal(o.anchorPrefix, 's-');
  assert.deepEqual(o.app, []);
});

test('deadLinks lists every in-page link that no screen or element answers, so a clickable mock stays clickable', () => {
  // anime-blog: links said #category while the screen was s-category-sky-meadow; every click fell
  // back to the home screen and the requester found the mock "does nothing".
  const html = `<section class="screen" id="s-home"></section><section class="screen" id="s-category-sky"></section>
    <div id="main"></div><a href="#home">h</a><a href="#category">c</a><a href="#category">c2</a>
    <a href="#main">skip</a><a href="#">top</a><a href="https://x.test/#y">out</a><a href="#nope">n</a>`;
  const screens = discoverScreens(html, 's-');
  assert.deepEqual(deadLinks(html, screens), [{ anchor: '#category', count: 2 }, { anchor: '#nope', count: 1 }]);
  // A template literal in the mock's own script is resolved at run time, not a dead link.
  assert.deepEqual(deadLinks('<use href="#i-${id}"></use>', []), []);
  // A screen's own anchor, an element id and a bare "#" are live; outside links are not checked.
  assert.deepEqual(deadLinks(`${html}<section class="screen" id="s-category"></section><i id="nope"></i>`, discoverScreens(`${html}<section class="screen" id="s-category"></section>`, 's-')), []);
});

test('discoverScreens finds .screen elements with an id and strips the prefix for the anchor', () => {
  assert.deepEqual(discoverScreens(WIRE, 's-'), [
    { name: 'login', anchor: '#login' },
    { name: 'projects', anchor: '#projects' },
    { name: 'release', anchor: '#release' },
  ]);
  // No .screen at all: every section with an id is a screen, and the anchor is the id itself.
  assert.deepEqual(discoverScreens('<section id="home"></section><section id="about"></section>', ''), [
    { name: 'home', anchor: '#home' },
    { name: 'about', anchor: '#about' },
  ]);
});

test('planShots pairs app and reference screens by name, per width, and keeps the unpaired', () => {
  const opts = parseArgs(['--app', 'projects=http://localhost/p', '--app', 'extra=http://localhost/e', '--reference', 'C:/r/wire.html', '--out', 'out', '--ref', 'login=#login?role=viewer', '--only', 'projects,login,extra']);
  const shots = planShots(opts, discoverScreens(WIRE, 's-'));
  const key = (s) => `${s.side}:${s.name}@${s.width}`;
  assert.deepEqual(shots.map(key), [
    'app:projects@360', 'ref:projects@360', 'app:projects@1280', 'ref:projects@1280',
    'app:extra@360', 'app:extra@1280',
    'ref:login@360', 'ref:login@1280',
  ]);
  const ref = shots.find((s) => s.side === 'ref' && s.name === 'login');
  assert.match(ref.url, /^file:\/\/\/.*wire\.html#login\?role=viewer$/, 'an explicit --ref anchor wins over discovery');
  assert.equal(shots[0].file.replace(/\\/g, '/'), 'out/app/projects-360.png');
});

test('browserArgs starts one headless browser on a DevTools pipe, with its own profile, never the user\'s', () => {
  const args = browserArgs('P');
  assert.ok(args.includes('--headless=new'));
  assert.ok(args.includes('--remote-debugging-pipe'));
  assert.ok(args.includes('--user-data-dir=P'));
  // The one-shot mode cannot paint a cross-origin frame and shoots when a timer runs out.
  assert.ok(!args.some((a) => a.startsWith('--screenshot') || a.startsWith('--virtual-time-budget')));
});

/**
 * A browser on the far side of the DevTools pipe, scripted: `pictures` are what successive
 * captures return; `idleAfter` is how many ms after navigating the page's network goes idle.
 */
function fakeBrowser({ pictures, idleAfter = 0 }) {
  const clock = { t: 0, now: () => clock.t, sleep: async (ms) => { clock.t += ms; } };
  const calls = [];
  const listeners = new Set();
  let navigatedAt = null;
  let shots = 0;
  const cdp = {
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async send(method, params = {}, sessionId) {
      calls.push({ method, params, sessionId, at: clock.t });
      if (method === 'Target.createTarget') return { targetId: 'T' };
      if (method === 'Target.attachToTarget') return { sessionId: 'S' };
      if (method === 'Page.navigate') {
        navigatedAt = clock.t;
        // An idle event for a child frame first: it must not count.
        for (const l of listeners) l({ sessionId: 'S', method: 'Page.lifecycleEvent', params: { name: 'networkIdle', frameId: 'child' } });
        return { frameId: 'F' };
      }
      if (method === 'Page.captureScreenshot') {
        shots += 1;
        return { data: pictures[Math.min(shots, pictures.length) - 1].toString('base64') };
      }
      return {};
    },
  };
  const origSleep = clock.sleep;
  clock.sleep = async (ms) => {
    await origSleep(ms);
    if (navigatedAt !== null && clock.t - navigatedAt >= idleAfter) {
      for (const l of listeners) l({ sessionId: 'S', method: 'Page.lifecycleEvent', params: { name: 'networkIdle', frameId: 'F' } });
      navigatedAt = null;
    }
  };
  return { cdp, clock, calls };
}

const WHITE = png(36, 20, () => [255, 255, 255]);
const CONTENT = png(36, 20, (x, y) => (y < 4 ? [204, 0, 0] : [255, 255, (x * 7) & 0xff]));

test('takeShot gives the page itself a viewport of the exact width: no frame, at 360 as at 1280', async () => {
  // The 1.2.0 narrow shot loaded the app in an iframe of a file:// wrapper; the browser never
  // painted that cross-origin frame, and every 360px app shot was white on grey.
  for (const width of [360, 1280]) {
    const { cdp, clock, calls } = fakeBrowser({ pictures: [CONTENT] });
    await takeShot(cdp, { url: 'http://localhost:5173/releases', width }, { height: 900, wait: 3000 }, clock);
    const metrics = calls.find((c) => c.method === 'Emulation.setDeviceMetricsOverride');
    assert.deepEqual([metrics.params.width, metrics.params.height], [width, 900]);
    assert.equal(calls.find((c) => c.method === 'Page.navigate').params.url, 'http://localhost:5173/releases', 'the app URL itself, not a wrapper');
    assert.ok(calls.at(-1).method === 'Target.closeTarget', 'the tab is closed');
  }
});

test('takeShot waits for the page\'s network to go idle, and re-shoots while the picture is blank', async () => {
  const { cdp, clock, calls } = fakeBrowser({ pictures: [WHITE, WHITE, CONTENT], idleAfter: 1200 });
  const picture = await takeShot(cdp, { url: 'http://x/', width: 360 }, { height: 900, wait: 5000 }, clock);
  assert.equal(blankColours(picture), null, 'the picture with content is the one returned');
  const captures = calls.filter((c) => c.method === 'Page.captureScreenshot');
  assert.equal(captures.length, 3);
  assert.ok(captures[0].at >= 1200, `the first capture waited for networkIdle of the main frame (was at ${captures[0].at} ms)`);
});

test('takeShot gives up at the --wait budget and returns the blank picture for judgeShot to fail', async () => {
  const { cdp, clock } = fakeBrowser({ pictures: [WHITE], idleAfter: 10_000 });
  const picture = await takeShot(cdp, { url: 'http://x/', width: 360 }, { height: 900, wait: 2000 }, clock);
  assert.ok(clock.now() >= 2000 && clock.now() < 3000, `stopped at the budget (${clock.now()} ms)`);
  assert.equal(judgeShot(picture).ok, false);
});

// Live: a real browser, a page served over http that renders after a late response, at 360px.
// Under 1.2.0 this shot was a white rectangle on grey (and, until judgeShot, reported ok).
let liveBrowser = null;
try { liveBrowser = findBrowser(); } catch { /* no browser here: the live test is skipped */ }

test('live: a late-rendering http page is shot at 360px with its content', { skip: !liveBrowser && 'no Edge or Chrome found', timeout: 120_000 }, async () => {
  const { createServer } = await import('node:http');
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const page = `<!doctype html><meta name="viewport" content="width=device-width"><body style="margin:0;font:16px sans-serif"><div id="root"></div>
<script>fetch('/api').then((r) => r.json()).then(() => { root.innerHTML = '<h1 style="margin:0;padding:16px;background:#c00;color:#fff">Releases ' + innerWidth + '</h1>' + '<p style="padding:12px;border-bottom:1px solid #333">row</p>'.repeat(40); });</script>`;
  const server = createServer((req, res) => {
    if (req.url === '/api') { setTimeout(() => res.end('{}'), 700); return; }
    res.setHeader('content-type', 'text/html');
    res.end(page);
  });
  await new Promise((r) => { server.listen(0, '127.0.0.1', r); });
  const out = mkdtempSync(join(tmpdir(), 'ui-snap-live-'));
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const script = new URL('../workspace/dev/scripts/ui-snap.mjs', import.meta.url);
    const child = spawn(process.execPath, [script.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--app', `rel=http://127.0.0.1:${server.address().port}/`, '--widths', '360', '--browser', liveBrowser, '--out', out], { env });
    let log = '';
    child.stdout.on('data', (d) => { log += d; });
    child.stderr.on('data', (d) => { log += d; });
    const code = await new Promise((r) => { child.on('exit', r); });
    assert.equal(code, 0, log);
    const picture = readFileSync(join(out, 'app', 'rel-360.png'));
    assert.equal(picture.readUInt32BE(16), 360, 'the picture is 360px wide');
    assert.equal(blankColours(picture), null, 'and has the page on it');
  } finally {
    server.close();
    rmSync(out, { recursive: true, force: true });
  }
});

test('findBrowser: the flag, then the environment, then the common install paths', () => {
  const has = (set) => (p) => set.has(p);
  assert.equal(findBrowser({ flag: 'D:/e.exe', exists: has(new Set(['D:/e.exe'])) }), 'D:/e.exe');
  assert.throws(() => findBrowser({ flag: 'D:/gone.exe', exists: has(new Set()) }), /gone\.exe/);
  assert.equal(findBrowser({ env: { UI_SNAP_BROWSER: 'E:/c.exe' }, exists: has(new Set(['E:/c.exe'])) }), 'E:/c.exe');
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  assert.equal(findBrowser({ env: {}, platform: 'win32', exists: has(new Set([edge])) }), edge);
  assert.equal(findBrowser({ env: {}, platform: 'linux', exists: has(new Set(['/usr/bin/chromium'])) }), '/usr/bin/chromium');
  assert.throws(() => findBrowser({ env: {}, platform: 'linux', exists: has(new Set()) }), /--browser/);
});

test('compare.html puts each app shot beside its reference, links the PNG files, and asks a human', () => {
  const opts = parseArgs(['--app', 'projects=http://localhost/p', '--app', 'extra=http://localhost/e', '--reference', 'wire.html', '--out', 'snap']);
  const shots = planShots(opts, discoverScreens(WIRE, 's-')).map((s) => ({ ...s, ok: !(s.side === 'app' && s.name === 'extra') }));
  const html = renderCompare(shots, { ...opts, generatedAt: '2026-10-08T00:00:00Z' });
  assert.match(html, /^<!doctype html>/);
  assert.equal((html.match(/<section class="pair"/g) ?? []).length, 4 * 2, 'projects, extra, login, release — each at two widths');
  assert.match(html, /src="app\/projects-360\.png"/, 'linked relative to compare.html');
  assert.match(html, /src="ref\/projects-360\.png"/);
  assert.match(html, /projects · 360px/);
  assert.match(html, /no reference screen/);
  assert.match(html, /not built in the app/);
  assert.match(html, /screenshot failed/);
  assert.match(html, /Approved by/);
  assert.doesNotMatch(html, /<script/i, 'self-contained and static: nothing to run');
  assert.doesNotMatch(html, /data:image/, 'no image is inlined: a 49-screen run inlined was 16 MB');
  assert.ok(html.length < 20_000, `compare.html is ${html.length} bytes; it should stay small`);
  // Names are escaped: a screen name is text, not markup.
  const evil = renderCompare([{ side: 'app', name: '<b>x</b>', width: 360, url: 'http://x', file: 'f', ok: true }], opts);
  assert.doesNotMatch(evil, /<b>x<\/b>/);
});

/** A PNG of `w`×`h` RGB pixels from `pixel(x, y)`, each row with filter `filter` (0 none, 1 sub, 2 up, 4 Paeth). */
function png(w, h, pixel, filter = 0) {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return (~c) >>> 0;
  };
  const chunk = (kind, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(kind, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = [];
  let prev = Buffer.alloc(w * 3);
  for (let y = 0; y < h; y += 1) {
    const line = Buffer.alloc(w * 3);
    for (let x = 0; x < w; x += 1) line.set(pixel(x, y), x * 3);
    const out = Buffer.alloc(w * 3);
    for (let i = 0; i < out.length; i += 1) {
      const a = i >= 3 ? line[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
      const pred = { 0: 0, 1: a, 2: b, 4: pa <= pb && pa <= pc ? a : pb <= pc ? b : c }[filter];
      out[i] = (line[i] - pred) & 0xff;
    }
    rows.push(Buffer.from([filter]), out);
    prev = line;
  }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

test('blankColours calls a one- or two-colour picture blank, and anything with content not blank', () => {
  // What release-management's 360px shots were under 1.2.1: a white, never-painted frame on grey.
  const framedBlank = (x) => (x < 36 ? [255, 255, 255] : [0x88, 0x88, 0x88]);
  for (const filter of [0, 1, 2, 4]) {
    assert.deepEqual(blankColours(png(52, 30, framedBlank, filter)), ['#ffffff', '#888888'], `filter ${filter}`);
    assert.deepEqual(blankColours(png(20, 20, () => [255, 255, 255], filter)), ['#ffffff']);
    // A header, a line of "text" in two shades, on a page: content.
    const page = (x, y) => (y < 4 ? [204, 0, 0] : y === 10 && x > 2 && x < 12 ? [x * 20, x * 20, x * 20] : [255, 255, 221]);
    assert.equal(blankColours(png(20, 20, page, filter)), null, `filter ${filter}`);
  }
  const oneMark = (x, y) => (x === 5 && y === 5 ? [0, 0, 0] : framedBlank(x));
  assert.equal(blankColours(png(52, 30, oneMark)), null, 'a third colour is content, however small');
  assert.equal(blankColours(Buffer.from('not a png')), null, 'what it cannot read it does not fail');
});

test('judgeShot fails a blank picture with the reason, and compare.html shows it', () => {
  const blank = png(52, 30, (x) => (x < 36 ? [255, 255, 255] : [0x88, 0x88, 0x88]));
  const judged = judgeShot(blank, { status: 0 });
  assert.equal(judged.ok, false, 'a white rectangle is not a screenshot of the app');
  assert.match(judged.error, /blank: nothing but #ffffff and #888888/);
  assert.deepEqual(judgeShot(png(20, 20, (x, y) => (y < 4 ? [204, 0, 0] : [x * 10, 0, 0]))), { ok: true, error: null });
  assert.match(judgeShot(null, { status: 21 }).error, /exit 21/);
  const opts = parseArgs(['--app', 'a=http://x/a']);
  const page = renderCompare([{ side: 'app', name: 'a', width: 360, url: 'http://x/a', file: 'f', ...judged }], opts);
  assert.match(page, /screenshot failed \(blank: nothing but #ffffff and #888888\)/);
});

// Visual regression (DEV-CONTRACTS §13.13): the app against its own approved shots.
test('pixelDiff: identical is 0%, jitter under the tolerance is 0%, a changed block counts, a size change is 100%', async () => {
  const { pixelDiff } = await import('../workspace/dev/scripts/ui-snap.mjs');
  const pic = (w, h, f) => { const rgb = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i += 1) rgb.set(f(i % w, Math.floor(i / w)), i * 3); return { width: w, height: h, rgb }; };
  const base = pic(10, 10, () => [255, 255, 255]);
  assert.equal(pixelDiff(base, base).changed, 0);
  assert.equal(pixelDiff(base, pic(10, 10, () => [250, 252, 255])).changed, 0, 'antialias jitter');
  const block = pic(10, 10, (x, y) => (x < 2 && y < 5 ? [0, 0, 0] : [255, 255, 255]));
  const d = pixelDiff(base, block);
  assert.equal(d.changed, 10);
  assert.equal(d.pixels, 10);
  assert.deepEqual([...d.mask.subarray(0, 3)], [255, 0, 0], 'a changed pixel is red in the mask');
  assert.equal(pixelDiff(base, pic(10, 11, () => [255, 255, 255])).sizeChanged, true);
});

test('compareGolden: within threshold passes, over it fails with a diff PNG, a missing golden fails', async () => {
  const { compareGolden } = await import('../workspace/dev/scripts/ui-snap.mjs');
  const { encodeIndexed } = await import('../workspace/dev/scripts/lib/png.mjs');
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'ui-golden-'));
  try {
    const png = (dark) => { const idx = new Uint8Array(100); for (let i = 0; i < dark; i += 1) idx[i] = 1; return encodeIndexed(10, 10, [[255, 255, 255], [0, 0, 0]], idx); };
    writeFileSync(join(dir, 'golden.png'), png(0));
    writeFileSync(join(dir, 'same.png'), png(0));
    writeFileSync(join(dir, 'moved.png'), png(5));
    assert.equal(compareGolden(join(dir, 'same.png'), join(dir, 'golden.png'), 0.5, join(dir, 'd1.png')).ok, true);
    const bad = compareGolden(join(dir, 'moved.png'), join(dir, 'golden.png'), 0.5, join(dir, 'd2.png'));
    assert.equal(bad.ok, false);
    assert.equal(bad.changed, 5);
    assert.ok(existsSync(join(dir, 'd2.png')), 'the diff picture is written');
    assert.equal(compareGolden(join(dir, 'moved.png'), join(dir, 'golden.png'), 10, null).ok, true, 'a looser threshold');
    assert.match(compareGolden(join(dir, 'same.png'), join(dir, 'none.png'), 0.5, null).message, /no golden/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseArgs: --golden, --write-golden, --threshold and --json', () => {
  const o = parseArgs(['--app', 'a=http://x', '--golden', 'g', '--threshold', '1.5', '--json']);
  assert.equal(o.golden, 'g');
  assert.equal(o.threshold, 1.5);
  assert.equal(o.json, true);
  assert.equal(parseArgs(['--app', 'a=http://x']).threshold, 0.5);
  assert.throws(() => parseArgs(['--app', 'a=http://x', '--threshold', 'lots']), /percentage/);
});
