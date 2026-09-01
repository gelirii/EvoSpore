/// <reference lib="webworker" />

import type { MainToWorker, SpeedMode, WorkerToMain } from './protocol';
import { MAX_CREATURE_AGE, SIM_DT } from './sim/types';
import type {
  CreatureCheckpoint,
  FossilCategory,
  FossilRecordEntry,
  FossilRecordSummary,
  LifeHistory,
  PartCounts,
  PartType,
  WorldCheckpoint,
} from './sim/types';
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
let lastFossilRealAt = 0;
let lastFossilSimTime = -Infinity;

const fossilRecords = new Map<FossilCategory, FossilRecordEntry>();
const FOSSIL_ORDER: FossilCategory[] = [
  'highestGeneration', 'oldest', 'mostChildren', 'mostKills', 'mostMeatEaten', 'mostScavenged', 'mostStolenMeat', 'mostPlantEaten', 'largestBody', 'smallestBody',
  'mostVertebrae', 'mostParts', 'mostCarnivorous', 'mostHerbivorous', 'mostEfficient',
  'mostLamarckian', 'mostLearned', 'mostSpikes', 'mostStingers', 'mostEyes', 'mostFins',
];

const FOSSIL_META: Record<FossilCategory, { name: string; title: string; description: string; positiveOnly?: boolean }> = {
  highestGeneration: { name: 'The Lineage Crown', title: 'Deepest lineage', description: 'Furthest descendant from the original founders.' },
  oldest: { name: 'Methuselah', title: 'Longest lived', description: 'The longest-lived creature caught by the fossil record.' },
  mostChildren: { name: 'Genghis Worm', title: 'Most offspring', description: 'The most prolific individual ever recorded.' },
  mostKills: { name: 'The Apex Predator', title: 'Most confirmed kills', description: 'Highest number of creatures personally killed.', positiveOnly: true },
  mostMeatEaten: { name: 'The Meat Grinder', title: 'Most meat eaten', description: 'Largest lifetime intake of carcass biomass.', positiveOnly: true },
  mostScavenged: { name: 'The Vulture', title: 'Most natural carrion eaten', description: 'Thrived on creatures that died without a killer.', positiveOnly: true },
  mostStolenMeat: { name: 'The Lunch Thief', title: 'Most stolen kills eaten', description: 'Ate the most meat from creatures killed by somebody else.', positiveOnly: true },
  mostPlantEaten: { name: 'The Salad Destroyer', title: 'Most plant food eaten', description: 'Largest lifetime intake of renewable pond food.', positiveOnly: true },
  largestBody: { name: 'The Leviathan', title: 'Largest body', description: 'Biggest body-size genome ever seen.' },
  smallestBody: { name: 'The Mini Menace', title: 'Smallest body', description: 'Smallest body-size genome ever seen.' },
  mostVertebrae: { name: 'The Spine Lord', title: 'Most vertebrae', description: 'Longest segmented body in the fossil record.' },
  mostParts: { name: 'Swiss Army Beast', title: 'Most body parts', description: 'Most anatomically loaded creature ever recorded.' },
  mostCarnivorous: { name: 'The Meat Fundamentalist', title: 'Most carnivorous genome', description: 'Closest the pond has come to a genetically pure meat specialist.' },
  mostHerbivorous: { name: 'The Salad Purist', title: 'Most herbivorous', description: 'Closest the pond has come to a pure plant specialist.' },
  mostEfficient: { name: 'The Miser Engine', title: 'Best basal efficiency', description: 'Most metabolically efficient genome ever recorded.' },
  mostLamarckian: { name: "Lamarck's Favourite", title: 'Highest inherited learning', description: 'Passed the greatest fraction of learned neural change onward.' },
  mostLearned: { name: 'The Scholar', title: 'Most learned', description: 'Largest accumulated lifetime neural adaptation.' },
  mostSpikes: { name: 'The Hedgehog', title: 'Most spikes', description: 'Most heavily spiked body ever seen.', positiveOnly: true },
  mostStingers: { name: 'General Grievous', title: 'Most stingers', description: 'Maximum number of stingers on one body.', positiveOnly: true },
  mostEyes: { name: 'EYEBALLS', title: 'Most eyes', description: 'Maximum number of eyes on one body.', positiveOnly: true },
  mostFins: { name: 'The Fin Enthusiast', title: 'Most fins', description: 'Maximum number of fins on one body.', positiveOnly: true },
};

const post = (message: WorkerToMain): void => ctx.postMessage(message);
const clone = <T>(value: T): T => structuredClone(value);

function countParts(creature: CreatureCheckpoint): PartCounts {
  const counts: PartCounts = { mouth: 0, flagellum: 0, tail: 0, fin: 0, eye: 0, chemo: 0, spike: 0, stinger: 0 };
  for (const part of creature.genome.parts) counts[part.type]++;
  return counts;
}

function blankHistory(): LifeHistory {
  return { distanceTravelled: 0, plantIntake: 0, meatIntake: 0, ownKillMeat: 0, stolenKillMeat: 0, carrionMeat: 0, damageDealt: 0, damageTaken: 0, biteDamage: 0, stingerDamage: 0, spikeDamage: 0, attacksLanded: 0, kills: 0, biteKills: 0, stingerKills: 0, spikeKills: 0, killCarcassEnergy: 0 };
}

function historyOf(creature: CreatureCheckpoint): LifeHistory {
  return { ...blankHistory(), ...(creature.history ?? {}) };
}

function metric(creature: CreatureCheckpoint, key: FossilCategory): { score: number; displayValue: number } {
  const counts = countParts(creature);
  const history = historyOf(creature);
  switch (key) {
    case 'highestGeneration': return { score: creature.generation, displayValue: creature.generation };
    case 'oldest': { const age = Math.min(creature.age, MAX_CREATURE_AGE - SIM_DT); return { score: age, displayValue: age }; }
    case 'mostChildren': return { score: creature.children, displayValue: creature.children };
    case 'mostKills': return { score: history.kills, displayValue: history.kills };
    case 'mostMeatEaten': return { score: history.meatIntake, displayValue: history.meatIntake };
    case 'mostScavenged': return { score: history.carrionMeat, displayValue: history.carrionMeat };
    case 'mostStolenMeat': return { score: history.stolenKillMeat, displayValue: history.stolenKillMeat };
    case 'mostPlantEaten': return { score: history.plantIntake, displayValue: history.plantIntake };
    case 'largestBody': return { score: creature.genome.size, displayValue: creature.genome.size };
    case 'smallestBody': return { score: -creature.genome.size, displayValue: creature.genome.size };
    case 'mostVertebrae': return { score: creature.genome.vertebrae, displayValue: creature.genome.vertebrae };
    case 'mostParts': return { score: creature.genome.parts.length, displayValue: creature.genome.parts.length };
    case 'mostCarnivorous': return { score: creature.genome.diet, displayValue: creature.genome.diet };
    case 'mostHerbivorous': return { score: 1 - creature.genome.diet, displayValue: creature.genome.diet };
    case 'mostEfficient': return { score: creature.genome.basalEfficiency, displayValue: creature.genome.basalEfficiency };
    case 'mostLamarckian': return { score: creature.genome.brain.lamarckFraction, displayValue: creature.genome.brain.lamarckFraction };
    case 'mostLearned': return { score: creature.brain.learnedMagnitude, displayValue: creature.brain.learnedMagnitude };
    case 'mostSpikes': return { score: counts.spike, displayValue: counts.spike };
    case 'mostStingers': return { score: counts.stinger, displayValue: counts.stinger };
    case 'mostEyes': return { score: counts.eye, displayValue: counts.eye };
    case 'mostFins': return { score: counts.fin, displayValue: counts.fin };
  }
}

function considerCreatures(creatures: CreatureCheckpoint[], recordedAt: number): void {
  for (const creature of creatures) {
    for (const key of FOSSIL_ORDER) {
      const meta = FOSSIL_META[key];
      const m = metric(creature, key);
      if (meta.positiveOnly && m.displayValue <= 0) continue;
      const current = fossilRecords.get(key);
      if (current && m.score <= current.score) continue;
      fossilRecords.set(key, { key, name: meta.name, title: meta.title, description: meta.description, score: m.score, displayValue: m.displayValue, recordedAt, creature: clone(creature) });
    }
  }
}

function considerFossils(checkpoint: WorldCheckpoint): void {
  considerCreatures(checkpoint.creatures, checkpoint.simTime);
}

function collectRetiredFossils(): void {
  if (!world) return;
  const retired = world.drainRetiredCreatures();
  if (retired.length) considerCreatures(retired, world.simTime);
}

function sampleFossils(force = false): void {
  if (!world) return;
  const now = performance.now();
  const simDelta = world.simTime - lastFossilSimTime;
  if (!force && now - lastFossilRealAt < 3000 && simDelta < 100) return;
  const checkpoint = world.createCheckpoint();
  considerFossils(checkpoint);
  lastFossilRealAt = now;
  lastFossilSimTime = world.simTime;
}

function fossilSummaries(): FossilRecordSummary[] {
  return FOSSIL_ORDER.flatMap((key) => {
    const record = fossilRecords.get(key);
    if (!record) return [];
    const creature = record.creature;
    return [{
      key,
      name: record.name,
      title: record.title,
      description: record.description,
      displayValue: record.displayValue,
      recordedAt: record.recordedAt,
      id: creature.id,
      generation: creature.generation,
      age: creature.age,
      children: creature.children,
      vertebrae: creature.genome.vertebrae,
      size: creature.genome.size,
      diet: creature.genome.diet,
      basalEfficiency: creature.genome.basalEfficiency,
      totalParts: creature.genome.parts.length,
      learnedMagnitude: creature.brain.learnedMagnitude,
      lamarckFraction: creature.genome.brain.lamarckFraction,
      partCounts: countParts(creature),
      innovations: [...creature.genome.innovations],
      history: historyOf(creature),
    }];
  });
}

function checkpointWithFossils(): WorldCheckpoint | null {
  if (!world) return null;
  sampleFossils(true);
  const checkpoint = world.createCheckpoint();
  checkpoint.fossilRecords = FOSSIL_ORDER.flatMap((key) => {
    const record = fossilRecords.get(key);
    return record ? [clone(record)] : [];
  });
  return checkpoint;
}

function maxHealth(creature: CreatureCheckpoint): number {
  const spikes = creature.genome.parts.filter((p) => p.type === 'spike').length;
  return 52 + creature.genome.vertebrae * 6 + spikes * 4;
}

function spawnFossil(key: FossilCategory): void {
  if (!world) return;
  const record = fossilRecords.get(key);
  if (!record) return;
  const checkpoint = world.createCheckpoint();
  const revived = clone(record.creature);
  const phase = revived.id * 2.399963229728653;
  revived.id = checkpoint.nextCreatureId++;
  revived.parentId = null;
  revived.x = 800 + Math.cos(phase) * 175;
  revived.y = 500 + Math.sin(phase) * 175;
  revived.vx = 0;
  revived.vy = 0;
  revived.angle = phase % (Math.PI * 2);
  revived.angularVelocity = 0;
  revived.health = maxHealth(revived);
  revived.energy = 110;
  revived.age = 0;
  revived.children = 0;
  revived.history = blankHistory();
  revived.lastDamagedBy = null;
  revived.lastDamageMethod = null;
  revived.stingerCooldown = 0;
  revived.thoughtAccumulator = 0;
  revived.actionA = new Array(revived.genome.parts.length).fill(0.5);
  revived.actionB = new Array(revived.genome.parts.length).fill(0);
  checkpoint.creatures.push(revived);
  checkpoint.selectedId = revived.id;
  checkpoint.fossilRecords = FOSSIL_ORDER.flatMap((item) => {
    const fossil = fossilRecords.get(item);
    return fossil ? [clone(fossil)] : [];
  });
  checkpoint.events.push({ simTime: checkpoint.simTime, type: 'milestone', message: `${record.name} was resurrected from the fossil record as creature #${revived.id}.` });
  world = new World(checkpoint);
  lastEventCount = world.events.length;
  post({ type: 'fossilSpawned', name: record.name, creatureId: revived.id });
  post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, measuredSimRate), fossils: fossilSummaries() });
}

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
  sampleFossils();
  post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, measuredSimRate), fossils: fossilSummaries() });
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

    collectRetiredFossils();
    sampleFossils();
    flushEvents();
    const after = performance.now();
    updateMeasuredRate(after);
    maybeSnapshot(after);

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
      fossilRecords.clear();
      for (const fossil of message.checkpoint?.fossilRecords ?? []) fossilRecords.set(fossil.key, clone(fossil));
      world = new World(message.checkpoint);
      lastEventCount = world.events.length;
      lastRateSimTime = world.simTime;
      lastRateAt = performance.now();
      targetAccumulator = 0;
      lastFossilRealAt = 0;
      lastFossilSimTime = -Infinity;
      sampleFossils(true);
      post({ type: 'ready' });
      post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, 0), fossils: fossilSummaries() });
      schedule(0);
    } else if (message.type === 'setSpeed') {
      speedMode = message.mode;
      targetAccumulator = 0;
    } else if (message.type === 'setThermalSafe') {
      thermalSafe = message.enabled;
    } else if (message.type === 'selectCreature') {
      world?.setSelected(message.id);
    } else if (message.type === 'spawnFossil') {
      spawnFossil(message.key);
    } else if (message.type === 'requestCheckpoint') {
      const checkpoint = checkpointWithFossils();
      if (checkpoint) post({ type: 'checkpoint', checkpoint, reason: message.reason });
    } else if (message.type === 'resetWorld') {
      fossilRecords.clear();
      world?.reset();
      lastEventCount = world?.events.length ?? 0;
      targetAccumulator = 0;
      lastFossilRealAt = 0;
      lastFossilSimTime = -Infinity;
      sampleFossils(true);
      if (world) post({ type: 'snapshot', snapshot: world.snapshot(speedMode, thermalSafe, measuredSimRate), fossils: fossilSummaries() });
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    post({ type: 'error', message: err.message, stack: err.stack });
  }
};
