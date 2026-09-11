import type { PanelId } from '@metis/ui-metadata';
import type { PanelComponent } from '../panel';
import { EntityOverview } from './entity-overview';
import { PlacementsUndeliverable } from './placements-undeliverable';

/**
 * Each panel `PANELS` declares, and the component that draws it.
 *
 * Typed over the declared ids, so a declaration with no component, or a
 * component nobody declared, is a compile error rather than a blank slot.
 */
export const PANEL_COMPONENTS: { [K in PanelId]: PanelComponent } = {
  'core.entity-overview': EntityOverview,
  'placements.undeliverable': PlacementsUndeliverable,
};

export function panelFor(id: string): PanelComponent {
  const found = (PANEL_COMPONENTS as Record<string, PanelComponent>)[id];
  if (!found) throw new Error(`Panel '${id}' is placed by a manifest and has no component.`);
  return found;
}
