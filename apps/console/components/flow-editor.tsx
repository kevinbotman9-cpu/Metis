'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { FlowCanvas } from '@/components/canvas/flow-canvas';
import type { FlowNode, FlowEdge, FlowNodeType } from '@/mocks/fixtures/artifacts';
import { apiClient, ApiError, type CompileResultDto } from '@/lib/api-client';

/**
 * Authoring a decision flow on the canvas.
 *
 * This closes the two findings that made everything else configurable only in
 * appearance. A created offer was not decidable, because a flow's candidate set
 * is a fixed list; a created policy never ran, because the engine evaluates
 * only what a node names in `policyIds`. Both are edited here.
 *
 * ## Saving is not deploying
 *
 * The draft saves whether or not it compiles — a graph is built in steps and a
 * half-connected one is a normal intermediate state, not an error to refuse.
 * What refuses is publish. And saving changes no decision: decisions run the
 * version promoted to an environment, so an edit reaches them through compile,
 * publish and promote.
 *
 * The compile report is shown on every save rather than on demand, so nobody
 * discovers at publish time that the thing they have been drawing was never
 * going to ship.
 */

const PALETTE: { type: FlowNodeType; label: string; blurb: string }[] = [
  { type: 'source', label: 'Source', blurb: 'Loads fields from connectors before the engine runs.' },
  { type: 'filter', label: 'Filter', blurb: 'Applies targeting policies. Failing one removes the candidate.' },
  { type: 'constraint', label: 'Constraint', blurb: 'Consent and frequency are enforced here, and only here.' },
  { type: 'score-model', label: 'Score', blurb: 'Pins a model version, which is what makes the decision replayable.' },
  { type: 'switch', label: 'Switch', blurb: 'Branches. The engine treats it as a pass-through.' },
  { type: 'arbitrate', label: 'Arbitrate', blurb: 'Ranks what survived and picks a winner.' },
];

export interface FlowEditorProps {
  artifactId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  candidateKeys: string[];
  canEdit: boolean;
}

export function FlowEditor({ artifactId, nodes, edges, candidateKeys, canEdit }: FlowEditorProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ nodes, edges, candidateKeys });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compile, setCompile] = useState<CompileResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The server's copy wins whenever it changes underneath — otherwise leaving
  // and returning shows a stale graph that a save would then write back.
  useEffect(() => {
    setDraft({ nodes, edges, candidateKeys });
  }, [nodes, edges, candidateKeys]);

  const policies = useQuery({
    queryKey: ['targeting-policies'],
    queryFn: () => apiClient.listTargetingPolicies(),
    enabled: editing,
  });
  const connectors = useQuery({
    queryKey: ['connectors'],
    queryFn: () => apiClient.listConnectors(),
    enabled: editing,
  });
  const offers = useQuery({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: () => apiClient.updateDecisionFlowDraft(artifactId, draft),
    onSuccess: (result) => {
      setCompile(result.compile);
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['artifact', artifactId] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Save failed.'),
  });

  const selected = draft.nodes.find((n) => n.id === selectedId) ?? null;
  const errors = compile?.diagnostics.filter((d) => d.severity === 'error') ?? [];

  const patchNode = (id: string, patch: Partial<FlowNode>) =>
    setDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

  const addNode = (type: FlowNodeType) => {
    const id = `${type.replace('-', '_')}_${Math.random().toString(36).slice(2, 6)}`;
    // Placed to the right of everything, so a new node never lands on top of an
    // existing one and has to be found before it can be moved.
    const x = draft.nodes.reduce((m, n) => Math.max(m, n.position.x), 0) + 240;
    const node: FlowNode = {
      id,
      type,
      label: PALETTE.find((p) => p.type === type)!.label,
      description: '',
      estimatedMs: 1,
      position: { x, y: 100 },
    };
    setDraft((d) => ({ ...d, nodes: [...d.nodes, node] }));
    setSelectedId(id);
  };

  const removeNode = (id: string) =>
    setDraft((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== id),
      // Edges to a node that no longer exists would compile as a dangling
      // reference, which is a worse message than the node simply being gone.
      edges: d.edges.filter((e) => e.source !== id && e.target !== id),
    }));

  const toggle = (list: string[] | undefined, value: string) => {
    const set = new Set(list ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return [...set].sort();
  };

  return (
    <div className="grid gap-stack lg:grid-cols-[1fr_340px]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Decision graph"
          description={
            editing
              ? 'Drag to rearrange, drag from a node edge to connect, select an edge and press Delete to remove it. Saving does not change any decision — publish and promote do.'
              : 'Select a node to inspect what it does.'
          }
          actions={
            canEdit ? (
              <div className="flex items-center gap-2">
                {editing ? (
                  <Button
                    variant="primary"
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                  >
                    Save graph
                  </Button>
                ) : null}
                <Button variant="secondary" onClick={() => setEditing(!editing)}>
                  {editing ? 'Done' : 'Edit graph'}
                </Button>
              </div>
            ) : undefined
          }
        />

        {editing ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-card py-2">
            <span className="text-label text-content-subtle">Add:</span>
            {PALETTE.map((p) => (
              <Button key={p.type} variant="secondary" onClick={() => addNode(p.type)} title={p.blurb}>
                {p.label}
              </Button>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="border-b border-border px-card py-1.5 text-body text-block">{error}</p>
        ) : null}

        {compile ? (
          <div className="border-b border-border px-card py-2">
            {errors.length === 0 ? (
              // Cost and the full diagnostic list stay on the page's own
              // compile report rather than being duplicated here; this line
              // answers the one question being asked mid-edit.
              <p className="text-body text-pass">
                Compiles clean. Publish and promote to put it in front of customers.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {errors.map((d, i) => (
                  <li key={i} className="text-body text-block">
                    <span className="font-mono text-label">{d.code}</span> {d.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {/* React Flow needs an explicit height. */}
        <div className="h-[460px] w-full bg-page">
          <FlowCanvas
            nodes={draft.nodes}
            edges={draft.edges}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={
              editing
                ? (id, position) => patchNode(id, { position })
                : undefined
            }
            onConnect={
              editing
                ? ({ source, target }) =>
                    setDraft((d) =>
                      // Drawing the same edge twice is a slip, not an intent.
                      d.edges.some((e) => e.source === source && e.target === target)
                        ? d
                        : {
                            ...d,
                            edges: [
                              ...d.edges,
                              { id: `e_${source}_${target}`, source, target },
                            ],
                          }
                    )
                : undefined
            }
            onDisconnect={
              editing
                ? (edgeId) =>
                    setDraft((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== edgeId) }))
                : undefined
            }
          />
        </div>
      </Card>

      <div className="space-y-stack">
        {editing && selected ? (
          <Card>
            <CardHeader
              title={selected.label}
              description={`${selected.type} · ${selected.id}`}
              actions={
                <Button variant="secondary" onClick={() => removeNode(selected.id)}>
                  Delete node
                </Button>
              }
            />
            <div className="space-y-3 px-card py-3">
              <label className="block">
                <span className="text-label font-medium text-content-subtle">Label</span>
                <input
                  aria-label="Node label"
                  value={selected.label}
                  onChange={(e) => patchNode(selected.id, { label: e.target.value })}
                  className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-body text-content"
                />
              </label>

              {/* Policies only bind where the engine reads them. Offering the
                  list on an arbitrate node would imply an effect it has not. */}
              {selected.type === 'filter' || selected.type === 'constraint' ? (
                <fieldset>
                  <legend className="text-label font-medium text-content-subtle">
                    Targeting policies this node applies
                  </legend>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">
                    {(policies.data?.policies ?? []).map((p) => (
                      <label key={p.id} className="flex items-start gap-2 text-label text-content">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-accent"
                          checked={(selected.policyIds ?? []).includes(p.id)}
                          onChange={() =>
                            patchNode(selected.id, {
                              policyIds: toggle(selected.policyIds, p.id),
                            })
                          }
                        />
                        <span>
                          {p.name} <Badge tone="neutral">{p.kind}</Badge>
                        </span>
                      </label>
                    ))}
                  </div>
                  {selected.type === 'constraint' ? (
                    <p className="mt-1 text-label text-content-muted">
                      Consent and frequency caps are enforced at constraint nodes whether or not a
                      policy is listed here.
                    </p>
                  ) : null}
                </fieldset>
              ) : null}

              {selected.type === 'source' ? (
                <fieldset>
                  <legend className="text-label font-medium text-content-subtle">
                    Connectors this node draws on
                  </legend>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">
                    {(connectors.data?.connectors ?? []).map((c) => (
                      <label key={c.id} className="flex items-start gap-2 text-label text-content">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-accent"
                          checked={(selected.connectorIds ?? []).includes(c.id)}
                          onChange={() =>
                            patchNode(selected.id, {
                              connectorIds: toggle(selected.connectorIds, c.id),
                            })
                          }
                        />
                        <span>
                          {c.name} {c.active ? null : <Badge tone="neutral">off</Badge>}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </div>
          </Card>
        ) : null}

        {editing ? (
          <Card>
            <CardHeader
              title="Candidate offers"
              description="What this flow may select from. An offer absent from this list is never a candidate, however it is configured elsewhere."
            />
            <div className="max-h-64 space-y-1 overflow-y-auto px-card py-3">
              {(offers.data?.offers ?? []).map((o) => (
                <label key={o.id} className="flex items-start gap-2 text-label text-content">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-accent"
                    checked={draft.candidateKeys.includes(o.key)}
                    onChange={() =>
                      setDraft((d) => ({ ...d, candidateKeys: toggle(d.candidateKeys, o.key) }))
                    }
                  />
                  <span>
                    {o.name} <span className="font-mono text-content-subtle">{o.key}</span>{' '}
                    {o.status === 'active' ? null : <Badge tone="neutral">{o.status}</Badge>}
                  </span>
                </label>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
