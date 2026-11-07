import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { formatDate } from '../lib/format';
import { en } from '../copy/en';
export function ReleasePage({ at }: { at: Date }) {
  return (
    <section>
      <Skeleton />
      <p>{formatDate(at)}</p>
      <Button onClick={() => void 0}>{en.common.cancel}</Button>
    </section>
  );
}
