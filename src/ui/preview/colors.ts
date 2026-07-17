import type {ThemeMode} from '../../hooks/useSyncedTheme';

export type SheetColors = {
  boardFill: string;
  boardStroke: string;
  holeFill: string;
  spacerFill: string;
  tieRodFill: string;
  hiddenFill: string;
  hiddenStroke: string;
  partitionStroke: string;
  selectedStroke: string;
  otlStroke: string;
  selectionFill: string;
  selectionStroke: string;
};

const readVar = (styles: CSSStyleDeclaration, name: string, fallback: string) => {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
};

const cache = new Map<ThemeMode, SheetColors>();

const readSheetColors = (): SheetColors => {
  const styles = getComputedStyle(document.documentElement);
  return {
    boardFill: readVar(styles, '--preview-board-fill', '#f1f5f9'),
    boardStroke: readVar(styles, '--preview-board-stroke', '#334155'),
    holeFill: readVar(styles, '--preview-hole-fill', '#0ea5e9'),
    spacerFill: readVar(styles, '--preview-spacer-fill', '#f97316'),
    tieRodFill: readVar(styles, '--preview-tie-rod-fill', '#8b5cf6'),
    hiddenFill: readVar(styles, '--preview-hidden-fill', 'rgba(15, 23, 42, 0.15)'),
    hiddenStroke: readVar(styles, '--preview-hidden-stroke', '#94a3b8'),
    partitionStroke: readVar(styles, '--preview-partition-stroke', '#ef4444'),
    selectedStroke: readVar(styles, '--preview-selected-stroke', '#facc15'),
    otlStroke: readVar(styles, '--preview-otl-stroke', '#10b981'),
    selectionFill: 'rgba(29, 127, 215, 0.12)',
    selectionStroke: readVar(styles, '--field-focus', '#1d7fd7'),
  };
};

/**
 * Theme colors resolved from CSS variables, cached per theme so the render
 * path no longer calls getComputedStyle on every frame. The theme is applied
 * to documentElement before this runs, so a cache miss reads the live values.
 */
export const getSheetColors = (themeMode: ThemeMode): SheetColors => {
  const cached = cache.get(themeMode);
  if (cached) {
    return cached;
  }
  const colors = readSheetColors();
  cache.set(themeMode, colors);
  return colors;
};
