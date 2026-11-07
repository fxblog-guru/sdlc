/**
 * activity.mjs — append activity events (docs/activity-format.md) to <root>/logs/activity.jsonl.
 *
 * The addons' Activity and Needs you views, and qa-standup's automatic standup, read this file. The
 * same format is written by stlc and ai-eval, so the four readers share one parser.
 *
 * Never throws and never creates the root. ACTIVITY_LOG=off stops it. Rolls past MAX_BYTES.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_BYTES = 5 * 1024 * 1024;
export const KINDS = ['gate', 'decision', 'run', 'stop', 'finding', 'heal', 'lesson', 'score'];
export const OUTCOMES = ['pass', 'fail', 'changes', 'blocked', 'stale', 'stopped', 'info'];
export const NEEDS = ['approve-ui', 'confirm-dec', 'sign-off', 'push', 'merge', 'answer-dec', 'review-stop'];
const SOURCES = ['sdlc', 'stlc', 'eval'];

/** The problems with one event, as strings; empty when it is valid. */
export function eventProblems(e) {
  const out = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  if (e.v !== 1) out.push('v must be 1');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(String(e.at))) out.push('at must be ISO-8601 UTC ending in Z');
  if (!SOURCES.includes(e.source)) out.push(`source must be one of ${SOURCES.join(', ')}`);
  if (!KINDS.includes(e.kind)) out.push(`kind must be one of ${KINDS.join(', ')}`);
  if (!('slug' in e) || (e.slug !== null && typeof e.slug !== 'string')) out.push('slug must be a string or null');
  if (!OUTCOMES.includes(e.outcome)) out.push(`outcome must be one of ${OUTCOMES.join(', ')}`);
  if (typeof e.title !== 'string' || !e.title || e.title.length > 120) out.push('title must be 1-120 characters');
  if (e.needs != null && !NEEDS.includes(e.needs)) out.push(`needs must be null or one of ${NEEDS.join(', ')}`);
  if (e.link != null && (typeof e.link !== 'string' || /^([a-z]:|\/)/i.test(e.link))) out.push('link must be repository-relative');
  return out;
}

/** A complete event from the fields a writer knows; `at` defaults to now. */
export function makeEvent(fields, now = new Date()) {
  return {
    v: 1,
    at: fields.at ?? now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    source: fields.source ?? 'sdlc',
    kind: fields.kind,
    slug: fields.slug ?? null,
    outcome: fields.outcome,
    title: String(fields.title ?? '').slice(0, 120),
    link: fields.link ?? null,
    run_id: fields.run_id ?? null,
    needs: fields.needs ?? null,
  };
}

/** Append events; invalid ones are dropped, never written. Returns how many were written. */
export function logActivity(root, events, env = process.env) {
  if (env.ACTIVITY_LOG === 'off' || !existsSync(root)) return 0;
  const good = events.filter((e) => eventProblems(e).length === 0);
  if (!good.length) return 0;
  try {
    const dir = join(root, 'logs');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'activity.jsonl');
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'activity.1.jsonl'));
    appendFileSync(file, good.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return good.length;
  } catch {
    return 0;
  }
}

/** Every valid event in a file, oldest first; a bad line is skipped. */
export function readActivity(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (eventProblems(e).length === 0) out.push(e);
    } catch { /* a torn last line from a crash */ }
  }
  return out;
}

const VERDICT = { PASS: 'pass', SKIPPED: 'pass', CHANGES_REQUESTED: 'changes', BLOCKED: 'blocked', STALE: 'stale' };

/**
 * The events between two state.json builds: a gate whose derived state changed, and a DEC row
 * that is new or changed status. A first build (no prior) writes nothing, so installing the bundle
 * on a project with forty logs does not flood the feed.
 */
export function stateEvents(prior, state, now = new Date()) {
  if (!prior) return [];
  const out = [];
  const before = new Map();
  for (const i of prior.initiatives ?? []) before.set(i.slug, i);
  for (const i of state.initiatives ?? []) {
    const was = before.get(i.slug);
    const stages = new Map((was?.stages ?? []).map((s) => [s.gate, s]));
    for (const s of i.stages ?? []) {
      const p = stages.get(s.gate);
      const outcome = VERDICT[s.state];
      if (!outcome || (p && p.state === s.state && p.log === s.log)) continue;
      const needs = s.state === 'PASS' && s.gate === 'G5' ? 'approve-ui' : s.state === 'PASS' && s.gate === 'G9' ? 'sign-off' : null;
      out.push(makeEvent({ kind: 'gate', slug: i.slug, outcome, title: `${s.gate} ${s.stage ?? ''} ${s.state}`.replace(/\s+/g, ' '), link: s.log, run_id: s.run_id, needs }, now));
    }
    // A need is cleared by a later `pass` with the same slug and link and no `needs`.
    const g5 = (i.stages ?? []).find((s) => s.gate === 'G5');
    if (i.ui_approved && !was?.ui_approved && g5?.log) out.push(makeEvent({ kind: 'gate', slug: i.slug, outcome: 'pass', title: 'G5 UI approved by a named human', link: g5.log }, now));
    const g9 = (i.stages ?? []).find((s) => s.gate === 'G9');
    const g10 = (i.stages ?? []).find((s) => s.gate === 'G10');
    const g10was = (was?.stages ?? []).find((s) => s.gate === 'G10');
    if (g9?.log && g10?.state === 'PASS' && g10was?.state !== 'PASS') out.push(makeEvent({ kind: 'gate', slug: i.slug, outcome: 'pass', title: 'G9 release signed off (G10 passed)', link: g9.log }, now));
    const decs = new Map((was?.decisions ?? []).map((d) => [d.id, d]));
    for (const d of i.decisions ?? []) {
      const p = decs.get(d.id);
      if (p && p.status === d.status) continue;
      const needs = d.status === 'assumed' ? 'confirm-dec' : d.status === 'open' && d.blocking ? 'answer-dec' : null;
      const outcome = d.status === 'answered' ? 'pass' : d.blocking ? 'blocked' : 'info';
      out.push(makeEvent({ kind: 'decision', slug: i.slug, outcome, title: `${d.id} ${d.status}: ${d.question}`, link: null, needs }, now));
    }
  }
  return out;
}
