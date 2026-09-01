import { World } from '../src/sim/world';
import type { CreatureCheckpoint, LifeHistory } from '../src/sim/types';

const world = new World();
const retired: CreatureCheckpoint[] = [];
let signedTurn = 0;
let absoluteTurn = 0;
let positiveTurn = 0;
let negativeTurn = 0;
let turnSamples = 0;

for (let step = 0; step < 12_000; step++) {
  world.step();
  retired.push(...world.drainRetiredCreatures());
  if (step > 500 && step % 20 === 0) {
    const cp = world.createCheckpoint();
    for (const c of cp.creatures) {
      signedTurn += c.angularVelocity;
      absoluteTurn += Math.abs(c.angularVelocity);
      if (c.angularVelocity > 0.03) positiveTurn++;
      else if (c.angularVelocity < -0.03) negativeTurn++;
      turnSamples++;
    }
  }
}

const living = world.createCheckpoint().creatures;
const all = [...retired, ...living];
const histories: LifeHistory[] = all.map((c) => c.history!).filter(Boolean);

let classificationError = 0;
let totalPlant = 0;
let totalMeat = 0;
let ownKillMeat = 0;
let stolenKillMeat = 0;
let carrionMeat = 0;
let kills = 0;
let biteKills = 0;
let stingerKills = 0;
let spikeKills = 0;
let damage = 0;
let travel = 0;
for (const h of histories) {
  classificationError = Math.max(classificationError, Math.abs(h.meatIntake - h.ownKillMeat - h.stolenKillMeat - h.carrionMeat));
  totalPlant += h.plantIntake;
  totalMeat += h.meatIntake;
  ownKillMeat += h.ownKillMeat;
  stolenKillMeat += h.stolenKillMeat;
  carrionMeat += h.carrionMeat;
  kills += h.kills;
  biteKills += h.biteKills;
  stingerKills += h.stingerKills;
  spikeKills += h.spikeKills;
  damage += h.damageDealt;
  travel += h.distanceTravelled;
}
const killedDeaths = retired.filter((c) => c.history?.deathCause === 'bite' || c.history?.deathCause === 'stinger' || c.history?.deathCause === 'spike').length;
const rotationBias = absoluteTurn > 0 ? Math.abs(signedTurn) / absoluteTurn : 0;
const positiveShare = positiveTurn + negativeTurn > 0 ? positiveTurn / (positiveTurn + negativeTurn) : 0.5;

if (!Number.isFinite(rotationBias) || classificationError > 1e-6) throw new Error(`Invalid v0.3 accounting: rotationBias=${rotationBias}, classificationError=${classificationError}`);
if (kills !== killedDeaths) throw new Error(`Kill attribution mismatch: histories=${kills}, killed deaths=${killedDeaths}`);
if (kills !== biteKills + stingerKills + spikeKills) throw new Error('Kill method totals do not match total kills');

console.log(JSON.stringify({
  steps: 12_000,
  simSeconds: world.simTime,
  living: living.length,
  retired: retired.length,
  turnSamples,
  rotationBias: Number(rotationBias.toFixed(4)),
  positiveTurnShare: Number(positiveShare.toFixed(4)),
  totalTravel: Number(travel.toFixed(1)),
  plantIntake: Number(totalPlant.toFixed(1)),
  meatIntake: Number(totalMeat.toFixed(1)),
  meatSources: {
    ownKills: Number(ownKillMeat.toFixed(1)),
    stolenKills: Number(stolenKillMeat.toFixed(1)),
    naturalCarrion: Number(carrionMeat.toFixed(1)),
  },
  kills,
  killMethods: { bite: biteKills, stinger: stingerKills, spike: spikeKills },
  killedDeaths,
  damageDealt: Number(damage.toFixed(1)),
  classificationError,
}, null, 2));
