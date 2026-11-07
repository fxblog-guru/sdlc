/**
 * The "update available" notice for the dev bundle.
 *
 * The installer (`afx`, or the public `npx agentic-fx`) checks for new versions and writes `.claude/.agentic-fx-updates.json`.
 * This module only reads that file, never the network, and turns it into something the version
 * pill can show. Any doubt (no file, bad JSON, a kind of "none" or "unknown", a field that is not
 * the shape it should be) means no notice. Kept free of `vscode` so `node --test` can reach it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type UpdateKind = 'patch' | 'minor' | 'major';

export interface UpdateNotice {
  installed: string;
  latest: string;
  kind: UpdateKind;
  /** One of the two fixed commands, picked by the notice's `source`: the file's own command is not trusted to run in a terminal. */
  command: string;
  /** An https URL, or '' when the file had none usable. */
  changelogUrl: string;
}

export const UPDATE_FILE = path.join('.claude', '.agentic-fx-updates.json');
export const UPDATE_COMMAND = 'afx update --bundle dev';
export const NPX_UPDATE_COMMAND = 'npx agentic-fx@latest update --bundle dev';

/** `npm:` sources were installed by the public npx package; everything else by afx. */
export const commandFor = (source: unknown): string =>
  typeof source === 'string' && source.startsWith('npm:') ? NPX_UPDATE_COMMAND : UPDATE_COMMAND;
const SEMVER = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]{1,40})?$/;
const KINDS: readonly string[] = ['patch', 'minor', 'major'];

/** Parse the notice file's text. Returns null for anything that is not a certain dev update. */
export function parseUpdateNotice(text: string): UpdateNotice | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const dev = (data as { bundles?: { dev?: Record<string, unknown> } } | null)?.bundles?.dev;
  if (!dev || typeof dev !== 'object') return null;
  const { installed, latest, kind, changelog_url: url, source } = dev;
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return null;
  if (typeof installed !== 'string' || typeof latest !== 'string' || !SEMVER.test(installed) || !SEMVER.test(latest)) return null;
  const changelogUrl = typeof url === 'string' && /^https:\/\/\S{1,300}$/.test(url) ? url : '';
  return { installed, latest, kind: kind as UpdateKind, command: commandFor(source), changelogUrl };
}

export const MANIFEST_FILE = path.join('.claude', '.agentic-fx.json');

/** The dev bundle version `afx` recorded in `<projectRoot>/.claude/.agentic-fx.json`, if any. */
export function readInstalledVersion(projectRoot: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(projectRoot, MANIFEST_FILE), 'utf8')) as { dev?: { version?: unknown } } | null;
    const v = data?.dev?.version;
    return typeof v === 'string' && SEMVER.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

const bare = (v: string): string => v.replace(/^v/, '');

/**
 * Read `<projectRoot>/.claude/.agentic-fx-updates.json`; null when absent, unreadable or silenced.
 * The install manifest beside it wins over the notice's `installed`: after `afx update` the notice
 * can lag, and a project already on `latest` must not be told to update to it.
 */
export function readUpdateNotice(projectRoot: string, env: NodeJS.ProcessEnv = process.env): UpdateNotice | null {
  if (env.AFX_NO_UPDATE_CHECK === '1') return null;
  let notice: UpdateNotice | null;
  try {
    notice = parseUpdateNotice(fs.readFileSync(path.join(projectRoot, UPDATE_FILE), 'utf8'));
  } catch {
    return null;
  }
  if (!notice) return null;
  const installed = readInstalledVersion(projectRoot);
  if (!installed || bare(installed) === bare(notice.installed)) return notice;
  if (bare(installed) === bare(notice.latest)) return null;
  return { ...notice, installed };
}

/** The notice to show, or null when the reader dismissed this exact latest version. */
export function visibleNotice(notice: UpdateNotice | null, dismissedVersion: string | undefined): UpdateNotice | null {
  if (!notice) return null;
  return dismissedVersion === notice.latest ? null : notice;
}

/** What the pill and its screen-reader label say. */
export function noticeLabel(n: UpdateNotice): { short: string; aria: string } {
  const major = n.kind === 'major' ? ' Major version: read UPGRADE.md first.' : '';
  return {
    short: `update ${n.latest}`,
    aria: `Update available: agentic-fx-dev ${n.latest}, installed ${n.installed}, ${n.kind}.${major} Activate for options.`,
  };
}

/** Workspace-state key holding the dismissed version. */
export const DISMISS_KEY = 'sdlc.update.dismissed';

export type UpdateAction = 'changelog' | 'run' | 'dismiss';

/** The quick-pick entries for a notice, in order. Opening the changelog needs a usable URL. */
export function updateChoices(n: UpdateNotice): { action: UpdateAction; label: string; detail: string }[] {
  const out: { action: UpdateAction; label: string; detail: string }[] = [];
  if (n.changelogUrl) out.push({ action: 'changelog', label: '$(link-external) Open CHANGELOG', detail: n.changelogUrl });
  out.push({
    action: 'run',
    label: `$(terminal) Run \`${n.command}\` in a terminal`,
    detail: n.kind === 'major' ? 'MAJOR version: read UPGRADE.md first. You confirm before it runs.' : 'You confirm before it runs.',
  });
  out.push({ action: 'dismiss', label: `$(close) Dismiss for ${n.latest}`, detail: 'Hidden until a newer version is announced.' });
  return out;
}
