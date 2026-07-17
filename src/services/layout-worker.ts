/// <reference lib="webworker" />

import {computeLayoutPoints} from '../core/layout-strategies';
import {encodePoints} from './layout-worker-protocol';
import type {LayoutWorkerRequest, LayoutWorkerResult} from './layout-worker-protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const request = event.data;
  if (!request || typeof request !== 'object' || typeof request.requestId !== 'string') {
    return;
  }

  try {
    const points = computeLayoutPoints(request.params);
    const buffer = encodePoints(points);
    const message: LayoutWorkerResult = {requestId: request.requestId, ok: true, buffer};
    ctx.postMessage(message, [buffer]);
  } catch (error) {
    const message: LayoutWorkerResult = {
      requestId: request.requestId,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
    ctx.postMessage(message);
  }
};
