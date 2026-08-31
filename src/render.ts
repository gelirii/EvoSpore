import type { CreatureRenderState, WorldSnapshot } from './sim/types';

interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export class PondRenderer {
  private ctx: CanvasRenderingContext2D;
  private snapshot: WorldSnapshot | null = null;
  private camera: Camera = { x: 800, y: 500, zoom: 0.7 };
  private pointers = new Map<number, { x: number; y: number }>();
  private previousPinchDistance = 0;
  private lastDraw = 0;
  private frameHandle = 0;
  private resizeObserver: ResizeObserver;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement, private onSelect: (id: number | null) => void) {
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('Canvas 2D context unavailable');
    this.ctx = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.pointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.pointerUp(e));
    canvas.addEventListener('pointercancel', (e) => this.pointerUp(e));
    canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.frameHandle = requestAnimationFrame((t) => this.drawLoop(t));
  }

  setSnapshot(snapshot: WorldSnapshot): void { this.snapshot = snapshot; }

  destroy(): void {
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const speed = this.snapshot?.stats.speedMode;
    const cap = speed === 'deep' || speed === 'evolve' ? 1.25 : 1.75;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    const width = Math.max(1, Math.round(rect.width * this.dpr));
    const height = Math.max(1, Math.round(rect.height * this.dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private worldToScreen(x: number, y: number): [number, number] {
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    return [(x - this.camera.x) * this.camera.zoom + w / 2, (y - this.camera.y) * this.camera.zoom + h / 2];
  }

  private screenToWorld(x: number, y: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [
      (x - rect.left - rect.width / 2) / this.camera.zoom + this.camera.x,
      (y - rect.top - rect.height / 2) / this.camera.zoom + this.camera.y,
    ];
  }

  private drawLoop(now: number): void {
    const mode = this.snapshot?.stats.speedMode;
    const fps = mode === 'deep' ? 6 : mode === 'evolve' ? 15 : 60;
    if (now - this.lastDraw >= 1000 / fps) {
      this.draw();
      this.lastDraw = now;
    }
    this.frameHandle = requestAnimationFrame((t) => this.drawLoop(t));
  }

  private draw(): void {
    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.fillStyle = '#071820';
    this.ctx.fillRect(0, 0, width, height);

    const grid = 100 * this.camera.zoom;
    if (grid > 20) {
      const origin = this.worldToScreen(0, 0);
      this.ctx.strokeStyle = 'rgba(116, 196, 214, 0.055)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let x = origin[0] % grid; x < width; x += grid) { this.ctx.moveTo(x, 0); this.ctx.lineTo(x, height); }
      for (let y = origin[1] % grid; y < height; y += grid) { this.ctx.moveTo(0, y); this.ctx.lineTo(width, y); }
      this.ctx.stroke();
    }

    if (!this.snapshot) {
      this.ctx.fillStyle = '#b8d4d9';
      this.ctx.font = '16px system-ui';
      this.ctx.fillText('Waking the pond…', 20, 32);
      return;
    }

    const stride = this.snapshot.stats.speedMode === 'deep' ? 3 : 1;
    this.ctx.fillStyle = 'rgba(113, 206, 102, .68)';
    for (let i = 0; i < this.snapshot.food.length; i += stride) {
      const f = this.snapshot.food[i]!;
      const [x, y] = this.worldToScreen(f.x, f.y);
      if (x < -8 || y < -8 || x > width + 8 || y > height + 8) continue;
      const r = Math.max(1, f.size * this.camera.zoom);
      this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill();
    }

    this.ctx.fillStyle = 'rgba(166, 112, 72, .7)';
    for (const c of this.snapshot.carcasses) {
      const [x, y] = this.worldToScreen(c.x, c.y);
      const r = Math.max(2, c.size * this.camera.zoom);
      this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill();
    }

    const simplified = this.camera.zoom < 0.48 || this.snapshot.stats.speedMode === 'deep';
    for (const creature of this.snapshot.creatures) this.drawCreature(creature, simplified, width, height, creature.id === this.snapshot.selected?.id);

    const [x0, y0] = this.worldToScreen(0, 0);
    const [x1, y1] = this.worldToScreen(1600, 1000);
    this.ctx.strokeStyle = 'rgba(160, 220, 230, .26)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }

  private drawCreature(c: CreatureRenderState, simplified: boolean, width: number, height: number, selected: boolean): void {
    const [sx, sy] = this.worldToScreen(c.x, c.y);
    const rr = c.radius * this.camera.zoom;
    if (sx < -rr - 25 || sy < -rr - 25 || sx > width + rr + 25 || sy > height + rr + 25) return;
    const hue = 155 - c.diet * 140;
    const bodyColor = `hsl(${hue} 57% ${selected ? 67 : 56}%)`;

    this.ctx.save(); this.ctx.translate(sx, sy); this.ctx.rotate(c.angle);
    if (simplified) {
      this.ctx.fillStyle = bodyColor;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, Math.max(2, rr * 1.1), Math.max(1.5, rr * 0.65), 0, 0, Math.PI * 2);
      this.ctx.fill();
    } else {
      const segmentGap = 9 * this.camera.zoom * (c.radius / (7 + c.vertebrae * 2.4));
      const segmentRadius = Math.max(2.4, 5.2 * this.camera.zoom);
      const segmentPositions: Array<[number, number]> = [];
      this.ctx.strokeStyle = 'rgba(235,255,255,.35)';
      this.ctx.lineWidth = Math.max(1, this.camera.zoom * 1.4);
      this.ctx.beginPath();
      for (let s = 0; s < c.vertebrae; s++) {
        const x = ((c.vertebrae - 1) / 2 - s) * segmentGap;
        segmentPositions.push([x, 0]);
        if (s === 0) this.ctx.moveTo(x, 0); else this.ctx.lineTo(x, 0);
      }
      this.ctx.stroke();
      for (const [x, y] of segmentPositions) {
        this.ctx.fillStyle = bodyColor;
        this.ctx.beginPath(); this.ctx.arc(x, y, segmentRadius, 0, Math.PI * 2); this.ctx.fill();
      }

      for (const part of c.parts) {
        const p = segmentPositions[Math.min(part.segment, segmentPositions.length - 1)] ?? [0, 0];
        const sideY = part.side * (segmentRadius + 3 * this.camera.zoom);
        this.ctx.save(); this.ctx.translate(p[0], p[1] + sideY);
        if (part.type === 'eye') {
          this.ctx.fillStyle = '#e9fbff'; this.ctx.beginPath(); this.ctx.arc(0, 0, Math.max(1.8, 2.8 * part.size * this.camera.zoom), 0, Math.PI * 2); this.ctx.fill();
          this.ctx.fillStyle = '#11222a'; this.ctx.beginPath(); this.ctx.arc(.8 * this.camera.zoom, 0, Math.max(.8, 1.1 * this.camera.zoom), 0, Math.PI * 2); this.ctx.fill();
        } else if (part.type === 'fin') {
          this.ctx.fillStyle = 'rgba(101,191,219,.9)'; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(-6*part.size*this.camera.zoom,part.side*8*part.size*this.camera.zoom); this.ctx.lineTo(6*part.size*this.camera.zoom,part.side*5*part.size*this.camera.zoom); this.ctx.closePath(); this.ctx.fill();
        } else if (part.type === 'spike') {
          this.ctx.fillStyle = '#d6e4e6'; this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(-2*this.camera.zoom,part.side*14*part.size*this.camera.zoom); this.ctx.lineTo(3*this.camera.zoom,0); this.ctx.closePath(); this.ctx.fill();
        } else if (part.type === 'stinger') {
          this.ctx.strokeStyle = '#ed71a3'; this.ctx.lineWidth = Math.max(1,2*this.camera.zoom); this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.lineTo(0,part.side*15*part.size*this.camera.zoom); this.ctx.stroke();
        } else if (part.type === 'chemo') {
          this.ctx.strokeStyle = '#e3d176'; this.ctx.lineWidth = Math.max(1,1.2*this.camera.zoom); this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.quadraticCurveTo(4*this.camera.zoom,part.side*5*this.camera.zoom,1*this.camera.zoom,part.side*10*part.size*this.camera.zoom); this.ctx.stroke();
        } else if (part.type === 'mouth') {
          this.ctx.fillStyle = '#f3d6c8'; this.ctx.beginPath(); this.ctx.moveTo(7*this.camera.zoom,0); this.ctx.lineTo(-1*this.camera.zoom,-4*part.size*this.camera.zoom); this.ctx.lineTo(-1*this.camera.zoom,4*part.size*this.camera.zoom); this.ctx.closePath(); this.ctx.fill();
        } else if (part.type === 'tail' || part.type === 'flagellum') {
          this.ctx.strokeStyle = part.type === 'tail' ? '#7cbfd4' : '#a2d7d7'; this.ctx.lineWidth = Math.max(1,2.2*part.size*this.camera.zoom); this.ctx.beginPath(); this.ctx.moveTo(0,0); this.ctx.bezierCurveTo(-8*this.camera.zoom,4*this.camera.zoom,-14*this.camera.zoom,-5*this.camera.zoom,-22*part.size*this.camera.zoom,0); this.ctx.stroke();
        }
        this.ctx.restore();
      }
    }

    if (selected) {
      this.ctx.strokeStyle = 'rgba(125,220,255,.95)'; this.ctx.lineWidth = 2; this.ctx.beginPath(); this.ctx.arc(0,0,Math.max(11,rr+8),0,Math.PI*2); this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private pointerDown(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.previousPinchDistance = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
    }
  }

  private pointerMove(e: PointerEvent): void {
    const previous = this.pointers.get(e.pointerId);
    if (!previous) return;
    const old = new Map(this.pointers);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.camera.x -= (e.clientX - previous.x) / this.camera.zoom;
      this.camera.y -= (e.clientY - previous.y) / this.camera.zoom;
    } else if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      if (this.previousPinchDistance > 0) this.camera.zoom = Math.max(.2, Math.min(3.2, this.camera.zoom * (dist / this.previousPinchDistance)));
      this.previousPinchDistance = dist;
      const oldPts = [...old.values()];
      if (oldPts.length === 2) {
        const oldCx = (oldPts[0]!.x + oldPts[1]!.x) / 2; const oldCy = (oldPts[0]!.y + oldPts[1]!.y) / 2;
        const newCx = (pts[0]!.x + pts[1]!.x) / 2; const newCy = (pts[0]!.y + pts[1]!.y) / 2;
        this.camera.x -= (newCx - oldCx) / this.camera.zoom; this.camera.y -= (newCy - oldCy) / this.camera.zoom;
      }
    }
  }

  private pointerUp(e: PointerEvent): void {
    const start = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.previousPinchDistance = 0;
    if (!start || !this.snapshot) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const [wx, wy] = this.screenToWorld(e.clientX, e.clientY);
    let best: CreatureRenderState | null = null;
    let bestD2 = Infinity;
    for (const creature of this.snapshot.creatures) {
      const d2 = (creature.x - wx) ** 2 + (creature.y - wy) ** 2;
      const hit = Math.max(creature.radius + 8 / this.camera.zoom, 16 / this.camera.zoom);
      if (d2 <= hit * hit && d2 < bestD2) { best = creature; bestD2 = d2; }
    }
    this.onSelect(best?.id ?? null);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const before = this.screenToWorld(e.clientX, e.clientY);
    this.camera.zoom = Math.max(.2, Math.min(3.2, this.camera.zoom * Math.exp(-e.deltaY * .0012)));
    const after = this.screenToWorld(e.clientX, e.clientY);
    this.camera.x += before[0] - after[0]; this.camera.y += before[1] - after[1];
  }
}
