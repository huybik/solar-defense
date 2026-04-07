import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three/webgpu'
import type { BulletPool } from './bullets'
import { buildLoadoutStats, createDefaultLoadout } from '../progression/inventory'
import { PLAYER_CONST, ARENA, type PlayerState, type Vec2 } from '../types'
import { clamp } from '../utils'
import { createGlowSprite, loadSprite } from '../render/sprites'
import { disposeMaterialLater, removeAndDisposeObjectLater } from '../render/deferred-dispose'
import { WeaponController, type BonusWeapon, type WeaponInput, type WeaponUpdateContext, type WeaponUpdateResult } from './weapons'
import { getWeaponDef } from '../data/weapons'

export interface CombatKeys {
  [key: string]: boolean
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  fire: boolean
  special: boolean
  cycleSpecial: boolean
  bomb: boolean
  pause: boolean
}

export interface CombatInputEdges extends CombatKeys {
  fireReleased: boolean
  specialPressed: boolean
  cycleSpecialPressed: boolean
  bombPressed: boolean
  pausePressed: boolean
}

export interface PlayerUpdateContext {
  delta: number
  elapsed: number
  findEnemy(position: Vec2): Vec2 | null
}

export interface PlayerUpdateResult extends WeaponUpdateResult {
  downed: boolean
  respawned: boolean
}

export class PlayerController {
  private readonly group = new Group()
  private readonly hullSprite: Sprite
  private readonly engineGlow: Sprite
  private readonly shieldGlow: Sprite
  private readonly hitboxIndicator: Mesh
  private leftBuddy: Sprite | null = null
  private rightBuddy: Sprite | null = null
  private lastLeftBuddyWeapon: string | null = null
  private lastRightBuddyWeapon: string | null = null
  private frontAttachment: Sprite | null = null
  private rearAttachment: Sprite | null = null
  private shieldRing: Sprite | null = null
  private lastFrontWeapon: string | null = null
  private lastRearWeapon: string | null = null
  private lastShieldId: string | null = null
  private readonly weapons: WeaponController
  private elapsed = 0

  private readonly state: PlayerState

  constructor(parent: Group, playerId: string, bullets: BulletPool, loadout = null as PlayerState['loadout'] | null, mastery: Record<string, number> = {}) {
    this.weapons = new WeaponController(bullets, mastery)
    const resolvedLoadout = loadout ?? createDefaultLoadout()
    const stats = buildLoadoutStats(resolvedLoadout)

    this.hullSprite = loadSprite(stats.hull.sprite, 2, 1.6)
    this.group.add(this.hullSprite)

    this.engineGlow = createGlowSprite('#7ce7ff', 1.4, 1.6)
    this.engineGlow.position.set(0, -0.9, -0.1)
    const engineMaterial = this.engineGlow.material as SpriteMaterial
    engineMaterial.blending = AdditiveBlending
    engineMaterial.opacity = 0.5
    this.group.add(this.engineGlow)

    this.shieldGlow = createGlowSprite('#8fdfff', 2.8, 2.6)
    this.shieldGlow.visible = false
    const shieldMaterial = this.shieldGlow.material as SpriteMaterial
    shieldMaterial.blending = AdditiveBlending
    shieldMaterial.opacity = 0.42
    this.group.add(this.shieldGlow)

    this.hitboxIndicator = new Mesh(
      new RingGeometry(0.09, 0.16, 20),
      new MeshBasicMaterial({ color: new Color('#ffffff'), transparent: true, opacity: 0 }),
    )
    this.hitboxIndicator.position.z = 0.15
    this.group.add(this.hitboxIndicator)

    const start = { x: 0, y: ARENA.PLAYER_MIN_Y }
    this.group.position.set(start.x, start.y, 0)
    parent.add(this.group)

    this.state = {
      id: playerId,
      position: { ...start },
      velocity: { x: 0, y: 0 },
      radius: PLAYER_CONST.BASE_RADIUS,
      hitboxRadius: PLAYER_CONST.HITBOX_RADIUS,
      maxHealth: stats.maxHealth,
      health: stats.maxHealth,
      maxShield: stats.maxShield,
      shield: stats.maxShield,
      shieldRegenRate: stats.shieldRegenRate,
      shieldRegenTimer: 0,
      maxEnergy: stats.maxEnergy,
      energy: stats.maxEnergy,
      energyRegen: stats.energyRegen,
      credits: 0,
      score: 0,
      combo: 0,
      comboTimer: 0,
      grazeCount: 0,
      shotsFired: 0,
      shotsHit: 0,
      bombs: resolvedLoadout.specialAmmo.mega_bomb ?? PLAYER_CONST.STARTING_BOMBS,
      lives: PLAYER_CONST.STARTING_LIVES,
      invincibleUntil: 0,
      recoil: 0,
      alive: true,
      respawnQueued: false,
      loadout: resolvedLoadout,
      weapons: [],
      mesh: this.group,
    }
  }

  update(input: CombatInputEdges, context: PlayerUpdateContext): PlayerUpdateResult {
    this.elapsed = context.elapsed
    const beforeAlive = this.state.alive

    if (this.state.alive) {
      this.move(input, context.delta)
      this.recover(context.delta)
      this.applyVisuals()

      const weaponResult = this.weapons.update(context.delta, this.state, {
        fire: input.fire,
        fireJustReleased: input.fireReleased,
        specialJustPressed: input.specialPressed || input.bombPressed,
        cycleSpecialJustPressed: input.cycleSpecialPressed,
      } satisfies WeaponInput, {
        anchorId: this.state.id,
        main: { ...this.state.position },
        left: this.leftBuddyPosition(),
        right: this.rightBuddyPosition(),
        findEnemy: context.findEnemy,
      } satisfies WeaponUpdateContext)

      this.state.shotsFired += weaponResult.shotsFired
      this.state.bombs = this.state.loadout.specialAmmo.mega_bomb ?? this.state.bombs
      return { ...weaponResult, downed: false, respawned: false }
    }

    if (this.state.respawnQueued && this.state.lives > 0) {
      this.revive()
    }

    return {
      shotsFired: 0,
      usedBomb: false,
      usedSpecial: false,
      synergy: null,
      discoveredSynergy: null,
      downed: beforeAlive && !this.state.alive,
      respawned: this.state.alive,
    }
  }

  setBonusWeapons(bonuses: BonusWeapon[]): void {
    this.weapons.syncBonusWeapons(bonuses)
  }

  getState(): PlayerState {
    return this.state
  }

  getAnchorPositions(): Array<[string, Vec2]> {
    return [[this.state.id, { ...this.state.position }]]
  }

  addScore(points: number): void {
    this.state.score += points
  }

  addCredits(credits: number): void {
    this.state.credits += credits
  }

  addBombs(count: number): void {
    this.state.loadout.specialAmmo.mega_bomb = (this.state.loadout.specialAmmo.mega_bomb ?? 0) + count
    this.state.bombs = this.state.loadout.specialAmmo.mega_bomb
  }

  addHealth(amount: number): void {
    this.state.health = Math.min(this.state.maxHealth, this.state.health + amount)
  }

  addEnergy(amount: number): void {
    this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + amount)
  }

  addShield(amount: number): void {
    this.state.shield = Math.min(this.state.maxShield, this.state.shield + amount)
  }

  nudge(dx: number, dy: number): void {
    if (!this.state.alive) return
    this.state.position.x = clamp(this.state.position.x + dx, -ARENA.HALF_W + 0.4, ARENA.HALF_W - 0.4)
    this.state.position.y = clamp(this.state.position.y + dy, ARENA.PLAYER_MIN_Y, ARENA.PLAYER_MAX_Y)
    this.group.position.set(this.state.position.x, this.state.position.y - this.state.recoil * 0.08, 0)
  }

  recordHit(): void {
    this.state.shotsHit += 1
  }

  applyDamage(amount: number): boolean {
    if (!this.state.alive) return false
    if (this.elapsed < this.state.invincibleUntil) return false

    this.state.shieldRegenTimer = PLAYER_CONST.SHIELD_REGEN_DELAY
    if (this.state.shield > 0) {
      const absorbed = Math.min(this.state.shield, amount)
      this.state.shield -= absorbed
      amount -= absorbed
    }

    if (amount > 0) {
      this.state.health -= amount
    }

    if (this.state.health > 0) {
      this.state.invincibleUntil = this.elapsed + 0.8
      this.shieldGlow.visible = true
      return false
    }

    this.state.lives -= 1
    this.state.alive = false
    this.state.respawnQueued = this.state.lives > 0
    this.group.visible = false
    return true
  }

  dispose(): void {
    this.disposeSprite(this.hullSprite)
    this.disposeSprite(this.engineGlow, true)
    this.disposeSprite(this.shieldGlow, true)
    this.disposeBuddy(this.leftBuddy)
    this.disposeBuddy(this.rightBuddy)
    this.disposeAttachment(this.frontAttachment)
    this.disposeAttachment(this.rearAttachment)
    this.disposeAttachment(this.shieldRing, true)
    removeAndDisposeObjectLater(this.hitboxIndicator)
    this.group.removeFromParent()
  }

  private move(input: CombatInputEdges, delta: number): void {
    const stats = buildLoadoutStats(this.state.loadout)
    const speed = stats.speed
    let dx = 0
    let dy = 0

    if (input.left) dx -= 1
    if (input.right) dx += 1
    if (input.up) dy += 1
    if (input.down) dy -= 1

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2)
      dx *= inv
      dy *= inv
    }

    this.state.velocity.x = dx * speed
    this.state.velocity.y = dy * speed
    this.state.position.x = clamp(this.state.position.x + this.state.velocity.x * delta, -ARENA.HALF_W + 0.4, ARENA.HALF_W - 0.4)
    this.state.position.y = clamp(this.state.position.y + this.state.velocity.y * delta, ARENA.PLAYER_MIN_Y, ARENA.PLAYER_MAX_Y)
    this.group.position.set(this.state.position.x, this.state.position.y, 0)
    this.state.recoil = Math.max(0, this.state.recoil - delta * 5)
    this.group.position.y -= this.state.recoil * 0.08
  }

  private recover(delta: number): void {
    this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + this.state.energyRegen * delta)
    this.state.shieldRegenTimer = Math.max(0, this.state.shieldRegenTimer - delta)
    if (this.state.maxShield > 0 && this.state.shieldRegenTimer <= 0) {
      this.state.shield = Math.min(this.state.maxShield, this.state.shield + this.state.shieldRegenRate * delta)
    }
  }

  private applyVisuals(): void {
    this.group.visible = true
    this.hullSprite.material.rotation = 0
    this.group.rotation.z = this.state.velocity.x * -0.015
    this.engineGlow.position.y = -0.9 - Math.min(0.3, Math.hypot(this.state.velocity.x, this.state.velocity.y) * 0.01)
    ;(this.engineGlow.material as SpriteMaterial).opacity = 0.45 + Math.min(0.4, Math.hypot(this.state.velocity.x, this.state.velocity.y) * 0.01)
    ;(this.hitboxIndicator.material as MeshBasicMaterial).opacity = 0
    this.shieldGlow.visible = this.state.shield > 0 || this.elapsed < this.state.invincibleUntil
    ;(this.shieldGlow.material as SpriteMaterial).opacity = this.state.shield > 0 ? 0.22 + (this.state.shield / Math.max(1, this.state.maxShield)) * 0.18 : 0.35

    if (this.elapsed < this.state.invincibleUntil) {
      const flicker = Math.sin(this.elapsed * 18) * 0.5 + 0.5
      this.group.visible = flicker > 0.18
    }

    this.updateBuddy('sidekickL', this.leftBuddyPosition(), 'left')
    this.updateBuddy('sidekickR', this.rightBuddyPosition(), 'right')
    this.updateAttachments()
  }

  private revive(): void {
    const stats = buildLoadoutStats(this.state.loadout)
    this.state.maxHealth = stats.maxHealth
    this.state.health = stats.maxHealth
    this.state.maxShield = stats.maxShield
    this.state.shield = stats.maxShield
    this.state.maxEnergy = stats.maxEnergy
    this.state.energy = stats.maxEnergy
    this.state.energyRegen = stats.energyRegen
    this.state.alive = true
    this.state.respawnQueued = false
    this.state.invincibleUntil = this.elapsed + PLAYER_CONST.RESPAWN_INVULNERABLE
    this.state.position = { x: 0, y: ARENA.PLAYER_MIN_Y }
    this.group.position.set(0, ARENA.PLAYER_MIN_Y, 0)
    this.group.visible = true
  }

  private leftBuddyPosition(): Vec2 {
    return { x: this.state.position.x - 1.8, y: this.state.position.y - 0.1 }
  }

  private rightBuddyPosition(): Vec2 {
    return { x: this.state.position.x + 1.8, y: this.state.position.y - 0.1 }
  }

  private updateBuddy(slot: 'sidekickL' | 'sidekickR', position: Vec2, side: 'left' | 'right'): void {
    const weaponId = this.state.loadout.weapons[slot]
    const def = getWeaponDef(weaponId)

    if (side === 'left' && this.lastLeftBuddyWeapon !== weaponId) {
      this.disposeBuddy(this.leftBuddy)
      this.leftBuddy = null
      this.lastLeftBuddyWeapon = weaponId
    }
    if (side === 'right' && this.lastRightBuddyWeapon !== weaponId) {
      this.disposeBuddy(this.rightBuddy)
      this.rightBuddy = null
      this.lastRightBuddyWeapon = weaponId
    }

    const current = side === 'left' ? this.leftBuddy : this.rightBuddy

    if (!def?.sidekickSprite) {
      this.disposeBuddy(current)
      if (side === 'left') {
        this.leftBuddy = null
      } else {
        this.rightBuddy = null
      }
      return
    }

    let sprite = current
    if (!sprite) {
      sprite = loadSprite(def.sidekickSprite, 1.15, 1.15)
      sprite.material.rotation = side === 'left' ? 0.2 : -0.2
      this.group.add(sprite)
      if (side === 'left') {
        this.leftBuddy = sprite
      } else {
        this.rightBuddy = sprite
      }
    }

    sprite.visible = this.state.alive
    sprite.position.set(position.x - this.state.position.x, position.y - this.state.position.y, -0.05)
  }

  private updateAttachments(): void {
    const loadout = this.state.loadout

    // Front weapon attachment
    const frontId = loadout.weapons.front
    if (frontId !== this.lastFrontWeapon) {
      this.lastFrontWeapon = frontId
      this.disposeAttachment(this.frontAttachment)
      this.frontAttachment = null
      const def = getWeaponDef(frontId)
      if (def) {
        this.frontAttachment = loadSprite(def.projectileSprite, 0.55, 0.55, { opacity: 0.55, additive: true })
        this.frontAttachment.position.set(0, 0.85, -0.02)
        this.group.add(this.frontAttachment)
      }
    }
    if (this.frontAttachment) this.frontAttachment.visible = this.state.alive

    // Rear weapon attachment
    const rearId = loadout.weapons.rear
    if (rearId !== this.lastRearWeapon) {
      this.lastRearWeapon = rearId
      this.disposeAttachment(this.rearAttachment)
      this.rearAttachment = null
      const def = getWeaponDef(rearId)
      if (def) {
        this.rearAttachment = loadSprite(def.projectileSprite, 0.5, 0.5, { opacity: 0.45, additive: true })
        this.rearAttachment.position.set(0, -0.75, -0.02)
        this.rearAttachment.material.rotation = Math.PI
        this.group.add(this.rearAttachment)
      }
    }
    if (this.rearAttachment) this.rearAttachment.visible = this.state.alive

    // Shield ring
    const shieldId = loadout.shield
    if (shieldId !== this.lastShieldId) {
      this.lastShieldId = shieldId
      this.disposeAttachment(this.shieldRing)
      this.shieldRing = null
      if (shieldId && shieldId !== 'none') {
        this.shieldRing = createGlowSprite('#8fdfff', 3.4, 3.4)
        const mat = this.shieldRing.material as SpriteMaterial
        mat.blending = AdditiveBlending
        mat.opacity = 0.12
        this.shieldRing.position.set(0, 0, -0.08)
        this.group.add(this.shieldRing)
      }
    }
    if (this.shieldRing) {
      this.shieldRing.visible = this.state.alive && this.state.maxShield > 0
      ;(this.shieldRing.material as SpriteMaterial).opacity = 0.08 + (this.state.shield / Math.max(1, this.state.maxShield)) * 0.1
    }
  }

  private disposeAttachment(sprite: Sprite | null, disposeMap = false): void {
    if (!sprite) return
    sprite.removeFromParent()
    disposeMaterialLater(sprite.material, { disposeMap })
  }

  private disposeBuddy(sprite: Sprite | null): void {
    if (!sprite) return
    sprite.removeFromParent()
    this.disposeSprite(sprite)
  }

  private disposeSprite(sprite: Sprite, disposeMap = false): void {
    disposeMaterialLater(sprite.material, { disposeMap })
  }
}

export function createCombatKeyboardHandler(): {
  keys: CombatKeys
  poll(): CombatInputEdges
  attach(): void
  detach(): void
} {
  const keys: CombatKeys = {
    up: false,
    down: false,
    left: false,
    right: false,
    fire: false,
    special: false,
    cycleSpecial: false,
    bomb: false,
    pause: false,
  }

  const previous: CombatKeys = { ...keys }

  function map(code: string, down: boolean): void {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        keys.up = down
        break
      case 'KeyS':
      case 'ArrowDown':
        keys.down = down
        break
      case 'KeyA':
      case 'ArrowLeft':
        keys.left = down
        break
      case 'KeyD':
      case 'ArrowRight':
        keys.right = down
        break
      case 'Space':
        keys.bomb = down
        break
      case 'KeyE':
        keys.special = down
        break
      case 'KeyQ':
        keys.cycleSpecial = down
        break
      case 'KeyF':
        keys.bomb = down
        break
      case 'Escape':
        keys.pause = down
        break
    }
  }

  const onDown = (event: KeyboardEvent) => {
    map(event.code, true)
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault()
    }
  }

  const onUp = (event: KeyboardEvent) => {
    map(event.code, false)
  }

  return {
    keys,
    poll() {
      const result: CombatInputEdges = {
        ...keys,
        fire: true,
        fireReleased: previous.fire && !keys.fire,
        specialPressed: !previous.special && keys.special,
        cycleSpecialPressed: !previous.cycleSpecial && keys.cycleSpecial,
        bombPressed: !previous.bomb && keys.bomb,
        pausePressed: !previous.pause && keys.pause,
      }
      Object.assign(previous, keys)
      return result
    },
    attach() {
      window.addEventListener('keydown', onDown)
      window.addEventListener('keyup', onUp)
    },
    detach() {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      Object.keys(keys).forEach((key) => { (keys as Record<string, boolean>)[key] = false })
      Object.keys(previous).forEach((key) => { (previous as Record<string, boolean>)[key] = false })
    },
  }
}
