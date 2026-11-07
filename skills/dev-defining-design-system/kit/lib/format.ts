// The one place a date, a time, a number, a percentage or a file size becomes text.
//
// release-management grew six private date formatters (one showed `2026-10-13T08:41` sliced from an
// ISO string), seventeen inline number formats, and file sizes in SI on one screen and binary on
// another. The ESLint fragment (eslint.kit.js) bans getUTC*, toLocale*String and
// Intl.DateTimeFormat outside lib/format, so this module stays the only one.
//
// The locale is never hard-coded: it is the document's `lang`, else the browser's. Times are shown
// in the viewer's zone; the API's ISO-8601 UTC strings are parsed, never sliced.

type DateInput = string | number | Date;

/** The locale every formatter uses: `<html lang>`, then the browser, then `en`. */
export function currentLocale(): string {
  if (typeof document !== 'undefined' && document.documentElement.lang) return document.documentElement.lang;
  if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  return 'en';
}

const toDate = (d: DateInput): Date => (d instanceof Date ? d : new Date(d));
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.PluralRules>();
function memo<T extends Intl.DateTimeFormat | Intl.NumberFormat | Intl.RelativeTimeFormat | Intl.PluralRules>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const made = make();
  cache.set(key, made);
  return made;
}

export interface FormatOptions {
  locale?: string;
  timeZone?: string;
}

/** 13 Oct 2026 */
export function formatDate(d: DateInput, o: FormatOptions = {}): string {
  const locale = o.locale ?? currentLocale();
  return memo(`d|${locale}|${o.timeZone ?? ''}`, () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: o.timeZone })).format(toDate(d));
}

/** 08:41 */
export function formatTime(d: DateInput, o: FormatOptions = {}): string {
  const locale = o.locale ?? currentLocale();
  return memo(`t|${locale}|${o.timeZone ?? ''}`, () => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: o.timeZone })).format(toDate(d));
}

/** 13 Oct 2026, 08:41 */
export function formatDateTime(d: DateInput, o: FormatOptions = {}): string {
  const locale = o.locale ?? currentLocale();
  return memo(`dt|${locale}|${o.timeZone ?? ''}`, () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: o.timeZone })).format(toDate(d));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/** "3 minutes ago", "in 2 days". `now` is a parameter so a test can pin it. */
export function formatRelative(d: DateInput, now: DateInput = Date.now(), o: FormatOptions = {}): string {
  const locale = o.locale ?? currentLocale();
  const seconds = Math.round((toDate(d).getTime() - toDate(now).getTime()) / 1000);
  const rtf = memo(`r|${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }));
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'second') return rtf.format(Math.trunc(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}

/** 12,345 — grouping per locale; `digits` fixes the fraction digits. */
export function formatNumber(n: number, o: FormatOptions & { digits?: number } = {}): string {
  const locale = o.locale ?? currentLocale();
  const d = o.digits;
  return memo(`n|${locale}|${d ?? ''}`, () => new Intl.NumberFormat(locale, d === undefined ? {} : { minimumFractionDigits: d, maximumFractionDigits: d })).format(n);
}

/** 0.873 → 87.3 %. The input is a ratio, never a value already multiplied by 100. */
export function formatPercent(ratio: number, o: FormatOptions & { digits?: number } = {}): string {
  const locale = o.locale ?? currentLocale();
  const d = o.digits ?? 1;
  return memo(`p|${locale}|${d}`, () => new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d })).format(ratio);
}

const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/** 1536 → 1.5 kB. Binary steps (1024), named with the short units every OS shows. One rule, everywhere. */
export function formatSize(bytes: number, o: FormatOptions = {}): string {
  const locale = o.locale ?? currentLocale();
  let i = 0;
  let n = bytes;
  while (Math.abs(n) >= 1024 && i < SIZE_UNITS.length - 1) {
    n /= 1024;
    i += 1;
  }
  const unit = SIZE_UNITS[i];
  return memo(`s|${locale}|${unit}`, () => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: i === 0 ? 0 : 1 })).format(n);
}

/**
 * The plural form of `count` for the copy catalogue: `copy.items[plural(n)]`. Never `n === 1 ? …`,
 * which is wrong for most of the world's languages.
 */
export function plural(count: number, o: FormatOptions = {}): Intl.LDMLPluralRule {
  const locale = o.locale ?? currentLocale();
  return memo(`pl|${locale}`, () => new Intl.PluralRules(locale)).select(count);
}
