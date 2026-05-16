import {useCallback, useEffect, useMemo, useState} from 'react';
import type React from 'react';
import {buildTubeSheetDxf} from './services/dxf-exporter';
import GeneratorForm from './ui/GeneratorForm';
import PreviewCanvas from './ui/PreviewCanvas';
import useGeneratorState from './hooks/useGeneratorState';
import useSyncedTheme from './hooks/useSyncedTheme';
import {createPointKey} from './core/geometry-utils';
import type {ModifiedHole, Point} from './types';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

type HoleMenuState = {
  x: number;
  y: number;
};

const isModifiedHoleDefault = (hole: ModifiedHole) =>
  !hole.hidden && hole.diameter === undefined && hole.shape === undefined;

const getMenuPosition = (event: React.MouseEvent<HTMLCanvasElement, MouseEvent>): HoleMenuState => {
  const menuWidth = 280;
  const menuHeight = 390;
  const margin = 12;
  return {
    x: Math.max(margin, Math.min(event.clientX, window.innerWidth - menuWidth - margin)),
    y: Math.max(margin, Math.min(event.clientY, window.innerHeight - menuHeight - margin)),
  };
};

export default function App() {
  const [isGeneratingStep, setIsGeneratingStep] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [modifiedHoles, setModifiedHoles] = useState<Map<string, ModifiedHole>>(new Map());
  const [selectedHoleKeys, setSelectedHoleKeys] = useState<Set<string>>(new Set());
  const [holeMenu, setHoleMenu] = useState<HoleMenuState | null>(null);
  const [pendingMenuPosition, setPendingMenuPosition] = useState<HoleMenuState | null>(null);
  const [menuDiameter, setMenuDiameter] = useState('');
  const [mirrorHorizontal, setMirrorHorizontal] = useState(false);
  const [mirrorVertical, setMirrorVertical] = useState(false);
  const themeMode = useSyncedTheme();
  const {params, tubeCoords, handleChange, generateStep, workerStatus, workerError} = useGeneratorState();

  const pointByKey = useMemo(() => {
    const next = new Map<string, Point>();
    tubeCoords.forEach((point) => next.set(createPointKey(point), point));
    return next;
  }, [tubeCoords]);

  const hiddenCount = useMemo(() => {
    let count = 0;
    modifiedHoles.forEach((value) => {
      if (value.hidden) {
        count += 1;
      }
    });
    return count;
  }, [modifiedHoles]);
  const effectiveCount = Math.max(0, tubeCoords.length - hiddenCount);

  const selectedCount = selectedHoleKeys.size;

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
        addExistingPoint({x: point.x, y: -point.y});
      }
      if (mirrorVertical) {
        addExistingPoint({x: -point.x, y: point.y});
      }
      if (mirrorHorizontal && mirrorVertical) {
        addExistingPoint({x: -point.x, y: -point.y});
      }
    });

    return next;
  }, [mirrorHorizontal, mirrorVertical, pointByKey, selectedHoleKeys]);

  const affectedCount = affectedHoleKeys.size;

  const openHoleMenu = useCallback(
    (position: HoleMenuState, keys: Set<string>) => {
      const firstKey = keys.values().next().value as string | undefined;
      const firstModified = firstKey ? modifiedHoles.get(firstKey) : undefined;
      setMenuDiameter(String(firstModified?.diameter ?? params.tubeDiameter));
      setHoleMenu(position);
    },
    [modifiedHoles, params.tubeDiameter],
  );

  const closeHoleMenu = useCallback(() => {
    setHoleMenu(null);
    setPendingMenuPosition(null);
  }, []);

  const handleDownloadDXF = () => {
    const dxf = buildTubeSheetDxf(params, tubeCoords, modifiedHoles);
    const blob = new Blob([dxf], {type: 'application/dxf'});
    downloadBlob(blob, `tubesheet_${params.boardDiameter}mm.dxf`);
  };

  const handleDownloadSTEP = async () => {
    setIsGeneratingStep(true);
    setStepError(null);
    setGenerationStatus('Starting CAD worker...');

    try {
      const stepArrayBuffer = await generateStep({
        modifiedHoles,
        onProgress: (message) => {
          if (message.stage === 'init') {
            setGenerationStatus('Loading CAD kernel...');
            return;
          }
          if (message.stage === 'export') {
            setGenerationStatus('Exporting STEP...');
            return;
          }
          const percent = message.total > 0 ? Math.round((message.done / message.total) * 100) : 0;
          setGenerationStatus(`Cutting holes... ${percent}% (${message.done}/${message.total})`);
        },
      });

      const blob = new Blob([stepArrayBuffer], {type: 'application/step'});
      downloadBlob(blob, `tubesheet_${params.boardDiameter}mm.step`);
    } catch (error) {
      console.error('STEP generation failed:', error);
      setStepError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsGeneratingStep(false);
      setGenerationStatus('');
    }
  };

  const handleHoleClick = (point: Point, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
    const key = createPointKey(point);
    const position = getMenuPosition(event);

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
      setPendingMenuPosition(position);
      setHoleMenu(null);
      return;
    }

    const nextSelection = new Set([key]);
    setSelectedHoleKeys(nextSelection);
    setPendingMenuPosition(null);
    openHoleMenu(position, nextSelection);
  };

  const handleCanvasClick = () => {
    setSelectedHoleKeys(new Set());
    closeHoleMenu();
  };

  const updateSelectedHoles = (updater: (current: ModifiedHole) => ModifiedHole) => {
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
  };

  const applyDiameter = () => {
    const diameter = Number.parseFloat(menuDiameter);
    if (!Number.isFinite(diameter) || diameter <= 0) return;
    updateSelectedHoles((current) => ({...current, diameter}));
  };

  const setSelectedHidden = (hidden: boolean) => {
    updateSelectedHoles((current) => ({...current, hidden: hidden || undefined}));
  };

  const setSelectedShape = (shape: 'circle' | 'square') => {
    updateSelectedHoles((current) => ({...current, shape: shape === 'square' ? 'square' : undefined}));
  };

  const resetSelectedHoles = () => {
    if (affectedHoleKeys.size === 0) return;
    setModifiedHoles((prev) => {
      const next = new Map(prev);
      affectedHoleKeys.forEach((key) => next.delete(key));
      return next;
    });
  };

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if ((event.key === 'Control' || event.key === 'Meta') && selectedHoleKeys.size > 0 && pendingMenuPosition) {
        openHoleMenu(pendingMenuPosition, selectedHoleKeys);
        setPendingMenuPosition(null);
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [openHoleMenu, pendingMenuPosition, selectedHoleKeys]);

  return (
    <main className="app-shell">
      <section className="controls-panel">
        <GeneratorForm params={params} onChange={handleChange} />

        <div className="panel export-panel">
          <div className="metric-row">
            <span>Holes count</span>
            <strong>
              {tubeCoords.length} ({effectiveCount})
            </strong>
          </div>

          <div className="worker-status" data-status={workerStatus}>
            CAD worker: {workerStatus}
            {workerError ? <span> - {workerError}</span> : null}
          </div>

          <button type="button" className="button secondary" onClick={handleDownloadDXF}>
            Download .DXF (2D)
          </button>

          <button
            type="button"
            className="button primary"
            onClick={handleDownloadSTEP}
            disabled={isGeneratingStep}
          >
            {isGeneratingStep ? 'Generating 3D...' : 'Download .STEP (3D)'}
          </button>

          {isGeneratingStep ? (
            <p className="status-text">{generationStatus || 'Processing geometry in the browser...'}</p>
          ) : null}
          {stepError ? <p className="error-text">STEP generation failed: {stepError}</p> : null}
        </div>
      </section>

      <section className="preview-panel">
        <div className="preview-frame">
          <PreviewCanvas
            points={tubeCoords}
            params={params}
            modifiedHoles={modifiedHoles}
            selectedHoleKeys={holeMenu ? affectedHoleKeys : selectedHoleKeys}
            themeMode={themeMode}
            onHoleClick={handleHoleClick}
            onCanvasClick={handleCanvasClick}
            className="preview-canvas"
          />
          {holeMenu && selectedCount > 0 ? (
            <div className="hole-menu" style={{left: holeMenu.x, top: holeMenu.y}}>
              <div className="hole-menu__title">
                {selectedCount === 1 ? 'Hole settings' : `${selectedCount} holes selected`}
              </div>
              {affectedCount > selectedCount ? (
                <div className="hole-menu__scope">Affects {affectedCount} holes with symmetry</div>
              ) : null}

              <label className="hole-menu__field">
                <span>Diameter, mm</span>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={menuDiameter}
                  onChange={(event) => setMenuDiameter(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      applyDiameter();
                    }
                  }}
                />
              </label>
              <button type="button" className="hole-menu__button" onClick={applyDiameter}>
                Apply diameter
              </button>

              <div className="hole-menu__symmetry" aria-label="Symmetry options">
                <div className="hole-menu__symmetry-title">Apply symmetry</div>
                <label className="hole-menu__check">
                  <input
                    type="checkbox"
                    checked={mirrorHorizontal}
                    onChange={(event) => setMirrorHorizontal(event.target.checked)}
                  />
                  <span>Horizontal</span>
                </label>
                <label className="hole-menu__check">
                  <input
                    type="checkbox"
                    checked={mirrorVertical}
                    onChange={(event) => setMirrorVertical(event.target.checked)}
                  />
                  <span>Vertical</span>
                </label>
              </div>

              <div className="hole-menu__grid">
                <button type="button" onClick={() => setSelectedHidden(true)}>
                  Do not cut
                </button>
                <button type="button" onClick={() => setSelectedHidden(false)}>
                  Cut
                </button>
                <button type="button" onClick={() => setSelectedShape('circle')}>
                  Circle
                </button>
                <button type="button" onClick={() => setSelectedShape('square')}>
                  Square
                </button>
              </div>

              <button type="button" className="hole-menu__button secondary" onClick={resetSelectedHoles}>
                Reset selected
              </button>
            </div>
          ) : null}
        </div>
        <p className="preview-note">
          Click holes to edit. Hold Ctrl or Cmd for multi-select. Use mouse wheel or the zoom controls to inspect dense sheets.
        </p>
      </section>
    </main>
  );
}
