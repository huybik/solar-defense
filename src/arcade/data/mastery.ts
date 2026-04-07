import type { MasteryTier, WeaponSlot } from '../types'
import { getWeaponDef } from './weapons'

export interface MasteryBonuses {
  fireRateBonus: number
  damageBonus: number
  projCountBonus: number
  ammoSaveChance: number
}

const TIERS: MasteryTier[] = [
  { kills: 25, label: 'Bronze', perk: 'minor', value: 0.05 },
  { kills: 75, label: 'Silver', perk: 'medium', value: 0.10 },
  { kills: 200, label: 'Gold', perk: 'major', value: 0.15 },
]

const SLOT_PERK: Record<WeaponSlot, keyof MasteryBonuses> = {
  front: 'fireRateBonus',
  rear: 'damageBonus',
  sidekickL: 'projCountBonus',
  sidekickR: 'projCountBonus',
  special: 'ammoSaveChance',
}

function emptyBonuses(): MasteryBonuses {
  return { fireRateBonus: 0, damageBonus: 0, projCountBonus: 0, ammoSaveChance: 0 }
}

export function getMasteryBonuses(weaponId: string, kills: number): MasteryBonuses {
  const bonuses = emptyBonuses()
  const def = getWeaponDef(weaponId)
  if (!def) return bonuses

  const perkKey = SLOT_PERK[def.slot]
  let total = 0
  for (const tier of TIERS) {
    if (kills >= tier.kills) {
      if (perkKey === 'projCountBonus') {
        total = Math.min(total + 1, 2)
      } else {
        total += tier.value
      }
    }
  }
  bonuses[perkKey] = total
  return bonuses
}

export function getMasteryTier(kills: number): MasteryTier | null {
  let best: MasteryTier | null = null
  for (const tier of TIERS) {
    if (kills >= tier.kills) best = tier
  }
  return best
}
