import type {GeneratorParams, Point} from '../types';

export const normalizeZero = (value: number) => (Math.abs(value) < 1e-6 ? 0 : value);

export const createPointKey = (point: Point) =>
  `${normalizeZero(point.x).toFixed(4)}:${normalizeZero(point.y).toFixed(4)}`;

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const validateLayoutParams = (params: GeneratorParams) => {
  if (!isFiniteNumber(params.boardDiameter) || params.boardDiameter <= 0) return false;
  if (!isFiniteNumber(params.tubeDiameter) || params.tubeDiameter <= 0) return false;
  if (!isFiniteNumber(params.tubePitch) || params.tubePitch <= 0) return false;
  if (!isFiniteNumber(params.edgeMargin) || params.edgeMargin < 0) return false;
  return true;
};

export const getSafeRadius = (params: GeneratorParams) =>
  params.boardDiameter / 2 - params.edgeMargin - params.tubeDiameter / 2;

/**
 * Upper-bound estimate of how many tube points a layout would produce, used to
 * bail out before running the O((D/pitch)^2) point loop on huge inputs. The
 * tightest row spacing across all layouts is pitch/sqrt(2), so this is a safe
 * (over-)estimate for every strategy.
 */
export const estimateLayoutPointCount = (params: GeneratorParams) => {
  if (!validateLayoutParams(params)) {
    return 0;
  }
  const safeRadius = getSafeRadius(params);
  if (safeRadius <= 0) {
    return 0;
  }
  const minSpacing = params.tubePitch / Math.SQRT2;
  // Circle area / cell area, with a small safety factor for boundary rows.
  return Math.ceil((Math.PI * safeRadius * safeRadius) / (minSpacing * minSpacing)) + 1;
};

export const isWithinRadius = (point: Point, radius: number) =>
  Math.sqrt(point.x * point.x + point.y * point.y) <= radius;

/**
 * Centre offsets of each pass-partition band from the sheet centre, along the
 * partition's normal axis. Shared by the preview, the DXF exporter and the
 * partition-conflict check so they can't drift apart.
 */
export const getPartitionOffsets = (params: Pick<GeneratorParams, 'boardDiameter' | 'passCount'>) => {
  if (params.passCount <= 1) {
    return [];
  }
  const boardRadius = params.boardDiameter / 2;
  const section = (boardRadius * 2) / params.passCount;
  const offsets: number[] = [];
  for (let i = 1; i < params.passCount; i++) {
    offsets.push(boardRadius - i * section);
  }
  return offsets;
};

/**
 * True when a hole of the given radius overlaps any pass-partition band, i.e.
 * it would physically collide with the partition plate.
 */
export const isWithinPartitionBand = (
  point: Point,
  radius: number,
  params: Pick<GeneratorParams, 'boardDiameter' | 'passCount' | 'partitionOrientation' | 'partitionWidth'>,
) => {
  const offsets = getPartitionOffsets(params);
  if (offsets.length === 0) {
    return false;
  }
  const coordinate = params.partitionOrientation === 'horizontal' ? point.y : point.x;
  const reach = params.partitionWidth / 2 + radius;
  return offsets.some((offset) => Math.abs(coordinate - offset) < reach);
};

export const isWithinCutoffZone = (point: Point, params: GeneratorParams) => {
  const boardRadius = params.boardDiameter / 2;
  if (params.topCutoffChord > 0 && point.y >= boardRadius - params.topCutoffChord) {
    return true;
  }
  return params.bottomCutoffChord > 0 && point.y <= -boardRadius + params.bottomCutoffChord;
};

export const createPointCollector = (safeRadius: number) => {
  const points: Point[] = [];
  const set = new Set<string>();

  const addPoint = (x: number, y: number) => {
    const normalizedX = normalizeZero(x);
    const normalizedY = normalizeZero(y);
    const point = {x: normalizedX, y: normalizedY};

    if (!isWithinRadius(point, safeRadius)) {
      return;
    }

    const key = `${normalizedX.toFixed(4)}:${normalizedY.toFixed(4)}`;
    if (set.has(key)) {
      return;
    }
    set.add(key);
    points.push(point);
  };

  return {points, addPoint};
};
