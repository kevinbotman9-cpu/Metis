'use client';

import { CoverageBar } from '@/components/ui/coverage-bar';
import { ErrorState, LoadingState } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { PanelProps } from '../panel';

/** Every channel the platform can deliver on, in the order a marketer reads them. */
const CHANNELS = ['email', 'sms', 'web', 'push', 'outbound_call'] as const;
const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

/**
 * `offers.reach` — which channels one offer can reach a customer on.
 *
 * The list can prove one thing about deliverability: whether an offer has any
 * creative at all. Only here, where one offer's creatives are read, can the
 * screen say *which* channels are covered — so this is where the coverage figure
 * may say "channels" rather than "creatives". Moved from the drawer the
 * catalogue had until 2026-09-13; the channel table is the evidence the warning
 * is computed from, so it is shown whether or not the warning is.
 */
export function OfferReach({ occupant, record, context }: PanelProps) {
  const source = context.sources[String(occupant.params?.source)];
  if (!record) return null;
  if (!source || source.status === 'loading') return <LoadingState label="Loading creatives" />;
  if (source.status === 'error') return <ErrorState title="Could not load this offer’s creatives" />;

  const creatives = source.rows;
  const activeChannels = new Set(creatives.filter((c) => c.active).map((c) => String(c.channel)));
  const selectable = record.status !== 'retired';

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Deliverability">
        <CoverageBar
          covered={activeChannels.size}
          total={selectable ? CHANNELS.length : 0}
          selectable={selectable}
          noun="channels"
        />
        {activeChannels.size === 0 && selectable ? (
          <p className="mt-3 border-l-2 border-block bg-block-subtle px-3 py-2 text-body text-content-muted">
            <strong className="font-semibold text-block">This offer cannot reach a customer.</strong> It passes
            eligibility and can win arbitration, but no channel has anything to render, so the placement comes back
            empty. The compiler refuses to publish a decision flow whose candidate set includes it, with{' '}
            <code className="font-mono text-label">NO_DELIVERABLE_CREATIVE</code>.
          </p>
        ) : null}
      </section>

      <ul aria-label="Channels" className="divide-y divide-border">
        {CHANNELS.map((channel) => {
          const on = creatives.filter((c) => c.channel === channel && c.active);
          return (
            <li key={channel} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-body text-content">{CHANNEL_LABEL[channel]}</span>
                <span className="block text-label text-content-subtle">
                  {on.length > 0 ? on.map((c) => String(c.name)).join(', ') : 'Not configured'}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 rounded border px-2 py-0.5 font-mono text-label',
                  on.length > 0 ? 'border-border text-content-subtle' : 'border-dashed border-block text-block'
                )}
              >
                {on.length > 0 ? 'ready' : 'no creative'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
