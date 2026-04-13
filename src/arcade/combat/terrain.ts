import type { Group, SpriteMaterial } from 'three/webgpu'
import { ARENA, type TerrainCommand, type TerrainEntity } from '../types'
import { circleHit, disposeMesh, tickSlow, type HitResult } from '../utils'
import type { BulletPool } from './bullets'
import { getTerrainDef } from '../data/enemies'
import { loadSprite } from '../render/sprites'

export interface TerrainUpdateContext {
  delta: number
}


export class TerrainManager {
  private readonly parent: Group
  private readonly bullets: BulletPool
  private readonly active: TerrainEntity[] = []
  private nextId = 1

  constructor(parent: Group, bullets: BulletPool) {
    this.parent = parent
    this.bullets = bullets
  }

  spawn(command: TerrainCommand): void {
    const count = command.count ?? 1
    for (let index = 0; index < count; index++) {
      const def = getTerrainDef(command.defId)
      const x =
        typeof command.x === 'number'
          ? command.x
          : command.x === 'left'
            ? -ARENA.HALF_W + 5 + index * (command.spacing ?? 3)
            : command.x === 'right'
              ? ARENA.HALF_W - 5 - index * (command.spacing ?? 3)
              : (index - (count - 1) / 2) * (command.spacing ?? 6)

      const entity: TerrainEntity = {
        id: this.nextId++,
        defId: def.id,
        position: { x, y: ARENA.HALF_H + 4 + index * 2 },
        velocity: { x: 0, y: -5 },
        radius: def.radius,
        health: def.health,
        maxHealth: def.health,
        fireTimer: 1 + Math.random(),
        slowFactor: 1,
        slowTimer: 0,
        alive: true,
        mesh: loadSprite(def.sprite, def.radius * 2.4, def.radius * 2.3),
      }
      entity.mesh!.position.set(entity.position.x, entity.position.y, -0.4)
      this.parent.add(entity.mesh!)
      this.active.push(entity)
    }
  }

  update(context: TerrainUpdateContext): void {
    for (const entity of this.active) {
      if (!entity.alive) continue
      const def = getTerrainDef(entity.defId)
      const speedMul = tickSlow(entity, context.delta)
      entity.position.y += entity.velocity.y * context.delta * speedMul
      entity.fireTimer -= context.delta * speedMul

      if (def.isTurret && def.fireRate && entity.fireTimer <= 0) {
        this.fire(entity)
        entity.fireTimer = 1 / def.fireRate
      }

      if (entity.mesh) {
        entity.mesh.position.set(entity.position.x, entity.position.y, -0.4)
        ;((entity.mesh as any).material as SpriteMaterial).opacity = entity.slowTimer > 0 ? 0.76 : 1
      }

      if (entity.position.y < -ARENA.HALF_H - 8) {
        this.kill(entity)
      }
    }
  }

  getActive(): TerrainEntity[] {
    return this.active.filter((item) => item.alive)
  }

  hit(entity: TerrainEntity, damage: number): HitResult {
    if (!entity.alive) {
      return {
        id: entity.defId,
        killed: false,
        score: 0,
        credits: 0,
        position: { ...entity.position },
        radius: entity.radius,
        drops: { credits: [0, 0] },
      }
    }
    entity.health -= damage
    const def = getTerrainDef(entity.defId)
    if (entity.health > 0) {
      return {
        id: entity.defId,
        killed: false,
        score: 0,
        credits: 0,
        position: { ...entity.position },
        radius: entity.radius,
        drops: def.dropTable ?? { credits: [0, 0] },
      }
    }
    const result: HitResult = {
      id: entity.defId,
      killed: true,
      score: def.isTurret ? 150 : 90,
      credits: def.isTurret ? 30 : 20,
      position: { ...entity.position },
      radius: entity.radius,
      drops: def.dropTable ?? { credits: [0, 0] },
    }
    this.kill(entity)
    return result
  }

  damageAt(x: number, y: number, radius: number, damage: number): HitResult[] {
    const results: HitResult[] = []
    for (const entity of this.active) {
      if (!entity.alive) continue
      if (!circleHit(x, y, radius, entity.position.x, entity.position.y, entity.radius)) continue
      results.push(this.hit(entity, damage))
    }
    return results
  }

  clear(): void {
    for (const entity of this.active) this.kill(entity)
    this.active.length = 0
  }

  dispose(): void {
    this.clear()
  }

  private fire(entity: TerrainEntity): void {
    const def = getTerrainDef(entity.defId)
    if (!def.projectileSprite) return
    const speed = def.projectileSpeed ?? 16

    if (def.firePattern === 'ring') {
      for (let index = 0; index < 8; index++) {
        const angle = (index / 8) * Math.PI * 2
        this.bullets.spawn({
          owner: 'enemy',
          weaponId: def.id,
          slot: 'hazard',
          type: 'bullet',
          position: { ...entity.position },
          velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          radius: 0.28,
          damage: 3,
          sprite: def.projectileSprite,
          maxAge: 4,
          scale: 0.9,
          tint: '#ff8860',
        })
      }
      return
    }

    this.bullets.spawn({
      owner: 'enemy',
      weaponId: def.id,
      slot: 'hazard',
      type: 'bullet',
      position: { ...entity.position },
      velocity: { x: 0, y: -speed },
      radius: 0.28,
      damage: 3,
      sprite: def.projectileSprite,
      maxAge: 4,
      scale: 0.9,
      tint: '#ff8f6a',
    })
  }

  private kill(entity: TerrainEntity): void {
    disposeMesh(entity, this.parent)
  }
}
