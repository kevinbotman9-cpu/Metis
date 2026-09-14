import { describe, it, expect } from 'vitest';
import { volumeScale, ribbonPath, bandPath } from '@/components/volume/geometry';

/**
 * The shared volume geometry. The loop diagram and the canvas overlay both draw
 * with these, so a thickness means the same count on both screens.
 */

describe('volume as thickness', () => {
  it('is proportional: twice the volume is twice as thick', () => {
    const scale = volumeScale(10_000, 120);
    expect(scale(10_000)).toBe(120);
    expect(scale(5_000)).toBe(60);
    expect(scale(2_500)).toBe(30);
  });

  it('keeps a trickle visible at the floor, and only below it', () => {
    const scale = volumeScale(10_000, 120, 2);
    expect(scale(1)).toBe(2);
    expect(scale(0)).toBe(2);
    // 200 of 10,000 at 120 is 2.4, above the floor, so it is not floored.
    expect(scale(200)).toBeCloseTo(2.4, 10);
  });

  it('does not divide by zero when nothing was decided', () => {
    const scale = volumeScale(0, 120);
    expect(Number.isFinite(scale(0))).toBe(true);
    expect(scale(0)).toBe(1.5);
  });

  it('never draws a negative volume thinner than the floor', () => {
    expect(volumeScale(100, 10)(-50)).toBe(1.5);
  });
});

describe('the ribbon', () => {
  it('starts at the first span and ends at the second, closed', () => {
    const d = ribbonPath(0, 10, 50, 100, 10, 30);
    expect(d.startsWith('M 0 10')).toBe(true);
    expect(d).toContain('100 10');
    expect(d).toContain('L 100 30');
    expect(d.endsWith('0 50 Z')).toBe(true);
  });

  it('puts both control points at the horizontal midpoint', () => {
    const d = ribbonPath(20, 0, 10, 220, 40, 60);
    expect(d).toContain('C 120 0, 120 40, 220 40');
    expect(d).toContain('C 120 60, 120 10, 20 10');
  });

  it('draws a band as a ribbon of constant thickness centred on the curve', () => {
    expect(bandPath(0, 50, 100, 80, 20)).toBe(ribbonPath(0, 40, 60, 100, 70, 90));
  });
});
