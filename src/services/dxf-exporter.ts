import type {GeneratorParams, ModifiedHole, Point} from '../types';
import {createPointKey} from '../core/geometry-utils';

type DxfLine = {x1: number; y1: number; x2: number; y2: number};

const buildDxfLine = (layer: string, line: DxfLine) =>
  `0\nLINE\n8\n${layer}\n10\n${line.x1.toFixed(4)}\n20\n${line.y1.toFixed(4)}\n30\n0.0\n11\n${line.x2.toFixed(4)}\n21\n${line.y2.toFixed(4)}\n31\n0.0\n`;

const buildSquareHole = (coord: Point, size: number) => {
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
  return lines.map((line) => buildDxfLine('HOLES', line)).join('');
};

const buildPartitionLines = (params: GeneratorParams): DxfLine[] => {
  if (params.passCount <= 1) {
    return [];
  }

  const boardRadius = params.boardDiameter / 2;
  const halfPartition = params.partitionWidth / 2;
  const numPartitions = params.passCount - 1;
  const lines: DxfLine[] = [];

  if (params.partitionOrientation === 'horizontal') {
    const totalHeight = boardRadius * 2;
    const sectionHeight = totalHeight / params.passCount;
    for (let i = 1; i <= numPartitions; i++) {
      const yPos = boardRadius - i * sectionHeight;
      const halfWidth = Math.sqrt(Math.abs(boardRadius * boardRadius - yPos * yPos));
      lines.push({
        x1: -halfWidth,
        y1: yPos - halfPartition,
        x2: halfWidth,
        y2: yPos - halfPartition,
      });
      lines.push({
        x1: -halfWidth,
        y1: yPos + halfPartition,
        x2: halfWidth,
        y2: yPos + halfPartition,
      });
    }
  } else {
    const totalWidth = boardRadius * 2;
    const sectionWidth = totalWidth / params.passCount;
    for (let i = 1; i <= numPartitions; i++) {
      const xPos = boardRadius - i * sectionWidth;
      const halfHeight = Math.sqrt(Math.abs(boardRadius * boardRadius - xPos * xPos));
      lines.push({
        x1: xPos - halfPartition,
        y1: -halfHeight,
        x2: xPos - halfPartition,
        y2: halfHeight,
      });
      lines.push({
        x1: xPos + halfPartition,
        y1: -halfHeight,
        x2: xPos + halfPartition,
        y2: halfHeight,
      });
    }
  }

  return lines;
};

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
    '3',
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

  let dxf = `${buildLayerTable()}\n0\nSECTION\n2\nENTITIES\n`;
  dxf += `0\nCIRCLE\n8\nSHEET\n10\n0.0\n20\n0.0\n30\n0.0\n40\n${boardRadius}\n`;

  tubeCoords.forEach((coord) => {
    const modified = modifiedHoles?.get(createPointKey(coord));
    if (modified?.hidden) {
      return;
    }
    const diameter = modified?.diameter ?? params.tubeDiameter;
    if (modified?.shape === 'square') {
      dxf += buildSquareHole(coord, diameter);
      return;
    }

    dxf += `0\nCIRCLE\n8\nHOLES\n10\n${coord.x.toFixed(4)}\n20\n${coord.y.toFixed(4)}\n30\n0.0\n40\n${diameter / 2}\n`;
  });

  partitions.forEach((line) => {
    dxf += buildDxfLine('PARTITIONS', line);
  });

  dxf += `0\nENDSEC\n0\nEOF\n`;
  return dxf;
};
