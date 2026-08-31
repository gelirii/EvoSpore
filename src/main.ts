import './styles.css';
import { PondRenderer } from './render';
import type { MainToWorker, SpeedMode, WorkerToMain } from './protocol';
import type { CreatureRenderState, FossilCategory, FossilRecordSummary, WorldSnapshot } from './sim/types';
import { clearCheckpoint, loadCheckpoint, requestPersistentStorage, saveCheckpoint } from './storage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app');

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <div class="brand"><strong>EvoSpore</strong><span>v0.2</span></div>
      <div class="speed-group" role="group" aria-label="Simulation speed">
        <button data-speed="paused" type="button">Pause</button>
        <button data-speed="observe" type="button" class="active">1×</button>
        <button data-speed="fast" type="button">10×</button>
        <button data-speed="evolve" type="button">100×</button>
        <button data-speed="deep" type="button">Deep</button>
      </div>
      <span class="toolbar-spacer"></span>
      <label class="toggle"><input id="thermal" type="checkbox" checked /> Thermal guard</label>
    </header>
    <main class="main">
      <canvas id="pond" aria-label="EvoSpore evolutionary pond"></canvas>
      <div class="stats" id="stats">Waking the pond…</div>
      <aside class="inspector hidden" id="inspector"></aside>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <div class="fossil-overlay hidden" id="fossil-overlay" role="dialog" aria-modal="true" aria-labelledby="fossil-title">
        <section class="fossil-panel">
          <div class="fossil-head">
            <div><h2 id="fossil-title">Fossil record</h2><p>Champions, freaks and evolutionary bad ideas preserved for irresponsible resurrection.</p></div>
            <button id="fossil-close" type="button" aria-label="Close fossil record">Close</button>
          </div>
          <div class="fossil-grid" id="fossil-grid"></div>
        </section>
      </div>
    </main>
    <footer class="footer">
      <button id="save" type="button">Save</button>
      <button id="fossils" type="button">Fossil record</button>
      <button id="reset" class="danger" type="button">Reset world</button>
      <div class="status" id="status">Starting worker…</div>
    </footer>
  </div>`;

const canvas = document.querySelector<HTMLCanvasElement>('#pond')!;
const statsEl = document.querySelector<HTMLDivElement>('#stats')!;
const inspectorEl = document.querySelector<HTMLElement>('#inspector')!;
const toastEl = document.querySelector<HTMLDivElement>('#toast')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const thermalEl = document.querySelector<HTMLInputElement>('#thermal')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save')!;
const fossilButton = document.querySelector<HTMLButtonElement>('#fossils')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset')!;
const fossilOverlay = document.querySelector<HTMLDivElement>('#fossil-overlay')!;
const fossilGrid = document.querySelector<HTMLDivElement>('#fossil-grid')!;
const fossilClose = document.querySelector<HTMLButtonElement>('#fossil-close')!;
const speedButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-speed]')];

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
let snapshot: WorldSnapshot | null = null;
let fossils: FossilRecordSummary[] = [];
let selectedId: number | null = null;
let saveInFlight = false;
let toastTimer = 0;

const post = (message: MainToWorker): void => worker.postMessage(message);

function showToast(text: string): void {
  toastEl.textContent = text; toastEl.classList.add('show'); window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function setSpeed(mode: SpeedMode): void {
  speedButtons.forEach((button) => button.classList.toggle('active', button.dataset.speed === mode));
  post({ type: 'setSpeed', mode });
}

function formatNumber(n: number): string { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n); }
function formatSimTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)} s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

function updateStats(s: WorldSnapshot): void {
  const st = s.stats;
  statsEl.innerHTML = `
    <span>Population</span><b>${formatNumber(st.population)}</b>
    <span>Generation</span><b>${formatNumber(st.maxGeneration)}</b>
    <span>Morphotypes</span><b>${formatNumber(st.morphotypes)}</b>
    <span>Food</span><b>${formatNumber(st.food)}</b>
    <span>Births / deaths</span><b>${formatNumber(st.births)} / ${formatNumber(st.deaths)}</b>
    <span>Innovations</span><b>${formatNumber(st.innovations)}</b>
    <span>Sim time</span><b>${formatNumber(s.simTime)} s</b>
    <span>Compute rate</span><b>${st.simRate.toFixed(1)}×</b>`;
  statusEl.textContent = `${st.speedMode === 'deep' ? 'Deep Time' : st.speedMode} · ${st.thermalSafe ? 'thermal guard on' : 'thermal guard off'} · ${fossils.length} fossils · autosave every minute`;
}

function partSummary(creature: CreatureRenderState): string {
  const counts = new Map<string, number>();
  for (const p of creature.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.entries()].map(([k, v]) => `${v}× ${k}`).join(' · ');
}

function updateInspector(creature: CreatureRenderState | null): void {
  if (!creature) { inspectorEl.classList.add('hidden'); inspectorEl.innerHTML = ''; return; }
  inspectorEl.classList.remove('hidden');
  inspectorEl.innerHTML = `
    <h2>Creature #${creature.id}</h2>
    <div class="inspector-grid">
      <span>Parent</span><b>${creature.parentId ?? 'founder'}</b>
      <span>Generation</span><b>${creature.generation}</b>
      <span>Age</span><b>${creature.age.toFixed(1)} s</b>
      <span>Health</span><b>${Math.round(creature.health * 100)}%</b>
      <span>Energy</span><b>${creature.energy.toFixed(1)}</b>
      <span>Children</span><b>${creature.children}</b>
      <span>Vertebrae</span><b>${creature.vertebrae}</b>
      <span>Carnivory</span><b>${Math.round(creature.diet * 100)}%</b>
      <span>Plasticity</span><b>${creature.plasticity.toFixed(3)}</b>
      <span>Lamarck rate</span><b>${Math.round(creature.lamarckFraction * 100)}%</b>
      <span>Learned change</span><b>${creature.learnedMagnitude.toFixed(4)}</b>
    </div>
    <div class="parts">${partSummary(creature)}</div>
    ${creature.innovations.length ? `<div class="parts"><b>Innovations:</b> ${creature.innovations.join(', ')}</div>` : ''}`;
}

function fossilValue(fossil: FossilRecordSummary): string {
  if (fossil.key === 'mostCarnivorous' || fossil.key === 'mostHerbivorous' || fossil.key === 'mostLamarckian') return `${Math.round(fossil.displayValue * 100)}%`;
  if (fossil.key === 'largestBody' || fossil.key === 'smallestBody' || fossil.key === 'mostEfficient' || fossil.key === 'mostLearned') return fossil.displayValue.toFixed(3);
  if (fossil.key === 'oldest') return `${fossil.displayValue.toFixed(1)} s`;
  return formatNumber(fossil.displayValue);
}

function fossilParts(fossil: FossilRecordSummary): string {
  return Object.entries(fossil.partCounts).filter(([, count]) => count > 0).map(([part, count]) => `${count}× ${part}`).join(' · ');
}

function renderFossils(): void {
  if (!fossils.length) {
    fossilGrid.innerHTML = '<div class="fossil-empty">No fossils yet. Give evolution a minute to do something regrettable.</div>';
    return;
  }
  fossilGrid.innerHTML = fossils.map((fossil) => `
    <article class="fossil-card">
      <div class="fossil-card-head"><div><span class="fossil-title">${fossil.title}</span><h3>${fossil.name}</h3></div><strong>${fossilValue(fossil)}</strong></div>
      <p>${fossil.description}</p>
      <div class="fossil-meta">Creature #${fossil.id} · generation ${formatNumber(fossil.generation)} · recorded at ${formatSimTime(fossil.recordedAt)}</div>
      <div class="fossil-stats">${fossil.vertebrae} vertebrae · ${fossil.totalParts} parts · ${Math.round(fossil.diet * 100)}% carnivory · ${Math.round(fossil.lamarckFraction * 100)}% Lamarck</div>
      <div class="fossil-parts">${fossilParts(fossil)}</div>
      <button class="spawn-fossil" type="button" data-fossil="${fossil.key}">Spawn ${fossil.name}</button>
    </article>`).join('');
}

const renderer = new PondRenderer(canvas, (id) => {
  selectedId = id; post({ type: 'selectCreature', id });
  if (snapshot) updateInspector(id === null ? null : snapshot.creatures.find((item) => item.id === id) ?? null);
});

worker.onmessage = async (event: MessageEvent<WorkerToMain>) => {
  const message = event.data;
  if (message.type === 'ready') statusEl.textContent = 'Pond online.';
  else if (message.type === 'snapshot') {
    snapshot = message.snapshot; fossils = message.fossils; renderer.setSnapshot(message.snapshot); updateStats(message.snapshot);
    if (!fossilOverlay.classList.contains('hidden')) renderFossils();
    if (selectedId !== null) updateInspector(message.snapshot.creatures.find((c) => c.id === selectedId) ?? null);
  } else if (message.type === 'checkpoint') {
    if (saveInFlight) return; saveInFlight = true;
    try { await saveCheckpoint(message.checkpoint); if (message.reason === 'manual') showToast('World checkpoint and fossil record saved.'); }
    catch (error) { showToast(`Save failed: ${error instanceof Error ? error.message : String(error)}`); }
    finally { saveInFlight = false; }
  } else if (message.type === 'historicalEvent') showToast(message.message);
  else if (message.type === 'fossilSpawned') {
    selectedId = message.creatureId;
    showToast(`${message.name} has been resurrected. This seems responsible.`);
    fossilOverlay.classList.add('hidden');
  } else if (message.type === 'error') { showToast(`Simulation paused: ${message.message}`); setSpeed('paused'); }
};

worker.onerror = (event) => { showToast(`Worker error: ${event.message}`); statusEl.textContent = 'Worker failed.'; };
speedButtons.forEach((button) => button.addEventListener('click', () => setSpeed(button.dataset.speed as SpeedMode)));
thermalEl.addEventListener('change', () => post({ type: 'setThermalSafe', enabled: thermalEl.checked }));
saveButton.addEventListener('click', () => post({ type: 'requestCheckpoint', reason: 'manual' }));
fossilButton.addEventListener('click', () => { renderFossils(); fossilOverlay.classList.remove('hidden'); });
fossilClose.addEventListener('click', () => fossilOverlay.classList.add('hidden'));
fossilOverlay.addEventListener('click', (event) => { if (event.target === fossilOverlay) fossilOverlay.classList.add('hidden'); });
fossilGrid.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-fossil]');
  if (!button) return;
  post({ type: 'spawnFossil', key: button.dataset.fossil as FossilCategory });
});
resetButton.addEventListener('click', async () => {
  if (!confirm('Reset this evolutionary world? The current autosave and fossil record will be deleted.')) return;
  await clearCheckpoint().catch(() => undefined); selectedId = null; fossils = []; updateInspector(null); post({ type: 'resetWorld' }); showToast('New founder world created. The museum has been swept clean.');
});
document.addEventListener('visibilitychange', () => { if (document.hidden) post({ type: 'requestCheckpoint', reason: 'hidden' }); });
window.setInterval(() => { if (!document.hidden) post({ type: 'requestCheckpoint', reason: 'autosave' }); }, 60_000);

async function boot(): Promise<void> {
  void requestPersistentStorage();
  try {
    const checkpoint = await loadCheckpoint();
    if (checkpoint) { post({ type: 'init', checkpoint }); showToast('Resumed saved ecosystem and fossil record.'); }
    else post({ type: 'init' });
  } catch { post({ type: 'init' }); }
  setSpeed('observe'); post({ type: 'setThermalSafe', enabled: true });
}
void boot();
