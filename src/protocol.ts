import type { FossilCategory, FossilRecordSummary, WorldCheckpoint, WorldSnapshot } from './sim/types';

export type SpeedMode = 'paused' | 'observe' | 'fast' | 'evolve' | 'deep';
export type CheckpointReason = 'autosave' | 'manual' | 'hidden';

export type MainToWorker =
  | { type: 'init'; checkpoint?: WorldCheckpoint }
  | { type: 'setSpeed'; mode: SpeedMode }
  | { type: 'setThermalSafe'; enabled: boolean }
  | { type: 'requestCheckpoint'; reason: CheckpointReason }
  | { type: 'selectCreature'; id: number | null }
  | { type: 'spawnFossil'; key: FossilCategory }
  | { type: 'resetWorld' };

export type WorkerToMain =
  | { type: 'ready' }
  | { type: 'snapshot'; snapshot: WorldSnapshot; fossils: FossilRecordSummary[] }
  | { type: 'checkpoint'; checkpoint: WorldCheckpoint; reason: CheckpointReason }
  | { type: 'historicalEvent'; message: string }
  | { type: 'fossilSpawned'; name: string; creatureId: number }
  | { type: 'error'; message: string; stack?: string };
