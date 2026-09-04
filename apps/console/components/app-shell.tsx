'use client';

import { type ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useAuth } from './auth-provider';
import { useTheme } from './theme-provider';
import { Button } from './ui/button';

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

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, hasPermission } = useAuth();
  const { colorScheme, density, setColorScheme, setDensity } = useTheme();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function handleLogout() {
    logout();
    setMenuOpen(false);
    router.push('/login');
  }

  return (
    <div className="flex h-screen overflow-hidden bg-page">
      <aside
        className={cn(
          'flex shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200',
          sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b border-border px-4">
          <span className="text-body font-semibold tracking-tight text-content">METIS</span>
          <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-content-subtle">
            Console
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
          {NAV.map((section) => {
            const visible = section.items.filter(
              (item) => !item.permission || hasPermission(item.permission)
            );
            if (visible.length === 0) return null;

            return (
              <div key={section.label} className="mb-4">
                <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-content-subtle">
                  {section.label}
                </p>
                <ul className="space-y-0.5">
                  {visible.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'block rounded px-2 py-1.5 text-body transition-colors',
                          isActive(item.href)
                            ? 'bg-accent-subtle font-medium text-accent'
                            : 'text-content-muted hover:bg-surface-sunken hover:text-content'
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

        <div className="border-t border-border px-3 py-2">
          <p className="text-[0.625rem] text-content-subtle">
            Mock data · MSW · {process.env.NEXT_PUBLIC_USE_MSW === 'true' ? 'on' : 'off'}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-expanded={sidebarOpen}
            >
              <span aria-hidden>☰</span>
            </Button>
            <span className="rounded border border-border px-2 py-0.5 text-label text-content-muted">
              {user?.tenantId ?? 'no tenant'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div
              className="flex items-center rounded border border-border"
              role="group"
              aria-label="Colour scheme"
            >
              {(['light', 'dark'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setColorScheme(s)}
                  aria-pressed={colorScheme === s}
                  className={cn(
                    'px-2 py-1 text-label capitalize transition-colors first:rounded-l last:rounded-r',
                    colorScheme === s
                      ? 'bg-accent text-white'
                      : 'text-content-muted hover:bg-surface-sunken'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            <div
              className="ml-1 flex items-center rounded border border-border"
              role="group"
              aria-label="Density"
            >
              {(['compact', 'comfortable'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  aria-pressed={density === d}
                  className={cn(
                    'px-2 py-1 text-label capitalize transition-colors first:rounded-l last:rounded-r',
                    density === d
                      ? 'bg-accent text-white'
                      : 'text-content-muted hover:bg-surface-sunken'
                  )}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="relative ml-2">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded px-2 py-1 text-body text-content hover:bg-surface-sunken"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[0.625rem] font-semibold text-white">
                  {user?.name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2) ?? '?'}
                </span>
                <span className="hidden sm:inline">{user?.name ?? 'Signed out'}</span>
              </button>

              {menuOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setMenuOpen(false)}
                    aria-hidden
                  />
                  <div
                    role="menu"
                    className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
                  >
                    <div className="border-b border-border px-3 py-2">
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
                    <button
                      role="menuitem"
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

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
