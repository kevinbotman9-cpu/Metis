export { DecisionLedger, subjectHash } from './ledger';
export type { LedgerStore, DecisionQuery } from './ledger';
export { InMemoryLedgerStore } from './memory-store';
export { PostgresLedgerStore } from './postgres-store';
export type { LockClient, Queryable } from './postgres-store';
export {
  createLedgerStore,
  dataClassOf,
  MIGRATIONS_DIR,
  runMigration,
  SUBJECT_PROTECTION,
  effectiveDataClass,
  type DataClass,
} from './create-store';
export type { LedgerHandle, CreateLedgerOptions } from './create-store';
export { LedgerError, CONTACT_STATES, CONTACT_WINDOW_MS } from './types';
export { capsApply, readContacts } from './contacts';
export type {
  ContactCounts,
  ContactPeriod,
  ContactQuery,
  DeliveryAttempt,
  DeliveryState,
  LedgerEntry,
  OutcomeEvent,
  OutcomeType,
} from './types';

export { buildPerformance, OUTCOME_TYPES, suppressionStageOf } from './performance';
export type {
  PerformanceReport,
  PerformanceRow,
  ChannelStages,
  LoopDay,
  SuppressionReason,
} from './performance';

export { buildPolicyFunnel, funnelDecisionOf, FUNNEL_STAGES } from './policy-funnel';
export type {
  PolicyFunnelReport,
  FunnelStage,
  FunnelStageId,
  FunnelRule,
  FunnelDecision,
  FunnelRemoval,
} from './policy-funnel';

export { buildFlowVolume, flowVolumeDecisionOf } from './flow-volume';
export type {
  FlowVolumeReport,
  FlowVolumeNode,
  FlowVolumeEdge,
  FlowVolumeDecision,
  FlowVolumeGraph,
} from './flow-volume';
