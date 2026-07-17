import {useCallback, useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';
import {getCanvasMetrics, getFitScale, screenToWorld} from '../transform';
import {MAX_ZOOM, MIN_ZOOM} from '../types';
import type {Viewport} from '../types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type ViewportController = {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  /** Coalesce rapid updates (e.g. drag-pan) into one per animation frame. */
  scheduleViewport: (next: Viewport) => void;
  /** Zoom toward a client point, keeping that point stationary in world space. */
  zoomAt: (clientX: number, clientY: number, zoomFactor: number) => void;
  zoomToCenter: (zoomFactor: number) => void;
  resetViewport: () => void;
};

export default function useViewport(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  boardDiameter: number,
): ViewportController {
  const [viewport, setViewport] = useState<Viewport>({zoom: 1, panX: 0, panY: 0});
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<Viewport | null>(null);

  const scheduleViewport = useCallback((next: Viewport) => {
    pendingRef.current = next;
    if (frameRef.current !== null) {
      return;
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        setViewport(pending);
      }
    });
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, zoomFactor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const worldPoint = screenToWorld(clientX, clientY, rect, viewport, boardDiameter);
      const {centerX, centerY} = getCanvasMetrics(rect.width, rect.height, viewport, boardDiameter);
      const nextZoom = clamp(viewport.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      const nextScale = getFitScale(rect.width, rect.height, boardDiameter) * nextZoom;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      setViewport({
        zoom: nextZoom,
        panX: localX - centerX - worldPoint.x * nextScale,
        panY: localY - centerY + worldPoint.y * nextScale,
      });
    },
    [boardDiameter, canvasRef, viewport],
  );

  const zoomToCenter = useCallback(
    (zoomFactor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoomFactor);
    },
    [canvasRef, zoomAt],
  );

  const resetViewport = useCallback(() => {
    setViewport({zoom: 1, panX: 0, panY: 0});
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  return {viewport, setViewport, scheduleViewport, zoomAt, zoomToCenter, resetViewport};
}
