'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';
import type {
  PolicySourceDto,
  SourceCallDto,
  TargetingPolicyDto,
  TraceDto,
} from '@/lib/api-client';
import { CODE_MEANING, type DenialGroup, type TraceStage } from '@/components/trace-cascade';

/**
 * The evidence pane: what is behind whatever is selected.
 *
 * The design north star is the compliance officer and the trace is the hero, so
 * this pane exists to answer the question a regulator actually asks — not "what
 * happened" but "on what basis, and can you show me". Every claim here names
 * its source or says why it has none.
 *
 * **Two of the absences this pane was drawing are now answers.** Both were
 * drawn rather than omitted, which is why they were easy to close:
 *
 * - *The pack that supplied the rule.* The compiler resolves each policy the
 *   flow references to the pack that supplied it and pins the result in the
 *   artifact, so a refusal names "UK Consumer Duty 1.4.0" rather than a bare
 *   policy id. G-055. A rule no pack claims is still an absence, and a
 *   truthful one: the tenant authored it.
 * - *When the value was computed.* A `SourceCall` carries `fetchedAt`, and
 *   `observedAt` for the value itself — the same thing for a live read, and
 *   the age of the entry for a cache hit. G-056. A cache that cannot say when
 *   it stored a value leaves `observedAt` absent, which is drawn as unknown
 *   rather than filled in with the read time.
 *
 * **One remains, and it is a modelling question rather than a rendering one:**
 * there is no customer-facing refusal text anywhere in the platform. Creatives
 * say what an offer *is*; nothing says what a customer was told when one was
 * withheld. A regulator asking "what were they told" has no answer today.
 * G-057.
 */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-2">
      <dt className="text-label text-content-subtle">{label}</dt>
      <dd className="mt-0.5 text-label text-content">{children}</dd>
    </div>
  );
}

/** An absence, stated with the reason. Never a blank and never a zero. */
function Absent({ reason }: { reason: React.ReactNode }) {
  return <span className="text-content-muted">— {reason}</span>;
}

export interface TraceEvidenceProps {
  trace: TraceDto;
  stage: TraceStage | null;
  group: DenialGroup | null;
  policies: TargetingPolicyDto[];
  packageVersions: Record<string, string> | null;
  /**
   * Which pack supplied each rule, from the artifact. Null while the artifact
   * query is in flight; an empty map when the tenant has no packs installed.
   * The two are different sentences and the pane says which it is.
   */
  policySources: Record<string, PolicySourceDto> | null;
}

/** When a value was computed, in the words the record can support. */
function whenComputed(call: SourceCallDto): React.ReactNode {
  if (!call.observedAt) {
    return (
      <Absent reason="this cache does not record when it stored the value (G-056)" />
    );
  }
  const observed = new Date(call.observedAt);
  const fetched = new Date(call.fetchedAt);
  const ageSeconds = Math.max(0, Math.round((fetched.getTime() - observed.getTime()) / 1000));
  return (
    <>
      <span className="tnum">{observed.toISOString().replace('T', ' ').slice(0, 19)}Z</span>
      <span className="text-content-muted">
        {' '}
        · {call.cacheHit ? `cached, ${ageSeconds}s older than this decision` : 'read live'}
      </span>
    </>
  );
}

export function TraceEvidence({
  trace,
  stage,
  group,
  policies,
  packageVersions,
  policySources,
}: TraceEvidenceProps) {
  const policy = group?.ruleId ? policies.find((p) => p.id === group.ruleId) : undefined;

  // Which connector supplied the field this rule read, where the trace bound
  // one. `sourceBindings` maps field -> connector; the policy names the field.
  const fields = (policy?.conditions ?? []).map((c) => c.field).filter(Boolean);
  const bindings = (trace.sourceBindings ?? []).filter((b) => fields.includes(b.field));
  const calls = trace.sourceCalls ?? [];
  const pack = group?.ruleId ? policySources?.[group.ruleId] : undefined;
  // The calls behind the fields this rule read, deduplicated by connector.
  const readCalls = [...new Set(bindings.map((b) => b.connectorId))]
    .map((id) => calls.find((c) => c.connectorId === id))
    .filter((c): c is SourceCallDto => Boolean(c));

  if (!stage) {
    return (
      <>
        <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
          The decision
        </h2>
        <p className="mt-1 text-body font-semibold text-content">
          {trace.winner ? trace.winner : 'No offer'}
        </p>
        <dl className="mt-2 flex flex-col">
          <Row label="Customer">
            <span className="font-mono">{trace.customerId}</span>
          </Row>
          {/* Not the chain hash: the Metadata card below already carries it,
              and the hero screen showing the same evidence twice invites the
              reader to wonder whether they are the same hash. */}
          {/* The decision's inputs, dated. Here rather than only under a rule
              because the times are a property of the values this decision used,
              and because a rule's own fields resolve to a connector far less
              often than they should — policy conditions name dotted paths
              (customer.bill_to_income_ratio) and connectors provide flat
              fields (monthlySpend), so the two never meet. G-065. */}
          <Row label="Values fetched">
            {calls.length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {calls.map((call) => (
                  <li key={call.connectorId}>
                    <span className="font-mono text-[0.6875rem]">{call.connectorId}</span>{' '}
                    {whenComputed(call)}
                  </li>
                ))}
              </ul>
            ) : (
              <Absent reason="this decision recorded no connector calls" />
            )}
          </Row>
          <Row label="Compiled against">
            {packageVersions && Object.keys(packageVersions).length > 0 ? (
              <ul className="flex flex-col gap-0.5">
                {Object.entries(packageVersions).map(([name, version]) => (
                  <li key={name} className="font-mono text-[0.6875rem]">
                    {name}@{version}
                  </li>
                ))}
              </ul>
            ) : (
              <Absent reason="the artifact records no package versions" />
            )}
          </Row>
        </dl>
        <p className="mt-3 text-label leading-relaxed text-content-subtle">
          Select a stage to see what it removed, then a rule to see the evidence behind it.
        </p>
      </>
    );
  }

  return (
    <>
      <h2 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
        {group ? (group.ruleId ?? group.codes[0]) : stage.label}
      </h2>

      {group ? (
        <>
          <p className="mt-1 text-body font-semibold text-content">
            {policy?.name ?? (group.ruleId ? 'Rule not in the catalogue' : 'No rule to name')}
          </p>

          <dl className="mt-2 flex flex-col">
            <Row label="Reason code">
              <div className="flex flex-wrap items-center gap-1.5">
                {group.codes.map((c) => (
                  <Badge key={c} tone={c === 'NOT_RANKED' ? 'neutral' : 'hold'}>
                    {c}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 leading-snug text-content-muted">
                {group.codes.map((c) => CODE_MEANING[c]).filter(Boolean).join(' ')}
              </p>
            </Row>

            <Row label="Rule">
              {group.ruleId ? (
                <Link
                  href={`/targeting-policies?policy=${encodeURIComponent(group.ruleId)}`}
                  className="font-mono text-accent underline-offset-2 hover:underline"
                >
                  {group.ruleId}
                </Link>
              ) : (
                <Absent reason="this code is a property of the candidate, not of a rule" />
              )}
            </Row>

            <Row label="Tier">
              {policy ? (
                <Badge tone="outline">{policy.kind}</Badge>
              ) : (
                <Absent reason="no policy of this id is in the catalogue" />
              )}
            </Row>

            <Row label="Field it evaluated">
              {fields.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {(policy?.conditions ?? []).map((c, i) => (
                    <li key={`${c.field}-${i}`} className="font-mono text-[0.6875rem]">
                      {c.field} {c.operator} {String(c.value)}
                    </li>
                  ))}
                </ul>
              ) : (
                <Absent reason="the rule records no conditions" />
              )}
            </Row>

            <Row label="Pack that supplied it">
              {pack ? (
                <>
                  <span className="font-semibold text-content">{pack.name}</span>{' '}
                  <Badge tone="outline">{pack.version}</Badge>
                  <p className="mt-0.5 font-mono text-[0.6875rem] text-content-muted">
                    {pack.packId}
                  </p>
                </>
              ) : policySources === null ? (
                <Absent reason="the artifact has not loaded" />
              ) : group.ruleId ? (
                <Absent reason="no installed pack claims this rule — the tenant authored it" />
              ) : (
                <Absent reason="there is no rule to attribute" />
              )}
            </Row>

            <Row label="Source system">
              {bindings.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {bindings.map((b) => {
                    const call = calls.find((c) => c.connectorId === b.connectorId);
                    return (
                      <li key={`${b.field}-${b.connectorId}`}>
                        <span className="font-mono text-[0.6875rem]">{b.field}</span> from{' '}
                        <Link
                          href={`/integrations?connector=${encodeURIComponent(b.connectorId)}`}
                          className="text-accent underline-offset-2 hover:underline"
                        >
                          {b.connectorId}
                        </Link>
                        {call ? (
                          <span className="text-content-muted">
                            {' '}
                            · {call.cacheHit ? 'cache hit' : 'live read'} · {call.ms}ms
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Absent reason="no connector supplied a field this rule reads; the value came from the request" />
              )}
            </Row>

            <Row label="When the value was computed">
              {readCalls.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {readCalls.map((call) => (
                    <li key={call.connectorId}>
                      <span className="font-mono text-[0.6875rem]">{call.connectorId}</span>{' '}
                      {whenComputed(call)}
                    </li>
                  ))}
                </ul>
              ) : (
                <Absent reason="no connector call supplied a field this rule reads" />
              )}
            </Row>

            <Row label="What the customer was told">
              <Absent reason="nothing. No customer-facing refusal text exists in the platform (G-057)" />
            </Row>
          </dl>
        </>
      ) : (
        <>
          <p className="mt-1 text-body font-semibold text-content">
            {stage.removed > 0
              ? `${stage.removed} removed, ${stage.survived} carried on`
              : `${stage.survived} carried on`}
          </p>
          {stage.reason ? (
            <p className="mt-2 text-label leading-relaxed text-content-muted">{stage.reason}</p>
          ) : null}
          <dl className="mt-2 flex flex-col">
            <Row label="Node">
              <span className="font-mono text-[0.6875rem]">{stage.nodeId}</span>{' '}
              <Badge tone="outline">{stage.nodeType}</Badge>
            </Row>
            <Row label="Time in this node">
              {stage.ms === null ? (
                <Absent reason="the trace recorded no timing for this node" />
              ) : (
                <span className="tnum">{stage.ms}ms</span>
              )}
            </Row>
          </dl>
          <p className="mt-3 text-label leading-relaxed text-content-subtle">
            {stage.removed > 0
              ? 'Select a rule in the middle pane to see the evidence behind it.'
              : 'This node removed nothing.'}
          </p>
        </>
      )}
    </>
  );
}
