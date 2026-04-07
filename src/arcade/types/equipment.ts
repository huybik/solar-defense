import type { ProjectileType, WeaponSlot } from './core'

export interface WeaponLevelStats {
  fireRate: number
  damage: number
  projectileCount: number
  spread: number
  speed: number
  energyCost: number
  ammoCost: number
  scale: number
  beamLength?: number
  homing?: number
  splashRadius?: number
  orbitCount?: number
  orbitRadius?: number
  duration?: number
  burstCount?: number
}

export interface WeaponSynergy {
  rear: string
  bonus: string
}

export interface WeaponDef {
  id: string
  name: string
  slot: WeaponSlot
  description: string
  baseCost: number
  maxLevel: number
  unlockEpisode: number
  projectileType: ProjectileType
  projectileSprite: string
  levels: WeaponLevelStats[]
  recoil?: number
  chargeTime?: number
  burstInterval?: number
  pierce?: number
  waveAmplitude?: number
  waveFrequency?: number
  orbitOffset?: number
  sidekickSprite?: string
  ammoBundle?: number
  trailColor?: string
  synergy?: WeaponSynergy
  tags?: string[]
}

export interface ShipHull {
  id: string
  name: string
  sprite: string
  armor: number
  speed: number
  focusSpeed: number
  energyRegen: number
  slots: WeaponSlot[]
  cost: number
  description: string
  unlockEpisode?: number
}

export interface GeneratorDef {
  id: string
  name: string
  maxEnergy: number
  regenRate: number
  cost: number
  description: string
  unlockEpisode?: number
}

export interface ShieldDef {
  id: string
  name: string
  maxShield: number
  regenRate: number
  regenDelay: number
  cost: number
  description: string
  unlockEpisode?: number
}

export interface WingDef {
  id: string
  name: string
  speedBonus: number
  focusBonus: number
  cost: number
  description: string
  unlockEpisode?: number
}

export interface ArmorDef {
  id: string
  name: string
  healthBonus: number
  cost: number
  description: string
  unlockEpisode?: number
}

export interface PlayerLoadout {
  hull: string
  generator: string
  shield: string
  ownedHulls: string[]
  ownedGenerators: string[]
  ownedShields: string[]
  wing: string
  armor: string
  ownedWings: string[]
  ownedArmor: string[]
  weapons: Record<WeaponSlot, string | null>
  ownedWeapons: string[]
  weaponLevels: Record<string, number>
  specialAmmo: Record<string, number>
  specialInventory: string[]
  activeSpecial: string | null
  knownSynergies: string[]
}

export interface RuntimeWeaponState {
  slot: WeaponSlot
  weaponId: string | null
  cooldown: number
  charge: number
  burstRemaining: number
  burstTimer: number
  orbitAngle: number
  flash: number
}
