import type { EntityDescriptor } from '../types';
import { REGISTRY, PENDING } from '../registry';
import {
  LAYOUT_FORMAT_VERSION,
  type LayoutManifest,
  type ListColumn,
  type PanelDeclaration,
  type PatternDeclaration,
  type PatternId,
} from './types';
import { placementsLayout } from './placements';

export * from './types';
export { declaredScreen } from './page';

/**
 * The patterns, as data: which slots each declares. ADR-015 §3.
 *
 * Adding a pattern is a design review and then a renderer; adding a slot to one
 * is a change every screen on that pattern inherits. Neither is a manifest edit.
 */
export const PATTERNS: Record<PatternId, PatternDeclaration> = {
  'list-detail': {
    slots: ['list.toolbar', 'detail.tabs', 'detail.aside', 'detail.actions'],
    labelled: ['detail.tabs'],
  },
};

/**
 * Every panel a manifest may place, and where.
 *
 * A panel for one screen is legitimate — §1's rule is that anything one screen
 * needs is a panel in a slot, never a new pattern parameter. It says so by
 * naming the entity it understands.
 */
export const PANELS = {
  'core.entity-overview': {
    slots: ['list-detail.detail.tabs', 'list-detail.detail.aside'],
    description:
      "The record's descriptor fields, read-only, in the descriptor's groups and order. A field added to the descriptor appears here with no manifest change.",
  },
  'placements.undeliverable': {
    slots: ['list-detail.list.toolbar'],
    entities: ['Placement'],
    description:
      'Names the slots that decide and have nothing delivering what they decide (ADR-013). Absent when there are none.',
  },
} as const satisfies Record<string, PanelDeclaration>;

export type PanelId = keyof typeof PANELS;

/** Every screen declared. The key is the id a route's page renders. */
export const LAYOUTS: Record<string, LayoutManifest> = {
  [placementsLayout.id]: placementsLayout,
};

export function layoutFor(id: string): LayoutManifest {
  const found = LAYOUTS[id];
  if (!found) {
    throw new Error(
      `No layout manifest '${id}'. Screens are declared, not coded: add one to packages/ui-metadata/src/layouts.`
    );
  }
  return found;
}

const columnField = (c: ListColumn) => (typeof c === 'string' ? c : c.field);

/**
 * Everything wrong with a manifest, as sentences. Empty means it holds.
 *
 * Types catch the shape; this catches the references a type cannot — a panel
 * that does not exist, a column naming a field the descriptor lacks, a facet
 * with no closed set of values to count. ADR-015 §5.
 */
export function validateLayout(
  manifest: LayoutManifest,
  registry: { descriptors: Record<string, EntityDescriptor>; pending: Record<string, string> } = {
    descriptors: REGISTRY,
    pending: PENDING,
  }
): string[] {
  const problems: string[] = [];
  const at = `layout '${manifest.id}'`;

  if (manifest.formatVersion !== LAYOUT_FORMAT_VERSION) {
    problems.push(`${at} is format ${manifest.formatVersion}; this renderer reads ${LAYOUT_FORMAT_VERSION}`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.id)) problems.push(`${at}: id is not kebab-case`);
  if (!manifest.route.startsWith('/')) problems.push(`${at}: route '${manifest.route}' is not a path`);

  const pattern = PATTERNS[manifest.pattern];
  if (!pattern) {
    problems.push(`${at}: pattern '${manifest.pattern}' is not one of ${Object.keys(PATTERNS).join(', ')}`);
    return problems;
  }

  // Slots and occupants.
  const ids = new Set<string>();
  const { entity } = manifest.params.detail;
  for (const [slot, occupants] of Object.entries(manifest.slots)) {
    if (!pattern.slots.includes(slot)) {
      problems.push(`${at}: '${slot}' is not a slot of ${manifest.pattern}`);
      continue;
    }
    for (const o of occupants ?? []) {
      if (ids.has(o.id)) problems.push(`${at}: occupant id '${o.id}' is used twice`);
      ids.add(o.id);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.id)) problems.push(`${at}: occupant id '${o.id}' is not kebab-case`);
      const panel = (PANELS as Record<string, PanelDeclaration>)[o.panel];
      if (!panel) {
        problems.push(`${at}: '${o.id}' names panel '${o.panel}', which PANELS does not declare`);
        continue;
      }
      const slotType = `${manifest.pattern}.${slot}`;
      if (!panel.slots.includes(slotType)) {
        problems.push(`${at}: panel '${o.panel}' cannot fill ${slotType}; it fills ${panel.slots.join(', ')}`);
      }
      if (panel.entities && !panel.entities.includes(entity)) {
        problems.push(`${at}: panel '${o.panel}' understands ${panel.entities.join(', ')}, not ${entity}`);
      }
      if (pattern.labelled.includes(slot) && !o.label) {
        problems.push(`${at}: '${o.id}' is in ${slot}, which names its occupants, and has no label`);
      }
    }
  }
  if ((manifest.slots['detail.tabs'] ?? []).length === 0) {
    problems.push(`${at}: detail.tabs is empty, so the detail pane would show nothing`);
  }

  // The entity, and every field the manifest names on it.
  const descriptor = registry.descriptors[entity];
  if (!descriptor) {
    if (!(entity in registry.pending)) {
      problems.push(`${at}: detail entity '${entity}' has no descriptor and is not PENDING`);
    }
    return problems;
  }
  const described = new Map(descriptor.fields.map((f) => [f.field, f]));
  const unmanaged = new Set(descriptor.unmanaged.map((u) => u.field));
  const onRecord = (field: string) => described.has(field) || unmanaged.has(field);
  const { list, detail } = manifest.params;

  const named: [string, string | undefined][] = [
    ['list.title', list.title],
    ['list.subtitle', list.subtitle],
    ['list.sort', list.sort?.field],
    ['detail.description', detail.description],
    ['detail.footer.version', detail.footer.version],
    ['detail.footer.state', detail.footer.state],
    ['detail.footer.editedAt', detail.footer.editedAt],
    ['detail.footer.editedBy', detail.footer.editedBy],
  ];
  for (const [where, field] of named) {
    if (field !== undefined && !onRecord(field)) {
      problems.push(`${at}: ${where} names '${field}', which ${entity} does not have`);
    }
  }
  for (const column of list.columns) {
    const field = columnField(column);
    // A labelled column may show what the source derives; an unlabelled one is
    // labelled by the descriptor, so the descriptor has to have it.
    if (typeof column === 'string' || !column.label) {
      if (!described.has(field)) {
        problems.push(`${at}: column '${field}' has no label and ${entity}'s descriptor has no such field`);
      }
    }
  }
  for (const facet of list.facets) {
    const field = described.get(facet);
    const closed =
      field && (field.type === 'boolean' || (field.options !== undefined && 'static' in field.options));
    if (!closed) {
      problems.push(`${at}: facet '${facet}' is not a ${entity} field with a closed set of values to count`);
    }
  }
  if (manifest.params.detailRoute !== null && !/\[[^\]]+\]/.test(manifest.params.detailRoute)) {
    problems.push(`${at}: detailRoute '${manifest.params.detailRoute}' is not a dynamic route`);
  }
  return problems;
}

export { placementsLayout };
