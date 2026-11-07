#!/usr/bin/env node
/**
 * fast-check.mjs — a `fast` slug's plan holds to what the class promised (DEV-CONTRACTS §15.1).
 *
 * The fast track drops G2–G6 on the strength of three things: the requester asked for it in
 * writing, the first slice is a pipeline that deploys, and a slice that touches something risky
 * brings its gate back. Each is checkable, so each is checked here, before every slice's G7:
 *
 *   F1  error  plan/<slug>/slices.md exists, and the slug's class is `fast`
 *   F2  error  `## Requested` quotes the requester and carries a date
 *   F3  error  `## Skeleton` names a pipeline file that exists and runs env-doctor, and
 *              ops/config/keys.md exists (§13.4)
 *   F4  error  `## Slices` has its columns, and rows numbered 1, 2, 3… in order
 *   F5  error  Escalates is `none` or a list of G2, G3, G4
 *   F6  error  an escalated gate is still SKIPPED in state.json — the skip from intake stands
 *   F7  warn   a slice's words suggest sign-in, secrets, money, personal data or a destructive
 *              migration, and it escalates nothing
 *   F8  error  a DEC-NNN in `## Decisions` is missing from decisions/<slug>.md, or still open
 *
 *   node <root>/scripts/fast-check.mjs <slug> [--root <path>] [--repo <dir>] [--json]
 *
 * Reads `<root>/state.json`; run `build-state.mjs --quiet` first. Exit 0 clean (warnings allowed) ·
 * 1 an error · 2 usage.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { plain, readDoc, readTable } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';

const COLUMNS = ['#', 'slice', 'a user can then', 'escalates', 'smoke'];
const ESCALATABLE = ['G2', 'G3', 'G4'];
// Words that mean a gate should have come back. Deliberately broad: a warning costs one look.
const RISK = [
  ['G2', /\b(sign[- ]?in|log[- ]?in|auth\w*|oidc|oauth|password|permission|role|secret|token|api key|encrypt\w*|payment|billing|invoice|money|price|pii|personal data|email address|phone)\b/i],
  ['G3', /\b(drop (column|table)|rename (column|table)|backfill|data migration|change (the )?column type)\b/i],
  ['G4', /\b(breaking|remove (an |the )?endpoint|rename (an |the )?endpoint|api v\d)\b/i],
];

const section = (body, heading) => {
  const m = body.split('\n');
  const i = m.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (i < 0) return null;
  const end = m.findIndex((l, k) => k > i && l.startsWith('## '));
  return m.slice(i + 1, end < 0 ? undefined : end).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
};

export function check(root, slug, repo = process.cwd()) {
  const out = [];
  const add = (level, code, message) => out.push({ level, code, message });
  const path = join(root, 'plan', slug, 'slices.md');
  if (!existsSync(path)) {
    add('error', 'F1', `plan/${slug}/slices.md is missing — /sdlc-fast writes it from _templates/slices.md`);
    return out;
  }
  const problem = join(root, 'intake', slug, 'problem.md');
  const cls = existsSync(problem) ? String(readDoc(problem).frontMatter.change_class ?? '') : '';
  if (cls !== 'fast') add('error', 'F1', `the slug's class is \`${cls || 'unknown'}\`, not \`fast\` — run /sdlc-intake ${slug} --class fast`);

  const { body } = readDoc(path);

  const requested = section(body, 'Requested') ?? '';
  if (!/["“>]/.test(requested) || !/\b\d{4}-\d{2}-\d{2}\b/.test(requested)) {
    add('error', 'F2', '`## Requested` needs the requester\'s words, quoted, and the date (YYYY-MM-DD)');
  }

  const skeleton = section(body, 'Skeleton') ?? '';
  const pipeline = skeleton.match(/Pipeline:\s*`([^`]+)`/i)?.[1];
  if (!pipeline) add('error', 'F3', '`## Skeleton` names no pipeline file (`- Pipeline: `.gitlab-ci.yml`…`)');
  else if (!existsSync(join(repo, pipeline))) add('error', 'F3', `the pipeline ${pipeline} does not exist yet — slice 1 builds it before any feature`);
  else if (!/env-doctor/.test(readFileSync(join(repo, pipeline), 'utf8'))) add('error', 'F3', `${pipeline} never runs env-doctor before a deploy (§13.4)`);
  if (!existsSync(join(repo, 'ops', 'config', 'keys.md'))) add('error', 'F3', 'ops/config/keys.md is missing — every key the app reads is a row there (§13.4)');

  const rows = readTable(body, 'Slices');
  const head = rows.length ? Object.keys(rows[0]) : [];
  const missing = COLUMNS.filter((c) => !head.includes(c));
  if (!rows.length || missing.length) {
    add('error', 'F4', rows.length ? `\`## Slices\` lacks column(s) ${missing.join(', ')}` : '`## Slices` has no rows');
    return out;
  }
  rows.forEach((r, i) => {
    if (plain(r['#']) !== String(i + 1)) add('error', 'F4', `slice row ${i + 1} is numbered \`${plain(r['#'])}\` — number them 1, 2, 3… in build order`);
  });

  let stages = null;
  const statePath = join(root, 'state.json');
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    stages = state.initiatives?.find((x) => x.slug === slug)?.stages ?? null;
  }
  for (const r of rows) {
    const n = plain(r['#']);
    const raw = plain(r.escalates);
    const gates = /^(none|—|-)?$/i.test(raw) ? [] : raw.split(/[\s,·]+/).filter(Boolean);
    const bad = gates.filter((g) => !ESCALATABLE.includes(g));
    if (bad.length) add('error', 'F5', `slice ${n}: Escalates \`${raw}\` — use none, or any of ${ESCALATABLE.join(', ')}`);
    for (const g of gates.filter((x) => ESCALATABLE.includes(x))) {
      const st = stages?.find((s) => s.gate === g)?.state;
      if (!stages) add('error', 'F6', `slice ${n} escalates ${g}, and state.json has no ${slug} — run build-state.mjs --quiet first`);
      else if (st === 'SKIPPED') add('error', 'F6', `slice ${n} escalates ${g}, which is still SKIPPED by class — run it for this slice before its G7`);
    }
    if (!gates.length) {
      const text = `${plain(r.slice)} ${plain(r['a user can then'])}`;
      for (const [g, re] of RISK) {
        const hit = text.match(re);
        if (hit) add('warn', 'F7', `slice ${n} mentions "${hit[0]}" and escalates nothing — ${g} if it is what it sounds like`);
      }
    }
  }

  const decisions = section(body, 'Decisions') ?? '';
  const ids = [...new Set(decisions.match(/DEC-\d{3,}/g) ?? [])];
  if (ids.length) {
    const ledger = join(root, 'decisions', `${slug}.md`);
    const known = existsSync(ledger) ? readTable(readDoc(ledger).body, 'Decisions') : [];
    for (const id of ids) {
      const row = known.find((d) => plain(d.id) === id);
      if (!row) add('error', 'F8', `${id} is not in decisions/${slug}.md`);
      else if (!['assumed', 'answered'].includes(plain(row.status).toLowerCase())) add('error', 'F8', `${id} is \`${plain(row.status) || 'open'}\` — a fast-track decision is recorded assumed or answered`);
    }
  }
  return out;
}

function main(argv) {
  const slug = argv.find((a, i) => !a.startsWith('--') && !['--root', '--repo'].includes(argv[i - 1]));
  if (!slug) {
    console.error('usage: fast-check.mjs <slug> [--root <path>] [--repo <dir>] [--json]');
    process.exit(2);
  }
  const r = argv.indexOf('--repo');
  const repo = resolve(r !== -1 && argv[r + 1] ? argv[r + 1] : process.cwd());
  const findings = check(rootFromArgv(argv), slug, repo);
  if (argv.includes('--json')) console.log(JSON.stringify(findings, null, 2));
  else if (!findings.length) console.log(`fast-check: ${slug} clean`);
  else for (const f of findings) console.log(`${f.level.padEnd(5)} ${f.code}  ${f.message}`);
  process.exit(findings.some((f) => f.level === 'error') ? 1 : 0);
}

if (process.argv[1]?.endsWith('fast-check.mjs')) main(process.argv.slice(2));
