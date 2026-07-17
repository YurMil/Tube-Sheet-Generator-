import {describe, expect, it} from 'vitest';
import {decodePoints, encodePoints} from './layout-worker-protocol';
import type {Point} from '../types';

describe('layout point codec', () => {
  it('round-trips points through the Float64 buffer', () => {
    const points: Point[] = [
      {x: 0, y: 0},
      {x: 12.5, y: -3.25},
      {x: -240.125, y: 199.5},
    ];
    expect(decodePoints(encodePoints(points))).toEqual(points);
  });

  it('handles an empty layout', () => {
    const buffer = encodePoints([]);
    expect(buffer.byteLength).toBe(0);
    expect(decodePoints(buffer)).toEqual([]);
  });

  it('produces a buffer of two float64s per point', () => {
    expect(encodePoints([{x: 1, y: 2}, {x: 3, y: 4}]).byteLength).toBe(2 * 2 * 8);
  });
});
