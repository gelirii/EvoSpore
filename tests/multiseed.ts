import { performance } from 'node:perf_hooks';
import { createFounderGenome, morphotypeKey } from '../src/sim/genome';
import { Rng } from '../src/sim/rng';
import { BRAIN_INTERVAL, SIM_DT, WORLD_HEIGHT, WORLD_WIDTH, type CreatureCheckpoint, type PartType } from '../src/sim/types';
import { World } from '../src/sim/world';

const STEPS = 1_000_000;
const SAMPLE_EVERY = 1_000;
const seed = Number(process.env.SEED ?? '1') >>> 0;
const label = process.env.WORLD_LABEL ?? String(seed);
const PART_TYPES: PartType[] = ['mouth','flagellum','tail','fin','eye','chemo','spike','stinger'];

type LiveCreature = CreatureCheckpoint;
const live = (world: World): LiveCreature[] => world.creatures as unknown as LiveCreature[];
const partCount = (c: LiveCreature, type: PartType): number => c.genome.parts.reduce((n, p) => n + (p.type === type ? 1 : 0), 0);
const maxHealth = (c: CreatureCheckpoint): number => 52 + c.genome.vertebrae * 6 + partCount(c, 'spike') * 4;

function seededWorld(): { world: World; founder: ReturnType<typeof createFounderGenome> } {
  const setup = new Rng(seed);
  const base = new World().createCheckpoint();
  const founder = createFounderGenome(setup);
  base.rng = setup.snapshot();
  base.events = [];
  base.births = 0;
  base.deaths = 0;
  for (const c of base.creatures) {
    c.x = setup.range(80, WORLD_WIDTH - 80);
    c.y = setup.range(80, WORLD_HEIGHT - 80);
    c.vx = setup.gaussian(0, 2);
    c.vy = setup.gaussian(0, 2);
    c.angle = setup.range(-Math.PI, Math.PI);
    c.angularVelocity = 0;
    c.age = 0;
    c.children = 0;
    c.energy = 92;
    c.stingerCooldown = 0;
    c.thoughtAccumulator = setup.range(0, BRAIN_INTERVAL);
    c.genome = structuredClone(founder);
    c.health = maxHealth(c);
    c.actionA = new Array(founder.parts.length).fill(0.5);
    c.actionB = new Array(founder.parts.length).fill(0);
    c.brain.hidden.fill(0);
    c.brain.fastSelf.fill(0);
    c.brain.fastMsg.fill(0);
    c.brain.eligibilitySelf.fill(0);
    c.brain.eligibilityMsg.fill(0);
    c.brain.pendingReward = 0;
    c.brain.learnedMagnitude = 0;
  }
  for (const f of base.food) {
    f.x = setup.range(18, WORLD_WIDTH - 18);
    f.y = setup.range(18, WORLD_HEIGHT - 18);
    f.energy = setup.range(10.5, 14.5);
    f.size = setup.range(2.3, 4.4);
  }
  base.rng = setup.snapshot();
  return { world: new World(base), founder };
}

function summarize(creatures: LiveCreature[]) {
  const n = Math.max(1, creatures.length);
  let diet = 0, verts = 0, parts = 0, size = 0, lamarck = 0, stingers = 0;
  let grazers = 0, omnivores = 0, carnivores = 0;
  const morphs = new Map<string, number>();
  for (const c of creatures) {
    diet += c.genome.diet; verts += c.genome.vertebrae; parts += c.genome.parts.length; size += c.genome.size;
    lamarck += c.genome.brain.lamarckFraction; stingers += partCount(c, 'stinger');
    if (c.genome.diet < 0.33) grazers++; else if (c.genome.diet > 0.67) carnivores++; else omnivores++;
    const key = morphotypeKey(c.genome); morphs.set(key, (morphs.get(key) ?? 0) + 1);
  }
  const dominant = [...morphs.entries()].sort((a,b)=>b[1]-a[1])[0] ?? ['none', 0] as [string, number];
  return {
    population: creatures.length,
    morphotypes: morphs.size,
    meanDiet: Number((diet/n).toFixed(3)),
    guilds: { grazers, omnivores, carnivores },
    meanVertebrae: Number((verts/n).toFixed(2)),
    meanParts: Number((parts/n).toFixed(2)),
    meanSize: Number((size/n).toFixed(3)),
    meanLamarck: Number((lamarck/n).toFixed(3)),
    stingersPerCreature: Number((stingers/n).toFixed(2)),
    dominantMorph: dominant[0],
    dominantShare: creatures.length ? Number((dominant[1]/creatures.length).toFixed(3)) : 0,
  };
}

const { world, founder } = seededWorld();
const started = performance.now();
let peakPopulation = live(world).length;
let peakMorphotypes = 1;
let peakGeneration = 0;
let maxCarnivory = founder.diet;
let maxParts = founder.parts.length;
let maxVertebrae = founder.vertebrae;
let maxStingers = 0;
let firstCarnivoreStep: number | null = null;
let firstEightVertebraeStep: number | null = null;
let firstFourteenPartsStep: number | null = null;
let firstStingerStep: number | null = null;

for (let step = 1; step <= STEPS; step++) {
  world.step();
  if (step % SAMPLE_EVERY !== 0 && step !== STEPS) continue;
  const creatures = live(world);
  const morphs = new Set(creatures.map(c => morphotypeKey(c.genome))).size;
  const generation = creatures.reduce((m,c)=>Math.max(m,c.generation),0);
  peakPopulation = Math.max(peakPopulation, creatures.length);
  peakMorphotypes = Math.max(peakMorphotypes, morphs);
  peakGeneration = Math.max(peakGeneration, generation);
  for (const c of creatures) {
    maxCarnivory = Math.max(maxCarnivory, c.genome.diet);
    maxParts = Math.max(maxParts, c.genome.parts.length);
    maxVertebrae = Math.max(maxVertebrae, c.genome.vertebrae);
    maxStingers = Math.max(maxStingers, partCount(c, 'stinger'));
    if (firstCarnivoreStep === null && c.genome.diet > 0.67) firstCarnivoreStep = step;
    if (firstEightVertebraeStep === null && c.genome.vertebrae >= 8) firstEightVertebraeStep = step;
    if (firstFourteenPartsStep === null && c.genome.parts.length >= 14) firstFourteenPartsStep = step;
    if (firstStingerStep === null && partCount(c, 'stinger') > 0) firstStingerStep = step;
  }
}

const finalCreatures = live(world);
const final = summarize(finalCreatures);
const elapsed = (performance.now() - started) / 1000;
const result = {
  label, seed, steps: STEPS, simHours: Number((world.simTime/3600).toFixed(2)), computeSeconds: Number(elapsed.toFixed(1)),
  founder: {
    diet: Number(founder.diet.toFixed(3)), size: Number(founder.size.toFixed(3)), flexibility: Number(founder.flexibility.toFixed(3)),
    basalEfficiency: Number(founder.basalEfficiency.toFixed(3)), lamarck: Number(founder.brain.lamarckFraction.toFixed(3)),
    learningRate: Number(founder.brain.learningRate.toFixed(4)),
  },
  births: world.births, deaths: world.deaths, finalGeneration: finalCreatures.reduce((m,c)=>Math.max(m,c.generation),0),
  peakGeneration, peakPopulation, peakMorphotypes, final,
  extremes: {
    maxCarnivory: Number(maxCarnivory.toFixed(3)), maxParts, maxVertebrae, maxStingers,
    firstCarnivoreStep, firstEightVertebraeStep, firstFourteenPartsStep, firstStingerStep,
  },
};
console.log(`MULTISEED_RESULT ${JSON.stringify(result)}`);
