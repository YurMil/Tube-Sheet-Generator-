import type {ModifiedHole} from '../types';

/** A modified-hole record that carries no actual overrides and can be dropped. */
export const isModifiedHoleDefault = (hole: ModifiedHole) =>
  !hole.hidden && hole.diameter === undefined && hole.shape === undefined && hole.type === undefined;
