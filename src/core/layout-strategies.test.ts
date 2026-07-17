import {describe, expect, it} from 'vitest';
import {getLayoutStrategy} from './layout-strategies';
import {createPointKey, getSafeRadius, isWithinRadius} from './geometry-utils';
import type {GeneratorParams, LayoutType} from '../types';

const baseParams = (overrides: Partial<GeneratorParams> = {}): GeneratorParams => ({
  boardDiameter: 500,
  thickness: 50,
  tubeDiameter: 25,
  tubeLength: 3000,
  tubeLayout: 'triangular',
  tubePitch: 32,
  edgeMargin: 15,
  topCutoffChord: 0,
  bottomCutoffChord: 0,
  passCount: 1,
  partitionWidth: 10,
  partitionOrientation: 'horizontal',
  ...overrides,
});

const layouts: LayoutType[] = ['triangular', 'triangular30', 'square', 'square45'];

describe.each(layouts)('layout: %s', (layout) => {
  const params = baseParams({tubeLayout: layout});
  const points = getLayoutStrategy(layout).calculatePoints(params);

  it('produces a non-empty layout', () => {
    expect(points.length).toBeGreaterThan(0);
  });

  it('always includes the centre point', () => {
    expect(points.some((p) => p.x === 0 && p.y === 0)).toBe(true);
  });

  it('keeps every point inside the safe radius', () => {
    const safeRadius = getSafeRadius(params);
    expect(points.every((p) => isWithinRadius(p, safeRadius + 1e-6))).toBe(true);
  });

  it('contains no duplicate coordinates', () => {
    const keys = points.map(createPointKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is symmetric across both axes', () => {
    const keys = new Set(points.map(createPointKey));
    for (const p of points) {
      expect(keys.has(createPointKey({x: -p.x, y: p.y}))).toBe(true);
      expect(keys.has(createPointKey({x: p.x, y: -p.y}))).toBe(true);
    }
  });
});

describe('layout guards', () => {
  it('returns an empty array for invalid params', () => {
    expect(getLayoutStrategy('triangular').calculatePoints(baseParams({boardDiameter: 0}))).toEqual([]);
  });

  it('returns an empty array when the safe radius is non-positive', () => {
    expect(getLayoutStrategy('square').calculatePoints(baseParams({edgeMargin: 1000}))).toEqual([]);
  });

  it('yields the expected count for the default triangular sheet', () => {
    expect(getLayoutStrategy('triangular').calculatePoints(baseParams()).length).toBe(169);
  });
});
