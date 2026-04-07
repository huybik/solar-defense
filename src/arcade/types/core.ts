export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type PlanetId =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'secret'

export const PLANET_IDS: PlanetId[] = [
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
]

export const PLANET_LABELS: Record<PlanetId, string> = {
  mercury: 'Mercury',
  venus: 'Venus',
  earth: 'Earth',
  mars: 'Mars',
  jupiter: 'Jupiter',
  saturn: 'Saturn',
  uranus: 'Uranus',
  neptune: 'Neptune',
  secret: 'Classified',
}

export const ARENA = {
  WIDTH: 80,
  HEIGHT: 60,
  HALF_W: 40,
  HALF_H: 30,
  PLAYER_MIN_Y: -24,
  PLAYER_MAX_Y: 18,
  SPAWN_MARGIN: 4,
} as const

export const PLAYER_CONST = {
  BASE_RADIUS: 0.8,
  HITBOX_RADIUS: 0.26,
  RESPAWN_INVULNERABLE: 2.2,
  SHIELD_REGEN_DELAY: 2.2,
  PICKUP_RADIUS: 2.35,
  GRAZE_RADIUS: 1.15,
  BOMB_RADIUS: 16,
  BOMB_DAMAGE: 24,
  STARTING_BOMBS: 3,
  STARTING_LIVES: 3,
} as const

export const COMBAT_CONST = {
  LEVEL_CLEAR_DELAY: 2.25,
  COMBO_WINDOW: 1.5,
  SECRET_FLASH_DURATION: 4,
  BOSS_RAGE_AFTER: 90,
} as const

export type Difficulty = 'easy' | 'normal' | 'hard' | 'impossible' | 'suicide'

export interface DifficultyScale {
  enemyHealthMul: number
  enemyFireRateMul: number
  creditMul: number
  enemyBulletSpeedMul: number
  enemyCountMul: number
}

export type SidekickSlot = 'sidekickL' | 'sidekickR'
export const SIDEKICK_SLOTS: SidekickSlot[] = ['sidekickL', 'sidekickR']

export type WeaponSlot = 'front' | 'rear' | SidekickSlot | 'special'
export const WEAPON_SLOTS: WeaponSlot[] = ['front', 'rear', ...SIDEKICK_SLOTS, 'special']

export type ProjectileType = 'bullet' | 'beam' | 'missile' | 'spread' | 'wave' | 'mine' | 'orbit'
export type ProjectileOwner = 'player' | 'enemy' | 'neutral'
export type MissilePhase = 'launch' | 'acquire' | 'terminal'

export type PickupType =
  | 'credits'
  | 'score'
  | 'health'
  | 'bomb'
  | 'energy'
  | 'shield'
  | 'weapon'
  | 'special'
  | 'data_cube'
  | 'pretzel'
  | 'astronaut'
  | 'powerup'

export interface DropTable {
  credits?: [number, number]
  pickups?: Array<{ type: PickupType; chance: number; value?: number }>
  dataCubeChance?: number
}
