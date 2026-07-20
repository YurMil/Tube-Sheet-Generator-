import {describe, expect, it} from 'vitest';
import {buildTubeSheetDxf} from './dxf-exporter';
import type {GeneratorParams, Point} from '../types';

const params = {
  boardDiameter: 150,
  tubeDiameter: 25,
  partitionWidth: 10,
  partitionOrientation: 'horizontal',
  passCount: 2,
} as unknown as GeneratorParams;

const coords: Point[] = [
  {x: 0, y: 0},
  {x: 32, y: 0},
];

describe('buildTubeSheetDxf', () => {
  const dxf = buildTubeSheetDxf(params, coords);
  const lines = dxf.split('\n');

  it('declares DXF R12 — later versions require sections this minimal file does not emit', () => {
    // Regression: claiming AC1015 without CLASSES/BLOCKS/OBJECTS and entity
    // handles made eDrawings and AutoCAD viewers reject the file outright.
    expect(dxf).toContain('$ACADVER');
    expect(lines[lines.indexOf('$ACADVER') + 2]).toBe('AC1009');
    expect(dxf).not.toContain('AC1015');
  });

  it('defines the CONTINUOUS linetype before the layers that reference it', () => {
    const ltypeIndex = dxf.indexOf('LTYPE');
    const layerTableIndex = dxf.indexOf('\nLAYER\n');
    expect(ltypeIndex).toBeGreaterThan(-1);
    expect(dxf).toContain('CONTINUOUS');
    expect(ltypeIndex).toBeLessThan(layerTableIndex);
  });

  it('declares every layer used by entities', () => {
    for (const layer of ['SHEET', 'HOLES', 'PARTITIONS', 'TIE_RODS']) {
      expect(dxf).toContain(layer);
    }
  });

  it('has balanced section structure and a trailing EOF', () => {
    expect((dxf.match(/\nSECTION\n/g) ?? []).length).toBe((dxf.match(/\nENDSEC\n/g) ?? []).length);
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });

  it('emits one sheet circle plus one circle per visible hole', () => {
    expect((dxf.match(/\nCIRCLE\n/g) ?? []).length).toBe(1 + coords.length);
  });
});
