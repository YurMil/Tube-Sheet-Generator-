import {useCallback, useMemo, useState} from 'react';
import GeneratorForm from './ui/GeneratorForm';
import PreviewCanvas from './ui/preview';
import ExportPanel from './ui/ExportPanel';
import PropertiesPanel from './ui/PropertiesPanel';
import useGeneratorState from './hooks/useGeneratorState';
import useSyncedTheme from './hooks/useSyncedTheme';
import useHoleEditing from './hooks/useHoleEditing';
import useSession from './hooks/useSession';
import {computeTubeStats} from './core/tube-stats';
import {keyPoints} from './core/geometry-utils';
import type {ModifiedHole} from './types';

export default function App() {
  const themeMode = useSyncedTheme();
  const {
    params,
    setParams,
    tubeCoords,
    layoutTooLarge,
    isGeneratingLayout,
    estimatedPointCount,
    handleChange,
    generateStep,
    workerStatus,
    workerError,
  } = useGeneratorState();

  const [modifiedHoles, setModifiedHoles] = useState<Map<string, ModifiedHole>>(new Map());

  // Single point-key computation per layout, shared by preview, editing and stats.
  const keyedTubes = useMemo(() => keyPoints(tubeCoords), [tubeCoords]);

  const editing = useHoleEditing({
    keyedTubes,
    tubeDiameter: params.tubeDiameter,
    modifiedHoles,
    setModifiedHoles,
  });

  const clearSelection = useCallback(() => editing.setSelectedHoleKeys(new Set()), [editing.setSelectedHoleKeys]);

  const session = useSession({
    params,
    setParams,
    tubeCoords,
    modifiedHoles,
    setModifiedHoles,
    clearSelection,
    generateStep,
  });

  const stats = useMemo(() => computeTubeStats(keyedTubes, modifiedHoles, params), [keyedTubes, modifiedHoles, params]);

  return (
    <main className="app-shell">
      <section className="controls-panel">
        <GeneratorForm params={params} onChange={handleChange} />

        <ExportPanel
          params={params}
          totalHoles={tubeCoords.length}
          stats={stats}
          layoutTooLarge={layoutTooLarge}
          estimatedPointCount={estimatedPointCount}
          workerStatus={workerStatus}
          workerError={workerError}
          isGeneratingStep={session.isGeneratingStep}
          generationStatus={session.generationStatus}
          stepError={session.stepError}
          sessionError={session.sessionError}
          importInputRef={session.importInputRef}
          onDownloadDXF={session.handleDownloadDXF}
          onExportSession={session.handleExportSession}
          onImportSession={session.handleImportSession}
          onDownloadSTEP={session.handleDownloadSTEP}
          onCancelSTEP={session.handleCancelSTEP}
        />
      </section>

      <section className="preview-panel">
        <div className="preview-frame">
          <PreviewCanvas
            keyedPoints={keyedTubes}
            params={params}
            modifiedHoles={modifiedHoles}
            selectedHoleKeys={editing.affectedHoleKeys}
            themeMode={themeMode}
            onHoleClick={editing.handleHoleClick}
            onCanvasClick={editing.handleCanvasClick}
            onBoxSelect={editing.handleBoxSelect}
            className="preview-canvas"
          />
          {isGeneratingLayout ? (
            <div className="preview-generating" role="status" aria-live="polite">
              <span className="preview-generating__spinner" aria-hidden="true" />
              Generating layout…
            </div>
          ) : null}
        </div>
        <p className="preview-note">
          Click holes to edit. Drag to box-select. Hold Ctrl or Cmd to add selections. Alt-drag or middle-drag pans.
        </p>
      </section>

      <PropertiesPanel
        selectedCount={editing.selectedCount}
        affectedCount={editing.affectedCount}
        selectedHoleType={editing.selectedHoleType}
        selectedHoleShape={editing.selectedHoleShape}
        selectedHidden={editing.selectedHidden}
        menuDiameter={editing.menuDiameter}
        mirrorHorizontal={editing.mirrorHorizontal}
        mirrorVertical={editing.mirrorVertical}
        onMenuDiameterChange={editing.setMenuDiameter}
        onApplyDiameter={editing.applyDiameter}
        onSetHidden={editing.setSelectedHidden}
        onSetShape={editing.setSelectedShape}
        onSetType={editing.setSelectedType}
        onMirrorHorizontal={editing.setMirrorHorizontal}
        onMirrorVertical={editing.setMirrorVertical}
        onReset={editing.resetSelectedHoles}
      />
    </main>
  );
}
