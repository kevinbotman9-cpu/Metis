'use client';

import { type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/**
 * A right-hand detail drawer over a dimmed page.
 *
 * Radix Dialog rather than a hand-rolled panel, per the absolute rule: focus
 * trapping, focus restore on close, Escape, aria-modal and the labelled title
 * are all things we would otherwise get subtly wrong. The only thing added
 * here is paging.
 *
 * Paging is the reason this exists rather than a route push. A reviewer
 * walking the catalogue asking "which of these cannot be delivered" wants the
 * next record without losing the list, its scroll position or its filter.
 * Navigation would discard all three each time.
 *
 * `onPrev` / `onNext` are optional: without them the arrows are not rendered
 * at all, rather than rendered disabled. A control that is always present and
 * usually dead teaches people to ignore it.
 */
export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Read out by screen readers as the dialog's accessible name. */
  title: string;
  /** Shown under the title. Also the dialog's accessible description. */
  subtitle?: string;
  /** Top-right of the header — a status control, a switch, an action. */
  headerAside?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  children: ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  headerAside,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  children,
  className,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-scrim/40',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'motion-reduce:animate-none'
          )}
        />
        <Dialog.Content
          aria-describedby={subtitle ? 'drawer-subtitle' : undefined}
          className={cn(
            'fixed right-0 top-0 z-50 flex h-full w-full max-w-[42rem] flex-col',
            'border-l border-border bg-surface shadow-2xl',
            'focus:outline-none',
            className
          )}
        >
          {/* Paging sits above the title, not beside it: it moves between
              records, so it belongs with the chrome rather than with the
              record's own identity. */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            {/* The visible label is the record you would move to; the
                accessible name says what the control does as well. Without it
                a screen reader announces "Data Boost +10GB, button", which
                names a destination and not an action. */}
            {onPrev ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onPrev}
                className="max-w-[15rem]"
                aria-label={prevLabel ? `Previous offer: ${prevLabel}` : 'Previous offer'}
              >
                <span aria-hidden="true">←</span>
                <span className="truncate" aria-hidden="true">
                  {prevLabel ?? 'Previous'}
                </span>
              </Button>
            ) : null}
            {onNext ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onNext}
                className="max-w-[15rem]"
                aria-label={nextLabel ? `Next offer: ${nextLabel}` : 'Next offer'}
              >
                <span className="truncate" aria-hidden="true">
                  {nextLabel ?? 'Next'}
                </span>
                <span aria-hidden="true">→</span>
              </Button>
            ) : null}
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Close">
                <span aria-hidden="true" className="text-[16px] leading-none">
                  ×
                </span>
              </Button>
            </Dialog.Close>
          </div>

          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-h2 font-semibold text-content">
                {title}
              </Dialog.Title>
              {subtitle ? (
                <p id="drawer-subtitle" className="mt-0.5 truncate font-mono text-label text-content-subtle">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {headerAside ? <div className="shrink-0">{headerAside}</div> : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
