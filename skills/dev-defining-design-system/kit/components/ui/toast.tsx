import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { copy } from '../../copy/en';
import { Button } from './button';

// Toasts confirm an action that succeeded off-screen or report a transient condition (429).
// Inline success stays inline: a saved form says so in its footer, not in a toast (copy style guide,
// "Feedback"). One region, role="status", polite; a toast never carries the only route to an action.
// No dependency: a small store and one <Toaster/> at the app root.

export interface ToastItem {
  id: number;
  tone: 'success' | 'info' | 'warning' | 'danger';
  message: string;
  action?: { label: string; onClick: () => void };
}

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => {
  for (const l of listeners) l(items);
};

export function toast(message: string, opts: Partial<Omit<ToastItem, 'id' | 'message'>> & { duration?: number } = {}): number {
  seq += 1;
  const id = seq;
  items = [...items, { id, message, tone: opts.tone ?? 'success', action: opts.action }];
  emit();
  const ms = opts.duration ?? 6000;
  if (ms > 0) setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number): void {
  items = items.filter((t) => t.id !== id);
  emit();
}

const TONE = { success: 'border-success', info: 'border-info', warning: 'border-warning', danger: 'border-danger' } as const;

export function Toaster() {
  const [list, setList] = React.useState<ToastItem[]>(items);
  React.useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div role="status" aria-live="polite" data-slot="toaster" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-dialog flex-col gap-2 px-4">
      {list.map((t) => (
        <div key={t.id} data-slot="toast" data-tone={t.tone} className={cn('pointer-events-auto flex items-center gap-3 rounded-md border-l-4 bg-surface p-4 text-body text-text shadow-2', TONE[t.tone])}>
          <p className="min-w-0 flex-1">{t.message}</p>
          {t.action ? (
            <Button variant="link" size="sm" onClick={t.action.onClick}>
              {t.action.label}
            </Button>
          ) : null}
          <Button variant="icon" size="sm" aria-label={copy.common.close} onClick={() => dismiss(t.id)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}
