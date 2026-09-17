import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execute, replay } from '../src/deterministic/engine';
import type { CatalogueSnapshot, DecisionRequest, DeterministicDecision, ExecArtifact } from '../src/deterministic/types';

/**
 * `contactsRead` in the hashed decision. ADR-021 §5.
 *
 * Driven from the conformance corpus both engines are held to, so these
 * properties are about the same decisions the Kotlin engine must reproduce.
 */

const CORPUS = path.resolve(__dirname, '../../../docs/conformance/decision-corpus.json');
type Case = {
  name: string;
  artifact: ExecArtifact;
  catalogue: CatalogueSnapshot;
  request: DecisionRequest;
  expected: { id: string; chainHash: string; decision: DeterministicDecision };
};
const cases: Case[] = JSON.parse(fs.readFileSync(CORPUS, 'utf8')).cases;
const named = (name: string) => {
  const c = cases.find((x) => x.name === name);
  if (!c) throw new Error(`no corpus case "${name}"`);
  return c;
};

const BREACH = 'contacts read from the ledger add to the caller’s and breach the cap';
const NONE = 'a read that found no contacts is recorded, and nothing is suppressed';

describe('contacts the platform read', () => {
  it('replays against the counts in the record, without being handed them', () => {
    const c = named(BREACH);
    const record = { id: c.expected.id, chainHash: c.expected.chainHash, decision: c.expected.decision } as never;
    // No contactsRead supplied: replay takes it from the record.
    const result = replay(c.artifact, c.catalogue, record, c.request.input, c.request.contactHistory);
    expect(result.identical).toBe(true);
  });

  it('depends on those recorded counts: a record claiming fewer contacts no longer replays', () => {
    const c = named(BREACH);
    const altered = {
      ...c.expected.decision,
      contactsRead: { status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } },
    } as DeterministicDecision;
    const record = { id: c.expected.id, chainHash: c.expected.chainHash, decision: altered } as never;
    const result = replay(c.artifact, c.catalogue, record, c.request.input, c.request.contactHistory);
    expect(result.identical).toBe(false);
    expect(result.differences.map((d) => d.path)).toContain('$.winner');
  });

  it('keeps "not read" and "read, found none" apart, in the record and in the id', () => {
    const c = named(NONE);
    const read = execute(c.artifact, c.catalogue, c.request);
    const { contactsRead: _, ...notRead } = c.request;
    const unread = execute(c.artifact, c.catalogue, notRead as DecisionRequest);

    expect(read.decision.contactsRead).toEqual({ status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0 } });
    // Absent, not null: a decision that never read keeps the identity it had
    // before the field existed.
    expect('contactsRead' in unread.decision).toBe(false);
    expect(read.id).not.toBe(unread.id);
    // And they decided alike: the difference is what was known, not what won.
    expect(read.decision.winner).toBe(unread.decision.winner);
  });

  it('refuses counts read for another channel, and counts that are not counts', () => {
    const c = named(NONE);
    expect(() =>
      execute(c.artifact, c.catalogue, {
        ...c.request,
        contactsRead: { status: 'read', channel: 'email', withinPeriod: { day: 0, week: 0, month: 0 } },
      })
    ).toThrow(/describes channel "email" and the decision is on "web"/);
    expect(() =>
      execute(c.artifact, c.catalogue, {
        ...c.request,
        contactsRead: { status: 'read', channel: 'web', withinPeriod: { day: -1, week: 0, month: 0 } },
      })
    ).toThrow(/withinPeriod.day must be a whole number/);
  });

  describe('a cap scoped narrower than the tenant (ADR-021 §9)', () => {
    const SCOPED = 'a cap scoped to an offer counts the contacts about that offer, not the channel’s';

    it('is held to the contacts about its scope, not the channel’s', () => {
      const c = named(SCOPED);
      const made = execute(c.artifact, c.catalogue, c.request);
      const denials = made.decision.eliminations.flatMap((e) => e.denials);
      expect(denials).toContainEqual({ key: 'offer_b', code: 'FREQUENCY_CAP_BREACHED', ruleId: 'cp_offer_b' });
      // Three contacts on the channel, none about offer_c: its cap of one holds.
      expect(denials.find((d) => d.key === 'offer_c')?.code).not.toBe('FREQUENCY_CAP_BREACHED');
    });

    it('refuses a read that leaves a scoped cap without its own count, or names one the channel does not have', () => {
      const c = named(SCOPED);
      const read = c.request.contactsRead as { status: 'read'; channel: string; withinPeriod: never; scoped: Record<string, never> };
      const { cp_offer_c: _, ...missing } = read.scoped;
      expect(() => execute(c.artifact, c.catalogue, { ...c.request, contactsRead: { ...read, scoped: missing } })).toThrow(
        /scoped names \[cp_offer_b\] and the scoped caps on "web" are \[cp_offer_b, cp_offer_c\]/
      );
      const { scoped: __, ...unscoped } = read;
      expect(() => execute(c.artifact, c.catalogue, { ...c.request, contactsRead: unscoped })).toThrow(/scoped caps on "web"/);
      expect(() =>
        execute(c.artifact, c.catalogue, {
          ...c.request,
          contactsRead: { ...read, scoped: { ...read.scoped, cp_nowhere: { day: 0, week: 0, month: 0 } } },
        })
      ).toThrow(/cp_nowhere/);
    });

    it('replays against the scoped counts in the record', () => {
      const c = named(SCOPED);
      const record = { id: c.expected.id, chainHash: c.expected.chainHash, decision: c.expected.decision } as never;
      expect(replay(c.artifact, c.catalogue, record, c.request.input, c.request.contactHistory).identical).toBe(true);
    });
  });

  it('records exactly its declared fields, whatever else a resolver carried along', () => {
    const c = named(NONE);
    const noisy = execute(c.artifact, c.catalogue, {
      ...c.request,
      contactsRead: { status: 'read', channel: 'web', withinPeriod: { day: 0, week: 0, month: 0, year: 9 }, source: 'x' } as never,
    });
    expect(noisy.id).toBe(c.expected.id);
  });
});
