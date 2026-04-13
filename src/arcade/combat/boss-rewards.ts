import { EPISODES } from '../data/campaign'
import { getWeaponDef } from '../data/weapons'
import type { LevelDef, PlanetId, PlayerLoadout, WeaponSlot } from '../types'
import type { ActivePowerUp } from './power-ups'

const REWARD_SLOT_PRIORITY: WeaponSlot[] = ['front', 'rear', 'sidekickL', 'sidekickR', 'special']

const FRAGMENT_SPRITES: Record<PlanetId, string> = {
  mercury: 'planet_fragment_mercury',
  venus: 'planet_fragment_venus',
  earth: 'planet_fragment_earth',
  mars: 'planet_fragment_mars',
  jupiter: 'planet_fragment_jupiter',
  saturn: 'planet_fragment_saturn',
  uranus: 'planet_fragment_uranus',
  neptune: 'planet_fragment_neptune',
  secret: 'planet_fragment_mercury',
}

export interface BossWeaponReward {
  slot: WeaponSlot
  weaponId: string
  weaponName: string
  previousLevel: number
  nextLevel: number
}

function getBaseWeaponLevel(
  loadout: PlayerLoadout,
  activePowerups: ActivePowerUp[],
  weaponId: string,
): number {
  let level = loadout.weaponLevels[weaponId] ?? 0
  for (const powerup of activePowerups) {
    if (powerup.type !== 'boost' || powerup.weaponId !== weaponId || powerup.originalLevel == null) continue
    level = Math.min(level, powerup.originalLevel)
  }
  return level
}

export function resolveBossWeaponReward(
  level: LevelDef,
  loadout: PlayerLoadout,
  activePowerups: ActivePowerUp[],
): BossWeaponReward | null {
  const seen = new Set<string>()
  const candidates = REWARD_SLOT_PRIORITY.flatMap((slot, slotIndex) => {
    const weaponId = slot === 'special'
      ? loadout.activeSpecial ?? loadout.weapons.special
      : loadout.weapons[slot]
    if (!weaponId || seen.has(weaponId)) return []
    seen.add(weaponId)

    const def = getWeaponDef(weaponId)
    if (!def) return []

    const currentLevel = getBaseWeaponLevel(loadout, activePowerups, weaponId)
    if (currentLevel >= def.maxLevel - 1) return []

    return [{
      slot,
      slotIndex,
      weaponId,
      weaponName: def.name,
      unlockEpisode: def.unlockEpisode,
      currentLevel,
      nextLevel: currentLevel + 1,
    }]
  })

  if (candidates.length === 0) return null

  const tierMatches = candidates.filter((candidate) => candidate.unlockEpisode === level.episode)
  const pool = tierMatches.length > 0 ? tierMatches : candidates
  pool.sort((left, right) =>
    left.currentLevel - right.currentLevel
    || left.slotIndex - right.slotIndex
    || left.unlockEpisode - right.unlockEpisode
    || left.weaponId.localeCompare(right.weaponId),
  )

  const picked = pool[0]
  return {
    slot: picked.slot,
    weaponId: picked.weaponId,
    weaponName: picked.weaponName,
    previousLevel: picked.currentLevel,
    nextLevel: picked.nextLevel,
  }
}

export function applyBossWeaponReward(loadout: PlayerLoadout, reward: BossWeaponReward): void {
  loadout.weaponLevels[reward.weaponId] = reward.nextLevel
}

export function isPlanetFinalBossStage(level: LevelDef): boolean {
  return Boolean(level.bossId && EPISODES[level.episode]?.bossId === level.bossId)
}

export function getPlanetFragmentSprite(planetId: PlanetId): string {
  return FRAGMENT_SPRITES[planetId]
}
