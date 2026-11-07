#!/usr/bin/env node
/**
 * deploy-plan-check.mjs — a change that touches the database or an API ships with a stated deploy
 * plan (DEV-CONTRACTS §7, §13.4).
 *
 * A basic change needs no ceremony. A change whose diff touches a migration, a schema file, an API
 * contract or an event schema is the change whose deploy can take an outage, and "redeploy the
 * previous build" is not its rollback once data has moved. So the diff decides, not the class: when
 * DB or API files changed, the slug's ship notes must carry `## Rollout and rollback`, filled.
 *
 * The section opens with plain `key: value` lines the QA bundle copies into its test plan, so their
 * names and values are shared (add keys, never rename): `deploy_impact` (none | db | api | db, api),
 * `db_change` (additive | expand | contract — <release>), `data_change` (none | backfill | transform |
 * split-merge | type-change | delete | import), `rollback` (the methods: down-migration,
 * snapshot-restore …), `backup` and `post_backup_writes` (delta-export | replay | write-freeze — <how>)
 * when data_change is not none, `api_change` (additive | versioned | deprecated), and the optional
 * `other_impact` (none | config-secrets | feature-flag). The `- Label:` lines under them say the rest.
 *
 *   E180 DB or API files changed and no ship notes carry `## Rollout and rollback`, the section is
 *        empty or has no `deploy_impact:`; or a release plan's `## Migration ordering` is empty
 *        while the database changed
 *   E181 `deploy_impact: none` (or one that leaves out db / api) while the diff changes them, or
 *        `data_change: none` while a migration rewrites rows
 *   E182 a key or line the impact needs is missing, empty or a placeholder, or a value outside its
 *        vocabulary: an unversioned breaking API change, a contract with no release, a DB rollback
 *        that names neither down-migration nor snapshot-restore, a snapshot with no command
 *   E183 a migration changes existing rows (UPDATE, DELETE, INSERT … SELECT, ALTER … TYPE, DROP,
 *        RENAME, a data or backfill script) and the section has no `### Data` part
 *   E184 `backup` or `post_backup_writes` missing while rows change, or the `### Data` part leaves
 *        backup, before (baseline, dry run), during, after (verify, cleanup) or rollback empty
 *   W180 a route or handler file changed and no contract did: if a request or response shape moved,
 *        the contract and the plan must say so
 *
 * The ship notes are `<root>/release/<slug>/pull-request.md` (G9, every class ships through it);
 * before G9 on a `fast` slug, `<root>/plan/<slug>/slices.md`. When `<root>/deployment/<slug>/release-plan.md`
 * exists (G10), its own `## Rollout and rollback` is judged the same way and its `## Migration ordering`
 * must say something. With no slug, the slugs come from
 * the `<root>/<stage>/<slug>/` paths in the diff.
 *
 *   node <root>/scripts/deploy-plan-check.mjs [<slug>] [--base <ref>] [--head <ref>] [--repo .]
 *                                             [--root <dir>] [--files <a> <b> …] [--notes <file>] [--json]
 *
 * Run on the head checkout: the notes are read from the working tree, the diff from git (or the
 * `--files` list, read from the working tree). Exit 1 on an error, 0 otherwise, 2 on a usage error.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Findings, report } from './lib/check.mjs';
import { parseDoc } from './lib/doc.mjs';
import { dataChangeCall, isRouteFile, isSchemaFile, isTestPath } from './lib/langs.mjs';
import { ROOT_NAMES, findRoot, underQaRoot } from './lib/root.mjs';

/** Migration folders and SQL, across the tools this bundle meets. */
export const DB_PATH = /(^|\/)(migrations?|db\/migrate|alembic\/versions|flyway|liquibase|changelogs?\/db)\/|(^|\/)(schema\.rb|structure\.sql)$|\.sql$/i;
/** Scripts that move existing rows outside a migration file. */
export const DATA_SCRIPT = /(^|\/)(backfills?|data[-_]migrations?|data[-_]fix(es)?|migrations?\/data)\/|(^|\/)scripts\/(data|backfill)[^/]*\//i;
/** API contracts and event schemas. */
export const API_PATH = /(openapi|swagger|asyncapi)[^/]*\.(ya?ml|json)$|\.proto$|\.graphqls?$|(^|\/)events?\/[^/]+\.(json|ya?ml|avsc)$|(^|\/)schemas?\/events?\/[^/]+$/i;
const SEED = /(^|\/)(seeds?|fixtures?|testdata|__fixtures__|mocks?|samples?)\/|(^|\/)seed[^/]*$/i;
const DOWN = /\.down\.|[/_]down[._]/i;

/** SQL that rewrites, moves or removes rows or columns already there. */
export const DATA_SQL = [
  /\bUPDATE\s+[\w."]+\s+SET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bINSERT\s+INTO\b[^;]*?\bSELECT\b/i,
  /\bALTER\s+(?:TABLE\s+[\w."]+\s+)?(?:ALTER\s+)?(?:COLUMN\s+)?[\w."]+\s+(?:SET\s+DATA\s+)?TYPE\b/i,
  /\bDROP\s+(?:COLUMN|TABLE)\b/i,
  /\bRENAME\s+(?:TO|COLUMN)\b/i,
  /\bTRUNCATE\b/i,
];

/**
 * The deploy-impact keys: plain `key: value` lines the QA bundle copies from the ship notes into its
 * test plan, so their names and values are a shared contract — add keys, never rename these.
 */
export const IMPACT = ['none', 'db', 'api'];
export const DB_CHANGE = ['additive', 'expand', 'contract'];
export const DATA_CHANGE = ['none', 'backfill', 'transform', 'split-merge', 'type-change', 'delete', 'import'];
export const API_CHANGE = ['additive', 'versioned', 'deprecated'];
export const POST_BACKUP_WRITES = ['delta-export', 'replay', 'write-freeze'];
export const OTHER_IMPACT = ['none', 'config-secrets', 'feature-flag'];
const COMMON = ['Order', 'Verify', 'Rollback code', 'Decides', 'Rehearsed on staging'];
const DB_FULL = ['DB N-1 compatible', 'DB expand/contract', 'DB lock risk', 'DB backfill', 'DB snapshot', 'Rollback DB'];
const API_LINES = ['API versioning', 'API clients', 'API order', 'Rollback API'];
/** The Data part, grouped as Luan asked for it: backup, before, during, after, rollback. */
export const DATA_LINES = {
  backup: ['Data restore tried'],
  before: ['Data baseline', 'Data dry run'],
  during: ['Data order', 'Data uptime'],
  after: ['Data verify', 'Data cleanup'],
  rollback: ['Data restore point', 'Data loss on restore'],
};
const EMPTY = /^(n\/a|na|none yet|tbd|todo|tba|\?+|-|—|later|unknown|pending)\.?$/i;

const posix = (p) => String(p).replace(/\\/g, '/');

/** Kind of each changed file: `db`, `api`, `route`, or null. Pipeline docs, tests and seeds never count. */
export function classify(path, roots = ROOT_NAMES) {
  const p = posix(path);
  const inRoot = roots.some((r) => p.startsWith(`${r}/`));
  // The G4 contract under <root>/api/<slug>/ is the API many projects ship from; nothing else in the root is.
  if (inRoot) return /^[^/]+\/api\/[^/]+\/[^/]*(openapi|asyncapi)[^/]*\.(ya?ml|json)$/i.test(p) ? 'api' : null;
  if (underQaRoot(p) || isTestPath(p) || SEED.test(p)) return null;
  if (API_PATH.test(p)) return 'api';
  if (DB_PATH.test(p) || DATA_SCRIPT.test(p) || isSchemaFile(p)) return 'db';
  if (isRouteFile(p)) return 'route';
  return null;
}

/** The statement or call that makes a DB file data-changing, or null for a schema-only file. */
export function dataChange(path, text) {
  const p = posix(path);
  if (DOWN.test(p)) return null;
  if (DATA_SCRIPT.test(p)) return 'a data or backfill script';
  const sql = String(text ?? '').replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const re of DATA_SQL) {
    const m = sql.match(re);
    if (m) return m[0].replace(/\s+/g, ' ');
  }
  return dataChangeCall(p, text);
}

/** `- Label: value` lines (bold labels allowed) of a block, keyed lower-case. */
function lines(block) {
  const out = new Map();
  for (const l of block.split('\n')) {
    const m = /^\s*[-*]\s+(?:\*\*)?([A-Za-z][\w /.-]*?)(?:\*\*)?:(?:\*\*)?\s*(.*)$/.exec(l);
    if (m && !out.has(m[1].trim().toLowerCase())) out.set(m[1].trim().toLowerCase(), m[2].trim());
  }
  return out;
}

const blank = (v) => v === undefined || !v.replace(/`/g, '').trim() || EMPTY.test(v.replace(/`/g, '').trim()) || /^<[^>]*>$/.test(v.trim()) || (/<[a-z][^>]*>/i.test(v) && !/`[^`]*<[^`]*`/.test(v));

/** The text under `## <heading>` (comments stripped), or null when the heading is absent. */
export function section(body, heading) {
  const ls = body.replace(/\r\n/g, '\n').split('\n');
  const i = ls.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (i < 0) return null;
  const end = ls.findIndex((l, k) => k > i && /^## /.test(l));
  return ls.slice(i + 1, end < 0 ? undefined : end).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

/**
 * Judge one `## Rollout and rollback` text against what the diff changed.
 * `changed` = { db: [paths], api: [paths], data: [{ path, why }] }. Returns [{ code, message }].
 */
export function judgePlan(text, changed, where = 'ship notes', { keysOnly = false } = {}) {
  const out = [];
  const add = (code, message) => out.push({ code, message });
  if (text === null) {
    add('E180', `${where} has no \`## Rollout and rollback\` section — copy it from _templates/pull-request.md`);
    return out;
  }
  if (!text.trim()) {
    add('E180', `\`## Rollout and rollback\` in ${where} is empty — state \`deploy_impact:\`, and for a DB or API change how it deploys and how it comes back`);
    return out;
  }
  const [main, dataPart] = splitData(text);
  const ls = lines(main);
  const keys = keyLines(main);
  const impactRaw = keys.get('deploy_impact');
  if (impactRaw === undefined || blank(impactRaw)) {
    add('E180', `\`## Rollout and rollback\` in ${where} has no \`deploy_impact:\` line — \`none\`, \`db\`, \`api\` or \`db, api\``);
    return out;
  }
  const impact = list(impactRaw);
  const bad = impact.filter((v) => !IMPACT.includes(v));
  if (bad.length || (impact.includes('none') && impact.length > 1)) add('E182', `\`deploy_impact: ${impactRaw}\` — use \`none\`, \`db\`, \`api\` or \`db, api\``);
  const none = impact.includes('none');
  const other = keys.has('other_impact') ? list(keys.get('other_impact')) : [];
  const badOther = other.filter((v) => !OTHER_IMPACT.includes(v));
  if (badOther.length) add('E182', `\`other_impact\` \`${badOther.join(', ')}\` — use any of ${OTHER_IMPACT.join(', ')}`);

  const dbChanged = changed.db.length > 0;
  const apiChanged = changed.api.length > 0;
  const name = (files) => `${files.slice(0, 3).join(', ')}${files.length > 3 ? ', …' : ''}`;
  if (none && (dbChanged || apiChanged)) {
    add('E181', `the notes say \`deploy_impact: none\` and the diff changes ${[dbChanged && `the database (${name(changed.db)})`, apiChanged && `the API (${name(changed.api)})`].filter(Boolean).join(' and ')}`);
    return out;
  }
  if (dbChanged && !impact.includes('db')) add('E181', `the diff changes the database (${name(changed.db)}) and \`deploy_impact\` does not name \`db\``);
  if (apiChanged && !impact.includes('api')) add('E181', `the diff changes the API (${name(changed.api)}) and \`deploy_impact\` does not name \`api\``);
  if (none && !other.some((v) => v !== 'none')) return out;

  // A release plan copies the key lines only; the prose lines and the Data part live in the PR.
  const need = (label, why = '') => {
    if (keysOnly) return undefined;
    const v = ls.get(label.toLowerCase());
    if (v === undefined) add('E182', `\`- ${label}:\` is missing${why}`);
    else if (blank(v)) add('E182', `\`- ${label}:\` is empty or TBD${why}`);
    return v;
  };
  const needKey = (key, why = '', code = 'E182') => {
    const v = keys.get(key);
    if (v === undefined) add(code, `\`${key}:\` is missing${why}`);
    else if (blank(v)) add(code, `\`${key}:\` is empty or TBD${why}`);
    return v === undefined || blank(v) ? null : v;
  };
  for (const l of COMMON) need(l);
  const rollback = needKey('rollback', ' — the methods, e.g. `redeploy-previous, down-migration` or `snapshot-restore`');

  let dataChange = [];
  if (impact.includes('db')) {
    need('DB migrations', ' — each migration file or MIG id');
    const dbc = needKey('db_change', ' — `additive`, `expand`, or `contract — <the release from which the code no longer uses the old shape>`');
    const dbVals = dbc ? dbc.split(/\s*[,;]\s*/).filter(Boolean) : [];
    for (const v of dbVals) {
      const word = v.split(/\s+/)[0].toLowerCase();
      if (!DB_CHANGE.includes(word)) add('E182', `\`db_change\` \`${v}\` — use \`additive\`, \`expand\`, or \`contract — <release>\``);
      else if (word === 'contract' && !/^contract\s+—\s+\S/i.test(v)) add('E182', '`db_change: contract` names no release — `contract — <the release from which the code no longer uses the old shape>`');
    }
    const dc = needKey('data_change', ` — ${DATA_CHANGE.join(', ')}`);
    dataChange = dc ? list(dc) : [];
    const badData = dataChange.filter((v) => !DATA_CHANGE.includes(v));
    if (badData.length || (dataChange.includes('none') && dataChange.length > 1)) add('E182', `\`data_change: ${dc}\` — use any of ${DATA_CHANGE.join(', ')}`);
    if (changed.data.length && dataChange.includes('none')) add('E181', `\`data_change: none\` and ${changed.data[0].path} changes existing rows (${changed.data[0].why})`);
    if (rollback && !/\b(down-migration|snapshot-restore)\b/i.test(rollback)) add('E182', '`rollback` names neither `down-migration` nor `snapshot-restore` for a database change');
    const light = dbVals.length > 0 && dbVals.every((v) => /^additive\b/i.test(v)) && dataChange.length === 1 && dataChange[0] === 'none' && !changed.data.length;
    if (!light) {
      for (const l of DB_FULL) need(l);
      const snap = ls.get('db snapshot');
      if (snap && !blank(snap) && !/`[^`]+`|\b(job|step|stage)\b/i.test(snap)) add('E182', '`DB snapshot` names no command (in backticks) or pipeline step — e.g. `neonctl branches create`, `aws rds create-db-snapshot`, `pg_dump`, `gcloud sql backups create`');
      const rb = ls.get('rollback db');
      if (rb && !blank(rb) && !/\b(down|restore|forward)\b/i.test(rb)) add('E182', '`Rollback DB` says neither the down migration, the snapshot restore, nor forward-only — and when down is unsafe');
    }
  }
  if (impact.includes('api')) {
    const v = needKey('api_change', ` — ${API_CHANGE.join(', ')}; a breaking change is never unversioned`);
    if (v && !API_CHANGE.includes(v.split(/[\s—]+/)[0].toLowerCase())) add('E182', `\`api_change: ${v}\` — use additive, versioned or deprecated; a breaking change ships versioned or deprecated, never unversioned`);
    for (const l of API_LINES) need(l);
  }

  const moved = dataChange.some((v) => v !== 'none');
  if (changed.data.length || moved) {
    const why = changed.data.length ? `${changed.data[0].path} changes existing rows (${changed.data[0].why})` : `\`data_change: ${dataChange.join(', ')}\``;
    needKey('backup', ' — how and where the copy is taken, required when data_change is not none', 'E184');
    const pbw = needKey('post_backup_writes', ` — ${POST_BACKUP_WRITES.join(', ')} (write-freeze — <how>)`, 'E184');
    if (pbw) {
      const word = pbw.split(/[\s—]+/)[0].toLowerCase();
      if (!POST_BACKUP_WRITES.includes(word)) add('E184', `\`post_backup_writes: ${pbw}\` — use delta-export, replay, or write-freeze — <how>`);
      else if (word === 'write-freeze' && !/^write-freeze\s+—\s+\S/i.test(pbw)) add('E184', '`post_backup_writes: write-freeze` says not how — `write-freeze — <how>`');
    }
    if (keysOnly) { /* the Data part is the PR's */ } else if (dataPart === null) {
      add('E183', `${why} and the section has no \`### Data\` part — restore tried, baseline, dry run, order, verification after, cleanup, and what a restore loses`);
    } else {
      const dl = lines(dataPart);
      for (const [group, labels] of Object.entries(DATA_LINES)) {
        for (const l of labels) {
          const v = dl.get(l.toLowerCase());
          if (v === undefined || blank(v)) add('E184', `\`### Data\` ${group}: \`- ${l}:\` is ${v === undefined ? 'missing' : 'empty or TBD'}`);
        }
      }
    }
  }
  return out;
}

/** Plain `key: value` lines (lower snake-case keys, no bullet) — the lines the QA bundle reads. */
export function keyLines(block) {
  const out = new Map();
  for (const l of block.split('\n')) {
    const m = /^([a-z][a-z_]*):[ \t]*(.*)$/.exec(l.trim() === l ? l : '');
    if (m && !out.has(m[1])) out.set(m[1], m[2].trim());
  }
  return out;
}

const list = (v) => String(v ?? '').replace(/`/g, '').split(/\s*[,;]\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** [text before `### Data`, the Data part or null]. */
function splitData(text) {
  const i = text.search(/^###\s+Data\s*$/im);
  if (i < 0) return [text, null];
  const rest = text.slice(i).replace(/^###\s+Data\s*$/im, '');
  const end = rest.search(/^###\s/m);
  return [text.slice(0, i), end < 0 ? rest : rest.slice(0, end)];
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
}

/** [{ status, path }] from the merge base of base and head. */
function diffFiles(repo, base, head) {
  let from = base;
  if (!from) {
    for (const ref of ['origin/main', 'origin/master', 'main', 'master']) {
      try { from = git(repo, ['merge-base', ref, head]).trim(); break; } catch { /* next */ }
    }
  } else from = git(repo, ['merge-base', base, head]).trim();
  if (!from) throw new Error('no base — pass --base <ref>');
  return git(repo, ['diff', '--name-status', '-M', `${from}..${head}`]).split('\n').filter(Boolean).map((l) => {
    const [st, a, b] = l.split('\t');
    return { status: st[0], path: posix(b ?? a) };
  });
}

/** The slugs a diff touches through `<root>/<stage>/<slug>/` paths. */
function slugsIn(files, rootName) {
  const re = new RegExp(`^${rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:intake|requirements|design|data|api|ui|plan|implementation|verification|release|deployment|monitoring|reviews|decisions)/([a-z0-9][a-z0-9-]*)/`);
  return [...new Set(files.map((f) => re.exec(f.path)?.[1]).filter(Boolean))].sort();
}

export function checkDeployPlan({ repo = '.', root, rootName, files, read, slug = null, notes = null }, findings = new Findings()) {
  const roots = [...new Set([rootName, ...ROOT_NAMES])];
  const changed = { db: [], api: [], data: [], routes: [] };
  for (const f of files) {
    const kind = classify(f.path, roots);
    if (kind === 'db') {
      changed.db.push(f.path);
      if (f.status !== 'D') {
        const why = dataChange(f.path, read(f.path));
        if (why) changed.data.push({ path: f.path, why });
      }
    } else if (kind === 'api') changed.api.push(f.path);
    else if (kind === 'route') changed.routes.push(f.path);
  }
  if (changed.routes.length && !changed.api.length) {
    findings.add('W180', changed.routes[0], 0, `${changed.routes.length} route or handler file(s) changed and no API contract did — if a request or response shape moved, change the contract and state the plan`);
  }
  const summary = { db: changed.db.length, api: changed.api.length, 'data-changing': changed.data.length };
  if (!changed.db.length && !changed.api.length) return { findings, summary: { ...summary, plan: 'not needed — no DB or API change' } };

  const targets = [];
  if (notes) targets.push({ slug: slug ?? '-', path: resolve(repo, notes) });
  else {
    const slugs = slug ? [slug] : slugsIn(files, rootName);
    for (const s of slugs) {
      const pr = join(root, 'release', s, 'pull-request.md');
      const sl = join(root, 'plan', s, 'slices.md');
      const path = existsSync(pr) ? pr : existsSync(sl) ? sl : null;
      if (path) targets.push({ slug: s, path });
    }
    if (!targets.length) {
      const what = slugs.length ? `slug ${slugs.join(', ')} has` : 'no sdlc slug in this change has';
      findings.add('E180', changed.db[0] ?? changed.api[0], 0, `the database or API changed and ${what} no ship notes — write \`## Rollout and rollback\` in <root>/release/<slug>/pull-request.md (or plan/<slug>/slices.md on the fast track), or pass the slug`);
      return { findings, summary };
    }
  }
  for (const t of targets) {
    const rel = posix(relative(resolve(repo), t.path));
    const body = parseDoc(readFileSync(t.path, 'utf8')).body;
    for (const p of judgePlan(section(body, 'Rollout and rollback'), changed, rel)) findings.add(p.code, rel, 0, p.message);
    const plan = join(root, 'deployment', t.slug, 'release-plan.md');
    if (existsSync(plan)) {
      const planBody = parseDoc(readFileSync(plan, 'utf8')).body;
      const planRel = posix(relative(resolve(repo), plan));
      // A release plan from before the section existed is judged by its Migration ordering alone.
      const own = section(planBody, 'Rollout and rollback');
      if (own !== null) for (const p of judgePlan(own, changed, planRel, { keysOnly: true })) findings.add(p.code, planRel, 0, p.message);
    }
    if (changed.db.length && existsSync(plan)) {
      const mo = section(parseDoc(readFileSync(plan, 'utf8')).body, 'Migration ordering');
      if (mo !== null && (!mo || EMPTY.test(mo) || /^<[^>]*>$/.test(mo))) findings.add('E180', posix(relative(resolve(repo), plan)), 0, '`## Migration ordering` is empty while the diff changes the database — state where each migration runs against the code deploy, and why');
    }
  }
  return { findings, summary: { ...summary, notes: targets.map((t) => posix(relative(resolve(repo), t.path))).join(', ') } };
}

function main(argv) {
  const a = { _: [], files: [] };
  const known = ['base', 'head', 'repo', 'root', 'notes'];
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--json') a.json = true;
    else if (x === '--files') { while (argv[i + 1] && !argv[i + 1].startsWith('--')) a.files.push(argv[++i]); a.useFiles = true; }
    else if (x.startsWith('--') && known.includes(x.slice(2))) a[x.slice(2)] = argv[++i];
    else if (x.startsWith('--')) { console.error(`deploy-plan-check: unknown option ${x}`); return 2; }
    else a._.push(x);
  }
  const repo = resolve(a.repo ?? '.');
  const { root, name } = findRoot({ explicit: a.root ?? null, cwd: repo });
  const rootName = posix(relative(repo, root)) || name;
  let files;
  let read;
  try {
    if (a.useFiles) {
      files = a.files.map((p) => ({ status: existsSync(join(repo, p)) ? 'M' : 'D', path: posix(p) }));
      read = (p) => { try { return readFileSync(join(repo, p), 'utf8'); } catch { return ''; } };
    } else {
      const head = a.head ?? 'HEAD';
      files = diffFiles(repo, a.base, head);
      read = (p) => { try { return git(repo, ['show', `${head}:${p}`]); } catch { return ''; } };
    }
  } catch (e) {
    console.error(`deploy-plan-check: ${String(e.message).split('\n')[0]}`);
    return 2;
  }
  const { findings, summary } = checkDeployPlan({ repo, root, rootName, files, read, slug: a._[0] ?? null, notes: a.notes ?? null });
  return report('deploy-plan-check', findings, summary, { json: a.json, root });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));

