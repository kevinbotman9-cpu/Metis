'use client';

import { EntityFormDialog } from '@/components/entity-form-dialog';
import { apiClient, type OfferDto } from '@/lib/api-client';

/**
 * Authoring an offer from the console.
 *
 * This was a 280-line hand-built form. It is now a descriptor —
 * `packages/ui-metadata/src/registry/offer.ts` — rendered generically, and
 * what is left here is the one thing that is genuinely per-entity: which
 * generated client method writes it.
 *
 * Adding a field to an offer means editing that descriptor and the OpenAPI
 * spec. It means no change here, and no change under `apps/console/app/`.
 */

export interface OfferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent for a new offer. Present to edit that one. */
  offer?: OfferDto;
  onSaved?: (offer: OfferDto) => void;
}

export function OfferFormDialog({ open, onOpenChange, offer, onSaved }: OfferFormDialogProps) {
  return (
    <EntityFormDialog<OfferDto>
      open={open}
      onOpenChange={onOpenChange}
      entity="Offer"
      record={offer ?? null}
      save={(body, record) =>
        record
          ? apiClient.updateOffer(record.id, body as Partial<OfferDto>)
          : apiClient.createOffer(body as Partial<OfferDto>)
      }
      invalidate={[['offers'], ['offer'], ['taxonomy']]}
      onSaved={onSaved}
    />
  );
}
