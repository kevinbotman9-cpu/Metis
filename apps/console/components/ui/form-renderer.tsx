'use client';

import { Fragment } from 'react';
import * as Slider from '@radix-ui/react-slider';
import {
  isEnabled,
  layout,
  resolveOptions,
  slug,
  type EntityDescriptor,
  type FieldDescriptor,
  type FormState,
  type Option,
} from '@metis/ui-metadata';
import { Field, Input, Select } from '@/components/ui/primitives';
import { ConditionsField } from '@/components/ui/conditions-field';
import { cn } from '@/lib/cn';

/**
 * The generic renderer. It knows about field *types*, never about entities.
 *
 * There is no `if (entity === 'Offer')` here and there must never be one: the
 * moment this file learns an entity's name, adding a field stops being a
 * one-line change to a descriptor and the whole registry becomes decoration.
 * `packages/ui-metadata` holds what to render; this holds how.
 *
 * Server refusals land on the field they are about, with `aria-invalid` and
 * `aria-describedby` pointing at the message, because a validation message the
 * person has to go and find reads as "something went wrong".
 */

export interface FormRendererProps {
  descriptor: EntityDescriptor;
  form: FormState;
  onChange: (next: FormState) => void;
  /** Whether an existing record is being edited, for immutable fields. */
  editing: boolean;
  permissions: readonly string[];
  /** Options for every `select` whose descriptor names a source. */
  optionSources?: Record<string, readonly Option[]>;
  /** Server refusals, keyed by field path. */
  problems?: Record<string, string>;
  /**
   * Something true about a field right now, keyed by field path and shown
   * beneath it — a weight that moves nothing in the current data, say. Runtime
   * facts the page learns from the server, not copy the descriptor declares.
   */
  notes?: Record<string, string>;
  /** Fields the person has typed in, so a suggestion stops overwriting them. */
  touched: ReadonlySet<string>;
  onTouch: (field: string) => void;
  idPrefix?: string;
}

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
};

export function FormRenderer({
  descriptor,
  form,
  onChange,
  editing,
  permissions,
  optionSources = {},
  problems = {},
  notes = {},
  touched,
  onTouch,
  idPrefix = 'form',
}: FormRendererProps) {
  const blocks = layout(descriptor, form, permissions);

  /**
   * Writing a field also fills anything that suggests from it, and clears
   * anything whose options depended on it — a category chosen under the old
   * objective is not a category, it is a stale id the server would refuse.
   */
  const write = (field: FieldDescriptor, value: string) => {
    const next: FormState = { ...form, [field.field]: value };

    for (const other of descriptor.fields) {
      const suggest = other.suggestFrom;
      if (suggest?.field === field.field && !touched.has(other.field)) {
        if ('transform' in suggest) {
          next[other.field] = slug(value);
        } else {
          // From the chosen option rather than from what was typed: picking a
          // placement suggests the shape that slot declares.
          const chosen = resolveOptions(field, form, optionSources).find((o) => o.value === value);
          next[other.field] = chosen?.[suggest.fromOptionField] ?? '';
        }
      }
      const dependsOn =
        other.options && !('static' in other.options) && other.options.filterBy?.matches;
      if (dependsOn === field.field) next[other.field] = '';
    }

    onChange(next);
  };

  return (
    <Fragment>
      {blocks.map(({ group, fields }, i) => (
        <fieldset
          key={group.key}
          className={cn(
            'min-w-0 border-0 p-0',
            // A hairline and real space, because a legend styled like the
            // field labels beneath it reads as another field label and the
            // whole form goes flat. Not on the first group: a rule above the
            // first thing on the form separates it from nothing.
            i > 0 && 'mt-1 border-t border-border pt-3'
          )}
        >
          {group.label ? (
            // Sentence case, per the visual spec's Forbidden list. The field
            // labels beneath are still upper case from an older convention in
            // `Field`; changing those is a sweep of every form in the console,
            // not this slice.
            <legend className="mb-2 text-body font-medium text-content">{group.label}</legend>
          ) : null}
          <div className={cn('grid gap-3', COLUMNS[group.columns])}>
            {fields.map((field) => (
              <FormField
                key={field.field}
                field={field}
                value={form[field.field] ?? ''}
                enabled={isEnabled(field, form, editing)}
                options={resolveOptions(field, form, optionSources)}
                problem={problems[field.field]}
                note={notes[field.field]}
                rowProblems={rowsOf(problems, field.field)}
                id={`${idPrefix}-${field.field.replace(/\./g, '-')}`}
                onChange={(v) => {
                  onTouch(field.field);
                  write(field, v);
                }}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </Fragment>
  );
}

/** Refusals of single rows of a list field — `conditions.2` — by row index. */
function rowsOf(problems: Record<string, string>, field: string): Record<number, string> {
  const rows: Record<number, string> = {};
  for (const [key, message] of Object.entries(problems)) {
    const rest = key.startsWith(`${field}.`) ? key.slice(field.length + 1) : '';
    if (/^\d+$/.test(rest)) rows[Number(rest)] = message;
  }
  return rows;
}

function FormField({
  field,
  value,
  enabled,
  options,
  problem,
  note,
  rowProblems,
  id,
  onChange,
}: {
  field: FieldDescriptor;
  value: string;
  enabled: boolean;
  options: readonly Option[];
  problem?: string;
  note?: string;
  rowProblems: Record<number, string>;
  id: string;
  onChange: (value: string) => void;
}) {
  if (field.type === 'conditions') {
    return (
      <div className="sm:col-span-3">
        <ConditionsField
          id={id}
          label={field.label}
          help={field.help}
          value={value}
          onChange={onChange}
          options={options}
          enabled={enabled}
          problem={problem}
          rowProblems={rowProblems}
        />
      </div>
    );
  }

  const v = field.validation;
  const described = problem ? `${id}-error` : undefined;
  const shared = {
    id,
    disabled: !enabled,
    required: v?.required,
    'aria-invalid': problem ? (true as const) : undefined,
    'aria-describedby': described,
  };

  return (
    <div className={field.span === 3 ? 'sm:col-span-3' : field.span === 2 ? 'sm:col-span-2' : undefined}>
      <Field label={field.label} htmlFor={id} hint={field.help} error={problem}>
        {field.type === 'select' ? (
          <Select {...shared} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">{enabled ? 'Choose…' : 'Not available yet'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : field.type === 'textarea' ? (
          <textarea
            {...shared}
            rows={3}
            maxLength={v?.maxLength}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className={cn(
              'w-full rounded border border-border bg-surface px-2 py-1.5 text-body text-content',
              'placeholder:text-content-subtle disabled:opacity-50',
              'focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:border-accent'
            )}
          />
        ) : field.type === 'boolean' && field.booleanLabels ? (
          <Select
            {...shared}
            value={value === 'true' ? 'true' : 'false'}
            onChange={(e) => onChange(e.target.value === 'true' ? 'true' : '')}
          >
            <option value="false">{field.booleanLabels.false}</option>
            <option value="true">{field.booleanLabels.true}</option>
          </Select>
        ) : field.type === 'boolean' ? (
          <Input
            {...shared}
            type="checkbox"
            className="h-4 w-4"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : '')}
          />
        ) : field.type === 'number' && field.presentation === 'slider' ? (
          <SliderInput field={field} value={value} enabled={enabled} described={described} onChange={onChange} />
        ) : (
          <Input
            {...shared}
            type={inputType(field)}
            inputMode={field.type === 'money' || field.type === 'number' ? 'decimal' : undefined}
            step={v?.step}
            min={v?.min}
            max={v?.max}
            maxLength={v?.maxLength}
            pattern={v?.pattern}
            title={v?.message}
            placeholder={field.placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </Field>
      {field.counter ? (
        <p
          className={cn(
            'mt-1 text-label',
            value.length > field.counter ? 'text-block' : 'text-content-subtle'
          )}
        >
          {value.length} / {field.counter} characters
        </p>
      ) : null}
      {note ? (
        <p id={`${id}-note`} className="mt-1 text-label text-hold">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A number over its declared range, moved rather than typed.
 *
 * Radix, per Rule 5: the keyboard contract a slider owes — arrows by a step,
 * Page Up and Down by ten, Home and End to the ends — is the part people get
 * wrong by hand. Named by the field's label, and its value is always printed
 * beside it, because a position on a track is not a number anybody can read.
 */
function SliderInput({
  field,
  value,
  enabled,
  described,
  onChange,
}: {
  field: FieldDescriptor;
  value: string;
  enabled: boolean;
  described?: string;
  onChange: (value: string) => void;
}) {
  const v = field.validation;
  const min = v?.min ?? 0;
  const max = v?.max ?? 1;
  const step = v?.step ?? 0.01;
  const current = Number.isFinite(Number(value)) && value !== '' ? Number(value) : min;
  const decimals = String(step).split('.')[1]?.length ?? 0;

  return (
    <div className="flex items-center gap-3">
      <Slider.Root
        className="relative flex h-5 flex-1 touch-none select-none items-center data-[disabled]:opacity-50"
        min={min}
        max={max}
        step={step}
        value={[current]}
        disabled={!enabled}
        onValueChange={([next]) => onChange(String(Number(next.toFixed(decimals))))}
      >
        <Slider.Track className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
          <Slider.Range className="absolute h-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={field.label}
          aria-describedby={described}
          className={cn(
            'block h-4 w-4 rounded-full border-2 border-accent bg-surface',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          )}
        />
      </Slider.Root>
      <output className="tnum w-12 text-right font-mono text-body font-semibold text-content" aria-hidden="true">
        {current.toFixed(Math.max(decimals, 2))}
      </output>
    </div>
  );
}

function inputType(field: FieldDescriptor): string {
  switch (field.type) {
    case 'money':
    case 'number':
      return 'number';
    case 'date':
      return 'date';
    default:
      return 'text';
  }
}
