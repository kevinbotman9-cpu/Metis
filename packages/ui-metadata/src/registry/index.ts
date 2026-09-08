import type { EntityDescriptor } from '../types';
import { offerDescriptor } from './offer';

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

export { offerDescriptor };
