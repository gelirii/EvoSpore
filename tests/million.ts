import { performance } from 'node:perf_hooks';
import { morphotypeKey } from '../src/sim/genome';
import { SIM_DT, type CreatureCheckpoint, type PartType } from '../src/sim/types';
import { World } from '../src/sim/world';

const STEPS = 1_000_000;
const SAMPLE_EVERY = 1_000;
const MILESTONES = new Set([1_000, 10_000, 100_000, 250_000, 500_000, 750_000, 1_000_000]);
const PART_TYPES: PartType[] = ['mouth','flagellum','tail','fin','eye','chemo','spike','stinger'];

function counts(c: CreatureCheckpoint): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of PART_TYPES) out[t] = 0;
  for (const p of c.genome.parts) out[p.type] = (out[p.type] ?? 0) + 1;
  return out;
}

function creatureSummary(c: CreatureCheckpoint) {
  return {
    id: c.id,
    parentId: c.parentId,
    generation: c.generation,
    ageSeconds: Number(c.age.toFixed(1)),
    children: c.children,
    energy: Number(c.energy.toFixed(2)),
    health: Number(c.health.toFixed(2)),
    vertebrae: c.genome.vertebrae,
    size: Number(c.genome.size.toFixed(3)),
    flexibility: Number(c.genome.flexibility.toFixed(3)),
    diet: Number(c.genome.diet.toFixed(3)),
    basalEfficiency: Number(c.genome.basalEfficiency.toFixed(3)),
    parts: counts(c),
    totalParts: c.genome.parts.length,
    innovations: [...c.genome.innovations],
    learningRate: Number(c.genome.brain.learningRate.toFixed(5)),
    lamarckFraction: Number(c.genome.brain.lamarckFraction.toFixed(3)),
    learnedMagnitude: Number(c.brain.learnedMagnitude.toFixed(5)),
    morphotype: morphotypeKey(c.genome),
  };
}

type Standout = { score: number; atStep: number; creature: ReturnType<typeof creatureSummary> };
const standouts: Record<string, Standout | undefined> = {};
function consider(name: string, score: number, step: number, c: CreatureCheckpoint, mode: 'max'|'min'='max') {
  const prev = standouts[name];
  if (!prev || (mode === 'max' ? score > prev.score : score < prev.score)) {
    standouts[name] = { score, atStep: step, creature: creatureSummary(c) };
  }
}

function analysePopulation(creatures: CreatureCheckpoint[]) {
  const n = creatures.length || 1;
  let diet = 0, vertebrae = 0, size = 0, parts = 0, efficiency = 0, lamarck = 0, learned = 0;
  let grazers = 0, omnivores = 0, carnivores = 0;
  const partTotals: Record<string, number> = {};
  for (const t of PART_TYPES) partTotals[t] = 0;
  const morphs = new Map<string, { count: number; representative: CreatureCheckpoint }>();
  for (const c of creatures) {
    diet += c.genome.diet; vertebrae += c.genome.vertebrae; size += c.genome.size; parts += c.genome.parts.length;
    efficiency += c.genome.basalEfficiency; lamarck += c.genome.brain.lamarckFraction; learned += c.brain.learnedMagnitude;
    if (c.genome.diet < 0.33) grazers++; else if (c.genome.diet > 0.67) carnivores++; else omnivores++;
    for (const p of c.genome.parts) partTotals[p.type] = (partTotals[p.type] ?? 0) + 1;
    const k = morphotypeKey(c.genome);
    const m = morphs.get(k); if (m) m.count++; else morphs.set(k, { count: 1, representative: c });
  }
  const topMorphotypes = [...morphs.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,8).map(([key,v])=>({
    key, count:v.count, share:Number((v.count/creatures.length).toFixed(3)), representative:creatureSummary(v.representative)
  }));
  return {
    population: creatures.length,
    meanDiet: Number((diet/n).toFixed(3)),
    dietGuilds: { grazers, omnivores, carnivores },
    meanVertebrae: Number((vertebrae/n).toFixed(2)),
    meanSize: Number((size/n).toFixed(3)),
    meanParts: Number((parts/n).toFixed(2)),
    meanBasalEfficiency: Number((efficiency/n).toFixed(3)),
    meanLamarckFraction: Number((lamarck/n).toFixed(3)),
    meanLearnedMagnitude: Number((learned/n).toFixed(5)),
    partTotals,
    morphotypes: morphs.size,
    topMorphotypes,
  };
}

const world = new World();
const started = performance.now();
const milestones: any[] = [];
let peakPopulation = 0;
let peakMorphotypes = 0;
let peakGeneration = 0;

for (let step = 1; step <= STEPS; step++) {
  world.step();
  if (step % SAMPLE_EVERY === 0 || MILESTONES.has(step)) {
    const cp = world.createCheckpoint();
    const snap = world.snapshot('deep', true, 0);
    peakPopulation = Math.max(peakPopulation, cp.creatures.length);
    peakMorphotypes = Math.max(peakMorphotypes, snap.stats.morphotypes);
    peakGeneration = Math.max(peakGeneration, snap.stats.maxGeneration);
    for (const c of cp.creatures) {
      const pc = counts(c);
      consider('highestGeneration', c.generation, step, c);
      consider('oldest', c.age, step, c);
      consider('mostChildren', c.children, step, c);
      consider('largestBody', c.genome.size, step, c);
      consider('smallestBody', c.genome.size, step, c, 'min');
      consider('mostVertebrae', c.genome.vertebrae, step, c);
      consider('mostParts', c.genome.parts.length, step, c);
      consider('mostCarnivorous', c.genome.diet, step, c);
      consider('mostHerbivorous', c.genome.diet, step, c, 'min');
      consider('mostEfficient', c.genome.basalEfficiency, step, c);
      consider('mostLamarckian', c.genome.brain.lamarckFraction, step, c);
      consider('mostLearned', c.brain.learnedMagnitude, step, c);
      consider('mostSpikes', pc.spike ?? 0, step, c);
      consider('mostStingers', pc.stinger ?? 0, step, c);
      consider('mostEyes', pc.eye ?? 0, step, c);
      consider('mostFins', pc.fin ?? 0, step, c);
    }
    if (MILESTONES.has(step)) {
      milestones.push({
        step,
        simTimeSeconds: Number(world.simTime.toFixed(1)),
        births: cp.births,
        deaths: cp.deaths,
        maxGeneration: snap.stats.maxGeneration,
        morphotypes: snap.stats.morphotypes,
        innovations: snap.stats.innovations,
        ...analysePopulation(cp.creatures),
      });
    }
  }
}

const elapsed = (performance.now() - started) / 1000;
const finalCheckpoint = world.createCheckpoint();
const finalSnapshot = world.snapshot('deep', true, 0);
const finalPop = analysePopulation(finalCheckpoint.creatures);
const livingByGeneration = [...finalCheckpoint.creatures].sort((a,b)=>b.generation-a.generation).slice(0,12).map(creatureSummary);
const livingByChildren = [...finalCheckpoint.creatures].sort((a,b)=>b.children-a.children).slice(0,12).map(creatureSummary);
const livingWeird = [...finalCheckpoint.creatures].sort((a,b)=>{
  const weird = (c: CreatureCheckpoint) => c.genome.parts.length + c.genome.vertebrae + Math.abs(c.genome.diet-0.12)*8 + c.genome.innovations.length*12 + (counts(c).stinger??0)*8;
  return weird(b)-weird(a);
}).slice(0,12).map(creatureSummary);

const result = {
  steps: STEPS,
  simDt: SIM_DT,
  simulatedSeconds: Number(world.simTime.toFixed(1)),
  simulatedHours: Number((world.simTime/3600).toFixed(2)),
  simulatedDays: Number((world.simTime/86400).toFixed(3)),
  computeSeconds: Number(elapsed.toFixed(2)),
  headlessMultiplier: Number((world.simTime/elapsed).toFixed(1)),
  births: finalCheckpoint.births,
  deaths: finalCheckpoint.deaths,
  finalPopulation: finalCheckpoint.creatures.length,
  peakPopulation,
  finalMaxGeneration: finalSnapshot.stats.maxGeneration,
  peakGeneration,
  finalMorphotypes: finalSnapshot.stats.morphotypes,
  peakMorphotypes,
  innovations: finalSnapshot.stats.innovations,
  finalPopulationAnalysis: finalPop,
  standouts,
  livingByGeneration,
  livingByChildren,
  livingWeird,
  milestones,
  historicalEvents: finalCheckpoint.events.slice(-40),
};

console.log('MILLION_RESULT_START');
console.log(JSON.stringify(result, null, 2));
console.log('MILLION_RESULT_END');
