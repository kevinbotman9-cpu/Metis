import Link from 'next/link';
import { cn } from '@/lib/cn';

/**
 * The evidence pane's parts — the right-hand pane of a Cascade (§4.7).
 *
 * The four Cascade screens each wrote their evidence by hand, and each read as a
 * list of loose rows under a heading. These give them one shape: what is
 * selected, the one line that names it, the fields behind it, a quote for the
 * sentence a reader most needs, and what they can do next.
 *
 * **A quote states what the record supports, never more.** The trace reference
 * quoted "the reason shown to the customer", and the platform has no such text
 * (G-057), so the trace quotes the reason code's meaning and the node's own
 * recorded reason instead. A quote in this pane is read as evidence; one that is
 * written rather than derived has to be a sentence the numbers beside it prove.
 */

export type EvidenceTone = 'neutral' | 'accent' | 'pass' | 'hold' | 'block';

const EDGE: Record<EvidenceTone, string> = {
  neutral: 'border-border-strong',
  accent: 'border-accent',
  pass: 'border-pass',
  hold: 'border-hold',
  block: 'border-block',
};

/** What is selected, in the pane's quietest voice. */
export function EvidenceLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-label font-semibold text-content-subtle">{children}</h2>;
}

/** The one line that names it. */
export function EvidencePick({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-body font-semibold text-content">{children}</p>;
}

/** The fields behind it. */
export function EvidenceFields({ children }: { children: React.ReactNode }) {
  return <dl className="mt-2 flex flex-col">{children}</dl>;
}

export function EvidenceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-2">
      <dt className="text-label text-content-subtle">{label}</dt>
      <dd className="mt-0.5 text-label text-content">{children}</dd>
    </div>
  );
}

/**
 * The sentence a reader most needs, set apart. The edge takes the tone of what
 * is selected — a break, a hold, a pass — so the quote belongs to the stage.
 */
export function EvidenceQuote({
  title,
  tone = 'neutral',
  children,
}: {
  title: string;
  tone?: EvidenceTone;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn('mt-3 rounded-r border-l-4 bg-surface-sunken px-3 py-2.5', EDGE[tone])}>
      <figcaption className="text-label font-semibold text-content">{title}</figcaption>
      <div className="mt-1 text-label text-content-muted">{children}</div>
    </figure>
  );
}

/** What they can do next, with what it will do. */
export function EvidenceAction({
  href,
  children,
  sub,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'mt-3 block rounded border px-3 py-2 text-label font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        primary
          ? 'border-accent bg-accent text-on-accent hover:bg-accent-hover'
          : 'border-border-strong bg-surface text-content hover:bg-surface-sunken'
      )}
    >
      {children}
      {sub ? <span className="mt-0.5 block font-normal">{sub}</span> : null}
    </Link>
  );
}
