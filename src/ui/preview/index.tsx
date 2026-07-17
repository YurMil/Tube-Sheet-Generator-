import {useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import type {ThemeMode} from '../../hooks/useSyncedTheme';
import type {KeyedPoint, ModifiedHole, Point} from '../../types';
import {getSheetColors} from './colors';
import {renderScene} from './renderScene';
import type {PreviewParams} from './renderScene';
import {ZOOM_STEP} from './types';
import useCanvasSize from './hooks/useCanvasSize';
import useSpatialIndex from './hooks/useSpatialIndex';
import useViewport from './hooks/useViewport';
import useWheelZoom from './hooks/useWheelZoom';
import usePointerInteraction from './hooks/usePointerInteraction';
import ZoomControls from './ZoomControls';

export type PreviewCanvasProps = {
  keyedPoints: KeyedPoint[];
  params: PreviewParams;
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
  keyedPoints,
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
  const [visibleCount, setVisibleCount] = useState(keyedPoints.length);

  // View-independent: recompute only when the layout or hidden set changes, not
  // on every pan/zoom frame.
  const outerTubeLimitRadius = useMemo(() => {
    let max = 0;
    for (const {point, key} of keyedPoints) {
      if (!modifiedHoles.get(key)?.hidden) {
        const distance = Math.sqrt(point.x * point.x + point.y * point.y);
        if (distance > max) {
          max = distance;
        }
      }
    }
    return max;
  }, [keyedPoints, modifiedHoles]);

  const canvasSize = useCanvasSize(canvasRef);
  const {hitTest, queryBox} = useSpatialIndex(keyedPoints, modifiedHoles, params.tubeDiameter);
  const {viewport, setViewport, scheduleViewport, zoomAt, zoomToCenter, resetViewport} = useViewport(
    canvasRef,
    params.boardDiameter,
  );
  useWheelZoom(canvasRef, zoomAt);

  const {selectionBox, handlers} = usePointerInteraction({
    canvasRef,
    boardDiameter: params.boardDiameter,
    viewport,
    scheduleViewport,
    hitTest,
    queryBox,
    onHoleClick,
    onCanvasClick,
    onBoxSelect,
  });

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

    const nextVisibleCount = renderScene({
      ctx,
      rect: {width: rect.width, height: rect.height},
      viewport,
      keyedPoints,
      modifiedHoles,
      selectedHoleKeys,
      colors: getSheetColors(themeMode),
      params,
      selectionBox,
      rectLeft: rect.left,
      rectTop: rect.top,
      outerTubeLimitRadius,
    });

    setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
  }, [
    canvasSize,
    keyedPoints,
    modifiedHoles,
    outerTubeLimitRadius,
    params,
    selectedHoleKeys,
    selectionBox,
    themeMode,
    viewport,
  ]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        style={style}
        onClick={handlers.onClick}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerCancel}
        onMouseLeave={handlers.onMouseLeave}
        onDoubleClick={resetViewport}
        onContextMenu={(event) => event.preventDefault()}
      />
      <ZoomControls
        zoom={viewport.zoom}
        visibleCount={visibleCount}
        totalCount={keyedPoints.length}
        onZoomIn={() => zoomToCenter(ZOOM_STEP)}
        onZoomOut={() => zoomToCenter(1 / ZOOM_STEP)}
        onZoomChange={(zoom) => setViewport((current) => ({...current, zoom}))}
        onFit={resetViewport}
      />
    </>
  );
}
