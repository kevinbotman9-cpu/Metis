'use client';

import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/**
 * Reference text a reader can reach, kept off the page until they do.
 *
 * Built for the prose pass on 2026-09-13. The console's explanations had been
 * written for someone learning the platform; the audience is now a decisioning
 * architect who does not need a holdout explained. What stays on the page states
 * a constraint the reader must know. What is only reference — what a reason code
 * means, what a node type does, what a tier covers — moves here, one focusable
 * control away.
 *
 * Radix, per Rule 5: the trigger is a real button, so it is reachable from the
 * keyboard and announced with its label, and the content is described for
 * assistive technology rather than hidden from it.
 */
export function InfoTip({
  label,
  children,
}: {
  /** What the tip is about, for the trigger's accessible name: "About eligibility". */
  label: string;
  /** The reference text. */
  children: ReactNode;
}) {
  return (
    <RadixTooltip.Provider delayDuration={150}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border text-label text-content-subtle hover:border-border-strong hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden>?</span>
          </button>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side="top"
            sideOffset={6}
            className="z-50 max-w-xs rounded border border-border bg-surface px-2 py-1.5 text-label text-content shadow"
          >
            {children}
            <RadixTooltip.Arrow className="fill-surface" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
