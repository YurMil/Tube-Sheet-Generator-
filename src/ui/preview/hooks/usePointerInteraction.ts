import {useCallback, useRef, useState} from 'react';
import type React from 'react';
import type {RefObject} from 'react';
import type {Point} from '../../../types';
import {screenToWorld} from '../transform';
import {DRAG_THRESHOLD_PX} from '../types';
import type {SelectionBox, Viewport} from '../types';

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
  moved: boolean;
  mode: 'pan' | 'select';
};

export type PointerInteractionArgs = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  boardDiameter: number;
  viewport: Viewport;
  scheduleViewport: (next: Viewport) => void;
  hitTest: (world: Point) => Point | null;
  queryBox: (minX: number, minY: number, maxX: number, maxY: number) => Set<string>;
  onHoleClick: (point: Point, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
  onCanvasClick: () => void;
  onBoxSelect: (keys: Set<string>, additive: boolean) => void;
};

export type CanvasPointerHandlers = {
  onClick: (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onMouseLeave: () => void;
};

export type PointerInteraction = {
  selectionBox: SelectionBox | null;
  handlers: CanvasPointerHandlers;
};

/**
 * Owns pointer-driven interaction on the canvas: click-to-select, drag box
 * select, and alt/middle-drag panning, plus the live selection rectangle and
 * hover cursor. Panning is fed through scheduleViewport for smoothness.
 */
export default function usePointerInteraction({
  canvasRef,
  boardDiameter,
  viewport,
  scheduleViewport,
  hitTest,
  queryBox,
  onHoleClick,
  onCanvasClick,
  onBoxSelect,
}: PointerInteractionArgs): PointerInteraction {
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const getHitPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return hitTest(screenToWorld(clientX, clientY, rect, viewport, boardDiameter));
    },
    [boardDiameter, canvasRef, hitTest, viewport],
  );

  const selectBox = useCallback(
    (box: SelectionBox, additive: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const start = screenToWorld(box.startX, box.startY, rect, viewport, boardDiameter);
      const end = screenToWorld(box.endX, box.endY, rect, viewport, boardDiameter);
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      onBoxSelect(queryBox(minX, minY, maxX, maxY), additive);
    },
    [boardDiameter, canvasRef, onBoxSelect, queryBox, viewport],
  );

  const onClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const hit = getHitPoint(event.clientX, event.clientY);
      if (hit) {
        onHoleClick(hit, event);
      } else {
        onCanvasClick();
      }
    },
    [getHitPoint, onCanvasClick, onHoleClick],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const mode = event.button === 1 || event.altKey ? 'pan' : 'select';
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
        moved: false,
        mode,
      };
      if (mode === 'select') {
        setSelectionBox({startX: event.clientX, startY: event.clientY, endX: event.clientX, endY: event.clientY});
      }
      canvas.setPointerCapture(event.pointerId);
    },
    [canvasRef, viewport.panX, viewport.panY],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        const moved = Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX;
        if (moved || drag.moved) {
          drag.moved = true;
          if (drag.mode === 'pan') {
            scheduleViewport({zoom: viewport.zoom, panX: drag.panX + dx, panY: drag.panY + dy});
            canvas.style.cursor = 'grabbing';
          } else {
            setSelectionBox({startX: drag.startX, startY: drag.startY, endX: event.clientX, endY: event.clientY});
            canvas.style.cursor = 'crosshair';
          }
          return;
        }
      }

      const hit = getHitPoint(event.clientX, event.clientY);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    },
    [getHitPoint, scheduleViewport, viewport.zoom],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const drag = dragRef.current;
      if (!canvas || drag?.pointerId !== event.pointerId) return;
      if (drag.moved) {
        suppressClickRef.current = true;
        if (drag.mode === 'select') {
          selectBox(
            {startX: drag.startX, startY: drag.startY, endX: event.clientX, endY: event.clientY},
            event.ctrlKey || event.metaKey,
          );
        }
      }
      dragRef.current = null;
      setSelectionBox(null);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = 'grab';
    },
    [canvasRef, selectBox],
  );

  const onMouseLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = 'grab';
  }, [canvasRef]);

  return {
    selectionBox,
    handlers: {onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onMouseLeave},
  };
}
