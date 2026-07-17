import {useCallback, useEffect, useMemo, useState} from 'react';
import type React from 'react';
import {createPointKey} from '../core/geometry-utils';
import {isModifiedHoleDefault} from '../core/modified-hole';
import type {HoleShape, HoleType, ModifiedHole, Point} from '../types';

type UseHoleEditingArgs = {
  tubeCoords: Point[];
  tubeDiameter: number;
  modifiedHoles: Map<string, ModifiedHole>;
  setModifiedHoles: React.Dispatch<React.SetStateAction<Map<string, ModifiedHole>>>;
};

/**
 * Owns hole selection (single/toggle/box, plus symmetry mirroring) and the
 * per-hole edit operations (type, diameter, visibility, shape, reset). Keeps
 * the selection in sync with the current layout and wires keyboard shortcuts.
 */
export default function useHoleEditing({tubeCoords, tubeDiameter, modifiedHoles, setModifiedHoles}: UseHoleEditingArgs) {
  const [selectedHoleKeys, setSelectedHoleKeys] = useState<Set<string>>(new Set());
  const [menuDiameter, setMenuDiameter] = useState('');
  const [mirrorHorizontal, setMirrorHorizontal] = useState(false);
  const [mirrorVertical, setMirrorVertical] = useState(false);

  const pointByKey = useMemo(() => {
    const next = new Map<string, Point>();
    tubeCoords.forEach((point) => next.set(createPointKey(point), point));
    return next;
  }, [tubeCoords]);

  const affectedHoleKeys = useMemo(() => {
    const next = new Set<string>();
    const addExistingPoint = (point: Point) => {
      const key = createPointKey(point);
      if (pointByKey.has(key)) {
        next.add(key);
      }
    };

    selectedHoleKeys.forEach((key) => {
      const point = pointByKey.get(key);
      if (!point) return;

      addExistingPoint(point);
      if (mirrorHorizontal) {
        addExistingPoint({x: -point.x, y: point.y});
      }
      if (mirrorVertical) {
        addExistingPoint({x: point.x, y: -point.y});
      }
      if (mirrorHorizontal && mirrorVertical) {
        addExistingPoint({x: -point.x, y: -point.y});
      }
    });

    return next;
  }, [mirrorHorizontal, mirrorVertical, pointByKey, selectedHoleKeys]);

  const selectedFirstKey = selectedHoleKeys.values().next().value as string | undefined;
  const selectedFirstModified = selectedFirstKey ? modifiedHoles.get(selectedFirstKey) : undefined;
  const selectedHoleType: HoleType = selectedFirstModified?.type ?? 'tube';
  const selectedHoleShape: HoleShape = selectedFirstModified?.shape ?? 'circle';
  const selectedHidden = selectedFirstModified?.hidden === true;

  useEffect(() => {
    if (!selectedFirstKey) {
      setMenuDiameter(String(tubeDiameter));
      return;
    }
    setMenuDiameter(String(selectedFirstModified?.diameter ?? tubeDiameter));
  }, [selectedFirstKey, selectedFirstModified?.diameter, tubeDiameter]);

  // Drop selections whose points no longer exist after a layout change.
  useEffect(() => {
    setSelectedHoleKeys((prev) => {
      const next = new Set<string>();
      prev.forEach((key) => {
        if (pointByKey.has(key)) {
          next.add(key);
        }
      });
      return next.size === prev.size ? prev : next;
    });
  }, [pointByKey]);

  const handleHoleClick = useCallback((point: Point, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const key = createPointKey(point);
    if (event.ctrlKey || event.metaKey) {
      setSelectedHoleKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      return;
    }
    setSelectedHoleKeys(new Set([key]));
  }, []);

  const handleCanvasClick = useCallback(() => {
    setSelectedHoleKeys(new Set());
  }, []);

  const handleBoxSelect = useCallback((keys: Set<string>, additive: boolean) => {
    setSelectedHoleKeys((prev) => {
      if (!additive) {
        return keys;
      }
      const next = new Set(prev);
      keys.forEach((key) => next.add(key));
      return next;
    });
  }, []);

  const updateSelectedHoles = useCallback(
    (updater: (current: ModifiedHole) => ModifiedHole) => {
      if (affectedHoleKeys.size === 0) return;
      setModifiedHoles((prev) => {
        const next = new Map(prev);
        affectedHoleKeys.forEach((key) => {
          const updated = updater(next.get(key) ?? {});
          if (isModifiedHoleDefault(updated)) {
            next.delete(key);
          } else {
            next.set(key, updated);
          }
        });
        return next;
      });
    },
    [affectedHoleKeys, setModifiedHoles],
  );

  const applyDiameter = useCallback(() => {
    const diameter = Number.parseFloat(menuDiameter);
    if (!Number.isFinite(diameter) || diameter <= 0) return;
    updateSelectedHoles((current) => ({...current, diameter}));
  }, [menuDiameter, updateSelectedHoles]);

  const setSelectedHidden = useCallback(
    (hidden: boolean) => updateSelectedHoles((current) => ({...current, hidden: hidden || undefined})),
    [updateSelectedHoles],
  );

  const setSelectedShape = useCallback(
    (shape: HoleShape) =>
      updateSelectedHoles((current) => ({...current, shape: shape === 'square' ? 'square' : undefined})),
    [updateSelectedHoles],
  );

  const setSelectedType = useCallback(
    (type: HoleType) =>
      updateSelectedHoles((current) => ({...current, type: type === 'tieRod' ? 'tieRod' : undefined})),
    [updateSelectedHoles],
  );

  const resetSelectedHoles = useCallback(() => {
    if (affectedHoleKeys.size === 0) return;
    setModifiedHoles((prev) => {
      const next = new Map(prev);
      affectedHoleKeys.forEach((key) => next.delete(key));
      return next;
    });
  }, [affectedHoleKeys, setModifiedHoles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement;
      if (isEditing) return;

      if (event.key === 'Escape') {
        setSelectedHoleKeys(new Set());
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && affectedHoleKeys.size > 0) {
        event.preventDefault();
        updateSelectedHoles((current) => ({...current, hidden: true}));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [affectedHoleKeys, updateSelectedHoles]);

  return {
    selectedHoleKeys,
    setSelectedHoleKeys,
    affectedHoleKeys,
    selectedCount: selectedHoleKeys.size,
    affectedCount: affectedHoleKeys.size,
    menuDiameter,
    setMenuDiameter,
    mirrorHorizontal,
    setMirrorHorizontal,
    mirrorVertical,
    setMirrorVertical,
    selectedHoleType,
    selectedHoleShape,
    selectedHidden,
    handleHoleClick,
    handleCanvasClick,
    handleBoxSelect,
    applyDiameter,
    setSelectedHidden,
    setSelectedShape,
    setSelectedType,
    resetSelectedHoles,
  };
}
