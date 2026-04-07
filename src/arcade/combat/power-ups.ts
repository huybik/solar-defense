import { SIDEKICK_SLOTS, type PlayerLoadout, type PlayerState, type WeaponSlot } from '../types'
import { pickRandom, randRange } from '../utils'
import { getWeaponDef, WEAPON_LIST } from '../data/weapons'

export type PartCategory = 'gun' | 'engine' | 'wing' | 'cockpit'

export interface ActivePowerUp {
  id: number
  label: string
  category: PartCategory
  type: 'trial' | 'boost' | 'stat'
  /** weapon slot (trial/boost) */
  slot?: WeaponSlot
  weaponId?: string
  originalWeaponId?: string | null
  originalLevel?: number
  /** stat key for stat-type power-ups */
  statKey?: string
  statDelta?: number
  remaining: number
  duration: number
}

export interface PowerUpDrop {
  sprite: string
  dropId: number
}

const POWERUP_DURATION = 30

export const POWERUP_DROP_CHANCE = 0.1

const GUN_SPRITES = [
  'gun00', 'gun01', 'gun02', 'gun03', 'gun04', 'gun05',
  'gun06', 'gun07', 'gun08', 'gun09', 'gun10',
]
const ENGINE_SPRITES = ['engine1', 'engine2', 'engine3', 'engine4', 'engine5']
const WING_SPRITES = [
  'wingBlue_0', 'wingBlue_1', 'wingBlue_2', 'wingBlue_3',
  'wingGreen_0', 'wingGreen_1', 'wingGreen_2', 'wingGreen_3',
  'wingRed_0', 'wingRed_1', 'wingRed_2', 'wingRed_3',
  'wingYellow_0', 'wingYellow_1', 'wingYellow_2', 'wingYellow_3',
]
const COCKPIT_SPRITES = [
  'cockpitBlue_0', 'cockpitBlue_1', 'cockpitBlue_2', 'cockpitBlue_3',
  'cockpitGreen_0', 'cockpitGreen_1', 'cockpitGreen_2', 'cockpitGreen_3',
  'cockpitRed_0', 'cockpitRed_1', 'cockpitRed_2', 'cockpitRed_3',
  'cockpitYellow_0', 'cockpitYellow_1', 'cockpitYellow_2', 'cockpitYellow_3',
]

const SPRITES_BY_CATEGORY: Record<PartCategory, string[]> = {
  gun: GUN_SPRITES,
  engine: ENGINE_SPRITES,
  wing: WING_SPRITES,
  cockpit: COCKPIT_SPRITES,
}

const GUN_SLOTS: WeaponSlot[] = ['front', 'rear']
const WING_SLOTS: WeaponSlot[] = [...SIDEKICK_SLOTS]

function slotMatchesWeapon(slot: WeaponSlot, weaponSlot: WeaponSlot): boolean {
  if (slot === 'sidekickL' || slot === 'sidekickR') {
    return weaponSlot === 'sidekickL'
  }
  return weaponSlot === slot
}

interface PendingDrop {
  category: PartCategory
  /** pre-rolled weapon pick for gun/wing trials */
  trialPick?: { slot: WeaponSlot; weaponId: string }
  /** pre-rolled weapon pick for gun/wing boosts */
  boostPick?: { slot: WeaponSlot; weaponId: string; currentLevel: number; maxLevel: number }
}

export class PowerUpManager {
  private readonly active: ActivePowerUp[] = []
  private readonly pending = new Map<number, PendingDrop>()
  private nextId = 1

  /** Pre-roll a power-up drop. Returns sprite + dropId to embed in the pickup. */
  roll(loadout: PlayerLoadout): PowerUpDrop | null {
    const available = this.availableCategories(loadout)
    if (available.length === 0) return null

    const category = pickRandom(available)
    const id = this.nextId++
    const pending: PendingDrop = { category }

    // pre-determine the specific effect for weapon categories
    if (category === 'gun' || category === 'wing') {
      const slots = category === 'gun' ? GUN_SLOTS : WING_SLOTS
      const trials = this.trialCandidates(loadout, slots)
      const boosts = this.boostCandidates(loadout, slots)
      if (trials.length > 0 && (boosts.length === 0 || Math.random() < 0.5)) {
        pending.trialPick = pickRandom(trials)
      } else if (boosts.length > 0) {
        pending.boostPick = pickRandom(boosts)
      }
    }

    this.pending.set(id, pending)
    return { sprite: pickRandom(SPRITES_BY_CATEGORY[category]), dropId: id }
  }

  /** Apply a previously rolled power-up. Returns display label. */
  apply(loadout: PlayerLoadout, playerState: PlayerState, dropId: number): string {
    const pending = this.pending.get(dropId)
    this.pending.delete(dropId)
    if (!pending) return 'POWER SURGE!'

    const duration = POWERUP_DURATION

    switch (pending.category) {
      case 'gun':
      case 'wing':
        return this.applyWeapon(loadout, pending, duration)
      case 'engine':
        return this.applyEngineStat(playerState, duration)
      case 'cockpit':
        return this.applyCockpitStat(playerState, duration)
    }
  }

  update(delta: number, loadout: PlayerLoadout, playerState: PlayerState): void {
    for (const pu of this.active) pu.remaining -= delta
    this.revertExpired(loadout, playerState)
  }

  getActive(): ActivePowerUp[] {
    return this.active
  }

  getBonusWeapons(): Array<{ slot: WeaponSlot; weaponId: string }> {
    return this.active
      .filter((pu) => pu.type === 'trial' && pu.slot != null && pu.weaponId != null)
      .map((pu) => ({ slot: pu.slot!, weaponId: pu.weaponId! }))
  }

  clear(loadout: PlayerLoadout, playerState: PlayerState): void {
    for (const pu of [...this.active]) this.revert(pu, loadout, playerState)
    this.active.length = 0
  }

  private availableCategories(loadout: PlayerLoadout): PartCategory[] {
    const cats: PartCategory[] = []
    // gun: if any front/rear trial or boost is possible
    if (this.trialCandidates(loadout, GUN_SLOTS).length > 0 || this.boostCandidates(loadout, GUN_SLOTS).length > 0) {
      cats.push('gun')
    }
    // wing: if any sidekick trial or boost is possible
    if (this.trialCandidates(loadout, WING_SLOTS).length > 0 || this.boostCandidates(loadout, WING_SLOTS).length > 0) {
      cats.push('wing')
    }
    // engine & cockpit are always available
    cats.push('engine', 'cockpit')
    return cats
  }

  private applyWeapon(loadout: PlayerLoadout, pending: PendingDrop, duration: number): string {
    if (pending.trialPick) {
      return this.applyTrial(loadout, pending.trialPick, duration, pending.category)
    }
    if (pending.boostPick) {
      return this.applyBoost(loadout, pending.boostPick, duration, pending.category)
    }
    return 'POWER SURGE!'
  }

  private applyTrial(
    loadout: PlayerLoadout,
    pick: { slot: WeaponSlot; weaponId: string },
    duration: number,
    category: PartCategory,
  ): string {
    const existing = this.active.find((p) => p.slot === pick.slot && p.type === 'trial')
    if (existing) {
      this.revert(existing, loadout, null)
      this.active.splice(this.active.indexOf(existing), 1)
    }

    const def = getWeaponDef(pick.weaponId)
    if (!def) return 'POWER SURGE!'
    const pu: ActivePowerUp = {
      id: this.nextId++,
      label: `TRIAL: ${def.name}`,
      category,
      slot: pick.slot,
      type: 'trial',
      weaponId: pick.weaponId,
      originalWeaponId: null,
      originalLevel: loadout.weaponLevels[pick.weaponId] ?? -1,
      remaining: duration,
      duration,
    }

    // Don't replace — bonus weapon fires alongside the main weapon
    if (loadout.weaponLevels[pick.weaponId] === undefined) {
      loadout.weaponLevels[pick.weaponId] = 0
    }

    this.active.push(pu)
    return pu.label
  }

  private applyBoost(
    loadout: PlayerLoadout,
    pick: { slot: WeaponSlot; weaponId: string; currentLevel: number; maxLevel: number },
    duration: number,
    category: PartCategory,
  ): string {
    const existing = this.active.find((p) => p.slot === pick.slot && p.type === 'boost')
    if (existing) {
      this.revert(existing, loadout, null)
      this.active.splice(this.active.indexOf(existing), 1)
    }

    const maxBoost = Math.min(3, pick.maxLevel - 1 - pick.currentLevel)
    if (maxBoost <= 0) return 'POWER SURGE!'

    const boost = 1 + Math.floor(Math.random() * maxBoost)
    const def = getWeaponDef(pick.weaponId)
    if (!def) return 'POWER SURGE!'
    const pu: ActivePowerUp = {
      id: this.nextId++,
      label: `${def.name} +${boost}`,
      category,
      slot: pick.slot,
      type: 'boost',
      weaponId: pick.weaponId,
      originalWeaponId: pick.weaponId,
      originalLevel: loadout.weaponLevels[pick.weaponId] ?? 0,
      remaining: duration,
      duration,
    }

    loadout.weaponLevels[pick.weaponId] = (loadout.weaponLevels[pick.weaponId] ?? 0) + boost
    this.active.push(pu)
    return pu.label
  }

  private applyEngineStat(playerState: PlayerState, duration: number): string {
    const existing = this.active.find((p) => p.category === 'engine' && p.type === 'stat')
    if (existing) {
      this.revert(existing, null, playerState)
      this.active.splice(this.active.indexOf(existing), 1)
    }

    const delta = 3 + Math.floor(Math.random() * 4) // +3 to +6 energy regen
    const pu: ActivePowerUp = {
      id: this.nextId++,
      label: `ENERGY REGEN +${delta}`,
      category: 'engine',
      type: 'stat',
      statKey: 'energyRegen',
      statDelta: delta,
      remaining: duration,
      duration,
    }

    playerState.energyRegen += delta
    this.active.push(pu)
    return pu.label
  }

  private applyCockpitStat(playerState: PlayerState, duration: number): string {
    const existing = this.active.find((p) => p.category === 'cockpit' && p.type === 'stat')
    if (existing) {
      this.revert(existing, null, playerState)
      this.active.splice(this.active.indexOf(existing), 1)
    }

    const delta = 10 + Math.floor(Math.random() * 15) // +10 to +24 shield
    const pu: ActivePowerUp = {
      id: this.nextId++,
      label: `SHIELD +${delta}`,
      category: 'cockpit',
      type: 'stat',
      statKey: 'shield',
      statDelta: delta,
      remaining: duration,
      duration,
    }

    playerState.maxShield += delta
    playerState.shield += delta
    this.active.push(pu)
    return pu.label
  }

  private trialCandidates(loadout: PlayerLoadout, slots: WeaponSlot[]): Array<{ slot: WeaponSlot; weaponId: string }> {
    const results: Array<{ slot: WeaponSlot; weaponId: string }> = []
    for (const slot of slots) {
      if (this.active.some((p) => p.slot === slot && p.type === 'trial')) continue
      for (const w of WEAPON_LIST) {
        if (!slotMatchesWeapon(slot, w.slot)) continue
        if (loadout.ownedWeapons.includes(w.id)) continue
        if (w.baseCost === 0) continue
        results.push({ slot, weaponId: w.id })
      }
    }
    return results
  }

  private boostCandidates(loadout: PlayerLoadout, slots: WeaponSlot[]): Array<{ slot: WeaponSlot; weaponId: string; currentLevel: number; maxLevel: number }> {
    const results: Array<{ slot: WeaponSlot; weaponId: string; currentLevel: number; maxLevel: number }> = []
    for (const slot of slots) {
      if (this.active.some((p) => p.slot === slot && p.type === 'boost')) continue
      const weaponId = loadout.weapons[slot]
      if (!weaponId) continue
      const def = getWeaponDef(weaponId)
      if (!def) continue
      const currentLevel = loadout.weaponLevels[weaponId] ?? 0
      if (currentLevel < def.maxLevel - 1) {
        results.push({ slot, weaponId, currentLevel, maxLevel: def.maxLevel })
      }
    }
    return results
  }

  private revertExpired(loadout: PlayerLoadout, playerState: PlayerState): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].remaining > 0) continue
      this.revert(this.active[i], loadout, playerState)
      this.active.splice(i, 1)
    }
  }

  private revert(pu: ActivePowerUp, loadout: PlayerLoadout | null, playerState: PlayerState | null): void {
    if (pu.type === 'trial' && loadout) {
      if (pu.originalLevel! < 0 && !loadout.ownedWeapons.includes(pu.weaponId!)) {
        delete loadout.weaponLevels[pu.weaponId!]
      }
    } else if (pu.type === 'boost' && loadout) {
      loadout.weaponLevels[pu.weaponId!] = pu.originalLevel!
    } else if (pu.type === 'stat' && playerState) {
      if (pu.statKey === 'energyRegen') {
        playerState.energyRegen -= pu.statDelta!
      } else if (pu.statKey === 'shield') {
        playerState.maxShield -= pu.statDelta!
        playerState.shield = Math.min(playerState.shield, playerState.maxShield)
      }
    }
  }
}
