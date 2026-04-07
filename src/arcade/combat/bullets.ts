import type { Group, MeshBasicMaterial, Object3D, SpriteMaterial } from 'three/webgpu'
import { ARENA, type MissilePhase, type ProjectileEntity, type ProjectileOwner, type ProjectileType, type Vec2 } from '../types'
import { clamp } from '../utils'
import { hasAsset, loadPlane, loadSprite } from '../render/sprites'
import { removeAndDisposeObjectLater } from '../render/deferred-dispose'

const OFFSCREEN_MARGIN = 8
const MISSILE_VISUAL_TURN_RATE = 12
const MISSILE_BANK_FACTOR = 0.8
const MISSILE_BANK_LIMIT = 0.24
const MISSILE_PLAYER_LAUNCH_DURATION = 0.12
const MISSILE_ENEMY_LAUNCH_DURATION = 0.18
const MISSILE_PLAYER_REACQUIRE = 0.14
const MISSILE_ENEMY_REACQUIRE = 0.2
const MISSILE_TERMINAL_REACQUIRE = 0.08
const MISSILE_PLAYER_LAUNCH_BOOST = 0.18
const MISSILE_ENEMY_LAUNCH_BOOST = 0.1
const MISSILE_TERMINAL_SPEED_BOOST = 0.1
const MISSILE_ACQUIRE_TURN_MUL = 5.5
const MISSILE_TERMINAL_TURN_MUL = 10.5
const MISSILE_TRAIL_INTERVAL = 0.028

export interface ProjectileSpawn {
  owner: ProjectileOwner
  weaponId: string
  slot: ProjectileEntity['slot']
  type: ProjectileType | 'field' | 'flare'
  position: Vec2
  velocity?: Vec2
  radius: number
  damage: number
  sprite: string
  maxAge?: number
  scale?: number
  angle?: number
  tint?: string
  piercing?: number
  homing?: number
  waveAmplitude?: number
  waveFrequency?: number
  orbitAngle?: number
  orbitRadius?: number
  beamLength?: number
  splashRadius?: number
  proximityRadius?: number
  fieldRadius?: number
  slowFactor?: number
  trailColor?: string
  decoy?: boolean
  anchorId?: string
  launchDuration?: number
  reacquireInterval?: number
  terminalRange?: number
}

export interface HomingTarget {
  id: string
  position: Vec2
  radius: number
}

export interface ProjectileUpdateContext {
  findTarget(position: Vec2, preferredId?: string): HomingTarget | null
  getAnchor(anchorId: string): Vec2 | null
  emitTrail?(x: number, y: number, color: string, phase: MissilePhase): void
}

function cloneVec2(input: Vec2): Vec2 {
  return { x: input.x, y: input.y }
}

function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function rotateTowardAngle(current: number, target: number, maxStep: number): number {
  const diff = wrapAngle(target - current)
  if (Math.abs(diff) <= maxStep) return target
  return current + clamp(diff, -maxStep, maxStep)
}

function rotationFromVelocity(velocity: Vec2): number {
  return Math.atan2(velocity.y, velocity.x || 0.0001) - Math.PI * 0.5
}

function setProjectileSpeed(projectile: ProjectileEntity, speed: number): void {
  projectile.velocity.x = Math.sin(projectile.heading) * speed
  projectile.velocity.y = Math.cos(projectile.heading) * speed
}

function defaultLaunchDuration(owner: ProjectileOwner): number {
  return owner === 'enemy' ? MISSILE_ENEMY_LAUNCH_DURATION : MISSILE_PLAYER_LAUNCH_DURATION
}

function defaultReacquireInterval(owner: ProjectileOwner): number {
  return owner === 'enemy' ? MISSILE_ENEMY_REACQUIRE : MISSILE_PLAYER_REACQUIRE
}

function defaultTrailColor(owner: ProjectileOwner): string {
  if (owner === 'enemy') return '#ff9c6b'
  if (owner === 'neutral') return '#d8e7ff'
  return '#ffd08a'
}

function defaultMissileSplash(config: ProjectileSpawn): number {
  if (typeof config.splashRadius === 'number') return config.splashRadius
  if (config.type !== 'missile') return 0
  return config.owner === 'enemy' ? 0.6 : 0.8
}

function defaultMissileProximity(radius: number, splashRadius: number): number {
  return Math.max(radius * 0.9, splashRadius * 0.45, 0.55)
}

function defaultTerminalRange(proximityRadius: number, splashRadius: number): number {
  return Math.max(2.4, proximityRadius * 4.4, splashRadius * 1.8)
}

function emitMissileTrail(projectile: ProjectileEntity, dt: number, context: ProjectileUpdateContext): void {
  if (!context.emitTrail) return
  projectile.trailTimer -= dt
  const interval = projectile.phase === 'terminal' ? MISSILE_TRAIL_INTERVAL * 0.65 : MISSILE_TRAIL_INTERVAL
  const color = projectile.trailColor ?? defaultTrailColor(projectile.owner)

  while (projectile.trailTimer <= 0) {
    context.emitTrail(
      projectile.position.x - Math.sin(projectile.heading) * 0.42,
      projectile.position.y - Math.cos(projectile.heading) * 0.58,
      color,
      projectile.phase,
    )
    projectile.trailTimer += interval
  }
}

function steerHoming(projectile: ProjectileEntity, dt: number, context: ProjectileUpdateContext): void {
  const target = context.findTarget(projectile.position)
  if (!target) return
  const desired = Math.atan2(target.position.x - projectile.position.x, target.position.y - projectile.position.y)
  let diff = desired - projectile.heading
  if (diff > Math.PI) diff -= Math.PI * 2
  if (diff < -Math.PI) diff += Math.PI * 2
  const maxTurn = projectile.homing * 8 * dt
  projectile.heading += clamp(diff, -maxTurn, maxTurn)
  const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y) || 1
  setProjectileSpeed(projectile, speed)
}

function refreshMissileTarget(projectile: ProjectileEntity, context: ProjectileUpdateContext): void {
  const target = context.findTarget(projectile.position, projectile.targetId)
  if (!target) {
    projectile.targetId = undefined
    projectile.targetPoint = null
    projectile.targetRadius = 0
    return
  }

  projectile.targetId = target.id
  projectile.targetPoint = cloneVec2(target.position)
  projectile.targetRadius = target.radius
}

function updateMissile(projectile: ProjectileEntity, dt: number, context: ProjectileUpdateContext): void {
  if (projectile.phase === 'launch' && projectile.age >= projectile.launchDuration) {
    projectile.phase = 'acquire'
    projectile.reacquireTimer = 0
  }

  if (projectile.phase !== 'launch') {
    projectile.reacquireTimer -= dt
    if (projectile.reacquireTimer <= 0 || (!projectile.targetPoint && projectile.homing > 0)) {
      refreshMissileTarget(projectile, context)
      projectile.reacquireTimer = projectile.phase === 'terminal'
        ? MISSILE_TERMINAL_REACQUIRE
        : projectile.reacquireInterval
    }
  }

  if (projectile.targetPoint) {
    const dx = projectile.targetPoint.x - projectile.position.x
    const dy = projectile.targetPoint.y - projectile.position.y
    const distance = Math.hypot(dx, dy) || 1

    if (projectile.phase !== 'launch' && distance <= projectile.terminalRange) {
      projectile.phase = 'terminal'
      projectile.reacquireTimer = Math.min(projectile.reacquireTimer, MISSILE_TERMINAL_REACQUIRE)
    }

    if (projectile.phase !== 'launch' && distance <= projectile.proximityRadius + projectile.targetRadius) {
      projectile.detonated = true
    }

    if (projectile.homing > 0 && projectile.phase !== 'launch') {
      const desired = Math.atan2(dx, dy)
      const turnMultiplier = projectile.phase === 'terminal' ? MISSILE_TERMINAL_TURN_MUL : MISSILE_ACQUIRE_TURN_MUL
      const maxTurn = Math.max(0.02, projectile.homing * turnMultiplier * dt)
      projectile.heading = rotateTowardAngle(projectile.heading, desired, maxTurn)
    }
  } else if (projectile.phase === 'terminal') {
    projectile.phase = 'acquire'
  }

  let speed = projectile.baseSpeed
  if (projectile.phase === 'launch') {
    const boost = projectile.owner === 'enemy' ? MISSILE_ENEMY_LAUNCH_BOOST : MISSILE_PLAYER_LAUNCH_BOOST
    const t = 1 - Math.min(1, projectile.age / Math.max(projectile.launchDuration, 0.001))
    speed *= 1 + boost * t
  } else if (projectile.phase === 'terminal') {
    speed *= 1 + MISSILE_TERMINAL_SPEED_BOOST
  }

  setProjectileSpeed(projectile, Math.max(1, speed))
  emitMissileTrail(projectile, dt, context)
}

function moveOrbit(projectile: ProjectileEntity, dt: number, context: ProjectileUpdateContext): boolean {
  if (!projectile.anchorId) return false
  const anchor = context.getAnchor(projectile.anchorId)
  if (!anchor) return false
  projectile.orbitAngle += Math.max(0.8, Math.abs(projectile.velocity.x) || 1.4) * dt
  projectile.position.x = anchor.x + Math.cos(projectile.orbitAngle) * projectile.orbitRadius
  projectile.position.y = anchor.y + Math.sin(projectile.orbitAngle) * projectile.orbitRadius
  return true
}

function moveBeam(projectile: ProjectileEntity, _dt: number, context: ProjectileUpdateContext): boolean {
  if (!projectile.anchorId) return true
  const anchor = context.getAnchor(projectile.anchorId)
  if (!anchor) return false
  projectile.position.x = anchor.x
  projectile.position.y = anchor.y + projectile.beamLength * 0.5 + 1
  return true
}

function moveField(projectile: ProjectileEntity, _dt: number, context: ProjectileUpdateContext): void {
  if (!projectile.anchorId) return
  const anchor = context.getAnchor(projectile.anchorId)
  if (anchor) {
    projectile.position.x = anchor.x
    projectile.position.y = anchor.y
  }
}

function moveProjectile(projectile: ProjectileEntity, dt: number, context: ProjectileUpdateContext): boolean {
  switch (projectile.type) {
    case 'orbit':
      return moveOrbit(projectile, dt, context)
    case 'beam':
      return moveBeam(projectile, dt, context)
    case 'field':
      moveField(projectile, dt, context)
      return true
    default:
      if (projectile.type === 'missile') {
        updateMissile(projectile, dt, context)
        if (projectile.detonated) {
          return true
        }
      } else if (projectile.homing > 0) {
        steerHoming(projectile, dt, context)
      }
      projectile.position.x += projectile.velocity.x * dt
      projectile.position.y += projectile.velocity.y * dt
      if (projectile.waveAmplitude > 0) {
        projectile.position.x += Math.sin(projectile.age * projectile.waveFrequency) * projectile.waveAmplitude * dt * 8
      }
      return true
  }
}

function meshOpacity(config: ProjectileSpawn): number {
  if (config.type === 'field') return 0.6
  if (config.type === 'beam') return 0.85
  return config.decoy ? 0.78 : 1
}

function meshDimensions(config: ProjectileSpawn): { width: number; height: number } {
  const scale = config.scale ?? 1
  if (config.type === 'beam') {
    return {
      width: config.beamLength ?? 10,
      height: Math.max(0.35, scale * 0.5),
    }
  }
  if (config.type === 'field') {
    const width = Math.max(1.8, (config.fieldRadius ?? 2) * 2)
    return { width, height: width }
  }
  return {
    width: config.type === 'missile' ? 0.95 * scale : config.type === 'orbit' ? 0.9 * scale : 0.45 * scale,
    height: config.type === 'missile' ? 1.45 * scale : config.type === 'orbit' ? 0.9 * scale : 1.2 * scale,
  }
}

function buildMeshKey(config: ProjectileSpawn): string {
  const sprite = hasAsset(config.sprite) ? config.sprite : 'laserRed01'
  const { width, height } = meshDimensions(config)
  return [
    config.type,
    sprite,
    width.toFixed(3),
    height.toFixed(3),
    config.tint ?? '',
    meshOpacity(config).toFixed(2),
    config.decoy ? '1' : '0',
  ].join('|')
}

function disposeRenderable(object: Object3D): void {
  // Three.js sprites share a module-level quad geometry, so disposing sprite
  // geometry here breaks future missions that create new sprites.
  const disposeGeometry = !(object as { isSprite?: boolean }).isSprite
  removeAndDisposeObjectLater(object as Object3D & {
    geometry?: { dispose?(): void }
    material?: { dispose?(): void } | Array<{ dispose?(): void }>
  }, { disposeGeometry })
}

function setRenderableRotation(mesh: Object3D, rotation: number): void {
  if (!('material' in mesh)) {
    mesh.rotation.z = rotation
    return
  }

  const material = mesh.material as SpriteMaterial | MeshBasicMaterial
  if ('rotation' in material) {
    material.rotation = rotation
    mesh.rotation.z = 0
    return
  }

  mesh.rotation.z = rotation
}

export class BulletPool {
  private readonly parent: Group
  private readonly pool: ProjectileEntity[] = []
  private readonly active: ProjectileEntity[] = []
  private readonly freeList: number[] = []
  private readonly meshPool = new Map<string, Object3D[]>()
  private nextId = 1

  constructor(parent: Group) {
    this.parent = parent
  }

  spawn(config: ProjectileSpawn): ProjectileEntity {
    const velocity = cloneVec2(config.velocity ?? { x: 0, y: 0 })
    const heading = Math.atan2(velocity.x, velocity.y)
    const baseSpeed = Math.max(1, Math.hypot(velocity.x, velocity.y) || 1)
    const initialRotation = rotationFromVelocity(velocity)
    const meshPoolKey = buildMeshKey(config)
    const mesh = this.acquireMesh(config, meshPoolKey)
    const splashRadius = defaultMissileSplash(config)
    const proximityRadius = config.proximityRadius ?? defaultMissileProximity(config.radius, splashRadius)
    const poolIndex = this.freeList.pop() ?? this.pool.length

    const projectile: ProjectileEntity = {
      id: this.nextId++,
      owner: config.owner,
      weaponId: config.weaponId,
      slot: config.slot,
      type: config.type,
      position: cloneVec2(config.position),
      velocity,
      radius: config.radius,
      damage: config.damage,
      age: 0,
      maxAge: config.maxAge ?? 5,
      angle: config.angle ?? initialRotation,
      heading,
      phase: config.type === 'missile' ? 'launch' : 'acquire',
      baseSpeed,
      scale: config.scale ?? 1,
      sprite: config.sprite,
      tint: config.tint,
      piercing: config.piercing ?? 0,
      homing: config.homing ?? 0,
      waveAmplitude: config.waveAmplitude ?? 0,
      waveFrequency: config.waveFrequency ?? 0,
      origin: cloneVec2(config.position),
      orbitAngle: config.orbitAngle ?? 0,
      orbitRadius: config.orbitRadius ?? 0,
      beamLength: config.beamLength ?? 0,
      splashRadius,
      proximityRadius,
      fieldRadius: config.fieldRadius ?? 0,
      slowFactor: config.slowFactor ?? 0,
      launchDuration: config.launchDuration ?? defaultLaunchDuration(config.owner),
      terminalRange: config.terminalRange ?? defaultTerminalRange(proximityRadius, splashRadius),
      reacquireTimer: 0,
      reacquireInterval: config.reacquireInterval ?? defaultReacquireInterval(config.owner),
      targetId: undefined,
      targetPoint: null,
      targetRadius: 0,
      detonated: false,
      trailTimer: 0,
      poolIndex,
      activeIndex: this.active.length,
      meshPoolKey,
      anchorId: config.anchorId,
      trailColor: config.trailColor,
      decoy: config.decoy ?? false,
      alive: true,
      mesh,
    }

    if (mesh) {
      mesh.visible = true
      mesh.position.set(projectile.position.x, projectile.position.y, 0.2)
      this.parent.add(mesh)
    }

    this.pool[poolIndex] = projectile
    this.active.push(projectile)
    return projectile
  }

  update(delta: number, context: ProjectileUpdateContext): void {
    for (let index = 0; index < this.active.length;) {
      const projectile = this.active[index]
      if (!projectile.alive) {
        this.kill(projectile)
        continue
      }

      projectile.age += delta
      if (projectile.age > projectile.maxAge) {
        this.kill(projectile)
        continue
      }

      if (!moveProjectile(projectile, delta, context)) {
        this.kill(projectile)
        continue
      }

      if (this.isOffscreen(projectile)) {
        this.kill(projectile)
        continue
      }

      this.syncMesh(projectile, delta)
      index += 1
    }
  }

  getActive(): ProjectileEntity[] {
    return this.active.slice()
  }

  despawn(projectile: ProjectileEntity): void {
    this.kill(projectile)
  }

  clear(): void {
    while (this.active.length > 0) {
      this.kill(this.active[this.active.length - 1])
    }
  }

  dispose(): void {
    this.clear()
    for (const pooledMeshes of this.meshPool.values()) {
      for (const mesh of pooledMeshes) {
        disposeRenderable(mesh)
      }
    }
    this.meshPool.clear()
    this.pool.length = 0
    this.freeList.length = 0
  }

  private acquireMesh(config: ProjectileSpawn, meshPoolKey: string): Object3D | null {
    const reusable = this.meshPool.get(meshPoolKey)?.pop()
    if (reusable) {
      reusable.visible = true
      this.resetMeshAppearance(reusable, config)
      return reusable
    }
    return this.createMesh(config)
  }

  private createMesh(config: ProjectileSpawn): Object3D | null {
    const sprite = hasAsset(config.sprite) ? config.sprite : 'laserRed01'
    const tint = config.tint
    const { width, height } = meshDimensions(config)

    if (config.type === 'beam') {
      const mesh = loadPlane(sprite, width, height, {
        opacity: meshOpacity(config),
        color: tint,
        additive: true,
      })
      mesh.renderOrder = 3
      return mesh
    }

    const projectile = loadSprite(sprite, width, height, {
      opacity: meshOpacity(config),
      color: tint,
      additive: true,
    })
    projectile.renderOrder = config.type === 'field' ? 3 : 2
    return projectile
  }

  private resetMeshAppearance(mesh: Object3D, config: ProjectileSpawn): void {
    mesh.rotation.z = 0
    if (!('material' in mesh)) return
    const material = mesh.material as SpriteMaterial | MeshBasicMaterial
    material.opacity = meshOpacity(config)
    if ('rotation' in material) {
      material.rotation = 0
    }
  }

  private syncMesh(projectile: ProjectileEntity, delta: number): void {
    const mesh = projectile.mesh
    if (!mesh) return

    mesh.position.set(projectile.position.x, projectile.position.y, 0.2)

    if ('material' in mesh) {
      if (projectile.type === 'orbit') {
        setRenderableRotation(mesh, projectile.orbitAngle)
      } else if (projectile.type === 'beam') {
        setRenderableRotation(mesh, 0)
      } else if (projectile.type === 'missile') {
        const targetRotation = rotationFromVelocity(projectile.velocity)
        const visualDiff = wrapAngle(targetRotation - projectile.angle)
        projectile.angle = rotateTowardAngle(projectile.angle, targetRotation, delta * MISSILE_VISUAL_TURN_RATE)
        setRenderableRotation(mesh, projectile.angle + clamp(visualDiff * MISSILE_BANK_FACTOR, -MISSILE_BANK_LIMIT, MISSILE_BANK_LIMIT))
      } else {
        setRenderableRotation(mesh, rotationFromVelocity(projectile.velocity))
      }

      const opacityMaterial = mesh.material as SpriteMaterial | MeshBasicMaterial
      opacityMaterial.opacity = projectile.type === 'field'
        ? 0.42 + Math.sin(projectile.age * 4) * 0.08
        : projectile.type === 'beam'
          ? 0.75 + Math.sin(projectile.age * 24) * 0.08
          : opacityMaterial.opacity

      if (projectile.type === 'orbit' || projectile.type === 'flare') {
        const material = mesh.material as SpriteMaterial | MeshBasicMaterial
        if ('rotation' in material) {
          material.rotation += delta * 4
        } else {
          mesh.rotation.z += delta * 4
        }
      }
      if (projectile.type === 'field') {
        const material = mesh.material as SpriteMaterial | MeshBasicMaterial
        if ('rotation' in material) {
          material.rotation += delta * 0.7
        } else {
          mesh.rotation.z += delta * 0.7
        }
      }
    }
  }

  private isOffscreen(projectile: ProjectileEntity): boolean {
    if (projectile.type === 'beam' || projectile.type === 'field' || projectile.type === 'orbit') {
      return false
    }

    return (
      projectile.position.x < -ARENA.HALF_W - OFFSCREEN_MARGIN
      || projectile.position.x > ARENA.HALF_W + OFFSCREEN_MARGIN
      || projectile.position.y < -ARENA.HALF_H - OFFSCREEN_MARGIN
      || projectile.position.y > ARENA.HALF_H + OFFSCREEN_MARGIN
    )
  }

  private releaseMesh(projectile: ProjectileEntity): void {
    if (!projectile.mesh) return
    projectile.mesh.visible = false
    projectile.mesh.removeFromParent()
    const pooled = this.meshPool.get(projectile.meshPoolKey ?? '')
    if (pooled) {
      pooled.push(projectile.mesh)
    } else if (projectile.meshPoolKey) {
      this.meshPool.set(projectile.meshPoolKey, [projectile.mesh])
    } else {
      disposeRenderable(projectile.mesh)
    }
    projectile.mesh = null
  }

  private kill(projectile: ProjectileEntity): void {
    if (!projectile.alive) return
    projectile.alive = false
    this.releaseMesh(projectile)

    const activeIndex = projectile.activeIndex
    const last = this.active.pop()
    if (last && last !== projectile) {
      this.active[activeIndex] = last
      last.activeIndex = activeIndex
    }

    this.freeList.push(projectile.poolIndex)
  }
}
