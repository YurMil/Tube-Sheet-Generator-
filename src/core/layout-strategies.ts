import type {GeneratorParams, LayoutType, Point} from '../types';
import {
  createPointCollector,
  getSafeRadius,
  isWithinCutoffZone,
  validateLayoutParams,
} from './geometry-utils';

export interface LayoutStrategy {
  calculatePoints(params: GeneratorParams): Point[];
}

const addSymmetricPoints = (addPoint: (x: number, y: number) => void, x: number, y: number) => {
  addPoint(x, y);
  if (x !== 0) addPoint(-x, y);
  if (y !== 0) addPoint(x, -y);
  if (x !== 0 && y !== 0) addPoint(-x, -y);
};

export class SquareLayout implements LayoutStrategy {
  calculatePoints(params: GeneratorParams): Point[] {
    if (!validateLayoutParams(params)) {
      return [];
    }

    const safeRadius = getSafeRadius(params);
    if (safeRadius <= 0) {
      return [];
    }

    const {points, addPoint} = createPointCollector(safeRadius);
    const boardRadius = params.boardDiameter / 2;
    const endX = boardRadius;
    const endY = boardRadius;

    for (let y = 0; y < endY; y += params.tubePitch) {
      for (let x = 0; x < endX; x += params.tubePitch) {
        if (x === 0 && y === 0) continue;
        addSymmetricPoints(addPoint, x, y);
      }
    }

    addPoint(0, 0);
    return points;
  }
}

export class RotatedSquareLayout implements LayoutStrategy {
  calculatePoints(params: GeneratorParams): Point[] {
    if (!validateLayoutParams(params)) {
      return [];
    }

    const safeRadius = getSafeRadius(params);
    if (safeRadius <= 0) {
      return [];
    }

    const {points, addPoint} = createPointCollector(safeRadius);
    const boardRadius = params.boardDiameter / 2;
    const rowPitch = params.tubePitch / Math.SQRT2;
    const columnPitch = params.tubePitch * Math.SQRT2;

    for (let y = 0, row = 0; y < boardRadius; y += rowPitch, row++) {
      const xOffset = row % 2 === 1 ? rowPitch : 0;
      for (let x = xOffset; x < boardRadius; x += columnPitch) {
        if (x === 0 && y === 0) continue;
        addSymmetricPoints(addPoint, x, y);
      }
    }

    addPoint(0, 0);
    return points;
  }
}

export class TriangularLayout implements LayoutStrategy {
  calculatePoints(params: GeneratorParams): Point[] {
    if (!validateLayoutParams(params)) {
      return [];
    }

    const safeRadius = getSafeRadius(params);
    if (safeRadius <= 0) {
      return [];
    }

    const {points, addPoint} = createPointCollector(safeRadius);
    const boardRadius = params.boardDiameter / 2;
    const endX = boardRadius;
    const endY = boardRadius;
    const dy = (params.tubePitch * Math.sqrt(3)) / 2;

    for (let y = 0, row = 0; y < endY; y += dy, row++) {
      const xOffset = row % 2 === 1 ? params.tubePitch / 2 : 0;
      for (let x = xOffset; x < endX; x += params.tubePitch) {
        if (x === 0 && y === 0) continue;
        addSymmetricPoints(addPoint, x, y);
      }
    }

    addPoint(0, 0);
    return points;
  }
}

export class RotatedTriangularLayout implements LayoutStrategy {
  calculatePoints(params: GeneratorParams): Point[] {
    if (!validateLayoutParams(params)) {
      return [];
    }

    const safeRadius = getSafeRadius(params);
    if (safeRadius <= 0) {
      return [];
    }

    const {points, addPoint} = createPointCollector(safeRadius);
    const boardRadius = params.boardDiameter / 2;
    const dx = (params.tubePitch * Math.sqrt(3)) / 2;

    for (let x = 0, column = 0; x < boardRadius; x += dx, column++) {
      const yOffset = column % 2 === 1 ? params.tubePitch / 2 : 0;
      for (let y = yOffset; y < boardRadius; y += params.tubePitch) {
        if (x === 0 && y === 0) continue;
        addSymmetricPoints(addPoint, x, y);
      }
    }

    addPoint(0, 0);
    return points;
  }
}

const strategies: Record<LayoutType, LayoutStrategy> = {
  triangular30: new RotatedTriangularLayout(),
  square: new SquareLayout(),
  square45: new RotatedSquareLayout(),
  triangular: new TriangularLayout(),
};

export const getLayoutStrategy = (layout: LayoutType) => strategies[layout];

/**
 * Full tube-point layout for the given params: the strategy points minus the
 * impingement cut-off zones. Shared by the layout worker and its synchronous
 * fallback so both paths produce identical results.
 */
export const computeLayoutPoints = (params: GeneratorParams): Point[] =>
  getLayoutStrategy(params.tubeLayout)
    .calculatePoints(params)
    .filter((point) => !isWithinCutoffZone(point, params));
