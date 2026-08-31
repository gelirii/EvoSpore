/// <reference lib="webworker" />

import type { MainToWorker, SpeedMode, WorkerToMain } from './protocol';
import { World } from './sim/world';

const ctx: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

let world: World | null = null;
let speedMode: SpeedMode = 'observe';
let thermalSafe = true;
let targetAccumulator = 0;
let lastLoopAt = performance.now();
let lastSnapshotAt = 0;
let lastRateAt = performance.now();
let lastRateSimTime = 0;
let measuredSimRate = 0;
let lastEventCount = 0;
let loopTimer: number | null = null;

const post = (message: WorkerToMain): void => ctx.postMessage(message);

function schedule(delay: number): void {
  if (loopTimer !== null) clearTimeout(loopTimer);
  loopTimer = setTimeout(loop, delay) as unknown as number;
}

function snapshotInterval(): number {
  if (speedMode === 'observe') return 90;
  if (speedMode === 'fast') return 160;
  if (speedMode === 'evolve') return 320;
  if (speedMode === 'deep') return 600;
  return 500;
}

function targetMultiplier(): number {
  if (speedMode === 'observe') return 1;
  if (speedMode === 'fast') return 10;
  if (speedMode === 'evolve') return 100;
  return 0;
}

function flushEvents(): void {
  if (!world) return;
  while (lastEventCount < world.events.length) {
    const event = world.events[lastEventCount++]!;
    if (event.type === 'innovation') post({ type: 'historicalEvent', message: event.message });
  }
}

function updateMeasuredRate(now: number): void {
  if (!world) return;
  const elapsedMs = now - lastRateAt;
  if (elapsedMs < 750) return;
  const simDelta = world.simTime - lastRateSimTime;
  measuredSimRate = elapsedMs > 0 ? simDelta / (elapsedMs / 1000) : 0;
  lastRateAt = now;
  lastRateSimTime = world.simTime;
}

function maybeSnapshot(now: number): void {
  if (!world || now - lastSnapshotAt < snapshotInterval()) return;
  post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, measuredSimRate) });
  lastSnapshotAt = now;
}

function loop(): void {
  try {
    const now = performance.now();
    const elapsedMs = Math.min(250, Math.max(0, now - lastLoopAt));
    lastLoopAt = now;

    if (!world) {
      schedule(30);
      return;
    }

    if (speedMode === 'paused') {
      updateMeasuredRate(now);
      maybeSnapshot(now);
      schedule(40);
      return;
    }

    const workBudgetMs = thermalSafe
      ? (speedMode === 'deep' ? 10 : 7)
      : (speedMode === 'deep' ? 24 : 13);
    const workStart = performance.now();
    let steps = 0;

    if (speedMode === 'deep') {
      while (performance.now() - workStart < workBudgetMs) {
        world.step();
        steps += 1;
        if (steps >= 1000) break;
      }
    } else {
      const multiplier = targetMultiplier();
      targetAccumulator += (elapsedMs / 1000) * multiplier / 0.1;
      targetAccumulator = Math.min(targetAccumulator, 250);
      while (targetAccumulator >= 1 && performance.now() - workStart < workBudgetMs) {
        world.step();
        targetAccumulator -= 1;
        steps += 1;
      }
    }

    flushEvents();
    const after = performance.now();
    updateMeasuredRate(after);
    maybeSnapshot(after);

    // Duty-cycle the single worker instead of pinning a core continuously.
    // This is deliberately conservative on phones; the UI can disable the guard.
    const sleepMs = thermalSafe
      ? (speedMode === 'deep' ? 6 : 3)
      : (speedMode === 'deep' ? 0 : 1);
    schedule(sleepMs);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    post({ type: 'error', message: err.message, stack: err.stack });
    speedMode = 'paused';
    schedule(100);
  }
}

ctx.onmessage = (event: MessageEvent<MainToWorker>) => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      world = new World(message.checkpoint);
      lastEventCount = world.events.length;
      lastRateSimTime = world.simTime;
      lastRateAt = performance.now();
      targetAccumulator = 0;
      post({ type: 'ready' });
      post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, 0) });
      schedule(0);
    } else if (message.type === 'setSpeed') {
      speedMode = message.mode;
      targetAccumulator = 0;
    } else if (message.type === 'setThermalSafe') {
      thermalSafe = message.enabled;
    } else if (message.type === 'selectCreature') {
      world?.setSelected(message.id);
    } else if (message.type === 'requestCheckpoint') {
      if (world) post({ type: 'checkpoint', checkpoint: world.createCheckpoint(), reason: message.reason });
    } else if (message.type === 'resetWorld') {
      world?.reset();
      lastEventCount = world?.events.length ?? 0;
      targetAccumulator = 0;
      if (world) post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, measuredSimRate) });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    post({ type: 'error', message: err.message, stack: err.stack });
  }
};
