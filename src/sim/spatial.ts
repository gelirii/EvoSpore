export class SpatialHash<T extends { x: number; y: number }> {
  private readonly cells = new Map<number, T[]>();
  private readonly cols: number;

  constructor(
    private readonly cellSize: number,
    private readonly width: number,
  ) {
    this.cols = Math.ceil(width / cellSize) + 2;
  }

  clear(): void {
    this.cells.clear();
  }

  private key(x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    return gx + gy * this.cols;
  }

  insert(item: T): void {
    const key = this.key(item.x, item.y);
    const bucket = this.cells.get(key);
    if (bucket) bucket.push(item);
    else this.cells.set(key, [item]);
  }

  rebuild(items: readonly T[]): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  nearby(x: number, y: number, radius: number): T[] {
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    const out: T[] = [];
    const r2 = radius * radius;

    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const bucket = this.cells.get(gx + gy * this.cols);
        if (!bucket) continue;
        for (const item of bucket) {
          const dx = item.x - x;
          const dy = item.y - y;
          if (dx * dx + dy * dy <= r2) out.push(item);
        }
      }
    }
    return out;
  }
}
