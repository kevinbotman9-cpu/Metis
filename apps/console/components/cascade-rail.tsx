'use client';

import { useId } from 'react';
import { cn } from '@/lib/cn';
import { Sparkline } from '@/components/ui/health-summary';
import { useFormat } from '@/components/tenant-format';

/**
 * The Cascade rail — `docs/METIS_CONSOLE_SPEC.md` §4.7.
 *
 * A decomposition read top to bottom, where each stage is a subset of the one
 * above and the interesting fact is what falls out between them. The rail is
 * not navigation: it is the subject, and it carries enough — figure,
 * proportion, bar, sparkline — that the shape is legible before anything is
 * clicked.
 *
 * **It is the frame colour, in both themes.** The one deliberate inversion in
 * the product: the rail is the spine of the screen, and a rail drawn as a white
 * card beside the page read as a sidebar. Every colour on it is a `--rail-*`
 * token measured against the frame and both of its washes
 * (`scripts/check-contrast.mjs`), never an analytic token measured against a
 * white panel. Place it in `CascadePanes`, which gives it the full height.
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
  /**
   * The stage's colour on its dot, bar and selected edge. Defaults to neutral.
   * A break overrides it: the block colour means exactly one thing.
   */
  tone?: CascadeTone;
  /**
   * Daily values, for the sparkline. Optional.
   *
   * A decomposition over time has one — `/performance` draws decisions per day
   * under each stage. A decomposition of a single event does not: one decision
   * trace is an instant, and a sparkline under it would be drawing a shape out
   * of nothing. The stage renders without it rather than with a flat line,
   * which would read as "no activity" instead of "not that kind of question".
   */
  series?: number[];
  /**
   * What this stage took out, when the interesting figure is the loss rather
   * than the survivors. `/performance` counts what is left at each stage; a
   * trace counts what each node removed, and both are the same pattern read
   * from opposite ends.
   */
  removed?: number;
  /**
   * The loop breaks here, and this says why.
   *
   * Present only on a structural break. A stage that is simply smaller than the
   * one above it does not get one, or the emphasis stops meaning anything.
   */
  broken?: string;
}

export type CascadeTone = 'neutral' | 'accent' | 'ok' | 'attention';

const TONE_FILL: Record<CascadeTone | 'broken', string> = {
  neutral: 'bg-rail-muted',
  accent: 'bg-rail-accent',
  ok: 'bg-rail-ok',
  attention: 'bg-rail-attention',
  broken: 'bg-rail-block',
};

const TONE_EDGE: Record<CascadeTone | 'broken', string> = {
  neutral: 'shadow-rail-muted',
  accent: 'shadow-rail-accent',
  ok: 'shadow-rail-ok',
  attention: 'shadow-rail-attention',
  broken: 'shadow-rail-block',
};

export interface CascadeRailProps {
  stages: readonly CascadeStage[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** One line under the rail, stating what the whole decomposition means. */
  foot?: React.ReactNode;
  /** Names the rail, and is shown as its title. */
  label: string;
}

export function CascadeRail({ stages, selected, onSelect, foot, label }: CascadeRailProps) {
  const format = useFormat();
  const titleId = useId();
  return (
    <nav aria-labelledby={titleId} className="flex h-full flex-col bg-rail">
      <h2
        id={titleId}
        className="border-b border-rail-line px-4 pb-2 pt-3 text-label font-semibold text-rail-dim"
      >
        {label}
      </h2>
      <ul className="flex flex-col">
        {stages.map((stage) => {
          const current = stage.id === selected;
          const tone = stage.broken ? 'broken' : (stage.tone ?? 'neutral');
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
                aria-label={`${stage.label}: ${format.number(stage.value)}, ${stage.note}${
                  stage.removed ? `, ${format.number(stage.removed)} removed here` : ''
                }${
                  stage.broken ? `. ${stage.broken}` : ''
                }`}
                onClick={() => onSelect(current ? null : stage.id)}
                className={cn(
                  'w-full border-b border-rail-line px-4 pb-3 pt-2.5 text-left transition-colors',
                  'hover:bg-rail-hover-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rail-fg',
                  current && cn('bg-rail-selected-wash shadow-[inset_3px_0_0]', TONE_EDGE[tone])
                )}
              >
                <span
                  className={cn(
                    'flex items-center gap-2 text-label',
                    stage.broken ? 'text-rail-block' : 'text-rail-dim'
                  )}
                >
                  <span aria-hidden className={cn('block h-1.5 w-1.5 rounded-sm', TONE_FILL[tone])} />
                  {stage.label}
                </span>

                <span className="mt-1.5 flex items-baseline gap-2">
                  <strong
                    className={cn(
                      'tnum text-figure-rail font-semibold tracking-tight',
                      stage.broken ? 'text-rail-block' : 'text-rail-fg'
                    )}
                  >
                    {format.number(stage.value)}
                  </strong>
                  <span className="tnum text-label text-rail-dim">{stage.note}</span>
                </span>

                <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-sm bg-rail-hover/10">
                  <span
                    className={cn('block h-full rounded-sm', TONE_FILL[tone])}
                    style={{ width: `${Math.max(stage.pct, 0.6)}%` }}
                  />
                </span>

                {stage.series ? (
                  <span className="mt-2 block">
                    <Sparkline
                      values={stage.series}
                      label={`${stage.label} per day`}
                      tone={stage.broken ? 'rail-block' : 'rail'}
                    />
                  </span>
                ) : null}

                {stage.removed !== undefined && stage.removed > 0 ? (
                  <span className="mt-1.5 block text-label text-rail-dim">
                    −{format.number(stage.removed)} removed here
                  </span>
                ) : null}

                {stage.broken ? (
                  <span className="mt-1.5 block text-label text-rail-block">{stage.broken}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {foot ? (
        // Callers write their emphasis for a light panel; on the frame it is
        // lifted to the frame's own foreground rather than left to vanish.
        <p className="mt-auto border-t border-rail-line px-4 py-3 text-label text-rail-dim [&_em]:text-rail-fg [&_strong]:text-rail-fg">
          {foot}
        </p>
      ) : null}
    </nav>
  );
}
