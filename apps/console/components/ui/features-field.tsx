'use client';

import { readFeatures, writeFeatures, type ModelFeatureValue, type Option } from '@metis/ui-metadata';
import { Badge, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

/**
 * A `features` field: the inputs a model reads, as paths into the data model.
 * ADR-009 §5.
 *
 * A list of paths picked from the data model, never typed. The type beside each
 * is the data model's, carried on the option, so a declaration cannot say a
 * field is a number when the data model says it is a string — the mismatch the
 * compiler refuses as `MODEL_FEATURE_TYPE`, made unwritable here instead.
 *
 * Empty is allowed and says something: the model reads nothing a person could
 * be erased from (§8). So there is no first row to fill, unlike conditions.
 *
 * The paths arrive from the same named source a `conditions` field reads,
 * `profile.paths`, each carrying its type.
 */

export interface FeaturesFieldProps {
  id: string;
  label: string;
  help?: string;
  /** Form state: the features as JSON. */
  value: string;
  onChange: (value: string) => void;
  /** The data model's selectable paths. */
  options: readonly Option[];
  enabled: boolean;
  /** A refusal of the whole list. */
  problem?: string;
  /** Refusals of single rows, by index: `features.1.path` is the second row. */
  rowProblems?: Readonly<Record<number, string>>;
}

export function FeaturesField({
  id,
  label,
  help,
  value,
  onChange,
  options,
  enabled,
  problem,
  rowProblems = {},
}: FeaturesFieldProps) {
  const features = readFeatures(value);
  const typeOf = new Map(options.map((o) => [o.value, o.type ?? 'string']));
  const chosen = new Set(features.map((f) => f.path));

  const emit = (next: ModelFeatureValue[]) => onChange(writeFeatures(next));
  const choose = (i: number, path: string) =>
    emit(features.map((f, n) => (n === i ? { path, type: typeOf.get(path) ?? 'string' } : f)));

  return (
    <fieldset
      id={id}
      disabled={!enabled}
      aria-describedby={problem ? `${id}-error` : undefined}
      className="min-w-0 space-y-2 border-0 p-0"
    >
      <legend className="sr-only">{label}</legend>
      <div className="flex items-baseline justify-between gap-2">
        {help ? <p className="text-label text-content-muted">{help}</p> : <span />}
        <span className="shrink-0 text-label text-content-muted">
          {features.length === 0 ? 'Reads no features' : `${features.length} feature${features.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {features.map((feature, i) => {
        const n = i + 1;
        return (
          <div key={i} className="rounded border border-border bg-surface-sunken p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label={`Path for feature ${n}`}
                value={feature.path}
                onChange={(e) => choose(i, e.target.value)}
                className="min-w-[14rem]"
              >
                <option value="">Choose a field…</option>
                {options
                  // A path already read by another row is not offered twice: the
                  // server refuses a duplicate, so the picker does not invite one.
                  .filter((o) => o.value === feature.path || !chosen.has(o.value))
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.value}
                      {o.kind === 'aggregation' ? ' (rollup)' : ''}
                    </option>
                  ))}
              </Select>
              {feature.path ? <Badge tone="neutral">{feature.type}</Badge> : null}
              <button
                type="button"
                onClick={() => emit(features.filter((_, k) => k !== i))}
                aria-label={`Remove feature ${n}`}
                className="ml-auto rounded px-1.5 py-0.5 text-label text-content-muted hover:bg-surface hover:text-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                Remove
              </button>
            </div>
            {rowProblems[i] ? <p className="mt-1 text-label text-block">{rowProblems[i]}</p> : null}
          </div>
        );
      })}

      <Button type="button" variant="secondary" onClick={() => emit([...features, { path: '', type: 'string' }])}>
        Add feature
      </Button>

      {problem ? (
        <p id={`${id}-error`} className="text-label text-block">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}
