import {describe, expect, it} from 'vitest';
import {getCanvasMetrics, getFitScale, screenToWorld} from './transform';
import type {Viewport} from './types';

const rect = {left: 0, top: 0, width: 800, height: 600};

describe('getFitScale', () => {
  it('frames the sheet to the smaller dimension with 10% padding', () => {
    expect(getFitScale(800, 600, 500)).toBeCloseTo(600 / 550);
  });
});

describe('getCanvasMetrics', () => {
  it('centres the canvas and applies zoom to the fit scale', () => {
    const viewport: Viewport = {zoom: 2, panX: 0, panY: 0};
    const {centerX, centerY, scale} = getCanvasMetrics(800, 600, viewport, 500);
    expect(centerX).toBe(400);
    expect(centerY).toBe(300);
    expect(scale).toBeCloseTo((600 / 550) * 2);
  });
});

describe('screenToWorld', () => {
  it('maps the canvas centre to the world origin', () => {
    const viewport: Viewport = {zoom: 1, panX: 0, panY: 0};
    const world = screenToWorld(400, 300, rect, viewport, 500);
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(0);
  });

  it('flips the y axis so screen-down is world-down', () => {
    const viewport: Viewport = {zoom: 1, panX: 0, panY: 0};
    const above = screenToWorld(400, 200, rect, viewport, 500);
    expect(above.y).toBeGreaterThan(0);
  });

  it('accounts for pan offset', () => {
    const base: Viewport = {zoom: 1, panX: 0, panY: 0};
    const panned: Viewport = {zoom: 1, panX: 50, panY: 0};
    const w0 = screenToWorld(400, 300, rect, base, 500);
    const w1 = screenToWorld(400, 300, rect, panned, 500);
    // panning right moves the world origin right, so the centre samples a
    // smaller world x.
    expect(w1.x).toBeLessThan(w0.x);
  });
});
