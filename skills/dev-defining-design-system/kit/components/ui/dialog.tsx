import * as React from 'react';
import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { copy } from '../../copy/en';
import { Button } from './button';

// Dialog = Radix Dialog (focus trap, Escape, focus return, aria-modal) at the kit's width and scrim.
// The discard guard is built in: pass `dirty` and closing by Escape, the scrim, the X or Cancel
// asks first. release-management had 18 input dialogs and none of them guarded.

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** the form has unsaved input: closing asks "Discard your changes?" first */
  dirty?: boolean;
  /** the footer, primary action last; Cancel is added unless `footer` is given */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, dirty = false, footer, children, className }: DialogProps) {
  const [confirming, setConfirming] = React.useState(false);
  const requestClose = React.useCallback(() => {
    if (dirty) setConfirming(true);
    else onOpenChange(false);
  }, [dirty, onOpenChange]);
  return (
    <>
      <D.Root
        open={open}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestClose();
        }}
      >
        <D.Portal>
          <D.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-scrim" />
          <D.Content
            data-slot="dialog"
            {...(description ? {} : { 'aria-describedby': undefined })}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 grid max-h-full w-full max-w-dialog -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border border-border bg-surface p-6 text-text shadow-3',
              className,
            )}
          >
            <div className="grid gap-1 pr-8">
              <D.Title className="text-h3 text-text">{title}</D.Title>
              {description ? <D.Description className="text-body text-text-muted">{description}</D.Description> : null}
            </div>
            {children}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {footer ?? (
                <Button variant="secondary" onClick={requestClose}>
                  {copy.common.cancel}
                </Button>
              )}
            </div>
            <D.Close asChild>
              <Button variant="icon" size="sm" aria-label={copy.common.close} className="absolute right-4 top-4">
                <X aria-hidden="true" />
              </Button>
            </D.Close>
          </D.Content>
        </D.Portal>
      </D.Root>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={copy.common.discard.title}
        description={copy.common.discard.body}
        confirmLabel={copy.common.discard.confirm}
        cancelLabel={copy.common.discard.keep}
        tone="danger"
        onConfirm={() => {
          setConfirming(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** a question naming the object: "Delete release 2.4?" */
  title: React.ReactNode;
  /** the consequence, in one sentence: "Its 12 tickets go back to the backlog." */
  description: React.ReactNode;
  /** the verb from the title, never "OK" or "Yes": "Delete release" */
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  pending?: boolean;
  onConfirm: () => void;
}

/** The confirm-dialog pattern of the copy style guide, on Radix Dialog with role="alertdialog". */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = copy.common.cancel, tone = 'primary', pending = false, onConfirm }: ConfirmDialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <D.Content
          role="alertdialog"
          data-slot="confirm-dialog"
          className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-dialog -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-surface p-6 text-text shadow-3"
        >
          <D.Title className="text-h3 text-text">{title}</D.Title>
          <D.Description className="text-body text-text-muted">{description}</D.Description>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <D.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </D.Close>
            <Button variant={tone} mutates pending={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
