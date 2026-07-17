import {describe, expect, it} from 'vitest';
import {
  createPointCollector,
  createPointKey,
  estimateLayoutPointCount,
  getPartitionOffsets,
  getSafeRadius,
  isFiniteNumber,
  isWithinCutoffZone,
  isWithinPartitionBand,
  isWithinRadius,
  normalizeZero,
  validateLayoutParams,
} from './geometry-utils';
import type {GeneratorParams} from '../types';

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

describe('normalizeZero', () => {
  it('snaps near-zero magnitudes to exactly 0', () => {
    expect(normalizeZero(1e-7)).toBe(0);
    expect(normalizeZero(-1e-7)).toBe(0);
    expect(Object.is(normalizeZero(-1e-7), 0)).toBe(true);
  });

  it('leaves meaningful values untouched', () => {
    expect(normalizeZero(0.5)).toBe(0.5);
    expect(normalizeZero(-12.34)).toBe(-12.34);
  });
});

describe('createPointKey', () => {
  it('is stable and treats -0 and +0 as equal', () => {
    expect(createPointKey({x: 0, y: 0})).toBe(createPointKey({x: -0, y: 1e-8}));
  });

  it('rounds to 4 decimals', () => {
    expect(createPointKey({x: 1.234567, y: -2.5})).toBe('1.2346:-2.5000');
  });
});

describe('isFiniteNumber', () => {
  it('accepts only finite numbers', () => {
    expect(isFiniteNumber(3)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Infinity)).toBe(false);
    expect(isFiniteNumber('3')).toBe(false);
  });
});

describe('validateLayoutParams', () => {
  it('accepts sane params', () => {
    expect(validateLayoutParams(baseParams())).toBe(true);
  });

  it('rejects non-positive or non-finite dimensions', () => {
    expect(validateLayoutParams(baseParams({boardDiameter: 0}))).toBe(false);
    expect(validateLayoutParams(baseParams({tubeDiameter: -1}))).toBe(false);
    expect(validateLayoutParams(baseParams({tubePitch: Number.NaN}))).toBe(false);
    expect(validateLayoutParams(baseParams({edgeMargin: -1}))).toBe(false);
  });

  it('allows a zero edge margin', () => {
    expect(validateLayoutParams(baseParams({edgeMargin: 0}))).toBe(true);
  });
});

describe('getSafeRadius', () => {
  it('subtracts edge margin and half the tube diameter', () => {
    expect(getSafeRadius(baseParams())).toBe(250 - 15 - 12.5);
  });
});

describe('estimateLayoutPointCount', () => {
  it('returns 0 for invalid params or non-positive safe radius', () => {
    expect(estimateLayoutPointCount(baseParams({boardDiameter: 0}))).toBe(0);
    expect(estimateLayoutPointCount(baseParams({edgeMargin: 1000}))).toBe(0);
  });

  it('grows quadratically as pitch shrinks', () => {
    const coarse = estimateLayoutPointCount(baseParams({tubePitch: 32}));
    const fine = estimateLayoutPointCount(baseParams({tubePitch: 16}));
    expect(fine).toBeGreaterThan(coarse * 3);
  });

  it('is an upper bound on the true triangular point count', () => {
    const estimate = estimateLayoutPointCount(baseParams());
    // 169 real points for the default sheet; estimate must not undercount.
    expect(estimate).toBeGreaterThanOrEqual(169);
  });
});

describe('isWithinRadius', () => {
  it('includes the boundary', () => {
    expect(isWithinRadius({x: 3, y: 4}, 5)).toBe(true);
    expect(isWithinRadius({x: 3, y: 4}, 4.99)).toBe(false);
  });
});

describe('isWithinCutoffZone', () => {
  it('is false when no chords are set', () => {
    expect(isWithinCutoffZone({x: 0, y: 240}, baseParams())).toBe(false);
  });

  it('flags points above the top chord and below the bottom chord', () => {
    const params = baseParams({topCutoffChord: 30, bottomCutoffChord: 30});
    // board radius 250; top zone y >= 220, bottom zone y <= -220
    expect(isWithinCutoffZone({x: 0, y: 221}, params)).toBe(true);
    expect(isWithinCutoffZone({x: 0, y: -221}, params)).toBe(true);
    expect(isWithinCutoffZone({x: 0, y: 0}, params)).toBe(false);
  });
});

describe('getPartitionOffsets', () => {
  it('returns nothing for a single pass', () => {
    expect(getPartitionOffsets(baseParams({passCount: 1}))).toEqual([]);
  });

  it('centres a single partition for two passes', () => {
    expect(getPartitionOffsets(baseParams({passCount: 2}))).toEqual([0]);
  });

  it('is symmetric around the centre for odd pass counts', () => {
    const offsets = getPartitionOffsets(baseParams({passCount: 3}));
    expect(offsets).toHaveLength(2);
    expect(offsets[0]).toBeCloseTo(-offsets[1]);
  });
});

describe('isWithinPartitionBand', () => {
  it('detects a tube overlapping the central band', () => {
    const params = baseParams({passCount: 2, partitionWidth: 10});
    expect(isWithinPartitionBand({x: 0, y: 0}, 12.5, params)).toBe(true);
    // 100 mm away from the only band at y=0 → clear
    expect(isWithinPartitionBand({x: 0, y: 100}, 12.5, params)).toBe(false);
  });

  it('uses the x axis for vertical partitions', () => {
    const params = baseParams({passCount: 2, partitionOrientation: 'vertical', partitionWidth: 4});
    expect(isWithinPartitionBand({x: 1, y: 200}, 5, params)).toBe(true);
    expect(isWithinPartitionBand({x: 200, y: 0}, 5, params)).toBe(false);
  });
});

describe('createPointCollector', () => {
  it('drops points outside the safe radius and de-duplicates', () => {
    const {points, addPoint} = createPointCollector(10);
    addPoint(0, 0);
    addPoint(0, 0); // duplicate
    addPoint(1e-8, 0); // duplicate after normalisation
    addPoint(20, 0); // outside radius
    addPoint(3, 4); // on radius boundary
    expect(points).toEqual([
      {x: 0, y: 0},
      {x: 3, y: 4},
    ]);
  });
});
