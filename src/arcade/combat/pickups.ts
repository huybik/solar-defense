import type { Group, SpriteMaterial } from 'three/webgpu'
import { ARENA, type PickupEntity, type PickupType, type Vec2 } from '../types'
import { circleHit, disposeMesh } from '../utils'
import { loadSprite } from '../render/sprites'

const PICKUP_SPRITES: Record<PickupType, string> = {
  credits: 'powerupYellow_star',
  score: 'star_gold',
  health: 'pill_green',
  bomb: 'bolt_gold',
  energy: 'powerupBlue_bolt',
  shield: 'powerupBlue_shield',
  weapon: 'powerupRed_bolt',
  special: 'powerupYellow_bolt',
  data_cube: 'spaceEffects_011',
  pretzel: 'star_silver',
  astronaut: 'spaceAstronauts_003',
  powerup: 'powerupGreen_star',
}

const PICKUP_VALUES: Record<PickupType, number> = {
  credits: 50,
  score: 100,
  health: 8,
  bomb: 1,
  energy: 20,
  shield: 12,
  weapon: 1,
  special: 1,
  data_cube: 1,
  pretzel: 1,
  astronaut: 1,
  powerup: 1,
}

export class PickupManager {
  private readonly parent: Group
  private readonly pickups: PickupEntity[] = []
  private nextId = 1

  constructor(parent: Group) {
    this.parent = parent
  }

  spawn(type: PickupType, position: Vec2, payload?: string, value = PICKUP_VALUES[type], spriteOverride?: string): void {
    const spriteKey = spriteOverride ?? PICKUP_SPRITES[type]
    const entity: PickupEntity = {
      id: this.nextId++,
      type,
      position: { ...position },
      velocity: { x: 0, y: -3.4 },
      radius: type === 'astronaut' ? 0.9 : type === 'data_cube' ? 0.7 : 0.5,
      value,
      age: 0,
      sprite: spriteKey,
      payload,
      alive: true,
      mesh: loadSprite(spriteKey, type === 'astronaut' ? 1.4 : 1, type === 'astronaut' ? 1.4 : 1),
    }
    entity.mesh!.position.set(position.x, position.y, 0.3)
    this.parent.add(entity.mesh!)
    this.pickups.push(entity)
  }

  update(delta: number, attractors: Array<{ point: Vec2; radius: number }> = []): void {
    for (const pickup of this.pickups) {
      if (!pickup.alive) continue

      pickup.age += delta
      pickup.position.x += pickup.velocity.x * delta
      pickup.position.y += pickup.velocity.y * delta

      const attractor = attractors.find(({ point, radius }) =>
        circleHit(pickup.position.x, pickup.position.y, 0, point.x, point.y, radius),
      )
      if (attractor) {
        const dx = attractor.point.x - pickup.position.x
        const dy = attractor.point.y - pickup.position.y
        const length = Math.hypot(dx, dy) || 1
        pickup.velocity.x += (dx / length) * delta * 28
        pickup.velocity.y += (dy / length) * delta * 28
      }

      if (pickup.mesh) {
        pickup.mesh.position.set(pickup.position.x, pickup.position.y, 0.3)
        pickup.mesh.rotation.z += delta * 1.8
        ;((pickup.mesh as any).material as SpriteMaterial).opacity = pickup.type === 'data_cube'
          ? 0.7 + Math.sin(pickup.age * 5) * 0.15
          : 1
      }

      if (pickup.position.y < -ARENA.HALF_H - 6) {
        this.kill(pickup)
      }
    }
  }

  collect(position: Vec2, radius: number): PickupEntity[] {
    const collected: PickupEntity[] = []
    for (const pickup of this.pickups) {
      if (!pickup.alive) continue
      if (!circleHit(pickup.position.x, pickup.position.y, pickup.radius, position.x, position.y, radius)) continue
      pickup.alive = false
      collected.push(pickup)
      this.kill(pickup)
    }
    return collected
  }

  clear(): void {
    for (const pickup of this.pickups) this.kill(pickup)
    this.pickups.length = 0
  }

  dispose(): void {
    this.clear()
  }

  private kill(pickup: PickupEntity): void {
    disposeMesh(pickup, this.parent)
  }
}
