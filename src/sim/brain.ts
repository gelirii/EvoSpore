import type { BrainCheckpoint, Genome, PartType, SensePacket } from './types';
import { BRAIN_HIDDEN as H } from './genome';

const MAT = H * H;
const MAX_FAST = 0.75;

const TYPE_INDEX: Record<'ganglion' | 'spine' | PartType, number> = {
  ganglion: 0,
  spine: 1,
  mouth: 2,
  flagellum: 3,
  tail: 4,
  fin: 5,
  eye: 6,
  chemo: 7,
  spike: 8,
  stinger: 9,
};

interface GraphNode {
  typeIndex: number;
  segment: number;
  partIndex: number;
  neighbors: number[];
}

interface GraphDefinition {
  nodes: GraphNode[];
  partNodeByIndex: number[];
}

export interface BrainActions {
  a: number[];
  b: number[];
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function buildGraph(genome: Genome): GraphDefinition {
  const nodes: GraphNode[] = [];
  nodes.push({ typeIndex: TYPE_INDEX.ganglion, segment: -1, partIndex: -1, neighbors: [] });
  for (let s = 0; s < genome.vertebrae; s++) {
    nodes.push({ typeIndex: TYPE_INDEX.spine, segment: s, partIndex: -1, neighbors: [] });
  }

  const partNodeByIndex: number[] = [];
  genome.parts.forEach((part, partIndex) => {
    const idx = nodes.length;
    nodes.push({
      typeIndex: TYPE_INDEX[part.type],
      segment: part.segment,
      partIndex,
      neighbors: [],
    });
    partNodeByIndex[partIndex] = idx;
  });

  const link = (a: number, b: number): void => {
    if (a === b) return;
    if (!nodes[a]!.neighbors.includes(b)) nodes[a]!.neighbors.push(b);
    if (!nodes[b]!.neighbors.includes(a)) nodes[b]!.neighbors.push(a);
  };

  for (let s = 0; s < genome.vertebrae - 1; s++) link(1 + s, 1 + s + 1);
  genome.parts.forEach((part, i) => link(partNodeByIndex[i]!, 1 + part.segment));
  for (let i = 1; i < nodes.length; i++) link(0, i);

  return { nodes, partNodeByIndex };
}

function readout(weights: number[], typeIndex: number, hidden: Float32Array, offset: number): number {
  let z = 0;
  const base = typeIndex * H;
  for (let j = 0; j < H; j++) z += (weights[base + j] ?? 0) * hidden[offset + j]!;
  return Math.tanh(z);
}

export class BrainRuntime {
  readonly graph: GraphDefinition;
  hidden: Float32Array;
  fastSelf: Float32Array;
  fastMsg: Float32Array;
  eligibilitySelf: Float32Array;
  eligibilityMsg: Float32Array;
  pendingReward = 0;
  learnedMagnitude = 0;

  constructor(private genome: Genome, checkpoint?: BrainCheckpoint) {
    this.graph = buildGraph(genome);
    const hiddenLength = this.graph.nodes.length * H;
    this.hidden = new Float32Array(hiddenLength);
    this.fastSelf = new Float32Array(MAT);
    this.fastMsg = new Float32Array(MAT);
    this.eligibilitySelf = new Float32Array(MAT);
    this.eligibilityMsg = new Float32Array(MAT);
    if (checkpoint) {
      this.hidden.set(checkpoint.hidden.slice(0, hiddenLength));
      this.fastSelf.set(checkpoint.fastSelf.slice(0, MAT));
      this.fastMsg.set(checkpoint.fastMsg.slice(0, MAT));
      this.eligibilitySelf.set(checkpoint.eligibilitySelf.slice(0, MAT));
      this.eligibilityMsg.set(checkpoint.eligibilityMsg.slice(0, MAT));
      this.pendingReward = checkpoint.pendingReward;
      this.learnedMagnitude = checkpoint.learnedMagnitude;
    }
  }

  reward(value: number): void {
    this.pendingReward = clamp(this.pendingReward + value, -3, 3);
  }

  private applyLearning(): void {
    const brain = this.genome.brain;
    const reward = clamp(this.pendingReward, -2, 2);
    let magnitude = 0;

    for (let i = 0; i < MAT; i++) {
      this.fastSelf[i] = this.fastSelf[i]! * brain.fastDecay;
      this.fastMsg[i] = this.fastMsg[i]! * brain.fastDecay;
      if (Math.abs(reward) > 1e-6 && brain.learningRate > 0) {
        this.fastSelf[i] = clamp(
          this.fastSelf[i]! + brain.learningRate * (brain.plasticSelf[i] ?? 0) * this.eligibilitySelf[i]! * reward,
          -MAX_FAST,
          MAX_FAST,
        );
        this.fastMsg[i] = clamp(
          this.fastMsg[i]! + brain.learningRate * (brain.plasticMsg[i] ?? 0) * this.eligibilityMsg[i]! * reward,
          -MAX_FAST,
          MAX_FAST,
        );
      }
      magnitude += Math.abs(this.fastSelf[i]!) + Math.abs(this.fastMsg[i]!);
    }
    this.learnedMagnitude = magnitude / (MAT * 2);
    this.pendingReward = 0;
  }

  private observationForNode(nodeIndex: number, sense: SensePacket): Float32Array {
    const node = this.graph.nodes[nodeIndex]!;
    const obs = new Float32Array(H);
    if (node.typeIndex === TYPE_INDEX.ganglion) {
      obs[0] = clamp(sense.energy * 2 - 1, -1, 1);
      obs[1] = clamp(sense.health * 2 - 1, -1, 1);
      obs[2] = clamp(sense.speedForward, -1, 1);
      obs[3] = clamp(sense.speedSide, -1, 1);
      obs[4] = clamp(sense.angularVelocity, -1, 1);
      obs[5] = clamp(1 - sense.boundaryDistance, 0, 1);
      obs[6] = Math.sin(sense.boundaryBearing);
      obs[7] = Math.cos(sense.boundaryBearing);
    } else if (node.typeIndex === TYPE_INDEX.eye) {
      const foodScore = 1 - sense.nearestFoodDistance;
      const creatureScore = 1 - sense.nearestCreatureDistance;
      const carcassScore = 1 - sense.nearestCarcassDistance;
      let score = foodScore;
      let bearing = sense.nearestFoodBearing;
      let kind = -0.7;
      let size = 0.15;
      if (creatureScore > score) {
        score = creatureScore;
        bearing = sense.nearestCreatureBearing;
        kind = 0.7;
        size = sense.nearestCreatureSize;
      }
      if (carcassScore > score) {
        score = carcassScore;
        bearing = sense.nearestCarcassBearing;
        kind = 0;
        size = 0.3;
      }
      obs[0] = clamp(score, 0, 1);
      obs[1] = Math.sin(bearing);
      obs[2] = Math.cos(bearing);
      obs[3] = kind;
      obs[4] = clamp(size, 0, 1);
    } else if (node.typeIndex === TYPE_INDEX.chemo) {
      obs[0] = clamp(sense.chemoFoodX, -1, 1);
      obs[1] = clamp(sense.chemoFoodY, -1, 1);
      obs[2] = clamp(sense.chemoCreatureX, -1, 1);
      obs[3] = clamp(sense.chemoCreatureY, -1, 1);
    } else if (node.typeIndex === TYPE_INDEX.mouth) {
      obs[0] = clamp(1 - sense.nearestFoodDistance * 3, 0, 1);
      obs[1] = clamp(1 - sense.nearestCarcassDistance * 3, 0, 1);
      obs[2] = clamp(1 - sense.nearestCreatureDistance * 4, 0, 1);
      obs[3] = sense.nearestCreatureSize;
    } else if (node.typeIndex === TYPE_INDEX.stinger) {
      obs[0] = sense.stingerCharge;
      obs[1] = clamp(1 - sense.nearestCreatureDistance * 4, 0, 1);
      obs[2] = Math.sin(sense.nearestCreatureBearing);
      obs[3] = Math.cos(sense.nearestCreatureBearing);
    } else if (node.typeIndex === TYPE_INDEX.spine) {
      obs[0] = clamp(sense.speedForward, -1, 1);
      obs[1] = clamp(sense.speedSide, -1, 1);
      obs[2] = clamp(sense.angularVelocity, -1, 1);
      obs[3] = node.segment / Math.max(1, this.genome.vertebrae - 1) * 2 - 1;
    }
    return obs;
  }

  think(sense: SensePacket): BrainActions {
    this.applyLearning();
    const brain = this.genome.brain;
    const old = new Float32Array(this.hidden);
    let state = new Float32Array(this.hidden);
    const obs = this.graph.nodes.map((_, i) => this.observationForNode(i, sense));

    for (let round = 0; round < 2; round++) {
      const next = new Float32Array(state.length);
      for (let n = 0; n < this.graph.nodes.length; n++) {
        const node = this.graph.nodes[n]!;
        const offset = n * H;
        const msg = new Float32Array(H);
        if (node.neighbors.length > 0) {
          for (const neighbor of node.neighbors) {
            const no = neighbor * H;
            for (let j = 0; j < H; j++) msg[j] = msg[j]! + state[no + j]!;
          }
          const inv = 1 / node.neighbors.length;
          for (let j = 0; j < H; j++) msg[j] = msg[j]! * inv;
        }

        for (let k = 0; k < H; k++) {
          let z =
            (brain.bias[k] ?? 0) +
            (brain.typeEmbedding[node.typeIndex * H + k] ?? 0) +
            obs[n]![k]! * 0.75;
          const row = k * H;
          for (let j = 0; j < H; j++) {
            z += ((brain.selfWeights[row + j] ?? 0) + this.fastSelf[row + j]!) * state[offset + j]!;
            z += ((brain.msgWeights[row + j] ?? 0) + this.fastMsg[row + j]!) * msg[j]!;
          }
          next[offset + k] = Math.tanh(z);
        }
      }
      state = next;
    }

    this.hidden = state;
    const decay = brain.eligibilityDecay;
    const invNodes = 1 / Math.max(1, this.graph.nodes.length);
    const selfCorr = new Float32Array(MAT);
    const msgCorr = new Float32Array(MAT);

    for (let n = 0; n < this.graph.nodes.length; n++) {
      const node = this.graph.nodes[n]!;
      const off = n * H;
      const msgPre = new Float32Array(H);
      if (node.neighbors.length > 0) {
        for (const neighbor of node.neighbors) {
          const no = neighbor * H;
          for (let j = 0; j < H; j++) msgPre[j] = msgPre[j]! + old[no + j]!;
        }
        const inv = 1 / node.neighbors.length;
        for (let j = 0; j < H; j++) msgPre[j] = msgPre[j]! * inv;
      }

      for (let k = 0; k < H; k++) {
        const post = state[off + k]!;
        const row = k * H;
        for (let j = 0; j < H; j++) {
          selfCorr[row + j] = selfCorr[row + j]! + old[off + j]! * post * invNodes;
          msgCorr[row + j] = msgCorr[row + j]! + msgPre[j]! * post * invNodes;
        }
      }
    }

    for (let i = 0; i < MAT; i++) {
      this.eligibilitySelf[i] = decay * this.eligibilitySelf[i]! + selfCorr[i]!;
      this.eligibilityMsg[i] = decay * this.eligibilityMsg[i]! + msgCorr[i]!;
    }

    const a = new Array(this.genome.parts.length).fill(0);
    const b = new Array(this.genome.parts.length).fill(0);
    for (let partIndex = 0; partIndex < this.genome.parts.length; partIndex++) {
      const nodeIndex = this.graph.partNodeByIndex[partIndex]!;
      const node = this.graph.nodes[nodeIndex]!;
      const offset = nodeIndex * H;
      const ra = readout(brain.readoutA, node.typeIndex, state, offset);
      const rb = readout(brain.readoutB, node.typeIndex, state, offset);
      a[partIndex] = 0.5 + 0.5 * ra;
      b[partIndex] = rb;
    }

    return { a, b };
  }

  checkpoint(): BrainCheckpoint {
    return {
      hidden: Array.from(this.hidden),
      fastSelf: Array.from(this.fastSelf),
      fastMsg: Array.from(this.fastMsg),
      eligibilitySelf: Array.from(this.eligibilitySelf),
      eligibilityMsg: Array.from(this.eligibilityMsg),
      pendingReward: this.pendingReward,
      learnedMagnitude: this.learnedMagnitude,
    };
  }
}
