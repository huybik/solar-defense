import type { Difficulty } from './core'
import type { PlayerLoadout } from './equipment'
import type { DebriefData } from './state'

export interface CampaignState {
  saveSlot: number
  playerName: string
  currentEpisode: number
  currentLevel: string
  credits: number
  score: number
  lives: number
  difficulty: Difficulty
  inventory: PlayerLoadout
  secretsFound: string[]
  dataLog: string[]
  completedLevels: string[]
  knownChallenges: string[]
  weaponMastery: Record<string, number>
  bossUpgrades: string[]
  lastDebrief?: DebriefData | null
}
