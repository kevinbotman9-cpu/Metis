import type { ComponentType, ReactNode } from 'react';
import type { EntityDescriptor, ListDetailManifest, Occupant, Option } from '@metis/ui-metadata';
import type { Row } from '@/lib/layouts/sources';

/**
 * What a panel is given. It never fetches: every source a manifest names is
 * resolved by the host before a panel renders (ADR-015 §2), which is also what
 * lets a story render any panel from fixtures with no network and no router.
 */

export interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
}

/** A named source, resolved. */
export interface SourceState {
  rows: Row[];
  status: 'loading' | 'error' | 'ready';
}

export interface PanelContext {
  /** Every source the manifest names, by name. */
  sources: Readonly<Record<string, SourceState>>;
  /** The descriptors' option sources, so a chosen value can be named. */
  optionSources: Readonly<Record<string, readonly Option[]>>;
  permissions: readonly string[];
  /** Whether the session may create or edit this entity. */
  canEdit: (entity: string) => boolean;
  /**
   * Opens the entity's descriptor form. The host owns the dialog, and fills in
   * the entity's own defaults given the records the new one lands beside.
   */
  create: (entity: string, seed?: { defaults?: Record<string, unknown>; siblings?: readonly Row[] }) => void;
  edit: (entity: string, record: Row) => void;
  /** next/link in the console; an anchor in Storybook, which has no router. */
  Link: ComponentType<LinkProps>;
}

export interface PanelProps {
  occupant: Occupant;
  manifest: ListDetailManifest;
  descriptor: EntityDescriptor;
  /** Every row of the list's source — what a list-slot panel reads. */
  rows: readonly Row[];
  /** The open record — what a detail-slot panel reads. Null in a list slot. */
  record: Row | null;
  /** The open record's identity: what a record filed under it points back to. */
  recordId: string | null;
  context: PanelContext;
}

export type PanelComponent = ComponentType<PanelProps>;
