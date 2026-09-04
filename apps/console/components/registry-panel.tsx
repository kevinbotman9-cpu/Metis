'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth-provider';
import { Card, CardHeader, CardBody, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { apiClient, ApiError } from '@/lib/api-client';

/**
 * A strategy's registry entry: what has been published, and what each
 * environment is running.
 *
 * The distinction this surface exists to make visible is publish versus
 * promote. A published version is in the registry and running nowhere; the
 * moment it reaches customers is a separate, separately-audited decision. A
 * console that showed one button for both would be the reason rollback is
 * frightening.
 */

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export function RegistryPanel({ strategyName }: { strategyName: string }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const canPromote = hasPermission('promote:strategies');

  const entry = useQuery({
    queryKey: ['registry', strategyName],
    queryFn: () => apiClient.getRegistryEntry(strategyName),
    retry: false,
  });

  const events = useQuery({
    queryKey: ['registry-events', strategyName],
    queryFn: () => apiClient.listRegistryEvents({ strategyName, limit: 12 }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registry', strategyName] });
    queryClient.invalidateQueries({ queryKey: ['registry-events', strategyName] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const promote = useMutation({
    mutationFn: (v: { version: string; environment: string }) =>
      apiClient.promoteVersion(strategyName, v.version, v.environment),
    onMutate: (v) => {
      setPending(`${v.environment}:${v.version}`);
      setProblem(null);
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : String(e)),
    onSettled: () => setPending(null),
    onSuccess: invalidate,
  });

  const rollback = useMutation({
    mutationFn: (environment: string) => apiClient.rollbackVersion(strategyName, environment),
    onMutate: (env) => {
      setPending(`rollback:${env}`);
      setProblem(null);
    },
    onError: (e) => setProblem(e instanceof ApiError ? e.message : String(e)),
    onSettled: () => setPending(null),
    onSuccess: invalidate,
  });

  // A strategy that failed to compile was never stored, so there is no entry.
  // That is the compilation gate working, and it deserves saying rather than
  // an empty panel.
  if (entry.error instanceof ApiError && entry.error.status === 404) {
    return (
      <Card>
        <CardHeader title="Registry" />
        <EmptyState
          title="Not in the registry"
          description="Publishing compiles first, and this strategy has not been published successfully. A version that does not compile is refused, so it cannot be promoted and cannot reach execution. The registry log below records the attempt."
        />
        <CardBody>
          <RegistryLog events={events.data?.events ?? []} />
        </CardBody>
      </Card>
    );
  }

  const versions = entry.data?.versions ?? [];
  const environments = entry.data?.environments ?? [];
  const stateFor = (env: string) => environments.find((e) => e.environment === env);

  return (
    <Card>
      <CardHeader
        title="Registry"
        description="Published versions are immutable and inactive until promoted. Promotion is when a change reaches customers, so it is its own decision with its own audit entry."
      />
      <CardBody className="space-y-4">
        {problem && (
          <p className="rounded border border-block/40 bg-block-subtle px-3 py-2 text-label text-block">
            {problem}
          </p>
        )}

        <div>
          <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
            Environments
          </p>
          <ul className="space-y-1.5">
            {ENVIRONMENTS.map((env) => {
              const state = stateFor(env);
              return (
                <li
                  key={env}
                  className="flex items-center justify-between gap-3 rounded border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="text-body text-content">{env}</span>
                    <div className="font-mono text-[0.6875rem] text-content-subtle">
                      {state?.activeVersion ? (
                        <>
                          {state.activeVersion}
                          {state.previousVersion && ` (was ${state.previousVersion})`}
                        </>
                      ) : (
                        'nothing promoted'
                      )}
                    </div>
                  </div>
                  {canPromote && state?.previousVersion && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => rollback.mutate(env)}
                      disabled={pending !== null}
                    >
                      {pending === `rollback:${env}` ? 'Rolling back…' : 'Roll back'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
            Published versions
          </p>
          {versions.length === 0 ? (
            <p className="text-label text-content-muted">Nothing published yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {versions.map((v) => {
                const running = environments
                  .filter((e) => e.activeVersion === v.version)
                  .map((e) => e.environment);
                return (
                  <li key={v.version} className="rounded border border-border px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-body text-content">{v.version}</span>
                      <span className="font-mono text-[0.6875rem] text-content-subtle">
                        {v.artifact.artifactHash.slice(0, 12)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {running.map((e) => (
                        <Badge key={e} tone="pass">
                          {e}
                        </Badge>
                      ))}
                      {v.warnings.length > 0 && (
                        <Badge tone="hold">
                          {v.warnings.length} warning{v.warnings.length === 1 ? '' : 's'}
                        </Badge>
                      )}
                      <span className="text-[0.6875rem] text-content-subtle">
                        {v.publishedBy}
                      </span>
                    </div>
                    {/* A version that published with warnings is a different
                        thing to explain later than one that published clean. */}
                    {v.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {v.warnings.map((w, i) => (
                          <li key={i} className="text-[0.6875rem] text-hold">
                            {w.code}: {w.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canPromote && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ENVIRONMENTS.filter((e) => stateFor(e)?.activeVersion !== v.version).map(
                          (e) => (
                            <Button
                              key={e}
                              variant="ghost"
                              size="sm"
                              onClick={() => promote.mutate({ version: v.version, environment: e })}
                              disabled={pending !== null}
                            >
                              {pending === `${e}:${v.version}` ? 'Promoting…' : `Promote to ${e}`}
                            </Button>
                          )
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <RegistryLog events={events.data?.events ?? []} />
      </CardBody>
    </Card>
  );
}

function RegistryLog({
  events,
}: {
  events: { seq: number; type: string; summary: string; actor: string; at: string }[];
}) {
  if (events.length === 0) return null;

  const tone: Record<string, string> = {
    ArtifactPublished: 'text-pass',
    VersionPromoted: 'text-accent',
    VersionRolledBack: 'text-hold',
    PublishRejected: 'text-block',
  };

  return (
    <div>
      <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
        Registry log
      </p>
      <ul className="space-y-1.5">
        {events.map((e) => (
          <li key={e.seq} className="border-b border-border pb-1.5 last:border-0 last:pb-0">
            <span className={`text-label font-medium ${tone[e.type] ?? 'text-content'}`}>
              {e.type}
            </span>
            <p className="text-label text-content-muted">{e.summary}</p>
            <p className="text-[0.6875rem] text-content-subtle">
              {e.actor} · {new Date(e.at).toLocaleString('en-GB')}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
