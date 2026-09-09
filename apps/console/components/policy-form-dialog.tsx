'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormDialog } from '@/components/ui/form-dialog';
import { Field, Input, Select, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import {
  apiClient,
  ApiError,
  type TargetingPolicyDto,
  type SchemaFieldPathDto,
} from '@/lib/api-client';

/**
 * Author a targeting policy against the data model.
 *
 * The control this replaces did not exist: policies were editable only by
 * changing a fixture. What made that worse than an absent screen is what a
 * free-text field would have produced if somebody had built one —
 * `address.fibre_availabl` compiled, ran, and suppressed a candidate while the
 * trace reported `ELIGIBILITY_FAILED` against a real policy id.
 *
 * So the field is a picker over the schema, never a text input, and the type of
 * the chosen field drives the other two controls:
 *
 *   - the operator list is the one the server sent for that type, so `contains`
 *     cannot appear on a number;
 *   - the value control is typed, and an enum renders its declared members,
 *     so `passed` cannot be typed where the model says `pass`.
 *
 * The server checks the same rules again. The editor cannot be the only guard:
 * the API is reachable without it, and the failure is severe enough to be worth
 * checking twice.
 */

const KINDS: { value: TargetingPolicyDto['kind']; label: string; help: string }[] = [
  { value: 'eligibility', label: 'Eligibility', help: 'Can we offer this at all? A hard gate.' },
  { value: 'relevance', label: 'Relevance', help: 'Should we offer it now? Situational.' },
  { value: 'suitability', label: 'Suitability', help: 'Is it right for this customer? Affordability and ethics.' },
];

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

type Condition = TargetingPolicyDto['conditions'][number];

const NEEDS_NO_VALUE = (op: string) => op === 'exists' || op === 'not_exists';
const IS_LIST = (op: string) => op === 'in' || op === 'not_in';

export interface PolicyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted to create. */
  policy?: TargetingPolicyDto;
}

export function PolicyFormDialog({ open, onOpenChange, policy }: PolicyFormDialogProps) {
  const queryClient = useQueryClient();
  const editing = Boolean(policy);

  const { data: model } = useQuery({
    queryKey: ['profile-schema'],
    queryFn: () => apiClient.getProfileSchema(),
    enabled: open,
  });

  const paths = useMemo(() => model?.paths ?? [], [model]);
  const byPath = useMemo(
    () => new Map(paths.map((p) => [p.path, p])),
    [paths]
  );

  const [name, setName] = useState('');
  const [kind, setKind] = useState<TargetingPolicyDto['kind']>('eligibility');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(false);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<number, string>>({});

  // Reset on open rather than on mount: the dialog stays mounted between
  // edits, so a stale form is what the next person would otherwise see.
  useEffect(() => {
    if (!open) return;
    setName(policy?.name ?? '');
    setKind(policy?.kind ?? 'eligibility');
    setDescription(policy?.description ?? '');
    setActive(policy?.active ?? false);
    setConditions(
      policy?.conditions.length
        ? policy.conditions.map((c) => ({ ...c }))
        : [{ field: '', operator: 'eq', value: '' }]
    );
    setError(null);
    setProblems({});
  }, [open, policy]);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: name.trim(),
        kind,
        description: description.trim(),
        conditions,
        scope: policy?.scope ?? { level: 'tenant' as const, targetId: null },
        active,
      };
      return editing
        ? apiClient.updateTargetingPolicy({ ...policy!, ...body })
        : apiClient.createTargetingPolicy(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['targeting-policies'] });
      onOpenChange(false);
    },
    onError: (e) => {
      const next: Record<number, string> = {};
      if (e instanceof ApiError) {
        for (const p of e.problems) {
          const m = /^conditions\.(\d+)$/.exec(p.field);
          if (m) next[Number(m[1])] = p.message;
        }
        setError(Object.keys(next).length > 0 ? null : e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Could not save the policy.');
      }
      setProblems(next);
    },
  });

  /**
   * Changing the field resets the operator and value.
   *
   * Keeping them would leave `customer.age contains "x"` on screen after
   * switching from a string field — a condition the server will refuse, shown
   * as though it were fine.
   */
  const setField = (i: number, path: string) => {
    const meta = byPath.get(path);
    const operator = meta?.operators[0] ?? 'eq';
    update(i, { field: path, operator: operator as Condition['operator'], value: '' });
  };

  const update = (i: number, patch: Partial<Condition>) => {
    setConditions((cs) => cs.map((c, n) => (n === i ? { ...c, ...patch } : c)));
    setProblems(({ [i]: _dropped, ...rest }) => rest);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Edit policy' : 'New targeting policy'}
      description="Conditions are checked against the data model before this is saved."
      submitLabel={editing ? 'Save policy' : 'Create policy'}
      busy={save.isPending}
      error={error}
      onSubmit={() => save.mutate()}
    >
      <Field label="Name" htmlFor="policy-name">
        <Input
          id="policy-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Adults only"
        />
      </Field>

      <Field
        label="Tier"
        htmlFor="policy-kind"
        hint={KINDS.find((k) => k.value === kind)?.help}
      >
        <Select
          id="policy-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as TargetingPolicyDto['kind'])}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" htmlFor="policy-description">
        <Input
          id="policy-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Regulatory minimum age for a credit agreement"
        />
      </Field>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-label font-medium text-content-subtle">
            Conditions — all must hold
          </span>
          <span className="text-label text-content-muted">
            {paths.length} field{paths.length === 1 ? '' : 's'} available
          </span>
        </div>

        {conditions.map((condition, i) => {
          const meta = condition.field ? byPath.get(condition.field) : undefined;
          return (
            <ConditionRow
              key={i}
              index={i}
              condition={condition}
              meta={meta}
              paths={paths}
              problem={problems[i]}
              onField={(path) => setField(i, path)}
              onChange={(patch) => update(i, patch)}
              onRemove={
                conditions.length > 1
                  ? () => setConditions((cs) => cs.filter((_, n) => n !== i))
                  : undefined
              }
            />
          );
        })}

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setConditions((cs) => [...cs, { field: '', operator: 'eq', value: '' }])
          }
        >
          Add condition
        </Button>
      </div>

      <label className="flex items-center gap-2 text-body text-content">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="accent-accent"
        />
        Active — an inactive policy is stored and not applied
      </label>
    </FormDialog>
  );
}

function ConditionRow({
  index,
  condition,
  meta,
  paths,
  problem,
  onField,
  onChange,
  onRemove,
}: {
  index: number;
  condition: Condition;
  meta?: SchemaFieldPathDto;
  paths: SchemaFieldPathDto[];
  problem?: string;
  onField: (path: string) => void;
  onChange: (patch: Partial<Condition>) => void;
  onRemove?: () => void;
}) {
  const operators = meta?.operators ?? ['eq'];
  const numeric = meta && ['integer', 'decimal', 'money', 'timestamp'].includes(meta.type);

  return (
    <div className="rounded border border-border bg-surface-sunken p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={`Field for condition ${index + 1}`}
          value={condition.field}
          onChange={(e) => onField(e.target.value)}
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
          aria-label={`Operator for condition ${index + 1}`}
          value={condition.operator}
          onChange={(e) => onChange({ operator: e.target.value as Condition['operator'] })}
          disabled={!meta}
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABEL[op] ?? op}
            </option>
          ))}
        </Select>

        <ValueControl condition={condition} meta={meta} numeric={Boolean(numeric)} index={index} onChange={onChange} />

        {meta ? <Badge tone="neutral">{meta.type}</Badge> : null}
        {meta?.unit ? (
          <span className="text-label text-content-muted">{meta.unit}</span>
        ) : null}

        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove condition ${index + 1}`}
            className="ml-auto rounded px-1.5 py-0.5 text-label text-content-muted hover:bg-surface hover:text-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Remove
          </button>
        ) : null}
      </div>

      {meta ? (
        <p className="mt-1 text-label text-content-muted">{meta.description}</p>
      ) : null}
      {problem ? (
        <p className="mt-1 text-label text-block">{problem}</p>
      ) : null}
    </div>
  );
}

/**
 * The value control, chosen by the field's type.
 *
 * An enum renders its members rather than a text box, which is what stops
 * `passed` being written where the model says `pass` — a mistake that reads
 * correctly, matches nothing, and suppresses every candidate.
 */
function ValueControl({
  condition,
  meta,
  numeric,
  index,
  onChange,
}: {
  condition: Condition;
  meta?: SchemaFieldPathDto;
  numeric: boolean;
  index: number;
  onChange: (patch: Partial<Condition>) => void;
}) {
  const label = `Value for condition ${index + 1}`;

  if (NEEDS_NO_VALUE(condition.operator)) {
    return <span className="text-label text-content-muted">no value needed</span>;
  }

  if (meta?.type === 'boolean') {
    return (
      <Select
        aria-label={label}
        value={String(condition.value)}
        onChange={(e) => onChange({ value: e.target.value === 'true' })}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }

  if (meta?.type === 'enum' && meta.members?.length) {
    if (IS_LIST(condition.operator)) {
      const chosen = Array.isArray(condition.value) ? (condition.value as string[]) : [];
      return (
        <span className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
          {meta.members.map((m) => (
            <label key={m} className="flex items-center gap-1 text-label text-content">
              <input
                type="checkbox"
                checked={chosen.includes(m)}
                onChange={(e) =>
                  onChange({
                    value: e.target.checked
                      ? [...chosen, m]
                      : chosen.filter((v) => v !== m),
                  })
                }
                className="accent-accent"
              />
              {m}
            </label>
          ))}
        </span>
      );
    }
    return (
      <Select
        aria-label={label}
        value={String(condition.value ?? '')}
        onChange={(e) => onChange({ value: e.target.value })}
      >
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
    const asText = Array.isArray(condition.value) ? condition.value.join(', ') : '';
    return (
      <Input
        aria-label={label}
        value={asText}
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
        onChange({
          // Empty stays empty rather than becoming 0: a blank numeric input is
          // "not filled in yet", and 0 is a value somebody meant.
          value: numeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value,
        })
      }
      placeholder={numeric ? 'e.g. 18' : 'e.g. active'}
    />
  );
}
