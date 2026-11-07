import { en } from '../copy/en';
export function ReleasePage() {
  return (
    <section>
      <h1>Releases</h1>
      <input placeholder="Search releases" />
      <button type="button">{en.common.cancel}</button>
    </section>
  );
}
