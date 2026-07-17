import type {GeneratorParams, Point} from '../types';
import type {
  CadWorkerGenerateStepRequest,
  CadWorkerMessage,
  CadWorkerProgressMessage,
  CadWorkerWarmupRequest,
} from './cad-worker-protocol';

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

type PendingRequest = {
  resolve: (value: ArrayBuffer) => void;
  reject: (error: Error) => void;
  onProgress?: (message: CadWorkerProgressMessage) => void;
};

export class CadWorkerCancelledError extends Error {
  constructor(message = 'CAD worker request was cancelled.') {
    super(message);
    this.name = 'CadWorkerCancelledError';
  }
}

export class CadWorkerTimeoutError extends Error {
  constructor(message = 'CAD worker request timed out.') {
    super(message);
    this.name = 'CadWorkerTimeoutError';
  }
}

let worker: Worker | null = null;
const pending = new Map<string, PendingRequest>();

/**
 * Tear the worker down and reject every in-flight request. Called both on a
 * fatal worker error and on explicit cancellation so the next request always
 * spins up a fresh worker instead of talking to a dead one.
 */
const destroyWorker = (error: Error) => {
  const current = worker;
  worker = null;
  const handlers = Array.from(pending.values());
  pending.clear();
  handlers.forEach((handler) => handler.reject(error));
  if (current) {
    current.terminate();
  }
};

const getWorker = () => {
  if (worker) {
    return worker;
  }

  const instance = new Worker(new URL('./cad-worker.ts', import.meta.url), {type: 'module'});
  instance.addEventListener('message', (event: MessageEvent<CadWorkerMessage>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') {
      return;
    }

    if (message.type === 'progress') {
      const handler = pending.get(message.requestId);
      handler?.onProgress?.(message);
      return;
    }

    if (message.type === 'result') {
      const handler = pending.get(message.requestId);
      if (!handler) return;
      pending.delete(message.requestId);

      if (message.ok) {
        handler.resolve((message.payload as {step: ArrayBuffer}).step);
      } else {
        const payload = message.payload as {message: string; stack?: string};
        const err = new Error(payload.message);
        if (payload.stack) {
          err.stack = payload.stack;
        }
        handler.reject(err);
      }
    }
  });

  instance.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'CAD worker crashed.');
    // A worker `error` event means the instance is unusable. Reject everything
    // and drop the reference so the next call recreates a healthy worker.
    if (worker === instance) {
      destroyWorker(error);
    } else {
      const handlers = Array.from(pending.values());
      pending.clear();
      handlers.forEach((handler) => handler.reject(error));
      instance.terminate();
    }
  });

  worker = instance;
  return instance;
};

/**
 * Terminate the current worker (if any) and reject all pending requests.
 * Use this to cancel a long-running STEP generation from the UI.
 */
export const cancelCadWorker = () => {
  if (!worker && pending.size === 0) {
    return;
  }
  destroyWorker(new CadWorkerCancelledError());
};

export const warmupCadWorker = async () => {
  const requestId = createRequestId();
  const w = getWorker();
  await new Promise<ArrayBuffer>((resolve, reject) => {
    pending.set(requestId, {resolve, reject});
    const request: CadWorkerWarmupRequest = {type: 'warmup', requestId};
    w.postMessage(request);
  });
};

export const generateStepInWorker = async (
  params: GeneratorParams,
  tubeCoords: Point[],
  modifiedHoles?: Map<string, import('../types').ModifiedHole>,
  options?: {onProgress?: (message: CadWorkerProgressMessage) => void; timeoutMs?: number},
) => {
  const requestId = createRequestId();
  const w = getWorker();
  const timeoutMs = options?.timeoutMs;

  const step = await new Promise<ArrayBuffer>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };

    pending.set(requestId, {
      resolve: (value) => {
        cleanup();
        resolve(value);
      },
      reject: (error) => {
        cleanup();
        reject(error);
      },
      onProgress: options?.onProgress,
    });

    if (timeoutMs && timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (pending.has(requestId)) {
          // A silent OOM/hang never posts a result; the watchdog tears the
          // worker down so the UI gets a real error instead of freezing.
          destroyWorker(
            new CadWorkerTimeoutError(
              `CAD worker did not respond within ${Math.round(timeoutMs / 1000)}s. The model may be too large.`,
            ),
          );
        }
      }, timeoutMs);
    }

    const request: CadWorkerGenerateStepRequest = {
      type: 'generate-step',
      requestId,
      params,
      tubeCoords,
      modifiedHoles: modifiedHoles ? Array.from(modifiedHoles.entries()) : undefined,
    };
    w.postMessage(request);
  });

  return step;
};
