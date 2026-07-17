import type {GeneratorParams} from './types';

export const DEFAULT_PARAMS: GeneratorParams = {
  boardDiameter: 500,
  thickness: 50,
  tubeDiameter: 25,
  tubeLength: 3000,
  tubeLayout: 'triangular',
  tubePitch: 32,
  edgeMargin: 15,
  topCutoffChord: 0,
  bottomCutoffChord: 0,
  passCount: 2,
  partitionWidth: 10,
  partitionOrientation: 'horizontal',
};

export const SPACER_SCALE = 1.15;

// Hard ceiling on generated tube points. Beyond this the synchronous layout,
// canvas render and STEP boolean cuts all degrade badly, so the UI refuses and
// asks the user to increase pitch / reduce diameter instead of freezing.
export const MAX_TUBE_POINTS = 100_000;

// Longest a STEP generation may run before the watchdog tears the worker down.
export const STEP_TIMEOUT_MS = 180_000;

// Grace period before showing the "Generating layout…" indicator. Fast layouts
// resolve well within this, so the indicator only appears for large ones and
// never flickers on ordinary edits.
export const LAYOUT_PENDING_DELAY_MS = 150;
