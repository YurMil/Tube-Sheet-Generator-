import type {GeneratorParams, Point} from '../types';

export type LayoutWorkerRequest = {
  requestId: string;
  params: GeneratorParams;
};

export type LayoutWorkerResult =
  | {requestId: string; ok: true; buffer: ArrayBuffer}
  | {requestId: string; ok: false; message: string};

/** Pack points into an interleaved [x0,y0,x1,y1,...] Float64Array buffer. */
export const encodePoints = (points: Point[]): ArrayBuffer => {
  const array = new Float64Array(points.length * 2);
  for (let i = 0; i < points.length; i++) {
    array[i * 2] = points[i].x;
    array[i * 2 + 1] = points[i].y;
  }
  return array.buffer;
};

/** Reverse of encodePoints. */
export const decodePoints = (buffer: ArrayBuffer): Point[] => {
  const array = new Float64Array(buffer);
  const points: Point[] = new Array(array.length / 2);
  for (let i = 0; i < points.length; i++) {
    points[i] = {x: array[i * 2], y: array[i * 2 + 1]};
  }
  return points;
};
