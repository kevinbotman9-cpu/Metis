'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A summary card that shows a total and how that total breaks down.
 *
 * A bare count ("15 deployments") tells an operator nothing they can act on.
 * The breakdown does: 12 passing, 1 at risk, 1 failing, and the ring turns the
 * proportion into something readable at a glance from across a room.
 */

export interface HealthSegment {
  label: string;
  count: number;
  tone: 'pass' | 'hold' | 'block' | 'neutral';
}

const TONE_STROKE: Record<HealthSegment['tone'], string> = {
  pass: 'rgb(var(--pass))',
  hold: 'rgb(var(--hold))',
  block: 'rgb(var(--block))',
  neutral: 'rgb(var(--border-strong))',
};

const TONE_TEXT: Record<HealthSegment['tone'], string> = {
  pass: 'text-pass',
  hold: 'text-hold',
  block: 'text-block',
  neutral: 'text-content-muted',
};

const TONE_DOT: Record<HealthSegment['tone'], string> = {
  pass: 'bg-pass',
  hold: 'bg-hold',
  block: 'bg-block',
  neutral: 'bg-border-strong',
};

/** 5,000 will not fit inside a 44px ring; 5k will. */
function abbreviate(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

/** Donut built from stroke-dasharray, so it needs no charting library. */
function Ring({ segments, total }: { segments: HealthSegment[]; total: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg viewBox="0 0 56 56" className="h-16 w-16 shrink-0" role="presentation">
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="rgb(var(--surface-sunken))"
        strokeWidth="6"
      />
      {total > 0 &&
        segments
          .filter((s) => s.count > 0)
          .map((s) => {
            const length = (s.count / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const el = (
              <circle
                key={s.label}
                cx="28"
                cy="28"
                r={radius}
                fill="none"
                stroke={TONE_STROKE[s.tone]}
                strokeWidth="6"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                // Start at twelve o'clock rather than three.
                transform="rotate(-90 28 28)"
              />
            );
            offset += length;
            return el;
          })}
      <text
        x="28"
        y="28"
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          'tnum fill-content font-semibold',
          total >= 1000 ? 'text-[0.8125rem]' : 'text-[1rem]'
        )}
      >
        {abbreviate(total)}
      </text>
    </svg>
  );
}

export function HealthSummary({
  label,
  segments,
  total,
}: {
  label: string;
  segments: HealthSegment[];
  /** Defaults to the sum of the segments. */
  total?: number;
}) {
  const sum = total ?? segments.reduce((n, s) => n + s.count, 0);

  return (
    <div className="flex min-w-0 items-start gap-3.5 rounded-xl border border-border bg-surface px-card py-4 shadow-sm">
      <Ring segments={segments} total={sum} />
      <div className="min-w-0">
        <p className="text-label font-medium uppercase tracking-[0.06em] text-content-subtle">
          {label}
        </p>
        <ul className="mt-1.5 space-y-1">
          {segments.map((s) => (
            <li key={s.label} className="flex items-baseline gap-1.5 text-label leading-tight">
              <span
                aria-hidden
                className={cn('mt-1 h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[s.tone])}
              />
              <span className={cn('tnum shrink-0 font-semibold', TONE_TEXT[s.tone])}>
                {s.count.toLocaleString('en-GB')}
              </span>
              <span className="text-content-muted">{s.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * A large figure with an optional trend, for the headline number in a strip.
 * Sits alongside HealthSummary without a ring, when there is nothing to break
 * a total into.
 */
export function BigStat({
  label,
  value,
  delta,
  sub,
}: {
  label: string;
  value: ReactNode;
  /** Signed percentage change; sign chooses the colour and the arrow. */
  delta?: number;
  sub?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-surface px-card py-4 shadow-sm">
      <p className="text-label font-medium uppercase tracking-[0.06em] text-content-subtle">
        {label}
      </p>
      <p className="tnum mt-1.5 flex items-baseline gap-2 text-[2rem] font-semibold leading-none tracking-[-0.02em] text-content">
        {value}
        {delta !== undefined && (
          <span className={cn('text-label font-medium', up ? 'text-pass' : 'text-block')}>
            {up ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
      </p>
      {sub ? <p className="mt-0.5 text-label text-content-muted">{sub}</p> : null}
    </div>
  );
}

/**
 * Inline activity bars for a dense table row.
 *
 * Deliberately tiny and unlabelled: it conveys shape and recency, and the exact
 * numbers live in the row's other columns.
 */
export function Sparkline({
  values,
  label,
  tone = 'accent',
}: {
  values: number[];
  /** Screen readers get this instead of the bars. */
  label: string;
  tone?: 'accent' | 'pass' | 'hold';
}) {
  const max = Math.max(1, ...values);
  const fill =
    tone === 'pass' ? 'bg-pass' : tone === 'hold' ? 'bg-hold' : 'bg-accent';

  return (
    <span className="inline-flex h-6 items-end gap-[2px]" role="img" aria-label={label}>
      {values.map((v, i) => (
        <span
          key={i}
          aria-hidden
          className={cn('w-1 rounded-[1px]', fill)}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

/** Pass / at-risk / fail glyph for a dense table cell. */
export function StatusDot({
  state,
  label,
}: {
  state: 'pass' | 'risk' | 'fail' | 'unknown';
  label: string;
}) {
  const map = {
    pass: { cls: 'text-pass', glyph: '✓' },
    risk: { cls: 'text-hold', glyph: '!' },
    fail: { cls: 'text-block', glyph: '✕' },
    unknown: { cls: 'text-content-subtle', glyph: '?' },
  } as const;
  const { cls, glyph } = map[state];

  return (
    <span
      title={label}
      className={cn(
        'inline-flex h-4 w-4 items-center justify-center rounded-full border text-[0.625rem] font-bold',
        cls,
        state === 'pass' && 'border-pass/40 bg-pass-subtle',
        state === 'risk' && 'border-hold/40 bg-hold-subtle',
        state === 'fail' && 'border-block/40 bg-block-subtle',
        state === 'unknown' && 'border-border bg-surface-sunken'
      )}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden>{glyph}</span>
    </span>
  );
}
