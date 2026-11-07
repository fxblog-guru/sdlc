#!/usr/bin/env node
/**
 * ui-snap.mjs — screenshot the app's screens beside the approved visual, for a human to compare.
 *
 * Unit tests assert text and behaviour; they cannot see that every dialog is pinned to the left edge
 * or that the page went dark because the OS did. A screenshot can, and a screenshot next to the
 * picture the requester approved (the ui-spec's `visual_reference`, DEV-CONTRACTS §13.3) makes the
 * difference obvious in a glance. This script makes that glance cheap:
 *
 *   node dev/scripts/ui-snap.mjs \
 *     --app projects=http://localhost:5173/projects --app login=http://localhost:5173/login \
 *     --reference dev/ui/<slug>/wireframe.html \
 *     --widths 360,lg --tokens dev/docs --out dev/verification/<slug>/runs/<run-id>/ui-snap
 *
 *   --app <name>=<url>      an app screen (repeatable). Name it as the reference names the screen.
 *   --reference <file>      the approved visual. Its screens are found as elements with class
 *                           `screen` and an id (`s-login` → `#login`, --anchor-prefix), else as
 *                           every <section id>. Each is shot at `<file>#<anchor>`.
 *   --ref <name>=<anchor>   add or override a reference screen's anchor (`login=#login?role=viewer`)
 *   --only <a,b,…>          shoot only these screen names
 *   --widths <list>         px, or breakpoint names read from --tokens (default 360,1280)
 *   --tokens <dir>          where design-tokens.json is, for breakpoint names
 *   --height <px>           viewport height (default 900)
 *   --wait <ms>             how long a shot may wait for the page to render (default 3000); a
 *                           picture still blank then fails the shot
 *   --browser <path>        Edge or Chrome; else $UI_SNAP_BROWSER, else the common install paths
 *   --out <dir>             PNGs land in <out>/app and <out>/ref, beside <out>/compare.html
 *
 * There is deliberately no pixel diff against the reference. The reference holds sample data and the
 * app holds real data, so every pixel differs and a diff threshold would be noise that teaches people
 * to raise it. The question "does this look like what was approved?" is a human's, and compare.html
 * is laid out so that a human can answer it for every screen in a few minutes.
 *
 * Visual regression is a different question — "did this screen change since a human approved it?" —
 * and it is a diff of the app against itself (DEV-CONTRACTS §13.13):
 *
 *   --write-golden <dir>    copy each app shot to <dir>/<name>-<width>.png (after G8 approval)
 *   --golden <dir>          compare each app shot with <dir>/<name>-<width>.png; a shot whose changed
 *                           pixels exceed --threshold percent (default 0.5) fails, as does a size
 *                           change or a missing golden. A diff PNG (changes in red) lands in
 *                           <out>/diff/. Run it on the fixed seed, or the data is the difference.
 *   --json                  print the shots, each with its golden result, as JSON
 *
 * Node only, no dependency: one headless browser per run, driven over the DevTools protocol on a
 * pipe (see `browserArgs`), with a throwaway profile so a running browser is never touched.
 *
 * Exit 0 every shot taken · 1 a shot failed or came out blank · 2 usage error.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { decodePng, encodeIndexed, quantise } from './lib/png.mjs';
import { findRoot } from './lib/root.mjs';

const DEFAULT_WIDTHS = [360, 1280];

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

const VALUE_FLAGS = new Set(['--app', '--reference', '--ref', '--only', '--widths', '--tokens', '--height', '--wait', '--browser', '--out', '--anchor-prefix', '--golden', '--write-golden', '--threshold']);
export const DEFAULT_THRESHOLD = 0.5;

/**
 * @param {string[]} argv
 * @param {{ tokens?: object }} [ctx] a parsed design-tokens.json; read from --tokens when absent
 */
export function parseArgs(argv, ctx = {}) {
  const o = { app: [], refs: [], reference: null, only: null, widths: null, tokensDir: null, height: 900, wait: 3000, browser: null, out: null, anchorPrefix: 's-', golden: null, writeGolden: null, threshold: DEFAULT_THRESHOLD, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--json') { o.json = true; continue; }
    if (!VALUE_FLAGS.has(flag)) throw new Error(`unknown option ${flag}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    i += 1;
    switch (flag) {
      case '--app': o.app.push(pair(value, 'url')); break;
      case '--ref': o.refs.push(pair(value, 'anchor')); break;
      case '--reference': o.reference = value; break;
      case '--only': o.only = value.split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--widths': o.widths = value.split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--tokens': o.tokensDir = value; break;
      case '--height': o.height = positiveInt(value, flag); break;
      case '--wait': o.wait = positiveInt(value, flag); break;
      case '--browser': o.browser = value; break;
      case '--out': o.out = value; break;
      case '--anchor-prefix': o.anchorPrefix = value; break;
      case '--golden': o.golden = value; break;
      case '--write-golden': o.writeGolden = value; break;
      case '--threshold':
        o.threshold = Number(value);
        if (!(o.threshold >= 0 && o.threshold <= 100)) throw new Error(`--threshold is a percentage 0–100, got \`${value}\``);
        break;
      default: break;
    }
  }
  if (!o.app.length && !o.reference) throw new Error('give --app or --reference (or both): there is nothing to shoot');
  const names = o.app.map((a) => a.name);
  const twice = names.find((n, k) => names.indexOf(n) !== k);
  if (twice) throw new Error(`--app names the screen \`${twice}\` twice`);

  let tokens = ctx.tokens;
  if (!tokens && o.tokensDir) tokens = JSON.parse(readFileSync(join(o.tokensDir, 'design-tokens.json'), 'utf8'));
  o.widths = o.widths ? o.widths.map((w) => resolveWidth(w, tokens)) : [...DEFAULT_WIDTHS];
  return o;
}

function pair(value, what) {
  const k = value.indexOf('=');
  if (k <= 0 || k === value.length - 1) throw new Error(`\`${value}\` is not name=${what}`);
  return { name: value.slice(0, k), [what]: value.slice(k + 1) };
}

function positiveInt(value, flag) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer, got \`${value}\``);
  return n;
}

function resolveWidth(w, tokens) {
  if (/^\d+$/.test(w)) return Number(w);
  const name = w.replace(/^bp\./, '');
  if (!tokens) throw new Error(`width \`${w}\` is a breakpoint name — pass --tokens <dir> so it can be read from design-tokens.json`);
  const px = tokens.breakpoints?.[name];
  if (typeof px !== 'number') throw new Error(`width \`${w}\`: design-tokens.json has no breakpoint \`${name}\` (has ${Object.keys(tokens.breakpoints ?? {}).join(', ')})`);
  return px;
}

// ---------------------------------------------------------------------------------------------
// The reference's screens
// ---------------------------------------------------------------------------------------------

/**
 * Screens in a reference HTML file. A wireframe that switches screens by hash marks each one as an
 * element with class `screen` and an id (`<section class="screen" id="s-login">`, routed as
 * `#login`). A plain mockup has none, and then each `<section id>` is a screen, anchored by its id.
 */
export function discoverScreens(html, prefix = 's-') {
  const tags = [...html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)].map((m) => m[2]);
  const attr = (attrs, name) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)?.slice(1).find((v) => v !== undefined) ?? null;
  const toScreen = (id) => {
    const name = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
    return { name, anchor: `#${name}` };
  };
  const marked = tags.filter((a) => attr(a, 'id') && (attr(a, 'class') ?? '').split(/\s+/).includes('screen'));
  if (marked.length) return marked.map((a) => toScreen(attr(a, 'id')));
  return [...html.matchAll(/<section\b([^>]*)>/gi)].map((m) => attr(m[1], 'id')).filter(Boolean).map(toScreen);
}

/**
 * In-page links (`href="#x"`) that lead nowhere: no screen anchor and no element id answers them.
 * A requester clicks through the approved visual; a link whose screen is named differently
 * (`#category` beside `s-category-sky-meadow`) silently falls back to the first screen, and the
 * mock reads as broken. Outside links and a bare `#` are not checked.
 */
export function deadLinks(html, screens) {
  const live = new Set(screens.map((s) => s.anchor));
  for (const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) live.add(`#${m[1]}`);
  const counts = new Map();
  for (const m of html.matchAll(/\bhref\s*=\s*["'](#[^"'?]+)[^"']*["']/gi)) {
    if (m[1].includes('${')) continue; // a template literal in the mock's script, resolved at run time
    if (!live.has(m[1])) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts].map(([anchor, count]) => ({ anchor, count }));
}

// ---------------------------------------------------------------------------------------------
// The plan: which shots, in which order, written where
// ---------------------------------------------------------------------------------------------

/**
 * App screens first, in the order given, each beside its reference screen; then the reference
 * screens the app has not built yet, so a missing screen is as visible as a wrong one.
 */
export function planShots(opts, discovered = []) {
  const out = opts.out ?? '.';
  const refs = new Map(discovered.map((s) => [s.name, s.anchor]));
  for (const r of opts.refs ?? []) refs.set(r.name, r.anchor.startsWith('#') ? r.anchor : `#${r.anchor}`);
  const refUrl = (anchor) => `${pathToFileURL(resolve(opts.reference)).href}${anchor}`;
  const wanted = (name) => !opts.only || opts.only.includes(name);

  const shots = [];
  const shoot = (side, name, url, width) => shots.push({ side, name, url, width, file: join(out, side, `${name}-${width}.png`) });
  for (const a of opts.app.filter((x) => wanted(x.name))) {
    for (const width of opts.widths) {
      shoot('app', a.name, a.url, width);
      if (opts.reference && refs.has(a.name)) shoot('ref', a.name, refUrl(refs.get(a.name)), width);
    }
  }
  if (opts.reference) {
    const built = new Set(opts.app.map((a) => a.name));
    for (const [name, anchor] of refs) {
      if (built.has(name) || !wanted(name)) continue;
      for (const width of opts.widths) shoot('ref', name, refUrl(anchor), width);
    }
  }
  return shots;
}

// ---------------------------------------------------------------------------------------------
// The browser
// ---------------------------------------------------------------------------------------------

const CANDIDATES = {
  win32: (env) => [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    env.LOCALAPPDATA && `${env.LOCALAPPDATA.replace(/\\/g, '/')}/Google/Chrome/Application/chrome.exe`,
  ],
  darwin: () => [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: () => ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

/** A Chromium-family browser: the flag, then $UI_SNAP_BROWSER, then the usual install paths. */
export function findBrowser({ flag = null, env = process.env, platform = process.platform, exists = existsSync } = {}) {
  if (flag) {
    if (!exists(flag)) throw new Error(`--browser ${flag} does not exist`);
    return flag;
  }
  if (env.UI_SNAP_BROWSER && exists(env.UI_SNAP_BROWSER)) return env.UI_SNAP_BROWSER;
  const found = (CANDIDATES[platform] ?? CANDIDATES.linux)(env).filter(Boolean).find((p) => exists(p));
  if (!found) throw new Error('no Edge or Chrome found in the usual places — pass --browser <path> or set UI_SNAP_BROWSER');
  return found;
}

/**
 * The browser is driven over the DevTools protocol on a pipe, not with its one-shot `--screenshot`
 * mode. Two things went wrong with that mode, both silently:
 *
 * - Headless Chromium on Windows will not lay a window out narrower than about 500px: asked for 360
 *   it lays out at ~492 and crops. 1.2.0 loaded narrow shots in an iframe of the exact width inside
 *   a `file://` wrapper page. `--screenshot` does not paint a cross-origin (out-of-process) frame,
 *   and an app on `http://localhost` is always cross-origin to a `file://` page, so every 360px app
 *   shot was a white rectangle on grey (reference shots, also `file://`, rendered, which hid it). No
 *   budget fixes it. Device-metrics emulation gives the page itself a viewport of the exact width,
 *   with no frame.
 * - `--virtual-time-budget` takes the picture when the budget runs out, rendered or not. A shot now
 *   waits for the page's network to go idle, lets two frames paint, and shoots again while the
 *   picture is still blank, all within `--wait`.
 *
 * One browser per run, in a throwaway profile so a browser the user has open is never touched.
 */
export function browserArgs(profileDir) {
  return [
    '--headless=new',
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-pipe',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    // Edge starts its own component extensions and a sync dialog regardless, and they slow its exit.
    '--disable-component-extensions-with-background-pages',
    '--disable-sync',
    '--disable-background-networking',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ];
}

/** A DevTools-protocol client on the pipe the browser was started with: fd 3 in, fd 4 out, NUL-framed. */
export function pipeClient(toBrowser, fromBrowser) {
  let seq = 0;
  let buf = '';
  let closed = null;
  const pending = new Map();
  const listeners = new Set();
  fromBrowser.setEncoding('utf8');
  fromBrowser.on('data', (chunk) => {
    buf += chunk;
    for (let k = buf.indexOf('\0'); k >= 0; k = buf.indexOf('\0')) {
      const msg = JSON.parse(buf.slice(0, k));
      buf = buf.slice(k + 1);
      const waiting = msg.id && pending.get(msg.id);
      if (!waiting) {
        for (const l of listeners) l(msg);
        continue;
      }
      pending.delete(msg.id);
      if (msg.error) waiting.reject(new Error(msg.error.message));
      else waiting.resolve(msg.result ?? {});
    }
  });
  return {
    send(method, params = {}, sessionId = undefined) {
      if (closed) return Promise.reject(closed);
      seq += 1;
      const id = seq;
      return new Promise((resolveIt, reject) => {
        pending.set(id, { resolve: resolveIt, reject });
        toBrowser.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
      });
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close(err) {
      closed = err;
      for (const p of pending.values()) p.reject(err);
      pending.clear();
    },
  };
}

const realClock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => { setTimeout(r, ms); }) };

/**
 * One shot in a fresh tab of `cdp`'s browser: a viewport of exactly `shot.width` × `opts.height`,
 * the page loaded and given until its network is idle, two frames painted, and the picture taken
 * again while it is blank, all within `opts.wait` ms. Returns the last picture taken; whether it is
 * blank is `judgeShot`'s to say.
 */
export async function takeShot(cdp, shot, opts, clock = realClock) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => cdp.send(method, params, sessionId);
  const deadline = clock.now() + opts.wait;
  try {
    await s('Emulation.setDeviceMetricsOverride', { width: shot.width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    await s('Page.enable');
    await s('Page.setLifecycleEventsEnabled', { enabled: true });
    let frameId = null;
    let idle = false;
    const off = cdp.on((m) => {
      if (m.sessionId === sessionId && m.method === 'Page.lifecycleEvent' && m.params.name === 'networkIdle' && m.params.frameId === frameId) idle = true;
    });
    try {
      const nav = await s('Page.navigate', { url: shot.url });
      if (nav.errorText) throw new Error(`${nav.errorText} loading ${shot.url}`);
      frameId = nav.frameId;
      while (!idle && clock.now() < deadline) await clock.sleep(50);
    } finally {
      off();
    }
    for (;;) {
      await s('Runtime.evaluate', { expression: 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))', awaitPromise: true }).catch(() => {});
      const png = Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64');
      if (!blankColours(png) || clock.now() >= deadline) return png;
      await clock.sleep(250);
    }
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/**
 * One headless browser on a DevTools pipe, in a throwaway profile. `close()` takes it down, helpers
 * and all. ui-rubric.mjs drives pages through the same browser plumbing.
 */
export function launchBrowser(browser, env = process.env) {
  const clean = { ...env };
  delete clean.ELECTRON_RUN_AS_NODE; // an Electron host leaks it; Chromium started with it behaves as Node
  const profile = mkdtempSync(join(tmpdir(), 'ui-snap-profile-'));
  const child = spawn(browser, browserArgs(profile), { env: clean, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const cdp = pipeClient(child.stdio[3], child.stdio[4]);
  const exited = new Promise((r) => { child.once('exit', r); });
  child.once('error', (err) => cdp.close(err));
  child.once('exit', (code) => cdp.close(new Error(`the browser exited (${code}) — is ${browser} a Chromium browser?`)));
  const close = async () => {
    // Edge can take many seconds over Browser.close, or ignore it, and a plain kill of the main
    // process on Windows leaves its helpers running and the profile locked: kill the whole tree.
    await cdp.send('Browser.close').catch(() => {});
    await Promise.race([exited, realClock.sleep(3000)]);
    if (child.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      else child.kill('SIGKILL');
      await Promise.race([exited, realClock.sleep(10_000)]);
    }
    // The helpers inherit the pipe and hold it open after the browser exits; without this, Node
    // waits on them before it exits.
    for (const s of child.stdio) s?.destroy();
    child.unref();
    // A helper can hold the profile a moment longer (EPERM on Windows). A leftover directory in
    // the temp folder is not worth failing a run over.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
    } catch {
      console.log(`ui-snap: could not remove the throwaway profile ${profile}; delete it by hand`);
    }
  };
  return { cdp, close };
}

/** Every shot in one browser; each gets `ok` and `error` from `judgeShot`. */
async function shootAll(browser, shots, opts, env) {
  const { cdp, close } = launchBrowser(browser, env);
  try {
    for (const shot of shots) {
      if (existsSync(shot.file)) rmSync(shot.file);
      let png = null;
      let error;
      let timer;
      try {
        const limit = opts.wait + 30_000;
        png = await Promise.race([
          takeShot(cdp, shot, opts),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no picture within ${limit} ms`)), limit); }),
        ]);
        writeFileSync(shot.file, png);
      } catch (err) {
        error = err;
      } finally {
        clearTimeout(timer);
      }
      Object.assign(shot, judgeShot(png, { error }));
      console.log(`  ${shot.ok ? 'ok  ' : 'FAIL'} ${shot.side} ${shot.name} @${shot.width}${shot.ok ? '' : `  (${shot.error})`}`);
    }
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------------------------------------
// Blank pictures
// ---------------------------------------------------------------------------------------------

/**
 * The colours (`#rrggbb`) of a blank PNG, or null when it is not blank. A screen that rendered
 * nothing (a page still loading, a frame never painted) is one colour, or one colour beside the
 * grey margin of the 1.2.0 frame; a screen with anything on it has text, and text is antialiased
 * into many colours. So a picture counts as blank when it has at most two colours. Encodings this reader does not decode
 * (interlaced, 16-bit, palette) are never called blank: the check must not fail what it cannot read.
 *
 * @returns {string[] | null} the colours of a blank picture, or null when it is not blank
 */
export function blankColours(png, max = 2) {
  if (png.length < 33 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  const idat = [];
  for (let p = 8; p + 8 <= png.length;) {
    const len = png.readUInt32BE(p);
    const kind = png.toString('latin1', p + 4, p + 8);
    const body = png.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      [depth, type] = [body[8], body[9]];
      interlace = body[12];
    } else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    p += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (!width || !height || depth !== 8 || interlace !== 0 || !channels) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  let prev = Buffer.alloc(stride);
  const colours = new Set();
  for (let y = 0; y < height; y += 1) {
    const at = y * (stride + 1);
    const filter = raw[at];
    const line = Buffer.from(raw.subarray(at + 1, at + 1 + stride));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = a;
      else if (filter === 2) add = b;
      else if (filter === 3) add = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0; x < stride; x += channels) {
      const rgb = channels < 3 ? [line[x], line[x], line[x]] : [line[x], line[x + 1], line[x + 2]];
      colours.add(`#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`);
      if (colours.size > max) return null;
    }
    prev = line;
  }
  return [...colours];
}

/**
 * Whether a shot counts as taken. A missing or empty file failed; so does a blank picture, which is
 * written (the human can open it) but never reported `ok`: a white rectangle passed for a phone
 * screen in a downstream project's G7 evidence, three lanes in a row.
 *
 * @param {Buffer | null} png the file the browser wrote, or null when it wrote none
 * @param {{ error?: Error, status?: number | null }} [run] the browser process, for the reason
 */
export function judgeShot(png, run = {}) {
  if (!png?.length) return { ok: false, error: run.error?.message ?? `no picture (exit ${run.status ?? '?'})` };
  const blank = blankColours(png);
  if (blank) return { ok: false, error: `blank: nothing but ${blank.join(' and ')}` };
  return { ok: true, error: null };
}

// ---------------------------------------------------------------------------------------------
// compare.html
// ---------------------------------------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * One small static page: each screen at each width, app on the left and reference on the right.
 * The PNGs are linked by relative path, not inlined: a 49-screen run inlined came to 16 MB, too big
 * to open in a review tool or attach. Send the folder (or a zip of it), not the page alone.
 */
export function renderCompare(shots, opts) {
  const groups = new Map();
  for (const s of shots) {
    const key = `${s.name}\u0000${s.width}`;
    if (!groups.has(key)) groups.set(key, { name: s.name, width: s.width });
    groups.get(key)[s.side] = s;
  }
  const base = resolve(opts.out ?? '.');
  const href = (file) => relative(base, resolve(file)).replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  const figure = (shot, label, missing) => {
    if (!shot) return `<figure class="none"><figcaption>${label}</figcaption><p>${missing}</p></figure>`;
    if (!shot.ok) return `<figure class="none"><figcaption>${label}</figcaption><p>screenshot failed${shot.error ? ` (${esc(shot.error)})` : ''} — <code>${esc(shot.url)}</code></p></figure>`;
    const src = href(shot.file);
    const img = `<a href="${esc(src)}"><img loading="lazy" alt="${esc(`${label}: ${shot.name} at ${shot.width}px`)}" src="${esc(src)}"></a>`;
    return `<figure><figcaption>${label} · <code>${esc(shot.url)}</code></figcaption>${img}</figure>`;
  };
  const sections = [...groups.values()].map((g) => [
    `<section class="pair" id="${esc(`${g.name}-${g.width}`)}">`,
    `<h2>${esc(g.name)} · ${g.width}px</h2>`,
    '<div class="row">',
    figure(g.app, 'App', 'not built in the app (no --app for this screen)'),
    figure(g.ref, 'Reference', 'no reference screen of this name'),
    '</div>',
    '</section>',
  ].join('\n'));
  const index = [...groups.values()].map((g) => `<a href="#${esc(`${g.name}-${g.width}`)}">${esc(g.name)} · ${g.width}</a>`).join(' ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI compare</title>
<style>
:root { color-scheme: light; --bg: #f4f5f7; --fg: #1d2127; --muted: #5d6570; --line: #cfd4db; --card: #ffffff; --warn: #8a5f00; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 8px; } h2 { font-size: 15px; margin: 0 0 8px; }
.meta, nav { color: var(--muted); margin-bottom: 12px; } nav a { margin-right: 8px; white-space: nowrap; }
.approve { background: var(--card); border: 1px solid var(--line); padding: 12px; margin-bottom: 16px; }
.pair { background: var(--card); border: 1px solid var(--line); padding: 12px; margin-bottom: 16px; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }
@media (max-width: 900px) { .row { grid-template-columns: 1fr; } }
figure { margin: 0; min-width: 0; } figcaption { color: var(--muted); margin-bottom: 4px; overflow-wrap: anywhere; }
img { display: block; max-width: 100%; border: 1px solid var(--line); }
.none p { color: var(--warn); border: 1px dashed var(--line); padding: 24px; margin: 0; }
</style>
</head>
<body>
<h1>Does the app look like the approved visual?</h1>
<p class="meta">Images are the PNG files beside this page (<code>app/</code>, <code>ref/</code>); keep the folder together. Reference: <code>${esc(opts.reference ?? 'none')}</code> · widths ${opts.widths.map((w) => `${w}px`).join(', ')} · generated ${esc(opts.generatedAt ?? new Date().toISOString())} by <code>dev/scripts/ui-snap.mjs</code></p>
<div class="approve"><strong>For the requester.</strong> Compare each pair: layout, colour, type, spacing, dialog size and theme. Sample data differs on purpose; look past it. Approved by: ____________ · Date: ________ · Screens not approved, and why: ____________ — record the answer in the gate evidence (DEV-CONTRACTS §13.3).</div>
<nav>${index}</nav>
${sections.join('\n')}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// Visual regression — the app against its own approved shots (DEV-CONTRACTS §13.13)
// ---------------------------------------------------------------------------------------------

/**
 * Two decoded pictures → the percentage of pixels that differ by more than `tolerance` on any
 * channel (antialiasing moves a step or two between runs), and a mask with those pixels in red on a
 * faded copy. Pure, for the tests. A size change is a layout change, reported as 100%.
 */
export function pixelDiff(a, b, tolerance = 16) {
  if (a.width !== b.width || a.height !== b.height) return { changed: 100, pixels: null, sizeChanged: true, mask: null };
  const n = a.width * a.height;
  const mask = Buffer.alloc(n * 3);
  let changed = 0;
  for (let p = 0, o = 0; p < n; p += 1, o += 3) {
    const d = Math.max(Math.abs(a.rgb[o] - b.rgb[o]), Math.abs(a.rgb[o + 1] - b.rgb[o + 1]), Math.abs(a.rgb[o + 2] - b.rgb[o + 2]));
    if (d > tolerance) {
      changed += 1;
      mask[o] = 255;
      mask[o + 1] = 0;
      mask[o + 2] = 0;
    } else {
      const g = 200 + Math.round((a.rgb[o] + a.rgb[o + 1] + a.rgb[o + 2]) / 15);
      mask[o] = g;
      mask[o + 1] = g;
      mask[o + 2] = g;
    }
  }
  return { changed: Math.round((changed / n) * 10000) / 100, pixels: changed, sizeChanged: false, mask };
}

/** One app shot against its golden file: `{ ok, changed, message }`; writes the diff PNG when any pixel moved. */
export function compareGolden(shotFile, goldenFile, threshold, diffFile) {
  if (!existsSync(goldenFile)) return { ok: false, changed: null, message: `no golden ${basename(goldenFile)} — record one with --write-golden after approval` };
  let a;
  let b;
  try {
    a = decodePng(readFileSync(shotFile));
    b = decodePng(readFileSync(goldenFile));
  } catch (err) {
    return { ok: false, changed: null, message: `cannot compare: ${err.message}` };
  }
  const d = pixelDiff(a, b);
  if (d.sizeChanged) return { ok: false, changed: 100, message: `size changed: ${a.width}×${a.height}, golden ${b.width}×${b.height}` };
  if (d.pixels && diffFile) {
    const { palette, index } = quantise(d.mask, 256);
    writeFileSync(diffFile, encodeIndexed(a.width, a.height, palette, index));
  }
  return { ok: d.changed <= threshold, changed: d.changed, message: `${d.changed}% of pixels changed (threshold ${threshold}%)${d.pixels ? ` · diff/${basename(diffFile ?? '')}` : ''}` };
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main(argv) {
  let opts;
  let browser;
  try {
    opts = parseArgs(argv);
    browser = findBrowser({ flag: opts.browser });
  } catch (err) {
    console.error(`ui-snap: ${err.message}`);
    console.error('usage: ui-snap.mjs --app <name>=<url>… [--reference <file>] [--widths 360,lg --tokens dev/docs] --out <dir> [--golden <dir> [--threshold 0.5] | --write-golden <dir>] [--json]');
    return 2;
  }
  opts.out = resolve(opts.out ?? join(findRoot().root, 'ui-snap', new Date().toISOString().replace(/[:.]/g, '-')));
  const refHtml = opts.reference ? readFileSync(opts.reference, 'utf8') : '';
  const discovered = opts.reference ? discoverScreens(refHtml, opts.anchorPrefix) : [];
  const dead = opts.reference ? deadLinks(refHtml, discovered) : [];
  if (dead.length) {
    console.error(`ui-snap: ${dead.length} link target(s) in the reference reach no screen, so a click there falls back to the first screen — name each screen as its links do, or resolve the link in the mock's router:`);
    for (const d of dead) console.error(`  ${d.anchor}  (${d.count} link${d.count === 1 ? '' : 's'})`);
  }
  const shots = planShots(opts, discovered);
  if (!shots.length) {
    console.error('ui-snap: nothing to shoot — check --only and the screen names');
    return 2;
  }
  mkdirSync(join(opts.out, 'app'), { recursive: true });
  mkdirSync(join(opts.out, 'ref'), { recursive: true });
  // An Electron host (VS Code) leaks ELECTRON_RUN_AS_NODE into children; a Chromium binary started
  // with it set behaves as Node and never takes the screenshot.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(`ui-snap: ${shots.length} shot(s) with ${browser}`);
  await shootAll(browser, shots, opts, env);
  const compare = join(opts.out, 'compare.html');
  writeFileSync(compare, renderCompare(shots, opts));
  const app = shots.filter((s) => s.side === 'app' && s.ok);
  if (opts.writeGolden) {
    mkdirSync(opts.writeGolden, { recursive: true });
    for (const s of app) writeFileSync(join(opts.writeGolden, basename(s.file)), readFileSync(s.file));
    console.log(`ui-snap: ${app.length} golden shot(s) written to ${opts.writeGolden.replace(/\\/g, '/')}`);
  }
  if (opts.golden) {
    mkdirSync(join(opts.out, 'diff'), { recursive: true });
    for (const s of app) {
      s.golden = compareGolden(s.file, join(opts.golden, basename(s.file)), opts.threshold, join(opts.out, 'diff', basename(s.file)));
      if (!s.golden.ok) s.ok = false;
      console.log(`  ${s.golden.ok ? 'ok  ' : 'FAIL'} golden ${s.name} @${s.width}  ${s.golden.message}`);
    }
  }
  const failed = shots.filter((s) => !s.ok).length;
  if (opts.json) console.log(JSON.stringify({ script: 'ui-snap', threshold: opts.golden ? opts.threshold : null, shots: shots.map(({ side, name, width, file, ok, error, golden }) => ({ side, name, width, file, ok, error, golden })) }, null, 2));
  console.log(`ui-snap: ${shots.length - failed}/${shots.length} shot(s) · ${compare.replace(/\\/g, '/')}`);
  return failed ? 1 : 0;
}

if (process.argv[1]?.endsWith('ui-snap.mjs')) {
  process.exitCode = await main(process.argv.slice(2));
}
