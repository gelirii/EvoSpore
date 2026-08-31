import { BrainRuntime } from './brain';
import { createFounderGenome, maybeInnovate, morphotypeKey, mutateGenome } from './genome';
import { Rng } from './rng';
import { SpatialHash } from './spatial';
import {
  BRAIN_INTERVAL,
  MAX_POPULATION,
  SIM_DT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Carcass,
  type CreatureCheckpoint,
  type CreatureRenderState,
  type Food,
  type Genome,
  type HistoricalEvent,
  type PartGene,
  type SensePacket,
  type WorldCheckpoint,
  type WorldSnapshot,
} from './types';
import type { SpeedMode } from '../protocol';

interface Creature {
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
  stingerCooldown: number;
  thoughtAccumulator: number;
  actionA: number[];
  actionB: number[];
  genome: Genome;
  brain: BrainRuntime;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
const MAX_AGE = 1000;

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function cloneGenome(genome: Genome): Genome {
  return {
    vertebrae: genome.vertebrae,
    size: genome.size,
    flexibility: genome.flexibility,
    diet: genome.diet,
    basalEfficiency: genome.basalEfficiency,
    parts: genome.parts.map((p) => ({ ...p })),
    innovations: [...genome.innovations],
    brain: {
      selfWeights: [...genome.brain.selfWeights],
      msgWeights: [...genome.brain.msgWeights],
      bias: [...genome.brain.bias],
      typeEmbedding: [...genome.brain.typeEmbedding],
      readoutA: [...genome.brain.readoutA],
      readoutB: [...genome.brain.readoutB],
      plasticSelf: [...genome.brain.plasticSelf],
      plasticMsg: [...genome.brain.plasticMsg],
      learningRate: genome.brain.learningRate,
      eligibilityDecay: genome.brain.eligibilityDecay,
      fastDecay: genome.brain.fastDecay,
      lamarckFraction: genome.brain.lamarckFraction,
    },
  };
}

function partCount(genome: Genome, type: PartGene['type']): number {
  let count = 0;
  for (const part of genome.parts) if (part.type === type) count++;
  return count;
}

function bodyRadius(genome: Genome): number {
  return (7 + genome.vertebrae * 2.4) * genome.size;
}

function maxHealth(genome: Genome): number {
  return 52 + genome.vertebrae * 6 + partCount(genome, 'spike') * 4;
}

function averagePlasticity(genome: Genome): number {
  let sum = 0;
  for (const v of genome.brain.plasticSelf) sum += Math.abs(v);
  for (const v of genome.brain.plasticMsg) sum += Math.abs(v);
  return sum / Math.max(1, genome.brain.plasticSelf.length + genome.brain.plasticMsg.length);
}

function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export class World {
  simTime = 0;
  nextCreatureId = 1;
  nextFoodId = 1;
  nextCarcassId = 1;
  births = 0;
  deaths = 0;
  creatures: Creature[] = [];
  food: Food[] = [];
  carcasses: Carcass[] = [];
  events: HistoricalEvent[] = [];
  selectedId: number | null = null;

  private rng = new Rng();
  private readonly creatureGrid = new SpatialHash<Creature>(90, WORLD_WIDTH);
  private readonly foodGrid = new SpatialHash<Food>(80, WORLD_WIDTH);
  private readonly carcassGrid = new SpatialHash<Carcass>(100, WORLD_WIDTH);
  private foodSpawnAccumulator = 0;

  constructor(checkpoint?: WorldCheckpoint) {
    if (checkpoint) this.loadCheckpoint(checkpoint);
    else this.reset();
  }

  reset(): void {
    this.rng = new Rng(0x5eedd00d);
    this.simTime = 0;
    this.nextCreatureId = 1;
    this.nextFoodId = 1;
    this.nextCarcassId = 1;
    this.births = 0;
    this.deaths = 0;
    this.creatures = [];
    this.food = [];
    this.carcasses = [];
    this.events = [];
    this.selectedId = null;
    this.foodSpawnAccumulator = 0;

    const founder = createFounderGenome(this.rng);
    for (let i = 0; i < 140; i++) {
      const genome = cloneGenome(founder);
      this.creatures.push(this.makeCreature(genome, null, 0, this.rng.range(80, WORLD_WIDTH - 80), this.rng.range(80, WORLD_HEIGHT - 80), 92));
    }
    for (let i = 0; i < 820; i++) this.food.push(this.spawnFood());
  }

  private makeCreature(genome: Genome, parentId: number | null, generation: number, x: number, y: number, energy: number): Creature {
    const id = this.nextCreatureId++;
    const brain = new BrainRuntime(genome);
    return {
      id,
      parentId,
      generation,
      x,
      y,
      vx: this.rng.gaussian(0, 2),
      vy: this.rng.gaussian(0, 2),
      angle: this.rng.range(-Math.PI, Math.PI),
      angularVelocity: 0,
      health: maxHealth(genome),
      energy,
      age: 0,
      children: 0,
      stingerCooldown: 0,
      thoughtAccumulator: this.rng.range(0, BRAIN_INTERVAL),
      actionA: new Array(genome.parts.length).fill(0.5),
      actionB: new Array(genome.parts.length).fill(0),
      genome,
      brain,
    };
  }

  private spawnFood(): Food {
    return {
      id: this.nextFoodId++,
      x: this.rng.range(18, WORLD_WIDTH - 18),
      y: this.rng.range(18, WORLD_HEIGHT - 18),
      energy: this.rng.range(10.5, 14.5),
      size: this.rng.range(2.3, 4.4),
    };
  }

  private sense(creature: Creature): SensePacket {
    const radius = 230;
    const nearbyFood = this.foodGrid.nearby(creature.x, creature.y, radius);
    const nearbyCreatures = this.creatureGrid.nearby(creature.x, creature.y, radius);
    const nearbyCarcasses = this.carcassGrid.nearby(creature.x, creature.y, radius);

    let nearestFoodDistance = 1;
    let nearestFoodBearing = 0;
    let nearestCreatureDistance = 1;
    let nearestCreatureBearing = 0;
    let nearestCreatureSize = 0;
    let nearestCarcassDistance = 1;
    let nearestCarcassBearing = 0;
    let chemoFoodWorldX = 0;
    let chemoFoodWorldY = 0;
    let chemoCreatureWorldX = 0;
    let chemoCreatureWorldY = 0;

    for (const item of nearbyFood) {
      const dx = item.x - creature.x;
      const dy = item.y - creature.y;
      const d = Math.hypot(dx, dy);
      const norm = clamp(d / radius, 0, 1);
      if (norm < nearestFoodDistance) {
        nearestFoodDistance = norm;
        nearestFoodBearing = wrapAngle(Math.atan2(dy, dx) - creature.angle);
      }
      if (d > 0) {
        const w = Math.max(0, 1 - d / 130);
        chemoFoodWorldX += (dx / d) * w;
        chemoFoodWorldY += (dy / d) * w;
      }
    }

    for (const other of nearbyCreatures) {
      if (other.id === creature.id) continue;
      const dx = other.x - creature.x;
      const dy = other.y - creature.y;
      const d = Math.hypot(dx, dy);
      const norm = clamp(d / radius, 0, 1);
      if (norm < nearestCreatureDistance) {
        nearestCreatureDistance = norm;
        nearestCreatureBearing = wrapAngle(Math.atan2(dy, dx) - creature.angle);
        nearestCreatureSize = clamp(bodyRadius(other.genome) / 30, 0, 1);
      }
      if (d > 0) {
        const w = Math.max(0, 1 - d / 120);
        chemoCreatureWorldX += (dx / d) * w;
        chemoCreatureWorldY += (dy / d) * w;
      }
    }

    for (const item of nearbyCarcasses) {
      const dx = item.x - creature.x;
      const dy = item.y - creature.y;
      const d = Math.hypot(dx, dy);
      const norm = clamp(d / radius, 0, 1);
      if (norm < nearestCarcassDistance) {
        nearestCarcassDistance = norm;
        nearestCarcassBearing = wrapAngle(Math.atan2(dy, dx) - creature.angle);
      }
    }

    const ca = Math.cos(creature.angle);
    const sa = Math.sin(creature.angle);
    const speedForward = (creature.vx * ca + creature.vy * sa) / 70;
    const speedSide = (-creature.vx * sa + creature.vy * ca) / 70;
    const localizeX = (x: number, y: number) => x * ca + y * sa;
    const localizeY = (x: number, y: number) => -x * sa + y * ca;

    const distances = [
      { d: creature.x, worldAngle: Math.PI },
      { d: WORLD_WIDTH - creature.x, worldAngle: 0 },
      { d: creature.y, worldAngle: -Math.PI / 2 },
      { d: WORLD_HEIGHT - creature.y, worldAngle: Math.PI / 2 },
    ].sort((a, b) => a.d - b.d);
    const nearestBoundary = distances[0]!;

    return {
      energy: clamp(creature.energy / 160, 0, 1.5),
      health: clamp(creature.health / maxHealth(creature.genome), 0, 1),
      speedForward,
      speedSide,
      angularVelocity: clamp(creature.angularVelocity / 2.5, -1, 1),
      nearestFoodDistance,
      nearestFoodBearing,
      nearestFoodKind: 0,
      nearestCreatureDistance,
      nearestCreatureBearing,
      nearestCreatureSize,
      nearestCarcassDistance,
      nearestCarcassBearing,
      chemoFoodX: clamp(localizeX(chemoFoodWorldX, chemoFoodWorldY), -1, 1),
      chemoFoodY: clamp(localizeY(chemoFoodWorldX, chemoFoodWorldY), -1, 1),
      chemoCreatureX: clamp(localizeX(chemoCreatureWorldX, chemoCreatureWorldY), -1, 1),
      chemoCreatureY: clamp(localizeY(chemoCreatureWorldX, chemoCreatureWorldY), -1, 1),
      boundaryDistance: clamp(nearestBoundary.d / 150, 0, 1),
      boundaryBearing: wrapAngle(nearestBoundary.worldAngle - creature.angle),
      stingerCharge: creature.stingerCooldown <= 0 ? 1 : clamp(1 - creature.stingerCooldown / 5, 0, 1),
    };
  }

  private move(creature: Creature): void {
    let thrust = 0;
    let torque = 0;
    let actionCost = 0;
    const genome = creature.genome;

    for (let i = 0; i < genome.parts.length; i++) {
      const part = genome.parts[i]!;
      const a = clamp(creature.actionA[i] ?? 0, 0, 1);
      const b = clamp(creature.actionB[i] ?? 0, -1, 1);
      if (part.type === 'flagellum') {
        thrust += a * part.size;
        torque += b * 0.75 * part.size;
        actionCost += a * 0.12 * part.size;
      } else if (part.type === 'tail') {
        thrust += a * 1.2 * part.size;
        torque += b * 0.62 * part.size;
        actionCost += a * 0.15 * part.size;
      } else if (part.type === 'fin') {
        thrust += a * 0.24 * part.size;
        torque += (part.side * a * 0.52 + b * 0.32) * part.size;
        actionCost += a * 0.075 * part.size;
      }
    }

    const spikes = partCount(genome, 'spike');
    const mass = Math.max(1.1, genome.size * (genome.vertebrae * 0.7 + genome.parts.length * 0.18));
    const drag = clamp(0.986 - spikes * 0.0025 - genome.vertebrae * 0.0008, 0.94, 0.986);
    const accel = (thrust * 38) / mass;
    creature.vx += Math.cos(creature.angle) * accel * SIM_DT;
    creature.vy += Math.sin(creature.angle) * accel * SIM_DT;
    creature.angularVelocity += (torque * 2.4 / mass) * SIM_DT;
    creature.angularVelocity *= 0.91;
    creature.angle = wrapAngle(creature.angle + creature.angularVelocity * SIM_DT);

    creature.vx *= drag;
    creature.vy *= drag;
    const speed = Math.hypot(creature.vx, creature.vy);
    const maxSpeed = 74 / Math.sqrt(genome.size);
    if (speed > maxSpeed) {
      creature.vx *= maxSpeed / speed;
      creature.vy *= maxSpeed / speed;
    }
    creature.x += creature.vx * SIM_DT;
    creature.y += creature.vy * SIM_DT;

    const r = bodyRadius(genome);
    if (creature.x < r) { creature.x = r; creature.vx = Math.abs(creature.vx) * 0.55; }
    if (creature.x > WORLD_WIDTH - r) { creature.x = WORLD_WIDTH - r; creature.vx = -Math.abs(creature.vx) * 0.55; }
    if (creature.y < r) { creature.y = r; creature.vy = Math.abs(creature.vy) * 0.55; }
    if (creature.y > WORLD_HEIGHT - r) { creature.y = WORLD_HEIGHT - r; creature.vy = -Math.abs(creature.vy) * 0.55; }

    const partMetabolic =
      partCount(genome, 'eye') * 0.025 +
      partCount(genome, 'chemo') * 0.015 +
      partCount(genome, 'stinger') * 0.035 +
      partCount(genome, 'fin') * 0.012;
    const basal = (0.25 + genome.vertebrae * 0.026 + genome.parts.length * 0.009 + partMetabolic) / genome.basalEfficiency;
    creature.energy -= (basal + actionCost) * SIM_DT;
  }

  private feedAndAttack(): void {
    const eatenFood = new Set<number>();
    const eatenCarcass = new Set<number>();

    for (const creature of this.creatures) {
      if (creature.health <= 0 || creature.energy <= 0) continue;
      const r = bodyRadius(creature.genome);
      const mouth = creature.genome.parts.find((p) => p.type === 'mouth')!;
      const mouthReach = r + 6 * mouth.size;

      const foodCandidates = this.foodGrid.nearby(creature.x, creature.y, mouthReach + 5);
      let bestFood: Food | null = null;
      let bestFoodD2 = Infinity;
      for (const food of foodCandidates) {
        if (eatenFood.has(food.id)) continue;
        const d2 = distanceSquared(creature.x, creature.y, food.x, food.y);
        if (d2 < bestFoodD2) { bestFoodD2 = d2; bestFood = food; }
      }
      if (bestFood && bestFoodD2 <= (mouthReach + bestFood.size) ** 2) {
        eatenFood.add(bestFood.id);
        const efficiency = 0.3 + 0.9 * (1 - creature.genome.diet);
        const gain = bestFood.energy * efficiency;
        creature.energy += gain;
        creature.brain.reward(clamp(gain / 16, 0, 1.2));
        if (maybeInnovate(creature.genome, this.rng, false)) this.recordInnovation(creature, 'stinger potential');
      }

      if (creature.genome.diet > 0.18) {
        const corpses = this.carcassGrid.nearby(creature.x, creature.y, mouthReach + 7);
        let best: Carcass | null = null;
        let bestD2 = Infinity;
        for (const carcass of corpses) {
          if (eatenCarcass.has(carcass.id)) continue;
          const d2 = distanceSquared(creature.x, creature.y, carcass.x, carcass.y);
          if (d2 < bestD2) { bestD2 = d2; best = carcass; }
        }
        if (best && bestD2 <= (mouthReach + best.size) ** 2) {
          const bite = Math.min(best.energy, 10 + mouth.size * 6);
          best.energy -= bite;
          const efficiency = 0.22 + 0.92 * creature.genome.diet;
          const gain = bite * efficiency;
          creature.energy += gain;
          creature.brain.reward(clamp(gain / 16, 0, 1.2));
          if (best.energy <= 0.5) eatenCarcass.add(best.id);
        }
      }

      const nearby = this.creatureGrid.nearby(creature.x, creature.y, Math.max(70, r + 45));
      let target: Creature | null = null;
      let targetD2 = Infinity;
      for (const other of nearby) {
        if (other.id === creature.id || other.health <= 0) continue;
        const d2 = distanceSquared(creature.x, creature.y, other.x, other.y);
        if (d2 < targetD2) { targetD2 = d2; target = other; }
      }

      const mouthIndex = creature.genome.parts.findIndex((p) => p.type === 'mouth');
      const biteAction = creature.actionA[mouthIndex] ?? 0;
      if (target && biteAction > 0.62) {
        const contact = mouthReach + bodyRadius(target.genome);
        if (targetD2 <= contact * contact) {
          const damage = (1.7 + 8.5 * creature.genome.diet) * mouth.size * biteAction * SIM_DT * 5;
          target.health -= damage;
          creature.energy -= 0.05 * biteAction;
          target.brain.reward(-clamp(damage / 12, 0, 1));
        }
      }

      if (target && creature.stingerCooldown <= 0) {
        const stingerIndexes = creature.genome.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'stinger');
        for (const { p, i } of stingerIndexes) {
          if ((creature.actionA[i] ?? 0) <= 0.72) continue;
          const reach = 36 + 24 * p.size;
          if (targetD2 <= reach * reach) {
            const damage = 10 + 12 * p.size;
            target.health -= damage;
            target.brain.reward(-clamp(damage / 18, 0, 1.4));
            creature.stingerCooldown = 4.5 + 2 / Math.max(0.3, p.size);
            creature.energy -= 1.3 + p.size * 0.7;
            break;
          }
        }
      }
    }

    for (const a of this.creatures) {
      const spikes = partCount(a.genome, 'spike');
      if (spikes === 0 || a.health <= 0) continue;
      const near = this.creatureGrid.nearby(a.x, a.y, bodyRadius(a.genome) + 40);
      for (const b of near) {
        if (b.id <= a.id || b.health <= 0) continue;
        const contact = bodyRadius(a.genome) + bodyRadius(b.genome);
        if (distanceSquared(a.x, a.y, b.x, b.y) > contact * contact) continue;
        const damage = spikes * 0.7 * SIM_DT;
        b.health -= damage;
        b.brain.reward(-damage * 0.08);
      }
    }

    if (eatenFood.size) this.food = this.food.filter((f) => !eatenFood.has(f.id));
    if (eatenCarcass.size) this.carcasses = this.carcasses.filter((c) => !eatenCarcass.has(c.id));
  }

  private recordInnovation(creature: Creature, name: string): void {
    const message = `Creature #${creature.id} (generation ${creature.generation}) discovered ${name}.`;
    this.events.push({ simTime: this.simTime, type: 'innovation', message });
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
  }

  private reproduceAndCull(): void {
    const newborns: Creature[] = [];
    for (const parent of this.creatures) {
      parent.age += SIM_DT;
      parent.stingerCooldown = Math.max(0, parent.stingerCooldown - SIM_DT);
      if (parent.health <= 0 || parent.energy <= 0 || parent.age >= MAX_AGE) continue;

      if (parent.age >= 18 && parent.energy >= 150 && this.creatures.length + newborns.length < MAX_POPULATION) {
        const childGenome = mutateGenome(parent.genome, parent.brain.fastSelf, parent.brain.fastMsg, this.rng);
        const offset = bodyRadius(parent.genome) + bodyRadius(childGenome) + 8;
        const theta = this.rng.range(-Math.PI, Math.PI);
        parent.energy -= 74;
        parent.children++;
        const child = this.makeCreature(
          childGenome,
          parent.id,
          parent.generation + 1,
          clamp(parent.x + Math.cos(theta) * offset, 20, WORLD_WIDTH - 20),
          clamp(parent.y + Math.sin(theta) * offset, 20, WORLD_HEIGHT - 20),
          50,
        );
        child.angle = wrapAngle(parent.angle + this.rng.gaussian(0, 0.35));
        newborns.push(child);
        this.births++;
      }
    }
    this.creatures.push(...newborns);

    const survivors: Creature[] = [];
    for (const creature of this.creatures) {
      if (creature.health > 0 && creature.energy > 0 && creature.age < MAX_AGE) {
        survivors.push(creature);
        continue;
      }
      this.deaths++;
      const bodyEnergy = Math.max(9, creature.energy * 0.35 + creature.genome.vertebrae * 4.5 + creature.genome.parts.length * 1.7);
      this.carcasses.push({
        id: this.nextCarcassId++,
        x: creature.x,
        y: creature.y,
        energy: bodyEnergy,
        age: 0,
        size: clamp(bodyRadius(creature.genome) * 0.45, 4, 15),
      });
      if (this.selectedId === creature.id) this.selectedId = null;
    }
    this.creatures = survivors;

    for (const carcass of this.carcasses) {
      carcass.age += SIM_DT;
      carcass.energy -= 0.11 * SIM_DT;
    }
    this.carcasses = this.carcasses.filter((c) => c.energy > 0.5 && c.age < 260);
  }

  step(): void {
    this.simTime += SIM_DT;
    const targetFood = 760;
    const spawnRatePerSecond = 7.2;
    if (this.food.length < targetFood) {
      this.foodSpawnAccumulator += spawnRatePerSecond * SIM_DT;
      while (this.foodSpawnAccumulator >= 1 && this.food.length < targetFood) {
        this.food.push(this.spawnFood());
        this.foodSpawnAccumulator -= 1;
      }
    } else {
      this.foodSpawnAccumulator = Math.min(this.foodSpawnAccumulator, 1);
    }

    this.creatureGrid.rebuild(this.creatures);
    this.foodGrid.rebuild(this.food);
    this.carcassGrid.rebuild(this.carcasses);

    for (const creature of this.creatures) {
      creature.thoughtAccumulator += SIM_DT;
      if (creature.thoughtAccumulator >= BRAIN_INTERVAL) {
        creature.thoughtAccumulator -= BRAIN_INTERVAL;
        const actions = creature.brain.think(this.sense(creature));
        creature.actionA = actions.a;
        creature.actionB = actions.b;
      }
      this.move(creature);
    }

    this.creatureGrid.rebuild(this.creatures);
    this.feedAndAttack();
    this.reproduceAndCull();
  }

  setSelected(id: number | null): void {
    this.selectedId = id;
  }

  private renderCreature(creature: Creature): CreatureRenderState {
    return {
      id: creature.id,
      parentId: creature.parentId,
      generation: creature.generation,
      x: creature.x,
      y: creature.y,
      angle: creature.angle,
      radius: bodyRadius(creature.genome),
      health: clamp(creature.health / maxHealth(creature.genome), 0, 1),
      energy: creature.energy,
      age: creature.age,
      children: creature.children,
      vertebrae: creature.genome.vertebrae,
      diet: creature.genome.diet,
      parts: creature.genome.parts.map((p) => ({ ...p })),
      innovations: [...creature.genome.innovations],
      plasticity: averagePlasticity(creature.genome),
      lamarckFraction: creature.genome.brain.lamarckFraction,
      learnedMagnitude: creature.brain.learnedMagnitude,
    };
  }

  snapshot(speedMode: SpeedMode, thermalSafe: boolean, simRate: number): WorldSnapshot {
    const renders = this.creatures.map((c) => this.renderCreature(c));
    const selected = this.selectedId === null ? null : renders.find((c) => c.id === this.selectedId) ?? null;
    const morphotypes = new Set(this.creatures.map((c) => morphotypeKey(c.genome))).size;
    const maxGeneration = this.creatures.reduce((m, c) => Math.max(m, c.generation), 0);
    const innovationEvents = this.events.filter((e) => e.type === 'innovation').length;

    return {
      simTime: this.simTime,
      creatures: renders,
      food: this.food.map((f) => ({ x: f.x, y: f.y, size: f.size })),
      carcasses: this.carcasses.map((c) => ({ x: c.x, y: c.y, size: c.size, energy: c.energy })),
      selected,
      stats: {
        population: this.creatures.length,
        food: this.food.length,
        carcasses: this.carcasses.length,
        births: this.births,
        deaths: this.deaths,
        maxGeneration,
        morphotypes,
        innovations: innovationEvents,
        simRate,
        speedMode,
        thermalSafe,
      },
    };
  }

  createCheckpoint(): WorldCheckpoint {
    return {
      version: 1,
      simTime: this.simTime,
      nextCreatureId: this.nextCreatureId,
      nextFoodId: this.nextFoodId,
      nextCarcassId: this.nextCarcassId,
      births: this.births,
      deaths: this.deaths,
      rng: this.rng.snapshot(),
      creatures: this.creatures.map((c): CreatureCheckpoint => ({
        id: c.id,
        parentId: c.parentId,
        generation: c.generation,
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        angle: c.angle,
        angularVelocity: c.angularVelocity,
        health: c.health,
        energy: c.energy,
        age: c.age,
        children: c.children,
        stingerCooldown: c.stingerCooldown,
        thoughtAccumulator: c.thoughtAccumulator,
        actionA: [...c.actionA],
        actionB: [...c.actionB],
        genome: cloneGenome(c.genome),
        brain: c.brain.checkpoint(),
      })),
      food: this.food.map((f) => ({ ...f })),
      carcasses: this.carcasses.map((c) => ({ ...c })),
      events: this.events.map((e) => ({ ...e })),
      selectedId: this.selectedId,
    };
  }

  private loadCheckpoint(checkpoint: WorldCheckpoint): void {
    if (checkpoint.version !== 1) throw new Error(`Unsupported checkpoint version ${String(checkpoint.version)}`);
    this.rng = new Rng(undefined, checkpoint.rng);
    this.simTime = checkpoint.simTime;
    this.nextCreatureId = checkpoint.nextCreatureId;
    this.nextFoodId = checkpoint.nextFoodId;
    this.nextCarcassId = checkpoint.nextCarcassId;
    this.births = checkpoint.births;
    this.deaths = checkpoint.deaths;
    this.food = checkpoint.food.map((f) => ({ ...f }));
    this.carcasses = checkpoint.carcasses.map((c) => ({ ...c }));
    this.events = checkpoint.events.map((e) => ({ ...e }));
    this.selectedId = checkpoint.selectedId;
    this.foodSpawnAccumulator = 0;

    this.creatures = checkpoint.creatures.map((c) => {
      const genome = cloneGenome(c.genome);
      return {
        id: c.id,
        parentId: c.parentId,
        generation: c.generation,
        x: c.x,
        y: c.y,
        vx: c.vx,
        vy: c.vy,
        angle: c.angle,
        angularVelocity: c.angularVelocity,
        health: c.health,
        energy: c.energy,
        age: c.age,
        children: c.children,
        stingerCooldown: c.stingerCooldown,
        thoughtAccumulator: c.thoughtAccumulator,
        actionA: [...c.actionA],
        actionB: [...c.actionB],
        genome,
        brain: new BrainRuntime(genome, c.brain),
      };
    });
  }
}
