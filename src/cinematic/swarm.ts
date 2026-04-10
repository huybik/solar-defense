import { Group, MathUtils, Vector3 } from 'three/webgpu'
import type { Scene, Sprite, SpriteMaterial } from 'three/webgpu'
import { loadSprite, preloadAtlases } from '../arcade/render/sprites'

const SHIP_KEYS = [
  'enemyBlack1', 'enemyBlack2', 'enemyBlack4', 'enemyBlack5',
  'enemyRed1', 'enemyRed3', 'enemyRed5',
  'enemyBlue2', 'enemyBlue4',
  'enemyGreen1', 'enemyGreen5',
  'ufoRed',
]

const TINTS = ['#9933cc', '#cc3366', '#6633cc', '#993366']
const AMBIENT_GROUPS = 6
const WAVE_GROUPS = 3

interface SwarmShip {
  sprite: Sprite
  offset: Vector3     // fixed formation offset from group center
  wobblePhase: number // organic oscillation phase
  wobbleAmp: number
}

interface SwarmGroup {
  center: Vector3
  velocity: Vector3
  ships: SwarmShip[]
  lifetime: number
  age: number
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Coordinated enemy-ship formations that stream across the solar system
 * during the cinematic intro. Ships fly in groups sharing one direction,
 * with organic wobble for a swarm-like feel.
 */
export class SwarmEffect {
  readonly group = new Group()
  private groups: SwarmGroup[] = []
  private rafId = 0
  private lastTime = 0
  private destroyed = false

  async start(scene: Scene) {
    await preloadAtlases()
    if (this.destroyed) return

    scene.add(this.group)
    for (let i = 0; i < AMBIENT_GROUPS; i++) this.spawnAmbientGroup()

    this.lastTime = performance.now()
    this.tick()
  }

  /** Spawn coordinated formation groups visible from the given camera. */
  spawnWave(cameraPos: Vector3, target: Vector3) {
    if (this.destroyed) return

    const dir = new Vector3().subVectors(target, cameraPos).normalize()
    const right = new Vector3().crossVectors(dir, new Vector3(0, 1, 0))
    if (right.lengthSq() < 0.01) right.set(1, 0, 0)
    right.normalize()
    const up = new Vector3().crossVectors(right, dir).normalize()

    for (let g = 0; g < WAVE_GROUPS; g++) {
      const center = target.clone()
        .addScaledVector(dir, rand(8, 30))
        .addScaledVector(right, rand(-15, 15))
        .addScaledVector(up, rand(-5, 5))

      const vel = dir.clone().negate()
      vel.x += rand(-0.1, 0.1)
      vel.y += rand(-0.03, 0.03)
      vel.z += rand(-0.1, 0.1)
      vel.normalize().multiplyScalar(rand(5, 12))

      this.createGroup(center, vel, rand(10, 18))
    }
  }

  destroy(scene: Scene) {
    this.destroyed = true
    cancelAnimationFrame(this.rafId)
    for (const g of this.groups) {
      for (const s of g.ships) s.sprite.material.dispose()
    }
    this.groups.length = 0
    scene.remove(this.group)
  }

  private tick = () => {
    if (this.destroyed) return
    const now = performance.now()
    const dt = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now
    const t = now / 1000

    for (let i = this.groups.length - 1; i >= 0; i--) {
      const g = this.groups[i]
      g.age += dt
      g.center.addScaledVector(g.velocity, dt)

      // Group-level fade in/out
      let alpha = 0.8
      if (g.age < 2) alpha = MathUtils.clamp(g.age / 2, 0, 0.8)
      else if (g.age > g.lifetime - 2) alpha = MathUtils.clamp((g.lifetime - g.age) / 2, 0, 0.8)

      for (const s of g.ships) {
        // Formation position + organic wobble
        s.sprite.position.copy(g.center).add(s.offset)
        s.sprite.position.x += Math.sin(t * 1.5 + s.wobblePhase) * s.wobbleAmp
        s.sprite.position.y += Math.sin(t * 1.2 + s.wobblePhase + 1) * s.wobbleAmp * 0.5
        ;(s.sprite.material as SpriteMaterial).opacity = alpha
      }

      if (g.age >= g.lifetime) {
        for (const s of g.ships) {
          this.group.remove(s.sprite)
          s.sprite.material.dispose()
        }
        this.groups.splice(i, 1)
      }
    }

    if (this.groups.length < 3) this.spawnAmbientGroup()

    this.rafId = requestAnimationFrame(this.tick)
  }

  private spawnAmbientGroup() {
    const r = rand(40, 160)
    const theta = rand(0, Math.PI * 2)
    const center = new Vector3(r * Math.cos(theta), rand(-4, 4), r * Math.sin(theta))

    const dir = center.clone().negate()
    dir.y = 0
    dir.normalize()
    dir.x += rand(-0.15, 0.15)
    dir.z += rand(-0.15, 0.15)
    dir.normalize()

    const vel = dir.multiplyScalar(rand(3, 8))
    const g = this.createGroup(center, vel, rand(12, 28))
    g.age = rand(0, g.lifetime * 0.4) // stagger so they don't all pop in at once
  }

  private createGroup(center: Vector3, velocity: Vector3, lifetime: number): SwarmGroup {
    const count = Math.floor(rand(6, 13))
    const tint = pick(TINTS)
    // 1-2 sprite keys per group for cohesive look
    const key1 = pick(SHIP_KEYS)
    const key2 = pick(SHIP_KEYS)
    const baseRotation = Math.atan2(velocity.x, velocity.z)

    const ships: SwarmShip[] = []
    for (let i = 0; i < count; i++) {
      const size = rand(0.15, 0.5)
      const sprite = loadSprite(Math.random() < 0.7 ? key1 : key2, size, size, {
        color: tint,
        opacity: 0,
      })
      ;(sprite.material as SpriteMaterial).rotation = baseRotation + rand(-0.2, 0.2)

      ships.push({
        sprite,
        offset: new Vector3(rand(-3, 3), rand(-1, 1), rand(-3, 3)),
        wobblePhase: rand(0, Math.PI * 2),
        wobbleAmp: rand(0.2, 0.8),
      })
      this.group.add(sprite)
    }

    const g: SwarmGroup = { center: center.clone(), velocity: velocity.clone(), ships, lifetime, age: 0 }
    this.groups.push(g)
    return g
  }
}
