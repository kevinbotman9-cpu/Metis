import { cn } from '@/lib/cn';

/**
 * The three panes of a Cascade — `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * Rail, selected stage, evidence, as one object rather than three cards on the
 * page. The four screens that use the pattern each wrote this grid by hand, and
 * each floated its rail and evidence in a card that stopped where its content
 * did, so the rail read as a panel beside the page instead of the spine of it.
 * Here the columns run the full height of the tallest one, the rail column is
 * the frame colour, and the evidence column is a surface, not a card on one.
 *
 * Below `xl` the panes stack: rail, then stage, then evidence.
 */
export function CascadePanes({
  rail,
  children,
  evidence,
  evidenceLabel = 'Evidence',
  wide = false,
  twelve = false,
  className,
}: {
  /** The `CascadeRail`. */
  rail: React.ReactNode;
  /** The selected stage, or the whole before anything is selected. */
  children: React.ReactNode;
  evidence: React.ReactNode;
  evidenceLabel?: string;
  /** A wider evidence column, for the trace, whose evidence carries rule text. */
  wide?: boolean;
  /**
   * Twelve columns — rail 3, cascade 5, evidence 4 — so a page can put what
   * follows the cascade on the same tracks and the seam between them
   * disappears.
   *
   * Opt-in, because the measured problem is one screen's. `/decisions/[id]`
   * ran 272 / 780 / 336 at 1680: the widest column held 227px of content in a
   * 703px box while the evidence column, which carries the ranking function,
   * the customer, five connector timestamps and the compiled-against list,
   * wrapped inside 336px. Four other screens use this component and are left
   * on the tracks they have.
   */
  twelve?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-lg border border-border bg-page',
        twelve
          ? 'xl:grid-cols-12'
          : wide
            ? 'xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,21rem)]'
            : 'xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,19rem)]',
        className
      )}
    >
      {/*
        No gap between the three: they are one object divided by rules, not
        three cards. The gap belongs between this and what follows it, which is
        where the page puts it.
      */}
      <div className={cn('bg-rail', twelve && 'xl:col-span-3')}>{rail}</div>
      <div className={cn('min-w-0 border-border p-3 xl:border-x', twelve && 'xl:col-span-5')}>{children}</div>
      <section
        aria-label={evidenceLabel}
        className={cn(
          'min-w-0 border-t border-border bg-surface p-card xl:border-t-0',
          twelve && 'xl:col-span-4'
        )}
      >
        {evidence}
      </section>
    </div>
  );
}
