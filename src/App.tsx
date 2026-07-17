import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import {buildTubeSheetDxf} from './services/dxf-exporter';
import GeneratorForm from './ui/GeneratorForm';
import PreviewCanvas from './ui/PreviewCanvas';
import useGeneratorState from './hooks/useGeneratorState';
import useSyncedTheme from './hooks/useSyncedTheme';
import {createPointKey} from './core/geometry-utils';
import {cancelCadWorker, CadWorkerCancelledError} from './services/cad-worker-client';
import {MAX_TUBE_POINTS, STEP_TIMEOUT_MS} from './constants';
import type {GeneratorParams, HoleShape, HoleType, ModifiedHole, Point} from './types';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const isModifiedHoleDefault = (hole: ModifiedHole) =>
  !hole.hidden && hole.diameter === undefined && hole.shape === undefined && hole.type === undefined;

type SessionFile = {
  version?: number;
  params?: Partial<GeneratorParams>;
  modifiedHoles?: Array<[string, ModifiedHole]>;
};

export default function App() {
  const [isGeneratingStep, setIsGeneratingStep] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [modifiedHoles, setModifiedHoles] = useState<Map<string, ModifiedHole>>(new Map());
  const [selectedHoleKeys, setSelectedHoleKeys] = useState<Set<string>>(new Set());
  const [menuDiameter, setMenuDiameter] = useState('');
  const [mirrorHorizontal, setMirrorHorizontal] = useState(false);
  const [mirrorVertical, setMirrorVertical] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const themeMode = useSyncedTheme();
  const {
    params,
    setParams,
    tubeCoords,
    layoutTooLarge,
    estimatedPointCount,
    handleChange,
    generateStep,
    workerStatus,
    workerError,
  } = useGeneratorState();

  const pointByKey = useMemo(() => {
    const next = new Map<string, Point>();
    tubeCoords.forEach((point) => next.set(createPointKey(point), point));
    return next;
  }, [tubeCoords]);

  const tubeStats = useMemo(() => {
    let hidden = 0;
    let tieRods = 0;

    tubeCoords.forEach((point) => {
      const modified = modifiedHoles.get(createPointKey(point));
      if (modified?.hidden) {
        hidden += 1;
        return;
      }
      if (modified?.type === 'tieRod') {
        tieRods += 1;
      }
    });

    const cutHoles = Math.max(0, tubeCoords.length - hidden);
    const activeTubes = Math.max(0, cutHoles - tieRods);

    return {hidden, tieRods, cutHoles, activeTubes};
  }, [modifiedHoles, tubeCoords]);

  const heatTransferArea = tubeStats.activeTubes * Math.PI * params.tubeDiameter * params.tubeLength;
  const pitchRatioWarning = params.tubePitch < params.tubeDiameter * 1.25;

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

  const affectedCount = affectedHoleKeys.size;

  const handleDownloadDXF = () => {
    const dxf = buildTubeSheetDxf(params, tubeCoords, modifiedHoles);
    const blob = new Blob([dxf], {type: 'application/dxf'});
    downloadBlob(blob, `tubesheet_${params.boardDiameter}mm.dxf`);
  };

  const handleCancelSTEP = () => {
    cancelCadWorker();
  };

  const handleDownloadSTEP = async () => {
    setIsGeneratingStep(true);
    setStepError(null);
    setGenerationStatus('Starting CAD worker...');

    try {
      const stepArrayBuffer = await generateStep({
        modifiedHoles,
        timeoutMs: STEP_TIMEOUT_MS,
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
      if (error instanceof CadWorkerCancelledError) {
        setStepError(null);
      } else {
        console.error('STEP generation failed:', error);
        setStepError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsGeneratingStep(false);
      setGenerationStatus('');
    }
  };

  const handleHoleClick = (point: Point, event: React.MouseEvent<HTMLCanvasElement, MouseEvent>) => {
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
  };

  const handleCanvasClick = () => {
    setSelectedHoleKeys(new Set());
  };

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

  const selectedFirstKey = selectedHoleKeys.values().next().value as string | undefined;
  const selectedFirstModified = selectedFirstKey ? modifiedHoles.get(selectedFirstKey) : undefined;
  const selectedHoleType: HoleType = selectedFirstModified?.type ?? 'tube';
  const selectedHoleShape: HoleShape = selectedFirstModified?.shape ?? 'circle';
  const selectedHidden = selectedFirstKey ? modifiedHoles.get(selectedFirstKey)?.hidden === true : false;

  useEffect(() => {
    if (!selectedFirstKey) {
      setMenuDiameter(String(params.tubeDiameter));
      return;
    }
    setMenuDiameter(String(selectedFirstModified?.diameter ?? params.tubeDiameter));
  }, [params.tubeDiameter, selectedFirstKey, selectedFirstModified?.diameter]);

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

  const handleExportSession = () => {
    const session: SessionFile = {
      version: 1,
      params,
      modifiedHoles: Array.from(modifiedHoles.entries()),
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], {type: 'application/json'});
    downloadBlob(blob, `tubesheet_${params.boardDiameter}mm_session.json`);
  };

  const normalizeImportedParams = (input: Partial<GeneratorParams> | undefined) => {
    if (!input || typeof input !== 'object') return params;
    const next = {...params};
    const numberKeys: Array<keyof GeneratorParams> = [
      'boardDiameter',
      'thickness',
      'tubeDiameter',
      'tubeLength',
      'tubePitch',
      'edgeMargin',
      'topCutoffChord',
      'bottomCutoffChord',
      'passCount',
      'partitionWidth',
    ];

    numberKeys.forEach((key) => {
      const value = input[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        (next[key] as number) = key === 'passCount' ? Math.max(1, Math.round(value)) : Math.max(0, value);
      }
    });

    if (
      input.tubeLayout === 'triangular30' ||
      input.tubeLayout === 'triangular' ||
      input.tubeLayout === 'square45' ||
      input.tubeLayout === 'square'
    ) {
      next.tubeLayout = input.tubeLayout;
    }
    if (input.partitionOrientation === 'horizontal' || input.partitionOrientation === 'vertical') {
      next.partitionOrientation = input.partitionOrientation;
    }

    return next;
  };

  const handleImportSession = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as SessionFile;
      const nextModifiedHoles = new Map<string, ModifiedHole>();
      parsed.modifiedHoles?.forEach(([key, hole]) => {
        if (typeof key !== 'string' || !hole || typeof hole !== 'object') return;
        const nextHole: ModifiedHole = {};
        if (hole.hidden === true) nextHole.hidden = true;
        if (typeof hole.diameter === 'number' && Number.isFinite(hole.diameter) && hole.diameter > 0) {
          nextHole.diameter = hole.diameter;
        }
        if (hole.shape === 'square') nextHole.shape = 'square';
        if (hole.type === 'tieRod') nextHole.type = 'tieRod';
        if (!isModifiedHoleDefault(nextHole)) {
          nextModifiedHoles.set(key, nextHole);
        }
      });

      setParams(normalizeImportedParams(parsed.params));
      setModifiedHoles(nextModifiedHoles);
      setSelectedHoleKeys(new Set());
      setSessionError(null);
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    }
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

  const setSelectedType = (type: HoleType) => {
    updateSelectedHoles((current) => ({...current, type: type === 'tieRod' ? 'tieRod' : undefined}));
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
  }, [affectedHoleKeys]);

  return (
    <main className="app-shell">
      <section className="controls-panel">
        <GeneratorForm params={params} onChange={handleChange} />

        <div className="panel export-panel">
          <div className="metric-row">
            <span>Holes count</span>
            <strong>
              {tubeCoords.length} ({tubeStats.cutHoles})
            </strong>
          </div>
          <div className="metric-row">
            <span>Active tubes</span>
            <strong>{tubeStats.activeTubes}</strong>
          </div>
          <div className="metric-row">
            <span>Heat transfer area</span>
            <strong>{(heatTransferArea / 1_000_000).toFixed(3)} m²</strong>
          </div>
          {tubeStats.tieRods > 0 ? (
            <div className="metric-row">
              <span>Tie rods</span>
              <strong>{tubeStats.tieRods}</strong>
            </div>
          ) : null}
          {pitchRatioWarning ? (
            <p className="warning-text">
              Pitch warning: tube pitch should be at least {(params.tubeDiameter * 1.25).toFixed(2)} mm.
            </p>
          ) : null}
          {layoutTooLarge ? (
            <p className="error-text">
              Layout too large (~{estimatedPointCount.toLocaleString()} holes, limit{' '}
              {MAX_TUBE_POINTS.toLocaleString()}). Increase pitch or reduce diameter to preview and export.
            </p>
          ) : null}

          <div className="worker-status" data-status={workerStatus}>
            CAD worker: {workerStatus}
            {workerError ? <span> - {workerError}</span> : null}
          </div>

          <button
            type="button"
            className="button secondary"
            onClick={handleDownloadDXF}
            disabled={layoutTooLarge}
          >
            Download .DXF (2D)
          </button>

          <button type="button" className="button secondary" onClick={handleExportSession}>
            Export session .JSON
          </button>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            onChange={handleImportSession}
          />
          <button type="button" className="button secondary" onClick={() => importInputRef.current?.click()}>
            Import session .JSON
          </button>

          <button
            type="button"
            className="button primary"
            onClick={handleDownloadSTEP}
            disabled={isGeneratingStep || layoutTooLarge}
          >
            {isGeneratingStep ? 'Generating 3D...' : 'Download .STEP (3D)'}
          </button>

          {isGeneratingStep ? (
            <button type="button" className="button secondary" onClick={handleCancelSTEP}>
              Cancel generation
            </button>
          ) : null}

          {isGeneratingStep ? (
            <p className="status-text">{generationStatus || 'Processing geometry in the browser...'}</p>
          ) : null}
          {stepError ? <p className="error-text">STEP generation failed: {stepError}</p> : null}
          {sessionError ? <p className="error-text">Session import failed: {sessionError}</p> : null}
        </div>
      </section>

      <section className="preview-panel">
        <div className="preview-frame">
          <PreviewCanvas
            points={tubeCoords}
            params={params}
            modifiedHoles={modifiedHoles}
            selectedHoleKeys={affectedHoleKeys}
            themeMode={themeMode}
            onHoleClick={handleHoleClick}
            onCanvasClick={handleCanvasClick}
            onBoxSelect={handleBoxSelect}
            className="preview-canvas"
          />
        </div>
        <p className="preview-note">
          Click holes to edit. Drag to box-select. Hold Ctrl or Cmd to add selections. Alt-drag or middle-drag pans.
        </p>
      </section>

      <aside className="properties-panel panel">
        <div className="panel-header">
          <h2>Properties</h2>
        </div>
        <div className="panel-body properties-body">
          {selectedCount > 0 ? (
            <>
              <div className="property-summary">
                <strong>{selectedCount === 1 ? '1 hole selected' : `${selectedCount} holes selected`}</strong>
                {affectedCount > selectedCount ? <span>Affects {affectedCount} with symmetry</span> : null}
              </div>

              <label className="field">
                <span>Type</span>
                <select value={selectedHoleType} onChange={(event) => setSelectedType(event.target.value as HoleType)}>
                  <option value="tube">Tube</option>
                  <option value="tieRod">Tie Rod</option>
                </select>
              </label>

              <label className="field">
                <span>Diameter (mm)</span>
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
              <button type="button" className="button secondary" onClick={applyDiameter}>
                Apply diameter
              </button>

              <div className="segmented-controls" aria-label="Visibility">
                <button
                  type="button"
                  className={!selectedHidden ? 'is-active' : undefined}
                  onClick={() => setSelectedHidden(false)}
                >
                  Cut
                </button>
                <button
                  type="button"
                  className={selectedHidden ? 'is-active' : undefined}
                  onClick={() => setSelectedHidden(true)}
                >
                  Hidden
                </button>
              </div>

              <div className="segmented-controls" aria-label="Hole shape">
                <button
                  type="button"
                  className={selectedHoleShape === 'circle' ? 'is-active' : undefined}
                  onClick={() => setSelectedShape('circle')}
                >
                  Circle
                </button>
                <button
                  type="button"
                  className={selectedHoleShape === 'square' ? 'is-active' : undefined}
                  onClick={() => setSelectedShape('square')}
                >
                  Square
                </button>
              </div>

              <div className="property-box" aria-label="Symmetry options">
                <div className="property-box__title">Apply symmetry</div>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={mirrorHorizontal}
                    onChange={(event) => setMirrorHorizontal(event.target.checked)}
                  />
                  <span>Horizontal</span>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={mirrorVertical}
                    onChange={(event) => setMirrorVertical(event.target.checked)}
                  />
                  <span>Vertical</span>
                </label>
              </div>

              <button type="button" className="button danger" onClick={resetSelectedHoles}>
                Reset selected
              </button>
            </>
          ) : (
            <p className="empty-properties">Select one or more holes to edit type, diameter, visibility, and shape.</p>
          )}
        </div>
      </aside>
    </main>
  );
}
