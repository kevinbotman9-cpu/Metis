import type { EntityDescriptor } from '../types';
import { offerDescriptor } from './offer';
import { creativeDescriptor } from './creative';

/**
 * The metadata registry.
 *
 * Every entity a user can create or edit has an entry here, and the renderer
 * reads nothing else. Adding an entity is adding a file and a line; adding a
 * field to an entity is editing one array, and requires no change under
 * `apps/console/app/`.
 *
 * `packages/ui-metadata/tests/descriptors.test.ts` diffs each descriptor
 * against its OpenAPI schema in both directions.
 */
export const REGISTRY: Record<string, EntityDescriptor> = {
  Offer: offerDescriptor,
  Creative: creativeDescriptor,
};

/**
 * Every entity the product owner has confirmed a user can create or edit.
 *
 * Moved here on 2026-09-08 from `scripts/conformance.mjs`, which held it for a
 * check that could never run. It is the backlog for this package: an entity in
 * this list with no entry in `REGISTRY` has a hand-built form or no form at
 * all, and `PENDING` below is where that is admitted rather than left to be
 * inferred from a short registry.
 *
 * Names follow the §3 catalogue in CLAUDE.md and, where one exists, the schema
 * name in the OpenAPI spec — the descriptors are diffed against that spec, so a
 * name it does not use could never match. `ArbitrationConfig` keeps
 * *arbitration*, which §3.2 retains deliberately.
 */
export const USER_EDITABLE_ENTITIES = [
  'Offer',
  'Creative',
  'Objective',
  'Category',
  'DecisionFlow',
  'TargetingPolicy',
  'FrequencyPolicy',
  'ArbitrationConfig',
  'Audience',
  'Model',
  'Channel',
  'Theme',
  'Layout',
  'Persona',
] as const;

/**
 * Entities still waiting for a descriptor, with what stands in for one today.
 *
 * A reason is required, so "not done yet" is a recorded state rather than a
 * silence. `tests/descriptors.test.ts` fails if an entity is in neither this
 * list nor `REGISTRY`, and fails if one is in both.
 */
export const PENDING: Record<string, string> = {
  Objective: 'No authoring surface at all; the taxonomy is fixture-authored.',
  Category: 'No authoring surface at all; the taxonomy is fixture-authored.',
  DecisionFlow: 'Authored on the canvas, not in a form. Needs a descriptor for its metadata only.',
  TargetingPolicy: 'Hand-built in components/policy-form-dialog.tsx.',
  FrequencyPolicy: 'Read-only screen today; no write endpoint is served.',
  ArbitrationConfig: 'Edited as weights on /arbitration, not as an entity form.',
  Audience: 'No schema in the spec and no screen. Declared in the console spec only.',
  Model: 'Gate 2. No schema, no screen.',
  Channel: 'Supplied by a channel package rather than authored in the console.',
  Theme: 'Token sets are files today; the Themes screen is in the console spec, not built.',
  Layout: 'Layout manifests do not exist yet — see UX_CONTRACT.md §2.',
  Persona: 'The persona manifest is code (apps/console/lib/nav), not a user-editable entity yet.',
};

export function descriptorFor(entity: string): EntityDescriptor {
  const found = REGISTRY[entity];
  if (!found) {
    throw new Error(
      `No form descriptor for '${entity}'. Screens are declared, not coded: add one to packages/ui-metadata/src/registry.`
    );
  }
  return found;
}

export { offerDescriptor, creativeDescriptor };
