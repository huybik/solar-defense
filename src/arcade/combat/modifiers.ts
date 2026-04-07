import { BOSS_UPGRADES } from '../data/boss-upgrades'
import type { PlayerState } from '../types'

export interface BossUpgradeModifiers {
  damageBonus: number
  bossDamage: number
  creditGain: number
  moveSpeed: number
  fireRateBonus: number
  shieldRegen: number
  maxShield: number
  pickupRadius: number
  bulletSpeed: number
  energyCost: number
  grazeRadius: number
  powerupDuration: number
  critChance: number
}

export function createBossUpgradeModifiers(upgradeIds: string[]): BossUpgradeModifiers {
  const modifiers: BossUpgradeModifiers = {
    damageBonus: 0,
    bossDamage: 0,
    creditGain: 0,
    moveSpeed: 0,
    fireRateBonus: 0,
    shieldRegen: 0,
    maxShield: 0,
    pickupRadius: 0,
    bulletSpeed: 0,
    energyCost: 0,
    grazeRadius: 0,
    powerupDuration: 0,
    critChance: 0,
  }

  for (const id of upgradeIds) {
    const upgrade = BOSS_UPGRADES[id]
    if (!upgrade) continue
    const stat = upgrade.stat as keyof BossUpgradeModifiers
    if (stat in modifiers) {
      modifiers[stat] += upgrade.value
    }
  }

  return modifiers
}

export function applyFlatBossUpgradeEffects(
  player: Pick<PlayerState, 'bombs' | 'lives' | 'energyRegen' | 'loadout'>,
  upgradeIds: string[],
): void {
  for (const id of upgradeIds) {
    const upgrade = BOSS_UPGRADES[id]
    if (!upgrade) continue
    switch (upgrade.stat) {
      case 'maxBombs':
        player.bombs += upgrade.value
        player.loadout.specialAmmo.mega_bomb = (player.loadout.specialAmmo.mega_bomb ?? 0) + upgrade.value
        break
      case 'maxLives':
        player.lives += upgrade.value
        break
      case 'energyRegen':
        player.energyRegen += upgrade.value
        break
    }
  }
}

export function applyDamageModifiers(
  baseDamage: number,
  modifiers: BossUpgradeModifiers,
  isBoss: boolean,
  random: () => number = Math.random,
): number {
  let damage = baseDamage * (1 + modifiers.damageBonus)
  if (isBoss) damage *= (1 + modifiers.bossDamage)
  if (modifiers.critChance > 0 && random() < modifiers.critChance) {
    damage *= 2
  }
  return damage
}
