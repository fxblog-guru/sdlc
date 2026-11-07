// The copy catalogue: every string a user reads, keyed `{area}.{screen}.{element}`, and `common.*`
// / `errors.*` for the shared ones. Written to the copy style guide
// (dev-defining-design-system/copy-style.md) and checked by `copy-lint.mjs`.
//
// A screen imports `copy` and reads a key; it never writes a literal. One "Cancel" lives here, not
// thirty. A second locale is a second file with the same keys (`satisfies Copy` makes a missing key
// a type error), so nothing below may assume English word order: interpolate with `t()`.
//
// The kit's own primitives read only `common.*` and `errors.*`. A project adds its screens' keys.

export const en = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    retry: 'Try again',
    delete: 'Delete',
    loading: 'Loading',
    more: 'More actions',
    previous: 'Previous',
    next: 'Next',
    pagination: 'Pagination',
    required: 'Required',
    details: 'Details',
    discard: {
      title: 'Discard your changes?',
      body: 'You have changes that are not saved. If you close now, they are lost.',
      confirm: 'Discard changes',
      keep: 'Keep editing',
    },
    summary: {
      title: { one: 'There is {count} problem with this form.', other: 'There are {count} problems with this form.' },
    },
    status: {
      success: 'Done',
      warning: 'At risk',
      danger: 'Failed',
      info: 'In progress',
      neutral: 'Not started',
    },
  },
  errors: {
    validation: 'Some fields need attention.',
    signedOut: 'Your session has ended. Sign in again to continue.',
    noPermission: { title: 'You do not have access to this page', body: 'Ask a project admin for the {role} role.' },
    notFound: { title: 'This page does not exist', body: 'It may have been deleted, or the link is wrong.' },
    notMember: { title: 'You are not a member of this project', body: 'Ask a project admin to add you.' },
    conflict: 'This changed while you were working on it. Reload to see the latest version.',
    stale: 'Someone else changed this while you were editing. Reload to see their changes, then make yours again.',
    rateLimited: 'Too many requests. Wait {seconds} seconds, then try again.',
    server: 'Something went wrong on our side. Try again.',
    offline: 'You are offline. Changes are not saved until you reconnect.',
    unknown: 'The request could not be completed. Try again.',
    mutation: '{object} could not be {verb}. Try again.',
  },
} as const;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };
export type Copy = Widen<typeof en>;

/** `{name}` placeholders filled from `vars`. A missing variable stays visible, so a test sees it. */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export const copy: Copy = en;
