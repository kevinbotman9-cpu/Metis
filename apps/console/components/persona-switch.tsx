'use client';

import { useAuth } from '@/components/auth-provider';
import { PERSONA_LABEL, useOverviewPersona, type OverviewPersona } from '@/lib/persona';
import { cn } from '@/lib/cn';

/**
 * Which Overview this person lands on, for an account that can see more than one.
 *
 * In the chrome rather than on the page, where the persona mockup and the
 * specification's demo path both put it, and absent for an account with one
 * Overview or none: a switch with one position is a control that does nothing.
 * The choice is remembered per person in this browser (`lib/persona.ts`).
 */
export function PersonaSwitch() {
  const { user } = useAuth();
  const { persona, available, setPersona } = useOverviewPersona(user);
  return <PersonaSwitchControl available={available} persona={persona} onChange={setPersona} />;
}

/** The control alone, without a session behind it — what the story renders. */
export function PersonaSwitchControl({
  available,
  persona,
  onChange,
}: {
  available: readonly OverviewPersona[];
  persona: OverviewPersona | null;
  onChange: (next: OverviewPersona) => void;
}) {
  if (available.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Overview persona"
      className="hidden items-center gap-0.5 rounded-md border border-on-header/25 bg-on-header/10 p-0.5 sm:flex"
    >
      {available.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={persona === p}
          onClick={() => onChange(p)}
          className={cn(
            'min-h-6 rounded px-2.5 text-label font-medium transition-colors',
            persona === p ? 'bg-on-header/25' : 'hover:bg-on-header/15'
          )}
        >
          {PERSONA_LABEL[p]}
        </button>
      ))}
    </div>
  );
}
