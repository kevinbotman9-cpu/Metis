'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Option } from '@metis/ui-metadata';
import { apiClient } from '@/lib/api-client';

/**
 * Named option sources, resolved once for the whole registry.
 *
 * A descriptor names a source; this maps the name to data. It is the only
 * place a descriptor's vocabulary meets a query, and it is deliberately a flat
 * table rather than a per-entity hook. The form reads it to offer choices, and
 * a screen's overview reads it to name what was chosen.
 */
export function useOptionSources(enabled: boolean): Record<string, readonly Option[]> {
  const { data: taxonomy } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    enabled,
  });

  const { data: placements } = useQuery({
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
    enabled,
  });

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
    enabled,
  });

  return useMemo(
    () => ({
      'taxonomy.objectives': (taxonomy?.objectives ?? []).map((o) => ({
        value: o.id,
        label: o.name,
      })),
      'taxonomy.categories': (taxonomy?.categories ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        objectiveId: c.objectiveId,
      })),
      // `channel` and `type` are carried so a descriptor can filter slots by
      // the channel chosen and suggest the shape the slot declares.
      placements: (placements?.placements ?? [])
        .filter((p) => p.decidable)
        .map((p) => ({ value: p.key, label: p.name, channel: p.channel, type: p.type })),
      // Which flow answers a slot. Active only: pointing a live placement at a
      // draft flow would put an unpublished decision in front of a customer.
      flows: (artifacts?.artifacts ?? [])
        .filter((a) => a.status === 'active')
        .map((a) => ({ value: a.id, label: a.name, href: `/decision-flows/${a.id}` })),
    }),
    [taxonomy, placements, artifacts]
  );
}
