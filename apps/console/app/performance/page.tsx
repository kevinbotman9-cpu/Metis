'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  ErrorState,
  LoadingState,
  Select,
  Field,
} from '@/components/ui/primitives';
import { EmptyLedgerNote, useEmptyReason } from '@/components/no-decisions-yet';
import { ProvenanceBanner } from '@/components/ui/provenance-banner';
import { CascadeRail } from '@/components/cascade-rail';
import { CascadePanes } from '@/components/cascade-panes';
import {
  LoopFirstPaint,
  LoopInversions,
  railFootOf,
  LoopStageDetail,
  LoopStageEvidence,
} from '@/components/loop-panes';
import { apiClient } from '@/lib/api-client';
import { buildLoop, channelLabel } from '@/lib/loop';
import { useFormat } from '@/components/tenant-format';

/**
 * What happened after the decisions — the loop, read as a Cascade.
 *
 * `docs/METIS_CONSOLE_SPEC.md` §4.7. Five stages, each a subset of the one
 * above: **decisions → offered → deliverable → seen → acted**. The rail carries
 * the shape; the middle pane holds whichever stage is selected; the right pane
 * holds evidence for it.
 *
 * This was four figures in a row until 2026-09-10, and the four hid the thing
 * that matters most about this platform: it decides on more channels than it
 * delivers on, and the decisions won on a channel with no sender reach nobody —
 * while the old screen put them beside the delivered ones, with the same
 * marker, and offered a click rate over the pair.
 *
 * The arithmetic is `lib/loop.ts` and the panes are `components/loop-panes.tsx`,
 * shared with the Overview since 2026-09-13, so the two screens that draw the
 * loop cannot count it differently. What is this screen's own is the filters:
 * a channel or a flow narrows the report, and the loop is redrawn over it.
 *
 * Three rules the pattern imposes:
 *
 * **The break is drawn, not smoothed.** `Deliverable` is rendered in the block
 * colour and states the count that fell out. A smaller bar would read as a poor
 * result; a break reads as a broken thing, and only one of those is actionable.
 *
 * **Rates below the break name their population.** Every percentage under
 * `Deliverable` says which channel it describes, in the same line as the number.
 *
 * **Selecting a stage never changes the rail.** Losing it on selection turns a
 * decomposition into a drill-down, and the reader loses their place in the
 * whole.
 */

function PerformanceView() {
  // Which of the two blanks this screen is showing, when it shows one.
  const emptyReason = useEmptyReason();
  const format = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [channel, setChannel] = useState('');
  const [flowId, setFlowId] = useState('');

  // Which stage is open lives in the URL: a colleague should be able to be sent
  // the break rather than told how to reach it.
  const selected = params.get('stage');
  const setSelected = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('stage', id);
    else next.delete('stage');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['performance', channel, flowId],
    queryFn: () =>
      apiClient.getPerformance({
        channel: channel || undefined,
        flowId: flowId || undefined,
      }),
  });

  const flows = useQuery({ queryKey: ['artifacts'], queryFn: () => apiClient.listArtifacts() });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: () => apiClient.getTaxonomy() });

  const marginByKey = useMemo(
    () => new Map((taxonomy.data?.offers ?? []).map((o) => [o.key, o.financials.expectedMargin.amount])),
    [taxonomy.data]
  );
  const loop = useMemo(() => (data ? buildLoop(data, marginByKey, format) : null), [data, marginByKey, format]);

  if (isLoading) return <LoadingState label="Joining outcomes to decisions" />;
  if (error || !data || !loop) {
    return (
      <ErrorState
        description="Could not build the report."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <PageBody>
      <PageHeader
        title="Performance"
      />

      <ProvenanceBanner provenance={data.provenance} />

      <p className="mb-stack text-label text-content-subtle">
        {data.from && data.to ? `Decisions from ${format.date(data.from)} to ${format.date(data.to)}. ` : ''}
        A channel that reports twice counts once.
      </p>

      <div className="mb-stack flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Channel" htmlFor="perf-channel">
            <Select id="perf-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All channels</option>
              {data.channels.map((c) => (
                <option key={c.channel} value={c.channel}>
                  {channelLabel(c.channel)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-56">
          <Field label="Flow" htmlFor="perf-flow">
            <Select id="perf-flow" value={flowId} onChange={(e) => setFlowId(e.target.value)}>
              <option value="">All flows</option>
              {(flows.data?.artifacts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/*
        Filtered, so an empty report has two meanings and the note says which:
        a window that matched nothing is the reader's to fix, a tenant with no
        history is not. Either way the loop below is drawn, at zero.
      */}
      {data.decisions === 0 ? (
        <EmptyLedgerNote
          reason={emptyReason}
          filtered="This tenant has a decision history; none of it is in this window. Narrow the filters or widen the window."
        />
      ) : null}
      <>
        <LoopInversions loop={loop} />
        <CascadePanes
          rail={
            <CascadeRail
              label="The loop"
              stages={loop.stages}
              selected={selected}
              onSelect={setSelected}
              // Absent where the Deliverable stage's own pass-through already
              // says the loop is closed end to end (2026-09-17).
              foot={railFootOf(loop)}
            />
          }
          evidence={<LoopStageEvidence data={data} loop={loop} stage={selected} />}
        >
          {selected ? (
            <LoopStageDetail data={data} loop={loop} stage={selected} />
          ) : (
            <LoopFirstPaint data={data} loop={loop} />
          )}
        </CascadePanes>
      </>

      {/* What this screen will not claim. Change it with the row that quotes it: it is cited in
          `docs/CAPABILITIES.md` as the place the product says it in its own
          words, and a rebuild that quietly dropped it would make that row a lie. */}
      <p className="mt-stack text-label text-content-muted">
        Rates are over decisions with a reported outcome. A dash is no measurement, not zero. Counting only: no
        attribution or uplift.
      </p>
    </PageBody>
  );
}

export default function PerformancePage() {
  return (
    <RequireAuth>
      <PerformanceView />
    </RequireAuth>
  );
}
