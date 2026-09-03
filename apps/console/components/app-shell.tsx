'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { Button } from './ui/button';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-base-100">
      {/* Left Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } border-r border-base-300 bg-base-100 transition-all duration-300 overflow-hidden`}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="border-b border-base-300 px-6 py-4">
            <h1 className="text-lg font-bold text-base-900">METIS</h1>
            <p className="text-xs text-base-600">Decision Platform</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-1">
              <NavLink href="/strategies" icon="📋">
                Strategies
              </NavLink>
              <NavLink href="/decisions" icon="🎯">
                Decisions
              </NavLink>
              <NavLink href="/approvals" icon="✓">
                Approvals
              </NavLink>
              <NavLink href="/audit" icon="📊">
                Audit Log
              </NavLink>
            </div>

            <div className="mt-8 border-t border-base-300 pt-4">
              <p className="px-2 text-xs font-semibold text-base-600">Admin</p>
              <div className="mt-2 space-y-1">
                <NavLink href="/settings" icon="⚙️">
                  Settings
                </NavLink>
                <NavLink href="/themes" icon="🎨">
                  Themes
                </NavLink>
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-base-300 px-3 py-4">
            <p className="text-xs text-base-600">Phase U1</p>
            <p className="text-xs text-base-500">Foundation</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="border-b border-base-300 bg-base-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded p-2 hover:bg-base-200 transition-colors"
              aria-label="Toggle sidebar"
            >
              ☰
            </button>
            <h2 className="text-lg font-semibold text-base-900">Console</h2>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-base-600">telco-uk</span>
            <Button size="sm" variant="ghost">
              👤 User
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  icon: string;
  children: ReactNode;
}

function NavLink({ href, icon, children }: NavLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded px-3 py-2 text-sm text-base-700 hover:bg-base-200 transition-colors"
    >
      <span>{icon}</span>
      <span>{children}</span>
    </Link>
  );
}
