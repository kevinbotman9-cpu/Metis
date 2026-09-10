'use client';

import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/ui/health-summary';

/**
 * The Cascade rail — `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * A decomposition read top to bottom, where each stage is a subset of the one
 * above and the interesting fact is what falls out between them. The rail is
 * not navigation: it is the subject, and it carries enough — figure,
 * proportion, bar, sparkline — that the shape is legible before anything is
 * clicked.
 *
 * **A break is drawn, not smoothed.** Where the decomposition loses most of its
 * volume for a structural reason rather than a behavioural one, the stage is
 * rendered in the block colour, states the count that fell out, and says why. A
 * smaller bar is not enough: a reader takes a small bar for a poor result and a
 * break for a broken thing, and only one of those is actionable.
 */

export interface CascadeStage {
  id: string;
  label: string;
  value: number;
  /** Proportion of the first stage, for the bar. */
  pct: number;
  /** The short right-hand figure — usually a percentage of the stage above. */
  note: string;
  /** Daily values, for the sparkline. */
  series: number[];
  /**
   * The loop breaks here, and this says why.
   *
   * Present only on a structural break. A stage that is simply smaller than the
   * one above it does not get one, or the emphasis stops meaning anything.
   */
  broken?: string;
}

export interface CascadeRailProps {
  stages: readonly CascadeStage[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** One line under the rail, stating what the whole decomposition means. */
  foot?: React.ReactNode;
  label: string;
}

export function CascadeRail({ stages, selected, onSelect, foot, label }: CascadeRailProps) {
  return (
    <nav aria-label={label} className="flex flex-col">
      <ul className="flex flex-col">
        {stages.map((stage) => {
          const current = stage.id === selected;
          return (
            <li key={stage.id}>
              <button
                type="button"
                // `aria-current="step"` rather than a tab: these are stages of
                // one decomposition, not alternative views, and a reader
                // navigating by role should be told which step they are on.
                aria-current={current ? 'step' : undefined}
                // Named explicitly rather than left to the accessible name
                // computation: the button contains a sparkline, and a name
                // assembled from its contents reads the figure, the proportion
                // and then "Deliverable per day" as one run-on sentence.
                aria-label={`${stage.label}: ${stage.value.toLocaleString('en-GB')}, ${stage.note}${
                  stage.broken ? `. ${stage.broken}` : ''
                }`}
                onClick={() => onSelect(current ? null : stage.id)}
                className={cn(
                  'w-full border-b border-border px-cell py-3 text-left transition-colors',
                  'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent',
                  current && 'bg-surface-sunken shadow-[inset_3px_0_0] shadow-accent'
                )}
              >
                <span
                  className={cn(
                    'flex items-center gap-2 text-label',
                    stage.broken ? 'text-block' : 'text-content-subtle'
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'block h-[7px] w-[7px] rounded-sm',
                      stage.broken ? 'bg-block' : 'bg-accent'
                    )}
                  />
                  {stage.label}
                </span>

                <span className="mt-1.5 flex items-baseline gap-2">
                  <strong
                    className={cn(
                      'tnum text-[1.75rem] font-bold leading-none tracking-tight',
                      stage.broken ? 'text-block' : 'text-content'
                    )}
                  >
                    {stage.value.toLocaleString('en-GB')}
                  </strong>
                  <span className="text-label text-content-subtle">{stage.note}</span>
                </span>

                <span
                  aria-hidden
                  className="mt-2 block h-[5px] overflow-hidden rounded-sm bg-surface-sunken"
                >
                  <span
                    className={cn(
                      'block h-full rounded-sm',
                      stage.broken ? 'bg-block' : 'bg-accent'
                    )}
                    style={{ width: `${Math.max(stage.pct, 0.6)}%` }}
                  />
                </span>

                <span className="mt-2 block">
                  <Sparkline
                    values={stage.series}
                    label={`${stage.label} per day`}
                    tone={stage.broken ? 'hold' : 'accent'}
                  />
                </span>

                {stage.broken ? (
                  <span className="mt-2 block text-label leading-snug text-block">
                    {stage.broken}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {foot ? (
        <p className="px-cell py-3 text-label leading-relaxed text-content-subtle">{foot}</p>
      ) : null}
    </nav>
  );
}
