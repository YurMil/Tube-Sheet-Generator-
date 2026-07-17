import {useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import type {ThemeMode} from '../../hooks/useSyncedTheme';
import type {ModifiedHole, Point} from '../../types';
import {createPointKey} from '../../core/geometry-utils';
import {getSheetColors} from './colors';
import {renderScene} from './renderScene';
import type {PreviewParams} from './renderScene';
import {ZOOM_STEP} from './types';
import type {KeyedPoint} from './types';
import useCanvasSize from './hooks/useCanvasSize';
import useSpatialIndex from './hooks/useSpatialIndex';
import useViewport from './hooks/useViewport';
import useWheelZoom from './hooks/useWheelZoom';
import usePointerInteraction from './hooks/usePointerInteraction';
import ZoomControls from './ZoomControls';

export type PreviewCanvasProps = {
  points: Point[];
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
  const [visibleCount, setVisibleCount] = useState(points.length);

  // Precompute keys once per points change; the render path and spatial index
  // reuse them instead of rebuilding a key per point per frame.
  const keyedPoints = useMemo<KeyedPoint[]>(
    () => points.map((point) => ({point, key: createPointKey(point)})),
    [points],
  );

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
    });

    setVisibleCount((current) => (current === nextVisibleCount ? current : nextVisibleCount));
  }, [canvasSize, keyedPoints, modifiedHoles, params, selectedHoleKeys, selectionBox, themeMode, viewport]);

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
        totalCount={points.length}
        onZoomIn={() => zoomToCenter(ZOOM_STEP)}
        onZoomOut={() => zoomToCenter(1 / ZOOM_STEP)}
        onZoomChange={(zoom) => setViewport((current) => ({...current, zoom}))}
        onFit={resetViewport}
      />
    </>
  );
}
