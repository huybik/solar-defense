import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
} from 'three/webgpu'
import { ARENA, COMBAT_CONST, type ArcadeEvent, type BossConfig, type BossEntity, type BossPartState, type HazardCommand, type Vec2 } from '../types'
import { nearest } from '../utils'
import type { BulletPool, ProjectileSpawn } from './bullets'
import { createGlowSprite, loadPlane, loadSprite } from '../render/sprites'
import { disposeMaterialLater, removeAndDisposeObjectLater } from '../render/deferred-dispose'

export interface BossUpdateResult {
  events: ArcadeEvent[]
  hazards: HazardCommand[]
}

type BossAttack = BossConfig['attacks'][number]

export class BossController {
  private readonly parent: Group
  private readonly bullets: BulletPool
  private readonly config: BossConfig
  private readonly group = new Group()
  private readonly body: Sprite
  private readonly coreGlow: Sprite
  private readonly partSprites = new Map<string, Sprite>()
  private readonly ringMesh: Mesh

  private readonly state: BossEntity
  private currentAttackIndex = 0
  private attackElapsed = 0
  private introElapsed = 0
  private invulnerableTimer = 1.25
  private hazards: HazardCommand[] = []
  private pendingEvents: ArcadeEvent[] = []
  private pullStrength = 0
  private transitioning = false

  constructor(parent: Group, bullets: BulletPool, config: BossConfig) {
    this.parent = parent
    this.bullets = bullets
    this.config = config

    this.body = loadSprite(config.parts[0]?.sprite ?? 'spaceStation_029', config.radius * 2.3, config.radius * 2.2)
    this.group.add(this.body)

    this.coreGlow = createGlowSprite(config.accent, config.radius * 2.8, config.radius * 2.8)
    this.coreGlow.material.blending = AdditiveBlending
    this.group.add(this.coreGlow)

    this.ringMesh = loadPlane('beam1', config.radius * 4.2, config.radius * 0.5, {
      color: config.accent,
      opacity: 0.24,
      additive: true,
    })
    this.ringMesh.position.z = -0.1
    this.group.add(this.ringMesh)

    const parts: BossPartState[] = config.parts.map((part) => ({
      id: part.id,
      health: part.health,
      maxHealth: part.health,
      destroyed: false,
    }))
    for (const part of config.parts.slice(1)) {
      const sprite = loadSprite(part.sprite, part.radius * 2.1, part.radius * 2.1)
      sprite.position.set(part.offset.x, part.offset.y, 0.05)
      this.partSprites.set(part.id, sprite)
      this.group.add(sprite)
    }

    const start = {
      x: config.type === 'scrolling' ? ARENA.HALF_W - 8 : 0,
      y: ARENA.HALF_H - 9,
    }
    this.group.position.set(start.x, start.y, 0)
    this.parent.add(this.group)

    this.state = {
      position: start,
      velocity: { x: 0, y: 0 },
      radius: config.radius,
      health: config.maxHealth,
      maxHealth: config.maxHealth,
      phase: 0,
      attackIndex: 0,
      phaseTimer: 0,
      attackTimer: config.attacks[0]?.fireInterval ?? 1,
      vulnerable: config.phases[0]?.vulnerable ?? false,
      rage: false,
      alive: true,
      mesh: this.group,
      parts,
    }

    this.pendingEvents.push({ type: 'boss_enter', name: config.name, bossId: config.id, introLine: config.introLine, hint: config.phases[0]?.teacherHint ?? '' })
  }

  update(delta: number, targets: Vec2[]): BossUpdateResult {
    if (!this.state.alive) return { events: [], hazards: [] }

    this.transitioning = false
    this.introElapsed += delta
    this.state.phaseTimer += delta
    this.attackElapsed += delta
    this.state.attackTimer -= delta
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta)
    this.pullStrength = 0

    const rageAt = this.config.rageAfter ?? COMBAT_CONST.BOSS_RAGE_AFTER
    if (rageAt > 0 && this.state.phaseTimer >= rageAt && !this.state.rage) {
      this.state.rage = true
      this.pendingEvents.push({ type: 'boss_phase', phase: this.state.phase, attackName: `${this.currentAttack().label} RAGE`, hint: this.config.phases[this.state.phase]?.teacherHint ?? '' })
    }

    this.updateMovement(delta)
    this.updateVisuals(delta)

    const attack = this.currentAttack()
    if (this.state.attackTimer <= 0) {
      this.fireAttack(attack, targets)
      this.state.attackTimer = Math.max(0.35, attack.fireInterval * (this.state.rage ? 0.72 : 1))
    }
    if (this.attackElapsed >= attack.duration) {
      this.advanceAttack()
    }

    this.syncParts()

    const events = [...this.pendingEvents]
    this.pendingEvents = []
    const hazards = [...this.hazards]
    this.hazards = []
    return { events, hazards }
  }

  hit(damage: number): void {
    if (!this.state.alive || this.invulnerableTimer > 0) return

    const effectiveDamage = this.state.vulnerable ? damage : damage * 0.6
    this.state.health = Math.max(0, this.state.health - effectiveDamage)

    this.updatePhase()
    this.breakPartsFromDamage()

    if (this.state.health <= 0) {
      this.state.alive = false
      this.pendingEvents.push({ type: 'boss_defeated', name: this.config.name, score: this.config.maxHealth * 10, credits: this.config.creditReward })
      this.group.visible = false
    }
  }

  getState(): BossEntity {
    return this.state
  }

  isDefeated(): boolean {
    return !this.state.alive
  }

  getPullStrength(): number {
    return this.pullStrength
  }

  dispose(): void {
    disposeMaterialLater(this.body.material)
    disposeMaterialLater(this.coreGlow.material, { disposeMap: true })
    removeAndDisposeObjectLater(this.ringMesh)
    for (const sprite of this.partSprites.values()) {
      sprite.removeFromParent()
      disposeMaterialLater(sprite.material)
    }
    this.partSprites.clear()
    this.group.removeFromParent()
  }

  private currentAttack() {
    const phase = this.config.phases[this.state.phase] ?? this.config.phases[0]
    const attackId = phase.attackIds[this.currentAttackIndex % phase.attackIds.length]
    return this.config.attacks.find((item) => item.id === attackId) ?? this.config.attacks[0]
  }

  private updateMovement(delta: number): void {
    const t = this.introElapsed
    if (this.config.type === 'scrolling') {
      this.state.position.x = ARENA.HALF_W - 8 + Math.sin(t * 0.6) * 4
      this.state.position.y = 6 + Math.sin(t * 1.4) * 10
    } else if (this.config.type === 'segmented') {
      this.state.position.x = Math.sin(t * 0.7) * 9
      this.state.position.y = ARENA.HALF_H - 10 + Math.sin(t * 1.1) * 4
    } else {
      this.state.position.x = Math.sin(t * 0.6) * 8
      this.state.position.y = ARENA.HALF_H - 9 + Math.sin(t * 1.3) * 3
    }
    this.group.position.set(this.state.position.x, this.state.position.y, 0)
    this.group.rotation.z = this.state.position.x * -0.01 * delta
  }

  private updateVisuals(delta: number): void {
    const attack = this.currentAttack()
    const ringLikeAttack = attack.bulletPattern === 'ring' || attack.bulletPattern === 'gravity_pull' || attack.bulletPattern === 'shatter'
    this.coreGlow.material.rotation += delta * 0.25
    ;(this.coreGlow.material as SpriteMaterial).opacity = 0.28 + Math.sin(this.introElapsed * 4) * 0.08 + (this.state.vulnerable ? 0.12 : 0)
    ;(this.body.material as SpriteMaterial).color = new Color(this.config.phases[this.state.phase]?.tint ?? this.config.accent)
    this.ringMesh.rotation.z += delta * (this.state.rage ? 1.8 : 1.1)
    ;(this.ringMesh.material as MeshBasicMaterial).opacity = ringLikeAttack ? 0.34 : attack.bulletPattern === 'curtain' ? 0.2 : 0.14
  }

  private fireAttack(attack: BossAttack, targets: Vec2[]): void {
    switch (attack.bulletPattern) {
      case 'ring':
        this.fireRing(attack)
        break
      case 'spiral':
        this.fireSpiral(attack)
        break
      case 'beam_sweep':
        this.fireSweep(attack)
        break
      case 'barrage':
        this.fireBarrage(attack, targets)
        break
      case 'gravity_pull':
        this.pullStrength = 8
        this.fireRing(attack)
        this.state.vulnerable = true
        this.pendingEvents.push({ type: 'boss_vulnerable', name: this.config.name })
        break
      case 'hazard':
        if (attack.hazardType) {
          this.hazards.push({ type: attack.hazardType, duration: 4, intensity: 0.9 })
        }
        this.fireBarrage(attack, targets)
        break
      case 'tentacles':
        this.fireTentacles(attack)
        break
      case 'missiles':
        this.fireMissiles(attack, targets)
        break
      case 'shatter':
        this.fireRing({ ...attack, bulletCount: attack.bulletCount + 8, bulletSpeed: attack.bulletSpeed + 2 })
        this.state.vulnerable = true
        this.pendingEvents.push({ type: 'boss_vulnerable', name: this.config.name })
        break
      case 'curtain':
        this.fireCurtain(attack)
        break
    }
  }

  private fireRing(attack: BossAttack): void {
    const layers = Math.max(1, attack.layers ?? 1)
    const gapCount = Math.max(1, attack.gapCount ?? 1)
    const gapSize = gapCount > 1 ? Math.PI / 8 : Math.PI / 5

    for (let layer = 0; layer < layers; layer++) {
      const ringCenter = this.introElapsed * 0.9 + (layer / layers) * (Math.PI / Math.max(attack.bulletCount, 8))
      const radius = this.config.radius + layer * 0.55
      const bulletSpeed = attack.bulletSpeed + layer * 0.75
      for (let index = 0; index < attack.bulletCount; index++) {
        const angle = ringCenter + (index / attack.bulletCount) * Math.PI * 2
        let inGap = false
        for (let gapIndex = 0; gapIndex < gapCount; gapIndex++) {
          let diff = angle - (ringCenter + (gapIndex / gapCount) * Math.PI * 2)
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          if (Math.abs(diff) < gapSize) {
            inGap = true
            break
          }
        }
        if (inGap) continue
        this.spawnAttackProjectile(attack, {
          position: {
            x: this.state.position.x + Math.cos(angle) * radius,
            y: this.state.position.y + Math.sin(angle) * radius,
          },
          velocity: { x: Math.cos(angle) * bulletSpeed, y: Math.sin(angle) * bulletSpeed },
          radius: 0.34,
          damage: 4,
          sprite: 'laserRed11',
          maxAge: 4,
          scale: 1,
        })
      }
    }
  }

  private fireSpiral(attack: BossAttack): void {
    const arms = Math.max(2, attack.arms ?? 3)
    const bulletsPerArm = Math.max(4, Math.floor(attack.bulletCount / arms))
    const step = attack.spreadAngle ?? 0.22
    const origins = this.attackOrigins(attack)
    for (let originIndex = 0; originIndex < origins.length; originIndex++) {
      const origin = origins[originIndex]
      const originPhase = origins.length > 1 ? (originIndex / origins.length) * Math.PI : 0
      for (let arm = 0; arm < arms; arm++) {
        const base = this.introElapsed * 1.4 + originPhase + (arm / arms) * Math.PI * 2
        for (let index = 0; index < bulletsPerArm; index++) {
          const angle = base + index * step
          this.spawnAttackProjectile(attack, {
            position: { ...origin },
            velocity: { x: Math.cos(angle) * attack.bulletSpeed, y: Math.sin(angle) * attack.bulletSpeed },
            radius: 0.3,
            damage: 4,
            sprite: 'laserRed13',
            maxAge: 4,
            scale: 0.95,
          })
        }
      }
    }
  }

  private fireSweep(attack: BossAttack): void {
    const beamCount = Math.max(1, attack.beamCount ?? 3)
    const xPositions = attack.originOffsets?.length
      ? attack.originOffsets.map((offset) => this.state.position.x + offset)
      : beamCount === 1
        ? [this.state.position.x]
        : Array.from({ length: beamCount }, (_, index) => {
            const span = Math.min(ARENA.WIDTH - 12, 8 * (beamCount - 1))
            return this.state.position.x - span / 2 + (index / (beamCount - 1)) * span
          })
    for (const x of xPositions) {
      this.spawnAttackProjectile(attack, {
        type: 'beam',
        position: { x, y: 0 },
        radius: 0.7,
        damage: 5,
        sprite: 'beam5',
        beamLength: ARENA.HEIGHT,
        maxAge: 0.55,
        scale: 1.1,
      })
    }
  }

  private fireBarrage(attack: BossAttack, targets: Vec2[]): void {
    const origins = this.attackOrigins(attack)
    const count = Math.max(1, Math.min(attack.bulletCount, 15))
    const spread = attack.spreadAngle ?? 0.18
    for (const origin of origins) {
      const target = nearest(origin, targets) ?? { x: 0, y: -ARENA.HALF_H }
      const dx = target.x - origin.x
      const dy = target.y - origin.y
      const base = Math.atan2(dx, dy)
      for (let index = 0; index < count; index++) {
        const offset = (index - (count - 1) / 2) * spread
        this.spawnAttackProjectile(attack, {
          position: { ...origin },
          velocity: { x: Math.sin(base + offset) * attack.bulletSpeed, y: Math.cos(base + offset) * attack.bulletSpeed },
          radius: 0.34,
          damage: 4,
          sprite: 'laserRed09',
          maxAge: 4.2,
          scale: 1,
        })
      }
    }
  }

  private fireTentacles(attack: BossAttack): void {
    for (const side of [-1, 1]) {
      this.spawnAttackProjectile(attack, {
        type: 'beam',
        position: { x: side * (ARENA.HALF_W - 2), y: this.state.position.y - 6 },
        radius: 0.8,
        damage: 5,
        sprite: 'beam6',
        beamLength: 18,
        maxAge: 0.45,
        scale: 1,
      })
    }
  }

  private fireMissiles(attack: BossAttack, targets: Vec2[]): void {
    if (!nearest(this.state.position, targets)) return
    const missileCount = Math.max(2, attack.bulletCount)
    const origins = this.attackOrigins(attack, this.state.position.y - 1)
    const perOrigin = Math.ceil(missileCount / origins.length)
    for (let index = 0; index < missileCount; index++) {
      const origin = origins[index % origins.length]
      const localIndex = Math.floor(index / origins.length)
      const offset = (localIndex - (perOrigin - 1) / 2) * 0.3
      this.spawnAttackProjectile(attack, {
        type: 'missile',
        position: { x: origin.x + offset * 2, y: origin.y },
        velocity: { x: offset * 2, y: -attack.bulletSpeed },
        radius: 0.44,
        damage: 5,
        sprite: 'spaceMissiles_004',
        maxAge: 4.8,
        scale: 1.1,
        homing: attack.homing ?? 0.1,
      })
    }
  }

  private fireCurtain(attack: BossAttack): void {
    const layers = Math.max(1, attack.layers ?? 1)
    const gapCount = Math.max(1, attack.gapCount ?? 1)
    const count = Math.max(8, attack.bulletCount)
    const left = -ARENA.HALF_W + 4
    const width = ARENA.WIDTH - 8
    const step = count > 1 ? width / (count - 1) : 0
    const gapHalfWidth = Math.max(step * 0.95, width / (count * 3))

    for (let layer = 0; layer < layers; layer++) {
      const drift = ((this.introElapsed * 0.16) + layer * 0.22) % 1
      const gapCenters = Array.from({ length: gapCount }, (_, gapIndex) => (
        left + ((drift + gapIndex / gapCount) % 1) * width
      ))
      for (let index = 0; index < count; index++) {
        const x = left + step * index
        if (gapCenters.some((center) => Math.abs(x - center) < gapHalfWidth)) continue
        this.spawnAttackProjectile(attack, {
          position: { x, y: ARENA.HALF_H - 1.5 - layer * 1.2 },
          velocity: { x: 0, y: -(attack.bulletSpeed + layer * 0.8) },
          radius: 0.32,
          damage: 4,
          sprite: 'laserRed13',
          maxAge: 5,
          scale: 0.95,
        })
      }
    }
  }

  private attackOrigins(attack: BossAttack, y = this.state.position.y): Vec2[] {
    const offsets = attack.originOffsets?.length ? attack.originOffsets : [0]
    return offsets.map((offset) => ({ x: this.state.position.x + offset, y }))
  }

  private spawnAttackProjectile(
    attack: BossAttack,
    config: Omit<ProjectileSpawn, 'owner' | 'weaponId' | 'slot' | 'tint' | 'waveAmplitude' | 'waveFrequency'> & {
      type?: ProjectileSpawn['type']
    },
  ): void {
    this.bullets.spawn({
      owner: 'enemy',
      weaponId: this.config.id,
      slot: 'enemy',
      tint: this.config.accent,
      waveAmplitude: attack.waveAmplitude,
      waveFrequency: attack.waveFrequency,
      ...config,
      type: config.type ?? (attack.waveAmplitude && attack.waveFrequency ? 'wave' : 'bullet'),
      homing: config.homing ?? attack.homing ?? 0,
    })
  }

  private advanceAttack(): void {
    const phase = this.config.phases[this.state.phase] ?? this.config.phases[0]
    this.currentAttackIndex = (this.currentAttackIndex + 1) % phase.attackIds.length
    this.attackElapsed = 0
    this.state.attackTimer = this.currentAttack().fireInterval
    this.state.vulnerable = this.currentAttack().vulnerabilityWindow ?? phase.vulnerable ?? false
    this.pendingEvents.push({ type: 'boss_phase', phase: this.state.phase, attackName: this.currentAttack().label, hint: (this.config.phases[this.state.phase] ?? this.config.phases[0]).teacherHint })
  }

  private updatePhase(): void {
    if (this.transitioning) return
    const ratio = this.state.health / this.state.maxHealth
    let nextPhase = this.state.phase
    for (let index = this.config.phases.length - 1; index >= 0; index--) {
      if (ratio <= this.config.phases[index].healthThreshold) {
        nextPhase = index
      }
    }
    if (nextPhase === this.state.phase) return

    this.transitioning = true
    this.state.phase = nextPhase
    this.currentAttackIndex = 0
    this.attackElapsed = 0
    this.state.phaseTimer = 0
    this.state.attackTimer = this.currentAttack().fireInterval
    this.state.vulnerable = this.config.phases[nextPhase].vulnerable ?? false
    this.invulnerableTimer = 0.9
    this.pendingEvents.push({ type: 'boss_phase', phase: nextPhase, attackName: this.currentAttack().label, hint: this.config.phases[nextPhase].teacherHint })
    if (this.state.vulnerable) {
      this.pendingEvents.push({ type: 'boss_vulnerable', name: this.config.name })
    }
  }

  private breakPartsFromDamage(): void {
    const ratio = this.state.health / this.state.maxHealth
    const destroyThresholds = [0.7, 0.4]
    destroyThresholds.forEach((threshold, index) => {
      if (ratio > threshold) return
      const state = this.state.parts[index + 1]
      if (!state || state.destroyed) return
      state.destroyed = true
      const sprite = this.partSprites.get(state.id)
      if (sprite) sprite.visible = false
    })
  }

  private syncParts(): void {
    for (const [id, sprite] of this.partSprites) {
      const state = this.state.parts.find((part) => part.id === id)
      if (!state) continue
      sprite.visible = !state.destroyed
    }
  }
}
