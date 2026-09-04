'use client';

import Link from 'next/link';
import { Fragment } from 'react';

export interface Crumb {
  label: string;
  /** Omit on the final crumb: the page you are on is not a link. */
  href?: string;
}

/**
 * Spatial awareness without spending a band of the workspace on it.
 *
 * Sits above the page title in a single line. The last crumb is plain text and
 * carries aria-current, so a screen reader announces where it stops.
 */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-label text-content-subtle">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li>
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="rounded-sm text-content-muted hover:text-accent hover:underline"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined} className="text-content-muted">
                    {item.label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-content-subtle">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
