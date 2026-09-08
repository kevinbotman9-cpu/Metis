'use client';

import { EntityFormDialog } from '@/components/entity-form-dialog';
import { apiClient, type CreativeDto } from '@/lib/api-client';

/**
 * Authoring the content an offer is delivered with.
 *
 * This was a 399-line hand-built form with its own table of per-channel field
 * specs. It is now a descriptor — `packages/ui-metadata/src/registry/creative.ts`
 * — rendered generically, and what is left here is the one thing that is
 * genuinely per-entity: which generated client method writes it, and the
 * `offerId` that method needs.
 *
 * The per-channel shapes moved wholesale into `visibleWhen`. The old form had
 * to remember to send "only the fields this channel declares"; `toPayload`
 * sends only visible fields, so that now falls out of the declaration rather
 * than being maintained.
 */

export interface CreativeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string;
  /** Absent to add one. Present to edit that one. */
  creative?: CreativeDto;
}

export function CreativeFormDialog({
  open,
  onOpenChange,
  offerId,
  creative,
}: CreativeFormDialogProps) {
  return (
    <EntityFormDialog<CreativeDto>
      open={open}
      onOpenChange={onOpenChange}
      entity="Creative"
      record={creative ?? null}
      save={(body, record) =>
        record
          ? apiClient.updateCreative(offerId, record.id, body as Partial<CreativeDto>)
          : apiClient.createCreative(offerId, body as Partial<CreativeDto>)
      }
      // The content library reads across offers under its own key, so editing
      // from there left the row showing the line it used to say.
      invalidate={[['offer', offerId], ['offers'], ['creatives']]}
    />
  );
}
