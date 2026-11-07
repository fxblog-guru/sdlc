// Branches on the status, and handles only one catalogue type.
export function onError(res: { status: number }, p: { type: string }) {
  if (res.status === 404) return 'gone';
  if (p.type === '/problems/validation') return 'field';
  return 'toast';
}
