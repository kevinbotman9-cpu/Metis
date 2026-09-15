import { resolveAutonomy, type AutonomySetting } from '@metis/core/domain';
import type { AutonomySettingDto, ChangeSetDto, TaxonomyDto } from '@/lib/api-client';

/**
 * The bias gate a change set's simulation is read against.
 *
 * A simulation carries a bias ratio and whether it passed, not the threshold it
 * was held to, so a failing 1.38 read as arbitrary. The threshold lives on the
 * autonomy setting that resolves for the change set's scope, most specific
 * first — offer, category, objective, tenant — and the resolution here is the
 * domain's own `resolveAutonomy` rather than another copy of the walk.
 *
 * A scope naming an offer or category the catalogue does not hold cannot be
 * placed in the hierarchy, so it resolves to nothing rather than quietly to the
 * tenant default: a threshold shown beside a ratio has to be the one that
 * applies.
 */
export function biasGateFor(
  scope: ChangeSetDto['targetScope'],
  settings: readonly AutonomySettingDto[],
  taxonomy: Pick<TaxonomyDto, 'categories' | 'offers'>
): number | null {
  const place = (): { offerId: string; categoryId: string; objectiveId: string } | null => {
    switch (scope.level) {
      case 'tenant':
        return { offerId: '', categoryId: '', objectiveId: '' };
      case 'objective':
        return scope.targetId ? { offerId: '', categoryId: '', objectiveId: scope.targetId } : null;
      case 'category': {
        const category = taxonomy.categories.find((c) => c.id === scope.targetId);
        return category ? { offerId: '', categoryId: category.id, objectiveId: category.objectiveId } : null;
      }
      case 'offer': {
        const offer = taxonomy.offers.find((o) => o.id === scope.targetId);
        return offer
          ? { offerId: offer.id, categoryId: offer.categoryId, objectiveId: offer.objectiveId }
          : null;
      }
      default:
        return null;
    }
  };

  const ctx = place();
  if (!ctx) return null;
  // The DTO and the domain type describe the same record; the generated
  // client widens the change-type enum to strings, which resolution never reads.
  const setting = resolveAutonomy(settings as unknown as AutonomySetting[], ctx);
  return setting ? setting.guardrails.biasGateThreshold : null;
}
