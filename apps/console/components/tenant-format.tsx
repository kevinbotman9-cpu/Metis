'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { formatterFor, type FormatSettings, type Formatter } from '@/lib/format';
import { ErrorState, LoadingState } from './ui/primitives';

/**
 * The tenant's formatter, for every screen. G-092.
 *
 * `RequireAuth` mounts this around the shell, so any component under a signed-in
 * route can call `useFormat()`. It renders nothing formatted until the tenant's
 * settings have loaded: the alternative is formatting in some default first and
 * the tenant's locale a moment later, and a default nobody chose is exactly the
 * bug this replaces.
 */

const FormatContext = createContext<Formatter | null>(null);

/** Shared with the settings screen, so saving invalidates what every formatter reads. */
export const TENANT_SETTINGS_KEY = ['tenant-settings'] as const;

export function useTenantSettings() {
  return useQuery({ queryKey: TENANT_SETTINGS_KEY, queryFn: () => apiClient.getTenantSettings() });
}

export function TenantFormatProvider({ children }: { children: ReactNode }) {
  const settings = useTenantSettings();
  const formatter = useMemo(
    () => (settings.data ? formatterFor(settings.data) : null),
    [settings.data]
  );

  if (!formatter) {
    return settings.isError ? (
      <div className="flex h-screen items-center justify-center bg-page">
        <ErrorState
          title="Could not load this tenant's settings"
          description="Dates, numbers and amounts are formatted in the tenant's locale, so nothing is shown until it is known."
          onRetry={() => void settings.refetch()}
        />
      </div>
    ) : (
      <div className="flex h-screen items-center justify-center bg-page">
        <LoadingState label="Loading tenant settings" />
      </div>
    );
  }

  return <FormatContext.Provider value={formatter}>{children}</FormatContext.Provider>;
}

/**
 * A fixed formatter, for Storybook and tests, where there is no tenant to ask.
 * Never used under a real route.
 */
export function StaticFormatProvider({
  settings,
  children,
}: {
  settings: FormatSettings;
  children: ReactNode;
}) {
  const formatter = useMemo(() => formatterFor(settings), [settings]);
  return <FormatContext.Provider value={formatter}>{children}</FormatContext.Provider>;
}

/** The tenant's formatter. Throws outside a provider rather than guessing a locale. */
export function useFormat(): Formatter {
  const formatter = useContext(FormatContext);
  if (!formatter) {
    throw new Error(
      'useFormat() was called outside TenantFormatProvider. Every signed-in route has one through RequireAuth; a story or test needs StaticFormatProvider.'
    );
  }
  return formatter;
}
