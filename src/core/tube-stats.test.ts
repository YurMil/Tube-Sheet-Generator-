import {describe, expect, it} from 'vitest';
import {computeTubeStats} from './tube-stats';
import {getLayoutStrategy} from './layout-strategies';
import {keyPoints} from './geometry-utils';
import type {GeneratorParams, ModifiedHole, Point} from '../types';

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

const defaultKeyed = () => keyPoints(getLayoutStrategy('triangular').calculatePoints(baseParams()));

describe('computeTubeStats', () => {
  it('counts every hole as an active tube with no overrides', () => {
    const keyed = defaultKeyed();
    const stats = computeTubeStats(keyed, new Map(), baseParams());
    expect(stats.cutHoles).toBe(keyed.length);
    expect(stats.activeTubes).toBe(keyed.length);
    expect(stats.hidden).toBe(0);
    expect(stats.tieRods).toBe(0);
  });

  it('uses the nominal outer surface for a uniform sheet', () => {
    const keyed = defaultKeyed();
    const stats = computeTubeStats(keyed, new Map(), baseParams());
    expect(stats.heatTransferArea).toBeCloseTo(keyed.length * Math.PI * 25 * 3000);
  });

  it('excludes hidden holes and tie rods from the active/area totals', () => {
    const keyed = defaultKeyed();
    const mods = new Map<string, ModifiedHole>();
    mods.set(keyed[0].key, {hidden: true});
    mods.set(keyed[1].key, {type: 'tieRod'});
    const stats = computeTubeStats(keyed, mods, baseParams());
    expect(stats.hidden).toBe(1);
    expect(stats.tieRods).toBe(1);
    expect(stats.cutHoles).toBe(keyed.length - 1);
    expect(stats.activeTubes).toBe(keyed.length - 2);
    expect(stats.heatTransferArea).toBeCloseTo((keyed.length - 2) * Math.PI * 25 * 3000);
  });

  it('reflects a custom diameter in the heat-transfer area', () => {
    const keyed = keyPoints([{x: 0, y: 0}]);
    const mods = new Map<string, ModifiedHole>([[keyed[0].key, {diameter: 50}]]);
    const stats = computeTubeStats(keyed, mods, baseParams());
    expect(stats.heatTransferArea).toBeCloseTo(Math.PI * 50 * 3000);
  });

  it('flags holes that overlap the partition band', () => {
    const keyed = defaultKeyed();
    const stats = computeTubeStats(keyed, new Map(), baseParams({passCount: 2, partitionWidth: 10}));
    expect(stats.partitionConflicts).toBeGreaterThan(0);
  });

  it('flags a hole pushed past the sheet edge by a large custom diameter', () => {
    const points: Point[] = [{x: 240, y: 0}]; // board radius 250
    const keyed = keyPoints(points);
    const mods = new Map<string, ModifiedHole>([[keyed[0].key, {diameter: 60}]]);
    const stats = computeTubeStats(keyed, mods, baseParams());
    expect(stats.edgeOverflow).toBe(1);
  });
});
