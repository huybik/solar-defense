import type { Group } from 'three/webgpu'
import type { PickupType, PlanetId, Vec2 } from './core'
import type { EnemyBehaviorType, EnemyType, SpawnDirection, SpawnPlacement } from './entities'

export type HazardType = 'lightning' | 'acid_rain' | 'sandstorm' | 'ice_crystals' | 'darkness'

export interface HazardCommand {
  type: HazardType
  duration: number
  intensity: number
}

export interface HazardState extends HazardCommand {
  elapsed: number
  pulse: number
}

export interface PickupSpawnCommand {
  type: PickupType
  x: SpawnPlacement
  y?: number
  value?: number
  count?: number
  id?: string
}

export interface SpawnCommand {
  enemyType: EnemyType
  count: number
  x: SpawnPlacement
  pattern?: EnemyBehaviorType
  delay?: number
  direction?: SpawnDirection
  spacing?: number
  health?: number
}

export interface TerrainCommand {
  defId: string
  count?: number
  x?: number | 'left' | 'right' | 'spread'
  spacing?: number
}

export interface MeteorCommand {
  defId: string
  count: number
  x: SpawnPlacement
  speed?: number
}

export interface RescueCommand {
  count: number
  x?: SpawnPlacement
}

export type DataLogCategory = 'story' | 'corporate' | 'alien' | 'humor' | 'secret'

export interface DataLogEntry {
  id: string
  title: string
  category: DataLogCategory
  source: string
  text: string
  hint?: string
}

export interface DataTerminal {
  id: string
  time: number
  title: string
  category: DataLogCategory
  source: string
  text: string
}

export interface SecretTrigger {
  id: string
  description: string
  targetLevelId: string
}

export interface LevelSegment {
  time: number
  spawns?: SpawnCommand[]
  terrain?: TerrainCommand[]
  meteors?: MeteorCommand[]
  hazards?: HazardCommand[]
  pickups?: PickupSpawnCommand[]
  comms?: string[]
  terminalIds?: string[]
  rescues?: RescueCommand[]
}

export interface LevelDef {
  id: string
  episode: number
  planet: PlanetId
  name: string
  briefing: string
  background: PlanetId
  duration: number
  segments: LevelSegment[]
  hasBoss: boolean
  bossId?: string
  secretTrigger?: SecretTrigger | null
  parTime: number
  isSecret?: boolean
  dataTerminalIds: string[]
}

export interface EpisodeDef {
  planet: PlanetId
  name: string
  levels: string[]
  bossId: string
  unlockCondition: string
  secretLevels?: string[]
}

export interface MasteryTier {
  kills: number
  label: string
  perk: string
  value: number
}

export type BossType = 'stationary' | 'segmented' | 'scrolling'

export interface BossPartDef {
  id: string
  sprite: string
  offset: Vec2
  health: number
  radius: number
  firePoint?: Vec2
  rotates?: boolean
}

export interface BossAttackDef {
  id: string
  label: string
  duration: number
  fireInterval: number
  bulletPattern:
    | 'ring'
    | 'spiral'
    | 'beam_sweep'
    | 'barrage'
    | 'gravity_pull'
    | 'hazard'
    | 'tentacles'
    | 'missiles'
    | 'shatter'
    | 'curtain'
  bulletCount: number
  bulletSpeed: number
  teacherHint: string
  vulnerabilityWindow?: boolean
  hazardType?: HazardType
  gapCount?: number
  layers?: number
  arms?: number
  spreadAngle?: number
  beamCount?: number
  originOffsets?: number[]
  waveAmplitude?: number
  waveFrequency?: number
  homing?: number
}

export interface BossPhaseDef {
  healthThreshold: number
  attackIds: string[]
  tint: string
  teacherHint: string
  vulnerable?: boolean
}

export interface BossConfig {
  id: string
  name: string
  planet: PlanetId
  type: BossType
  maxHealth: number
  radius: number
  accent: string
  creditReward: number
  introLine: string
  parts: BossPartDef[]
  phases: BossPhaseDef[]
  attacks: BossAttackDef[]
  rageAfter?: number
}

export interface BossPartState {
  id: string
  health: number
  maxHealth: number
  destroyed: boolean
}

export interface BossEntity {
  position: Vec2
  velocity: Vec2
  radius: number
  health: number
  maxHealth: number
  phase: number
  attackIndex: number
  phaseTimer: number
  attackTimer: number
  vulnerable: boolean
  rage: boolean
  alive: boolean
  mesh: Group | null
  parts: BossPartState[]
}

export interface BackgroundPalette {
  id: PlanetId
  tint: string
  glow: string
  far: string
  near: string
  texture: string
  scroll: [number, number, number]
}
