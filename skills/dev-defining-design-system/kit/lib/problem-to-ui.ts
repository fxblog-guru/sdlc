// problemToUi(): the ui-spec's Error-UX matrix (dev-specifying-ui/error-ux-matrix.md) as code.
//
// Screens never switch on `problem.type` or `status`. They call problemToUi() and render what it
// returns: the surface decides where (a field, the form summary, a notice, a toast, the page), the
// look decides which component variant, and the copy key decides the sentence. The project fills
// BY_TYPE from its matrix, one entry per ProblemType; the status rows below are the fallbacks every
// matrix has.

import { copy, t } from '../copy/en';

/** RFC 9457 problem details, as DEV-CONTRACTS §13.1 fixes them. */
export interface Problem {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  trace_id?: string;
  errors?: { field?: string; pointer?: string; message?: string; code?: string }[];
  /** set by the fetch layer from the Retry-After header, in seconds */
  retryAfter?: number;
}

export type Surface = 'field' | 'summary' | 'notice' | 'toast' | 'page' | 'sign-in';
/** The three page looks must differ (no permission, not found, not a member); `error` is the red one. */
export type Look = 'no-permission' | 'not-found' | 'not-member' | 'warning' | 'error';
export type Retry = 'yes' | 'no' | 'after-retry-after' | 'after-reload';

export interface UiError {
  surface: Surface;
  look: Look;
  title?: string;
  message: string;
  retry: Retry;
  /** field-level messages for a validation problem, keyed by field name */
  fields: Record<string, string>;
  traceId?: string;
}

type Row = Omit<UiError, 'fields' | 'traceId' | 'message' | 'title'> & { message: (p: Problem) => string; title?: string };

const page = (look: Look, c: { title: string; body: string }): Row => ({ surface: 'page', look, retry: 'no', title: c.title, message: () => c.body });

/** The status rows every matrix has (401, 403, 404, 409, 412, 422, 429, 5xx, offline, unknown). */
const BY_STATUS: Record<string, Row> = {
  '401': { surface: 'sign-in', look: 'warning', retry: 'no', message: () => copy.errors.signedOut },
  '403': page('no-permission', copy.errors.noPermission),
  '404': page('not-found', copy.errors.notFound),
  '409': { surface: 'notice', look: 'warning', retry: 'no', message: () => copy.errors.conflict },
  '412': { surface: 'notice', look: 'warning', retry: 'after-reload', message: () => copy.errors.stale },
  '422': { surface: 'summary', look: 'error', retry: 'no', message: () => copy.errors.validation },
  '429': { surface: 'toast', look: 'warning', retry: 'after-retry-after', message: (p) => t(copy.errors.rateLimited, { seconds: p.retryAfter ?? 30 }) },
  '5xx': { surface: 'notice', look: 'error', retry: 'yes', message: () => copy.errors.server },
  offline: { surface: 'notice', look: 'warning', retry: 'yes', message: () => copy.errors.offline },
  unknown: { surface: 'notice', look: 'error', retry: 'yes', message: () => copy.errors.unknown },
};

/**
 * One entry per ProblemType short name (`/problems/not-a-project-member` → `not-a-project-member`),
 * copied from the ui-spec's matrix. These three are here because every product has them.
 */
export const BY_TYPE: Record<string, Row> = {
  validation: BY_STATUS['422'],
  'not-found': BY_STATUS['404'],
  'not-a-project-member': page('not-member', copy.errors.notMember),
  'role-required': BY_STATUS['403'],
  'precondition-failed': BY_STATUS['412'],
};

const shortType = (type?: string) => (type ? type.replace(/^.*\/problems\//, '') : '');

/** `null` problem with `offline: true` is a request that never reached the server. */
export function problemToUi(problem: Problem | null, { offline = false } = {}): UiError {
  if (offline || !problem) return finish(BY_STATUS.offline, problem ?? {});
  const row =
    BY_TYPE[shortType(problem.type)] ??
    BY_STATUS[String(problem.status)] ??
    (problem.status && problem.status >= 500 ? BY_STATUS['5xx'] : BY_STATUS.unknown);
  return finish(row, problem);
}

function finish(row: Row, p: Problem): UiError {
  const fields: Record<string, string> = {};
  for (const e of p.errors ?? []) {
    const name = e.field ?? e.pointer?.replace(/^\/+/, '').replace(/\//g, '.');
    if (name && e.message) fields[name] = e.message;
  }
  return { surface: row.surface, look: row.look, retry: row.retry, title: row.title, message: row.message(p), fields, traceId: p.trace_id };
}
