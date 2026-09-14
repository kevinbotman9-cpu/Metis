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
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid overflow-hidden rounded-lg border border-border bg-page',
        wide
          ? 'xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,21rem)]'
          : 'xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,19rem)]',
        className
      )}
    >
      <div className="bg-rail">{rail}</div>
      <div className="min-w-0 border-border p-3 xl:border-x">{children}</div>
      <section aria-label={evidenceLabel} className="min-w-0 border-t border-border bg-surface p-card xl:border-t-0">
        {evidence}
      </section>
    </div>
  );
}
