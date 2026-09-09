/**
 * Typed on the shape it reads rather than on `Creative`.
 *
 * The generated client's `Creative` and the domain's are structurally the same
 * and nominally different, and this function needs neither — it needs an object
 * with a content bag. Taking the narrow thing keeps both callers working
 * without a cast at either call site.
 */

/**
 * The one line that identifies a creative, whatever its channel calls it.
 *
 * A content library lists five shapes side by side, and each keeps its headline
 * under a different key: an email has a subject, a web creative a headline, a
 * push a title, an SMS only its text, a call script only the script. Showing
 * "the first string" would surface a from-address or a sender id, and showing
 * nothing would make the list a column of names nobody chose carefully.
 *
 * Order matters: the keys are tried most-specific first, so a shape that has
 * both a title and a body shows the title.
 */
const HEADLINE_KEYS = ['subject', 'headline', 'title', 'text', 'script'] as const;

export function summariseCreative(creative: { content?: unknown }): string {
  const content = creative.content as Record<string, unknown> | undefined;
  if (!content || typeof content !== 'object') return '—';

  for (const key of HEADLINE_KEYS) {
    const value = content[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // An em dash rather than an empty cell: "this has no line to show" and "this
  // failed to load" should not look the same.
  return '—';
}
