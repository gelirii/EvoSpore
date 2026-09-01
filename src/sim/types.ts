import type { SpeedMode } from '../protocol';
import type { RngState } from './rng';

export const WORLD_WIDTH = 1600;
export const WORLD_HEIGHT = 1000;
export const SIM_DT = 0.1;
export const BRAIN_INTERVAL = 0.2;
export const MAX_POPULATION = 650;
export const MAX_CREATURE_AGE = 1000;

export type PartType =
  | 'mouth'
  | 'flagellum'
  | 'tail'
  | 'fin'
  | 'eye'
  | 'chemo'
  | 'spike'
  | 'stinger';

export type Side = -1 | 0 | 1;

export interface PartGene {
  type: PartType;
  segment: number;
  side: Side;
  size: number;
  angle: number;
}

export interface BrainGenome {
  selfWeights: number[];
  msgWeights: number[];
  bias: number[];
  typeEmbedding: number[];
  readoutA: number[];
  readoutB: number[];
  plasticSelf: number[];
  plasticMsg: number[];
  learningRate: number;
  eligibilityDecay: number;
  fastDecay: number;
  lamarckFraction: number;
}

export interface Genome {
  vertebrae: number;
  size: number;
  flexibility: number;
  diet: number;
  basalEfficiency: number;
  parts: PartGene[];
  innovations: string[];
  brain: BrainGenome;
}

export interface BrainCheckpoint {
  hidden: number[];
  fastSelf: number[];
  fastMsg: number[];
  eligibilitySelf: number[];
  eligibilityMsg: number[];
  pendingReward: number;
  learnedMagnitude: number;
}

export type DamageMethod = 'bite' | 'stinger' | 'spike';
export type DeathCause = DamageMethod | 'starvation' | 'oldAge' | 'unknown';

export interface LifeHistory {
  distanceTravelled: number;
  plantIntake: number;
  meatIntake: number;
  ownKillMeat: number;
  stolenKillMeat: number;
  carrionMeat: number;
  damageDealt: number;
  damageTaken: number;
  biteDamage: number;
  stingerDamage: number;
  spikeDamage: number;
  attacksLanded: number;
  kills: number;
  biteKills: number;
  stingerKills: number;
  spikeKills: number;
  killCarcassEnergy: number;
  deathCause?: DeathCause;
  killedBy?: number;
}

export interface CreatureCheckpoint {
  id: number;
  parentId: number | null;
  generation: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
  health: number;
  energy: number;
  age: number;
  children: number;
  history?: LifeHistory;
  lastDamagedBy?: number | null;
  lastDamageMethod?: DamageMethod | null;
  stingerCooldown: number;
  thoughtAccumulator: number;
  actionA: number[];
  actionB: number[];
  genome: Genome;
  brain: BrainCheckpoint;
}

export type FossilCategory =
  | 'highestGeneration'
  | 'oldest'
  | 'mostChildren'
  | 'mostKills'
  | 'mostMeatEaten'
  | 'mostScavenged'
  | 'mostStolenMeat'
  | 'mostPlantEaten'
  | 'largestBody'
  | 'smallestBody'
  | 'mostVertebrae'
  | 'mostParts'
  | 'mostCarnivorous'
  | 'mostHerbivorous'
  | 'mostEfficient'
  | 'mostLamarckian'
  | 'mostLearned'
  | 'mostSpikes'
  | 'mostStingers'
  | 'mostEyes'
  | 'mostFins';

export interface PartCounts {
  mouth: number;
  flagellum: number;
  tail: number;
  fin: number;
  eye: number;
  chemo: number;
  spike: number;
  stinger: number;
}

export interface FossilRecordEntry {
  key: FossilCategory;
  name: string;
  title: string;
  description: string;
  score: number;
  displayValue: number;
  recordedAt: number;
  creature: CreatureCheckpoint;
}

export interface FossilRecordSummary {
  key: FossilCategory;
  name: string;
  title: string;
  description: string;
  displayValue: number;
  recordedAt: number;
  id: number;
  generation: number;
  age: number;
  children: number;
  vertebrae: number;
  size: number;
  diet: number;
  basalEfficiency: number;
  totalParts: number;
  learnedMagnitude: number;
  lamarckFraction: number;
  partCounts: PartCounts;
  innovations: string[];
  history: LifeHistory;
}

export interface Food {
  id: number;
  x: number;
  y: number;
  energy: number;
  size: number;
}

export interface Carcass {
  id: number;
  x: number;
  y: number;
  energy: number;
  age: number;
  size: number;
  sourceCreatureId?: number;
  killerId?: number | null;
  deathCause?: DeathCause;
  killMethod?: DamageMethod | null;
}

export interface HistoricalEvent {
  simTime: number;
  type: 'innovation' | 'extinction' | 'milestone';
  message: string;
}

export interface WorldCheckpoint {
  version: 1;
  simTime: number;
  nextCreatureId: number;
  nextFoodId: number;
  nextCarcassId: number;
  births: number;
  deaths: number;
  rng: RngState;
  creatures: CreatureCheckpoint[];
  food: Food[];
  carcasses: Carcass[];
  events: HistoricalEvent[];
  selectedId: number | null;
  fossilRecords?: FossilRecordEntry[];
}

export interface RenderPart {
  type: PartType;
  segment: number;
  side: Side;
  size: number;
  angle: number;
}

export interface CreatureRenderState {
  id: number;
  parentId: number | null;
  generation: number;
  x: number;
  y: number;
  angle: number;
  radius: number;
  health: number;
  energy: number;
  age: number;
  children: number;
  vertebrae: number;
  diet: number;
  parts: RenderPart[];
  innovations: string[];
  plasticity: number;
  lamarckFraction: number;
  learnedMagnitude: number;
  history: LifeHistory;
}

export interface FoodRenderState {
  x: number;
  y: number;
  size: number;
}

export interface CarcassRenderState {
  x: number;
  y: number;
  size: number;
  energy: number;
}

export interface WorldStats {
  population: number;
  food: number;
  carcasses: number;
  births: number;
  deaths: number;
  maxGeneration: number;
  morphotypes: number;
  innovations: number;
  simRate: number;
  speedMode: SpeedMode;
  thermalSafe: boolean;
}

export interface WorldSnapshot {
  simTime: number;
  creatures: CreatureRenderState[];
  food: FoodRenderState[];
  carcasses: CarcassRenderState[];
  selected: CreatureRenderState | null;
  stats: WorldStats;
}

export interface SensePacket {
  energy: number;
  health: number;
  speedForward: number;
  speedSide: number;
  angularVelocity: number;
  nearestFoodDistance: number;
  nearestFoodBearing: number;
  nearestFoodKind: number;
  nearestCreatureDistance: number;
  nearestCreatureBearing: number;
  nearestCreatureSize: number;
  nearestCarcassDistance: number;
  nearestCarcassBearing: number;
  chemoFoodX: number;
  chemoFoodY: number;
  chemoCreatureX: number;
  chemoCreatureY: number;
  boundaryDistance: number;
  boundaryBearing: number;
  stingerCharge: number;
}
