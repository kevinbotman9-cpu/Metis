import { describe, it, expect } from 'vitest';
import { defaultPersona, overviewPersonas, personaStorageKey, resolvePersona } from '@/lib/persona';

/**
 * Which Overview a person lands on. The reasons are in `lib/persona.ts`; these
 * pin the seeded tenant's four accounts, because each one is a different case.
 */

const SARAH = ['architect', 'marketer'] as const;
const MARCUS = ['admin', 'architect'] as const;
const PRIYA = ['compliance'] as const;
const OLIVER = ['operator'] as const;

describe('which Overviews an account may see', () => {
  it('follows the personas it holds, and admin sees both, as it does in the nav', () => {
    expect(overviewPersonas([...SARAH])).toEqual(['marketer', 'architect']);
    expect(overviewPersonas([...MARCUS])).toEqual(['marketer', 'architect']);
    expect(overviewPersonas(['admin'])).toEqual(['marketer', 'architect']);
    expect(overviewPersonas(['architect'])).toEqual(['architect']);
  });

  it('gives an account with neither persona none, so it gets the loop and no switch', () => {
    expect(overviewPersonas([...PRIYA])).toEqual([]);
    expect(overviewPersonas([...OLIVER])).toEqual([]);
  });
});

describe('where an account lands before it has chosen', () => {
  it('lands everyone who can see the loop on it, and an architect who cannot on the pipeline', () => {
    // Sarah is a marketer as well as an architect: her landing page is the loop.
    expect(defaultPersona([...SARAH])).toBe('marketer');
    // Marcus is an administrator and an architect. He landed on the pipeline
    // until 2026-09-18, when the loop became the landing view for anyone who
    // can see it.
    expect(defaultPersona([...MARCUS])).toBe('marketer');
    expect(defaultPersona(['architect'])).toBe('architect');
  });

  it('lands an administrator with neither persona on the loop, and a compliance officer on nothing', () => {
    expect(defaultPersona(['admin'])).toBe('marketer');
    expect(defaultPersona([...PRIYA])).toBeNull();
  });
});

describe('a stored choice', () => {
  it('wins while the account may still make it', () => {
    expect(resolvePersona([...SARAH], 'architect')).toBe('architect');
    expect(resolvePersona([...MARCUS], 'marketer')).toBe('marketer');
  });

  it('falls back to the default when it is not a choice this account has, or not a choice at all', () => {
    expect(resolvePersona(['architect'], 'marketer')).toBe('architect');
    expect(resolvePersona([...PRIYA], 'architect')).toBeNull();
    expect(resolvePersona([...SARAH], 'nonsense')).toBe('marketer');
    expect(resolvePersona([...SARAH], null)).toBe('marketer');
  });

  it('is kept per person, so two people sharing a browser do not share a choice', () => {
    expect(personaStorageKey('u_sarah')).not.toBe(personaStorageKey('u_marcus'));
  });
});
