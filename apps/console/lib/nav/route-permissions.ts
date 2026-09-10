import { PERSONA_MANIFEST, type GroupNode, type ScreenNode, type SectionNode } from './persona-manifest';

/**
 * What a path requires, read off the same manifest the rail is built from.
 *
 * Until 2026-09-10 the manifest's `permission` field gated exactly one thing:
 * whether a link appeared in the navigation rail. `RequireAuth` checked for a
 * session and never looked at permissions, and five of twenty-one routes had
 * hand-written their own guard. So on the other sixteen the link was hidden and
 * the URL was open — `/decisions`, `/decision-flows` and `/performance` each
 * declared a permission that nothing enforced, and a compliance officer who
 * could not be shown the offer catalogue in the rail could read every decision
 * the platform had ever made by typing the address.
 *
 * The fix is not sixteen more guards. A guard a page has to remember to write
 * is a guard some page will not write, and this repository has the evidence:
 * five wrote one, sixteen did not, and nothing failed. Enforcement is derived
 * here and applied once, in `RequireAuth`, so a route cannot opt out of it by
 * omission — only by not being a route.
 *
 * **Longest prefix wins.** A decision trace lives at `/decisions/dec_a1b2` and
 * has no manifest entry of its own; it inherits `view:decisions` from
 * `/decisions`, which is the only reading under which the guard means anything.
 * A detail page is not less sensitive than the list that links to it — it is
 * usually more so. `/` matches only itself, or it would claim every path.
 */

export interface RouteRequirement {
  /** The permission the manifest declares for this path. */
  permission: string;
  /** The screen's own label, for the heading over the refusal. */
  label: string;
}

interface Entry {
  href: string;
  permission: string;
  label: string;
}

function collect(node: SectionNode | ScreenNode, out: Entry[]): void {
  if (node.href !== undefined && 'permission' in node && node.permission) {
    out.push({ href: node.href, permission: node.permission, label: node.label });
  }
  for (const child of node.children ?? []) collect(child, out);
}

function build(manifest: readonly GroupNode[]): Entry[] {
  const out: Entry[] = [];
  for (const group of manifest) for (const section of group.children) collect(section, out);
  // Longest first, so the first match is the most specific one.
  return out.sort((a, b) => b.href.length - a.href.length);
}

const ENTRIES = build(PERSONA_MANIFEST);

/** Exposed for the tests, which check this against the routes that exist. */
export const DECLARED_ROUTE_PERMISSIONS: readonly Entry[] = ENTRIES;

export function requirementFor(pathname: string): RouteRequirement | null {
  for (const entry of ENTRIES) {
    const hit =
      entry.href === '/' ? pathname === '/' : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
    if (hit) return { permission: entry.permission, label: entry.label };
  }
  return null;
}
