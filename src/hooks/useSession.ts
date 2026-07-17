import {useCallback, useRef, useState} from 'react';
import type React from 'react';
import {buildTubeSheetDxf} from '../services/dxf-exporter';
import {CadWorkerCancelledError, cancelCadWorker} from '../services/cad-worker-client';
import type {CadWorkerProgressMessage} from '../services/cad-worker-protocol';
import {isModifiedHoleDefault} from '../core/modified-hole';
import {STEP_TIMEOUT_MS} from '../constants';
import type {GeneratorParams, ModifiedHole, Point} from '../types';

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

type SessionFile = {
  version?: number;
  params?: Partial<GeneratorParams>;
  modifiedHoles?: Array<[string, ModifiedHole]>;
};

const NUMBER_KEYS: Array<keyof GeneratorParams> = [
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

const normalizeImportedParams = (
  current: GeneratorParams,
  input: Partial<GeneratorParams> | undefined,
): GeneratorParams => {
  if (!input || typeof input !== 'object') return current;
  const next = {...current};

  NUMBER_KEYS.forEach((key) => {
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

const sanitizeImportedHoles = (entries: SessionFile['modifiedHoles']): Map<string, ModifiedHole> => {
  const next = new Map<string, ModifiedHole>();
  entries?.forEach(([key, hole]) => {
    if (typeof key !== 'string' || !hole || typeof hole !== 'object') return;
    const nextHole: ModifiedHole = {};
    if (hole.hidden === true) nextHole.hidden = true;
    if (typeof hole.diameter === 'number' && Number.isFinite(hole.diameter) && hole.diameter > 0) {
      nextHole.diameter = hole.diameter;
    }
    if (hole.shape === 'square') nextHole.shape = 'square';
    if (hole.type === 'tieRod') nextHole.type = 'tieRod';
    if (!isModifiedHoleDefault(nextHole)) {
      next.set(key, nextHole);
    }
  });
  return next;
};

type UseSessionArgs = {
  params: GeneratorParams;
  setParams: React.Dispatch<React.SetStateAction<GeneratorParams>>;
  tubeCoords: Point[];
  modifiedHoles: Map<string, ModifiedHole>;
  setModifiedHoles: React.Dispatch<React.SetStateAction<Map<string, ModifiedHole>>>;
  clearSelection: () => void;
  generateStep: (options?: {
    onProgress?: (message: CadWorkerProgressMessage) => void;
    modifiedHoles?: Map<string, ModifiedHole>;
    timeoutMs?: number;
  }) => Promise<ArrayBuffer>;
};

/** Export/import handlers (DXF, STEP, JSON session) with their progress/error state. */
export default function useSession({
  params,
  setParams,
  tubeCoords,
  modifiedHoles,
  setModifiedHoles,
  clearSelection,
  generateStep,
}: UseSessionArgs) {
  const [isGeneratingStep, setIsGeneratingStep] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadDXF = useCallback(() => {
    const dxf = buildTubeSheetDxf(params, tubeCoords, modifiedHoles);
    downloadBlob(new Blob([dxf], {type: 'application/dxf'}), `tubesheet_${params.boardDiameter}mm.dxf`);
  }, [modifiedHoles, params, tubeCoords]);

  const handleCancelSTEP = useCallback(() => {
    cancelCadWorker();
  }, []);

  const handleDownloadSTEP = useCallback(async () => {
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

      downloadBlob(new Blob([stepArrayBuffer], {type: 'application/step'}), `tubesheet_${params.boardDiameter}mm.step`);
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
  }, [generateStep, modifiedHoles, params.boardDiameter]);

  const handleExportSession = useCallback(() => {
    const session: SessionFile = {
      version: 1,
      params,
      modifiedHoles: Array.from(modifiedHoles.entries()),
    };
    const blob = new Blob([JSON.stringify(session, null, 2)], {type: 'application/json'});
    downloadBlob(blob, `tubesheet_${params.boardDiameter}mm_session.json`);
  }, [modifiedHoles, params]);

  const handleImportSession = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const parsed = JSON.parse(await file.text()) as SessionFile;
        setParams((current) => normalizeImportedParams(current, parsed.params));
        setModifiedHoles(sanitizeImportedHoles(parsed.modifiedHoles));
        clearSelection();
        setSessionError(null);
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : String(error));
      }
    },
    [clearSelection, setModifiedHoles, setParams],
  );

  return {
    isGeneratingStep,
    generationStatus,
    stepError,
    sessionError,
    importInputRef,
    handleDownloadDXF,
    handleCancelSTEP,
    handleDownloadSTEP,
    handleExportSession,
    handleImportSession,
  };
}
