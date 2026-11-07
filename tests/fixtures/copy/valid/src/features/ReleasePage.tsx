import { en } from '../copy/en';
type Paged<T> = { data: T[] };
export function ReleasePage({ page }: { page: Promise<Paged<string>> }) {
  return (
    <section aria-label={en.releases.list.emptyTitle}>
      <h1>{en.releases.list.emptyTitle}</h1>
      <p>{en.releases.list.emptyBody}</p>
      <button type="button">{en.common.cancel}</button>
    </section>
  );
}
