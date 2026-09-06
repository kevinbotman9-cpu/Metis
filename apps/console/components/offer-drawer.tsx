'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Drawer } from '@/components/ui/drawer';
import { CoverageBar } from '@/components/ui/coverage-bar';
import { StatusBadge, LoadingState, ErrorState } from '@/components/ui/primitives';
import { apiClient, type OfferDto } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/** Every channel the platform can deliver on, in the order a marketer reads them. */
const CHANNELS = ['email', 'sms', 'web', 'push', 'outbound_call'] as const;
const CHANNEL_LABEL: Record<string, string> = {
  email: 'Email',
  sms: 'SMS',
  web: 'Web',
  push: 'Push',
  outbound_call: 'Outbound call',
};

function money(m: { amount: number; currency: string }) {
  const symbol = m.currency === 'GBP' ? '£' : m.currency === 'USD' ? '$' : '€';
  return `${symbol}${(m.amount / 100).toFixed(2)}`;
}

/**
 * Offer detail, in a drawer over the catalogue.
 *
 * The list can prove one thing about deliverability — whether an offer has any
 * creative at all. Only here, where the creatives are fetched, can we say
 * *which* channels are covered, so this is where the channel table lives and
 * where the coverage figure is allowed to say "channels" rather than
 * "creatives".
 *
 * Two warnings, deliberately separate. An offer can be undeliverable, or carry
 * a negative margin, or both — they have different causes and different fixes,
 * so collapsing them into one banner would hide half the work.
 */
export interface OfferDrawerProps {
  offerId: string | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  /** From the list, so the header can render before the detail arrives. */
  summary?: OfferDto;
}

export function OfferDrawer({
  offerId,
  onClose,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
  summary,
}: OfferDrawerProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: () => apiClient.getOffer(offerId as string),
    enabled: Boolean(offerId),
  });

  const offer = data?.offer ?? summary;
  const creatives = data?.creatives ?? [];
  const activeChannels = new Set(creatives.filter((c) => c.active).map((c) => c.channel));
  const selectable = offer ? offer.status !== 'retired' : true;

  return (
    <Drawer
      open={Boolean(offerId)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={offer?.name ?? 'Offer'}
      subtitle={offer?.key}
      headerAside={offer ? <StatusBadge status={offer.status} /> : null}
      onPrev={onPrev}
      onNext={onNext}
      prevLabel={prevLabel}
      nextLabel={nextLabel}
    >
      {error ? (
        <div className="p-5">
          <ErrorState description={(error as Error).message} onRetry={() => refetch()} />
        </div>
      ) : isLoading && !summary ? (
        <div className="p-5">
          <LoadingState label="Loading offer" />
        </div>
      ) : !offer ? null : (
        <div className="divide-y divide-border">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 sm:grid-cols-3">
            <Fact label="Price" value={money(offer.financials.price)} />
            <Fact label="Cost" value={money(offer.financials.cost)} />
            <Fact
              label="Expected margin"
              value={money(offer.financials.expectedMargin)}
              tone={offer.financials.expectedMargin.amount < 0 ? 'block' : undefined}
            />
            <Fact label="Business boost" value={offer.boost.toFixed(2)} />
            <Fact
              label="Term"
              value={offer.financials.termMonths ? `${offer.financials.termMonths} months` : '—'}
            />
            <Fact label="Policies" value={String(offer.policyIds.length)} />
          </dl>

          {/* Deliverability. Stated before the channel table, because the
              table is the evidence for it. */}
          <div className="px-5 py-4">
            <h3 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
              Deliverability
            </h3>
            <div className="mt-2">
              <CoverageBar
                covered={activeChannels.size}
                total={selectable ? CHANNELS.length : 0}
                selectable={selectable}
                noun="channels"
              />
            </div>

            {activeChannels.size === 0 && selectable ? (
              <p className="mt-3 border-l-2 border-block bg-block-subtle px-3 py-2 text-body text-content-muted">
                <strong className="font-semibold text-block">
                  This offer cannot reach a customer.
                </strong>{' '}
                It passes eligibility and can win arbitration, but no channel has anything to
                render, so the placement comes back empty. The compiler refuses to publish a
                decision flow whose candidate set includes it, with{' '}
                <code className="font-mono text-label">NO_DELIVERABLE_CREATIVE</code>.
              </p>
            ) : null}

            {offer.financials.expectedMargin.amount < 0 ? (
              <p className="mt-3 border-l-2 border-block bg-block-subtle px-3 py-2 text-body text-content-muted">
                <strong className="font-semibold text-block">Negative expected margin.</strong>{' '}
                Correct for a service action that moves a customer to a cheaper plan, but the
                ranking function reads value from expected margin — so this can never win an
                arbitration it shares with a commercial offer. If it should be selectable it needs
                its own decision flow, not a boost.
              </p>
            ) : null}
          </div>

          <div className="px-5 py-4">
            <h3 className="text-label font-semibold uppercase tracking-wide text-content-subtle">
              Channels
            </h3>
            <ul className="mt-2 divide-y divide-border">
              {CHANNELS.map((channel) => {
                const on = creatives.filter((c) => c.channel === channel && c.active);
                return (
                  <li key={channel} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-content">
                        {CHANNEL_LABEL[channel]}
                      </span>
                      <span className="block text-label text-content-subtle">
                        {on.length > 0 ? on.map((c) => c.name).join(', ') : 'Not configured'}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-2 py-0.5 font-mono text-label',
                        on.length > 0
                          ? 'border-border text-content-subtle'
                          : 'border-dashed border-block text-block'
                      )}
                    >
                      {on.length > 0 ? 'ready' : 'no creative'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="px-5 py-4">
            {/* A link, not a Button — Button renders a real <button> and has
                no Slot, so wrapping an anchor in it would produce a button
                containing a link. The classes match `variant="secondary"`. */}
            <Link
              href={`/offers/${offer.id}`}
              className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-border bg-surface px-3 text-body font-medium text-content transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Open the full record
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'block';
}) {
  return (
    <div>
      <dt className="text-label text-content-subtle">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-body font-medium tnum',
          tone === 'block' ? 'text-block' : 'text-content'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
