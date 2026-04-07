import type { Group, Object3D } from 'three/webgpu'
import type {
  DropTable,
  MissilePhase,
  PickupType,
  ProjectileOwner,
  ProjectileType,
  Vec2,
  WeaponSlot,
} from './core'
import type { PlayerLoadout, RuntimeWeaponState } from './equipment'

export interface PlayerState {
  id: string
  position: Vec2
  velocity: Vec2
  radius: number
  hitboxRadius: number
  maxHealth: number
  health: number
  maxShield: number
  shield: number
  shieldRegenRate: number
  shieldRegenTimer: number
  maxEnergy: number
  energy: number
  energyRegen: number
  credits: number
  score: number
  combo: number
  comboTimer: number
  grazeCount: number
  shotsFired: number
  shotsHit: number
  bombs: number
  lives: number
  invincibleUntil: number
  recoil: number
  alive: boolean
  respawnQueued: boolean
  loadout: PlayerLoadout
  weapons: RuntimeWeaponState[]
  mesh: Group | null
}

export type EnemyType =
  | 'scout'
  | 'drifter'
  | 'fighter'
  | 'bomber'
  | 'interceptor'
  | 'sniper'
  | 'shielded'
  | 'spawner'
  | 'cloaker'
  | 'beam_ship'
  | 'mine_layer'
  | 'ring_blade'
  | 'turret'
  | 'organic'
  | 'heavy_cruiser'
  | 'rear_ambusher'
  | 'ufo_assault'
  | 'ufo_carrier'
  | 'ufo_beam'
  | 'ufo_shield'

export type EnemyBehaviorType =
  | 'linear'
  | 'sine'
  | 'dive'
  | 'hover'
  | 'formation'
  | 'zigzag'
  | 'circle'
  | 'cloak'
  | 'strafe'
  | 'erratic'
  | 'ambush'
  | 'carrier'
  | 'minefield'

export type SpawnDirection = 'top' | 'left' | 'right' | 'bottom' | 'sides'
export type SpawnPlacement = 'spread' | 'left' | 'right' | 'center' | 'random' | number

export interface EnemyDef {
  type: EnemyType
  name: string
  sprite: string
  altSprites?: string[]
  health: number
  speed: number
  radius: number
  score: number
  credits: number
  fireRate: number
  projectileSprite: string
  behaviorType: EnemyBehaviorType
  dropTable: DropTable
  spawnDirections: SpawnDirection[]
  shield?: number
  bulletDamage?: number
  spread?: number
  burstCount?: number
  bulletSpeed?: number
  hoverY?: number
  carrierSpawn?: EnemyType
  carrierRate?: number
  collisionDamage?: number
  splashRadius?: number
  tint?: string
}

export interface EnemyBehaviorState {
  sineBaseX: number
  formationX: number
  formationY: number
  strafeDir: number
  cloakTimer: number
  carrierTimer: number
  aimTimer: number
  ringAngle: number
  retreating: boolean
}

export interface EnemyEntity {
  id: number
  type: EnemyType
  def: EnemyDef
  position: Vec2
  velocity: Vec2
  radius: number
  health: number
  maxHealth: number
  shield: number
  maxShield: number
  fireTimer: number
  age: number
  alive: boolean
  cloaked: boolean
  slowFactor: number
  slowTimer: number
  spawnDirection: SpawnDirection
  behaviorState: EnemyBehaviorState
  mesh: Object3D | null
}

export interface MeteorDef {
  id: string
  sprite: string
  health: number
  radius: number
  speed: number
  rotationSpeed: number
  score: number
  credits: number
  drops: DropTable
  tint?: string
}

export interface MeteorEntity {
  id: number
  defId: string
  position: Vec2
  velocity: Vec2
  radius: number
  health: number
  maxHealth: number
  rotation: number
  rotationSpeed: number
  slowFactor: number
  slowTimer: number
  alive: boolean
  mesh: Object3D | null
}

export interface TerrainDef {
  id: string
  sprite: string
  health: number
  radius: number
  destructible: boolean
  dropTable?: DropTable
  isTurret?: boolean
  fireRate?: number
  firePattern?: 'aimed' | 'ring'
  projectileSprite?: string
  projectileSpeed?: number
  tint?: string
}

export interface TerrainEntity {
  id: number
  defId: string
  position: Vec2
  velocity: Vec2
  radius: number
  health: number
  maxHealth: number
  fireTimer: number
  slowFactor: number
  slowTimer: number
  alive: boolean
  mesh: Object3D | null
}

export interface ProjectileEntity {
  id: number
  owner: ProjectileOwner
  weaponId: string
  slot: WeaponSlot | 'enemy' | 'hazard'
  type: ProjectileType | 'field' | 'flare'
  position: Vec2
  velocity: Vec2
  radius: number
  damage: number
  age: number
  maxAge: number
  angle: number
  heading: number
  phase: MissilePhase
  baseSpeed: number
  scale: number
  sprite: string
  tint?: string
  piercing: number
  homing: number
  waveAmplitude: number
  waveFrequency: number
  origin: Vec2
  orbitAngle: number
  orbitRadius: number
  beamLength: number
  splashRadius: number
  proximityRadius: number
  fieldRadius: number
  slowFactor: number
  launchDuration: number
  terminalRange: number
  reacquireTimer: number
  reacquireInterval: number
  targetId?: string
  targetPoint: Vec2 | null
  targetRadius: number
  detonated: boolean
  trailTimer: number
  poolIndex: number
  activeIndex: number
  meshPoolKey?: string
  anchorId?: string
  trailColor?: string
  decoy: boolean
  alive: boolean
  mesh: Object3D | null
}

export interface PickupEntity {
  id: number
  type: PickupType
  position: Vec2
  velocity: Vec2
  radius: number
  value: number
  age: number
  sprite: string
  payload?: string
  alive: boolean
  mesh: Object3D | null
}
