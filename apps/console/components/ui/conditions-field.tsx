'use client';

import { readConditions, writeConditions, type Option, type RuleCondition } from '@metis/ui-metadata';
import { Badge, Input, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';

/**
 * A `conditions` field: every condition must hold.
 *
 * Extracted from the hand-built policy dialog on 2026-09-13, when targeting
 * policies moved into the metadata registry and the vocabulary gained the type
 * (ADR-006, amended). The generic renderer draws it for any descriptor field of
 * that type; it knows nothing about policies.
 *
 * What it keeps from the dialog is what the dialog existed to make unwritable:
 *
 * - **The field is a list, never a text box.** A condition naming a path the
 *   data model does not declare fails every comparison, so the rule suppresses
 *   every candidate while the trace reports a confident failure.
 * - **Operators narrow to the path's type.** `contains` on a number is always
 *   false, which reads as a rule that refused rather than one that could not run.
 * - **An enum offers its members.** `passed` for `pass` reads correctly, matches
 *   nothing, and suppresses every candidate.
 *
 * The paths arrive as options from a named source (`profile.paths`), each
 * carrying its type, its operators and, for an enum, its members.
 */

const OPERATOR_LABEL: Record<string, string> = {
  eq: 'is',
  ne: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  in: 'is one of',
  not_in: 'is none of',
  contains: 'contains',
  exists: 'has a value',
  not_exists: 'has no value',
};

const NEEDS_NO_VALUE = (op: string) => op === 'exists' || op === 'not_exists';
const IS_LIST = (op: string) => op === 'in' || op === 'not_in';
const NUMERIC = new Set(['integer', 'decimal', 'money', 'timestamp']);
const BLANK: RuleCondition = { field: '', operator: 'eq', value: '' };

/** A selectable path, read back out of the option that carried it. */
interface PathMeta {
  path: string;
  type: string;
  kind: string;
  operators: string[];
  members: string[];
  unit?: string;
  description?: string;
}

const list = (joined?: string) => (joined ? joined.split(',').filter(Boolean) : []);

const metaOf = (o: Option): PathMeta => ({
  path: o.value,
  type: o.type ?? 'string',
  kind: o.kind ?? 'field',
  operators: list(o.operators),
  members: list(o.members),
  unit: o.unit,
  description: o.description,
});

export interface ConditionsFieldProps {
  id: string;
  label: string;
  help?: string;
  /** Form state: the conditions as JSON. */
  value: string;
  onChange: (value: string) => void;
  /** The data model's selectable paths. */
  options: readonly Option[];
  enabled: boolean;
  /** A refusal of the whole list — "add at least one condition". */
  problem?: string;
  /** Refusals of single rows, by index: `conditions.2` is the third row. */
  rowProblems?: Readonly<Record<number, string>>;
}

export function ConditionsField({
  id,
  label,
  help,
  value,
  onChange,
  options,
  enabled,
  problem,
  rowProblems = {},
}: ConditionsFieldProps) {
  const stored = readConditions(value);
  // A policy with no conditions does not exist, so the first row is there to
  // fill rather than behind a button.
  const conditions = stored.length > 0 ? stored : [BLANK];
  const paths = options.map(metaOf);
  const byPath = new Map(paths.map((p) => [p.path, p]));

  const emit = (next: RuleCondition[]) => onChange(writeConditions(next));
  const update = (i: number, patch: Partial<RuleCondition>) =>
    emit(conditions.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const choosePath = (i: number, path: string) =>
    update(i, { field: path, operator: byPath.get(path)?.operators[0] ?? 'eq', value: '' });

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
          {paths.length} field{paths.length === 1 ? '' : 's'} available
        </span>
      </div>

      {conditions.map((condition, i) => (
        <ConditionRow
          key={i}
          index={i}
          condition={condition}
          meta={condition.field ? byPath.get(condition.field) : undefined}
          paths={paths}
          problem={rowProblems[i]}
          onPath={(path) => choosePath(i, path)}
          onChange={(patch) => update(i, patch)}
          onRemove={conditions.length > 1 ? () => emit(conditions.filter((_, n) => n !== i)) : undefined}
        />
      ))}

      <Button type="button" variant="secondary" onClick={() => emit([...conditions, BLANK])}>
        Add condition
      </Button>

      {problem ? (
        <p id={`${id}-error`} className="text-label text-block">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

function ConditionRow({
  index,
  condition,
  meta,
  paths,
  problem,
  onPath,
  onChange,
  onRemove,
}: {
  index: number;
  condition: RuleCondition;
  meta?: PathMeta;
  paths: PathMeta[];
  problem?: string;
  onPath: (path: string) => void;
  onChange: (patch: Partial<RuleCondition>) => void;
  onRemove?: () => void;
}) {
  const n = index + 1;
  const operators = meta?.operators.length ? meta.operators : ['eq'];

  return (
    <div className="rounded border border-border bg-surface-sunken p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={`Field for condition ${n}`}
          value={condition.field}
          onChange={(e) => onPath(e.target.value)}
          className="min-w-[14rem]"
        >
          <option value="">Choose a field…</option>
          {paths.map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
              {p.kind === 'aggregation' ? ' (rollup)' : ''}
            </option>
          ))}
        </Select>

        <Select
          aria-label={`Operator for condition ${n}`}
          value={condition.operator}
          onChange={(e) => onChange({ operator: e.target.value })}
          disabled={!meta}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op] ?? op}
            </option>
          ))}
        </Select>

        <ValueControl condition={condition} meta={meta} label={`Value for condition ${n}`} onChange={onChange} />

        {meta ? <Badge tone="neutral">{meta.type}</Badge> : null}
        {meta?.unit ? <span className="text-label text-content-muted">{meta.unit}</span> : null}

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove condition ${n}`}
            className="ml-auto rounded px-1.5 py-0.5 text-label text-content-muted hover:bg-surface hover:text-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Remove
          </button>
        ) : null}
      </div>

      {meta?.description ? <p className="mt-1 text-label text-content-muted">{meta.description}</p> : null}
      {problem ? <p className="mt-1 text-label text-block">{problem}</p> : null}
    </div>
  );
}

function ValueControl({
  condition,
  meta,
  label,
  onChange,
}: {
  condition: RuleCondition;
  meta?: PathMeta;
  label: string;
  onChange: (patch: Partial<RuleCondition>) => void;
}) {
  const numeric = Boolean(meta && NUMERIC.has(meta.type));

  if (NEEDS_NO_VALUE(condition.operator)) {
    return <span className="text-label text-content-muted">no value needed</span>;
  }

  if (meta?.type === 'boolean') {
    return (
      <Select aria-label={label} value={String(condition.value)} onChange={(e) => onChange({ value: e.target.value === 'true' })}>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }

  if (meta?.type === 'enum' && meta.members.length > 0) {
    if (IS_LIST(condition.operator)) {
      const chosen = Array.isArray(condition.value) ? (condition.value as string[]) : [];
      return (
        <span className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
          {meta.members.map((m) => (
            <label key={m} className="flex items-center gap-1 text-label text-content">
              <input
                type="checkbox"
                checked={chosen.includes(m)}
                onChange={(e) => onChange({ value: e.target.checked ? [...chosen, m] : chosen.filter((v) => v !== m) })}
                className="accent-accent"
              />
              {m}
            </label>
          ))}
        </span>
      );
    }
    return (
      <Select aria-label={label} value={String(condition.value ?? '')} onChange={(e) => onChange({ value: e.target.value })}>
        <option value="">Choose…</option>
        {meta.members.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </Select>
    );
  }

  if (IS_LIST(condition.operator)) {
    return (
      <Input
        aria-label={label}
        value={Array.isArray(condition.value) ? condition.value.join(', ') : ''}
        placeholder="e.g. a, b, c"
        onChange={(e) =>
          onChange({
            value: e.target.value
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
              .map((v) => (numeric ? Number(v) : v)),
          })
        }
      />
    );
  }

  return (
    <Input
      aria-label={label}
      type={numeric ? 'number' : 'text'}
      value={condition.value === undefined || condition.value === null ? '' : String(condition.value)}
      onChange={(e) =>
        onChange({ value: numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value })
      }
      placeholder={numeric ? 'e.g. 18' : 'e.g. active'}
    />
  );
}
