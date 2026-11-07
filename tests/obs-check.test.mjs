/**
 * obs-check.mjs: the code emits exactly the events and metrics observability.md lists, through one
 * logging API, with literal names (DEV-CONTRACTS §13.5, §13.11).
 *
 * release-management wrote 97 event names through two logging paths (obs.Event in 24 files, slog
 * directly in 20), built one at runtime, and registered 28 metrics with no app prefix. There was
 * no catalogue to compare them with.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { project, edit, run, FIXTURE } from './backend-fixture.mjs';
import { callName, eventGrammar, metricGrammar, readCatalogue, scanSources } from '../workspace/dev/scripts/obs-check.mjs';

const ARGS = ['demo', '--root', 'dev', '--source', '.', '--app', 'demo'];

test('the valid fixture passes clean, request line and X-Request-Id included', () => {
  const r = run('obs-check.mjs', ARGS, project());
  assert.equal(r.status, 0, r.stdout);
  assert.deepEqual(r.json.findings, []);
  assert.equal(r.json.summary['request log event'], 'yes');
  assert.equal(r.json.summary['X-Request-Id echoed'], 'yes');
});

test('the broken overlay: a runtime name, a second API, uncatalogued event and metric', () => {
  const r = run('obs-check.mjs', ARGS, project({ broken: true }));
  assert.equal(r.status, 1);
  const m = r.json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E115 event name built at runtime \(`"account\."\+verb\+"d"`\)/);
  assert.match(m, /E116 `account\.sign_in_done` written through `slog\.InfoContext`/);
  assert.match(m, /E114 event `account\.signin_ok` is not in ## Log events/);
  assert.match(m, /E114 metric `signins` is not in ## Metrics/);
});

test('a catalogue entry never used, a missing request line, and no echo are reported', () => {
  const root = project();
  edit(root, 'dev/monitoring/demo/observability.md', '| http.request_completed | info |', '| http.request_finished | info |');
  edit(root, 'internal/platform/obs/obs.go', 'w.Header().Set("X-Request-Id", id)', '_ = id');
  const m = run('obs-check.mjs', ARGS, root).json.findings.map((f) => `${f.code} ${f.message}`).join('\n');
  assert.match(m, /E114 event `http\.request_finished` is in ## Log events and never emitted/);
  assert.match(m, /E114 ## Log events has no `http\.request_completed`/);
  assert.match(m, /W107 no response sets `X-Request-Id`/);
});

test('without a catalogue the names are still judged, and the run fails', () => {
  const root = project({ broken: true });
  const r = run('obs-check.mjs', ['other', '--root', 'dev', '--source', '.', '--app', 'demo'], root);
  assert.equal(r.status, 1);
  assert.ok(r.json.counts.W108 >= 1);
});

test('event grammar', () => {
  assert.equal(eventGrammar('release.release_created'), null);
  assert.equal(eventGrammar('http.request_completed'), null);
  assert.match(eventGrammar('bug.attached'), /no <noun>_/);
  assert.match(eventGrammar('backup.prune_done'), /ends in `done`/);
  assert.match(eventGrammar('sign-in.failed'), /not <domain>/);
  assert.equal(eventGrammar('bug.item_attached', ['attached']), null);
});

test('metric grammar', () => {
  assert.equal(metricGrammar('demo_release_created_total', 'counter', 'demo'), null);
  assert.equal(metricGrammar('demo_http_request_duration_seconds', 'histogram', 'demo'), null);
  assert.match(metricGrammar('http_requests_total', 'counter', 'demo'), /prefix/);
  assert.match(metricGrammar('demo_signins', 'counter', 'demo'), /_total/);
  assert.match(metricGrammar('demo_pdf_render_seconds', 'histogram', 'demo'), /_duration_seconds/);
  assert.match(metricGrammar('demo_outbox', 'gauge', 'demo'), /names no unit/);
});

test('catalogue names keep their underscores', () => {
  const c = readCatalogue('---\na: b\n---\n\n## Log events\n\n| Event | Level | Fields | Emitted when |\n|---|---|---|---|\n| `release.release_created` | info | x | y |\n');
  assert.equal(c.events[0].name, 'release.release_created');
});

test('E116 names the logging call when its receiver is itself a call (m.log().ErrorContext)', () => {
  // On release-management 16 E116 messages read "written through ``": the name was cut at the first `(`.
  const files = [{ rel: 'internal/watch/mailer.go', text: 'package watch\n\nfunc (m *Mailer) f(ctx context.Context) {\n\tm.log().ErrorContext(ctx, "watch.incident_unsaved", "error", err)\n\tlog.InfoContext(ctx, "watch.sent")\n}\n' }];
  const calls = scanSources(files).other.map((o) => `${o.name} ${o.call}`);
  assert.deepEqual(calls.sort(), ['watch.incident_unsaved ….ErrorContext', 'watch.sent log.InfoContext']);
  assert.equal(callName('\tm.log().ErrorContext(ctx, "a.b"'), '….ErrorContext');
  assert.equal(callName(' s.logger.WarnContext(r.Context(), "a.b"'), 's.logger.WarnContext');
});

// The shipped obs templates are the one logging API a project copies (_templates/code/<lang>/obs).
// They must pass the checker they are written for, and a call beside them must still be judged.
const TPL = join(dirname(fileURLToPath(import.meta.url)), '..', 'workspace', 'dev', '_templates', 'code');
const goObs = () => readdirSync(join(TPL, 'go', 'obs')).map((n) => ({ rel: `internal/platform/obs/${n}`, text: readFileSync(join(TPL, 'go', 'obs', n), 'utf8') }));
const pyObs = () => [{ rel: 'src/app/obs.py', text: readFileSync(join(TPL, 'python', 'obs.py'), 'utf8') }];

test('the Go obs template: its request line is an event, its own slog body is not a second API', () => {
  const files = [...goObs(), { rel: 'internal/release/service.go', text: 'package release\n\nfunc f(ctx context.Context) {\n\tobs.Event(ctx, "release.release_created", "id", 1)\n\tobs.Event(ctx, name)\n\tslog.InfoContext(ctx, "release.x_created")\n}\n' }];
  const s = scanSources(files);
  assert.deepEqual(s.events.map((e) => `${e.name} ${e.rel}`).sort(), ['http.request_completed internal/platform/obs/http.go', 'release.release_created internal/release/service.go']);
  assert.deepEqual(s.dynamic.map((d) => d.rel), ['internal/release/service.go']);
  assert.deepEqual(s.other.map((o) => o.rel), ['internal/release/service.go']);
  assert.equal(s.levelOf.get('http.request_completed'), 'info');
  assert.deepEqual(s.metrics.map((m) => m.name), ['app_http_request_duration_seconds']);
});

test('the Python obs template: the name is the first argument, and the level table is read', () => {
  const files = [...pyObs(), { rel: 'src/app/release.py', text: 'from . import obs\n\ndef f(rid):\n    obs.event("release.release_created", release_id=rid)\n    obs.event(name, x=1)\n    logger.info("release.x_created")\n' }];
  const s = scanSources(files, { eventApi: 'obs.event' });
  assert.deepEqual(s.events.map((e) => `${e.name} ${e.rel}`).sort(), ['http.request_completed src/app/obs.py', 'release.release_created src/app/release.py']);
  assert.deepEqual(s.dynamic.map((d) => d.expr), ['name']);
  assert.deepEqual(s.other.map((o) => o.name), ['release.x_created']);
  assert.equal(s.levelOf.get('http.request_completed'), 'info');
});

test('both obs templates write the same §13.5 fields and redact the same keys', () => {
  const go = goObs().map((f) => f.text).join('\n');
  const py = pyObs()[0].text;
  for (const field of ['timestamp', 'trace_id', 'span_id', 'request_id', 'user_id', 'service', 'env', 'version', 'http.route', 'http.response.status_code', 'duration_ms', 'X-Request-Id', '[REDACTED]']) {
    assert.ok(go.includes(`"${field}"`), `Go template lacks ${field}`);
    assert.ok(py.includes(`"${field}"`), `Python template lacks ${field}`);
  }
  const list = (src) => /(?:sensitive = \[\]string\{|_SENSITIVE = \()([^)}]+)/.exec(src)[1].match(/"[^"]+"/g).sort();
  assert.deepEqual(list(go), list(py));
});

// Next.js server code is TypeScript (blueprints/nextjs.md). The checker reads what isServerFile
// names: a server module and a route handler, never a component.
test('Next.js: TypeScript server code is read, a component is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-next-obs-'));
  cpSync(join(FIXTURE, 'valid', 'dev'), join(root, 'dev'), { recursive: true });
  const files = {
    'src/server/platform/obs/obs.ts': "import 'server-only';\n\nexport function event(name: string, fields: object = {}) {\n  console.log(JSON.stringify({ event: name, ...fields }));\n}\n",
    'src/server/releases/app/create.ts': "import * as obs from '@/server/platform/obs/obs';\n\nexport function create(id: string) {\n  obs.event('release.release_created', { name_len: id.length });\n}\n",
    'src/app/api/releases/route.ts': "import * as obs from '@/server/platform/obs/obs';\n\nexport async function POST(req: Request) {\n  obs.event('http.request_completed', { route: '/api/releases' });\n  const res = new Response(null, { status: 201 });\n  res.headers.set('X-Request-Id', req.headers.get('X-Request-Id') ?? '');\n  return res;\n}\n",
    // UI: never read, so this uncatalogued event is not E114.
    'src/features/releases/components/Banner.tsx': "export function Banner() {\n  obs.event('release.banner_shown');\n  return null;\n}\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  const args = ['demo', '--root', 'dev', '--source', '.'];
  const r = run('obs-check.mjs', args, root);
  const events = r.json.findings.filter((f) => f.code === 'E114' && /event/.test(f.message));
  assert.deepEqual(events, [], JSON.stringify(r.json.findings));
  assert.equal(r.json.summary['events in code'], 2);
  assert.equal(r.json.summary['event-API calls'], 2);
  assert.equal(r.json.summary['X-Request-Id echoed'], 'yes');

  writeFileSync(join(root, 'src/server/releases/app/archive.ts'), "import * as obs from '@/server/platform/obs/obs';\n\nexport function archive() {\n  obs.event('release.release_archived');\n}\n");
  const bad = run('obs-check.mjs', args, root);
  assert.equal(bad.status, 1);
  const e = bad.json.findings.filter((f) => f.code === 'E114' && /release_archived/.test(f.message));
  assert.deepEqual(e.map((f) => f.file), ['src/server/releases/app/archive.ts']);
  assert.ok(!bad.json.findings.some((f) => /banner_shown/.test(f.message)), 'a .tsx component is not read');
});

test('the event API is the adapter\'s when the profile sets none, and the profile\'s when it does', () => {
  const ts = { rel: 'src/server/a.ts', text: "obs.event('a.b_created');\nobs.Event('a.c_created');\n" };
  assert.deepEqual(scanSources([ts]).events.map((x) => x.name), ['a.b_created']);
  assert.deepEqual(scanSources([ts], { eventApi: 'obs.Event' }).events.map((x) => x.name), ['a.c_created']);
});
