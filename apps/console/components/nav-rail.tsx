'use client';

import { type ComponentType, type ReactNode, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { activeGroup, firstHref, type NavGroup, type NavScreen, type NavSection } from '@/lib/nav/build-nav';
import type { GroupIcon as GroupIconName } from '@/lib/nav/persona-manifest';

/**
 * The rail: three levels, one open group, a guide rule for depth.
 *
 * Presentational on purpose. It takes the tree `buildNav` produced and the
 * current path, and knows nothing about sessions, routers or queries — which
 * is what lets Storybook render every persona's rail without a server, and
 * what makes "the story is what the shell shows" a true statement rather than
 * a hope.
 *
 * Depth is carried by a 1px rule down the open group, not by whitespace: at
 * 12px per level, indentation alone does not read at this density. The active
 * screen takes a 2px bar in the frame's accent rather than a filled block,
 * because filled blocks at three levels make a stripe pattern.
 *
 * The frame is dark in both themes and does not follow the neutral ramp, so
 * the rule is `--rail-line` and the bar is `--rail-accent` — the accent as
 * measured against the frame (6.19:1), where the panel accent reaches 2.05.
 */

export interface LinkProps {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  'aria-current'?: 'page';
  'aria-label'?: string;
}

/** Storybook has no router; the shell passes next/link. */
const Anchor: ComponentType<LinkProps> = ({ href, children, ...rest }) => (
  <a href={href} {...rest}>
    {children}
  </a>
);

export interface NavRailProps {
  nav: readonly NavGroup[];
  pathname: string;
  /** The 48px icon rail. Screens are not rendered, so they leave the tab order. */
  collapsed?: boolean;
  /** Change sets awaiting a person, for the Approvals pill. */
  approvalCount?: number;
  Link?: ComponentType<LinkProps>;
}

export function NavRail({
  nav,
  pathname,
  collapsed = false,
  approvalCount = 0,
  Link = Anchor,
}: NavRailProps) {
  const active = activeGroup(nav, pathname);
  const [open, setOpen] = useState<string | null>(active);
  const ids = useId();

  // Arriving on a page opens its group. A group the person opened by hand
  // stays open until they navigate, at which point the destination wins.
  useEffect(() => {
    setOpen(active);
  }, [active, pathname]);

  const isCurrent = (href: string) => pathname === href;

  if (collapsed) {
    return (
      <nav aria-label="Main" className="flex w-12 flex-col items-center gap-1 py-3">
        {nav.map((group) => {
          const here = group.label === active;
          return (
            <Link
              key={group.label}
              href={firstHref(group)}
              aria-label={group.label}
              title={group.label}
              aria-current={here ? 'page' : undefined}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                here
                  ? 'text-rail-fg before:absolute before:-left-1.5 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-r before:bg-rail-accent'
                  : 'text-rail-muted hover:bg-rail-hover/10 hover:text-rail-fg'
              )}
            >
              <GroupIcon name={group.icon} />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="w-rail overflow-y-auto px-2 py-3">
      <ul className="space-y-0.5">
        {nav.map((group) => {
          const expanded = open === group.label;
          const here = group.label === active;
          const listId = `${ids}-${group.icon}`;

          return (
            <li key={group.label}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setOpen(expanded ? null : group.label)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-label transition-colors',
                  here ? 'text-rail-fg' : 'text-rail-muted hover:bg-rail-hover/10 hover:text-rail-fg'
                )}
              >
                <GroupIcon name={group.icon} />
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <Chevron open={expanded} />
              </button>

              {/*
                Unmounted rather than hidden. A collapsed group's links in the
                tab order would make the keyboard path walk through eleven
                groups to reach one screen.
              */}
              {expanded ? (
                <ul id={listId} className="my-0.5 ml-3 space-y-0.5 border-l border-rail-line">
                  {group.children.map((s) => (
                    <SectionRow
                      key={s.label}
                      section={s}
                      isCurrent={isCurrent}
                      approvalCount={approvalCount}
                      Link={Link}
                    />
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SectionRow({
  section,
  isCurrent,
  approvalCount,
  Link,
}: {
  section: NavSection;
  isCurrent: (href: string) => boolean;
  approvalCount: number;
  Link: ComponentType<LinkProps>;
}) {
  return (
    <li>
      {section.href ? (
        <ScreenLink
          screen={section as NavScreen}
          level={1}
          current={isCurrent(section.href)}
          approvalCount={approvalCount}
          Link={Link}
        />
      ) : (
        <p className="pl-3 pt-1.5 pb-0.5 text-label text-rail-dim">{section.label}</p>
      )}
      {section.children.length ? (
        <ul className="space-y-0.5">
          {section.children.map((c) => (
            <li key={c.href}>
              {/* A section occupies level 1 whether it is a link or a
                  heading, so what sits beneath it is level 2 either way. */}
              <ScreenLink
                screen={c}
                level={2}
                current={isCurrent(c.href)}
                approvalCount={approvalCount}
                Link={Link}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function ScreenLink({
  screen,
  level,
  current,
  approvalCount,
  Link,
}: {
  screen: NavScreen;
  level: 1 | 2;
  current: boolean;
  approvalCount: number;
  Link: ComponentType<LinkProps>;
}) {
  const pending = screen.badge === 'approvals' ? approvalCount : 0;

  return (
    <Link
      href={screen.href}
      aria-current={current ? 'page' : undefined}
      // Composed rather than left to accumulate: the pill would otherwise join
      // the link's name as a bare number.
      aria-label={pending > 0 ? `${screen.label}, ${pending} awaiting approval` : undefined}
      className={cn(
        'relative flex items-center gap-2 rounded-r-md py-1.5 pr-2 text-body transition-colors',
        level === 1 ? 'pl-3' : 'pl-6',
        current
          ? 'font-medium text-rail-fg before:absolute before:-left-px before:top-0 before:h-full before:w-0.5 before:bg-rail-accent'
          : 'text-rail-muted hover:bg-rail-hover/10 hover:text-rail-fg'
      )}
    >
      <span className="min-w-0 flex-1 truncate">{screen.label}</span>
      {pending > 0 ? (
        <span
          aria-hidden
          className="tnum shrink-0 rounded-full bg-rail-attention px-1.5 py-px text-label font-semibold text-rail"
        >
          {pending}
        </span>
      ) : null}
    </Link>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('h-3 w-3 shrink-0 text-rail-dim transition-transform', open && 'rotate-90')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * One glyph per group, at group level only — an icon beside every leaf is
 * noise. Geometric line work at 16px; nothing that needs a legend.
 */
const PATHS: Record<GroupIconName, string> = {
  overview: 'M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z',
  catalogue: 'M3 4h10v2H3zM3 7h10v2H3zM3 10h7v2H3z',
  policy: 'M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4l5-2z',
  decisioning: 'M3 8h3M10 4h3M10 12h3M6 8c2 0 2-4 4-4M6 8c2 0 2 4 4 4',
  intelligence: 'M8 2v2M8 12v2M2 8h2M12 8h2M8 5a3 3 0 100 6 3 3 0 000-6z',
  journeys: 'M2 12c3 0 3-8 6-8s3 8 6 8',
  channels: 'M2 8h3l2-4 2 8 2-4h3',
  simulation: 'M3 13V6M7 13V3M11 13V8M2 13h12',
  evidence: 'M4 2h6l3 3v9H4zM6 8h4M6 11h4',
  releases: 'M3 8l5-5 5 5M8 3v10',
  insights: 'M2 12l4-4 3 3 5-6',
  operations: 'M8 5a3 3 0 100 6 3 3 0 000-6zM8 1v2M8 13v2M1 8h2M13 8h2',
  administration: 'M8 3a2 2 0 100 4 2 2 0 000-4zM3 13c0-3 2-4 5-4s5 1 5 4',
};

function GroupIcon({ name }: { name: GroupIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
