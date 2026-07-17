import type {GeneratorParams, ModifiedHole, Point} from '../types';
import {createPointKey, getPartitionOffsets} from '../core/geometry-utils';

type DxfLine = {x1: number; y1: number; x2: number; y2: number};

const buildDxfLine = (layer: string, line: DxfLine) =>
  `0\nLINE\n8\n${layer}\n10\n${line.x1.toFixed(4)}\n20\n${line.y1.toFixed(4)}\n30\n0.0\n11\n${line.x2.toFixed(4)}\n21\n${line.y2.toFixed(4)}\n31\n0.0\n`;

const buildSquareHole = (layer: string, coord: Point, size: number) => {
  const half = size / 2;
  const left = coord.x - half;
  const right = coord.x + half;
  const bottom = coord.y - half;
  const top = coord.y + half;
  const lines: DxfLine[] = [
    {x1: left, y1: bottom, x2: right, y2: bottom},
    {x1: right, y1: bottom, x2: right, y2: top},
    {x1: right, y1: top, x2: left, y2: top},
    {x1: left, y1: top, x2: left, y2: bottom},
  ];
  return lines.map((line) => buildDxfLine(layer, line)).join('');
};

const buildPartitionLines = (params: GeneratorParams): DxfLine[] => {
  const boardRadius = params.boardDiameter / 2;
  const halfPartition = params.partitionWidth / 2;
  const lines: DxfLine[] = [];

  getPartitionOffsets(params).forEach((offset) => {
    const halfSpan = Math.sqrt(Math.abs(boardRadius * boardRadius - offset * offset));
    if (params.partitionOrientation === 'horizontal') {
      lines.push({x1: -halfSpan, y1: offset - halfPartition, x2: halfSpan, y2: offset - halfPartition});
      lines.push({x1: -halfSpan, y1: offset + halfPartition, x2: halfSpan, y2: offset + halfPartition});
    } else {
      lines.push({x1: offset - halfPartition, y1: -halfSpan, x2: offset - halfPartition, y2: halfSpan});
      lines.push({x1: offset + halfPartition, y1: -halfSpan, x2: offset + halfPartition, y2: halfSpan});
    }
  });

  return lines;
};

// Minimal HEADER so strict importers (AutoCAD) recognise the file and,
// crucially, treat coordinates as millimetres ($INSUNITS = 4).
const buildHeader = () =>
  ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1015', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'].join(
    '\n',
  );

const buildLayerTable = () => {
  return [
    '0',
    'SECTION',
    '2',
    'TABLES',
    '0',
    'TABLE',
    '2',
    'LAYER',
    '70',
    '4',
    '0',
    'LAYER',
    '2',
    'SHEET',
    '70',
    '0',
    '62',
    '7',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'HOLES',
    '70',
    '0',
    '62',
    '7',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'PARTITIONS',
    '70',
    '0',
    '62',
    '1',
    '6',
    'CONTINUOUS',
    '0',
    'LAYER',
    '2',
    'TIE_RODS',
    '70',
    '0',
    '62',
    '3',
    '6',
    'CONTINUOUS',
    '0',
    'ENDTAB',
    '0',
    'ENDSEC',
  ].join('\n');
};

export const buildTubeSheetDxf = (
  params: GeneratorParams,
  tubeCoords: Point[],
  modifiedHoles?: Map<string, ModifiedHole>,
) => {
  const boardRadius = params.boardDiameter / 2;
  const tubeRadius = params.tubeDiameter / 2;
  const partitions = buildPartitionLines(params);

  let dxf = `${buildHeader()}\n${buildLayerTable()}\n0\nSECTION\n2\nENTITIES\n`;
  dxf += `0\nCIRCLE\n8\nSHEET\n10\n0.0\n20\n0.0\n30\n0.0\n40\n${boardRadius}\n`;

  tubeCoords.forEach((coord) => {
    const modified = modifiedHoles?.get(createPointKey(coord));
    if (modified?.hidden) {
      return;
    }
    const diameter = modified?.diameter ?? params.tubeDiameter;
    const layer = modified?.type === 'tieRod' ? 'TIE_RODS' : 'HOLES';
    if (modified?.shape === 'square') {
      dxf += buildSquareHole(layer, coord, diameter);
      return;
    }

    dxf += `0\nCIRCLE\n8\n${layer}\n10\n${coord.x.toFixed(4)}\n20\n${coord.y.toFixed(4)}\n30\n0.0\n40\n${diameter / 2}\n`;
  });

  partitions.forEach((line) => {
    dxf += buildDxfLine('PARTITIONS', line);
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
};
