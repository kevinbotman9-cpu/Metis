/**
 * Volume as thickness, and losses leaving the picture.
 *
 * Two screens draw the same idea: the loop on `/` and `/performance`, where a
 * band narrows from stage to stage and what left peels away beneath it, and the
 * canvas, where an edge is as thick as the candidates that crossed it. They are
 * different diagrams — a funnel has a fixed spine, a graph does not — so they
 * share this rather than a component: one scale that turns a count into a
 * thickness, and one ribbon that joins two thicknesses with a curve.
 *
 * One scale, because two would disagree. A decision count drawn 12px thick on
 * one screen and 20px on the other invites a comparison the numbers do not
 * support, and nobody would notice the scales had drifted until somebody did.
 */

/** Turns a count into a thickness, in the drawing's own units. */
export type VolumeScale = (volume: number) => number;

/**
 * Linear, with a floor.
 *
 * Linear because thickness is read as quantity: a band twice as thick has to
 * carry twice the volume, and a square-root or log scale would make a loss look
 * smaller than it is — the one thing these diagrams exist to show. The floor
 * keeps a trickle visible; it is the only place the scale is not proportional,
 * and it applies only below `minThickness`.
 */
export function volumeScale(maxVolume: number, maxThickness: number, minThickness = 1.5): VolumeScale {
  const max = Math.max(1, maxVolume);
  return (volume) => Math.max(minThickness, (Math.max(0, volume) / max) * maxThickness);
}

/**
 * A closed ribbon from one vertical span to another, left to right.
 *
 * At `x0` the ribbon spans `top0`..`bottom0`; at `x1`, `top1`..`bottom1`. Both
 * edges are horizontal S-curves with their control points at the midpoint, so
 * a ribbon that changes height does so smoothly and a ribbon that keeps its
 * height is a band of constant thickness along a curve.
 */
export function ribbonPath(
  x0: number,
  top0: number,
  bottom0: number,
  x1: number,
  top1: number,
  bottom1: number
): string {
  const cx = (x0 + x1) / 2;
  return [
    `M ${x0} ${top0}`,
    `C ${cx} ${top0}, ${cx} ${top1}, ${x1} ${top1}`,
    `L ${x1} ${bottom1}`,
    `C ${cx} ${bottom1}, ${cx} ${bottom0}, ${x0} ${bottom0}`,
    'Z',
  ].join(' ');
}

/** A ribbon of constant thickness centred on a curve between two points. */
export function bandPath(x0: number, y0: number, x1: number, y1: number, thickness: number): string {
  const half = thickness / 2;
  return ribbonPath(x0, y0 - half, y0 + half, x1, y1 - half, y1 + half);
}
