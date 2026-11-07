#!/usr/bin/env node
/**
 * env-doctor.mjs — before a deploy, every key the app reads is in the secret store, set, and well
 * formed for this environment (DEV-CONTRACTS §13.4).
 *
 * A deploy that starts with a missing key fails halfway, on the first request that reads it, and
 * a key someone copied by hand into a server's `.env` is the one nobody can say the source of. The
 * key list, `ops/config/keys.md`, says what each environment needs; this reads it and checks one of
 * two things:
 *
 *   the values  — the environment a deploy job is about to start the app with: process.env, plus
 *                 `--file` (the env file the job wrote from the store). Every key the environment
 *                 needs is set and non-empty, matches its Format, and carries no carriage return
 *                 (an env file saved on Windows). A Postgres URL's host answers on its port, and
 *                 with `--clock-url` the local clock is within 30 s of that server's (TOTP fails
 *                 past it), that host resolves here (a stale resolver cache fails like a missing
 *                 record), and the Postgres URL is not a transaction pooler (WARN: it refuses session
 *                 parameters at startup). A checkout where git rewrites LF to CRLF is a WARN.
 *   the sender  — a mail sender key (named `*_SMTP_FROM`, `*_MAIL_FROM`, `*_EMAIL_FROM`, or Format
 *                 `email-sender`) fails on a free-mailbox domain: mail from gmail.com sent through a
 *                 relay fails DMARC alignment, so the provider says "sent" and the inbox never sees
 *                 it. With DNS (no `--no-dns`), `_dmarc.<domain>` must hold `v=DMARC1` (no `rua=`
 *                 is a WARN), and no DKIM key under the common selectors (or `--dkim-selector`) is
 *                 a WARN. Only the domain is printed, never the address.
 *   the store   — `--store gitlab`: the project's CI/CD variables hold every key the environment
 *                 needs, scoped to it (or to `*`); a production-scoped one is protected. Reads key names,
 *                 scopes and flags only — a value is never read into a finding or printed.
 *
 *   node dev/scripts/env-doctor.mjs --env staging [--keys ops/config/keys.md] [--file .env] [--clock-url https://…] [--no-db] [--no-dns] [--dkim-selector s1,s2] [--json]
 *   node dev/scripts/env-doctor.mjs --env production --store gitlab --project <id|group/name> [--gitlab-url https://gitlab.com]   # token in GITLAB_TOKEN
 *   node dev/scripts/env-doctor.mjs --env production --store gitlab --variables <variables.json>                                    # a saved API answer
 *
 * `keys.md` holds one table: | Key | Purpose | Source | Environments | Holder | Rotation | Format |.
 * Environments is `all` or a comma list (`staging, production`). Format is a kind — `any`, `url`,
 * `postgres-url`, `host`, `port`, `int`, `email` (a bare address: `fx <a@b.dev>` fails), `email-sender`
 * (a bare address, and the mail sender check above), `base64-32` (32 bytes, base64) — or `/regex/`.
 *
 * Exit 0 ready · 1 a finding · 2 usage error.
 */

import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { lookup, Resolver } from 'node:dns/promises';
import { spawnSync } from 'node:child_process';

const KINDS = {
  any: /[\s\S]+/,
  url: /^https?:\/\/[^\s]+$/,
  'postgres-url': /^postgres(?:ql)?:\/\/[^\s@]+@[^\s/:]+(?::\d+)?\/[^\s]+$/,
  host: /^[A-Za-z0-9.-]+(?::\d+)?$/,
  port: /^\d{1,5}$/,
  int: /^-?\d+$/,
  // A bare address only: an app that wants one refuses `Name <a@b.dev>` at boot.
  email: /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/,
};
KINDS['email-sender'] = KINDS.email;
/** A key that names the address product mail is sent from. */
const SENDER_NAME = /(?:^|_)(?:SMTP|MAIL|EMAIL)_FROM$/;
/** Mailbox providers whose domain a product may not send from: their DMARC policy rejects relayed mail. */
const FREE_MAILBOX = /^(?:gmail\.com|googlemail\.com|yahoo\.[a-z.]+|ymail\.com|outlook\.[a-z.]+|hotmail\.[a-z.]+|live\.[a-z.]+|msn\.com|icloud\.com|me\.com|mac\.com|proton\.me|protonmail\.com|pm\.me|aol\.com|gmx\.[a-z.]+|mail\.ru|yandex\.[a-z.]+|zoho\.com)$/;
/** DKIM selectors the common mail providers publish; `--dkim-selector` names the provider's own. */
export const DKIM_SELECTORS = ['default', 'dkim', 'mail', 'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'brevo1', 'brevo2', 'mandrill', 'resend', 'pm', 'smtp', 'mte1'];
const SKEW_SECONDS = 30;

/** Cells of a Markdown table row, trimmed, backticks dropped. */
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim().replace(/^`(.*)`$/, '$1'));

/** The key list: one entry per table row under a header whose first cell is "Key". */
export function parseKeys(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^\|\s*Key\s*\|/i.test(l));
  if (start < 0) return [];
  const head = cells(lines[start]).map((h) => h.toLowerCase());
  const col = (name) => head.indexOf(name);
  const keys = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.trim().startsWith('|')) break;
    const c = cells(line);
    const name = c[col('key')];
    if (!name || !/^[A-Z][A-Z0-9_]*$/.test(name)) continue;
    const envs = (c[col('environments')] ?? 'all').toLowerCase();
    // A Format may carry a note on the exact shape: `email (bare address, no display name)`.
    const raw = c[col('format')] || 'any';
    const f = /^(\/.+\/[a-z]*|[^\s(]+)(?:\s+\((.*)\))?$/.exec(raw);
    keys.push({ name, envs: envs === 'all' || !envs ? ['all'] : envs.split(/\s*,\s*/), format: f ? f[1] : raw, source: c[col('source')] ?? '' });
  }
  return keys;
}

/** The keys an environment needs. */
export const required = (keys, env) => keys.filter((k) => k.envs.includes('all') || k.envs.includes(env));

/** A format kind or `/regex/` as a test; null when the format names nothing known. */
export function formatTest(format) {
  const f = format.trim();
  if (f === 'base64-32') return (v) => /^[A-Za-z0-9+/]+={0,2}$/.test(v) && Buffer.from(v, 'base64').length === 32;
  if (KINDS[f]) return (v) => KINDS[f].test(v);
  const m = /^\/(.+)\/([a-z]*)$/.exec(f);
  return m ? (v) => new RegExp(m[1], m[2]).test(v) : null;
}

/** An env file's values, keeping a trailing carriage return so it can be reported. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s.exec(line);
    if (!m) continue;
    let v = m[2];
    const q = /^(["'])(.*)\1(\r?)$/s.exec(v);
    if (q) v = q[2] + q[3];
    out[m[1]] = v;
  }
  return out;
}

/** Findings for the values an environment is about to run with. Never includes a value. */
export function checkValues(keys, env, values) {
  const findings = [];
  for (const k of required(keys, env)) {
    const v = values[k.name];
    if (v === undefined || v.trim() === '') { findings.push({ key: k.name, problem: 'missing or empty' }); continue; }
    if (/\r/.test(v)) { findings.push({ key: k.name, problem: 'value ends with a carriage return (an env file saved with CRLF)' }); continue; }
    const t = formatTest(k.format);
    if (!t) findings.push({ key: k.name, problem: `unknown Format "${k.format}" in the key list` });
    else if (!t(v)) findings.push({ key: k.name, problem: `does not match Format ${k.format}` });
  }
  return findings;
}

/** Findings for the store: each needed key has a variable scoped to this env or `*`. */
export function checkStore(keys, env, variables) {
  const findings = [];
  for (const k of required(keys, env)) {
    const scoped = variables.filter((v) => v.key === k.name && (v.environment_scope === env || v.environment_scope === '*'));
    if (!scoped.length) { findings.push({ key: k.name, problem: `not in the store for ${env}` }); continue; }
    // A variable scoped to production holds a production value, so only protected branches may read
    // it. One scoped `*` is the same in every environment by intent (a host name, a tag): not a secret.
    if (env === 'production' && scoped.some((v) => v.environment_scope === 'production' && !v.protected)) findings.push({ key: k.name, problem: 'production variable is not protected' });
  }
  return findings;
}

/** Host and port of the first Postgres URL among the needed keys. */
export function dbTarget(keys, env, values) {
  for (const k of required(keys, env)) {
    if (k.format !== 'postgres-url' || !values[k.name]) continue;
    try { const u = new URL(values[k.name]); return { key: k.name, host: u.hostname, port: Number(u.port || 5432) }; } catch { /* reported by the format check */ }
  }
  return null;
}

/** Why a database URL will refuse `SET`-style startup parameters, or null. Never echoes the URL. */
export function poolerRisk(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (/-pooler\b|pooler\./i.test(u.hostname)) return `host \`${u.hostname.replace(/^[^.]*/, '…')}\` is a connection pooler`;
  if (u.port === '6432') return 'port 6432 is the PgBouncer default';
  if (/pgbouncer=true/i.test(u.search)) return '`pgbouncer=true` is set';
  return null;
}

/** A warning when git rewrites line endings on checkout (an env file or script saved with CRLF), or null. */
export function lineEndingRisk(autocrlf) {
  return autocrlf === 'true' ? 'git core.autocrlf=true rewrites LF to CRLF on checkout: clone with `-c core.autocrlf=false` or add `* text=auto eol=lf` to .gitattributes' : null;
}

/** The domain of a sender value, `a@b.dev` or `Name <a@b.dev>`, lower-cased; null when it has none. */
export function senderDomain(value) {
  const m = /@([A-Za-z0-9.-]+)>?\s*$/.exec(String(value ?? '').trim());
  return m ? m[1].toLowerCase().replace(/\.$/, '') : null;
}

export const isFreeMailbox = (domain) => FREE_MAILBOX.test(String(domain ?? '').toLowerCase());

/** The keys an environment needs that name a mail sender, by Format or by name. */
export const senderKeys = (keys, env) => required(keys, env).filter((k) => k.format === 'email-sender' || SENDER_NAME.test(k.name));

const txt = async (dns, name) => {
  try { return { records: (await dns.resolveTxt(name)).map((r) => r.join('')) }; }
  catch (e) { return ['ENOTFOUND', 'ENODATA'].includes(e?.code) ? { records: [] } : { error: e?.code ?? String(e?.message ?? e) }; }
};

/**
 * Findings and warnings for the mail sender keys. `dns` is `{ resolveTxt }` (node:dns/promises, or a
 * fake in a test); null skips the lookups (`--no-dns`). Names the domain, never the address.
 */
export async function checkMailSender(keys, env, values, { dns = null, selectors = DKIM_SELECTORS } = {}) {
  const findings = [];
  const warnings = [];
  const seen = new Set();
  for (const k of senderKeys(keys, env)) {
    const v = values[k.name];
    if (v === undefined || v.trim() === '') continue; // reported as missing by checkValues
    const domain = senderDomain(v);
    if (!domain) { findings.push({ key: k.name, problem: 'mail sender has no domain' }); continue; }
    if (isFreeMailbox(domain)) {
      findings.push({ key: k.name, problem: `mail sender is on the free-mailbox domain ${domain}: send from a domain the product owns, with the provider's DKIM, SPF or return-path and a DMARC record` });
      continue;
    }
    if (!dns || seen.has(domain)) continue;
    seen.add(domain);
    const dmarc = await txt(dns, `_dmarc.${domain}`);
    const policy = (dmarc.records ?? []).find((r) => /^v=DMARC1\b/i.test(r.trim()));
    if (dmarc.error) findings.push({ key: k.name, problem: `cannot look up _dmarc.${domain} (${dmarc.error}): run where DNS answers, or pass --no-dns and check it by hand` });
    else if (!policy) findings.push({ key: k.name, problem: `_dmarc.${domain} has no v=DMARC1 record: Gmail and Outlook may drop mail from it` });
    else if (!/\brua=/i.test(policy)) warnings.push({ key: k.name, problem: `_dmarc.${domain} has no rua=, so nobody receives the reports that show mail failing` });
    let dkim = false;
    for (const sel of selectors) {
      const r = await txt(dns, `${sel}._domainkey.${domain}`);
      if ((r.records ?? []).some((x) => /\bp=[A-Za-z0-9+/]/.test(x) || /v=DKIM1/i.test(x))) { dkim = true; break; }
    }
    if (!dkim) warnings.push({ key: k.name, problem: `no DKIM key found for ${domain} under selector(s) ${selectors.join(', ')}: pass the provider's with --dkim-selector` });
  }
  return { findings, warnings };
}

const reach = ({ host, port }) => new Promise((done) => {
  const s = connect({ host, port, timeout: 5000 });
  s.once('connect', () => { s.destroy(); done(true); });
  s.once('timeout', () => { s.destroy(); done(false); });
  s.once('error', () => done(false));
});

async function clockSkew(url) {
  const res = await fetch(url, { method: 'HEAD' });
  const date = Date.parse(res.headers.get('date') ?? '');
  return Number.isNaN(date) ? null : Math.round((Date.now() - date) / 1000);
}

async function gitlabVariables(base, project, token) {
  const all = [];
  for (let page = 1; page < 50; page++) {
    const res = await fetch(`${base}/api/v4/projects/${encodeURIComponent(project)}/variables?per_page=100&page=${page}`, { headers: { 'PRIVATE-TOKEN': token } });
    if (!res.ok) throw new Error(`GitLab answered ${res.status} for the project's variables`);
    const batch = await res.json();
    // Keep only what the check needs; the value never leaves this function.
    all.push(...batch.map(({ key, environment_scope, protected: p, masked }) => ({ key, environment_scope, protected: p, masked })));
    if (batch.length < 100) break;
  }
  return all;
}

function parseArgs(argv) {
  const a = { keys: 'ops/config/keys.md', db: true, dns: true, json: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--env') a.env = next();
    else if (k === '--keys') a.keys = next();
    else if (k === '--file') a.file = next();
    else if (k === '--clock-url') a.clockUrl = next();
    else if (k === '--store') a.store = next();
    else if (k === '--project') a.project = next();
    else if (k === '--gitlab-url') a.gitlabUrl = next();
    else if (k === '--variables') a.variables = next();
    else if (k === '--no-db') a.db = false;
    else if (k === '--no-dns') a.dns = false;
    else if (k === '--dkim-selector') a.selectors = String(next() ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    else if (k === '--json') a.json = true;
    else return { error: `unknown argument ${k}` };
  }
  if (!a.env) return { error: '--env is required' };
  if (a.selectors && !a.selectors.length) return { error: '--dkim-selector needs a comma list of selectors' };
  if (a.store && a.store !== 'gitlab') return { error: `--store ${a.store}: only gitlab is supported` };
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.error) { console.error(`env-doctor: ${a.error}`); return 2; }
  let keys;
  try { keys = parseKeys(readFileSync(a.keys, 'utf8')); } catch { console.error(`env-doctor: cannot read ${a.keys}`); return 2; }
  if (!keys.length) { console.error(`env-doctor: ${a.keys} has no | Key | … table`); return 2; }
  const need = required(keys, a.env);
  let findings = [];
  const warnings = [];
  const crlf = lineEndingRisk(spawnSync('git', ['config', 'core.autocrlf'], { encoding: 'utf8' }).stdout?.trim());
  if (crlf) warnings.push({ key: '(git)', problem: crlf });
  if (a.store) {
    let vars;
    if (a.variables) vars = JSON.parse(readFileSync(a.variables, 'utf8'));
    else {
      const token = process.env.GITLAB_TOKEN;
      if (!token || !a.project) { console.error('env-doctor: --store gitlab needs --project and GITLAB_TOKEN (or --variables <file>)'); return 2; }
      vars = await gitlabVariables(a.gitlabUrl ?? 'https://gitlab.com', a.project, token);
    }
    findings = checkStore(keys, a.env, vars);
  } else {
    const values = { ...process.env, ...(a.file ? parseEnvFile(readFileSync(a.file, 'utf8')) : {}) };
    findings = checkValues(keys, a.env, values);
    const mail = await checkMailSender(keys, a.env, values, { dns: a.dns ? new Resolver({ timeout: 5000, tries: 2 }) : null, selectors: a.selectors ?? DKIM_SELECTORS });
    findings.push(...mail.findings);
    warnings.push(...mail.warnings);
    const db = dbTarget(keys, a.env, values);
    if (a.db && db && !(await reach(db))) findings.push({ key: db.key, problem: `database host ${db.host}:${db.port} does not answer` });
    const risk = db && poolerRisk(values[db.key]);
    if (risk) warnings.push({ key: db.key, problem: `${risk}: it rejects session parameters such as statement_timeout at startup; use the direct URL if the app sets them` });
    if (a.clockUrl) {
      const host = new URL(a.clockUrl).hostname;
      if (!(await lookup(host).then(() => true, () => false))) findings.push({ key: '(dns)', problem: `${host} does not resolve here; compare a public resolver to tell a local cache from a missing record` });
      const skew = await clockSkew(a.clockUrl).catch(() => null);
      if (skew === null) findings.push({ key: '(clock)', problem: `no Date header from ${a.clockUrl}` });
      else if (Math.abs(skew) > SKEW_SECONDS) findings.push({ key: '(clock)', problem: `local clock is ${skew} s off ${a.clockUrl} (max ${SKEW_SECONDS})` });
    }
  }
  if (a.json) console.log(JSON.stringify({ env: a.env, checked: need.length, findings, warnings }, null, 2));
  else {
    for (const f of findings) console.log(`FAIL ${f.key}: ${f.problem}`);
    for (const w of warnings) console.log(`WARN ${w.key}: ${w.problem}`);
    console.log(`${findings.length ? 'NOT READY' : 'READY'} — ${a.env}: ${need.length} key(s) checked${a.store ? ` in the ${a.store} store` : ''}, ${findings.length} finding(s)`);
  }
  return findings.length ? 1 : 0;
}

if (process.argv[1]?.endsWith('env-doctor.mjs')) {
  main().then((code) => { process.exitCode = code; }, (e) => { console.error(`env-doctor: ${e.message}`); process.exitCode = 2; });
}
