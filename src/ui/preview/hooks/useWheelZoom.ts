import {useEffect, useRef} from 'react';
import type {RefObject} from 'react';

/**
 * Binds the wheel handler natively with {passive: false}: React attaches
 * onWheel passively, so preventDefault there is ignored and warns. Uses a ref
 * so the listener always calls the latest zoom function without rebinding.
 */
export default function useWheelZoom(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  zoomAt: (clientX: number, clientY: number, zoomFactor: number) => void,
) {
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 0.88 : 1.12;
      zoomAtRef.current(event.clientX, event.clientY, zoomFactor);
    };
    canvas.addEventListener('wheel', onWheel, {passive: false});
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [canvasRef]);
}
