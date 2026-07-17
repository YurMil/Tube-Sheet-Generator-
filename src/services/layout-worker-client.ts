import type {GeneratorParams, Point} from '../types';
import {computeLayoutPoints} from '../core/layout-strategies';
import {decodePoints} from './layout-worker-protocol';
import type {LayoutWorkerRequest, LayoutWorkerResult} from './layout-worker-protocol';

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

type Pending = {
  resolve: (points: Point[]) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
const pending = new Map<string, Pending>();

const destroyWorker = (error: Error) => {
  const current = worker;
  worker = null;
  const handlers = Array.from(pending.values());
  pending.clear();
  handlers.forEach((handler) => handler.reject(error));
  current?.terminate();
};

const getWorker = (): Worker | null => {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;

  const instance = new Worker(new URL('./layout-worker.ts', import.meta.url), {type: 'module'});
  instance.addEventListener('message', (event: MessageEvent<LayoutWorkerResult>) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    const handler = pending.get(message.requestId);
    if (!handler) return;
    pending.delete(message.requestId);
    if (message.ok) {
      handler.resolve(decodePoints(message.buffer));
    } else {
      handler.reject(new Error(message.message));
    }
  });
  instance.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'Layout worker crashed.');
    if (worker === instance) {
      destroyWorker(error);
    }
  });

  worker = instance;
  return instance;
};

/**
 * Compute a layout off the main thread. Falls back to a synchronous compute if
 * a worker can't be created or the worker rejects, so callers always get points.
 */
export const requestLayout = (params: GeneratorParams): Promise<Point[]> => {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(computeLayoutPoints(params));
  }

  const requestId = createRequestId();
  return new Promise<Point[]>((resolve, reject) => {
    pending.set(requestId, {resolve, reject});
    const request: LayoutWorkerRequest = {requestId, params};
    w.postMessage(request);
  }).catch(() => computeLayoutPoints(params));
};
