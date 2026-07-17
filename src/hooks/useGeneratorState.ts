import {useCallback, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import type React from 'react';
import {DEFAULT_PARAMS, MAX_TUBE_POINTS} from '../constants';
import {getLayoutStrategy} from '../core/layout-strategies';
import {estimateLayoutPointCount, isWithinCutoffZone} from '../core/geometry-utils';
import type {GeneratorParams, ModifiedHole, Point} from '../types';
import {generateStepInWorker, warmupCadWorker} from '../services/cad-worker-client';
import type {CadWorkerProgressMessage} from '../services/cad-worker-protocol';

type WorkerStatus = 'idle' | 'warming' | 'ready' | 'error';

const clampPositive = (value: number, min = 0) => (Number.isFinite(value) ? Math.max(min, value) : min);
const toSafeNumber = (value: string, fallback: number) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type UseGeneratorStateResult = {
  params: GeneratorParams;
  setParams: React.Dispatch<React.SetStateAction<GeneratorParams>>;
  tubeCoords: Point[];
  layoutTooLarge: boolean;
  estimatedPointCount: number;
  handleChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  workerStatus: WorkerStatus;
  workerError: string | null;
  warmupWorker: () => Promise<void>;
  generateStep: (options?: {
    onProgress?: (message: CadWorkerProgressMessage) => void;
    modifiedHoles?: Map<string, ModifiedHole>;
    timeoutMs?: number;
  }) => Promise<ArrayBuffer>;
};

export default function useGeneratorState(): UseGeneratorStateResult {
  const [params, setParams] = useState<GeneratorParams>(DEFAULT_PARAMS);
  const [workerStatus, setWorkerStatus] = useState<WorkerStatus>('idle');
  const [workerError, setWorkerError] = useState<string | null>(null);
  const warmupStarted = useRef(false);

  // Keep form inputs responsive: the expensive layout runs against a deferred
  // copy of params, so typing never blocks on the point computation.
  const deferredParams = useDeferredValue(params);

  const estimatedPointCount = useMemo(
    () => estimateLayoutPointCount(deferredParams),
    [deferredParams],
  );

  // Guard against pathological inputs (huge diameter + tiny pitch) that would
  // otherwise spin an O((D/pitch)^2) loop on the main thread and freeze the tab.
  const layoutTooLarge = estimatedPointCount > MAX_TUBE_POINTS;

  const tubeCoords = useMemo<Point[]>(() => {
    if (layoutTooLarge) {
      return [];
    }
    return getLayoutStrategy(deferredParams.tubeLayout)
      .calculatePoints(deferredParams)
      .filter((point) => !isWithinCutoffZone(point, deferredParams));
  }, [deferredParams, layoutTooLarge]);

  const warmupWorker = useCallback(async () => {
    if (workerStatus === 'ready') return;
    if (workerStatus === 'warming') return;
    setWorkerStatus('warming');
    setWorkerError(null);
    try {
      await warmupCadWorker();
      setWorkerStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setWorkerError(message);
      setWorkerStatus('error');
      throw error;
    }
  }, [workerStatus]);

  useEffect(() => {
    if (warmupStarted.current) return;
    warmupStarted.current = true;
    void warmupWorker();
  }, [warmupWorker]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const {name, value, type} = event.target;
    setParams((prev) => {
      const key = name as keyof GeneratorParams;
      if (type !== 'number') {
        return {...prev, [key]: value} as GeneratorParams;
      }

      const fallback = prev[key] as number;
      const parsed = toSafeNumber(value, fallback);

      if (name === 'passCount') {
        return {...prev, [key]: Math.max(1, Math.round(parsed))} as GeneratorParams;
      }

      return {...prev, [key]: clampPositive(parsed)} as GeneratorParams;
    });
  }, []);

  const generateStep = useCallback(
    async (options?: {
      onProgress?: (message: CadWorkerProgressMessage) => void;
      modifiedHoles?: Map<string, ModifiedHole>;
      timeoutMs?: number;
    }) => {
      if (workerStatus !== 'ready') {
        await warmupWorker();
      }
      return generateStepInWorker(params, tubeCoords, options?.modifiedHoles, {
        onProgress: options?.onProgress,
        timeoutMs: options?.timeoutMs,
      });
    },
    [params, tubeCoords, warmupWorker, workerStatus],
  );

  return {
    params,
    setParams,
    tubeCoords,
    layoutTooLarge,
    estimatedPointCount,
    handleChange,
    workerStatus,
    workerError,
    warmupWorker,
    generateStep,
  };
}
