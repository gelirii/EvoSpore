import type { WorldCheckpoint, WorldSnapshot } from './sim/types';

export type SpeedMode = 'paused' | 'observe' | 'fast' | 'evolve' | 'deep';

export type MainToWorker =
  | { type: 'init'; checkpoint?: WorldCheckpoint }
  | { type: 'setSpeed'; mode: SpeedMode }
  | { type: 'setThermalSafe'; enabled: boolean }
  | { type: 'requestCheckpoint'; reason: 'autosave' | 'manual' | 'hidden' }
  | { type: 'selectCreature'; id: number | null }
  | { type: 'resetWorld' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'snapshot'; snapshot: WorldSnapshot }
  | { type: 'checkpoint'; checkpoint: WorldCheckpoint; reason: string }
  | { type: 'historicalEvent'; message: string }
  | { type: 'error'; message: string; stack?: string };
