import { morphotypeKey } from '../src/sim/genome';
import { World } from '../src/sim/world';

const world = new World();
for (let i=0;i<100_000;i++) world.step();
const creatures = world.creatures as any[];
const partTypes = ['mouth','flagellum','tail','fin','eye','chemo','spike','stinger'];
const partTotals:any = Object.fromEntries(partTypes.map(t=>[t,0]));
let diet=0, verts=0, parts=0, size=0, eff=0, lamarck=0, learned=0;
let grazers=0, omnivores=0, carnivores=0;
for (const c of creatures) {
  diet+=c.genome.diet; verts+=c.genome.vertebrae; parts+=c.genome.parts.length; size+=c.genome.size; eff+=c.genome.basalEfficiency;
  lamarck+=c.genome.brain.lamarckFraction; learned+=c.brain.learnedMagnitude;
  if(c.genome.diet<.33)grazers++; else if(c.genome.diet>.67)carnivores++; else omnivores++;
  for(const p of c.genome.parts) partTotals[p.type]++;
}
const morphs = new Map<string,number>();
for(const c of creatures){const k=morphotypeKey(c.genome);morphs.set(k,(morphs.get(k)??0)+1)}
const summary=(c:any)=>({id:c.id,parentId:c.parentId,generation:c.generation,age:+c.age.toFixed(1),children:c.children,vertebrae:c.genome.vertebrae,size:+c.genome.size.toFixed(3),diet:+c.genome.diet.toFixed(3),parts:c.genome.parts.map((p:any)=>p.type),innovations:c.genome.innovations,lamarck:+c.genome.brain.lamarckFraction.toFixed(3),learned:+c.brain.learnedMagnitude.toFixed(5)});
console.log('PROBE100K_START');
console.log(JSON.stringify({
  steps:100000,simSeconds:+world.simTime.toFixed(1),population:creatures.length,births:world.births,deaths:world.deaths,
  maxGeneration:Math.max(...creatures.map(c=>c.generation)),morphotypes:morphs.size,innovations:world.events.filter(e=>e.type==='innovation').length,
  means:{diet:+(diet/creatures.length).toFixed(3),vertebrae:+(verts/creatures.length).toFixed(2),parts:+(parts/creatures.length).toFixed(2),size:+(size/creatures.length).toFixed(3),efficiency:+(eff/creatures.length).toFixed(3),lamarck:+(lamarck/creatures.length).toFixed(3),learned:+(learned/creatures.length).toFixed(5)},
  guilds:{grazers,omnivores,carnivores},partTotals,
  topMorphotypes:[...morphs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8),
  highestGeneration:[...creatures].sort((a,b)=>b.generation-a.generation).slice(0,8).map(summary),
  strangest:[...creatures].sort((a,b)=>(b.genome.parts.length+b.genome.vertebrae+b.genome.innovations.length*10)-(a.genome.parts.length+a.genome.vertebrae+a.genome.innovations.length*10)).slice(0,8).map(summary),
  events:world.events.slice(-25)
},null,2));
console.log('PROBE100K_END');