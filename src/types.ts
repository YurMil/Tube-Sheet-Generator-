export type Point = {x: number; y: number};

/** A tube point paired with its precomputed string key (see createPointKey). */
export type KeyedPoint = {point: Point; key: string};

export type LayoutType = 'triangular30' | 'triangular' | 'square45' | 'square';
export type PartitionOrientation = 'horizontal' | 'vertical';

export type GeneratorParams = {
  boardDiameter: number;
  thickness: number;
  tubeDiameter: number;
  tubeLength: number;
  tubeLayout: LayoutType;
  tubePitch: number;
  edgeMargin: number;
  topCutoffChord: number;
  bottomCutoffChord: number;
  passCount: number;
  partitionWidth: number;
  partitionOrientation: PartitionOrientation;
};

export type HoleState = 'normal' | 'removed' | 'spacer';
export type HoleShape = 'circle' | 'square';
export type HoleType = 'tube' | 'tieRod';

export type ModifiedHole = {
  hidden?: boolean;
  diameter?: number;
  shape?: HoleShape;
  type?: HoleType;
};
