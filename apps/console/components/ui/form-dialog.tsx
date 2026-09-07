'use client';

import { type FormEvent, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * A centred modal that submits a form.
 *
 * Radix Dialog rather than a hand-rolled overlay, per the absolute rule: focus
 * trapping, focus restore on close, Escape, `aria-modal` and the labelled title
 * are all things a hand-built one gets subtly wrong, usually in a way nobody
 * notices until somebody navigates by keyboard.
 *
 * Distinct from `Drawer`, which is for reading a record beside its list. This
 * is for writing one: centred, narrower, and it owns a `<form>` so Enter
 * submits from any field rather than only from the button.
 *
 * The error banner is for the refusal that is not about one field — a
 * permission, a conflict, a duplicate key. Per-field reasons belong on the
 * fields, which is what `Field`'s `error` is for.
 */
export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Shown under the title, and the dialog's accessible description. */
  description?: string;
  /** What the primary button says. Names its effect, never "Submit". */
  submitLabel: string;
  onSubmit: () => void;
  /** Disables the primary button and shows progress. */
  busy?: boolean;
  /** A refusal that is about the whole write rather than one field. */
  error?: string | null;
  children: ReactNode;
  /** Extra controls beside Cancel — a destructive action, usually. */
  footerAside?: ReactNode;
  className?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  busy = false,
  error,
  children,
  footerAside,
  className,
}: FormDialogProps) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) onSubmit();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim/40" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(42rem,calc(100vw-2rem))]',
            '-translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border',
            'bg-surface shadow-lg focus:outline-none',
            className
          )}
        >
          <form onSubmit={handle} className="flex min-h-0 flex-col">
            <div className="border-b border-border px-card py-3">
              <Dialog.Title className="text-heading font-semibold text-content">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-label text-content-subtle">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-card py-3">
              {error ? (
                <p
                  role="alert"
                  className="rounded border border-block/40 bg-block-subtle px-2 py-1.5 text-body text-block"
                >
                  {error}
                </p>
              ) : null}
              {children}
            </div>

            <div className="flex items-center gap-2 border-t border-border px-card py-3">
              {footerAside}
              <div className="flex-1" />
              <Dialog.Close asChild>
                <Button variant="secondary" type="button">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Saving…' : submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
