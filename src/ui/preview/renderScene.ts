import type {GeneratorParams, ModifiedHole, Point} from '../../types';
import {getPartitionOffsets} from '../../core/geometry-utils';
import type {SheetColors} from './colors';
import type {KeyedPoint, SelectionBox, Viewport} from './types';

export type PreviewParams = Pick<
  GeneratorParams,
  'boardDiameter' | 'tubeDiameter' | 'tubePitch' | 'passCount' | 'partitionWidth' | 'partitionOrientation'
>;

export type RenderSceneArgs = {
  ctx: CanvasRenderingContext2D;
  rect: {width: number; height: number};
  viewport: Viewport;
  keyedPoints: KeyedPoint[];
  modifiedHoles: Map<string, ModifiedHole>;
  selectedHoleKeys: Set<string>;
  colors: SheetColors;
  params: PreviewParams;
  selectionBox: SelectionBox | null;
  rectLeft: number;
  rectTop: number;
  /** Precomputed radius of the outermost active hole centre (view-independent). */
  outerTubeLimitRadius: number;
};

/**
 * Draws the whole preview (board, holes, outer-tube-limit circle, partitions
 * and selection box) and returns how many holes were actually painted after
 * culling. Pure with respect to its inputs apart from writing to `ctx`.
 */
export const renderScene = ({
  ctx,
  rect,
  viewport,
  keyedPoints,
  modifiedHoles,
  selectedHoleKeys,
  colors,
  params,
  selectionBox,
  rectLeft,
  rectTop,
  outerTubeLimitRadius,
}: RenderSceneArgs): number => {
  ctx.clearRect(0, 0, rect.width, rect.height);

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
  let nextVisibleCount = 0;

  ctx.save();
  ctx.translate(originX, originY);

  ctx.beginPath();
  ctx.arc(0, 0, (params.boardDiameter / 2) * scale, 0, 2 * Math.PI);
  ctx.fillStyle = colors.boardFill;
  ctx.fill();
  ctx.strokeStyle = colors.boardStroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Hot path: the common large layout has no per-hole overrides or selection,
  // so every hole is a plain nominal-radius dot. In that case we skip the
  // per-point Map.get / Set.has lookups entirely (those dominate the frame at
  // 50k+ holes) and draw directly. Modified/selected holes take the full path.
  const nominalRadiusPx = (params.tubeDiameter / 2) * scale;
  const useFastDot = nominalRadiusPx < 1.4;
  const hasOverrides = modifiedHoles.size > 0 || selectedHoleKeys.size > 0;

  const isCulled = (coord: Point) =>
    coord.x < visibleMinX - cullPadding ||
    coord.x > visibleMaxX + cullPadding ||
    coord.y < visibleMinY - cullPadding ||
    coord.y > visibleMaxY + cullPadding;

  const drawPlainAt = (coord: Point) => {
    const drawX = coord.x * scale;
    const drawY = -coord.y * scale;
    if (useFastDot) {
      ctx.fillRect(drawX - 0.9, drawY - 0.9, 1.8, 1.8);
    } else {
      ctx.beginPath();
      ctx.arc(drawX, drawY, nominalRadiusPx, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const drawSpecial = (coord: Point, modified: ModifiedHole | undefined, selected: boolean) => {
    const isHidden = modified?.hidden === true;
    const isSpacer = modified?.diameter !== undefined;
    const isSquare = modified?.shape === 'square';
    const isTieRod = modified?.type === 'tieRod';
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

    drawHolePath();

    if (isHidden) {
      ctx.fillStyle = colors.hiddenFill;
      ctx.strokeStyle = colors.hiddenStroke;
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
      ctx.fillStyle = colors.tieRodFill;
      ctx.fill();
    } else if (isSpacer) {
      ctx.fillStyle = colors.spacerFill;
      ctx.fill();
    } else {
      ctx.fillStyle = colors.holeFill;
      ctx.fill();
    }

    if (selected) {
      drawHolePath(4);
      ctx.strokeStyle = colors.selectedStroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };

  ctx.fillStyle = colors.holeFill;
  keyedPoints.forEach(({point: coord, key}) => {
    if (isCulled(coord)) {
      return;
    }
    nextVisibleCount += 1;

    if (!hasOverrides) {
      drawPlainAt(coord);
      return;
    }

    const modified = modifiedHoles.get(key);
    const selected = selectedHoleKeys.has(key);
    const isPlain =
      !selected &&
      !modified?.hidden &&
      modified?.diameter === undefined &&
      modified?.shape !== 'square' &&
      modified?.type !== 'tieRod';

    if (isPlain) {
      ctx.fillStyle = colors.holeFill;
      drawPlainAt(coord);
      return;
    }
    drawSpecial(coord, modified, selected);
  });

  if (outerTubeLimitRadius > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, outerTubeLimitRadius * scale, 0, 2 * Math.PI);
    ctx.strokeStyle = colors.otlStroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (params.passCount > 1) {
    const boardRadius = params.boardDiameter / 2;
    const halfPartition = params.partitionWidth / 2;

    ctx.strokeStyle = colors.partitionStroke;
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
    const left = Math.min(selectionBox.startX, selectionBox.endX) - rectLeft;
    const top = Math.min(selectionBox.startY, selectionBox.endY) - rectTop;
    const width = Math.abs(selectionBox.endX - selectionBox.startX);
    const height = Math.abs(selectionBox.endY - selectionBox.startY);
    ctx.fillStyle = colors.selectionFill;
    ctx.strokeStyle = colors.selectionStroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
    ctx.setLineDash([]);
  }

  return nextVisibleCount;
};
