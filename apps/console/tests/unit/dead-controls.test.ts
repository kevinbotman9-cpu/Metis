import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * A control either does something or says why it does not.
 *
 * This product wrote the rule down twice, in prose, in the source:
 *
 *   "An enabled control that does nothing is a promise; a disabled one with a
 *    reason is an absence somebody can plan around."  — app/arbitration
 *   "Disabled with the reason rather than enabled and dead."  — app/agentic
 *
 * and then followed it three times out of eight. The five that drifted —
 * Export PDF, Export JSON, New flow, Version history, Export DIR — were all
 * enabled, all styled like working controls, and all did nothing at all. Every
 * suite was green throughout, because a button with no handler renders
 * perfectly, passes axe, fits its bundle budget and satisfies every assertion
 * anybody had written.
 *
 * So the rule gets a check. A `<Button>` under `app/` must do one of:
 *   - carry an `onClick`, or be a submit, or wrap a link (`asChild`/`href`)
 *   - be `disabled` **and** carry a `title` saying why
 *
 * A conditional handler counts: `onClick={x ? fn : undefined}` is paired with a
 * `disabled={!x}` in the same tag, and both are present or neither is.
 *
 * Stories are excluded. A Storybook page of every button variant is a
 * catalogue, not an interface, and its buttons are meant to be inert.
 */

const APP = resolve(__dirname, '../../app');
const COMPONENTS = resolve(__dirname, '../../components');

function tsxFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.tsx') && !entry.name.includes('.stories.')) found.push(p);
    }
  };
  walk(dir);
  return found;
}

/**
 * A control whose behaviour belongs to the element wrapping it.
 *
 * `<Link href>` makes the button a navigation; Radix's `asChild` — on
 * `Dialog.Close`, `Dialog.Trigger`, `DropdownMenu.Trigger` — merges the
 * parent's handler onto the child. In both cases the button carries no
 * `onClick` of its own and is correct. Matched on the tag immediately
 * preceding, so an unrelated `<Link>` earlier in the file cannot excuse one.
 */
const WRAPPED = /(?:<Link\b[^>]*>|\basChild\b[^>]*>)\s*$/;

/** Every `<Button ...>` opening tag in a file, with the line it starts on. */
function buttonTags(
  source: string
): { tag: string; line: number; label: string; wrapped: boolean }[] {
  const out: { tag: string; line: number; label: string; wrapped: boolean }[] = [];
  const re = /<Button\b[\s\S]*?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const after = source.slice(m.index + m[0].length, m.index + m[0].length + 120);
    out.push({
      tag: m[0],
      line: source.slice(0, m.index).split('\n').length,
      label: (after.split('<')[0] ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || '(no text)',
      wrapped: WRAPPED.test(source.slice(0, m.index)),
    });
  }
  return out;
}

function isWired(tag: string): boolean {
  return (
    /\bonClick=/.test(tag) ||
    /\btype="submit"/.test(tag) ||
    /\basChild\b/.test(tag) ||
    /\bhref=/.test(tag)
  );
}

function explainsItself(tag: string): boolean {
  return /\bdisabled\b/.test(tag) && /\btitle=/.test(tag);
}

describe('a control does something, or says why it does not', () => {
  const files = [...tsxFiles(APP), ...tsxFiles(COMPONENTS)];

  it('finds the screens it is checking', () => {
    // Without this, a moved app directory makes the assertion below pass by
    // scanning nothing — the failure mode that let the original defect live.
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no enabled button with nothing behind it', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { tag, line, label, wrapped } of buttonTags(source)) {
        if (wrapped || isWired(tag) || explainsItself(tag)) continue;
        offenders.push(`${file.replace(/\\/g, '/').split('/apps/console/')[1]}:${line} — ${label}`);
      }
    }
    expect(offenders, 'enabled controls with no handler and no stated reason').toEqual([]);
  });

  it('gives every disabled control a reason a person can read', () => {
    // `title` is what this product already uses for the reason, on /agentic and
    // /arbitration. It is a weak surface — a disabled button is not focusable,
    // so a keyboard user never reaches the tooltip — and it is the convention,
    // so this holds the convention rather than inventing a second one. The
    // accessibility limit is registered as W-055.
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { tag, line, label, wrapped } of buttonTags(source)) {
        // A control disabled by a runtime condition explains itself with a
        // conditional title; one disabled outright must state a reason.
        if (wrapped) continue;
        if (!/\bdisabled\b/.test(tag)) continue;
        if (/\btitle=/.test(tag)) continue;
        // `disabled={pending}` on a control that is otherwise wired is a busy
        // state, not an absence, and needs no reason.
        if (/\bdisabled=\{/.test(tag) && isWired(tag)) continue;
        missing.push(`${file.replace(/\\/g, '/').split('/apps/console/')[1]}:${line} — ${label}`);
      }
    }
    expect(missing, 'disabled controls with no stated reason').toEqual([]);
  });
});
