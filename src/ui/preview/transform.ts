import type {Point} from '../../types';
import type {Viewport} from './types';

/**
 * The sheet is framed to fill the smaller canvas dimension with 10% padding.
 * Everything else (zoom, pan, world<->screen) derives from this base scale.
 */
export const getFitScale = (rectWidth: number, rectHeight: number, boardDiameter: number) =>
  Math.min(rectWidth, rectHeight) / (boardDiameter * 1.1);

export type CanvasMetrics = {
  centerX: number;
  centerY: number;
  scale: number;
};

export const getCanvasMetrics = (
  rectWidth: number,
  rectHeight: number,
  viewport: Viewport,
  boardDiameter: number,
): CanvasMetrics => ({
  centerX: rectWidth / 2,
  centerY: rectHeight / 2,
  scale: getFitScale(rectWidth, rectHeight, boardDiameter) * viewport.zoom,
});

/**
 * Convert a client (screen) coordinate to sheet-space (mm), accounting for the
 * canvas position, centre, pan and zoom. Y is flipped so +y points up.
 */
export const screenToWorld = (
  clientX: number,
  clientY: number,
  rect: {left: number; top: number; width: number; height: number},
  viewport: Viewport,
  boardDiameter: number,
): Point => {
  const {centerX, centerY, scale} = getCanvasMetrics(rect.width, rect.height, viewport, boardDiameter);
  const localX = clientX - rect.left - centerX - viewport.panX;
  const localY = clientY - rect.top - centerY - viewport.panY;
  return {
    x: localX / scale,
    y: -localY / scale,
  };
};
