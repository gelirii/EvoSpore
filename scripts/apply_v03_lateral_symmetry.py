from pathlib import Path

# types
p = Path('src/sim/types.ts')
t = p.read_text()
needle = '  angularVelocity: number;\n  health: number;\n'
if '  handedness?: -1 | 1;\n' not in t:
    if t.count(needle) != 1:
        raise SystemExit('CreatureCheckpoint angular velocity marker not found')
    t = t.replace(needle, '  angularVelocity: number;\n  handedness?: -1 | 1;\n  health: number;\n', 1)
p.write_text(t)

# world
p = Path('src/sim/world.ts')
w = p.read_text()
needle = '  angularVelocity: number;\n  health: number;\n'
if '  handedness: -1 | 1;\n' not in w:
    if w.count(needle) != 1:
        raise SystemExit('Creature handedness marker not found')
    w = w.replace(needle, '  angularVelocity: number;\n  handedness: -1 | 1;\n  health: number;\n', 1)
needle = '      angularVelocity: this.rng.gaussian(0, 0.18),\n      health: maxHealth(genome),\n'
if needle not in w:
    raise SystemExit('makeCreature angular velocity marker not found')
w = w.replace(needle, "      angularVelocity: this.rng.gaussian(0, 0.18),\n      // Deterministic lateral frame removes arbitrary pond-wide left/right convention without consuming RNG draws.\n      // Sensory lateral signs and steering output are mirrored together, so it does not encode a goal.\n      handedness: id % 2 === 0 ? 1 : -1,\n      health: maxHealth(genome),\n", 1)
# Sense returns: mirror all lateral quantities and bearings.
w = w.replace('      speedSide,\n      angularVelocity: clamp(creature.angularVelocity / 2.5, -1, 1),', '      speedSide: speedSide * creature.handedness,\n      angularVelocity: clamp(creature.angularVelocity / 2.5, -1, 1) * creature.handedness,', 1)
w = w.replace('      nearestFoodBearing,\n', '      nearestFoodBearing: wrapAngle(nearestFoodBearing * creature.handedness),\n', 1)
w = w.replace('      nearestCreatureBearing,\n', '      nearestCreatureBearing: wrapAngle(nearestCreatureBearing * creature.handedness),\n', 1)
w = w.replace('      nearestCarcassBearing,\n', '      nearestCarcassBearing: wrapAngle(nearestCarcassBearing * creature.handedness),\n', 1)
w = w.replace('      chemoFoodY: clamp(localizeY(chemoFoodWorldX, chemoFoodWorldY), -1, 1),', '      chemoFoodY: clamp(localizeY(chemoFoodWorldX, chemoFoodWorldY), -1, 1) * creature.handedness,', 1)
w = w.replace('      chemoCreatureY: clamp(localizeY(chemoCreatureWorldX, chemoCreatureWorldY), -1, 1),', '      chemoCreatureY: clamp(localizeY(chemoCreatureWorldX, chemoCreatureWorldY), -1, 1) * creature.handedness,', 1)
w = w.replace('      boundaryBearing: wrapAngle(nearestBoundary.worldAngle - creature.angle),', '      boundaryBearing: wrapAngle((nearestBoundary.worldAngle - creature.angle) * creature.handedness),', 1)
# Mirror steering output back into world coordinates.
w = w.replace('    creature.angularVelocity += (torque * 2.4 / mass) * SIM_DT;', '    creature.angularVelocity += (torque * creature.handedness * 2.4 / mass) * SIM_DT;', 1)
# checkpoint and load
w = w.replace('      angle: c.angle, angularVelocity: c.angularVelocity, health: c.health, energy: c.energy, age: c.age,', '      angle: c.angle, angularVelocity: c.angularVelocity, handedness: c.handedness, health: c.health, energy: c.energy, age: c.age,', 1)
w = w.replace('        angularVelocity: c.angularVelocity,\n        health: c.health,', '        angularVelocity: c.angularVelocity,\n        handedness: c.handedness ?? (c.id % 2 === 0 ? 1 : -1),\n        health: c.health,', 1)
p.write_text(w)

print('lateral symmetry patch applied without RNG drift')
