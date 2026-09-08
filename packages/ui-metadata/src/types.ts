/**
 * Form descriptors: what a screen declares instead of what it codes.
 *
 * A descriptor is data. It holds no React, no imports from the console, and no
 * behaviour — which is what lets the same file drive the renderer, the
 * conformance diff against the OpenAPI schema, and the tests, without any of
 * them agreeing on anything but this shape.
 *
 * The rule this exists to make true is CLAUDE.md Absolute Rule 8: adding a
 * field to an entity requires zero changes under `apps/console/app/`. Every
 * capability below is here because a hand-built form in this repo had it —
 * conditional visibility from the objective/category pair, minor-unit money,
 * a key that cannot change after creation, a slug suggested from the name.
 * A descriptor that could not express those would just move the hand-building.
 */

export type FieldType =
  /** One line. */
  | 'text'
  /** Many lines. */
  | 'textarea'
  /** A number, entered and stored as one. */
  | 'number'
  /** Major units in, minor units stored. See `Money` in the spec. */
  | 'money'
  /** One of a closed set, static or resolved from a named source. */
  | 'select'
  /** A free list, entered comma-separated. */
  | 'tags'
  | 'boolean'
  | 'date';

/**
 * Constraints, declared once and rendered as native HTML attributes.
 *
 * Native rather than a bespoke validation pass so the browser's own messages,
 * `:invalid` styling and screen-reader announcements all work. The server
 * remains the authority: its `problems[]` land on the same fields.
 */
export interface Validation {
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  /** Serialisable, so a descriptor stays data. Compiled by the renderer. */
  pattern?: string;
  /** Shown when a constraint refuses. */
  message?: string;
}

/** A predicate on another field in the same form. */
export interface Condition {
  field: string;
  /** True when that field holds any non-empty value. */
  isSet?: boolean;
  equals?: string | number | boolean;
  oneOf?: readonly (string | number | boolean)[];
}

export interface Option {
  value: string;
  label: string;
  /** Extra properties a filter can match against. */
  [key: string]: string | undefined;
}

/**
 * Where a select's options come from.
 *
 * A named source rather than a query, because a descriptor cannot import a
 * data layer without stopping being data. The host resolves the name; see
 * `useOptionSources` in the console.
 */
export interface OptionSource {
  source: string;
  /** Keep options whose `optionField` equals the current value of `matches`. */
  filterBy?: { optionField: string; matches: string };
}

export interface FieldDescriptor {
  /**
   * Dot path into the entity. `financials.price` addresses a nested object;
   * the first segment must be a property of the entity's OpenAPI schema, which
   * is what the drift check compares.
   */
  field: string;
  type: FieldType;
  label: string;
  help?: string;
  placeholder?: string;
  /** Which group renders it. Must be a key in the descriptor's `groups`. */
  group: string;
  /** Ascending within the group. Gaps are fine and leave room to insert. */
  order: number;
  /** Permission required to see this field at all. Absent means anyone. */
  permission?: string;
  validation?: Validation;
  /** Rendered only when this holds. */
  visibleWhen?: Condition;
  /** Rendered, but not editable, unless this holds. */
  enabledWhen?: Condition;
  options?: { static: readonly Option[] } | OptionSource;
  /**
   * Cannot be changed once the entity exists.
   *
   * An offer's key appears in every decision record ever written about it, so
   * changing one after the fact orphans history.
   */
  immutableAfterCreate?: boolean;
  /** Fill from another field until the person edits this one. */
  suggestFrom?: { field: string; transform: 'slug' };
  /**
   * Not shown, and computed on save from another field.
   *
   * `isZero` is the only rule, and exists for `oneOff`, which the domain holds
   * but no one should be asked twice for.
   */
  derived?: { from: string; rule: 'isZero' };
  /** Columns to span inside a multi-column group. */
  span?: 1 | 2 | 3;
}

export interface GroupDescriptor {
  key: string;
  /** Absent renders the group unlabelled — for the leading block of fields. */
  label?: string;
  order: number;
  columns: 1 | 2 | 3;
}

/**
 * A schema property the form deliberately does not manage, and why.
 *
 * Required rather than optional: the drift check demands every schema property
 * be accounted for, and "accounted for" has to include "decided against".
 * Without this the check could only be satisfied by putting every server-owned
 * timestamp in the form, or by loosening the check until it stopped biting.
 */
export interface UnmanagedField {
  field: string;
  reason: string;
}

export interface EntityDescriptor {
  /** The OpenAPI schema name. The drift check joins on this. */
  entity: string;
  /** Plural, lower case, for prose the renderer composes. */
  noun: { singular: string; plural: string };
  groups: readonly GroupDescriptor[];
  fields: readonly FieldDescriptor[];
  unmanaged: readonly UnmanagedField[];
  /** Currency for every `money` field, when the entity has none yet. */
  moneyCurrencyDefault?: string;
  create: { title: string; description: string; submitLabel: string };
  edit: { description: string; submitLabel: string };
}
