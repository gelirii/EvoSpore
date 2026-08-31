import { Rng } from './rng';
import type { BrainGenome, Genome, PartGene, PartType } from './types';

const H = 8;
const NODE_TYPES = 10;
const MAT = H * H;
const TYPE_EMBED = NODE_TYPES * H;
const READOUT = NODE_TYPES * H;

const BASIC_PARTS: readonly PartType[] = ['flagellum', 'tail', 'fin', 'eye', 'chemo', 'spike'];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function randomArray(rng: Rng, n: number, std: number): number[] {
  return Array.from({ length: n }, () => rng.gaussian(0, std));
}

export function createFounderBrain(rng: Rng): BrainGenome {
  const selfWeights = randomArray(rng, MAT, 0.18);
  const msgWeights = randomArray(rng, MAT, 0.12);
  for (let i = 0; i < H; i++) selfWeights[i * H + i] = (selfWeights[i * H + i] ?? 0) + 0.35;
  return {
    selfWeights,
    msgWeights,
    bias: randomArray(rng, H, 0.08),
    typeEmbedding: randomArray(rng, TYPE_EMBED, 0.15),
    readoutA: randomArray(rng, READOUT, 0.25),
    readoutB: randomArray(rng, READOUT, 0.25),
    plasticSelf: Array.from({ length: MAT }, () => clamp(rng.gaussian(0.15, 0.08), -0.5, 0.5)),
    plasticMsg: Array.from({ length: MAT }, () => clamp(rng.gaussian(0.10, 0.08), -0.5, 0.5)),
    learningRate: 0.018,
    eligibilityDecay: 0.88,
    fastDecay: 0.995,
    lamarckFraction: 0.25,
  };
}

export function createFounderGenome(rng: Rng): Genome {
  const parts: PartGene[] = [
    { type: 'mouth', segment: 0, side: 0, size: 0.9, angle: 0 },
    { type: 'flagellum', segment: 1, side: 0, size: 0.95, angle: Math.PI },
  ];
  return {
    vertebrae: 2,
    size: clamp(rng.gaussian(1, 0.04), 0.85, 1.15),
    flexibility: clamp(rng.gaussian(0.5, 0.06), 0.1, 0.9),
    diet: clamp(rng.gaussian(0.12, 0.03), 0, 1),
    basalEfficiency: clamp(rng.gaussian(1, 0.03), 0.8, 1.2),
    parts,
    innovations: [],
    brain: createFounderBrain(rng),
  };
}

function mutateArray(rng: Rng, values: number[], rate: number, std: number, clipAbs = 3): number[] {
  return values.map((v) => {
    if (!rng.chance(rate)) return v;
    return clamp(v + rng.gaussian(0, std), -clipAbs, clipAbs);
  });
}

export function assimilatedBrain(parent: BrainGenome, fastSelf: ArrayLike<number>, fastMsg: ArrayLike<number>, rng: Rng): BrainGenome {
  const l = clamp(parent.lamarckFraction, 0, 1);
  const slowSelf = parent.selfWeights.map((w, i) => w + l * (fastSelf[i] ?? 0));
  const slowMsg = parent.msgWeights.map((w, i) => w + l * (fastMsg[i] ?? 0));

  return {
    selfWeights: mutateArray(rng, slowSelf, 0.08, 0.035),
    msgWeights: mutateArray(rng, slowMsg, 0.08, 0.035),
    bias: mutateArray(rng, parent.bias, 0.08, 0.025),
    typeEmbedding: mutateArray(rng, parent.typeEmbedding, 0.05, 0.025),
    readoutA: mutateArray(rng, parent.readoutA, 0.07, 0.03),
    readoutB: mutateArray(rng, parent.readoutB, 0.07, 0.03),
    plasticSelf: mutateArray(rng, parent.plasticSelf, 0.06, 0.025, 1),
    plasticMsg: mutateArray(rng, parent.plasticMsg, 0.06, 0.025, 1),
    learningRate: clamp(parent.learningRate + (rng.chance(0.15) ? rng.gaussian(0, 0.0025) : 0), 0, 0.08),
    eligibilityDecay: clamp(parent.eligibilityDecay + (rng.chance(0.12) ? rng.gaussian(0, 0.015) : 0), 0.55, 0.995),
    fastDecay: clamp(parent.fastDecay + (rng.chance(0.12) ? rng.gaussian(0, 0.0015) : 0), 0.95, 1),
    lamarckFraction: clamp(parent.lamarckFraction + (rng.chance(0.15) ? rng.gaussian(0, 0.035) : 0), 0, 1),
  };
}

function normalizeParts(genome: Genome): void {
  genome.vertebrae = Math.max(2, Math.min(8, Math.round(genome.vertebrae)));
  genome.parts = genome.parts
    .filter((p) => p.type === 'mouth' || p.segment < genome.vertebrae)
    .map((p) => ({ ...p, segment: Math.max(0, Math.min(genome.vertebrae - 1, Math.round(p.segment))) }));

  const mouth = genome.parts.find((p) => p.type === 'mouth');
  if (!mouth) genome.parts.unshift({ type: 'mouth', segment: 0, side: 0, size: 0.9, angle: 0 });
  else {
    mouth.segment = 0;
    mouth.side = 0;
    mouth.angle = 0;
  }

  const hasPropulsion = genome.parts.some((p) => p.type === 'flagellum' || p.type === 'tail' || p.type === 'fin');
  if (!hasPropulsion) {
    genome.parts.push({ type: 'flagellum', segment: genome.vertebrae - 1, side: 0, size: 0.8, angle: Math.PI });
  }

  if (genome.parts.length > 14) genome.parts.length = 14;
}

function randomAttachablePart(genome: Genome, rng: Rng): PartType {
  const pool = [...BASIC_PARTS];
  if (genome.innovations.includes('stinger')) pool.push('stinger');
  return rng.pick(pool);
}

export function mutateGenome(
  parent: Genome,
  fastSelf: ArrayLike<number>,
  fastMsg: ArrayLike<number>,
  rng: Rng,
): Genome {
  const child: Genome = {
    vertebrae: parent.vertebrae,
    size: clamp(parent.size + (rng.chance(0.45) ? rng.gaussian(0, 0.025) : 0), 0.65, 1.75),
    flexibility: clamp(parent.flexibility + (rng.chance(0.35) ? rng.gaussian(0, 0.035) : 0), 0.05, 0.98),
    diet: clamp(parent.diet + (rng.chance(0.45) ? rng.gaussian(0, 0.025) : 0), 0, 1),
    basalEfficiency: clamp(parent.basalEfficiency + (rng.chance(0.25) ? rng.gaussian(0, 0.015) : 0), 0.72, 1.28),
    parts: parent.parts.map((p) => ({ ...p })),
    innovations: [...parent.innovations],
    brain: assimilatedBrain(parent.brain, fastSelf, fastMsg, rng),
  };

  if (rng.chance(0.025)) child.vertebrae += rng.chance(0.55) ? 1 : -1;

  if (rng.chance(0.07)) {
    const nonMouth = child.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.type !== 'mouth');
    const mode = rng.next();
    if (mode < 0.52 && child.parts.length < Math.min(14, child.vertebrae * 2 + 2)) {
      const type = randomAttachablePart(child, rng);
      const segment = type === 'tail' || type === 'flagellum' ? child.vertebrae - 1 : rng.int(0, child.vertebrae);
      const side = type === 'tail' || type === 'flagellum' ? 0 : (rng.chance(0.5) ? -1 : 1);
      child.parts.push({
        type,
        segment,
        side,
        size: clamp(rng.gaussian(0.75, 0.18), 0.3, 1.35),
        angle: side === 0 ? Math.PI : side * Math.PI * 0.5,
      });
    } else if (mode < 0.78 && nonMouth.length > 1) {
      child.parts.splice(rng.pick(nonMouth).i, 1);
    } else if (nonMouth.length > 0) {
      const part = rng.pick(nonMouth).p;
      part.segment = rng.int(0, child.vertebrae);
      if (part.type !== 'tail' && part.type !== 'flagellum') part.side = rng.chance(0.5) ? -1 : 1;
    }
  }

  for (const part of child.parts) {
    if (rng.chance(0.22)) part.size = clamp(part.size + rng.gaussian(0, 0.035), 0.25, 1.5);
    if (rng.chance(0.12)) part.angle += rng.gaussian(0, 0.08);
  }

  normalizeParts(child);
  return child;
}

export function maybeInnovate(genome: Genome, rng: Rng, donorHasStinger: boolean): boolean {
  if (genome.innovations.includes('stinger')) return false;
  const probability = donorHasStinger ? 0.00045 : 0.0001;
  if (!rng.chance(probability)) return false;
  genome.innovations.push('stinger');
  return true;
}

export function morphotypeKey(genome: Genome): string {
  const counts = new Map<PartType, number>();
  for (const p of genome.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [
    genome.vertebrae,
    Math.round(genome.diet * 4),
    ...(['flagellum','tail','fin','eye','chemo','spike','stinger'] as PartType[]).map((t) => counts.get(t) ?? 0),
  ].join(':');
}

export const BRAIN_HIDDEN = H;
export const BRAIN_NODE_TYPES = NODE_TYPES;
