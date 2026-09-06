import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXPORTED_ENTITIES } from './entities';
import { PortabilityError, type TenantBundle } from './types';

/**
 * A bundle on disk: one JSON file per entity, plus the manifest.
 *
 * Not a single blob and not an archive. §9 wants an export a customer can act
 * on "without professional-services intervention", and the difference between
 * a directory of readable JSON and a proprietary container is most of what
 * that phrase means. Someone can open `decision_records.json` in an editor,
 * diff two exports, or load one into a warehouse without this code.
 *
 * Two spaces of indentation for the same reason: a bundle that only a machine
 * can read is a weaker promise than one a person can.
 */

const MANIFEST = 'manifest.json';

export function writeBundle(bundle: TenantBundle, dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];

  for (const entity of EXPORTED_ENTITIES) {
    const path = resolve(dir, `${entity}.json`);
    writeFileSync(path, `${JSON.stringify(bundle[entity], null, 2)}\n`, 'utf8');
    written.push(path);
  }

  // Manifest last: a directory holding a manifest but not the files it
  // describes would look complete to anything checking for one.
  const manifestPath = resolve(dir, MANIFEST);
  writeFileSync(manifestPath, `${JSON.stringify(bundle.manifest, null, 2)}\n`, 'utf8');
  written.push(manifestPath);

  return written;
}

export function readBundle(dir: string): TenantBundle {
  const manifestPath = resolve(dir, MANIFEST);
  if (!existsSync(manifestPath)) {
    throw new PortabilityError(
      'UNREADABLE_BUNDLE',
      `No ${MANIFEST} in ${dir}. A bundle without its manifest cannot be ` +
        'checked, and an unchecked bundle is not worth importing.'
    );
  }

  const read = (entity: string): unknown[] => {
    const path = resolve(dir, `${entity}.json`);
    if (!existsSync(path)) {
      throw new PortabilityError(
        'UNREADABLE_BUNDLE',
        `${MANIFEST} is present but ${entity}.json is missing from ${dir}. ` +
          'Refusing rather than importing a tenant with a hole in it.'
      );
    }
    return JSON.parse(readFileSync(path, 'utf8'));
  };

  // Assembled field by field rather than by looping over EXPORTED_ENTITIES
  // into an index signature. The loop was shorter and needed a cast that
  // TypeScript was right to object to: it would have kept compiling if a field
  // were renamed, and the mismatch would have surfaced as a missing table on
  // somebody else's instance.
  return {
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    catalogue_objectives: read('catalogue_objectives') as TenantBundle['catalogue_objectives'],
    catalogue_categories: read('catalogue_categories') as TenantBundle['catalogue_categories'],
    catalogue_offers: read('catalogue_offers') as TenantBundle['catalogue_offers'],
    catalogue_creatives: read('catalogue_creatives') as TenantBundle['catalogue_creatives'],
    catalogue_targeting_policies: read(
      'catalogue_targeting_policies'
    ) as TenantBundle['catalogue_targeting_policies'],
    catalogue_frequency_policies: read(
      'catalogue_frequency_policies'
    ) as TenantBundle['catalogue_frequency_policies'],
    catalogue_boosts: read('catalogue_boosts') as TenantBundle['catalogue_boosts'],
    catalogue_arbitration: read('catalogue_arbitration') as TenantBundle['catalogue_arbitration'],
    catalogue_events: read('catalogue_events') as TenantBundle['catalogue_events'],
    registry_versions: read('registry_versions') as TenantBundle['registry_versions'],
    registry_environments: read('registry_environments') as TenantBundle['registry_environments'],
    registry_events: read('registry_events') as TenantBundle['registry_events'],
    decision_records: read('decision_records') as TenantBundle['decision_records'],
    outcome_events: read('outcome_events') as TenantBundle['outcome_events'],
  };
}
