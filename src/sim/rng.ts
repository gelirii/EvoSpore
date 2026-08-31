export interface RngState {
  state: number;
  spareGaussian: number | null;
}

export class Rng {
  private state: number;
  private spareGaussian: number | null;

  constructor(seed = 0x5eedd00d, restored?: RngState) {
    this.state = (restored?.state ?? seed) >>> 0;
    if (this.state === 0) this.state = 0x6d2b79f5;
    this.spareGaussian = restored?.spareGaussian ?? null;
  }

  nextUint(): number {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  next(): number {
    return this.nextUint() / 0x100000000;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxExclusive: number): number {
    if (maxExclusive <= min) return min;
    return min + Math.floor(this.next() * (maxExclusive - min));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  gaussian(mean = 0, std = 1): number {
    if (this.spareGaussian !== null) {
      const spare = this.spareGaussian;
      this.spareGaussian = null;
      return mean + spare * std;
    }
    let u = 0;
    let v = 0;
    while (u <= Number.EPSILON) u = this.next();
    while (v <= Number.EPSILON) v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    const z0 = mag * Math.cos(2 * Math.PI * v);
    const z1 = mag * Math.sin(2 * Math.PI * v);
    this.spareGaussian = z1;
    return mean + z0 * std;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Cannot pick from empty array');
    return items[this.int(0, items.length)]!;
  }

  snapshot(): RngState {
    return { state: this.state >>> 0, spareGaussian: this.spareGaussian };
  }
}
