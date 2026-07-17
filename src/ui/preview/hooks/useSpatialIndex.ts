import {useMemo} from 'react';
import RBush from 'rbush';
import type {ModifiedHole, Point} from '../../../types';
import type {KeyedPoint, SpatialItem} from '../types';

export type SpatialIndex = {
  /** Nearest hole whose shape actually contains the world point, or null. */
  hitTest: (world: Point) => Point | null;
  /** Keys of holes whose centres fall inside the world-space box. */
  queryBox: (minX: number, minY: number, maxX: number, maxY: number) => Set<string>;
};

/**
 * Builds an RBush index over the tube points (bounds sized by each hole's
 * radius) and exposes hit-testing and box-query helpers. Rebuilds only when
 * the points, edits or nominal diameter change.
 */
export default function useSpatialIndex(
  keyedPoints: KeyedPoint[],
  modifiedHoles: Map<string, ModifiedHole>,
  tubeDiameter: number,
): SpatialIndex {
  return useMemo<SpatialIndex>(() => {
    const tree = new RBush<SpatialItem>();
    tree.load(
      keyedPoints.map(({point, key}) => {
        const radius = (modifiedHoles.get(key)?.diameter ?? tubeDiameter) / 2;
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

    const hitTest = (world: Point): Point | null => {
      const candidates = tree.search({minX: world.x, minY: world.y, maxX: world.x, maxY: world.y});
      let closest: {point: Point; distanceSq: number} | null = null;

      for (const candidate of candidates) {
        const modified = modifiedHoles.get(candidate.key);
        const radius = (modified?.diameter ?? tubeDiameter) / 2;
        const dx = candidate.point.x - world.x;
        const dy = candidate.point.y - world.y;
        const isSquare = modified?.shape === 'square';
        const isHit = isSquare
          ? Math.abs(dx) <= radius && Math.abs(dy) <= radius
          : Math.sqrt(dx * dx + dy * dy) <= radius;
        if (isHit) {
          const distanceSq = dx * dx + dy * dy;
          if (!closest || distanceSq < closest.distanceSq) {
            closest = {point: candidate.point, distanceSq};
          }
        }
      }
      return closest?.point ?? null;
    };

    const queryBox = (minX: number, minY: number, maxX: number, maxY: number): Set<string> => {
      const keys = new Set<string>();
      tree.search({minX, minY, maxX, maxY}).forEach((item) => {
        if (item.point.x >= minX && item.point.x <= maxX && item.point.y >= minY && item.point.y <= maxY) {
          keys.add(item.key);
        }
      });
      return keys;
    };

    return {hitTest, queryBox};
  }, [keyedPoints, modifiedHoles, tubeDiameter]);
}
