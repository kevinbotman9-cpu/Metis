'use client';

import { Fragment } from 'react';
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

function FormField({
  field,
  value,
  enabled,
  options,
  problem,
  id,
  onChange,
}: {
  field: FieldDescriptor;
  value: string;
  enabled: boolean;
  options: readonly Option[];
  problem?: string;
  id: string;
  onChange: (value: string) => void;
}) {
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
