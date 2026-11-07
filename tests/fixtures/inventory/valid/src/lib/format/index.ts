export function formatDate(d: Date): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}
