// @vitest-environment jsdom
//
// This one file needs a document. The suite runs in `node` because nothing else
// here touches the DOM, and switching the whole suite for one file would slow
// eighteen others down for no gain.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadJson, evidenceFilename } from '../../lib/download';

/**
 * The evidence export, at the level a unit test can reach.
 *
 * These buttons were enabled and had no handler at all for the life of the
 * screen, which the coherence review found by clicking them. The e2e test in
 * `evidence-export.spec.ts` is the one that proves a file arrives; this one
 * covers the parts a browser download cannot show — the filename a person has
 * to find again, and the bytes being the record rather than a summary of it.
 */

describe('evidenceFilename', () => {
  it('carries the subject and the date, so a filed export is findable later', () => {
    expect(evidenceFilename('decision', 'dec_abc123', '2026-03-14T09:41:07.000Z')).toBe(
      'decision-dec_abc123-2026-03-14.json'
    );
  });

  it('has no colons in it', () => {
    // Windows refuses a filename containing one and the download fails with no
    // error anywhere a person can see, so this is worth a check of its own.
    const name = evidenceFilename('decision', 'dec_x', '2026-03-14T09:41:07.000Z');
    expect(name).not.toContain(':');
  });

  it('says undated rather than inventing a date', () => {
    expect(evidenceFilename('flow', 'nba', 'not a timestamp')).toBe('flow-nba-undated.json');
  });

  it('accepts a Date as well as the ISO string the API returns', () => {
    expect(evidenceFilename('flow', 'nba', new Date('2026-12-01T00:00:00Z'))).toBe(
      'flow-nba-2026-12-01.json'
    );
  });
});

describe('downloadJson', () => {
  let clicked: HTMLAnchorElement | null = null;

  beforeEach(() => {
    clicked = null;
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    // Captured on the way into the document rather than by aliasing `this`
    // inside a click stub: the anchor is appended, clicked and removed in one
    // synchronous run, so this is the only point it can be observed.
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLAnchorElement) clicked = node;
      return node;
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('names the file and marks it as a download', () => {
    downloadJson('decision-dec_1-2026-03-14.json', { id: 'dec_1' });
    expect(clicked).not.toBeNull();
    expect(clicked!.download).toBe('decision-dec_1-2026-03-14.json');
    expect(clicked!.href).toBe('blob:test');
  });

  it('writes the whole record, not a summary of it', () => {
    // The failure this guards against is an export that drops the parts a
    // regulator asks for first. Serialising the object it is handed is the
    // only behaviour that cannot quietly lose a field as the record grows.
    const record = {
      id: 'dec_1',
      chainHash: 'abc',
      eliminations: [{ key: 'x', reason: 'CONSENT_WITHHELD' }],
      scores: { x: { priority: 1.5 } },
    };
    const bytes = downloadJson('x.json', record);
    expect(bytes).toBe(`${JSON.stringify(record, null, 2)}\n`.length);
  });

  it('leaves nothing in the document once the click has happened', () => {
    downloadJson('x.json', {});
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('does not revoke the URL in the same tick', () => {
    // Revoking immediately races the browser's read of the blob, and the
    // symptom is an empty file rather than an error.
    downloadJson('x.json', {});
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
