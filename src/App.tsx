import {useMemo, useState} from 'react';
import {buildTubeSheetDxf} from './services/dxf-exporter';
import GeneratorForm from './ui/GeneratorForm';
import PreviewCanvas from './ui/PreviewCanvas';
import useGeneratorState from './hooks/useGeneratorState';
import {createPointKey} from './core/geometry-utils';
import {SPACER_SCALE} from './constants';
import type {ModifiedHole, Point} from './types';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export default function App() {
  const [isGeneratingStep, setIsGeneratingStep] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [modifiedHoles, setModifiedHoles] = useState<Map<string, ModifiedHole>>(new Map());
  const {params, tubeCoords, handleChange, generateStep, workerStatus, workerError} = useGeneratorState();

  const modifiedCount = useMemo(() => {
    let count = 0;
    modifiedHoles.forEach((value) => {
      if (value.hidden || value.diameter !== undefined) {
        count += 1;
      }
    });
    return count;
  }, [modifiedHoles]);
  const effectiveCount = Math.max(0, tubeCoords.length - modifiedCount);

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

  const toggleHoleState = (point: Point) => {
    const key = createPointKey(point);
    setModifiedHoles((prev) => {
      const next = new Map(prev);
      const current = next.get(key);

      if (!current) {
        next.set(key, {hidden: true});
        return next;
      }

      if (current.hidden) {
        next.set(key, {diameter: params.tubeDiameter * SPACER_SCALE});
        return next;
      }

      next.delete(key);
      return next;
    });
  };

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
            onToggleHole={toggleHoleState}
            className="preview-canvas"
          />
        </div>
        <p className="preview-note">Preview updates instantly. Click a hole to cycle remove, spacer, normal.</p>
      </section>
    </main>
  );
}
