'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { AuthUserDto } from '@/lib/api-client';

/**
 * Which Overview a person lands on.
 *
 * Two landing pages over one tenant: the marketer's is the loop — what is live,
 * what gets decided for, what reaches anyone, what people do — and the decision
 * architect's is the change pipeline — what is proposed, whether it simulated,
 * what shipped, which flows run, whether a decision replays. Same figures
 * underneath, different jobs. `docs/design/metis-overview-personas.html`.
 *
 * Personas are roles, and accounts hold several: in the seeded tenant Sarah is
 * an architect and a marketer, Marcus an administrator and an architect. So the
 * Overview cannot be picked by role alone. An account that can see more than
 * one gets a switch in the chrome, remembered per person in this browser, and a
 * default that follows what they explicitly are:
 *
 * - explicitly a marketer → the loop;
 * - otherwise explicitly an architect → the change pipeline;
 * - an administrator with neither, who can see both, like the nav → the loop.
 *
 * Anyone with neither persona — compliance, operator, analyst — gets the loop
 * and no switch.
 */

export type OverviewPersona = 'marketer' | 'architect';

type Role = AuthUserDto['roles'][number];

export const PERSONA_LABEL: Record<OverviewPersona, string> = {
  marketer: 'Marketer',
  architect: 'Architect',
};

/** The Overviews an account may see. `admin` passes every persona gate, as it does in the nav. */
export function overviewPersonas(roles: readonly Role[]): OverviewPersona[] {
  const everything = roles.includes('admin');
  const out: OverviewPersona[] = [];
  if (everything || roles.includes('marketer')) out.push('marketer');
  if (everything || roles.includes('architect')) out.push('architect');
  return out;
}

/** Where an account lands before it has chosen, or null when it has neither persona. */
export function defaultPersona(roles: readonly Role[]): OverviewPersona | null {
  if (roles.includes('marketer')) return 'marketer';
  if (roles.includes('architect')) return 'architect';
  return overviewPersonas(roles)[0] ?? null;
}

/** A stored choice, if it is still one this account may make; otherwise the default. */
export function resolvePersona(roles: readonly Role[], stored: string | null): OverviewPersona | null {
  const available = overviewPersonas(roles);
  return available.includes(stored as OverviewPersona) ? (stored as OverviewPersona) : defaultPersona(roles);
}

/** Per person, so two people sharing a browser do not inherit each other's choice. */
export const personaStorageKey = (userId: string) => `metis.overview-persona.${userId}`;

const CHANGED = 'metis:overview-persona';

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * The persona the Overview shows for this user, and a way to change it.
 *
 * One value in storage read by both the switch in the header and the page, so
 * the two cannot disagree — the header sits outside the page's providers, which
 * is why this is a store and not a context.
 */
export function useOverviewPersona(user: Pick<AuthUserDto, 'id' | 'roles'> | null) {
  const key = user ? personaStorageKey(user.id) : null;
  const stored = useSyncExternalStore(
    subscribe,
    () => {
      if (!key) return null;
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null
  );

  const setPersona = useCallback(
    (next: OverviewPersona) => {
      if (!key) return;
      try {
        localStorage.setItem(key, next);
      } catch {
        // Storage refused (a private window, blocked site data): the choice
        // lasts until the page reloads, which is the most that can be offered.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key]
  );

  return {
    persona: user ? resolvePersona(user.roles, stored) : null,
    available: user ? overviewPersonas(user.roles) : [],
    setPersona,
  };
}
