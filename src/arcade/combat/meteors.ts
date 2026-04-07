import type { Group, SpriteMaterial } from 'three/webgpu'
import { ARENA, type MeteorCommand, type MeteorEntity } from '../types'
import { circleHit, disposeMesh, randRange, tickSlow, type HitResult } from '../utils'
import { getMeteorDef } from '../data/enemies'
import { loadSprite } from '../render/sprites'

export class MeteorManager {
  private readonly parent: Group
  private readonly active: MeteorEntity[] = []
  private nextId = 1

  constructor(parent: Group) {
    this.parent = parent
  }

  spawn(command: MeteorCommand): void {
    for (let index = 0; index < command.count; index++) {
      const def = getMeteorDef(command.defId)
      const position = {
        x: typeof command.x === 'number' ? command.x : command.x === 'spread' ? (index - (command.count - 1) / 2) * 6 : randRange(-ARENA.HALF_W + 3, ARENA.HALF_W - 3),
        y: ARENA.HALF_H + 3 + index * 1.2,
      }
      const meteor: MeteorEntity = {
        id: this.nextId++,
        defId: def.id,
        position,
        velocity: {
          x: randRange(-1.8, 1.8),
          y: -(command.speed ?? def.speed),
        },
        radius: def.radius,
        health: def.health,
        maxHealth: def.health,
        rotation: randRange(0, Math.PI * 2),
        rotationSpeed: def.rotationSpeed,
        slowFactor: 1,
        slowTimer: 0,
        alive: true,
        mesh: loadSprite(def.sprite, def.radius * 2.2, def.radius * 2.2),
      }
      meteor.mesh!.position.set(position.x, position.y, 0)
      this.parent.add(meteor.mesh!)
      this.active.push(meteor)
    }
  }

  update(delta: number): void {
    for (const meteor of this.active) {
      if (!meteor.alive) continue
      const speedMul = tickSlow(meteor, delta)
      meteor.position.x += meteor.velocity.x * delta * speedMul
      meteor.position.y += meteor.velocity.y * delta * speedMul
      meteor.rotation += meteor.rotationSpeed * delta * speedMul
      if (meteor.mesh) {
        meteor.mesh.position.set(meteor.position.x, meteor.position.y, -0.1)
        meteor.mesh.rotation.z = meteor.rotation
        ;((meteor.mesh as any).material as SpriteMaterial).opacity = meteor.slowTimer > 0 ? 0.72 : 1
      }
      if (meteor.position.y < -ARENA.HALF_H - 6) {
        this.kill(meteor)
      }
    }
  }

  getActive(): MeteorEntity[] {
    return this.active.filter((meteor) => meteor.alive)
  }

  hit(meteor: MeteorEntity, damage: number): HitResult {
    if (!meteor.alive) {
      return { id: meteor.defId, killed: false, score: 0, credits: 0, position: { ...meteor.position }, drops: { credits: [0, 0] } }
    }

    meteor.health -= damage
    if (meteor.health > 0) {
      const def = getMeteorDef(meteor.defId)
      return { id: meteor.defId, killed: false, score: 0, credits: 0, position: { ...meteor.position }, drops: def.drops }
    }

    const def = getMeteorDef(meteor.defId)
    const result: HitResult = {
      id: meteor.defId,
      killed: true,
      score: def.score,
      credits: def.credits,
      position: { ...meteor.position },
      drops: def.drops,
    }
    this.kill(meteor)
    return result
  }

  damageAt(x: number, y: number, radius: number, damage: number): HitResult[] {
    const results: HitResult[] = []
    for (const meteor of this.active) {
      if (!meteor.alive) continue
      if (!circleHit(x, y, radius, meteor.position.x, meteor.position.y, meteor.radius)) continue
      results.push(this.hit(meteor, damage))
    }
    return results
  }

  clear(): void {
    for (const meteor of this.active) this.kill(meteor)
    this.active.length = 0
  }

  dispose(): void {
    this.clear()
  }

  private kill(meteor: MeteorEntity): void {
    disposeMesh(meteor, this.parent)
  }
}
