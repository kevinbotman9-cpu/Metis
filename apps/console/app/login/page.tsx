'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/primitives';

/** Demo accounts, surfaced so the mock environment is actually usable. */
const DEMO_ACCOUNTS = [
  {
    email: 'sarah.chen@telco.example',
    name: 'Sarah Chen',
    role: 'Decision Architect / Marketer',
    can: 'Author propositions and strategies, request changes',
  },
  {
    email: 'priya.natarajan@telco.example',
    name: 'Priya Natarajan',
    role: 'Compliance Officer',
    can: 'Approve changes, edit policies and autonomy. Cannot author offers',
  },
  {
    email: 'marcus.webb@telco.example',
    name: 'Marcus Webb',
    role: 'Administrator',
    can: 'Everything, including arbitration weights and settings',
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

  // Already signed in — skip the form.
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
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Sign-in */}
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold tracking-tight text-content">METIS</span>
              <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-content-subtle">
                Console
              </span>
            </div>
            <p className="mt-2 text-body text-content-muted">
              Sign in to author propositions, inspect decisions and approve changes.
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
              <p role="alert" className="rounded border border-block/40 bg-block-subtle px-3 py-2 text-body text-block">
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
        </div>

        {/* Demo accounts */}
        <div className="rounded-lg border border-border bg-surface-sunken p-6">
          <h2 className="text-body font-semibold text-content">Demo accounts</h2>
          <p className="mt-1 text-label text-content-muted">
            Roles differ, so the navigation and available actions change with the account.
            Select one to fill the form.
          </p>

          <ul className="mt-4 space-y-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <li key={acct.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword('demo');
                  }}
                  className="w-full rounded border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-subtle"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-body font-medium text-content">{acct.name}</span>
                    <span className="text-label text-accent">{acct.role}</span>
                  </div>
                  <p className="mt-0.5 font-mono text-label text-content-muted">{acct.email}</p>
                  <p className="mt-1 text-label text-content-muted">{acct.can}</p>
                </button>
              </li>
            ))}
          </ul>
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
