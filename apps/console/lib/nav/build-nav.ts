import type { Role } from '@/components/auth-provider';
import type { GroupIcon, GroupNode, ScreenNode, SectionNode } from './persona-manifest';

/**
 * The join: persona manifest × existing routes × the signed-in user.
 *
 * Pure, so it can be tested in node and rendered in Storybook without a
 * router or a session. The shell calls it with the real user and the generated
 * route list; the stories call it with fixture users and the same route list,
 * so what Storybook shows is what the rail shows.
 *
 * Rules, in the order they are applied:
 *
 * 1. A screen is present only if its route exists. A manifest entry with no
 *    page.tsx is a plan, and plans do not go in the rail.
 * 2. A screen with a `permission` is present only if the user holds it.
 * 3. A section is present if it is itself a present screen, or if any child
 *    is. A heading with nothing under it is not shown as an empty heading.
 * 4. A group is present if the user holds one of its personas, and only if
 *    something inside survived rules 1–3. Hidden, not disabled: a group you
 *    cannot use is not a thing you should be looking at.
 * 5. A group whose persona the user does not hold is still present if they
 *    hold a permission on a screen inside it — but then it shows *only* the
 *    screens they are permitted, not the group's whole surface. The spec tags
 *    Catalogue as the marketer's group; a compliance officer with `view:offers`
 *    gets Offers and Creatives there, and nothing else. A permission granted
 *    on a screen is a stronger statement than a persona tag, and a rail that
 *    hid a screen someone has explicitly been allowed to see would be
 *    enforcing the weaker rule over the stronger one.
 * 6. `admin` passes every persona gate. Screens still need their permission,
 *    so this widens what an administrator can see to what exists, not what
 *    they can do.
 */

export interface NavUser {
  roles: readonly string[];
  permissions: readonly string[];
}

export interface NavScreen {
  label: string;
  href: string;
  badge?: 'approvals';
  children: NavScreen[];
}

export interface NavSection {
  label: string;
  /** Present when the section is a screen in its own right. */
  href?: string;
  badge?: 'approvals';
  children: NavScreen[];
}

export interface NavGroup {
  label: string;
  icon: GroupIcon;
  children: NavSection[];
}

/**
 * How the user got into a group. Through its persona, every screen without a
 * permission is theirs; through a permission alone, only the permitted ones.
 */
type Admission = 'persona' | 'permission';

const allowed = (node: { permission?: string }, user: NavUser, by: Admission) =>
  node.permission ? user.permissions.includes(node.permission) : by === 'persona';

interface Ctx {
  routes: ReadonlySet<string>;
  user: NavUser;
  by: Admission;
}

function screen(node: ScreenNode, ctx: Ctx): NavScreen | null {
  if (!ctx.routes.has(node.href) || !allowed(node, ctx.user, ctx.by)) return null;
  const children = (node.children ?? [])
    .map((c) => screen(c, ctx))
    .filter((c): c is NavScreen => c !== null);
  return { label: node.label, href: node.href, badge: node.badge, children };
}

function section(node: SectionNode, ctx: Ctx): NavSection | null {
  if (node.href !== undefined) {
    // A section that is a screen. If the parent route is absent or refused,
    // its children do not appear either: there is nothing to hang them on.
    const self = screen(node, ctx);
    return self ? { label: self.label, href: self.href, badge: self.badge, children: self.children } : null;
  }
  const children = node.children
    .map((c) => screen(c, ctx))
    .filter((c): c is NavScreen => c !== null);
  return children.length ? { label: node.label, children } : null;
}

/** Every permission named anywhere under a node. */
function permissionsWithin(node: SectionNode | ScreenNode): string[] {
  const own = 'permission' in node && node.permission ? [node.permission] : [];
  return own.concat((node.children ?? []).flatMap(permissionsWithin));
}

function admission(group: GroupNode, user: NavUser): Admission | null {
  if (group.personas === 'all') return 'persona';
  if (user.roles.includes('admin')) return 'persona';
  if (group.personas.some((p: Role) => user.roles.includes(p))) return 'persona';
  if (group.children.flatMap(permissionsWithin).some((p) => user.permissions.includes(p))) {
    return 'permission';
  }
  return null;
}

export function buildNav(
  manifest: readonly GroupNode[],
  routes: readonly string[],
  user: NavUser
): NavGroup[] {
  const present = new Set(routes);
  const out: NavGroup[] = [];

  for (const group of manifest) {
    const by = admission(group, user);
    if (!by) continue;
    const children = group.children
      .map((s) => section(s, { routes: present, user, by }))
      .filter((s): s is NavSection => s !== null);
    if (children.length === 0) continue;
    out.push({ label: group.label, icon: group.icon, children });
  }

  return out;
}

/** The first destination inside a group — where its icon goes when the rail is collapsed. */
export function firstHref(group: NavGroup): string {
  for (const s of group.children) {
    if (s.href) return s.href;
    if (s.children[0]) return s.children[0].href;
  }
  // Unreachable: buildNav drops a group with nothing inside it.
  return '/';
}

/**
 * Which group the current path lives in.
 *
 * Longest matching href wins, so `/decision-flows/versions` resolves to the
 * group holding that screen rather than to whichever group's `/` matched
 * first. `/` itself matches only exactly.
 */
export function activeGroup(nav: readonly NavGroup[], pathname: string): string | null {
  let best: { label: string; length: number } | null = null;

  const visit = (href: string, label: string) => {
    const hit = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
    if (hit && (!best || href.length > best.length)) best = { label, length: href.length };
  };

  for (const g of nav) {
    for (const s of g.children) {
      if (s.href) visit(s.href, g.label);
      for (const c of s.children) {
        visit(c.href, g.label);
        for (const gc of c.children) visit(gc.href, g.label);
      }
    }
  }
  return best ? (best as { label: string }).label : null;
}
