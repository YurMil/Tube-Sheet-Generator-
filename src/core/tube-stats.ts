import type {GeneratorParams, KeyedPoint, ModifiedHole} from '../types';
import {isWithinPartitionBand} from './geometry-utils';

export type TubeStats = {
  hidden: number;
  tieRods: number;
  cutHoles: number;
  activeTubes: number;
  /** Total outer heat-transfer surface of the active tubes, in mm². */
  heatTransferArea: number;
  /** Active holes overlapping a pass-partition band. */
  partitionConflicts: number;
  /** Active holes whose edge extends past the sheet perimeter. */
  edgeOverflow: number;
};

/**
 * Aggregate counts and the heat-transfer area for a tube layout, honouring each
 * hole's per-hole overrides (hidden / custom diameter / tie rod).
 */
export const computeTubeStats = (
  keyedTubes: KeyedPoint[],
  modifiedHoles: Map<string, ModifiedHole>,
  params: GeneratorParams,
): TubeStats => {
  let hidden = 0;
  let tieRods = 0;
  let heatTransferArea = 0;
  let partitionConflicts = 0;
  let edgeOverflow = 0;
  const boardRadius = params.boardDiameter / 2;

  keyedTubes.forEach(({point, key}) => {
    const modified = modifiedHoles.get(key);
    if (modified?.hidden) {
      hidden += 1;
      return;
    }

    const diameter = modified?.diameter ?? params.tubeDiameter;
    const radius = diameter / 2;

    if (Math.hypot(point.x, point.y) + radius > boardRadius + 1e-6) {
      edgeOverflow += 1;
    }
    if (isWithinPartitionBand(point, radius, params)) {
      partitionConflicts += 1;
    }

    if (modified?.type === 'tieRod') {
      tieRods += 1;
      return;
    }

    // Heat-transfer surface uses each active tube's real outer diameter, not
    // the nominal one, so mixed-diameter sheets report a correct area.
    heatTransferArea += Math.PI * diameter * params.tubeLength;
  });

  const cutHoles = Math.max(0, keyedTubes.length - hidden);
  const activeTubes = Math.max(0, cutHoles - tieRods);

  return {hidden, tieRods, cutHoles, activeTubes, heatTransferArea, partitionConflicts, edgeOverflow};
};
