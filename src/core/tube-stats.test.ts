import {describe, expect, it} from 'vitest';
import {computeTubeStats} from './tube-stats';
import {getLayoutStrategy} from './layout-strategies';
import {createPointKey} from './geometry-utils';
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

const defaultCoords = () => getLayoutStrategy('triangular').calculatePoints(baseParams());

describe('computeTubeStats', () => {
  it('counts every hole as an active tube with no overrides', () => {
    const coords = defaultCoords();
    const stats = computeTubeStats(coords, new Map(), baseParams());
    expect(stats.cutHoles).toBe(coords.length);
    expect(stats.activeTubes).toBe(coords.length);
    expect(stats.hidden).toBe(0);
    expect(stats.tieRods).toBe(0);
  });

  it('uses the nominal outer surface for a uniform sheet', () => {
    const coords = defaultCoords();
    const stats = computeTubeStats(coords, new Map(), baseParams());
    expect(stats.heatTransferArea).toBeCloseTo(coords.length * Math.PI * 25 * 3000);
  });

  it('excludes hidden holes and tie rods from the active/area totals', () => {
    const coords = defaultCoords();
    const mods = new Map<string, ModifiedHole>();
    mods.set(createPointKey(coords[0]), {hidden: true});
    mods.set(createPointKey(coords[1]), {type: 'tieRod'});
    const stats = computeTubeStats(coords, mods, baseParams());
    expect(stats.hidden).toBe(1);
    expect(stats.tieRods).toBe(1);
    expect(stats.cutHoles).toBe(coords.length - 1);
    expect(stats.activeTubes).toBe(coords.length - 2);
    expect(stats.heatTransferArea).toBeCloseTo((coords.length - 2) * Math.PI * 25 * 3000);
  });

  it('reflects a custom diameter in the heat-transfer area', () => {
    const coords: Point[] = [{x: 0, y: 0}];
    const mods = new Map<string, ModifiedHole>([[createPointKey(coords[0]), {diameter: 50}]]);
    const stats = computeTubeStats(coords, mods, baseParams());
    expect(stats.heatTransferArea).toBeCloseTo(Math.PI * 50 * 3000);
  });

  it('flags holes that overlap the partition band', () => {
    const coords = defaultCoords();
    const stats = computeTubeStats(coords, new Map(), baseParams({passCount: 2, partitionWidth: 10}));
    expect(stats.partitionConflicts).toBeGreaterThan(0);
  });

  it('flags a hole pushed past the sheet edge by a large custom diameter', () => {
    const coords: Point[] = [{x: 240, y: 0}]; // board radius 250
    const mods = new Map<string, ModifiedHole>([[createPointKey(coords[0]), {diameter: 60}]]);
    const stats = computeTubeStats(coords, mods, baseParams());
    expect(stats.edgeOverflow).toBe(1);
  });
});
