#!/usr/bin/env node
/**
 * obs-check.mjs — the code emits exactly the log events and metrics observability.md lists
 * (DEV-CONTRACTS §13.5, §13.11).
 *
 * Reads `## Log events` (Event | Level | Fields | Emitted when) and `## Metrics` (Metric | Type |
 * Labels | Cardinality | Serves) from `monitoring/<slug>/observability.md`, then the sources:
 *
 *   event call    the one logging API (DEV-PROFILE `Event API`; unset, the language adapter's:
 *                 `obs.Event` in Go, `obs.event` in Python and TypeScript): its name argument (the
 *                 adapter's `eventArg`) is the event name; a non-literal is E115
 *   sources       the backend code lib/langs.mjs isServerFile() names, Next.js server code included
 *   other APIs    `slog.*`, `log.Print*`, `logger.*` (DEV-PROFILE `Other log APIs`) writing a
 *                 dotted event name: E116, the second logging path
 *   metrics       `Name: "x"` inside prometheus *Opts, OTel `meter.Int64Counter("x")`-style calls
 *
 *   node dev/scripts/obs-check.mjs <slug> [--root dev] [--source .] [--catalogue <observability.md>]
 *        [--app <prefix>] [--profile <DEV-PROFILE.md>] [--json]
 *
 * Exit 1 on any error, 2 on a usage error.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDoc, plain, readTable } from './lib/doc.mjs';
import { Findings, report, parseArgs, loadProfile, configured, splitList, readServerSources, isTestFile, lineAt, blankComments, commentStyle } from './lib/check.mjs';
import { langOf } from './lib/langs.mjs';
import { findRoot } from './lib/root.mjs';

export const VERBS = ['created', 'updated', 'deleted', 'completed', 'failed', 'started', 'refused', 'skipped', 'retried', 'expired', 'sent', 'received'];
export const REQUEST_EVENT = 'http.request_completed';
export const LEVELS = ['debug', 'info', 'warn', 'error'];
export const DEFAULTS = {
  eventApi: 'obs.Event',
  otherApis: 'slog.Info, slog.Warn, slog.Error, slog.Debug, slog.Log, .InfoContext, .WarnContext, .ErrorContext, .DebugContext, .Info, .Warn, .Error, .Debug, log.Printf, log.Println, logger.info, logger.warning, logger.error, logger.debug',
};

/** `<domain>.<noun>_<verb>` with the verb from the closed set. */
export function eventGrammar(name, verbs = VERBS) {
  const m = /^([a-z][a-z0-9]*)\.([a-z][a-z0-9_]*)$/.exec(name);
  if (!m) return `\`${name}\` is not <domain>.<noun>_<verb> (lowercase, one dot)`;
  const parts = m[2].split('_');
  if (parts.length < 2) return `\`${name}\` has no <noun>_ before the verb`;
  if (!verbs.includes(parts.at(-1))) return `\`${name}\` ends in \`${parts.at(-1)}\`, not one of ${verbs.join(', ')}`;
  return null;
}

/** `<app>_<noun>_<unit>`: counters `_total`, histograms of time `_duration_seconds`, a unit always. */
export function metricGrammar(name, type, app) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return `\`${name}\` is not snake_case`;
  if (app && !name.startsWith(`${app}_`)) return `\`${name}\` has no \`${app}_\` prefix`;
  const t = String(type ?? '').toLowerCase();
  if (t === 'counter' && !name.endsWith('_total')) return `counter \`${name}\` does not end in _total`;
  if (t !== 'counter' && name.endsWith('_total')) return `${t || 'non-counter'} \`${name}\` ends in _total`;
  if (t === 'histogram' && /(_seconds)$/.test(name) && !/_duration_seconds$/.test(name) && !/_(wait|age|lag)_seconds$/.test(name)) return `histogram \`${name}\` of time is not <noun>_duration_seconds`;
  if (t === 'histogram' && !/_(seconds|bytes)$/.test(name)) return `histogram \`${name}\` names no unit (_seconds, _bytes)`;
  if (t === 'gauge' && !/_(seconds|bytes|ratio|count|items|info|total)$/.test(name) && !/_(in_use|pending|running|open|active|size)$/.test(name)) return `gauge \`${name}\` names no unit`;
  return null;
}

// A name cell keeps its underscores: plain() strips them as markdown emphasis.
const cell = (c) => String(c ?? "").replace(/[`*]/g, "").trim();

export function readCatalogue(text) {
  const body = parseDoc(text).body;
  const events = readTable(body, 'Log events').map((r) => ({ name: cell(r.event),level: plain(r.level).toLowerCase() })).filter((e) => e.name);
  const metrics = readTable(body, 'Metrics').map((r) => ({ name: cell(r.metric),type: plain(r.type).toLowerCase() })).filter((m) => m.name);
  return { events, metrics };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The logging call a second-API match names, for the E116 message: `log.InfoContext`, or
 * `….ErrorContext` when the receiver is itself a call (`m.log().ErrorContext`) — slicing at the
 * first `(` printed an empty name there.
 */
export function callName(match) {
  const head = match.replace(/^[^\w.)\]]+/, '').split(/\(\s*(?:ctx\b|r\.Context|slog\.Level|")/)[0];
  const tail = /\w+(?:\.\w+)*$/.exec(head)?.[0] ?? head;
  return /[)\]]\.$/.test(head.slice(0, head.length - tail.length)) ? `….${tail}` : tail;
}

/** Scan sources for events, dynamic names, second-API log lines and metric names. */
export function scanSources(files, { eventApi, otherApis = splitList(DEFAULTS.otherApis) } = {}) {
  const events = [];
  const dynamic = [];
  const other = [];
  const metrics = [];
  const levelOf = new Map(); // event → level, from a `"name": slog.LevelWarn` table
  const others = otherApis.map((a) => new RegExp(`(?:^|[^\\w.])${a.startsWith('.') ? `[\\w)\\]]+${esc(a)}` : esc(a)}\\(\\s*(?:ctx\\s*,\\s*|r\\.Context\\(\\)\\s*,\\s*)?(?:slog\\.Level\\w+\\s*,\\s*)?"([a-z][a-z0-9_]*\\.[a-z0-9_.]+)"`, 'g'));
  // A configured API holds for every file; unset, each language's adapter names its own.
  const apiOf = (rel) => eventApi ?? langOf(rel)?.eventApi ?? DEFAULTS.eventApi;
  const bareOf = (rel) => apiOf(rel).split('.').at(-1);
  // The name is the adapter's `eventArg`: after the context in Go, first where it is implicit.
  const callRe = (head, arg) => new RegExp(`${head}\\(\\s*${arg ? '(?:[^,()]|\\(\\))+,\\s*' : ''}([^,)]+)`, 'g');
  // The API's own package calls it unqualified: in Go every file of the package (`Requests` in
  // obs/http.go writes through `Event` from obs/obs.go), in Python the one module.
  const scopeOf = (rel) => (langOf(rel)?.id === 'go' ? rel.slice(0, rel.lastIndexOf('/') + 1) : rel);
  const definesApi = (f) => {
    const src = langOf(f.rel)?.defines;
    return !!src && new RegExp(src.replaceAll('{name}', esc(bareOf(f.rel)))).test(blankComments(f.text, commentStyle(f.rel)));
  };
  const apiScopes = new Set(files.filter((f) => !isTestFile(f.rel) && definesApi(f)).map((f) => scopeOf(f.rel)));
  for (const f of files) {
    if (isTestFile(f.rel)) continue;
    const lang = commentStyle(f.rel);
    const code = blankComments(f.text, lang);
    const apiDefined = apiScopes.has(scopeOf(f.rel));
    const arg = langOf(f.rel)?.eventArg ?? 1;
    const calls = apiDefined ? callRe(`(?<![\\w.])${esc(bareOf(f.rel))}`, arg) : callRe(esc(apiOf(f.rel)), arg);
    for (const m of code.matchAll(calls)) {
      const arg = m[1].trim();
      const line = lineAt(code, m.index);
      const lit = /^"([^"]*)"$/.exec(arg) ?? /^'([^']*)'$/.exec(arg);
      if (lit) events.push({ name: lit[1], rel: f.rel, line });
      else if (!apiDefined) dynamic.push({ expr: arg, rel: f.rel, line });
    }
    for (const re of others) {
      for (const m of code.matchAll(re)) {
        if (apiDefined) continue; // the event API's own body writes through slog
        other.push({ name: m[1], rel: f.rel, line: lineAt(code, m.index), call: callName(m[0]) });
      }
    }
    for (const m of code.matchAll(/^\s*"([a-z][a-z0-9_]*\.[a-z0-9_]+)"\s*:\s*slog\.Level(\w+)/gm)) levelOf.set(m[1], m[2].toLowerCase());
    for (const m of code.matchAll(/^\s*["']([a-z][a-z0-9_]*\.[a-z0-9_]+)["']\s*:\s*logging\.(DEBUG|INFO|WARNING|WARN|ERROR)\b/gm)) levelOf.set(m[1], m[2].toLowerCase().replace('warning', 'warn'));
    for (const m of code.matchAll(/\b(Counter|Gauge|Histogram|Summary)(?:Vec)?Opts\s*\{/g)) {
      const body = code.slice(m.index, m.index + 600);
      const n = /\bName:\s*"([^"]+)"/.exec(body);
      const ns = /\bNamespace:\s*"([^"]+)"/.exec(body.slice(0, n ? n.index + 60 : 600));
      if (n) metrics.push({ name: (ns ? `${ns[1]}_` : '') + n[1], type: m[1].toLowerCase(), rel: f.rel, line: lineAt(code, m.index) });
    }
    for (const m of code.matchAll(/\.\s*(?:Int64|Float64)(Counter|UpDownCounter|Histogram|Gauge|ObservableGauge|ObservableCounter)\(\s*"([^"]+)"/g)) {
      metrics.push({ name: m[2].replace(/\./g, '_'), type: /Counter/.test(m[1]) ? 'counter' : m[1].toLowerCase().replace('observable', ''), rel: f.rel, line: lineAt(code, m.index) });
    }
    for (const m of code.matchAll(/\b(Counter|Gauge|Histogram|Summary)\(\s*["']([a-z][a-z0-9_]*)["']/g)) {
      if (lang === 'py') metrics.push({ name: m[2], type: m[1].toLowerCase(), rel: f.rel, line: lineAt(code, m.index) });
    }
  }
  return { events, dynamic, other, metrics, levelOf };
}

export function check({ catalogue, files, app, eventApi, otherApis, verbs = VERBS }, findings = new Findings(), catalogueFile = 'observability.md') {
  const cat = catalogue ? readCatalogue(catalogue) : { events: [], metrics: [] };
  for (const e of cat.events) {
    const g = eventGrammar(e.name, verbs);
    if (g) findings.add('W107', catalogueFile, 0, g);
    if (!LEVELS.includes(e.level)) findings.add('W107', catalogueFile, 0, `${e.name}: level \`${e.level}\` is not one of ${LEVELS.join(', ')}`);
  }
  for (const m of cat.metrics) {
    const g = metricGrammar(m.name, m.type, app);
    if (g) findings.add('W108', catalogueFile, 0, g);
  }
  const summary = { 'catalogue events': cat.events.length, 'catalogue metrics': cat.metrics.length };
  if (!files) return { findings, summary };

  const scan = scanSources(files, { eventApi, otherApis });
  const catEvents = new Map(cat.events.map((e) => [e.name, e]));
  const catMetrics = new Map(cat.metrics.map((m) => [m.name, m]));
  const codeEvents = new Map();
  for (const e of [...scan.events, ...scan.other]) if (!codeEvents.has(e.name)) codeEvents.set(e.name, e);

  if (catalogue) {
    for (const [name, at] of codeEvents) if (!catEvents.has(name)) findings.add('E114', at.rel, at.line, `event \`${name}\` is not in ## Log events`);
    for (const name of catEvents.keys()) if (!codeEvents.has(name)) findings.add('E114', catalogueFile, 0, `event \`${name}\` is in ## Log events and never emitted`);
    const codeMetrics = new Map(scan.metrics.map((m) => [m.name, m]));
    for (const [name, at] of codeMetrics) if (!catMetrics.has(name)) findings.add('E114', at.rel, at.line, `metric \`${name}\` is not in ## Metrics`);
    for (const name of catMetrics.keys()) if (!codeMetrics.has(name)) findings.add('E114', catalogueFile, 0, `metric \`${name}\` is in ## Metrics and never registered`);
    for (const [name, lvl] of scan.levelOf) {
      const want = catEvents.get(name)?.level;
      if (want && want !== lvl) findings.add('W107', 'code', 0, `event \`${name}\` is written at ${lvl}; the catalogue says ${want}`);
    }
  } else {
    // No catalogue yet: judge names alone, so the run still says what the catalogue must fix.
    for (const [name, at] of codeEvents) { const g = eventGrammar(name, verbs); if (g) findings.add('W107', at.rel, at.line, g); }
    for (const m of scan.metrics) { const g = metricGrammar(m.name, m.type, app); if (g) findings.add('W108', m.rel, m.line, g); }
  }
  // One request log line per request, and the request id echoed (§13.5).
  if (catalogue && !catEvents.has(REQUEST_EVENT)) findings.add('E114', catalogueFile, 0, `## Log events has no \`${REQUEST_EVENT}\` — one line per request, with OTel http.* attributes`);
  const echoes = files.some((f) => !isTestFile(f.rel) && /["']X-Request-I[dD]["']/.test(f.text) && /\.(Set|Add|set|append)\(\s*["']X-Request-I[dD]["']|headers\[\s*["']X-Request-I[dD]["']\s*\]\s*=/.test(f.text));
  if (!echoes) findings.add('W107', 'code', 0, 'no response sets `X-Request-Id` — echo the request id (§13.5)');
  summary['request log event'] = codeEvents.has(REQUEST_EVENT) ? 'yes' : 'no';
  summary['X-Request-Id echoed'] = echoes ? 'yes' : 'no';

  for (const d of scan.dynamic) findings.add('E115', d.rel, d.line, `event name built at runtime (\`${d.expr.slice(0, 50)}\`) — write the literal`);
  for (const o of scan.other) findings.add('E116', o.rel, o.line, `\`${o.name}\` written through \`${o.call}\`, not ${eventApi ?? DEFAULTS.eventApi}`);

  Object.assign(summary, {
    'events in code': codeEvents.size,
    'event-API calls': scan.events.length,
    'second-API log lines': scan.other.length,
    'files on the second API': new Set(scan.other.map((o) => o.rel)).size,
    'files on the event API': new Set(scan.events.map((e) => e.rel)).size,
    'dynamic event names': scan.dynamic.length,
    'metrics in code': new Set(scan.metrics.map((m) => m.name)).size,
    'metrics without the app prefix': app ? new Set(scan.metrics.filter((m) => !m.name.startsWith(`${app}_`)).map((m) => m.name)).size : 'n/a',
    'events outside the grammar': [...codeEvents.keys()].filter((n) => eventGrammar(n, verbs)).length,
  });
  return { findings, summary, scan };
}

function main(argv) {
  const a = parseArgs(argv, ['json']);
  const slug = a._[0];
  const root = findRoot({ explicit: a.root }).root;
  const source = resolve(a.source ?? '.');
  const catPath = a.catalogue ?? (slug ? join(root, 'monitoring', slug, 'observability.md') : null);
  if (!catPath) { console.error('usage: obs-check.mjs <slug> [--root dev] [--source .] [--catalogue <path>] [--app <prefix>] [--json]'); return 2; }
  const profile = loadProfile(source, a.profile);
  const app = a.app ?? configured(profile.checks['metric-prefix']);
  const eventApi = configured(profile.checks['event-api']) ?? undefined; // unset: each adapter's own
  const otherApis = splitList(configured(profile.checks['other-log-apis']) ?? DEFAULTS.otherApis);
  const catalogue = existsSync(catPath) ? readFileSync(catPath, 'utf8') : null;
  const findings = new Findings();
  if (!catalogue) findings.add('E114', catPath, 0, 'observability.md does not exist — G2 seeds ## Log events and ## Metrics (DEV-CONTRACTS §13.11)');
  const files = readServerSources(source);
  const verbs = [...VERBS, ...splitList(configured(profile.checks['extra-event-verbs']))];
  const { summary } = check({ catalogue, files, app, eventApi, otherApis, verbs }, findings, catPath.split(/[\\/]/).slice(-3).join('/'));
  return report('obs-check', findings, summary, { json: a.json, baseline: a.baseline, writeBaseline: a['write-baseline'], profile: profile.text });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
