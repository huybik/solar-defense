import type { CampaignState, EpisodeDef } from '../types'

export const EPISODES: EpisodeDef[] = [
  { planet: 'mercury', name: 'Episode 1: Mercury', levels: ['mercury_1', 'mercury_2', 'mercury_3'], bossId: 'solar_forge', unlockCondition: 'Available at start.', secretLevels: ['abandoned_mine'] },
  { planet: 'venus', name: 'Episode 2: Venus', levels: ['venus_1', 'venus_2', 'venus_3'], bossId: 'acid_empress', unlockCondition: 'Complete Mercury.', secretLevels: ['hidden_lab'] },
  { planet: 'earth', name: 'Episode 3: Earth', levels: ['earth_1', 'earth_2', 'earth_3', 'lunar_detour'], bossId: 'orbital_sentinel', unlockCondition: 'Complete Venus.' },
  { planet: 'mars', name: 'Episode 4: Mars', levels: ['mars_1', 'mars_2', 'mars_3'], bossId: 'dust_devil', unlockCondition: 'Complete Earth.', secretLevels: ['phobos_station'] },
  { planet: 'jupiter', name: 'Episode 5: Jupiter', levels: ['jupiter_1', 'jupiter_2', 'jupiter_3', 'io_flyby'], bossId: 'storm_king', unlockCondition: 'Complete Mars.' },
  { planet: 'saturn', name: 'Episode 6: Saturn', levels: ['saturn_1', 'saturn_2', 'saturn_3'], bossId: 'ring_guardian', unlockCondition: 'Complete Jupiter.', secretLevels: ['pretzel_nebula'] },
  { planet: 'uranus', name: 'Episode 7: Uranus', levels: ['uranus_1', 'uranus_2', 'uranus_3'], bossId: 'ice_titan', unlockCondition: 'Complete Saturn.', secretLevels: ['banana_dimension'] },
  { planet: 'neptune', name: 'Episode 8: Neptune', levels: ['neptune_1', 'neptune_2', 'neptune_3', 'neptune_escape'], bossId: 'void_leviathan', unlockCondition: 'Complete Uranus.', secretLevels: ['galactic_diner'] },
]

export const MAIN_ROUTE = [
  'mercury_1',
  'mercury_2',
  'mercury_3',
  'venus_1',
  'venus_2',
  'venus_3',
  'earth_1',
  'earth_2',
  'earth_3',
  'mars_1',
  'mars_2',
  'mars_3',
  'jupiter_1',
  'jupiter_2',
  'jupiter_3',
  'saturn_1',
  'saturn_2',
  'saturn_3',
  'uranus_1',
  'uranus_2',
  'uranus_3',
  'neptune_1',
  'neptune_2',
  'neptune_3',
  'neptune_escape',
] as const

export const OPTIONAL_LEVEL_UNLOCKS = {
  lunar_detour: 'earth_2',
  io_flyby: 'jupiter_1',
} as const

export const BRANCH_RETURN_LEVELS = {
  lunar_detour: 'earth_3',
  io_flyby: 'jupiter_2',
} as const

export const SECRET_LEVEL_IDS = EPISODES.flatMap((ep) => ep.secretLevels ?? [])

export function isEpisodeUnlocked(state: CampaignState, episodeIndex: number): boolean {
  return episodeIndex <= state.currentEpisode
}

export function getEpisodeIndexForLevel(levelId: string): number {
  const index = EPISODES.findIndex((episode) => episode.levels.includes(levelId) || episode.secretLevels?.includes(levelId))
  return index >= 0 ? index : 0
}

export function getNextMainLevel(levelId: string): string | null {
  if (levelId in BRANCH_RETURN_LEVELS) {
    return BRANCH_RETURN_LEVELS[levelId as keyof typeof BRANCH_RETURN_LEVELS]
  }
  const index = MAIN_ROUTE.indexOf(levelId as (typeof MAIN_ROUTE)[number])
  if (index < 0 || index >= MAIN_ROUTE.length - 1) return null
  return MAIN_ROUTE[index + 1]
}

export function isSecretLevel(levelId: string): boolean {
  return SECRET_LEVEL_IDS.includes(levelId)
}

export function getUnlockPrerequisite(levelId: string): string | null {
  if (levelId in OPTIONAL_LEVEL_UNLOCKS) {
    return OPTIONAL_LEVEL_UNLOCKS[levelId as keyof typeof OPTIONAL_LEVEL_UNLOCKS]
  }

  const routeIndex = MAIN_ROUTE.indexOf(levelId as (typeof MAIN_ROUTE)[number])
  if (routeIndex <= 0) return null
  return MAIN_ROUTE[routeIndex - 1]
}

export function isLevelUnlocked(state: CampaignState, levelId: string): boolean {
  if (isSecretLevel(levelId)) {
    return state.secretsFound.includes(levelId)
  }

  const prerequisite = getUnlockPrerequisite(levelId)
  if (!prerequisite) return true
  return state.completedLevels.includes(prerequisite) || state.currentLevel === levelId
}
