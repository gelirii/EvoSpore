import { MAX_POPULATION } from '../src/sim/types';
import { World } from '../src/sim/world';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const world = new World();
const started = performance.now();
let peakPopulation = 0;

for (let i = 0; i < 4000; i++) {
  world.step();
  if (i % 50 === 0) {
    const cp = world.createCheckpoint();
    peakPopulation = Math.max(peakPopulation, cp.creatures.length);
    assert(cp.creatures.length <= MAX_POPULATION, 'Population exceeded emergency ceiling');
    for (const c of cp.creatures) {
      for (const n of [c.x, c.y, c.vx, c.vy, c.angle, c.health, c.energy, c.age]) {
        assert(Number.isFinite(n), `Non-finite creature state at step ${i}`);
      }
    }
  }
}

const elapsed = (performance.now() - started) / 1000;
const checkpoint = world.createCheckpoint();
const snapshot = world.snapshot('deep', true, 0);
assert(checkpoint.creatures.length >= 25, `Population collapsed to ${checkpoint.creatures.length}`);
assert(checkpoint.creatures.length < MAX_POPULATION, 'World is regulated only by the hard population ceiling');
assert(checkpoint.births >= 20, `Too few births: ${checkpoint.births}`);
assert(checkpoint.deaths >= 1, `No deaths occurred: ${checkpoint.deaths}`);
assert(snapshot.stats.maxGeneration >= 1, 'No descendants reached generation 1');
assert(snapshot.stats.morphotypes >= 2, 'No structural/trait diversity emerged');

const a = new World(checkpoint);
const b = new World(checkpoint);
for (let i = 0; i < 80; i++) { a.step(); b.step(); }
assert(JSON.stringify(a.createCheckpoint()) === JSON.stringify(b.createCheckpoint()), 'Checkpoint restore is not deterministic');

console.log(JSON.stringify({
  simulatedSeconds: Math.round(world.simTime),
  computeSeconds: Number(elapsed.toFixed(2)),
  headlessMultiplier: Number((world.simTime / elapsed).toFixed(1)),
  population: checkpoint.creatures.length,
  peakPopulation,
  births: checkpoint.births,
  deaths: checkpoint.deaths,
  maxGeneration: snapshot.stats.maxGeneration,
  morphotypes: snapshot.stats.morphotypes,
  innovations: snapshot.stats.innovations,
  deterministicRestore: true,
}, null, 2));
