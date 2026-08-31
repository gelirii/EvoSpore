# EvoSpore

EvoSpore is a browser-based artificial-life experiment inspired by the readability of *Spore*'s cell stage, but built around genuine inheritance, ecological selection, body/brain co-evolution, lifetime learning, and Lamarckian controller inheritance.

**v0.1** is intentionally small enough to run on an iPhone while already containing the complete evolutionary loop.

## What v0.1 already does

- One shared 2D pond with limited renewable food, carcasses, competition, predation and death.
- Asexual steady-state reproduction: there is **no global fitness score** and no generational replacement.
- Creatures begin as two-vertebra founders with a mouth and flagellum.
- Bodies can evolve from 2–8 vertebrae and mutate fins, tails, flagella, eyes, chemoreceptors and spikes.
- A rare feeding-linked innovation can unlock latent stinger potential in one lineage; the part still has to arise by later structural mutation.
- Diet evolves continuously from grazer toward carnivore; mouths become more damaging as carnivory rises.
- Every body is represented as a morphology graph with a virtual central ganglion, spine nodes and part nodes.
- A tiny recurrent graph neural controller uses shared message-passing weights, so the same inherited controller can survive changes in body topology.
- Reward-modulated Hebbian eligibility traces provide online lifetime learning.
- Synaptic plasticity strength, learning rate, decay and Lamarckian inheritance fraction themselves evolve.
- A fraction of acquired fast synaptic weights is written back into the controller inherited by offspring.
- Simulation runs in a dedicated Web Worker; rendering stays responsive on the main thread.
- Observe / 10× / 100× / Deep modes are separate from rendering speed.
- Thermal guard duty-cycles Deep mode instead of permanently pinning a CPU core.
- IndexedDB autosaves the full living world, learned brain state, genomes, RNG state and history.
- Canvas rendering uses mobile-aware level-of-detail and caps device pixel ratio at high simulation speeds.

## Run locally

```bash
npm install
npm run dev
```

Production check:

```bash
npm run build
```

## GitHub Pages

The included `.github/workflows/pages.yml` builds and deploys on pushes to `main`.

If Pages is not already configured for the repository, open **Settings → Pages** and set **Source** to **GitHub Actions** once.

## Controls

- **Pause** — stop simulation time.
- **1×** — normal aquarium mode.
- **10×** — accelerated observation.
- **100×** — evolution mode; rendering is deliberately reduced.
- **Deep** — run the worker as fast as its duty-cycle budget allows.
- **Thermal guard** — on by default; especially recommended on iPhone.
- **Save** — immediate full checkpoint; an autosave is also requested every minute and when the page becomes hidden.
- Drag to pan, pinch or mouse-wheel to zoom, tap a creature to inspect it.

## Architecture

See [DESIGN.md](./DESIGN.md) for the research rationale, exact controller layout, mutation model, thermal strategy, and the boundaries of v0.1.
