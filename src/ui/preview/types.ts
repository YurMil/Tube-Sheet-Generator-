import type {Point} from '../../types';

export const MIN_ZOOM = 0.75;
export const MAX_ZOOM = 24;
export const ZOOM_STEP = 1.25;
export const DRAG_THRESHOLD_PX = 4;

export type Viewport = {
  zoom: number;
  panX: number;
  panY: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type SelectionBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export type SpatialItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  point: Point;
  key: string;
};

/** A tube point paired with its precomputed key, built once per points change. */
export type KeyedPoint = {
  point: Point;
  key: string;
};
