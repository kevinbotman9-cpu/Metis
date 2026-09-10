'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';
import type { TargetingPolicyDto, TraceDto } from '@/lib/api-client';
import { CODE_MEANING, type DenialGroup, type TraceStage } from '@/components/trace-cascade';

/**
 * The evidence pane: what is behind whatever is selected.
 *
 * The design north star is the compliance officer and the trace is the hero, so
 * this pane exists to answer the question a regulator actually asks — not "what
 * happened" but "on what basis, and can you show me". Every claim here names
 * its source or says why it has none.
 *
 * **Two of the five things asked for do not exist, and are drawn as absences.**
 * A pane that silently omitted them would read as complete, and the reader
 * would conclude the platform records more than it does. Both are registered:
 *
 * - *The pack that supplied the rule.* A `TargetingPolicy` has an id, a name, a
 *   kind, a description, conditions and a scope. It has no package. The
 *   compiled artifact does lock `packageVersions`, so the decision can say
 *   which packs it compiled against — but not which of them supplied a given
 *   rule. G-055.
 * - *When the value was computed.* `sourceCalls` records the connector, the
 *   duration and whether it was a cache hit. There is no timestamp, so a value
 *   read from cache cannot be dated at all. G-056.
 *
 * And a third, which is not a rendering problem but a modelling one: there is
 * no customer-facing refusal text anywhere in the platform. Creatives say what
 * an offer *is*; nothing says what a customer was told when one was withheld.
 * A regulator asking "what were they told" has no answer today. G-057.
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
}

export function TraceEvidence({
  trace,
  stage,
  group,
  policies,
  packageVersions,
}: TraceEvidenceProps) {
  const policy = group?.ruleId ? policies.find((p) => p.id === group.ruleId) : undefined;

  // Which connector supplied the field this rule read, where the trace bound
  // one. `sourceBindings` maps field -> connector; the policy names the field.
  const fields = (policy?.conditions ?? []).map((c) => c.field).filter(Boolean);
  const bindings = (trace.sourceBindings ?? []).filter((b) => fields.includes(b.field));
  const calls = trace.sourceCalls ?? [];

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

            {/* Named as an absence rather than omitted. See the file comment. */}
            <Row label="Pack that supplied it">
              <Absent
                reason={
                  <>
                    no pack is recorded against a rule (
                    <Link href="/docs" className="text-accent underline-offset-2 hover:underline">
                      G-055
                    </Link>
                    ). The artifact compiled against{' '}
                    {packageVersions && Object.keys(packageVersions).length > 0
                      ? Object.entries(packageVersions)
                          .map(([n, v]) => `${n}@${v}`)
                          .join(', ')
                      : 'no recorded packs'}
                  </>
                }
              />
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
              <Absent reason="not recorded — sourceCalls carries duration and cache state, never a timestamp (G-056)" />
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
