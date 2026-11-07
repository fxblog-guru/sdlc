import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { copy } from '../../copy/en';
import { Button } from './button';

// The cursor pager §13.1 fixes: previous and next, never "page 7 of 312", because a cursor API does
// not know the total. The caller keeps the cursor stack; this only renders it honestly.
export interface PagerProps {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** e.g. "Showing 21–40"; from the copy catalogue */
  status?: string;
  pending?: boolean;
}

export function Pager({ hasPrevious, hasNext, onPrevious, onNext, status, pending = false }: PagerProps) {
  return (
    <nav aria-label={copy.common.pagination} data-slot="pager" className="flex items-center justify-between gap-4 py-3">
      <p className="text-small text-text-muted" aria-live="polite">
        {status}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={!hasPrevious || pending} onClick={onPrevious}>
          <ChevronLeft aria-hidden="true" />
          {copy.common.previous}
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasNext || pending} onClick={onNext}>
          {copy.common.next}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
