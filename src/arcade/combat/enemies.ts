import type { Group, Object3D, SpriteMaterial } from 'three/webgpu'
import { ARENA, type DifficultyScale, type EnemyDef, type EnemyEntity, type EnemyType, type PlanetId, type SpawnCommand, type SpawnDirection, type Vec2 } from '../types'
import { circleHit, disposeMesh, nearest, randRange, tickSlow, type HitResult } from '../utils'
import type { BulletPool } from './bullets'
import { getEnemyDef } from '../data/enemies'
import { loadSprite } from '../render/sprites'

export interface EnemyUpdateContext {
  delta: number
  targets: Vec2[]
}

const SPAWN_EDGE_MARGIN = 2.5
const MIN_VISIBLE_HALF_WIDTH = 8

function spawnLimit(visibleHalfWidth: number): number {
  return Math.max(
    MIN_VISIBLE_HALF_WIDTH,
    Math.min(ARENA.HALF_W - SPAWN_EDGE_MARGIN, visibleHalfWidth - SPAWN_EDGE_MARGIN),
  )
}

function clampSpawnX(x: number, visibleHalfWidth: number): number {
  const limit = spawnLimit(visibleHalfWidth)
  return Math.max(-limit, Math.min(limit, x))
}

function placementX(command: SpawnCommand, index: number, total: number, visibleHalfWidth: number): number {
  if (typeof command.x === 'number') return clampSpawnX(command.x, visibleHalfWidth)
  const limit = spawnLimit(visibleHalfWidth)
  switch (command.x) {
    case 'left':
      return clampSpawnX(-limit + 4 + index * 2.1, visibleHalfWidth)
    case 'right':
      return clampSpawnX(limit - 4 - index * 2.1, visibleHalfWidth)
    case 'center':
      return clampSpawnX((index - (total - 1) / 2) * (command.spacing ?? 2.4), visibleHalfWidth)
    case 'random':
      return randRange(-limit, limit)
    case 'spread':
    default: {
      const spacing = command.spacing ?? 4
      return clampSpawnX((index - (total - 1) / 2) * spacing, visibleHalfWidth)
    }
  }
}

function spawnPosition(direction: SpawnDirection, x: number, visibleHalfWidth: number): Vec2 {
  const limit = spawnLimit(visibleHalfWidth)
  switch (direction) {
    case 'left':
      return { x: -limit, y: randRange(6, ARENA.HALF_H - 4) }
    case 'right':
      return { x: limit, y: randRange(6, ARENA.HALF_H - 4) }
    case 'bottom':
      return { x: clampSpawnX(x, visibleHalfWidth), y: -ARENA.HALF_H - 3 }
    case 'sides':
      return Math.random() > 0.5 ? spawnPosition('left', x, visibleHalfWidth) : spawnPosition('right', x, visibleHalfWidth)
    case 'top':
    default:
      return { x: clampSpawnX(x, visibleHalfWidth), y: ARENA.HALF_H + 3 }
  }
}

export class EnemyManager {
  private readonly parent: Group
  private readonly bullets: BulletPool
  private readonly planetId: PlanetId
  private readonly active: EnemyEntity[] = []
  private nextId = 1
  private viewportHalfWidth = ARENA.HALF_W
  private progressionHealthMul = 1
  private difficulty: DifficultyScale = {
    enemyHealthMul: 1,
    enemyFireRateMul: 1,
    creditMul: 1,
    enemyBulletSpeedMul: 1,
    enemyCountMul: 1,
  }

  constructor(parent: Group, bullets: BulletPool, planetId: PlanetId) {
    this.parent = parent
    this.bullets = bullets
    this.planetId = planetId
  }

  setDifficulty(scale: DifficultyScale): void {
    this.difficulty = scale
  }

  setProgressionHealth(multiplier: number): void {
    this.progressionHealthMul = Math.max(1, multiplier)
  }

  setViewportBounds(visibleHalfWidth: number): void {
    this.viewportHalfWidth = Math.max(MIN_VISIBLE_HALF_WIDTH, visibleHalfWidth)
  }

  spawn(command: SpawnCommand): void {
    const def = getEnemyDef(command.enemyType, this.planetId)
    const count = Math.max(1, Math.round(command.count * this.difficulty.enemyCountMul))
    const direction = command.direction ?? def.spawnDirections[0] ?? 'top'
    const healthMul = this.difficulty.enemyHealthMul * this.progressionHealthMul

    for (let index = 0; index < count; index++) {
      const x = placementX(command, index, count, this.viewportHalfWidth)
      const position = spawnPosition(direction, x, this.viewportHalfWidth)
      const mesh = this.createMesh(def)
      const baseHealth = command.health ?? def.health
      const enemy: EnemyEntity = {
        id: this.nextId++,
        type: command.enemyType,
        def,
        position,
        velocity: { x: 0, y: 0 },
        radius: def.radius,
        health: Math.max(1, Math.round(baseHealth * healthMul)),
        maxHealth: Math.max(1, Math.round(baseHealth * healthMul)),
        shield: def.shield ?? 0,
        maxShield: def.shield ?? 0,
        fireTimer: randRange(0.3, 1.4),
        age: 0,
        alive: true,
        cloaked: false,
        slowFactor: 1,
        slowTimer: 0,
        spawnDirection: direction,
        behaviorState: {
          sineBaseX: position.x,
          formationX: x,
          formationY: position.y,
          strafeDir: Math.random() > 0.5 ? 1 : -1,
          cloakTimer: randRange(0, 1),
          carrierTimer: def.carrierRate ?? 0,
          aimTimer: 0,
          ringAngle: Math.random() * Math.PI * 2,
          retreating: false,
        },
        mesh,
      }
      if (mesh) {
        mesh.position.set(position.x, position.y, 0)
        this.parent.add(mesh)
      }
      this.active.push(enemy)
    }
  }

  update(context: EnemyUpdateContext): void {
    for (const enemy of this.active) {
      if (!enemy.alive) continue

      enemy.age += context.delta
      const speedMul = tickSlow(enemy, context.delta)
      this.applyBehavior(enemy, { ...context, delta: context.delta * speedMul })
      enemy.position.x += enemy.velocity.x * context.delta * speedMul
      enemy.position.y += enemy.velocity.y * context.delta * speedMul
      enemy.fireTimer -= context.delta * speedMul

      if (enemy.def.fireRate > 0 && enemy.fireTimer <= 0) {
        this.fire(enemy, context.targets)
        enemy.fireTimer = 1 / Math.max(0.1, enemy.def.fireRate * this.difficulty.enemyFireRateMul)
      }

      if (enemy.position.y < -ARENA.HALF_H - 6 || Math.abs(enemy.position.x) > ARENA.HALF_W + 8) {
        this.kill(enemy)
        continue
      }

      if (enemy.mesh) {
        enemy.mesh.position.set(enemy.position.x, enemy.position.y, 0)
        enemy.mesh.rotation.z = enemy.velocity.x * -0.02
        if ('material' in enemy.mesh) {
          const material = enemy.mesh.material as SpriteMaterial
          material.opacity = enemy.cloaked ? 0.25 : enemy.slowTimer > 0 ? 0.7 : 1
        }
      }
    }
  }

  getActive(): EnemyEntity[] {
    return this.active.filter((enemy) => enemy.alive)
  }

  hit(enemy: EnemyEntity, damage: number): HitResult {
    if (!enemy.alive || enemy.cloaked) {
      return { id: enemy.id, killed: false, score: 0, credits: 0, position: { ...enemy.position }, drops: enemy.def.dropTable }
    }

    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, damage)
      enemy.shield -= absorbed
      damage -= absorbed
    }
    if (damage > 0) {
      enemy.health -= damage
    }

    if (enemy.health > 0) {
      return { id: enemy.id, killed: false, score: 0, credits: 0, position: { ...enemy.position }, drops: enemy.def.dropTable }
    }

    const result: HitResult = {
      id: enemy.id,
      killed: true,
      score: enemy.def.score,
      credits: Math.round(enemy.def.credits * this.difficulty.creditMul),
      position: { ...enemy.position },
      drops: enemy.def.dropTable,
    }
    this.kill(enemy)
    return result
  }

  damageAt(x: number, y: number, radius: number, damage: number): HitResult[] {
    const results: HitResult[] = []
    for (const enemy of this.active) {
      if (!enemy.alive) continue
      if (!circleHit(x, y, radius, enemy.position.x, enemy.position.y, enemy.radius)) continue
      results.push(this.hit(enemy, damage))
    }
    return results
  }

  clear(): void {
    for (const enemy of this.active) {
      this.kill(enemy)
    }
    this.active.length = 0
  }

  dispose(): void {
    this.clear()
  }

  private createMesh(def: EnemyDef): Object3D {
    const sprite = def.altSprites?.length
      ? [def.sprite, ...def.altSprites][Math.floor(Math.random() * (def.altSprites.length + 1))]
      : def.sprite
    return loadSprite(sprite, def.radius * 2.3, def.radius * 2.1, { color: def.tint })
  }

  private fire(enemy: EnemyEntity, targets: Vec2[]): void {
    const def = enemy.def
    const target = nearest(enemy.position, targets)

    if (def.behaviorType === 'carrier' && def.carrierSpawn) {
      if (enemy.behaviorState.carrierTimer <= 0) {
        this.spawn({
          enemyType: def.carrierSpawn,
          count: 1,
          x: enemy.position.x,
          direction: 'top',
        })
        enemy.behaviorState.carrierTimer = def.carrierRate ?? 3
      } else {
        enemy.behaviorState.carrierTimer -= 1 / Math.max(0.1, def.fireRate)
      }
    }

    if (enemy.type === 'beam_ship' || enemy.type === 'ufo_beam') {
      this.bullets.spawn({
        owner: 'enemy',
        weaponId: enemy.type,
        slot: 'enemy',
        type: 'beam',
        position: { x: enemy.position.x, y: enemy.position.y - 6 },
        radius: 0.7,
        damage: 4,
        sprite: def.projectileSprite,
        beamLength: 12,
        maxAge: 0.5,
        scale: 1.1,
        tint: '#ff8f6a',
      })
      return
    }

    const bulletSpeed = (def.bulletSpeed ?? 18) * this.difficulty.enemyBulletSpeedMul

    if (enemy.def.behaviorType === 'minefield') {
      this.bullets.spawn({
        owner: 'enemy',
        weaponId: enemy.type,
        slot: 'enemy',
        type: 'missile',
        position: { ...enemy.position },
        velocity: { x: 0, y: -10 },
        radius: 0.55,
        damage: def.bulletDamage ?? 4,
        sprite: def.projectileSprite,
        maxAge: 3.2,
        scale: 1,
        splashRadius: def.splashRadius,
        tint: '#ff9a64',
      })
      return
    }

    if (!target) return

    const dx = target.x - enemy.position.x
    const dy = target.y - enemy.position.y
    const angle = Math.atan2(dx, dy)
    const burst = Math.max(1, def.burstCount ?? 1)
    const spread = def.spread ?? 0
    const baseOffsets = burst === 1 ? [0] : Array.from({ length: burst }, (_, index) => (index - (burst - 1) / 2) * spread)

    for (const offset of baseOffsets) {
      const vx = Math.sin(angle + offset) * bulletSpeed
      const vy = Math.cos(angle + offset) * bulletSpeed
      this.bullets.spawn({
        owner: 'enemy',
        weaponId: enemy.type,
        slot: 'enemy',
        type: def.type === 'bomber' ? 'missile' : 'bullet',
        position: { ...enemy.position },
        velocity: { x: vx, y: vy },
        radius: def.type === 'bomber' ? 0.45 : 0.3,
        damage: def.bulletDamage ?? 3,
        sprite: def.projectileSprite,
        maxAge: 5,
        scale: 0.95,
        splashRadius: def.splashRadius,
        tint: '#ff8f6a',
        homing: enemy.type === 'ufo_assault' ? 0.06 : 0,
      })
    }
  }

  private applyBehavior(enemy: EnemyEntity, context: EnemyUpdateContext): void {
    const def = enemy.def
    switch (def.behaviorType) {
      case 'linear':
        enemy.velocity.x = 0
        enemy.velocity.y = -def.speed
        break
      case 'sine':
        enemy.velocity.y = -def.speed
        enemy.velocity.x = Math.sin(enemy.age * 2.4) * 6
        break
      case 'formation':
        enemy.velocity.y = enemy.position.y > 14 ? -def.speed : -def.speed * 0.4
        enemy.velocity.x = Math.sin(enemy.age * 1.2 + enemy.behaviorState.formationX) * 4
        break
      case 'dive':
        this.seek(enemy, nearest(enemy.position, context.targets), def.speed * 1.1)
        break
      case 'hover':
        if (enemy.spawnDirection === 'bottom') {
          enemy.velocity.y = def.speed
        } else if (enemy.position.y > (def.hoverY ?? 15)) {
          enemy.velocity.x = 0
          enemy.velocity.y = -def.speed
        } else {
          enemy.velocity.y = -1.5
          enemy.velocity.x = enemy.behaviorState.strafeDir * 4
          if (Math.abs(enemy.position.x) > ARENA.HALF_W - 4) {
            enemy.behaviorState.strafeDir *= -1
          }
        }
        break
      case 'zigzag':
        enemy.velocity.y = -def.speed
        enemy.velocity.x = Math.sin(enemy.age * 4) * 7
        break
      case 'circle':
        enemy.behaviorState.ringAngle += context.delta * 2
        enemy.velocity.y = -def.speed * 0.5
        enemy.velocity.x = Math.cos(enemy.behaviorState.ringAngle) * 6
        break
      case 'cloak':
        enemy.velocity.y = -def.speed
        enemy.velocity.x = Math.sin(enemy.age * 2.2) * 5
        enemy.behaviorState.cloakTimer += context.delta
        enemy.cloaked = Math.sin(enemy.behaviorState.cloakTimer * 2.4) > 0.45
        break
      case 'strafe':
        enemy.velocity.y = enemy.position.y > 18 ? -def.speed : -1.4
        enemy.velocity.x = enemy.behaviorState.strafeDir * 5
        if (Math.abs(enemy.position.x) > ARENA.HALF_W - 5) {
          enemy.behaviorState.strafeDir *= -1
        }
        break
      case 'erratic':
        enemy.velocity.y = -def.speed * 0.9
        enemy.velocity.x = Math.sin(enemy.age * 5 + enemy.id) * 8
        break
      case 'ambush':
        this.seek(enemy, nearest(enemy.position, context.targets), def.speed * 1.2, true)
        break
      case 'carrier':
        if (enemy.position.y > 16) {
          enemy.velocity.x = 0
          enemy.velocity.y = -def.speed
        } else {
          enemy.velocity.y = -1.2
          enemy.velocity.x = Math.sin(enemy.age) * 3.5
        }
        enemy.behaviorState.carrierTimer -= context.delta
        break
      case 'minefield':
        enemy.velocity.y = -def.speed * 0.4
        enemy.velocity.x = enemy.behaviorState.strafeDir * 6
        if (Math.abs(enemy.position.x) > ARENA.HALF_W - 4) {
          enemy.behaviorState.strafeDir *= -1
        }
        break
    }
  }

  private seek(enemy: EnemyEntity, target: Vec2 | null, speed: number, upwardBias = false): void {
    if (!target) {
      enemy.velocity.x = 0
      enemy.velocity.y = upwardBias ? speed : -speed
      return
    }

    const dx = target.x - enemy.position.x
    const dy = target.y - enemy.position.y
    const length = Math.hypot(dx, dy) || 1
    enemy.velocity.x = (dx / length) * speed
    enemy.velocity.y = (dy / length) * speed
  }

  private kill(enemy: EnemyEntity): void {
    disposeMesh(enemy, this.parent)
  }
}
