#!/usr/bin/env node
/**
 * explore.mjs — drive a slice's behaviour rows in a real browser, one context per role (DEV-CONTRACTS §9, §13.3).
 *
 * release-management's QC pass found, after G8, six behaviour bugs that its ui-spec had specified:
 * a missing discard guard, focus not returned to the opener, filters not in the URL, Back not
 * guarded. Each took one Playwright probe to see. This runs those probes per slice, before the G7
 * review, so a finding goes back to the lane that owns the file while it is cheap. It is a
 * developer's smoke check of the spec's own rows — not functional certification, which is QA's.
 *
 *   node dev/scripts/explore.mjs --plan <plan.json> --slug <slug> --slice <n> [--root dev] [--out <file.md>]
 *
 * The plan is JSON, written by `dev-exploring-behaviour` from the slice's UB-NNN rows:
 *
 *   { "base": "http://127.0.0.1:5173",
 *     "roles": { "member": { "signIn": { "url": "/sign-in", "fields": { "E-mail": "$RM_MEMBER_EMAIL",
 *                "Password": "$RM_MEMBER_PASSWORD" }, "submit": { "role": "button", "name": "Sign in" } } },
 *                "viewer": { "storageState": "qc/viewer.json" } },
 *     "probes": [ { "ub": "UB-014", "role": "member", "kind": "discard-guard", "url": "/releases",
 *                   "open": { "role": "button", "name": "New release" }, "fill": { "label": "Name" },
 *                   "via": ["escape", "close", "back"], "guard": { "testid": "discard-bar" } } ] }
 *
 * Credentials are `$ENV` references, never values (§12.5). Locators: a CSS string, or
 * `{ role, name }`, `{ testid }`, `{ label }`, `{ text }`, each optionally `in` another locator.
 *
 * Probe kinds — each fails with what it saw:
 *   focus-return    open → close (Escape, or `closeBy`) → focus is back on the opener
 *   discard-guard   open → fill → each `via` (escape | close | back) → `guard` shows and the dialog stays
 *   url-state       `steps` → every `params` key is in the URL → reload → still there, and `keep` holds its value
 *   double-submit   `steps` → double-click `submit` → exactly one request matching `request`
 *   permission      as the role, open `url` → every `absent` locator is absent, `denied` is visible
 *   keyboard        from `url`, Tab (up to `max`, default 40) reaches `target`; then `press` and `expect`
 *   steps           only `steps` (goto · click · fill · press · select · expect · expectUrl · expectFocus)
 *
 * Every probe saves an accessibility snapshot (`locator('body').ariaSnapshot()`) beside the note.
 * Playwright comes from the project (`npm i -D playwright`), or PLAYWRIGHT_PATH; Edge is launched
 * with `chromium.launch({ channel: 'msedge' })`, or `EXPLORE_CHANNEL`. Without Playwright the note
 * says NOT RUN and why.
 *
 * Exit 0 every probe passed · 1 a probe failed · 2 usage error, or not run.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findRoot } from './lib/root.mjs';

export const KINDS = ['focus-return', 'discard-guard', 'url-state', 'double-submit', 'permission', 'keyboard', 'steps'];

/** Read and check a plan; every problem in one error. */
export function readPlan(json) {
  const p = typeof json === 'string' ? JSON.parse(json) : json;
  const problems = [];
  if (!p || typeof p !== 'object') throw new Error('the plan is not a JSON object');
  if (typeof p.base !== 'string' || !/^https?:\/\//.test(p.base)) problems.push('`base` is the app URL (http:// or https://)');
  const roles = p.roles && typeof p.roles === 'object' ? p.roles : {};
  if (!Object.keys(roles).length) problems.push('`roles` names at least one role');
  for (const [name, r] of Object.entries(roles)) {
    for (const [field, v] of Object.entries(r?.signIn?.fields ?? {})) {
      if (typeof v !== 'string' || !/^\$[A-Z][A-Z0-9_]*$/.test(v)) problems.push(`role \`${name}\` field \`${field}\`: a sign-in value is an $ENV reference, never a literal (§12.5)`);
    }
    if (!r?.signIn && !r?.storageState && !r?.anonymous) problems.push(`role \`${name}\`: give \`signIn\`, \`storageState\` or \`anonymous: true\``);
  }
  if (!Array.isArray(p.probes) || !p.probes.length) problems.push('`probes` lists at least one probe');
  for (const [i, pr] of (p.probes ?? []).entries()) {
    const at = `probe ${i + 1}${pr?.ub ? ` (${pr.ub})` : ''}`;
    if (!/^UB-\d{3,}$/.test(String(pr?.ub ?? ''))) problems.push(`${at}: \`ub\` is the behaviour row it checks (UB-NNN)`);
    if (!KINDS.includes(pr?.kind)) problems.push(`${at}: kind \`${pr?.kind}\` — one of ${KINDS.join(', ')}`);
    if (!roles[pr?.role]) problems.push(`${at}: role \`${pr?.role}\` is not in \`roles\``);
    const need = { 'focus-return': ['open'], 'discard-guard': ['open', 'fill', 'guard'], 'url-state': ['params'], 'double-submit': ['submit', 'request'], permission: ['url'], keyboard: ['url', 'target'], steps: ['steps'] }[pr?.kind] ?? [];
    for (const k of need) if (pr?.[k] === undefined) problems.push(`${at}: ${pr.kind} needs \`${k}\``);
  }
  if (problems.length) throw new Error(problems.join('\n'));
  return p;
}

/** `$NAME` → the environment's value; a missing one is an error, never an empty string. */
export function envValue(v, env = process.env) {
  if (typeof v !== 'string' || !v.startsWith('$')) return v;
  const val = env[v.slice(1)];
  if (val === undefined) throw new Error(`environment variable ${v.slice(1)} is not set`);
  return val;
}

/** Playwright from PLAYWRIGHT_PATH or the project; `{ chromium }` or `{ reason }`. */
export async function loadPlaywright({ from = process.cwd(), env = process.env } = {}) {
  try {
    const spec = env.PLAYWRIGHT_PATH ? join(resolve(env.PLAYWRIGHT_PATH), 'index.mjs') : createRequire(join(resolve(from), 'noop.js')).resolve('playwright');
    const mod = await import(pathToFileURL(spec.replace(/index\.js$/, 'index.mjs')).href);
    return { chromium: mod.chromium ?? mod.default?.chromium };
  } catch (err) {
    return { reason: `Playwright is not installed in ${resolve(from)} or a parent (npm i -D playwright), and PLAYWRIGHT_PATH is not set — ${err.message.split('\n')[0]}` };
  }
}

function loc(page, spec) {
  if (spec === undefined || spec === null) throw new Error('a locator is missing');
  const scope = spec.in ? loc(page, spec.in) : page;
  if (typeof spec === 'string') return scope.locator(spec);
  if (spec.role) return scope.getByRole(spec.role, spec.name !== undefined ? { name: spec.name, exact: spec.exact ?? true } : {});
  if (spec.testid) return scope.getByTestId(spec.testid);
  if (spec.label) return scope.getByLabel(spec.label, { exact: spec.exact ?? false });
  if (spec.text) return scope.getByText(spec.text, { exact: spec.exact ?? false });
  if (spec.css) return scope.locator(spec.css);
  throw new Error(`cannot read locator ${JSON.stringify(spec)}`);
}

const describe = (spec) => (typeof spec === 'string' ? spec : spec.role ? `${spec.role} "${spec.name ?? ''}"` : spec.testid ? `testid ${spec.testid}` : spec.label ? `label "${spec.label}"` : spec.text ? `text "${spec.text}"` : JSON.stringify(spec));
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function goto(page, base, url) {
  await page.goto(new URL(url ?? '/', base).href);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function activeIs(page, locator) {
  const h = await locator.first().elementHandle({ timeout: 2000 }).catch(() => null);
  if (!h) return { same: false, now: 'the opener is no longer in the page' };
  const same = await h.evaluate((el) => el === document.activeElement || el.contains(document.activeElement));
  const now = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') ?? a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` : 'nothing'; });
  return { same, now };
}

async function runSteps(page, base, steps = []) {
  for (const s of steps) {
    if (s.goto !== undefined) await goto(page, base, s.goto);
    else if (s.click) await loc(page, s.click).first().click();
    else if (s.fill) await loc(page, s.fill).first().fill(String(envValue(s.value ?? 'explore')));
    else if (s.select) await loc(page, s.select).first().selectOption(String(s.value));
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.expect) { if (!(await loc(page, s.expect).first().isVisible())) throw new Error(`expected ${describe(s.expect)} to be visible`); } else if (s.expectUrl) { if (!page.url().includes(s.expectUrl)) throw new Error(`expected the URL to contain \`${s.expectUrl}\`, it is ${page.url()}`); } else if (s.expectFocus) {
      const a = await activeIs(page, loc(page, s.expectFocus));
      if (!a.same) throw new Error(`expected focus on ${describe(s.expectFocus)}, it is on ${a.now}`);
    } else if (s.wait) await sleep(Number(s.wait));
    else throw new Error(`cannot read step ${JSON.stringify(s)}`);
    await sleep(s.settle ?? 150);
  }
}

const dialogOf = (page, pr) => loc(page, pr.dialog ?? { role: 'dialog' });

/** One probe on one page. Throws with what it saw; returns a one-line evidence string. */
export async function runProbe(page, base, pr) {
  if (pr.url !== undefined && pr.kind !== 'url-state') await goto(page, base, pr.url);
  await runSteps(page, base, pr.before);
  switch (pr.kind) {
    case 'focus-return': {
      const opener = loc(page, pr.open).first();
      await opener.click();
      await dialogOf(page, pr).first().waitFor({ timeout: 5000 });
      await sleep(200);
      if (pr.closeBy) await loc(page, pr.closeBy).first().click(); else await page.keyboard.press(pr.closeKey ?? 'Escape');
      await sleep(300);
      if (await dialogOf(page, pr).first().isVisible()) throw new Error('the dialog is still open after closing it');
      const a = await activeIs(page, opener);
      if (!a.same) throw new Error(`focus went to ${a.now}, not back to ${describe(pr.open)}`);
      return `focus returned to ${describe(pr.open)}`;
    }
    case 'discard-guard': {
      const seen = [];
      for (const via of [].concat(pr.via ?? ['escape'])) {
        await goto(page, base, pr.url ?? page.url());
        await runSteps(page, base, pr.before);
        await loc(page, pr.open).first().click();
        await dialogOf(page, pr).first().waitFor({ timeout: 5000 });
        await loc(page, pr.fill).first().fill(String(envValue(pr.value ?? 'typed by explore')));
        if (via === 'escape') await page.keyboard.press('Escape');
        else if (via === 'close') await loc(page, pr.closeBy ?? { role: 'button', name: 'Close', in: pr.dialog ?? { role: 'dialog' } }).first().click();
        else if (via === 'back') await page.goBack().catch(() => {});
        else throw new Error(`via \`${via}\` — escape, close or back`);
        await sleep(400);
        const guard = await loc(page, pr.guard).first().isVisible();
        const open = await dialogOf(page, pr).first().isVisible();
        if (!guard || !open) throw new Error(`${via} with typed input: ${!open ? 'the dialog closed and the input is lost' : 'no guard'} — expected ${describe(pr.guard)}`);
        seen.push(via);
      }
      return `guard shown on ${seen.join(', ')}`;
    }
    case 'url-state': {
      await goto(page, base, pr.url ?? '/');
      await runSteps(page, base, pr.steps);
      const want = Object.entries(pr.params);
      const missing = (u) => want.filter(([k, v]) => { const got = new URL(u).searchParams.get(k); return v === true ? got === null : got !== String(v); }).map(([k, v]) => `${k}=${v === true ? '…' : v}`);
      const before = missing(page.url());
      if (before.length) throw new Error(`the URL lacks ${before.join(', ')}: ${page.url()}`);
      const values = [];
      for (const k of [].concat(pr.keep ?? [])) values.push(await loc(page, k).first().inputValue().catch(async () => (await loc(page, k).first().textContent()) ?? ''));
      await page.reload();
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(300);
      const after = missing(page.url());
      if (after.length) throw new Error(`after reload the URL lacks ${after.join(', ')}`);
      for (const [i, k] of [].concat(pr.keep ?? []).entries()) {
        const v = await loc(page, k).first().inputValue().catch(async () => (await loc(page, k).first().textContent()) ?? '');
        if (v !== values[i]) throw new Error(`after reload ${describe(k)} is "${v}", was "${values[i]}"`);
      }
      return `${want.map(([k]) => k).join(', ')} in the URL, kept on reload`;
    }
    case 'double-submit': {
      await runSteps(page, base, pr.steps);
      let n = 0;
      const match = (req) => req.method() === (pr.request.method ?? 'POST') && req.url().includes(pr.request.url ?? '');
      const on = (req) => { if (match(req)) n += 1; };
      page.on('request', on);
      await loc(page, pr.submit).first().dblclick();
      await sleep(pr.settle ?? 1200);
      page.off('request', on);
      if (n !== 1) throw new Error(`a double click sent ${n} matching request(s), expected exactly 1`);
      return 'one request on a double click';
    }
    case 'permission': {
      for (const a of [].concat(pr.absent ?? [])) if (await loc(page, a).first().isVisible().catch(() => false)) throw new Error(`${describe(a)} is shown to this role`);
      if (pr.denied && !(await loc(page, pr.denied).first().isVisible())) throw new Error(`expected the denial ${describe(pr.denied)}`);
      return 'denied as specified';
    }
    case 'keyboard': {
      const target = loc(page, pr.target).first();
      let reached = false;
      for (let i = 0; i < (pr.max ?? 40) && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = (await activeIs(page, target)).same;
      }
      if (!reached) throw new Error(`Tab never reached ${describe(pr.target)} in ${pr.max ?? 40} presses`);
      if (pr.press) await page.keyboard.press(pr.press);
      await sleep(300);
      if (pr.expect && !(await loc(page, pr.expect).first().isVisible())) throw new Error(`after ${pr.press}, ${describe(pr.expect)} is not visible`);
      return `reached ${describe(pr.target)} by keyboard`;
    }
    case 'steps':
      await runSteps(page, base, pr.steps);
      return `${pr.steps.length} step(s) as specified`;
    default:
      throw new Error(`unknown kind ${pr.kind}`);
  }
}

async function signIn(page, base, s) {
  await goto(page, base, s.url ?? '/sign-in');
  for (const [label, v] of Object.entries(s.fields ?? {})) await page.getByLabel(label, { exact: false }).first().fill(String(envValue(v)));
  await loc(page, s.submit ?? { role: 'button', name: 'Sign in' }).first().click();
  const away = s.url ?? '/sign-in';
  await page.waitForURL((u) => !new URL(u).pathname.startsWith(away.split('?')[0]), { timeout: 15000 });
}

/** Run every probe, one browser context per role. Results carry the snapshot path. */
export async function explore(plan, { chromium, outDir, channel = process.env.EXPLORE_CHANNEL ?? 'msedge', headless = true }) {
  mkdirSync(join(outDir, 'snaps'), { recursive: true });
  const browser = await chromium.launch({ channel: channel || undefined, headless });
  const results = [];
  try {
    for (const role of [...new Set(plan.probes.map((p) => p.role))]) {
      const r = plan.roles[role];
      const ctx = await browser.newContext({ viewport: plan.viewport ?? { width: 1366, height: 900 }, ...(r.storageState ? { storageState: r.storageState } : {}) });
      try {
        const page = await ctx.newPage();
        const console_ = [];
        page.on('pageerror', (e) => console_.push(`pageerror: ${e.message.slice(0, 200)}`));
        if (r.signIn) await signIn(page, plan.base, r.signIn);
        for (const pr of plan.probes.filter((p) => p.role === role)) {
          const name = `${pr.ub}-${role}-${pr.kind}`;
          const res = { ub: pr.ub, role, kind: pr.kind, note: pr.note ?? '', result: 'PASS', evidence: '', snapshot: `snaps/${name}.txt` };
          try {
            res.evidence = await runProbe(page, plan.base, pr);
          } catch (err) {
            res.result = 'FAIL';
            res.evidence = err.message.split('\n')[0];
          }
          try { writeFileSync(join(outDir, res.snapshot), `${page.url()}\n${await page.locator('body').ariaSnapshot()}\n`); } catch (err) { writeFileSync(join(outDir, res.snapshot), `snapshot failed: ${err.message}\n`); }
          if (console_.length) res.evidence += ` · ${console_.splice(0).join(' · ')}`;
          results.push(res);
        }
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  return results;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The exploration note — `artifact: exploration`, linted like any artifact, never a gate output. */
export function renderNote({ slug, slice, base, commit, roles, results, notRun, today = new Date().toISOString().slice(0, 10), owners = {} }) {
  const fails = (results ?? []).filter((r) => r.result === 'FAIL');
  const lines = [
    '---', `slug: ${slug}`, 'stage: implementation', 'artifact: exploration', 'status: draft', 'authored_by: dev-exploring-behaviour', 'reviewed_by: pending', 'tracker: none', `created: ${today}`, `updated: ${today}`, 'requirements: []', '---', '',
    '## Scope', '',
    `Slice ${slice}, commit ${commit ?? 'unknown'}, against ${base}. Roles: ${(roles ?? []).join(', ') || 'none'}. A developer smoke check of the slice's behaviour rows (DEV-CONTRACTS §9) — not functional certification; the automation-tier list in the QA handoff is unchanged.`, '',
    '## Rows explored', '',
  ];
  if (notRun) lines.push(`NOT RUN — ${notRun}`, '');
  else {
    lines.push('| UB | Role | Probe | Result | Evidence | Snapshot |', '|---|---|---|---|---|---|');
    for (const r of results) lines.push(`| ${r.ub} | ${r.role} | ${r.kind} | ${r.result} | ${cell(r.evidence)} | ${r.snapshot} |`);
    lines.push('');
  }
  lines.push('## Findings', '');
  if (notRun) lines.push('None recorded: the pass did not run. Run it before the slice review, or say in the review why not.', '');
  else if (!fails.length) lines.push('None. Every probe passed.', '');
  else {
    lines.push('Each goes back to the lane that owns the file, as a task in its next wave, before the slice review (§5.5).', '', '| UB | Role | What was seen | Owning lane |', '|---|---|---|---|');
    for (const r of fails) lines.push(`| ${r.ub} | ${r.role} | ${cell(r.evidence)} | ${owners[r.ub] ?? 'to assign'} |`);
    lines.push('');
  }
  lines.push('## Not explored', '', 'Rows of this slice the plan has no probe for, with the reason, are listed here by the skill. None when every row has one.', '');
  return lines.join('\n');
}

export function parseArgs(argv) {
  const o = { plan: null, slug: null, slice: null, root: null, out: null, commit: null, owners: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, v] = [argv[i], argv[i + 1]];
    if (!['--plan', '--slug', '--slice', '--root', '--out', '--commit', '--owners'].includes(flag)) throw new Error(`unknown argument ${flag}`);
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    o[flag.slice(2)] = v;
  }
  for (const k of ['plan', 'slug', 'slice']) if (!o[k]) throw new Error(`give --${k}`);
  if (!/^(\d+|final)$/.test(o.slice)) throw new Error('--slice is a number, or final');
  o.root = findRoot({ explicit: o.root }).root;
  o.out ??= join(o.root, 'implementation', o.slug, 'exploration', `slice-${o.slice}.md`);
  return o;
}

async function main(argv) {
  let o;
  let plan;
  try {
    o = parseArgs(argv);
    plan = readPlan(readFileSync(o.plan, 'utf8'));
  } catch (err) {
    console.error(`explore: ${err.message}\nusage: explore.mjs --plan <plan.json> --slug <slug> --slice <n> [--root dev] [--out <file.md>] [--commit <sha>] [--owners <UB→lane json>]`);
    return 2;
  }
  const owners = o.owners ? JSON.parse(readFileSync(o.owners, 'utf8')) : {};
  const outDir = dirname(resolve(o.out));
  mkdirSync(outDir, { recursive: true });
  const meta = { slug: o.slug, slice: o.slice, base: plan.base, commit: o.commit, roles: Object.keys(plan.roles), owners };
  const pw = await loadPlaywright();
  if (!pw.chromium) {
    writeFileSync(o.out, renderNote({ ...meta, notRun: pw.reason }));
    console.log(`explore: NOT RUN — ${pw.reason}\nwrote ${relative(process.cwd(), o.out)}`);
    return 2;
  }
  let results;
  try {
    results = await explore(plan, { chromium: pw.chromium, outDir });
  } catch (err) {
    writeFileSync(o.out, renderNote({ ...meta, notRun: err.message.split('\n')[0] }));
    console.error(`explore: NOT RUN — ${err.message.split('\n')[0]}`);
    return 2;
  }
  writeFileSync(o.out, renderNote({ ...meta, results }));
  for (const r of results) console.log(`${r.result === 'PASS' ? 'ok  ' : 'FAIL'} ${r.ub} ${r.role} ${r.kind} — ${r.evidence}`);
  const fails = results.filter((r) => r.result === 'FAIL').length;
  console.log(`explore: ${results.length} probe(s) · ${fails} failed · wrote ${relative(process.cwd(), o.out) || o.out}`);
  return fails ? 1 : 0;
}

if (process.argv[1]?.endsWith('explore.mjs')) process.exitCode = await main(process.argv.slice(2));
