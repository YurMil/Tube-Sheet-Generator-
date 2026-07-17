import type React from 'react';
import {MAX_TUBE_POINTS} from '../constants';
import type {TubeStats} from '../core/tube-stats';
import type {GeneratorParams} from '../types';

export type ExportPanelProps = {
  params: GeneratorParams;
  totalHoles: number;
  stats: TubeStats;
  layoutTooLarge: boolean;
  estimatedPointCount: number;
  workerStatus: string;
  workerError: string | null;
  isGeneratingStep: boolean;
  generationStatus: string;
  stepError: string | null;
  sessionError: string | null;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  onDownloadDXF: () => void;
  onExportSession: () => void;
  onImportSession: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadSTEP: () => void;
  onCancelSTEP: () => void;
};

export default function ExportPanel({
  params,
  totalHoles,
  stats,
  layoutTooLarge,
  estimatedPointCount,
  workerStatus,
  workerError,
  isGeneratingStep,
  generationStatus,
  stepError,
  sessionError,
  importInputRef,
  onDownloadDXF,
  onExportSession,
  onImportSession,
  onDownloadSTEP,
  onCancelSTEP,
}: ExportPanelProps) {
  const pitchRatioWarning = params.tubePitch < params.tubeDiameter * 1.25;

  return (
    <div className="panel export-panel">
      <div className="metric-row">
        <span>Holes count</span>
        <strong>
          {totalHoles} ({stats.cutHoles})
        </strong>
      </div>
      <div className="metric-row">
        <span>Active tubes</span>
        <strong>{stats.activeTubes}</strong>
      </div>
      <div className="metric-row">
        <span>Heat transfer area</span>
        <strong>{(stats.heatTransferArea / 1_000_000).toFixed(3)} m²</strong>
      </div>
      {stats.tieRods > 0 ? (
        <div className="metric-row">
          <span>Tie rods</span>
          <strong>{stats.tieRods}</strong>
        </div>
      ) : null}
      {pitchRatioWarning ? (
        <p className="warning-text">
          Pitch warning: tube pitch should be at least {(params.tubeDiameter * 1.25).toFixed(2)} mm.
        </p>
      ) : null}
      {stats.partitionConflicts > 0 ? (
        <p className="warning-text">
          {stats.partitionConflicts} tube{stats.partitionConflicts === 1 ? '' : 's'} overlap the pass partition lane and
          would collide with the partition plate.
        </p>
      ) : null}
      {stats.edgeOverflow > 0 ? (
        <p className="warning-text">
          {stats.edgeOverflow} hole{stats.edgeOverflow === 1 ? '' : 's'} extend past the sheet edge (custom diameter too
          large).
        </p>
      ) : null}
      {layoutTooLarge ? (
        <p className="error-text">
          Layout too large (~{estimatedPointCount.toLocaleString()} holes, limit {MAX_TUBE_POINTS.toLocaleString()}).
          Increase pitch or reduce diameter to preview and export.
        </p>
      ) : null}

      <div className="worker-status" data-status={workerStatus}>
        CAD worker: {workerStatus}
        {workerError ? <span> - {workerError}</span> : null}
      </div>

      <button type="button" className="button secondary" onClick={onDownloadDXF} disabled={layoutTooLarge}>
        Download .DXF (2D)
      </button>

      <button type="button" className="button secondary" onClick={onExportSession}>
        Export session .JSON
      </button>

      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={onImportSession}
      />
      <button type="button" className="button secondary" onClick={() => importInputRef.current?.click()}>
        Import session .JSON
      </button>

      <button
        type="button"
        className="button primary"
        onClick={onDownloadSTEP}
        disabled={isGeneratingStep || layoutTooLarge}
      >
        {isGeneratingStep ? 'Generating 3D...' : 'Download .STEP (3D)'}
      </button>

      {isGeneratingStep ? (
        <button type="button" className="button secondary" onClick={onCancelSTEP}>
          Cancel generation
        </button>
      ) : null}

      {isGeneratingStep ? (
        <p className="status-text">{generationStatus || 'Processing geometry in the browser...'}</p>
      ) : null}
      {stepError ? <p className="error-text">STEP generation failed: {stepError}</p> : null}
      {sessionError ? <p className="error-text">Session import failed: {sessionError}</p> : null}
    </div>
  );
}
