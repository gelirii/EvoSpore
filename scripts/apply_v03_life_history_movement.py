from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_all_checked(path: str, old: str, new: str, minimum: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"Expected at least {minimum} matches in {path}, found {count}: {old!r}")
    p.write_text(text.replace(old, new))

# ---------- types ----------
types = Path('src/sim/types.ts')
t = types.read_text()
t = t.replace('export const MAX_POPULATION = 650;\n', 'export const MAX_POPULATION = 650;\nexport const MAX_CREATURE_AGE = 1000;\n', 1)
life = '''export type DamageMethod = 'bite' | 'stinger' | 'spike';
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

'''
if 'export interface LifeHistory' not in t:
    t = t.replace('export interface CreatureCheckpoint {\n', life + 'export interface CreatureCheckpoint {\n', 1)
t = t.replace('  children: number;\n  stingerCooldown: number;\n', '  children: number;\n  history?: LifeHistory;\n  lastDamagedBy?: number | null;\n  lastDamageMethod?: DamageMethod | null;\n  stingerCooldown: number;\n', 1)
t = t.replace("  | 'mostChildren'\n", "  | 'mostChildren'\n  | 'mostKills'\n  | 'mostMeatEaten'\n  | 'mostScavenged'\n  | 'mostStolenMeat'\n  | 'mostPlantEaten'\n", 1)
t = t.replace('  innovations: string[];\n}\n\nexport interface Food {', '  innovations: string[];\n  history: LifeHistory;\n}\n\nexport interface Food {', 1)
t = t.replace('export interface Carcass {\n  id: number;\n  x: number;\n  y: number;\n  energy: number;\n  age: number;\n  size: number;\n}', "export interface Carcass {\n  id: number;\n  x: number;\n  y: number;\n  energy: number;\n  age: number;\n  size: number;\n  sourceCreatureId?: number;\n  killerId?: number | null;\n  deathCause?: DeathCause;\n  killMethod?: DamageMethod | null;\n}", 1)
t = t.replace('  learnedMagnitude: number;\n}\n\nexport interface FoodRenderState', '  learnedMagnitude: number;\n  history: LifeHistory;\n}\n\nexport interface FoodRenderState', 1)
types.write_text(t)

# ---------- brain: current sensory state can reach propulsion in the same think; motors know their own geometry ----------
brain = Path('src/sim/brain.ts')
b = brain.read_text()
old = '''  for (let s = 0; s < genome.vertebrae - 1; s++) link(1 + s, 1 + s + 1);
  genome.parts.forEach((part, i) => link(partNodeByIndex[i]!, 1 + part.segment));
  for (let i = 1; i < nodes.length; i++) link(0, i);

  return { nodes, partNodeByIndex };
}'''
new = '''  for (let s = 0; s < genome.vertebrae - 1; s++) link(1 + s, 1 + s + 1);
  genome.parts.forEach((part, i) => link(partNodeByIndex[i]!, 1 + part.segment));
  for (let i = 1; i < nodes.length; i++) link(0, i);

  // Cheap sensorimotor reflex arcs: this does not encode what to chase or avoid.
  // It only lets current eye/chemo state reach propulsion within the existing two message rounds.
  const sensors = nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.typeIndex === TYPE_INDEX.eye || node.typeIndex === TYPE_INDEX.chemo);
  const motors = nodes.map((node, i) => ({ node, i })).filter(({ node }) => node.typeIndex === TYPE_INDEX.flagellum || node.typeIndex === TYPE_INDEX.tail || node.typeIndex === TYPE_INDEX.fin);
  for (const sensor of sensors) for (const motor of motors) link(sensor.i, motor.i);

  return { nodes, partNodeByIndex };
}'''
if old not in b:
    raise SystemExit('brain graph block not found')
b = b.replace(old, new, 1)
old = '''    } else if (node.typeIndex === TYPE_INDEX.stinger) {
      obs[0] = sense.stingerCharge;
      obs[1] = clamp(1 - sense.nearestCreatureDistance * 4, 0, 1);
      obs[2] = Math.sin(sense.nearestCreatureBearing);
      obs[3] = Math.cos(sense.nearestCreatureBearing);
    } else if (node.typeIndex === TYPE_INDEX.spine) {'''
new = '''    } else if (node.typeIndex === TYPE_INDEX.stinger) {
      obs[0] = sense.stingerCharge;
      obs[1] = clamp(1 - sense.nearestCreatureDistance * 4, 0, 1);
      obs[2] = Math.sin(sense.nearestCreatureBearing);
      obs[3] = Math.cos(sense.nearestCreatureBearing);
    } else if (node.typeIndex === TYPE_INDEX.flagellum || node.typeIndex === TYPE_INDEX.tail || node.typeIndex === TYPE_INDEX.fin) {
      const part = this.genome.parts[node.partIndex]!;
      obs[0] = clamp(sense.speedForward, -1, 1);
      obs[1] = clamp(sense.speedSide, -1, 1);
      obs[2] = clamp(sense.angularVelocity, -1, 1);
      obs[3] = part.side;
      obs[4] = Math.sin(part.angle);
      obs[5] = Math.cos(part.angle);
      obs[6] = clamp(sense.energy * 2 - 1, -1, 1);
      obs[7] = clamp(1 - sense.boundaryDistance, 0, 1);
    } else if (node.typeIndex === TYPE_INDEX.spine) {'''
if old not in b:
    raise SystemExit('brain observation block not found')
b = b.replace(old, new, 1)
brain.write_text(b)

# ---------- world ----------
world = Path('src/sim/world.ts')
w = world.read_text()
w = w.replace('  MAX_POPULATION,\n', '  MAX_POPULATION,\n  MAX_CREATURE_AGE,\n', 1)
w = w.replace('  type CreatureRenderState,\n', '  type CreatureRenderState,\n  type DamageMethod,\n  type DeathCause,\n', 1)
w = w.replace('  type HistoricalEvent,\n', '  type HistoricalEvent,\n  type LifeHistory,\n', 1)
w = w.replace('const MAX_AGE = 1000;\n', '', 1)
w = w.replace('  children: number;\n  stingerCooldown: number;\n', '  children: number;\n  history: LifeHistory;\n  lastDamagedBy: number | null;\n  lastDamageMethod: DamageMethod | null;\n  stingerCooldown: number;\n', 1)
w = w.replace('  private foodSpawnAccumulator = 0;\n', '  private foodSpawnAccumulator = 0;\n  private retiredCreatures: CreatureCheckpoint[] = [];\n', 1)
helper_marker = '''function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}
'''
helpers = helper_marker + '''
function emptyLifeHistory(): LifeHistory {
  return {
    distanceTravelled: 0, plantIntake: 0, meatIntake: 0, ownKillMeat: 0, stolenKillMeat: 0, carrionMeat: 0,
    damageDealt: 0, damageTaken: 0, biteDamage: 0, stingerDamage: 0, spikeDamage: 0, attacksLanded: 0,
    kills: 0, biteKills: 0, stingerKills: 0, spikeKills: 0, killCarcassEnergy: 0,
  };
}

function cloneLifeHistory(history?: LifeHistory): LifeHistory {
  return { ...emptyLifeHistory(), ...(history ?? {}) };
}

function steeringSignal(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= 0.12) return 0;
  return Math.sign(value) * clamp((magnitude - 0.12) / 0.88, 0, 1);
}
'''
if helper_marker not in w:
    raise SystemExit('distance helper marker not found')
w = w.replace(helper_marker, helpers, 1)
w = w.replace('    this.foodSpawnAccumulator = 0;\n\n    const founder', '    this.foodSpawnAccumulator = 0;\n    this.retiredCreatures = [];\n\n    const founder', 1)
w = w.replace('      angularVelocity: 0,\n', '      angularVelocity: this.rng.gaussian(0, 0.18),\n', 1)
w = w.replace('      children: 0,\n      stingerCooldown: 0,\n', '      children: 0,\n      history: emptyLifeHistory(),\n      lastDamagedBy: null,\n      lastDamageMethod: null,\n      stingerCooldown: 0,\n', 1)
# movement block
w = w.replace('''    for (let i = 0; i < genome.parts.length; i++) {
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
    }''', '''    const startX = creature.x;
    const startY = creature.y;
    for (let i = 0; i < genome.parts.length; i++) {
      const part = genome.parts[i]!;
      const a = clamp(creature.actionA[i] ?? 0, 0, 1);
      const b = steeringSignal(clamp(creature.actionB[i] ?? 0, -1, 1));
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
        // Fin thrust no longer creates an automatic same-sign turn merely because the fin is on one side.
        torque += b * 0.68 * part.size;
        actionCost += a * 0.075 * part.size;
      }
    }''', 1)
w = w.replace('    creature.angularVelocity *= 0.91;\n', '    creature.angularVelocity *= 0.84;\n', 1)
w = w.replace('    creature.y += creature.vy * SIM_DT;\n\n    const r = bodyRadius(genome);', '    creature.y += creature.vy * SIM_DT;\n    creature.history.distanceTravelled += Math.hypot(creature.x - startX, creature.y - startY);\n\n    const r = bodyRadius(genome);', 1)
# replace entire feedAndAttack function
start = w.index('  private feedAndAttack(): void {')
end = w.index('\n  private recordInnovation', start)
new_feed = '''  private registerDamage(attacker: Creature, target: Creature, damage: number, method: DamageMethod, rewardDivisor: number): void {
    if (damage <= 0 || target.health <= 0) return;
    target.health -= damage;
    target.history.damageTaken += damage;
    attacker.history.damageDealt += damage;
    attacker.history.attacksLanded += 1;
    if (method === 'bite') attacker.history.biteDamage += damage;
    else if (method === 'stinger') attacker.history.stingerDamage += damage;
    else attacker.history.spikeDamage += damage;
    target.lastDamagedBy = attacker.id;
    target.lastDamageMethod = method;
    target.brain.reward(-clamp(damage / rewardDivisor, 0, method === 'stinger' ? 1.4 : 1));
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
        creature.history.plantIntake += bestFood.energy;
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
          creature.history.meatIntake += bite;
          if (best.killerId === creature.id) creature.history.ownKillMeat += bite;
          else if (best.killerId != null) creature.history.stolenKillMeat += bite;
          else creature.history.carrionMeat += bite;
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
          this.registerDamage(creature, target, damage, 'bite', 12);
          creature.energy -= 0.05 * biteAction;
        }
      }

      if (target && creature.stingerCooldown <= 0) {
        const stingerIndexes = creature.genome.parts.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'stinger');
        for (const { p, i } of stingerIndexes) {
          if ((creature.actionA[i] ?? 0) <= 0.72) continue;
          const reach = 36 + 24 * p.size;
          if (targetD2 <= reach * reach) {
            const damage = 10 + 12 * p.size;
            this.registerDamage(creature, target, damage, 'stinger', 18);
            creature.stingerCooldown = 4.5 + 2 / Math.max(0.3, p.size);
            creature.energy -= 1.3 + p.size * 0.7;
            break;
          }
        }
      }
    }

    // Unique collision pairs, but spike retaliation is now evaluated in both directions.
    for (const a of this.creatures) {
      if (a.health <= 0) continue;
      const near = this.creatureGrid.nearby(a.x, a.y, bodyRadius(a.genome) + 70);
      for (const b of near) {
        if (b.id <= a.id || b.health <= 0) continue;
        const contact = bodyRadius(a.genome) + bodyRadius(b.genome);
        if (distanceSquared(a.x, a.y, b.x, b.y) > contact * contact) continue;
        const spikesA = partCount(a.genome, 'spike');
        const spikesB = partCount(b.genome, 'spike');
        if (spikesA > 0) this.registerDamage(a, b, spikesA * 0.7 * SIM_DT, 'spike', 12.5);
        if (spikesB > 0) this.registerDamage(b, a, spikesB * 0.7 * SIM_DT, 'spike', 12.5);
      }
    }

    if (eatenFood.size) this.food = this.food.filter((f) => !eatenFood.has(f.id));
    if (eatenCarcass.size) this.carcasses = this.carcasses.filter((c) => !eatenCarcass.has(c.id));
  }
'''
w = w[:start] + new_feed + w[end:]
# replace reproduce/cull function
start = w.index('  private reproduceAndCull(): void {')
end = w.index('\n  step(): void {', start)
new_repro = '''  private checkpointCreature(c: Creature): CreatureCheckpoint {
    return {
      id: c.id, parentId: c.parentId, generation: c.generation, x: c.x, y: c.y, vx: c.vx, vy: c.vy,
      angle: c.angle, angularVelocity: c.angularVelocity, health: c.health, energy: c.energy, age: c.age,
      children: c.children, history: cloneLifeHistory(c.history), lastDamagedBy: c.lastDamagedBy,
      lastDamageMethod: c.lastDamageMethod, stingerCooldown: c.stingerCooldown, thoughtAccumulator: c.thoughtAccumulator,
      actionA: [...c.actionA], actionB: [...c.actionB], genome: cloneGenome(c.genome), brain: c.brain.checkpoint(),
    };
  }

  drainRetiredCreatures(): CreatureCheckpoint[] {
    if (!this.retiredCreatures.length) return [];
    return this.retiredCreatures.splice(0, this.retiredCreatures.length);
  }

  private reproduceAndCull(): void {
    const newborns: Creature[] = [];
    for (const parent of this.creatures) {
      parent.age += SIM_DT;
      parent.stingerCooldown = Math.max(0, parent.stingerCooldown - SIM_DT);
      if (parent.health <= 0 || parent.energy <= 0 || parent.age >= MAX_CREATURE_AGE) continue;

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

    const dead = this.creatures.filter((c) => c.health <= 0 || c.energy <= 0 || c.age >= MAX_CREATURE_AGE);
    const byId = new Map(this.creatures.map((c) => [c.id, c]));
    const bodyEnergyById = new Map<number, number>();

    for (const creature of dead) {
      const bodyEnergy = Math.max(9, creature.energy * 0.35 + creature.genome.vertebrae * 4.5 + creature.genome.parts.length * 1.7);
      bodyEnergyById.set(creature.id, bodyEnergy);
      let cause: DeathCause = 'unknown';
      let killer: Creature | undefined;
      if (creature.health <= 0) {
        cause = creature.lastDamageMethod ?? 'unknown';
        killer = creature.lastDamagedBy == null ? undefined : byId.get(creature.lastDamagedBy);
      } else if (creature.energy <= 0) cause = 'starvation';
      else if (creature.age >= MAX_CREATURE_AGE) cause = 'oldAge';

      creature.history.deathCause = cause;
      if (killer && killer.id !== creature.id) {
        creature.history.killedBy = killer.id;
        killer.history.kills += 1;
        killer.history.killCarcassEnergy += bodyEnergy;
        if (cause === 'bite') killer.history.biteKills += 1;
        else if (cause === 'stinger') killer.history.stingerKills += 1;
        else if (cause === 'spike') killer.history.spikeKills += 1;
      }
    }

    const deadIds = new Set(dead.map((c) => c.id));
    for (const creature of dead) {
      this.deaths++;
      const bodyEnergy = bodyEnergyById.get(creature.id)!;
      const killerId = creature.history.killedBy ?? null;
      this.retiredCreatures.push(this.checkpointCreature(creature));
      this.carcasses.push({
        id: this.nextCarcassId++, x: creature.x, y: creature.y, energy: bodyEnergy, age: 0,
        size: clamp(bodyRadius(creature.genome) * 0.45, 4, 15), sourceCreatureId: creature.id,
        killerId, deathCause: creature.history.deathCause, killMethod: creature.history.deathCause === 'bite' || creature.history.deathCause === 'stinger' || creature.history.deathCause === 'spike' ? creature.history.deathCause : null,
      });
      if (this.selectedId === creature.id) this.selectedId = null;
    }
    this.creatures = this.creatures.filter((c) => !deadIds.has(c.id));

    for (const carcass of this.carcasses) {
      carcass.age += SIM_DT;
      carcass.energy -= 0.11 * SIM_DT;
    }
    this.carcasses = this.carcasses.filter((c) => c.energy > 0.5 && c.age < 260);
  }
'''
w = w[:start] + new_repro + w[end:]
# render/checkpoint/load
w = w.replace('      learnedMagnitude: creature.brain.learnedMagnitude,\n', '      learnedMagnitude: creature.brain.learnedMagnitude,\n      history: cloneLifeHistory(creature.history),\n', 1)
old_map_start = '''      creatures: this.creatures.map((c): CreatureCheckpoint => ({
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
      })),'''
if old_map_start not in w:
    raise SystemExit('checkpoint creature map block not found')
w = w.replace(old_map_start, '      creatures: this.creatures.map((c) => this.checkpointCreature(c)),', 1)
w = w.replace('    this.foodSpawnAccumulator = 0;\n\n    this.creatures = checkpoint.creatures.map((c) => {', '    this.foodSpawnAccumulator = 0;\n    this.retiredCreatures = [];\n\n    this.creatures = checkpoint.creatures.map((c) => {', 1)
w = w.replace('        children: c.children,\n        stingerCooldown: c.stingerCooldown,\n', '        children: c.children,\n        history: cloneLifeHistory(c.history),\n        lastDamagedBy: c.lastDamagedBy ?? null,\n        lastDamageMethod: c.lastDamageMethod ?? null,\n        stingerCooldown: c.stingerCooldown,\n', 1)
world.write_text(w)

# ---------- worker fossils and exact retirement capture ----------
worker = Path('src/worker.ts')
q = worker.read_text()
q = q.replace('  FossilRecordSummary,\n', '  FossilRecordSummary,\n  LifeHistory,\n', 1)
q = q.replace('  PartType,\n', '  PartType,\n  MAX_CREATURE_AGE,\n  SIM_DT,\n', 1)
q = q.replace("  'highestGeneration', 'oldest', 'mostChildren', 'largestBody', 'smallestBody',\n", "  'highestGeneration', 'oldest', 'mostChildren', 'mostKills', 'mostMeatEaten', 'mostScavenged', 'mostStolenMeat', 'mostPlantEaten', 'largestBody', 'smallestBody',\n", 1)
q = q.replace("  mostChildren: { name: 'Genghis Worm', title: 'Most offspring', description: 'The most prolific individual ever recorded.' },\n", "  mostChildren: { name: 'Genghis Worm', title: 'Most offspring', description: 'The most prolific individual ever recorded.' },\n  mostKills: { name: 'The Apex Predator', title: 'Most confirmed kills', description: 'Highest number of creatures personally killed.', positiveOnly: true },\n  mostMeatEaten: { name: 'The Meat Grinder', title: 'Most meat eaten', description: 'Largest lifetime intake of carcass biomass.', positiveOnly: true },\n  mostScavenged: { name: 'The Vulture', title: 'Most natural carrion eaten', description: 'Thrived on creatures that died without a killer.', positiveOnly: true },\n  mostStolenMeat: { name: 'The Lunch Thief', title: 'Most stolen kills eaten', description: 'Ate the most meat from creatures killed by somebody else.', positiveOnly: true },\n  mostPlantEaten: { name: 'The Salad Destroyer', title: 'Most plant food eaten', description: 'Largest lifetime intake of renewable pond food.', positiveOnly: true },\n", 1)
# rename genome-only apex
q = q.replace("mostCarnivorous: { name: 'The Apex Predator', title: 'Most carnivorous', description: 'Closest the pond has come to a pure meat-eater.' },", "mostCarnivorous: { name: 'The Meat Fundamentalist', title: 'Most carnivorous genome', description: 'Closest the pond has come to a genetically pure meat specialist.' },", 1)
metric_marker = '''function metric(creature: CreatureCheckpoint, key: FossilCategory): { score: number; displayValue: number } {
  const counts = countParts(creature);
  switch (key) {'''
history_helpers = '''function blankHistory(): LifeHistory {
  return { distanceTravelled: 0, plantIntake: 0, meatIntake: 0, ownKillMeat: 0, stolenKillMeat: 0, carrionMeat: 0, damageDealt: 0, damageTaken: 0, biteDamage: 0, stingerDamage: 0, spikeDamage: 0, attacksLanded: 0, kills: 0, biteKills: 0, stingerKills: 0, spikeKills: 0, killCarcassEnergy: 0 };
}

function historyOf(creature: CreatureCheckpoint): LifeHistory {
  return { ...blankHistory(), ...(creature.history ?? {}) };
}

function metric(creature: CreatureCheckpoint, key: FossilCategory): { score: number; displayValue: number } {
  const counts = countParts(creature);
  const history = historyOf(creature);
  switch (key) {'''
if metric_marker not in q:
    raise SystemExit('worker metric marker not found')
q = q.replace(metric_marker, history_helpers, 1)
q = q.replace("    case 'oldest': return { score: creature.age, displayValue: creature.age };\n    case 'mostChildren': return { score: creature.children, displayValue: creature.children };", "    case 'oldest': { const age = Math.min(creature.age, MAX_CREATURE_AGE - SIM_DT); return { score: age, displayValue: age }; }\n    case 'mostChildren': return { score: creature.children, displayValue: creature.children };\n    case 'mostKills': return { score: history.kills, displayValue: history.kills };\n    case 'mostMeatEaten': return { score: history.meatIntake, displayValue: history.meatIntake };\n    case 'mostScavenged': return { score: history.carrionMeat, displayValue: history.carrionMeat };\n    case 'mostStolenMeat': return { score: history.stolenKillMeat, displayValue: history.stolenKillMeat };\n    case 'mostPlantEaten': return { score: history.plantIntake, displayValue: history.plantIntake };", 1)
# refactor consider fossils for retired creatures
old = '''function considerFossils(checkpoint: WorldCheckpoint): void {
  for (const creature of checkpoint.creatures) {
    for (const key of FOSSIL_ORDER) {
      const meta = FOSSIL_META[key];
      const m = metric(creature, key);
      if (meta.positiveOnly && m.displayValue <= 0) continue;
      const current = fossilRecords.get(key);
      if (current && m.score <= current.score) continue;
      fossilRecords.set(key, {
        key,
        name: meta.name,
        title: meta.title,
        description: meta.description,
        score: m.score,
        displayValue: m.displayValue,
        recordedAt: checkpoint.simTime,
        creature: clone(creature),
      });
    }
  }
}'''
new = '''function considerCreatures(creatures: CreatureCheckpoint[], recordedAt: number): void {
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
}'''
if old not in q:
    raise SystemExit('worker consider block not found')
q = q.replace(old, new, 1)
q = q.replace('      innovations: [...creature.genome.innovations],\n', '      innovations: [...creature.genome.innovations],\n      history: historyOf(creature),\n', 1)
# reset resurrected life history
q = q.replace('  revived.children = 0;\n  revived.stingerCooldown = 0;\n', '  revived.children = 0;\n  revived.history = blankHistory();\n  revived.lastDamagedBy = null;\n  revived.lastDamageMethod = null;\n  revived.stingerCooldown = 0;\n', 1)
q = q.replace('    sampleFossils();\n    flushEvents();\n', '    collectRetiredFossils();\n    sampleFossils();\n    flushEvents();\n', 1)
worker.write_text(q)

# ---------- main UI ----------
main = Path('src/main.ts')
m = main.read_text()
m = m.replace('<div class="brand"><strong>EvoSpore</strong><span>v0.2</span></div>', '<div class="brand"><strong>EvoSpore</strong><span>v0.3</span></div>', 1)
part_marker = '''function partSummary(creature: CreatureRenderState): string {
  const counts = new Map<string, number>();
  for (const p of creature.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${v}× ${k}`).join(' · ');
}
'''
extra = part_marker + '''
function feedingStyle(creature: CreatureRenderState): string {
  const h = creature.history;
  if (h.meatIntake < 1) return h.plantIntake >= 1 ? 'Plant feeder' : 'Too early to tell';
  const ownShare = h.meatIntake > 0 ? h.ownKillMeat / h.meatIntake : 0;
  const stolenShare = h.meatIntake > 0 ? h.stolenKillMeat / h.meatIntake : 0;
  const carrionShare = h.meatIntake > 0 ? h.carrionMeat / h.meatIntake : 0;
  if (h.kills > 0 && ownShare >= 0.45) return 'Active predator';
  if (stolenShare >= 0.5) return 'Kill thief / kleptoparasite';
  if (carrionShare >= 0.5) return h.kills > 0 ? 'Predator-scavenger' : 'Scavenger';
  if (h.kills > 0) return 'Opportunistic predator';
  return 'Opportunistic meat-eater';
}

function meatSourceSummary(creature: CreatureRenderState): string {
  const h = creature.history;
  if (h.meatIntake <= 0) return 'none yet';
  const pct = (value: number) => Math.round(value / h.meatIntake * 100);
  return `${pct(h.ownKillMeat)}% own kills · ${pct(h.stolenKillMeat)}% stolen kills · ${pct(h.carrionMeat)}% carrion`;
}
'''
if part_marker not in m:
    raise SystemExit('main part marker missing')
m = m.replace(part_marker, extra, 1)
old = '''      <span>Learned change</span><b>${creature.learnedMagnitude.toFixed(4)}</b>
    </div>
    <div class="parts">${partSummary(creature)}</div>'''
new = '''      <span>Learned change</span><b>${creature.learnedMagnitude.toFixed(4)}</b>
      <span>Behaviour</span><b>${feedingStyle(creature)}</b>
      <span>Distance travelled</span><b>${creature.history.distanceTravelled.toFixed(0)}</b>
      <span>Plant eaten</span><b>${creature.history.plantIntake.toFixed(1)}</b>
      <span>Meat eaten</span><b>${creature.history.meatIntake.toFixed(1)}</b>
      <span>Confirmed kills</span><b>${creature.history.kills}</b>
      <span>Kill methods</span><b>${creature.history.biteKills} bite · ${creature.history.stingerKills} sting · ${creature.history.spikeKills} spike</b>
      <span>Damage dealt / taken</span><b>${creature.history.damageDealt.toFixed(1)} / ${creature.history.damageTaken.toFixed(1)}</b>
    </div>
    <div class="parts"><b>Meat sources:</b> ${meatSourceSummary(creature)}</div>
    ${creature.history.kills > 0 ? `<div class="parts"><b>Own-kill recovery:</b> ${creature.history.killCarcassEnergy > 0 ? Math.round(creature.history.ownKillMeat / creature.history.killCarcassEnergy * 100) : 0}% of generated carcass biomass eaten by this killer</div>` : ''}
    <div class="parts">${partSummary(creature)}</div>'''
if old not in m:
    raise SystemExit('main inspector block missing')
m = m.replace(old, new, 1)
m = m.replace("  if (fossil.key === 'largestBody' || fossil.key === 'smallestBody' || fossil.key === 'mostEfficient' || fossil.key === 'mostLearned') return fossil.displayValue.toFixed(3);", "  if (fossil.key === 'largestBody' || fossil.key === 'smallestBody' || fossil.key === 'mostEfficient' || fossil.key === 'mostLearned') return fossil.displayValue.toFixed(3);\n  if (fossil.key === 'mostMeatEaten' || fossil.key === 'mostScavenged' || fossil.key === 'mostStolenMeat' || fossil.key === 'mostPlantEaten') return fossil.displayValue.toFixed(1);", 1)
m = m.replace('      <div class="fossil-stats">${fossil.vertebrae} vertebrae · ${fossil.totalParts} parts · ${Math.round(fossil.diet * 100)}% carnivory · ${Math.round(fossil.lamarckFraction * 100)}% Lamarck</div>', '      <div class="fossil-stats">${fossil.vertebrae} vertebrae · ${fossil.totalParts} parts · ${Math.round(fossil.diet * 100)}% carnivory · ${fossil.history.kills} kills · ${Math.round(fossil.lamarckFraction * 100)}% Lamarck</div>', 1)
main.write_text(m)

# ---------- version ----------
package = Path('package.json')
p = package.read_text().replace('"version": "0.2.0"', '"version": "0.3.0"', 1)
package.write_text(p)

# Keep the README concise but accurate about the current release.
readme = Path('README.md')
r = readme.read_text()
r = r.replace('**v0.1** is deliberately small enough for an iPhone while already containing the complete evolutionary loop.', '**v0.3** keeps the mobile-first core loop while adding a fossil record, behavioural life histories, attributable predation/scavenging and less biased steering.', 1)
r = r.replace('## v0.1\n', '## Current capabilities\n', 1)
r = r.replace('- One persistent 2D pond with renewable food, carcasses, competition, predation and death.\n', '- One persistent 2D pond with renewable food, attributable carcasses, competition, predation, scavenging and death.\n- Per-creature life histories track travel, feeding sources, damage, confirmed kills and whether meat came from own kills, stolen kills or natural carrion.\n- Propulsion has a steering dead-zone, stronger angular damping and sensorimotor reflex links so persistent arbitrary spiralling is less attractive while targeting remains evolved/learned rather than scripted.\n', 1)
readme.write_text(r)

print('v0.3 patch applied')
