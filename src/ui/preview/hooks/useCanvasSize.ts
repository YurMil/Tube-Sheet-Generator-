import {useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';
import type {CanvasSize} from '../types';

/**
 * Tracks the rendered size of a canvas element, throttled through
 * requestAnimationFrame, using ResizeObserver when available and falling back
 * to window resize otherwise.
 */
export default function useCanvasSize(canvasRef: RefObject<HTMLCanvasElement | null>): CanvasSize {
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({width: 0, height: 0});
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setCanvasSize((current) => (current.width === width && current.height === height ? current : {width, height}));
    };

    const scheduleSync = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        syncCanvasSize();
      });
    };

    syncCanvasSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(scheduleSync);
      observer.observe(canvas);
      return () => {
        observer.disconnect();
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
      };
    }

    window.addEventListener('resize', scheduleSync);
    return () => {
      window.removeEventListener('resize', scheduleSync);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [canvasRef]);

  return canvasSize;
}
