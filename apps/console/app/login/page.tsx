'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/**
 * Split sign-in: form on the left, brand panel on the right.
 *
 * The right panel states what the platform actually does rather than marketing
 * claims - every line below is something the console demonstrates and the test
 * suite asserts. A login screen that over-promises is the first thing a
 * compliance officer distrusts.
 */

const PILLARS = [
  {
    title: 'Deterministic replay',
    body: 'Every decision re-executes to a byte-identical result. The chain hash is the evidence.',
    icon: (
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: 'Compiled before it ships',
    body: 'The compiler refuses a strategy the runtime could not execute safely, and says how to fix it.',
    icon: (
      <path d="m9 12 2 2 4-4M12 3l7.5 4v5c0 4.5-3 8.3-7.5 9.5C7.5 20.3 4.5 16.5 4.5 12V7Z" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: 'Scoped agent autonomy',
    body: 'L0 to L4 per proposition, group or issue. A regulated offer stays supervised while others run free.',
    icon: (
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.3 6.3l2.8 2.8m5.8 5.8 2.8 2.8m0-11.4-2.8 2.8m-5.8 5.8-2.8 2.8" strokeLinecap="round" />
    ),
  },
  {
    title: 'Evidence, not reports',
    body: 'An append-only log of every change, with the diff, the simulation and who approved it.',
    icon: (
      <path d="M8 3h8l4 4v14H4V3h4Zm0 0v5h8M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
];

const DEMO_ACCOUNTS = [
  {
    email: 'sarah.chen@telco.example',
    name: 'Sarah Chen',
    role: 'Decision Architect',
    can: 'Authors propositions and strategies. Cannot approve.',
  },
  {
    email: 'priya.natarajan@telco.example',
    name: 'Priya Natarajan',
    role: 'Compliance Officer',
    can: 'Approves changes and sets autonomy. Cannot author offers.',
  },
  {
    email: 'marcus.webb@telco.example',
    name: 'Marcus Webb',
    role: 'Administrator',
    can: 'Everything, including arbitration weights.',
  },
];

function LoginForm() {
  const { login, user, error, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, router, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch {
      // The provider surfaces the message; keep the user on the form.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Sign in */}
      <div className="flex items-center justify-center bg-page px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <span
              aria-hidden
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-brand-from to-brand-to"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="rgb(var(--on-brand))" strokeWidth="1.8">
                <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" strokeLinejoin="round" />
                <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" strokeLinejoin="round" />
              </svg>
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-content">METIS Console</h1>
            <p className="mt-1 text-body text-content-muted">
              Sign in to the decision platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@telco.example"
              />
            </Field>

            <Field label="Password" htmlFor="password" hint="Demo password for every account: demo">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error ? (
              <p
                role="alert"
                className="rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting || isLoading}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* Roles change what the console shows, so make switching easy. */}
          <div className="mt-8">
            <p className="mb-2 text-label uppercase tracking-wide text-content-subtle">
              Demo accounts
            </p>
            <ul className="space-y-1.5">
              {DEMO_ACCOUNTS.map((acct) => (
                <li key={acct.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(acct.email);
                      setPassword('demo');
                    }}
                    className={cn(
                      'w-full rounded border border-border bg-surface px-3 py-2 text-left transition-colors',
                      'hover:border-accent hover:bg-accent-subtle',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-body font-medium text-content">{acct.name}</span>
                      <span className="text-label text-accent">{acct.role}</span>
                    </span>
                    <span className="mt-0.5 block text-label text-content-muted">{acct.can}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-label text-content-subtle">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pass" />
            Development environment · fixture data
          </p>
        </div>
      </div>

      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-from via-brand-via to-brand-to px-10 py-12 lg:flex lg:flex-col lg:justify-center">
        {/* Soft geometry, kept low-contrast so it never competes with the text. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-on-brand/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-on-brand/5"
        />

        <div className="relative mx-auto w-full max-w-2xl text-on-brand">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Decisions you can prove, months later
          </h2>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-on-brand/80">
            METIS separates authoring from execution. Agents propose, a compiler validates, and the
            runtime executes deterministically, so every decision can be replayed and defended.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {PILLARS.map((pillar) => (
              <li
                key={pillar.title}
                className="rounded-lg border border-on-brand/15 bg-on-brand/10 p-4 backdrop-blur-sm"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="rgb(var(--on-brand))"
                  strokeWidth="1.6"
                >
                  {pillar.icon}
                </svg>
                <h3 className="mt-3 text-body font-semibold">{pillar.title}</h3>
                <p className="mt-1 text-label leading-relaxed text-on-brand/75">{pillar.body}</p>
              </li>
            ))}
          </ul>

          {/*
            Structural facts, not counters. A hardcoded test count would go
            stale the next time anyone adds one, and a stale number on the
            sign-in page is the first thing that erodes trust in the rest.
          */}
          <dl className="mt-8 grid grid-cols-3 gap-3 rounded-lg border border-on-brand/15 bg-on-brand/10 p-4">
            {[
              { value: 'L0-L4', label: 'autonomy levels' },
              { value: 'WCAG AA', label: 'enforced in CI' },
              { value: '<50ms', label: 'latency budget' },
            ].map((stat) => (
              <div key={stat.label}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="tnum block text-xl font-semibold">{stat.value}</span>
                  <span className="mt-0.5 block text-label text-on-brand/70">{stat.label}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
