import type { Difficulty, PickupType, PlanetId } from './core'

export type ArcadePhase =
  | 'title'
  | 'map'
  | 'shop'
  | 'briefing'
  | 'combat'
  | 'debrief'
  | 'data_log'
  | 'game_over'

export type ArcadeRunMode = 'campaign' | 'quickplay'
export type Medal = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum'

export interface DebriefData {
  success: boolean
  levelId: string
  levelName: string
  scoreEarned: number
  creditsEarned: number
  accuracy: number
  grazes: number
  maxCombo: number
  rescued: number
  secretsFound: number
  medal: Medal
  summary: string
}

export interface ArcadeState {
  phase: ArcadePhase
  mode: ArcadeRunMode
  difficulty: Difficulty
  saveSlot: number | null
  planetId: PlanetId
  planetName: string
  episodeName: string
  levelId: string
  levelName: string
  wave: number
  totalWaves: number
  score: number
  credits: number
  lives: number
  bombs: number
  health: number
  maxHealth: number
  shield: number
  maxShield: number
  energy: number
  maxEnergy: number
  combo: number
  grazeCount: number
  accuracy: number
  bossName: string
  bossHealth: number
  bossMaxHealth: number
  bossPhase: number
  elapsed: number
  specialName: string
  specialAmmo: number
  synergy: string | null
  knownSynergies: string[]
  discoveredSecrets: string[]
  comms: string[]
  currentTab: string
  debrief: DebriefData | null
  powerups: Array<{ label: string; remaining: number; duration: number }>
}

export type ArcadeEvent =
  | { type: 'arcade_started'; mode: ArcadeRunMode }
  | { type: 'wave_start'; wave: number; levelId: string }
  | { type: 'wave_clear'; wave: number; levelId: string }
  | { type: 'boss_enter'; name: string; bossId: string; introLine: string; hint: string }
  | { type: 'boss_phase'; phase: number; attackName: string; hint: string }
  | { type: 'boss_vulnerable'; name: string }
  | { type: 'boss_defeated'; name: string; score: number; credits: number }
  | { type: 'player_down'; playerId: string }
  | { type: 'player_respawn'; playerId: string; lives: number }
  | { type: 'pickup_collected'; pickupType: PickupType; value: number }
  | { type: 'terminal_found'; terminalId: string; title: string }
  | { type: 'secret_revealed'; secretId: string; levelId: string }
  | { type: 'synergy_discovered'; combo: string }
  | { type: 'stage_clear'; score: number; credits: number; levelId: string }
  | { type: 'stage_failed'; levelId: string }
  | { type: 'challenge_complete'; label: string }

export interface CombatResult {
  success: boolean
  ended: boolean
  events: ArcadeEvent[]
  debrief: DebriefData | null
}
