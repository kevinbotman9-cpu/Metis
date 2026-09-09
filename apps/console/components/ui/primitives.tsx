'use client';

/**
 * Shared display primitives. Everything here is token-driven and density-aware.
 */

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

// --- Input -----------------------------------------------------------------

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-8 w-full rounded border border-border bg-surface px-2 text-body text-content',
        'placeholder:text-content-subtle',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:border-accent',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-8 w-full rounded border border-border bg-surface px-2 text-body text-content',
        'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:border-accent',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /**
   * Why this field was refused.
   *
   * Beside the input rather than in a summary at the top of the form: a
   * validation message the person has to go and find is a validation message
   * that gets read as "something went wrong". The id is derived from `htmlFor`
   * so the input can point at it with `aria-describedby`.
   */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="text-label font-medium uppercase tracking-wide text-content-subtle"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-label text-block">
          {error}
        </p>
      ) : hint ? (
        <p className="text-label text-content-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

// --- Badge -----------------------------------------------------------------

const badge = cva(
  'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label font-medium leading-tight',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-sunken text-content-muted',
        accent: 'bg-accent-subtle text-accent',
        pass: 'bg-pass-subtle text-pass',
        block: 'bg-block-subtle text-block',
        hold: 'bg-hold-subtle text-hold',
        info: 'bg-info-subtle text-info',
        outline: 'border border-border text-content-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  }
);

export interface BadgeProps extends VariantProps<typeof badge> {
  className?: string;
  children: ReactNode;
}

export function Badge({ tone, className, children }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)}>{children}</span>;
}

/** Maps an offer status to a consistent tone across every surface. */
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'pass'
      : status === 'draft'
        ? 'info'
        : status === 'paused'
          ? 'hold'
          : 'neutral';
  return <Badge tone={tone as never}>{status}</Badge>;
}

/** The autonomy ladder gets its own colour scale, L0 cool through L4 warm. */
export function AutonomyBadge({ level, name }: { level: string; name?: string }) {
  const cls: Record<string, string> = {
    // Named tints rather than `bg-lN/12`. A token as text over 12% of itself is
    // a pair nothing can measure without compositing it, and L3 was failing:
    // 4.37 on the sunken surface. The tints are now tokens, so the contrast
    // script checks them like every other chip.
    L0: 'bg-l0-subtle text-l0 border-l0/30',
    L1: 'bg-l1-subtle text-l1 border-l1/30',
    L2: 'bg-l2-subtle text-l2 border-l2/30',
    L3: 'bg-l3-subtle text-l3 border-l3/30',
    L4: 'bg-l4-subtle text-l4 border-l4/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-label font-semibold',
        cls[level] ?? cls.L0
      )}
    >
      {level}
      {name ? <span className="font-normal">{name}</span> : null}
    </span>
  );
}

// --- Card ------------------------------------------------------------------

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-surface shadow',
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 border-b border-border px-card py-3.5">
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold tracking-tight text-content">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-label text-content-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn('p-card', className)}>{children}</div>;
}

// --- Page scaffolding ------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="mb-stack flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {breadcrumb ? <div className="mb-1">{breadcrumb}</div> : null}
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-content">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-body text-content-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Consistent page gutter and max width for every route. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1500px] px-7 py-6">{children}</div>;
}

// --- Metric ----------------------------------------------------------------

export function Metric({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'pass' | 'block' | 'hold' | 'accent';
}) {
  const toneCls: Record<string, string> = {
    neutral: 'text-content',
    pass: 'text-pass',
    block: 'text-block',
    hold: 'text-hold',
    accent: 'text-accent',
  };
  return (
    <div className="rounded-lg border border-border bg-surface px-card py-3">
      <p className="text-label uppercase tracking-wide text-content-subtle">{label}</p>
      <p className={cn('tnum mt-1 text-xl font-semibold tabular-nums', toneCls[tone])}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-label text-content-muted">{sub}</p> : null}
    </div>
  );
}

// --- States ----------------------------------------------------------------

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 px-card py-10 text-body text-content-muted"
    >
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-border border-t-accent" />
      {label}…
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-card py-12 text-center">
      <p className="text-body font-medium text-content">{title}</p>
      {description ? (
        <p className="max-w-md text-body text-content-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="m-card flex flex-col items-start gap-2 rounded border border-block/40 bg-block-subtle px-card py-4"
    >
      <p className="text-body font-medium text-block">{title}</p>
      {description ? <p className="text-body text-content-muted">{description}</p> : null}
      {onRetry ? (
        <button
          onClick={onRetry}
          className="mt-1 rounded border border-block/40 px-2 py-1 text-label font-medium text-block hover:bg-block/10"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function PermissionDenied({ permission }: { permission: string }) {
  return (
    <div className="m-card rounded border border-hold/40 bg-hold-subtle px-card py-4">
      <p className="text-body font-medium text-hold">You do not have access to this view</p>
      <p className="mt-1 text-body text-content-muted">
        It requires the <code className="font-mono text-label">{permission}</code> permission.
        Ask an administrator to grant it, or switch to an account that has it.
      </p>
    </div>
  );
}
