#!/usr/bin/env node
/**
 * review-brief.mjs — what a gate reviewer reads first, as JSON (DEV-CONTRACTS §4.5, §15.3).
 *
 *   node <root>/scripts/review-brief.mjs <slug> <G> [--root <dir>] [--out <file>]
 *
 * A reviewer spawned with a list of paths opens all of them, and the contract besides, before it
 * knows which matter. The brief says up front: the reviewer model for this gate and class, the
 * stage's files (`open`), which of them changed since the last log of this gate (`changed`, by
 * hash), the lint errors and warnings on them, the prior log's rows that were not PASS, and the
 * contract sections to print. The reviewer opens what the brief names and nothing else unless a
 * finding leads there. It is still the reviewer's judgement: the brief has no verdict in it.
 *
 * Exit 0 · 2 usage.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { STAGE_OF } from './build-state.mjs';
import { hashArtifact, parseDoc, plain, readTable } from './lib/doc.mjs';
import { rootFromArgv } from './lib/root.mjs';
import { lintTree, loadTemplates } from './lint-dev.mjs';
import { reviewerModel } from './size.mjs';

// The §-sections every review needs: what the reviewer may do, the log format, the vocabulary.
const SECTIONS = ['4.5', '5', '10'];
const posix = (p) => p.split(sep).join('/');
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function brief(root, slug, gate) {
  const stage = STAGE_OF[gate];
  if (!stage) throw new Error(`unknown gate ${gate}`);
  const problem = join(root, 'intake', slug, 'problem.md');
  const cls = existsSync(problem) ? String(parseDoc(readFileSync(problem, 'utf8')).frontMatter.change_class ?? 'initiative') : 'initiative';
  const dir = gate === 'GK' ? join(root, 'knowledge') : join(root, stage, slug);
  const open = [...walk(dir)].map((p) => posix(relative(root, p))).filter((p) => !/\/\./.test(p)).sort();

  const logsDir = join(root, 'reviews', gate === 'GK' ? '_repo' : slug);
  const logs = existsSync(logsDir) ? readdirSync(logsDir).filter((f) => f.startsWith(`${gate}-`) && f.endsWith('.md')).sort() : [];
  const prior = logs.length ? parseDoc(readFileSync(join(logsDir, logs.at(-1)), 'utf8')) : null;
  const judged = new Map((prior?.frontMatter.outputs ?? []).map((o) => [String(o?.path ?? '').replace(/^(\.sdlc|dev)\//, ''), String(o?.sha256 ?? '')]));
  const changed = prior ? open.filter((p) => judged.get(p) !== hashArtifact(join(root, p))) : open;
  const notPassed = prior ? readTable(prior.body, 'Checklist').filter((r) => !/^(PASS|N\/A)/i.test(plain(r.result))).map((r) => `${plain(r['#'])}: ${plain(r.result)}`) : [];

  const mine = new Set(open);
  const lint = !open.length ? [] : lintTree(root,loadTemplates(join(root, '_templates'))).filter((f) => mine.has(posix(f.file ?? '')))
    .map((f) => `${f.file}:${f.line} ${f.rule} ${f.message}`);

  return {
    slug, gate, class: cls,
    model: reviewerModel(gate, cls),
    contracts: `node <root>/scripts/contracts.mjs ${SECTIONS.join(' ')}`,
    open, changed,
    prior_log: prior ? posix(relative(root, join(logsDir, logs.at(-1)))) : null,
    prior_not_passed: notPassed,
    lint,
  };
}

export function main(argv, { cwd = process.cwd() } = {}) {
  const pos = argv.filter((x, i) => !x.startsWith('--') && !(i > 0 && ['--root', '--out'].includes(argv[i - 1])));
  const [slug, gate] = pos;
  if (!slug || !STAGE_OF[gate]) { console.error('usage: review-brief.mjs <slug> <GK|G0…G11> [--out <file>]'); return 2; }
  const text = `${JSON.stringify(brief(rootFromArgv(argv, cwd), slug, gate), null, 2)}\n`;
  const out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
  return 0;
}

const isMain = process.argv[1] && /(^|[\\/])review-brief\.mjs$/.test(process.argv[1]);
if (isMain) process.exit(main(process.argv.slice(2)));
