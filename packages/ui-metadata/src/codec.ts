import type { Condition, EntityDescriptor, FieldDescriptor, Option } from './types';

/**
 * The pure half of the renderer: entity ⇄ form state, and which fields apply.
 *
 * Everything here is a function of a descriptor and a plain object, so it runs
 * in node, in Storybook and in the browser identically, and every rule the
 * form obeys can be tested without rendering anything.
 *
 * Form state is `Record<string, string>` keyed by field path — strings because
 * that is what an `<input>` holds, and one representation is easier to reason
 * about than a union that changes shape per field type.
 */

export type FormState = Record<string, string>;

// --- paths -----------------------------------------------------------------

export function getPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop();
  if (!last) return;
  let node = target;
  for (const key of keys) {
    const next = node[key];
    // Rebuild rather than mutate a nested object borrowed from the entity: a
    // payload that shares structure with the record it came from is how an
    // edit dialog silently changes the row behind it.
    node[key] = next && typeof next === 'object' ? { ...(next as object) } : {};
    node = node[key] as Record<string, unknown>;
  }
  node[last] = value;
}

// --- money -----------------------------------------------------------------

/** Minor units to the major-unit string a person types. 3500 → "35.00". */
export const toMajor = (minor: number): string => (minor / 100).toFixed(2);

/** Major-unit string to the minor units the domain holds. "35.00" → 3500. */
export const toMinor = (major: string): number => Math.round(Number(major || 0) * 100);

/** `Speed Boost 100Mb` → `speed_boost_100mb`. Suggested, never imposed. */
export const slug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

// --- conditions ------------------------------------------------------------

export function conditionHolds(condition: Condition | undefined, form: FormState): boolean {
  if (!condition) return true;
  const value = form[condition.field] ?? '';
  if (condition.isSet !== undefined) return condition.isSet ? value !== '' : value === '';
  if (condition.equals !== undefined) return value === String(condition.equals);
  if (condition.oneOf) return condition.oneOf.some((v) => String(v) === value);
  return true;
}

/**
 * The fields this person, in this state, actually gets.
 *
 * Derived fields are excluded: they are computed on save and never rendered.
 * Permission is checked here rather than in the renderer so that the same
 * answer drives the payload — a field someone cannot see is a field they
 * cannot send.
 */
export function visibleFields(
  descriptor: EntityDescriptor,
  form: FormState,
  permissions: readonly string[]
): FieldDescriptor[] {
  return descriptor.fields
    .filter((f) => !f.derived)
    .filter((f) => !f.permission || permissions.includes(f.permission))
    .filter((f) => conditionHolds(f.visibleWhen, form))
    .sort((a, b) => a.order - b.order);
}

export function isEnabled(field: FieldDescriptor, form: FormState, editing: boolean): boolean {
  if (editing && field.immutableAfterCreate) return false;
  return conditionHolds(field.enabledWhen, form);
}

/** Options for a select, after any declared filter is applied. */
export function resolveOptions(
  field: FieldDescriptor,
  form: FormState,
  sources: Record<string, readonly Option[]>
): readonly Option[] {
  if (!field.options) return [];
  if ('static' in field.options) return field.options.static;

  const all = sources[field.options.source] ?? [];
  const filter = field.options.filterBy;
  if (!filter) return all;

  const against = form[filter.matches] ?? '';
  if (!against) return [];
  return all.filter((o) => o[filter.optionField] === against);
}

// --- entity ⇄ form ---------------------------------------------------------

function fieldToString(field: FieldDescriptor, value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (field.type) {
    case 'money':
      return toMajor(Number(getPath(value, 'amount') ?? 0));
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : '';
    case 'boolean':
      return value ? 'true' : '';
    default:
      return String(value);
  }
}

/** An existing entity as form state, or the blank state for a new one. */
export function toFormState(
  descriptor: EntityDescriptor,
  entity?: Record<string, unknown> | null
): FormState {
  const state: FormState = {};
  for (const field of descriptor.fields) {
    if (field.derived) continue;
    state[field.field] = entity ? fieldToString(field, getPath(entity, field.field)) : '';
  }
  return state;
}

/**
 * Form state as the body to send.
 *
 * Only visible fields are included, so a field hidden by a condition or a
 * permission cannot be smuggled in by a stale value left in state. Derived
 * fields are computed last, from the payload rather than the form, so they
 * follow whatever the visible fields resolved to.
 */
export function toPayload(
  descriptor: EntityDescriptor,
  form: FormState,
  options: {
    editing: boolean;
    permissions: readonly string[];
    /** The record being edited, for values the form preserves but never asks. */
    entity?: Record<string, unknown> | null;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  for (const field of visibleFields(descriptor, form, options.permissions)) {
    // An immutable field is not resent on edit: the server would refuse it,
    // and sending a value the form has disabled is a lie about what happened.
    if (options.editing && field.immutableAfterCreate) continue;

    const raw = form[field.field] ?? '';
    switch (field.type) {
      case 'money': {
        const currency =
          (getPath(options.entity, `${field.field}.currency`) as string | undefined) ??
          descriptor.moneyCurrencyDefault ??
          'GBP';
        setPath(body, field.field, { amount: toMinor(raw), currency });
        break;
      }
      case 'number':
        setPath(body, field.field, Number(raw || 0));
        break;
      case 'boolean':
        setPath(body, field.field, raw === 'true');
        break;
      case 'tags':
        setPath(
          body,
          field.field,
          raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        );
        break;
      default:
        setPath(body, field.field, raw.trim());
    }
  }

  for (const field of descriptor.fields) {
    if (!field.derived) continue;
    // The payload first, then the form. A field that is immutable after
    // creation is not resent on edit, but a value derived from it still has to
    // go: a creative's `content.channel` must accompany its content or the
    // server refuses the pair, even on an edit that cannot change the channel.
    const from = getPath(body, field.derived.from) ?? form[field.derived.from];
    if (from === undefined || from === '') continue;
    setPath(
      body,
      field.field,
      field.derived.rule === 'copy' ? from : Number(from) === 0
    );
  }

  return body;
}

/** Groups that have at least one visible field, in order, with their fields. */
export function layout(
  descriptor: EntityDescriptor,
  form: FormState,
  permissions: readonly string[]
) {
  const fields = visibleFields(descriptor, form, permissions);
  return [...descriptor.groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => ({ group, fields: fields.filter((f) => f.group === group.key) }))
    .filter((g) => g.fields.length > 0);
}
