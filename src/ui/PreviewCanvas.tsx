import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import RBush from 'rbush';
import type {ThemeMode} from '../hooks/useSyncedTheme';
import type {GeneratorParams, ModifiedHole, Point} from '../types';
import {createPointKey, getPartitionOffsets} from '../core/geometry-utils';

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 24;
const ZOOM_STEP = 1.25;
const DRAG_THRESHOLD_PX = 4;

type Viewport = {
  zoom: number;
  panX: number;
  panY: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
  moved: boolean;
  mode: 'pan' | 'select';
};

type SelectionBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type SpatialItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  point: Point;
  key: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readCanvasColor = (styles: CSSStyleDeclaration, name: string, fallback: string) => {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
};

export type PreviewCanvasProps = {
  points: Point[];
  params: Pick<
    GeneratorParams,
    | 'boardDiameter'
    | 'tubeDiameter'
    | 'tubePitch'
    | 'passCount'
    | 'partitionWidth'
    | 'partitionOrientation'
  >;
  modifiedHoles: Map<string, ModifiedHole>;
  selectedHoleKeys: Set<string>;
  themeMode: ThemeMode;
  onHoleClick: (point: Point, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => void;
  onCanvasClick: () => void;
  onBoxSelect: (keys: Set<string>, additive: boolean) => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function PreviewCanvas({
  points,
  params,
  modifiedHoles,
  selectedHoleKeys,
  themeMode,
  onHoleClick,
  onCanvasClick,
  onBoxSelect,
  className,
  style,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const resizeAnimationFrameRef = useRef<number | null>(null);
  const pendingViewportRef = useRef<Viewport | null>(null);
  const [viewport, setViewport] = useState<Viewport>({zoom: 1, panX: 0, panY: 0});
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({width: 0, height: 0});
  const [visibleCount, setVisibleCount] = useState(points.length);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  const spatialIndex = useMemo(() => {
    const tree = new RBush<SpatialItem>();
    tree.load(
      points.map((point) => {
        const key = createPointKey(point);
        const modified = modifiedHoles.get(key);
        const radius = (modified?.diameter ?? params.tubeDiameter) / 2;
        return {
          minX: point.x - radius,
          minY: point.y - radius,
          maxX: point.x + radius,
          maxY: point.y + radius,
          point,
          key,
        };
      }),
    );
    return tree;
  }, [modifiedHoles, params.tubeDiameter, points]);

  const scheduleViewport = useCallback((nextViewport: Viewport) => {
    pendingViewportRef.current = nextViewport;
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const next = pendingViewportRef.current;
      pendingViewportRef.current = null;
      if (next) {
        setViewport(next);
      }
    });
  }, []);

  const getCanvasMetrics = useCallback(
    (canvas: HTMLCanvasElement, nextViewport = viewport) => {
      const rect = canvas.getBoundingClientRect();
      const fitScale = Math.min(rect.width, rect.height) / (params.boardDiameter * 1.1);
      return {
        rect,
        centerX: rect.width / 2,
        centerY: rect.height / 2,
        scale: fitScale * nextViewport.zoom,
      };
    },
    [params.boardDiameter, viewport],
  );

  const getWorldPoint = useCallback(
    (
      clientX: number,
      clientY: number,
      nextViewport = viewport,
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const {rect, centerX, centerY, scale} = getCanvasMetrics(canvas, nextViewport);
      const localX = clientX - rect.left - centerX - nextViewport.panX;
      const localY = clientY - rect.top - centerY - nextViewport.panY;
      return {
        x: localX / scale,
        y: -localY / scale,
      };
    },
    [getCanvasMetrics, viewport],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, zoomFactor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const worldPoint = getWorldPoint(clientX, clientY);
      if (!worldPoint) return;
      const {rect, centerX, centerY} = getCanvasMetrics(canvas);
      const nextZoom = clamp(viewport.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      const fitScale = Math.min(rect.width, rect.height) / (params.boardDiameter * 1.1);
      const nextScale = fitScale * nextZoom;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      setViewport({
        zoom: nextZoom,
        panX: localX - centerX - worldPoint.x * nextScale,
        panY: localY - centerY + worldPoint.y * nextScale,
      });
    },
    [getCanvasMetrics, getWorldPoint, params.boardDiameter, viewport.zoom],
  );

  const zoomToCenter = useCallback(
    (zoomFactor: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, zoomFactor);
    },
    [zoomAt],
  );

  const resetViewport = useCallback(() => {
    setViewport({zoom: 1, panX: 0, panY: 0});
  }, []);

  const getHitPoint = useCallback(
    (clientX: number, clientY: number) => {
      const worldPoint = getWorldPoint(clientX, clientY);
      if (!worldPoint) return null;

      const candidates = spatialIndex.search({
        minX: worldPoint.x,
        minY: worldPoint.y,
        maxX: worldPoint.x,
        maxY: worldPoint.y,
      });
      let closest: {point: Point; distanceSq: number} | null = null;

      for (const candidate of candidates) {
        const point = candidate.point;
        const modified = modifiedHoles.get(candidate.key);
        const diameter = modified?.diameter ?? params.tubeDiameter;
        const radius = diameter / 2;
        const dx = point.x - worldPoint.x;
        const dy = point.y - worldPoint.y;
        const isSquare = modified?.shape === 'square';
        const isHit = isSquare
          ? Math.abs(dx) <= radius && Math.abs(dy) <= radius
          : Math.sqrt(dx * dx + dy * dy) <= radius;
        if (isHit) {
          const distanceSq = dx * dx + dy * dy;
          if (!closest || distanceSq < closest.distanceSq) {
            closest = {point, distanceSq};
          }
        }
      }
      return closest?.point ?? null;
    },
    [getWorldPoint, modifiedHoles, params.tubeDiameter, spatialIndex],
  );

  const selectBox = useCallback(
    (box: SelectionBox, additive: boolean) => {
      const start = getWorldPoint(box.startX, box.startY);
      const end = getWorldPoint(box.endX, box.endY);
      if (!start || !end) return;

      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      const keys = new Set<string>();

      spatialIndex.search({minX, minY, maxX, maxY}).forEach((item) => {
        if (item.point.x >= minX && item.point.x <= maxX && item.point.y >= minY && item.point.y <= maxY) {
          keys.add(item.key);
        }
      });

      onBoxSelect(keys, additive);
    },
    [getWorldPoint, onBoxSelect, spatialIndex],
  );

  const handleClick = useCallback(
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
    [getHitPoint, onHoleClick, onCanvasClick],
  );

  // Bind wheel natively with {passive: false}: React attaches onWheel passively,
  // so calling preventDefault there is ignored and warns in the console.
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
  }, []);

  const handlePointerDown = useCallback(
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
        setSelectionBox({
          startX: event.clientX,
          startY: event.clientY,
          endX: event.clientX,
          endY: event.clientY,
        });
      }
      canvas.setPointerCapture(event.pointerId);
    },
    [viewport.panX, viewport.panY],
  );

  const handleMove = useCallback(
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
            scheduleViewport({
              zoom: viewport.zoom,
              panX: drag.panX + dx,
              panY: drag.panY + dy,
            });
            canvas.style.cursor = 'grabbing';
          } else {
            setSelectionBox({
              startX: drag.startX,
              startY: drag.startY,
              endX: event.clientX,
              endY: event.clientY,
            });
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

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const drag = dragRef.current;
      if (!canvas || drag?.pointerId !== event.pointerId) return;
      if (drag.moved) {
        suppressClickRef.current = true;
        if (drag.mode === 'select') {
          selectBox(
            {
              startX: drag.startX,
              startY: drag.startY,
              endX: event.clientX,
              endY: event.clientY,
            },
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
    [selectBox],
  );

  const handleLeave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = 'grab';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setCanvasSize((current) => (current.width === width && current.height === height ? current : {width, height}));
    };

    const scheduleCanvasSizeSync = () => {
      if (resizeAnimationFrameRef.current !== null) return;
      resizeAnimationFrameRef.current = window.requestAnimationFrame(() => {
        resizeAnimationFrameRef.current = null;
        syncCanvasSize();
      });
    };

    syncCanvasSize();

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(scheduleCanvasSizeSync);
      resizeObserver.observe(canvas);
      return () => {
        resizeObserver.disconnect();
        if (resizeAnimationFrameRef.current !== null) {
          window.cancelAnimationFrame(resizeAnimationFrameRef.current);
          resizeAnimationFrameRef.current = null;
        }
      };
    }

    window.addEventListener('resize', scheduleCanvasSizeSync);
    return () => {
      window.removeEventListener('resize', scheduleCanvasSizeSync);
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
        resizeAnimationFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, rect.width, rect.height);
    const themeStyles = getComputedStyle(document.documentElement);
    const boardFill = readCanvasColor(themeStyles, '--preview-board-fill', '#f1f5f9');
    const boardStroke = readCanvasColor(themeStyles, '--preview-board-stroke', '#334155');
    const holeFill = readCanvasColor(themeStyles, '--preview-hole-fill', '#0ea5e9');
    const spacerFill = readCanvasColor(themeStyles, '--preview-spacer-fill', '#f97316');
    const tieRodFill = readCanvasColor(themeStyles, '--preview-tie-rod-fill', '#8b5cf6');
    const hiddenFill = readCanvasColor(themeStyles, '--preview-hidden-fill', 'rgba(15, 23, 42, 0.15)');
    const hiddenStroke = readCanvasColor(themeStyles, '--preview-hidden-stroke', '#94a3b8');
    const partitionStroke = readCanvasColor(themeStyles, '--preview-partition-stroke', '#ef4444');
    const selectedStroke = readCanvasColor(themeStyles, '--preview-selected-stroke', '#facc15');
    const otlStroke = readCanvasColor(themeStyles, '--preview-otl-stroke', '#10b981');

    const scale = (Math.min(rect.width, rect.height) / (params.boardDiameter * 1.1)) * viewport.zoom;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const originX = centerX + viewport.panX;
    const originY = centerY + viewport.panY;
    const visibleMinX = (0 - originX) / scale;
    const visibleMaxX = (rect.width - originX) / scale;
    const visibleMaxY = -(0 - originY) / scale;
    const visibleMinY = -(rect.height - originY) / scale;
    const cullPadding = Math.max(params.tubePitch ?? params.tubeDiameter, params.tubeDiameter);
    let outerTubeLimitRadius = 0;
    points.forEach((coord) => {
      if (!modifiedHoles.get(createPointKey(coord))?.hidden) {
        outerTubeLimitRadius = Math.max(outerTubeLimitRadius, Math.sqrt(coord.x * coord.x + coord.y * coord.y));
      }
    });
    let nextVisibleCount = 0;

    ctx.save();
    ctx.translate(originX, originY);

    ctx.beginPath();
    ctx.arc(0, 0, (params.boardDiameter / 2) * scale, 0, 2 * Math.PI);
    ctx.fillStyle = boardFill;
    ctx.fill();
    ctx.strokeStyle = boardStroke;
    ctx.lineWidth = 2;
    ctx.stroke();

    points.forEach((coord) => {
      const modified = modifiedHoles.get(createPointKey(coord));
      if (
        coord.x < visibleMinX - cullPadding ||
        coord.x > visibleMaxX + cullPadding ||
        coord.y < visibleMinY - cullPadding ||
        coord.y > visibleMaxY + cullPadding
      ) {
        return;
      }

      nextVisibleCount += 1;
      const isHidden = modified?.hidden === true;
      const isSpacer = modified?.diameter !== undefined;
      const isSquare = modified?.shape === 'square';
      const isTieRod = modified?.type === 'tieRod';
      const isSelected = selectedHoleKeys.has(createPointKey(coord));
      const radius = (modified?.diameter ?? params.tubeDiameter) / 2;
      const drawX = coord.x * scale;
      const drawY = -coord.y * scale;

      const drawHolePath = (padding = 0) => {
        const drawRadius = radius * scale + padding;
        ctx.beginPath();
        if (isSquare) {
          ctx.rect(drawX - drawRadius, drawY - drawRadius, drawRadius * 2, drawRadius * 2);
        } else {
          ctx.arc(drawX, drawY, drawRadius, 0, 2 * Math.PI);
        }
      };

      const radiusPx = radius * scale;
      const canDrawFastDot = radiusPx < 1.4 && !isHidden && !isSpacer && !isSquare && !isSelected && !isTieRod;

      if (canDrawFastDot) {
        ctx.fillStyle = holeFill;
        ctx.fillRect(drawX - 0.9, drawY - 0.9, 1.8, 1.8);
        return;
      }

      drawHolePath();

      if (isHidden) {
        ctx.fillStyle = hiddenFill;
        ctx.strokeStyle = hiddenStroke;
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        const crossSize = radius * scale * 0.85;
        ctx.beginPath();
        ctx.moveTo(drawX - crossSize, drawY - crossSize);
        ctx.lineTo(drawX + crossSize, drawY + crossSize);
        ctx.moveTo(drawX - crossSize, drawY + crossSize);
        ctx.lineTo(drawX + crossSize, drawY - crossSize);
        ctx.stroke();
      } else if (isTieRod) {
        ctx.fillStyle = tieRodFill;
        ctx.fill();
      } else if (isSpacer) {
        ctx.fillStyle = spacerFill;
        ctx.fill();
      } else {
        ctx.fillStyle = holeFill;
        ctx.fill();
      }

      if (isSelected) {
        drawHolePath(4);
        ctx.strokeStyle = selectedStroke;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    });

    if (outerTubeLimitRadius > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, outerTubeLimitRadius * scale, 0, 2 * Math.PI);
      ctx.strokeStyle = otlStroke;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (params.passCount > 1) {
      const boardRadius = params.boardDiameter / 2;
      const halfPartition = params.partitionWidth / 2;

      ctx.strokeStyle = partitionStroke;
      ctx.lineWidth = 1.5;

      const strokeLine = (x1: number, y1: number, x2: number, y2: number) => {
        ctx.beginPath();
        ctx.moveTo(x1 * scale, -y1 * scale);
        ctx.lineTo(x2 * scale, -y2 * scale);
        ctx.stroke();
      };

      getPartitionOffsets(params).forEach((offset) => {
        const halfSpan = Math.sqrt(Math.abs(boardRadius * boardRadius - offset * offset));
        if (params.partitionOrientation === 'horizontal') {
          strokeLine(-halfSpan, offset - halfPartition, halfSpan, offset - halfPartition);
          strokeLine(-halfSpan, offset + halfPartition, halfSpan, offset + halfPartition);
        } else {
          strokeLine(offset - halfPartition, -halfSpan, offset - halfPartition, halfSpan);
          strokeLine(offset + halfPartition, -halfSpan, offset + halfPartition, halfSpan);
        }
      });
    }

    ctx.restore();

    if (selectionBox) {
      const left = Math.min(selectionBox.startX, selectionBox.endX) - rect.left;
      const top = Math.min(selectionBox.startY, selectionBox.endY) - rect.top;
      const width = Math.abs(selectionBox.endX - selectionBox.startX);
      const height = Math.abs(selectionBox.endY - selectionBox.startY);
      ctx.fillStyle = 'rgba(29, 127, 215, 0.12)';
      ctx.strokeStyle = readCanvasColor(themeStyles, '--field-focus', '#1d7fd7');
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      ctx.setLineDash([]);
    }

    setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
  }, [canvasSize, modifiedHoles, params, points, selectedHoleKeys, selectionBox, themeMode, viewport]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
      if (resizeAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeAnimationFrameRef.current);
      }
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={style}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handleMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseLeave={handleLeave}
        onDoubleClick={resetViewport}
        onContextMenu={(event) => event.preventDefault()}
      />
      <div className="preview-zoom-controls" aria-label="Preview zoom controls">
        <button
          type="button"
          className="preview-zoom-button"
          onClick={() => zoomToCenter(1 / ZOOM_STEP)}
          aria-label="Zoom out"
        >
          -
        </button>
        <input
          className="preview-zoom-slider"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step="0.05"
          value={viewport.zoom}
          aria-label="Zoom level"
          onChange={(event) => setViewport((current) => ({...current, zoom: Number(event.target.value)}))}
        />
        <button
          type="button"
          className="preview-zoom-button"
          onClick={() => zoomToCenter(ZOOM_STEP)}
          aria-label="Zoom in"
        >
          +
        </button>
        <button type="button" className="preview-fit-button" onClick={resetViewport}>
          Fit
        </button>
        <div className="preview-zoom-readout">
          <strong>{Math.round(viewport.zoom * 100)}%</strong>
          <span>
            {visibleCount}/{points.length}
          </span>
        </div>
      </div>
    </>
  );
}
