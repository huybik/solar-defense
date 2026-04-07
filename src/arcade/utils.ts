import type { DropTable, Vec2 } from './types'
import { disposeMaterialLater } from './render/deferred-dispose'

export { clamp, lerp } from '../utils'

export function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx
  const dy = ay - by
  const r = ar + br
  return dx * dx + dy * dy <= r * r
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

/** Shared hit result for enemies, meteors, terrain */
export interface HitResult {
  id: number | string
  killed: boolean
  score: number
  credits: number
  position: Vec2
  drops: DropTable
}

/** Remove mesh from parent, dispose material, null ref */
export function disposeMesh(entity: { alive: boolean; mesh: { removeFromParent(): void; material?: unknown } | null }, parent: { remove(child: unknown): void }): void {
  entity.alive = false
  if (!entity.mesh) return
  entity.mesh.removeFromParent()
  if (entity.mesh.material) {
    disposeMaterialLater(entity.mesh.material as { dispose?(): void })
  }
  entity.mesh = null
}

/** Tick slow timer, return speed multiplier */
export function tickSlow(entity: { slowFactor: number; slowTimer: number }, delta: number): number {
  entity.slowTimer = Math.max(0, entity.slowTimer - delta)
  const mul = entity.slowTimer > 0 ? entity.slowFactor : 1
  if (entity.slowTimer <= 0) entity.slowFactor = 1
  return mul
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function nearest(position: Vec2, targets: Vec2[]): Vec2 | null {
  if (targets.length === 0) return null
  let best = targets[0]
  let bestDist = Math.hypot(best.x - position.x, best.y - position.y)
  for (let i = 1; i < targets.length; i++) {
    const c = targets[i]
    const d = Math.hypot(c.x - position.x, c.y - position.y)
    if (d < bestDist) {
      best = c
      bestDist = d
    }
  }
  return best
}
