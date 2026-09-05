'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/**
 * What needs a person's attention, wherever they happen to be.
 *
 * Two things in this platform are time-sensitive and were previously only
 * visible if you navigated to the right page: a change set waiting on
 * approval, and an agent action a guardrail stopped. Both are surfaced here
 * from the same data those pages read.
 */

interface Item {
  id: string;
  tone: 'hold' | 'block';
  title: string;
  detail: string;
  href: string;
  at?: string;
}

export function Notifications() {
  const [open, setOpen] = useState(false);

  // A panel opened from the keyboard has to be closeable from the keyboard.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const changeSets = useQuery({
    queryKey: ['change-sets'],
    queryFn: () => apiClient.listChangeSets(),
  });
  const activity = useQuery({
    queryKey: ['agent-activity', 'notifications'],
    queryFn: () => apiClient.listAgentActivity({ limit: 50 }),
  });

  const pending: Item[] = (changeSets.data?.changeSets ?? [])
    .filter((c) => c.status === 'pending')
    .map((c) => ({
      id: c.id,
      tone: 'hold',
      title: c.title,
      detail: `Awaiting approval · raised by ${c.requestedBy}`,
      href: `/approvals/${c.id}`,
      at: c.requestedAt,
    }));

  const stopped: Item[] = (activity.data?.activity ?? [])
    .filter((a) => a.outcome === 'blocked' || a.outcome === 'reverted')
    .map((a) => ({
      id: a.id,
      tone: 'block',
      title: a.guardrailBreached ?? 'Guardrail stopped an agent change',
      detail: `${a.agentId} · ${a.outcome === 'reverted' ? 'auto-reverted' : 'blocked'}`,
      href: '/agentic',
      at: a.timestamp,
    }));

  // Guardrail breaches first: an approval can wait, a breach is a live signal
  // that an agent tried something it should not have.
  const items = [...stopped, ...pending];
  const count = items.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={
          count === 0 ? 'Notifications, none' : `Notifications, ${count} needing attention`
        }
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-on-header/80 transition-colors hover:bg-on-header/10 hover:text-on-header"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-block px-1 text-[0.5625rem] font-bold text-on-block"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="notifications-panel"
            role="group"
            aria-label="Needs attention"
            className="absolute right-0 z-30 mt-2 w-96 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <p className="text-body font-semibold text-content">Needs attention</p>
              <span className="text-label text-content-subtle">{count}</span>
            </div>

            {count === 0 ? (
              <p className="px-3 py-8 text-center text-body text-content-muted">
                Nothing waiting. No pending approvals and no guardrail stops.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {items.map((item) => (
                  <li key={`${item.tone}-${item.id}`}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2.5 transition-colors hover:bg-surface-sunken"
                    >
                      <span className="flex items-start gap-2">
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            item.tone === 'block' ? 'bg-block' : 'bg-hold'
                          )}
                        />
                        <span className="min-w-0">
                          <span className="block text-body text-content">{item.title}</span>
                          <span className="mt-0.5 block text-label text-content-muted">
                            {item.detail}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex border-t border-border">
              <Link
                href="/approvals"
                onClick={() => setOpen(false)}
                className="flex-1 px-3 py-2 text-center text-label text-accent hover:bg-surface-sunken"
              >
                All approvals
              </Link>
              <Link
                href="/agentic"
                onClick={() => setOpen(false)}
                className="flex-1 border-l border-border px-3 py-2 text-center text-label text-accent hover:bg-surface-sunken"
              >
                Agent activity
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
