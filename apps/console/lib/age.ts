/**
 * How much older one moment is than another, in the unit a person would use.
 *
 * The trace said a cached value was *"77023s older than this decision"* — the
 * right number, in a unit nobody reads past a minute. Seconds up to a minute and
 * a half, then minutes, hours and days, rounded: the age of a cached value is
 * read to judge whether it was stale, and "21 h" answers that where "77023s"
 * makes the reader do arithmetic first.
 */
export function ageInWords(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s`;
  const minutes = Math.round(s / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = Math.round(s / 3600);
  if (hours < 36) return `${hours} h`;
  const days = Math.round(s / 86400);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
