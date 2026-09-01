# EvoSpore

EvoSpore is a browser-based artificial-life experiment inspired by the readability of *Spore*'s Cell Stage, but built around inheritance, ecological selection, body/brain co-evolution, lifetime learning, and Lamarckian controller inheritance.

**v0.3** keeps the mobile-first core loop while adding a fossil record, behavioural life histories, attributable predation/scavenging and less biased steering.

## Current capabilities

- One persistent 2D pond with renewable food, attributable carcasses, competition, predation, scavenging and death.
- Per-creature life histories track travel, feeding sources, damage, confirmed kills and whether meat came from own kills, stolen kills or natural carrion.
- Propulsion has a steering dead-zone, stronger angular damping and sensorimotor reflex links so persistent arbitrary spiralling is less attractive while targeting remains evolved/learned rather than scripted.
- Steady-state asexual reproduction: **no global fitness score and no generational replacement**.
- Founder body: two vertebrae, a mouth and flagellum.
- Bodies can evolve from 2–8 vertebrae and mutate fins, tails, flagella, eyes, chemoreceptors and spikes.
- Rare feeding-linked innovation can unlock stinger potential for one lineage; descendants must still express the part by structural mutation.
- Continuous grazer↔carnivore diet evolution.
- Morphology represented as a graph: central ganglion + spine + attached organ nodes.
- Recurrent graph neural controller with shared message-passing weights, so inherited control survives body topology changes.
- Reward-modulated Hebbian eligibility traces for lifetime learning.
- Synaptic plasticity, learning rate, decay and Lamarckian assimilation rate are themselves evolvable.
- Acquired fast synaptic weights can be partially written into offspring slow weights.
- Simulation runs in a dedicated Web Worker; rendering stays responsive on the main thread.
- Pause / 1× / 10× / 100× / Deep Time.
- Thermal guard duty-cycles Deep Time instead of permanently pinning a CPU core.
- IndexedDB autosaves living bodies, inherited + learned brains, RNG state and world history.
- Canvas rendering has mobile-aware level of detail and reduced pixel density at high simulation speed.
- Deterministic headless burn-in runs in CI before every Pages deployment.

## Development

```bash
npm install
npm run build
npm run dev
```

`npm run build` performs strict TypeScript checking, the deterministic evolutionary burn-in, and the production Vite build.

## GitHub Pages

The included workflow deploys pushes to `main`.

If Pages has never been enabled for this repository, open **Settings → Pages** and choose **GitHub Actions** as the source once.

## Controls

- **Pause** — stop simulated time.
- **1×** — aquarium mode.
- **10×** — accelerated observation.
- **100×** — evolution mode with reduced rendering work.
- **Deep** — run the worker as fast as its duty-cycle permits.
- **Thermal guard** — conservative CPU duty cycle; leave this on for iPhone.
- **Save** — immediate IndexedDB checkpoint; autosave also runs every minute and when the page is hidden.
- Drag to pan, pinch/wheel to zoom, tap a creature to inspect it.

See [DESIGN.md](./DESIGN.md) for the architecture and research rationale.
