'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useAuth } from './auth-provider';
import { useTheme } from './theme-provider';
import { Notifications } from './notifications';
import { CommandPalette, useCommandPalette } from './command-palette';

interface NavItem {
  href: string;
  label: string;
  /** Permission required to see this item at all. */
  permission?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Home' }],
  },
  {
    label: 'Offers',
    items: [
      { href: '/propositions', label: 'Propositions', permission: 'view:propositions' },
      { href: '/engagement-policies', label: 'Engagement Policies' },
      { href: '/contact-policy', label: 'Contact Policy' },
      { href: '/arbitration', label: 'Arbitration & Levers' },
    ],
  },
  {
    label: 'Decisioning',
    items: [
      { href: '/strategies', label: 'Strategies', permission: 'view:strategies' },
      { href: '/decisions', label: 'Decisions', permission: 'view:decisions' },
      { href: '/simulations', label: 'Simulations' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/approvals', label: 'Approvals' },
      { href: '/agentic', label: 'Agentic AI' },
      { href: '/audit', label: 'Audit Log', permission: 'view:audit' },
    ],
  },
  {
    label: 'Admin',
    items: [{ href: '/settings', label: 'Settings' }],
  },
];

/**
 * Which environment this console is pointed at.
 *
 * Not decoration. On a platform where publishing a strategy changes what real
 * customers are offered, mistaking one environment for another is the expensive
 * mistake, so it is stated permanently rather than inferred from the hostname.
 */
const ENV_LABEL = process.env.NEXT_PUBLIC_ENV_LABEL ?? 'Development';
const ENV_IS_LIVE = ENV_LABEL.toLowerCase() === 'production';

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hasPermission } = useAuth();
  const { colorScheme, density, setColorScheme, setDensity } = useTheme();
  const palette = useCommandPalette();

  // A panel opened from the keyboard has to be closeable from the keyboard.
  useEffect(() => {
    if (!menuOpen && !tenantOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      setTenantOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, tenantOpen]);

  // Panels are page-scoped; leaving the page should not leave them hanging.
  useEffect(() => {
    setMenuOpen(false);
    setTenantOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push('/login');
  }

  const initials =
    user?.name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2) ?? '?';

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-chrome">
      {/*
        WCAG 2.4.1. Between the band and the sidebar there are around sixteen
        tab stops before the content starts, on every page. axe passes this
        rule on the strength of the <main> landmark alone, so nothing in the
        suite was going to tell us: the E2E test below it is the check.
      */}
      {/*
        Every visual utility is scoped to :focus. `sr-only` zeroes padding, but
        a bare `px-3` wins the cascade and leaves a 24px-wide invisible target
        sitting in the corner.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-body focus:font-medium focus:text-on-accent"
      >
        Skip to content
      </a>

      {/*
        One band across the whole top, above the sidebar rather than beside it.
        Spanning the full width gives the product a frame, and gives the tools
        that apply everywhere — search, notifications, tenant, environment — a
        home that is not a page.
      */}
      <header
        data-header-band
        className="flex h-14 shrink-0 items-center gap-2 border-b border-header-border bg-gradient-to-r from-header-from via-header-via to-header-to px-3 text-on-header"
      >
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-on-header/15"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
        </button>

        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-md px-1 py-1 hover:bg-on-header/10"
        >
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded bg-on-header/15"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" strokeLinejoin="round" />
              <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-base font-semibold tracking-tight">METIS</span>
        </Link>

        <span
          className={cn(
            'hidden shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] sm:inline-block',
            ENV_IS_LIVE ? 'border-on-header bg-on-header/25' : 'border-on-header/40'
          )}
        >
          {ENV_LABEL}
        </span>

        {/* Search takes the centre: it is the shortest path to anything. */}
        <button
          onClick={() => palette.setOpen(true)}
          className="mx-auto hidden w-full max-w-md items-center gap-2 rounded-md border border-on-header/25 bg-on-header/10 px-3 py-1.5 text-label transition-colors hover:border-on-header/50 hover:bg-on-header/20 md:flex"
        >
          <span aria-hidden>⌕</span>
          <span>Search propositions, strategies, decisions…</span>
          <kbd className="ml-auto rounded border border-on-header/30 px-1.5 py-0.5 font-mono text-[0.625rem]">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
          <button
            onClick={() => palette.setOpen(true)}
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-on-header/15 md:hidden"
          >
            <span aria-hidden>⌕</span>
          </button>

          {/*
            Tenant switcher. Multi-tenancy runs through the domain model and
            every API path; which tenant you are editing matters as much as
            which environment, so it is stated rather than buried in settings.
          */}
          <div className="relative">
            <button
              onClick={() => setTenantOpen((v) => !v)}
              aria-expanded={tenantOpen}
              aria-controls="tenant-panel"
              className="flex items-center gap-1.5 rounded-md border border-on-header/25 bg-on-header/10 px-2.5 py-1 text-label font-medium transition-colors hover:bg-on-header/20"
            >
              {user?.tenantId ?? 'no tenant'}
              <span aria-hidden className="text-[0.5rem]">
                ▼
              </span>
            </button>

            {tenantOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTenantOpen(false)} aria-hidden />
                <div
                  id="tenant-panel"
                  className="absolute right-0 z-30 mt-2 w-60 rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
                >
                  <p className="px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
                    Tenant
                  </p>
                  <p className="flex items-center justify-between rounded px-3 py-1.5 text-body text-content">
                    {user?.tenantId ?? 'no tenant'}
                    <span aria-hidden className="text-pass">
                      ✓
                    </span>
                  </p>
                  <p className="mt-1 border-t border-border px-3 py-2 text-label text-content-muted">
                    Only one tenant is provisioned in this environment.
                  </p>
                </div>
              </>
            ) : null}
          </div>

          <Notifications />

          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="account-panel"
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-body transition-colors hover:bg-on-header/15"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-on-header/20 text-[0.625rem] font-semibold">
                {initials}
              </span>
              <span className="hidden sm:inline">{user?.name ?? 'Signed out'}</span>
            </button>

            {menuOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} aria-hidden />
                <div
                  id="account-panel"
                  className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
                >
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="text-body font-medium text-content">{user?.name}</p>
                    <p className="text-label text-content-muted">{user?.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {user?.roles.map((r) => (
                        <span
                          key={r}
                          className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] text-content-muted"
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/*
                    Appearance moved off the band and into here. It is a choice
                    people make once, and it was taking space from the tools
                    they use constantly.
                  */}
                  <div className="border-b border-border px-3 py-2.5">
                    <p className="mb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
                      Appearance
                    </p>
                    <div className="flex gap-1.5">
                      <div
                        className="flex flex-1 rounded-md border border-border p-0.5"
                        role="group"
                        aria-label="Colour scheme"
                      >
                        {(['light', 'dark'] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setColorScheme(s)}
                            aria-pressed={colorScheme === s}
                            className={cn(
                              'flex-1 rounded px-2 py-1 text-label font-medium capitalize transition-colors',
                              colorScheme === s
                                ? 'bg-accent text-on-accent'
                                : 'text-content-subtle hover:text-content'
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <div
                        className="flex flex-1 rounded-md border border-border p-0.5"
                        role="group"
                        aria-label="Density"
                      >
                        {(['compact', 'comfortable'] as const).map((d) => (
                          <button
                            key={d}
                            onClick={() => setDensity(d)}
                            aria-pressed={density === d}
                            className={cn(
                              'flex-1 rounded px-2 py-1 text-label font-medium capitalize transition-colors',
                              density === d
                                ? 'bg-accent text-on-accent'
                                : 'text-content-subtle hover:text-content'
                            )}
                          >
                            {d === 'comfortable' ? 'comfy' : d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="mt-1 w-full rounded px-3 py-1.5 text-left text-body text-content hover:bg-surface-sunken"
                  >
                    Sign out
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/*
          Unmounted rather than clipped when collapsed. A zero-width parent with
          overflow hidden still leaves its links in the tab order, so the
          keyboard path walked through a sidebar nobody could see.
        */}
        <aside className={cn('w-60 shrink-0 flex-col bg-chrome', sidebarOpen ? 'flex' : 'hidden')}>
          <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Main">
            {NAV.map((section) => {
              const visible = section.items.filter(
                (item) => !item.permission || hasPermission(item.permission)
              );
              if (visible.length === 0) return null;

              return (
                <div key={section.label} className="mb-4">
                  <p className="px-3 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
                    {section.label}
                  </p>
                  <ul className="space-y-0.5">
                    {visible.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={isActive(item.href) ? 'page' : undefined}
                          className={cn(
                            'relative block rounded-md px-3 py-1.5 text-body transition-colors',
                            isActive(item.href)
                              ? 'bg-accent/10 font-medium text-accent before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-accent'
                              : 'text-content-muted hover:bg-surface/70 hover:text-content'
                          )}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          <div className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-[0.625rem] text-content-subtle">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pass" />
              Fixture data
            </p>
          </div>
        </aside>

        <main
          id="main"
          tabIndex={-1}
          className="min-w-0 flex-1 overflow-y-auto rounded-tl-xl border-l border-t border-border bg-page outline-none"
        >
          {children}
        </main>
      </div>

      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} />
    </div>
  );
}
