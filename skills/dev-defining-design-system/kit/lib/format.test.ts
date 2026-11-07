import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatPercent, formatRelative, formatSize, formatTime, plural } from './format';
import { problemToUi } from './problem-to-ui';

const at = '2026-10-13T08:41:00Z';
const en = { locale: 'en-GB', timeZone: 'UTC' };

describe('lib/format', () => {
  it('formats dates and times per locale and zone, never by slicing the ISO string', () => {
    expect(formatDate(at, en)).toBe('13 Oct 2026');
    expect(formatTime(at, en)).toBe('08:41');
    expect(formatDateTime(at, en)).toBe('13 Oct 2026, 08:41');
    expect(formatTime(at, { locale: 'en-GB', timeZone: 'Asia/Ho_Chi_Minh' })).toBe('15:41');
  });

  it('relative, number, percent and size', () => {
    expect(formatRelative('2026-10-13T08:38:00Z', at, { locale: 'en' })).toBe('3 minutes ago');
    expect(formatNumber(12345, { locale: 'en' })).toBe('12,345');
    expect(formatNumber(12345, { locale: 'de' })).toBe('12.345');
    expect(formatPercent(0.873, { locale: 'en' })).toBe('87.3%');
    expect(formatSize(1536, { locale: 'en' })).toBe('1.5 kB');
    expect(formatSize(512, { locale: 'en' })).toBe('512 byte');
  });

  it('plural follows the locale rules', () => {
    expect(plural(1, { locale: 'en' })).toBe('one');
    expect(plural(2, { locale: 'en' })).toBe('other');
    expect(plural(5, { locale: 'pl' })).toBe('many');
  });
});

describe('problemToUi', () => {
  it('no permission, not found and not a member get three different looks, all on the page', () => {
    const looks = [
      problemToUi({ status: 403, type: '/problems/role-required' }),
      problemToUi({ status: 404, type: '/problems/not-found' }),
      problemToUi({ status: 403, type: '/problems/not-a-project-member' }),
    ];
    expect(looks.map((u) => u.look)).toEqual(['no-permission', 'not-found', 'not-member']);
    expect(new Set(looks.map((u) => u.surface))).toEqual(new Set(['page']));
  });

  it('falls back by status, then 5xx, then unknown; offline when nothing came back', () => {
    expect(problemToUi({ status: 412, type: '/problems/whatever' }).retry).toBe('after-reload');
    expect(problemToUi({ status: 429, retryAfter: 12 }).message).toBe('Too many requests. Wait 12 seconds, then try again.');
    expect(problemToUi({ status: 503 }).surface).toBe('notice');
    expect(problemToUi({ status: 418 }).message).toBe('The request could not be completed. Try again.');
    expect(problemToUi(null, { offline: true }).message).toMatch(/^You are offline/);
  });

  it('maps field errors by field or JSON pointer', () => {
    const u = problemToUi({ status: 422, type: '/problems/validation', errors: [{ pointer: '/name', message: 'Enter a name' }, { field: 'email', message: 'Enter an e-mail address' }] });
    expect(u.surface).toBe('summary');
    expect(u.fields).toEqual({ name: 'Enter a name', email: 'Enter an e-mail address' });
  });
});
