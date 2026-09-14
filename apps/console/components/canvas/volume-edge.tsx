'use client';

import { memo } from 'react';
import type { EdgeProps } from 'reactflow';
import { cn } from '@/lib/cn';
import { bandPath, type VolumeScale } from '@/components/volume/geometry';

/**
 * An edge as thick as the candidates that crossed it — the canvas's volume
 * overlay (`METIS_CONSOLE_SPEC.md` §4.2).
 *
 * Drawn with `bandPath` and a `volumeScale` from `components/volume/geometry.ts`,
 * the same geometry the loop diagram draws with, so a thickness is the same
 * arithmetic on both screens. The scale is built once per graph by the canvas,
 * over the largest volume in it, and handed to every edge: an edge that scaled
 * itself would be thick relative to nothing.
 */

/** The thickest an edge is drawn, in flow units: the flow's largest volume. */
export const VOLUME_EDGE_MAX = 26;

export interface VolumeEdgeData {
  volume: number;
  scale: VolumeScale;
}

function VolumeEdgeComponent({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<VolumeEdgeData>) {
  const thickness = data ? data.scale(data.volume) : 1.5;
  return (
    <path
      id={id}
      data-volume={data?.volume ?? 0}
      d={bandPath(sourceX, sourceY, targetX, targetY, thickness)}
      className={cn('react-flow__edge-path stroke-none', selected ? 'fill-accent/60' : 'fill-accent/35')}
    />
  );
}

export const VolumeEdge = memo(VolumeEdgeComponent);
