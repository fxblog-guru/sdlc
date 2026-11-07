// One handling site per catalogue type, switched on the problem type, never on the status.
export const MAX_NAME = 100;

export function problemToUi(p: { type: string }) {
  switch (p.type) {
    case '/problems/validation':
      return 'field';
    case '/problems/release-not-found':
      return 'page';
    case '/problems/release-conflict':
      return 'conflict';
    case '/problems/internal':
      return 'toast';
    default:
      return 'toast';
  }
}
