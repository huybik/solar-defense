import { cycleSpecial } from '../progression/inventory'
import type { BulletPool } from './bullets'
import type { PlayerState, RuntimeWeaponState, SidekickSlot, Vec2, WeaponDef, WeaponLevelStats, WeaponSlot } from '../types'
import { SIDEKICK_SLOTS, WEAPON_SLOTS } from '../types'
import { getWeaponDef, getWeaponLevel } from '../data/weapons'
import { getMasteryBonuses } from '../data/mastery'

export interface WeaponInput {
  fire: boolean
  fireJustReleased: boolean
  specialJustPressed: boolean
  cycleSpecialJustPressed: boolean
}

export interface WeaponUpdateContext {
  anchorId: string
  main: Vec2
  left: Vec2
  right: Vec2
  findEnemy(position: Vec2): Vec2 | null
}

export interface WeaponUpdateResult {
  shotsFired: number
  usedBomb: boolean
  usedSpecial: boolean
  synergy: string | null
  discoveredSynergy: string | null
}

function createRuntimeState(slot: WeaponSlot, weaponId: string | null): RuntimeWeaponState {
  return {
    slot,
    weaponId,
    cooldown: 0,
    charge: 0,
    burstRemaining: 0,
    burstTimer: 0,
    orbitAngle: 0,
    flash: 0,
  }
}

function fanOffsets(count: number, spread: number): number[] {
  if (count <= 1) return [0]
  const mid = (count - 1) / 2
  return Array.from({ length: count }, (_, index) => (index - mid) * spread)
}

function resolveOrigin(slot: WeaponSlot, context: WeaponUpdateContext): Vec2 {
  switch (slot) {
    case 'sidekickL':
      return context.left
    case 'sidekickR':
      return context.right
    default:
      return context.main
  }
}

function velocityFromAngle(angleFromUp: number, speed: number): Vec2 {
  return {
    x: Math.sin(angleFromUp) * speed,
    y: Math.cos(angleFromUp) * speed,
  }
}

export interface BonusWeapon {
  slot: WeaponSlot
  weaponId: string
}

export class WeaponController {
  private readonly bullets: BulletPool
  private readonly runtime: Map<WeaponSlot, RuntimeWeaponState> = new Map()
  private readonly mastery: Record<string, number>
  private currentBonuses: BonusWeapon[] = []
  private readonly bonusRuntime = new Map<string, RuntimeWeaponState>()

  constructor(bullets: BulletPool, mastery: Record<string, number> = {}) {
    this.bullets = bullets
    this.mastery = mastery
  }

  syncBonusWeapons(bonuses: BonusWeapon[]): void {
    this.currentBonuses = bonuses
    const activeKeys = new Set<string>()
    for (const bonus of bonuses) {
      const key = `${bonus.slot}:${bonus.weaponId}`
      activeKeys.add(key)
      if (!this.bonusRuntime.has(key)) {
        this.bonusRuntime.set(key, createRuntimeState(bonus.slot, bonus.weaponId))
      }
    }
    for (const key of this.bonusRuntime.keys()) {
      if (!activeKeys.has(key)) this.bonusRuntime.delete(key)
    }
  }

  private applyMastery(def: WeaponDef, level: WeaponLevelStats): WeaponLevelStats {
    const kills = this.mastery[def.id] ?? 0
    if (kills <= 0) return level
    const bonuses = getMasteryBonuses(def.id, kills)
    if (bonuses.fireRateBonus === 0 && bonuses.damageBonus === 0 && bonuses.projCountBonus === 0 && bonuses.ammoSaveChance === 0) return level
    return {
      ...level,
      fireRate: level.fireRate * (1 + bonuses.fireRateBonus),
      damage: level.damage * (1 + bonuses.damageBonus),
      projectileCount: level.projectileCount + bonuses.projCountBonus,
    }
  }

  syncLoadout(player: PlayerState): void {
    for (const slot of WEAPON_SLOTS) {
      const weaponId = slot === 'special' ? player.loadout.activeSpecial : player.loadout.weapons[slot]
      const current = this.runtime.get(slot)
      if (!current) {
        this.runtime.set(slot, createRuntimeState(slot, weaponId))
        continue
      }
      current.weaponId = weaponId
    }
  }

  update(delta: number, player: PlayerState, input: WeaponInput, context: WeaponUpdateContext): WeaponUpdateResult {
    this.syncLoadout(player)

    let shotsFired = 0
    let usedBomb = false
    let usedSpecial = false
    let discoveredSynergy: string | null = null

    const frontDef = getWeaponDef(player.loadout.weapons.front)
    const rearDef = getWeaponDef(player.loadout.weapons.rear)
    const activeSynergy = frontDef?.synergy && rearDef?.id === frontDef.synergy.rear
      ? `${frontDef.name} + ${rearDef.name}`
      : null

    if (activeSynergy && !player.loadout.knownSynergies.includes(activeSynergy)) {
      player.loadout.knownSynergies.push(activeSynergy)
      discoveredSynergy = activeSynergy
    }

    for (const runtimeState of this.runtime.values()) {
      runtimeState.cooldown = Math.max(0, runtimeState.cooldown - delta)
      runtimeState.burstTimer = Math.max(0, runtimeState.burstTimer - delta)
      runtimeState.flash = Math.max(0, runtimeState.flash - delta * 4)
    }
    for (const runtimeState of this.bonusRuntime.values()) {
      runtimeState.cooldown = Math.max(0, runtimeState.cooldown - delta)
      runtimeState.burstTimer = Math.max(0, runtimeState.burstTimer - delta)
    }

    shotsFired += this.updatePrimary(player, input, context, activeSynergy)
    shotsFired += this.updateRear(player, context, activeSynergy)
    shotsFired += this.updateSidekicks(player, context)

    // Fire bonus (trial) weapons alongside main weapons
    if (input.fire) {
      shotsFired += this.fireBonusForSlot('front', player, context.main, 0, activeSynergy)
    }
    shotsFired += this.fireBonusForSlot('rear', player, context.main, Math.PI, activeSynergy)
    for (const sidekickSlot of SIDEKICK_SLOTS) {
      shotsFired += this.fireBonusForSlot(sidekickSlot, player, resolveOrigin(sidekickSlot, context), 0, null, context.findEnemy)
    }

    if (input.cycleSpecialJustPressed) {
      cycleSpecial(player.loadout)
      this.syncLoadout(player)
    }

    {
      const specialDef = getWeaponDef(player.loadout.activeSpecial)
      const isBomb = specialDef?.tags?.includes('bomb') || specialDef?.tags?.includes('screen_clear')
      if (!isBomb || input.specialJustPressed) {
        const result = this.fireSpecial(player, context)
        shotsFired += result.shotsFired
        usedSpecial = result.usedSpecial
        usedBomb = result.usedBomb
      }
    }

    return {
      shotsFired,
      usedBomb,
      usedSpecial,
      synergy: activeSynergy,
      discoveredSynergy,
    }
  }

  private updatePrimary(player: PlayerState, input: WeaponInput, context: WeaponUpdateContext, synergy: string | null): number {
    const runtimeState = this.runtime.get('front')
    const def = getWeaponDef(player.loadout.weapons.front)
    if (!runtimeState || !def) return 0

    if (def.chargeTime) {
      if (input.fire && player.energy > 0) {
        runtimeState.charge = Math.min(def.chargeTime, runtimeState.charge + 0.016 * def.chargeTime + 0.02)
        runtimeState.flash = 1
        return 0
      }
      if (input.fireJustReleased && runtimeState.charge > 0.1 && runtimeState.cooldown <= 0) {
        const shots = this.fireCharged(def, runtimeState, player, context.main, 0, synergy)
        runtimeState.charge = 0
        return shots
      }
      return 0
    }

    if (!input.fire) return this.resolveBurst(def, runtimeState, player, context.main, 0, synergy)
    return this.fireIfReady(def, runtimeState, player, context.main, 0, synergy)
  }

  private updateRear(player: PlayerState, context: WeaponUpdateContext, synergy: string | null): number {
    const runtimeState = this.runtime.get('rear')
    const def = getWeaponDef(player.loadout.weapons.rear)
    if (!runtimeState || !def) return 0
    return this.fireIfReady(def, runtimeState, player, context.main, Math.PI, synergy, true)
      + this.resolveBurst(def, runtimeState, player, context.main, Math.PI, synergy)
  }

  private updateSidekicks(player: PlayerState, context: WeaponUpdateContext): number {
    return SIDEKICK_SLOTS.reduce((shots, slot) => shots + this.fireSidekickSlot(player, slot, context), 0)
  }

  private fireSidekickSlot(player: PlayerState, slot: SidekickSlot, context: WeaponUpdateContext): number {
    const runtimeState = this.runtime.get(slot)
    const def = getWeaponDef(player.loadout.weapons[slot])
    if (!runtimeState || !def) return 0

    const origin = resolveOrigin(slot, context)

    // Auto-aim: point toward nearest enemy, fall back to straight ahead
    let aimAngle = 0
    const target = context.findEnemy(origin)
    if (target) {
      const dx = target.x - origin.x
      const dy = target.y - origin.y
      aimAngle = Math.atan2(dx, dy) // atan2(sin, cos) matches velocityFromAngle convention
    }

    return this.fireIfReady(def, runtimeState, player, origin, aimAngle, null)
      + this.resolveBurst(def, runtimeState, player, origin, aimAngle, null)
  }

  private fireBonusForSlot(
    slot: WeaponSlot,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    synergy: string | null,
    findEnemy?: (position: Vec2) => Vec2 | null,
  ): number {
    let shots = 0
    for (const bonus of this.currentBonuses) {
      if (bonus.slot !== slot) continue
      const key = `${bonus.slot}:${bonus.weaponId}`
      const runtimeState = this.bonusRuntime.get(key)
      const def = getWeaponDef(bonus.weaponId)
      if (!runtimeState || !def) continue

      let angle = baseAngle
      if ((slot === 'sidekickL' || slot === 'sidekickR') && findEnemy) {
        const target = findEnemy(origin)
        if (target) angle = Math.atan2(target.x - origin.x, target.y - origin.y)
      }

      shots += this.fireIfReady(def, runtimeState, player, origin, angle, synergy, true)
      shots += this.resolveBurst(def, runtimeState, player, origin, angle, synergy)
    }
    return shots
  }

  private fireIfReady(
    def: WeaponDef,
    runtimeState: RuntimeWeaponState,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    synergy: string | null,
    auto = false,
  ): number {
    if (runtimeState.cooldown > 0) return 0

    const level = this.applyMastery(def, getWeaponLevel(def, player.loadout.weaponLevels[def.id] ?? 0))
    if (def.projectileType === 'beam') {
      return this.spawnBeam(def, runtimeState, player, origin, baseAngle, level, synergy)
    }

    if (def.projectileType === 'orbit') {
      return this.ensureOrbitals(def, runtimeState, player, origin)
    }

    if (!auto && level.energyCost > 0 && player.energy < level.energyCost) return 0
    if (level.energyCost > 0) {
      player.energy = Math.max(0, player.energy - level.energyCost)
    }

    runtimeState.cooldown = 1 / adjustedFireRate(def, level.fireRate, synergy)
    runtimeState.flash = 1

    if (def.tags?.includes('burst')) {
      runtimeState.burstRemaining = Math.max(0, (level.burstCount ?? 0) - 1)
      runtimeState.burstTimer = def.burstInterval ?? 0.08
    }

    return this.spawnVolley(def, runtimeState.slot, player, origin, baseAngle, level, synergy)
  }

  private resolveBurst(
    def: WeaponDef,
    runtimeState: RuntimeWeaponState,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    synergy: string | null,
  ): number {
    if (runtimeState.burstRemaining <= 0 || runtimeState.burstTimer > 0) return 0
    runtimeState.burstRemaining -= 1
    runtimeState.burstTimer = def.burstInterval ?? 0.08
    const level = this.applyMastery(def, getWeaponLevel(def, player.loadout.weaponLevels[def.id] ?? 0))
    return this.spawnVolley(def, runtimeState.slot, player, origin, baseAngle, level, synergy)
  }

  private fireCharged(
    def: WeaponDef,
    runtimeState: RuntimeWeaponState,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    synergy: string | null,
  ): number {
    const level = this.applyMastery(def, getWeaponLevel(def, player.loadout.weaponLevels[def.id] ?? 0))
    const chargeRatio = Math.min(1, runtimeState.charge / (def.chargeTime ?? 1))
    const boostedLevel = {
      ...level,
      damage: level.damage * (1 + chargeRatio * 2.2),
      projectileCount: Math.max(level.projectileCount, 1 + Math.round(chargeRatio * 3)),
      scale: level.scale * (1 + chargeRatio * 0.45),
    }
    runtimeState.cooldown = 0.35 + (1 / adjustedFireRate(def, level.fireRate, synergy))
    player.energy = Math.max(0, player.energy - level.energyCost * (0.5 + chargeRatio))
    return this.spawnVolley(def, runtimeState.slot, player, origin, baseAngle, boostedLevel, synergy)
  }

  private fireSpecial(player: PlayerState, context: WeaponUpdateContext): { shotsFired: number; usedSpecial: boolean; usedBomb: boolean } {
    const weaponId = player.loadout.activeSpecial
    const def = getWeaponDef(weaponId)
    const runtimeState = this.runtime.get('special')
    if (!def || !runtimeState) return { shotsFired: 0, usedSpecial: false, usedBomb: false }

    if (runtimeState.cooldown > 0) {
      return { shotsFired: 0, usedSpecial: false, usedBomb: false }
    }

    const level = this.applyMastery(def, getWeaponLevel(def, player.loadout.weaponLevels[def.id] ?? 0))
    runtimeState.cooldown = 0.4 + 1 / Math.max(0.8, level.fireRate || 1)

    if (def.tags?.includes('screen_clear') || def.tags?.includes('bomb')) {
      return { shotsFired: 0, usedSpecial: true, usedBomb: true }
    }

    if (def.projectileType === 'beam') {
      const shots = this.spawnBeam(def, runtimeState, player, context.main, 0, level, null)
      return { shotsFired: shots, usedSpecial: shots > 0, usedBomb: false }
    }

    if (def.tags?.includes('field') || def.tags?.includes('repulse')) {
      this.bullets.spawn({
        owner: 'player',
        weaponId: def.id,
        slot: 'special',
        type: 'field',
        position: context.main,
        radius: Math.max(1.4, (level.splashRadius || level.orbitRadius || 3) * 0.5),
        damage: level.damage,
        sprite: def.projectileSprite,
        fieldRadius: level.splashRadius || level.orbitRadius || 3,
        maxAge: level.duration || 2,
        scale: level.scale * 1.8,
        tint: def.id === 'sandstorm' ? '#d2a463' : def.id === 'repulsor' ? '#9de0ff' : '#8cf5ff',
        slowFactor: def.id === 'ice_beam' ? 0.5 : def.id === 'sandstorm' ? 0.75 : 0,
        anchorId: context.anchorId,
        decoy: false,
      })
      return { shotsFired: 1, usedSpecial: true, usedBomb: false }
    }

    const shots = this.spawnVolley(def, runtimeState.slot, player, context.main, 0, level, null)
    if (def.id === 'flare') {
      this.bullets.spawn({
        owner: 'player',
        weaponId: def.id,
        slot: 'special',
        type: 'flare',
        position: { x: context.main.x, y: context.main.y + 1.5 },
        velocity: { x: 0, y: 8 },
        radius: 1,
        damage: level.damage,
        sprite: def.projectileSprite,
        maxAge: level.duration || 2,
        scale: level.scale * 1.5,
        tint: '#ffb85a',
        splashRadius: level.splashRadius,
        anchorId: context.anchorId,
        decoy: true,
      })
    }
    return { shotsFired: shots, usedSpecial: shots > 0, usedBomb: false }
  }

  private spawnVolley(
    def: WeaponDef,
    slot: WeaponSlot,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    level: ReturnType<typeof getWeaponLevel>,
    synergy: string | null,
  ): number {
    const offsets = fanOffsets(level.projectileCount, adjustedSpread(def, level.spread))
    let fired = 0
    const damageBonus = synergy && def.id === 'protron_wave' ? 1.25 : synergy && def.id === 'sdf_main_gun' ? 1.12 : 1

    for (const offset of offsets) {
      const angle = baseAngle + offset
      const velocity = velocityFromAngle(angle, level.speed)
      const projectileType = def.projectileType
      const sprite = def.projectileSprite
      const isSideways = def.id === 'side_cannons'
      const slotAngle = isSideways ? Math.PI * 0.5 * Math.sign(offset || 1) : angle

      this.bullets.spawn({
        owner: 'player',
        weaponId: def.id,
        slot,
        type: projectileType,
        position: {
          x: origin.x + Math.sin(slotAngle) * 0.4,
          y: origin.y + Math.cos(slotAngle) * 0.6,
        },
        velocity,
        radius: projectileType === 'missile' ? 0.5 * level.scale : projectileType === 'beam' ? 0.9 : 0.32 * level.scale,
        damage: level.damage * damageBonus,
        sprite,
        maxAge: projectileType === 'missile' ? 4.8 : 3.5,
        scale: level.scale,
        piercing: def.pierce ?? 0,
        homing: level.homing || 0,
        waveAmplitude: def.waveAmplitude ?? 0,
        waveFrequency: def.waveFrequency ?? 0,
        beamLength: level.beamLength,
        splashRadius: level.splashRadius,
        tint: weaponTint(def.id),
        trailColor: def.trailColor,
        slowFactor: def.id === 'ice_beam' ? 0.5 : 0,
        anchorId: player.id,
      })
      fired += 1
    }

    if (def.id === 'companion_fighter') {
      const frontDef = getWeaponDef(player.loadout.weapons.front)
      if (frontDef) {
        const frontLevel = getWeaponLevel(frontDef, player.loadout.weaponLevels[frontDef.id] ?? 0)
        const frontOffsets = fanOffsets(Math.max(1, Math.ceil(frontLevel.projectileCount / 2)), adjustedSpread(frontDef, frontLevel.spread))
        for (const offset of frontOffsets) {
          const velocity = velocityFromAngle(offset, frontLevel.speed)
          this.bullets.spawn({
            owner: 'player',
            weaponId: def.id,
            slot,
            type: frontDef.projectileType,
            position: { x: origin.x, y: origin.y + 0.4 },
            velocity,
            radius: 0.25,
            damage: frontLevel.damage * 0.5,
            sprite: frontDef.projectileSprite,
            maxAge: 3.2,
            scale: frontLevel.scale * 0.8,
            piercing: frontDef.pierce ?? 0,
            homing: frontLevel.homing ?? 0,
            splashRadius: frontLevel.splashRadius,
            tint: '#8ef7ff',
            anchorId: player.id,
          })
          fired += 1
        }
      }
    }

    return fired
  }

  private spawnBeam(
    def: WeaponDef,
    runtimeState: RuntimeWeaponState,
    player: PlayerState,
    origin: Vec2,
    baseAngle: number,
    level: ReturnType<typeof getWeaponLevel>,
    synergy: string | null,
  ): number {
    const energyCost = level.energyCost * 0.06
    if (player.energy < energyCost) return 0
    player.energy = Math.max(0, player.energy - energyCost)
    runtimeState.cooldown = 0.08

    const widths = synergy && def.id === 'laser_beam' ? [-0.55, 0, 0.55] : [0]
    for (const xOffset of widths) {
      this.bullets.spawn({
        owner: 'player',
        weaponId: def.id,
        slot: runtimeState.slot,
        type: 'beam',
        position: { x: origin.x + xOffset, y: origin.y + (level.beamLength || 10) * 0.5 },
        radius: 0.65,
        damage: level.damage,
        sprite: def.projectileSprite,
        beamLength: level.beamLength || 10,
        maxAge: level.duration || 0.18,
        scale: level.scale,
        anchorId: player.id,
        tint: def.id === 'ice_beam' ? '#b8f6ff' : '#8ce8ff',
        slowFactor: def.id === 'ice_beam' ? 0.5 : 0,
      })
    }
    return widths.length
  }

  private ensureOrbitals(
    def: WeaponDef,
    runtimeState: RuntimeWeaponState,
    player: PlayerState,
    origin: Vec2,
  ): number {
    const level = this.applyMastery(def, getWeaponLevel(def, player.loadout.weaponLevels[def.id] ?? 0))
    const desired = Math.max(1, level.orbitCount ?? 1)
    const active = this.bullets.getActive().filter(
      (projectile) => projectile.weaponId === def.id && projectile.anchorId === player.id && projectile.type === 'orbit',
    )
    if (active.length >= desired) return 0

    const missing = desired - active.length
    for (let index = 0; index < missing; index++) {
      const orbitAngle = runtimeState.orbitAngle + ((active.length + index) / desired) * Math.PI * 2 + (def.orbitOffset ?? 0)
      this.bullets.spawn({
        owner: 'player',
        weaponId: def.id,
        slot: runtimeState.slot,
        type: 'orbit',
        position: origin,
        velocity: { x: 1.8, y: 0 },
        radius: 0.7,
        damage: level.damage,
        sprite: def.projectileSprite,
        orbitAngle,
        orbitRadius: level.orbitRadius || 1.8,
        maxAge: level.duration || 999,
        scale: level.scale,
        anchorId: player.id,
        tint: def.id === 'shield_drone' ? '#ffe98d' : '#9cefff',
      })
    }
    runtimeState.orbitAngle += 0.2
    return missing
  }
}

function adjustedFireRate(def: WeaponDef, fireRate: number, synergy: string | null): number {
  if (!synergy) return fireRate
  if (def.id === 'multi_cannon') return fireRate * 1.15
  if (def.id === 'protron_wave') return fireRate * 1.08
  return fireRate
}

function adjustedSpread(_def: WeaponDef, spread: number): number {
  return spread
}

function weaponTint(weaponId: string): string | undefined {
  if (weaponId.includes('protron')) return '#8ff2ff'
  if (weaponId.includes('plasma')) return '#74d9ff'
  if (weaponId.includes('banana')) return '#ffd45a'
  if (weaponId.includes('neutron')) return '#ffd27f'
  return undefined
}
