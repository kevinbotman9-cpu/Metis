'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/primitives';
import {
  EvidenceFields,
  EvidenceLabel,
  EvidencePick,
  EvidenceQuote,
  EvidenceRow as Row,
} from '@/components/ui/evidence';
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
 * **Its quote states what the record holds.** The reference drew a quote of the
 * reason shown to the customer, and there is no such text (below), so the quote
 * is the reason code's meaning for a rule, the node's own recorded reason for a
 * stage, and the ranking formula for the decision whole — each a thing the
 * record carries.
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
      <Absent reason="this cache does not record when it stored the value" />
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
        <EvidenceLabel>The decision</EvidenceLabel>
        <EvidencePick>{trace.winner ? trace.winner : 'No offer'}</EvidencePick>
        {trace.arbitration?.formula ? (
          <EvidenceQuote title="How it was ranked" tone="accent">
            <span className="font-mono">{trace.arbitration.formula}</span>
            {trace.arbitration.utility ? (
              <span className="mt-1 block">
                Ranking function{' '}
                <span className="font-mono">
                  {trace.arbitration.utility.id}@{trace.arbitration.utility.version}
                </span>
                , recorded with the decision.
              </span>
            ) : null}
          </EvidenceQuote>
        ) : null}
        <EvidenceFields>
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
              fields (monthlySpend), so the two never meet. G-069. */}
          <Row label="Values fetched">
            {calls.length > 0 ? (
              /* Two lines by design rather than one that wraps. The name is
                 mono and long, the timing sentence is long, and together they
                 do not fit the evidence column at any width this page gives
                 it — so the break is put where it means something instead of
                 falling after the separator. */
              <ul className="flex flex-col gap-1.5">
                {calls.map((call) => (
                  <li key={call.connectorId} className="flex flex-col">
                    <span className="font-mono text-label">{call.connectorId}</span>
                    <span className="text-label">{whenComputed(call)}</span>
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
                  <li key={name} className="font-mono text-label">
                    {name}@{version}
                  </li>
                ))}
              </ul>
            ) : (
              <Absent reason="the artifact records no package versions" />
            )}
          </Row>
        </EvidenceFields>
      </>
    );
  }

  if (group) {
    const meanings = group.codes.map((c) => CODE_MEANING[c]).filter(Boolean);
    const notRanked = group.codes.every((c) => c === 'NOT_RANKED');
    return (
      <>
        <EvidenceLabel>{group.ruleId ?? group.codes[0]}</EvidenceLabel>
        <EvidencePick>
          {policy?.name ?? (group.ruleId ? 'Rule not in the catalogue' : 'No rule to name')}
        </EvidencePick>

        {meanings.length > 0 ? (
          <EvidenceQuote title="What this code means" tone={notRanked ? 'neutral' : 'hold'}>
            {meanings.join(' ')}
          </EvidenceQuote>
        ) : null}

        <EvidenceFields>
          <Row label="Reason code">
            <div className="flex flex-wrap items-center gap-1.5">
              {group.codes.map((c) => (
                <Badge key={c} tone={c === 'NOT_RANKED' ? 'neutral' : 'hold'}>
                  {c}
                </Badge>
              ))}
            </div>
          </Row>

          {/* A candidate beaten on priority was not refused by anything, so
              the rows below — the rule, its tier, the field it read, the pack
              and source behind it, what the customer was told — have nothing
              to describe. Drawn anyway they were six "no …" lines in a row,
              which read as missing evidence rather than as none being due. */}
          {notRanked ? null : (
          <>
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
                  <li key={`${c.field}-${i}`} className="font-mono text-label">
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
                <p className="mt-0.5 font-mono text-label text-content-muted">
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
                      <span className="font-mono text-label">{b.field}</span> from{' '}
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
                    <span className="font-mono text-label">{call.connectorId}</span>{' '}
                    {whenComputed(call)}
                  </li>
                ))}
              </ul>
            ) : (
              <Absent reason="no connector call supplied a field this rule reads" />
            )}
          </Row>

          <Row label="What the customer was told">
            <Absent reason="nothing. No customer-facing refusal text exists in the platform" />
          </Row>
          </>
          )}
        </EvidenceFields>
      </>
    );
  }

  return (
    <>
      <EvidenceLabel>{stage.label}</EvidenceLabel>
      <EvidencePick>
        {stage.removed > 0
          ? `${stage.removed} removed, ${stage.survived} carried on`
          : `${stage.survived} carried on`}
      </EvidencePick>
      {stage.reason ? (
        <EvidenceQuote title="What the node recorded" tone={stage.removed > 0 ? 'hold' : 'neutral'}>
          {stage.reason}
        </EvidenceQuote>
      ) : null}
      <EvidenceFields>
        <Row label="Node">
          <span className="font-mono text-label">{stage.nodeId}</span>{' '}
          <Badge tone="outline">{stage.nodeType}</Badge>
        </Row>
        <Row label="Time in this node">
          {stage.ms === null ? (
            <Absent reason="the trace recorded no timing for this node" />
          ) : (
            <span className="tnum">{stage.ms}ms</span>
          )}
        </Row>
      </EvidenceFields>
      {stage.removed > 0 ? null : <p className="mt-3 text-label text-content-subtle">This node removed nothing.</p>}
    </>
  );
}
