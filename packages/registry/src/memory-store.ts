import type { RegistryStore } from './registry';
import type { ModelVersion } from '@metis/core/domain';
import type {
  Environment,
  EnvironmentState,
  FlowDraft,
  PublishedVersion,
  RegistryEvent,
  ShadowComparisonRecord,
} from './types';

/**
 * In-memory storage.
 *
 * Genuinely all it is: a process restart loses everything. It exists so the
 * registry's rules can be written and tested now, behind an interface a
 * PostgreSQL implementation can satisfy later without any of those rules
 * changing. Durable storage is registered in docs/gaps.md.
 *
 * The one property worth being careful about even here: published versions and
 * events are deep-frozen on the way in. A caller holding a reference to a
 * published artifact must not be able to edit registry state through it, and
 * "immutable" that depends on nobody trying is not immutable.
 */
export class InMemoryRegistryStore implements RegistryStore {
  private versions = new Map<string, PublishedVersion>();
  private environments = new Map<string, EnvironmentState>();
  private events: RegistryEvent[] = [];
  private seq = 0;
  private drafts = new Map<string, FlowDraft>();
  /** In the order they were appended, which is the order they happened. */
  private shadowComparisonLog: ShadowComparisonRecord[] = [];
  private modelVersions = new Map<string, ModelVersion>();

  private draftKey = (t: string, n: string) => `${t}\u0000${n}`;
  private versionKey = (t: string, n: string, v: string) => `${t}\u0000${n}\u0000${v}`;
  private envKey = (t: string, n: string, e: string) => `${t}\u0000${n}\u0000${e}`;

  async getVersion(
    tenantId: string,
    name: string,
    version: string
  ): Promise<PublishedVersion | undefined> {
    return this.versions.get(this.versionKey(tenantId, name, version));
  }

  async listVersions(tenantId: string, name: string): Promise<PublishedVersion[]> {
    return [...this.versions.values()].filter(
      (v) => v.tenantId === tenantId && v.flowName === name
    );
  }

  async putVersion(v: PublishedVersion): Promise<void> {
    const key = this.versionKey(v.tenantId, v.flowName, v.version);
    if (this.versions.has(key)) {
      // The registry checks this before calling, so reaching here means a
      // caller went around it. Immutability is not a convention.
      throw new Error(`Version already published: ${v.flowName} ${v.version}`);
    }
    this.versions.set(key, deepFreeze(structuredClone(v)));
  }

  async getEnvironment(
    tenantId: string,
    name: string,
    env: Environment
  ): Promise<EnvironmentState | undefined> {
    return this.environments.get(this.envKey(tenantId, name, env));
  }

  async putEnvironment(tenantId: string, name: string, state: EnvironmentState): Promise<void> {
    // Environment pointers are the one mutable thing here — that is what an
    // environment is. The version it points at stays frozen.
    this.environments.set(this.envKey(tenantId, name, state.environment), { ...state });
  }

  async listEnvironments(tenantId: string, name: string): Promise<EnvironmentState[]> {
    return [...this.environments.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}\u0000${name}\u0000`))
      .map(([, state]) => state);
  }

  async appendEvent(event: Omit<RegistryEvent, 'seq'>): Promise<RegistryEvent> {
    const stored = deepFreeze({ ...event, seq: ++this.seq }) as RegistryEvent;
    this.events.push(stored);
    return stored;
  }

  async listEvents(filter?: {
    tenantId?: string;
    flowName?: string;
    limit?: number;
  }): Promise<RegistryEvent[]> {
    let out = this.events;
    if (filter?.tenantId) out = out.filter((e) => e.tenantId === filter.tenantId);
    if (filter?.flowName) out = out.filter((e) => e.flowName === filter.flowName);
    // Newest first, by sequence rather than timestamp: two events can share a
    // timestamp, and the sequence is what makes the order a fact.
    const sorted = [...out].sort((a, b) => b.seq - a.seq);
    return filter?.limit ? sorted.slice(0, filter.limit) : sorted;
  }

  async listFlows(tenantId: string): Promise<string[]> {
    return [
      ...new Set(
        [...this.versions.values()].filter((v) => v.tenantId === tenantId).map((v) => v.flowName)
      ),
    ];
  }

  /**
   * Drafts are copied in and out, not frozen. A draft is meant to change — but
   * only by being saved again, never by a caller editing an object it read,
   * which PostgreSQL could not honour and memory therefore must not either.
   */
  async getDraft(tenantId: string, name: string): Promise<FlowDraft | undefined> {
    const d = this.drafts.get(this.draftKey(tenantId, name));
    return d ? structuredClone(d) : undefined;
  }

  async putDraft(draft: FlowDraft): Promise<void> {
    this.drafts.set(this.draftKey(draft.tenantId, draft.flowName), structuredClone(draft));
  }

  async listDrafts(tenantId: string): Promise<FlowDraft[]> {
    return [...this.drafts.values()].filter((d) => d.tenantId === tenantId).map((d) => structuredClone(d));
  }

  async appendShadowComparison(record: ShadowComparisonRecord): Promise<void> {
    this.shadowComparisonLog.push(deepFreeze(structuredClone(record)));
  }

  async listShadowComparisons(filter: {
    tenantId: string;
    flowName: string;
    environment?: Environment;
    activeVersion?: string;
    shadowVersion?: string;
  }): Promise<ShadowComparisonRecord[]> {
    return this.shadowComparisonLog
      .filter(
        (c) =>
          c.tenantId === filter.tenantId &&
          c.flowName === filter.flowName &&
          (filter.environment === undefined || c.environment === filter.environment) &&
          (filter.activeVersion === undefined || c.activeVersion === filter.activeVersion) &&
          (filter.shadowVersion === undefined || c.shadowVersion === filter.shadowVersion)
      )
      .map((c) => structuredClone(c));
  }

  async getModelVersion(tenantId: string, modelId: string, version: string): Promise<ModelVersion | undefined> {
    return this.modelVersions.get(this.versionKey(tenantId, modelId, version));
  }

  async listModelVersions(tenantId: string, modelId?: string): Promise<ModelVersion[]> {
    return [...this.modelVersions.values()].filter(
      (m) => m.tenantId === tenantId && (modelId === undefined || m.id === modelId)
    );
  }

  async putModelVersion(v: ModelVersion): Promise<void> {
    const key = this.versionKey(v.tenantId, v.id, v.version);
    if (this.modelVersions.has(key)) {
      // As for a flow version: reaching here means a caller went around the registry.
      throw new Error(`Model version already published: ${v.id} ${v.version}`);
    }
    this.modelVersions.set(key, deepFreeze(structuredClone(v)));
  }

  /** Test-only: restore an empty registry. */
  reset(): void {
    this.shadowComparisonLog = [];
    this.versions.clear();
    this.environments.clear();
    this.events = [];
    this.seq = 0;
    this.drafts.clear();
    this.modelVersions.clear();
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}
