# EvoSpore v0.1 design

## Design objective

The simulation should be able to surprise us without trying to reproduce biological reality. Complex ecology is represented through a small number of universal currencies: energy, movement, sensing, damage, reproduction and inheritance.

A creature is successful only if its descendants persist. There is no explicit fitness score.

## Body–brain co-evolution

The body genome describes 2–8 vertebrae and attached parts. The controller is a recurrent morphology graph:

- one virtual **central ganglion**;
- one node per vertebra;
- one node per organ;
- local edges along the spine and from organ to attachment segment;
- a cheap central-ganglion shortcut to avoid excessively long communication paths.

Every node carries 8 recurrent hidden channels. Two shared message-passing rounds run per brain update at 5 Hz. The same matrices are reused at every body node, so adding/removing an organ does not require replacing the inherited controller.

This is inspired by morphology-aware controllers such as **NerveNet**, while the overall body/controller co-design philosophy is influenced by **Evolution Gym / EvoGym**.

References:
- NerveNet: https://www.cs.toronto.edu/~tingwuwang/nervenet.html
- EvoGym: https://evolutiongym.github.io/
- Graph-policy long-range coordination discussion: https://arxiv.org/abs/2010.01856

## Sensors are physical channels, not labels

The controller is never handed an input named `predator`.

Eyes receive local object proximity/bearing/rough type signals. Chemoreceptors receive gradients. Internal state exposes energy, health and motion. Mouth/stinger nodes receive contact/range or recharge information.

Evolution has to decide which signals matter.

## Lifetime learning

The controller has inherited slow matrices and individual fast matrices. Shared reward-modulated Hebbian eligibility traces alter fast weights during life.

The reinforcement signal is intentionally generic:
- useful energy gained → positive;
- damage → negative.

Plasticity coefficients are per-synapse genes. Learning rate, eligibility decay and fast-weight decay also mutate.

Reference direction:
- Differentiable plasticity: https://arxiv.org/abs/1804.02464

## Lamarckian controller inheritance

At reproduction:

`child slow weight ≈ parent slow weight + L × parent learned fast weight + mutation`

where the assimilation fraction `L` is itself evolvable from 0–1.

Bodies remain Darwinian: acquired physical changes are not written back. The Lamarckian mechanism applies to learned controller state.

Reference direction:
- Lamarckian evolutionary robotics: https://www.nature.com/articles/s41598-023-48338-4

## Ecology

Energy enters through finite renewable algae. Carcasses retain some organism energy. Grazer/carnivore efficiency is continuous.

The hard population ceiling is only an emergency safety valve; the normal carrying capacity should emerge from the energy budget.

## Rare innovation

Most basic morphology is evolvable immediately. Stinger potential is initially absent.

Every successful meal has a very small innovation probability. Eating a lineage already possessing the innovation may bias that probability upward in later versions. Innovation is lineage-local, not globally unlocked.

## Deep Time and mobile thermals

Simulation and rendering are independent.

- Main thread: UI, Canvas, IndexedDB.
- One Web Worker: physics, sensing, GNN, learning, reproduction and mutation.
- 1×/10×/100× use target simulated-time accumulation.
- Deep Time runs work batches under a real-time budget.
- Thermal guard inserts deliberate yield intervals.
- Snapshot/render frequency drops as simulation speed rises.
- Device pixel ratio is capped because native 3× rendering is wasted work during Deep Time.

The first release intentionally avoids using every CPU core. Long-duration sustainable throughput matters more than an impressive ten-second benchmark.

## Persistence

Checkpoints contain:
- all living organisms and morphology genomes;
- inherited brain genes;
- learned fast weights and eligibility traces;
- recurrent node state;
- energy/health/age/position;
- food and carcasses;
- IDs/ancestry;
- RNG integer state **and cached Gaussian sample**;
- historical innovation events.

The Gaussian cache matters: without it, a restored simulation diverges at the next Box–Muller draw despite having the same integer RNG state.

IndexedDB writes happen on the main thread. The worker sends immutable checkpoint snapshots to the UI.

## v0.1 boundaries

Deliberately postponed:
- sexual reproduction;
- explicit eggs/juvenile development;
- fluid simulation;
- per-vertebra muscle outputs;
- advanced speciation/clade clustering;
- statistical off-screen ecology;
- multiple worker shards;
- server-side/background evolution.

The purpose of v0.1 is to prove that the complete loop — morphology, morphology-aware control, learning, inheritance, ecological reproduction, persistence and Deep Time — works coherently before adding more biology.
