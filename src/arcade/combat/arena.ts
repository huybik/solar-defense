import { Group } from 'three/webgpu'
import { ArcadeAudio } from '../render/audio'
import { BackgroundController } from '../render/background'
import { BossController } from './boss'
import { BulletPool, type HomingTarget } from './bullets'
import { getBossDef } from '../data/bosses'
import { getBossUpgrade } from '../data/boss-upgrades'
import { getDifficultyScale } from '../data/difficulty'
import { getPlanetFillerTypes } from '../data/enemies'
import { EnemyManager } from './enemies'
import { getLevelDef } from '../data/levels'
import { MeteorManager } from './meteors'
import { PickupManager } from './pickups'
import { PowerUpManager, POWERUP_DROP_CHANCE, type PowerUpOwner } from './power-ups'
import {
  createCombatScoreState,
  recordShotFired,
  recordShotHit,
  registerGraze,
  registerKill,
  registerWeaponKill,
  tickCombo,
} from '../progression/scoring'
import { TerrainManager } from './terrain'
import { VFXManager } from '../render/vfx'
import {
  PlayerController,
  createMobileCombatInputHandler,
  createPrimaryCombatInputHandler,
  createSecondaryCombatInputHandler,
  isTouchDevice,
  type CombatInputHandler,
} from './player'
import {
  applyDamageModifiers,
  applyFlatBossUpgradeEffects,
  createBossUpgradeModifiers,
  type BossUpgradeModifiers,
} from './modifiers'
import {
  formatSecretUnlockMessage,
  resolveSecretFromDestroyedTarget,
  resolveSecretFromPickup,
} from './secret-rules'
import {
  createBossTriggerTime,
  createWaveMilestones,
  executeLevelSegment,
  processScheduledSpawns,
  resolveWaveAdvance,
  type ScheduledSpawn,
} from './timeline'
import { finalizeCombatResult } from './outcome'
import { Portal } from './portal'
import { applyPickupEffect } from './pickup-effects'
import { getNextMainLevel } from '../data/campaign'
import {
  ARENA,
  COMBAT_CONST,
  PLAYER_CONST,
  type ArcadeEvent,
  type BossEntity,
  type CampaignState,
  type CombatResult,
  type DebriefData,
  type EnemyEntity,
  type HazardState,
  type LevelSegment,
  type MeteorEntity,
  type PickupType,
  type ProjectileEntity,
  type TerrainEntity,
  type LevelDef,
  type Vec2,
} from '../types'
import { circleHit, type HitResult } from '../utils'

type DamageableKind = 'enemy' | 'meteor' | 'terrain'

interface DamageableTarget {
  entity: { id?: number | string; alive: boolean; position: Vec2; radius: number }
  kind: DamageableKind
  hit: (entity: any, damage: number) => HitResult
}

export interface ArenaSnapshot {
  levelId: string
  levelName: string
  planetId: LevelDef['planet']
  elapsed: number
  wave: number
  totalWaves: number
  score: number
  credits: number
  combo: number
  grazeCount: number
  accuracy: number
  player: ReturnType<PlayerController['getState']>
  players: Array<ReturnType<PlayerController['getState']>>
  boss: BossEntity | null
  synergy: string | null
  discoveredSecrets: string[]
  comms: string[]
  powerups: Array<{ playerId: string; label: string; remaining: number; duration: number }>
  coopPromptVisible: boolean
}

export class Arena {
  readonly group: Group

  private readonly background: BackgroundController
  private readonly playerBullets: BulletPool
  private readonly enemyBullets: BulletPool
  private readonly players: PlayerController[]
  private readonly inputs: CombatInputHandler[]
  private readonly enemies: EnemyManager
  private readonly meteors: MeteorManager
  private readonly terrain: TerrainManager
  private readonly pickups: PickupManager
  private readonly vfx: VFXManager
  private readonly audio: ArcadeAudio
  private readonly powerups: PowerUpManager
  private readonly scoreState
  private readonly difficulty
  private readonly level: LevelDef
  private readonly campaignStartCredits: number

  private boss: BossController | null = null
  private readonly hazards: HazardState[] = []
  private readonly scheduled: ScheduledSpawn[] = []

  private elapsed = 0
  private nextSegmentIndex = 0
  private bossTriggerTime = 0
  private bossEntered = false
  private result: CombatResult = { success: false, ended: false, events: [], debrief: null }
  private latestComms: string[] = []
  private wave = 1
  private readonly totalWaves = 3
  private waveMilestones: number[] = []
  private activeSynergy: string | null = null
  private discoveredSecrets: string[] = []
  private collectedLogs: string[] = []
  private levelDebrief: DebriefData | null = null
  private clearDelay = 0
  private fillerTimer = 0
  private readonly fillerInterval = 6
  private grazeSet = new Set<string>()
  private shieldBreakPlayed = new Set<string>()
  private secretProgress = 0
  private readonly earnedUpgrades: string[] = []
  private portal: Portal | null = null
  private readonly isFinalLevel: boolean
  private readonly ownedUpgrades: Set<string>
  private readonly modifiers: BossUpgradeModifiers
  private _cachedTargets: DamageableTarget[] = []
  private _cachedPlayerHomingTargets: HomingTarget[] = []
  private _cachedEnemyHomingTargets: HomingTarget[] = []
  private _cachedPlayerProjectiles: ProjectileEntity[] = []
  private _cachedEnemyProjectiles: ProjectileEntity[] = []
  private _cachedEnemies: EnemyEntity[] = []
  private _cachedMeteors: MeteorEntity[] = []
  private _cachedTerrain: TerrainEntity[] = []

  constructor(parent: Group, campaign: CampaignState, levelId: string) {
    this.level = getLevelDef(levelId)
    this.group = new Group()
    parent.add(this.group)

    this.difficulty = getDifficultyScale(campaign.difficulty)
    this.campaignStartCredits = campaign.credits
    this.scoreState = createCombatScoreState(0, 0)

    this.background = new BackgroundController(this.level.background)
    this.group.add(this.background.group)

    this.ownedUpgrades = new Set(campaign.bossUpgrades ?? [])
    this.modifiers = createBossUpgradeModifiers(campaign.bossUpgrades ?? [])

    this.playerBullets = new BulletPool(this.group)
    this.enemyBullets = new BulletPool(this.group)
    this.players = [
      new PlayerController(
        this.group,
        'player_0',
        this.playerBullets,
        JSON.parse(JSON.stringify(campaign.inventory)),
        campaign.weaponMastery ?? {},
        {
          spawnPosition: { x: -7, y: ARENA.PLAYER_MIN_Y + 1.2 },
          engineColor: '#7ce7ff',
          shieldColor: '#8fdfff',
          hitboxColor: '#e8fbff',
        },
      ),
      new PlayerController(
        this.group,
        'player_1',
        this.playerBullets,
        JSON.parse(JSON.stringify(campaign.inventory)),
        campaign.weaponMastery ?? {},
        {
          enabled: false,
          spawnPosition: { x: 7, y: ARENA.PLAYER_MIN_Y + 1.2 },
          hullColor: '#ffe3b0',
          engineColor: '#ffb86c',
          shieldColor: '#ffd998',
          hitboxColor: '#ffeabf',
        },
      ),
    ]
    this.inputs = isTouchDevice()
      ? [createMobileCombatInputHandler(), createSecondaryCombatInputHandler()]
      : [createPrimaryCombatInputHandler(), createSecondaryCombatInputHandler()]
    for (const player of this.players) {
      applyFlatBossUpgradeEffects(player.getState(), campaign.bossUpgrades ?? [])
    }
    this.enemies = new EnemyManager(this.group, this.enemyBullets, this.level.planet)
    this.enemies.setDifficulty(this.difficulty)
    this.enemies.setProgressionHealth(this.enemyHealthProgression())
    this.meteors = new MeteorManager(this.group)
    this.terrain = new TerrainManager(this.group, this.enemyBullets)
    this.pickups = new PickupManager(this.group)
    this.powerups = new PowerUpManager()
    this.vfx = new VFXManager(this.group)
    this.audio = new ArcadeAudio()

    for (const input of this.inputs) input.attach()
    this.audio.ui()

    this.isFinalLevel = getNextMainLevel(levelId) === null
    this.bossTriggerTime = createBossTriggerTime(this.level)
    this.waveMilestones = createWaveMilestones(this.bossTriggerTime)

    this.result.events.push({ type: 'wave_start', wave: 1, levelId: this.level.id })
  }

  update(delta: number): ArcadeEvent[] {
    if (this.result.ended) return []

    const inputs = this.inputs.map((input) => input.poll())
    this.elapsed += delta
    const events: ArcadeEvent[] = [...this.result.events]
    this.result.events = []
    let secondaryJoined = false

    const secondaryPlayer = this.players[1]
    if (secondaryPlayer && !secondaryPlayer.isActive() && this.clearDelay <= 0 && inputs[1]?.joinPressed) {
      secondaryPlayer.activate(this.elapsed)
      this.latestComms = ['CO-OP PILOT ONLINE. PILOT TWO DEPLOYED.']
      this.audio.ui()
      secondaryJoined = true
    }

    const sanitizedInputs = inputs.map((input, index) => {
      if (!(secondaryJoined && index === 1)) return input
      return {
        ...input,
        specialPressed: false,
        cycleSpecialPressed: false,
        bombPressed: false,
        joinPressed: false,
      }
    })

    this.cacheDamageableTargets()

    const comboLost = tickCombo(this.scoreState, delta)
    if (comboLost) {
      this.latestComms = ['COMBO LOST']
    }

    this.processSegments()
    this.processScheduled()
    this.processFillerSpawns(delta)
    this.updateWaves(events)

    const activeSynergies: string[] = []
    let usedSpecial = false
    this.players.forEach((player, index) => {
      const playerUpdate = player.update(sanitizedInputs[index], {
        delta,
        elapsed: this.elapsed,
        findEnemy: (position) => this.findCachedTarget(this._cachedPlayerHomingTargets, position)?.position ?? null,
      })
      if (playerUpdate.shotsFired > 0) {
        recordShotFired(this.scoreState, playerUpdate.shotsFired)
      }
      if (playerUpdate.synergy) {
        activeSynergies.push(`P${index + 1} ${playerUpdate.synergy}`)
      }
      if (playerUpdate.discoveredSynergy) {
        const combo = `P${index + 1} ${playerUpdate.discoveredSynergy}`
        this.latestComms = [`SYNERGY DISCOVERED: ${combo}`]
        events.push({ type: 'synergy_discovered', combo })
        this.audio.combo()
      }
      if (playerUpdate.usedBomb) {
        this.handleBomb(player, events)
      }
      if (playerUpdate.usedSpecial) {
        usedSpecial = true
      }
      if (playerUpdate.respawned) {
        const state = player.getState()
        events.push({ type: 'player_respawn', playerId: state.id, lives: state.lives })
      }
    })
    this.activeSynergy = activeSynergies.length > 0 ? activeSynergies.join(' | ') : null
    if (usedSpecial) this.audio.missile()

    const powerUpOwners = this.getPowerUpOwners()
    this.powerups.update(delta, powerUpOwners)
    for (const player of this.players) {
      player.setBonusWeapons(player.isActive() ? this.powerups.getBonusWeapons(player.getState().id) : [])
    }

    this.updateHazards(delta)
    this.applyBossPull(delta)
    this._cachedPlayerProjectiles = this.playerBullets.getActive()
    this.cacheEnemyHomingTargets(this._cachedPlayerProjectiles)
    const enemyTargets = this._cachedEnemyHomingTargets.map((target) => target.position)
    this.enemies.update({ delta, targets: enemyTargets })
    this.meteors.update(delta)
    this.terrain.update({ delta })
    this.cacheDamageableTargets()
    this.pickups.update(delta, this.getPickupMagnets())
    this.playerBullets.update(delta, {
      findTarget: (position, preferredId) => this.findCachedTarget(this._cachedPlayerHomingTargets, position, preferredId),
      getAnchor: (anchorId) => this.resolveAnchor(anchorId),
      emitTrail: (x, y, color, phase) => this.vfx.missileTrail(x, y, color, phase),
    })
    this.enemyBullets.update(delta, {
      findTarget: (position, preferredId) => this.findCachedTarget(this._cachedEnemyHomingTargets, position, preferredId),
      getAnchor: (anchorId) => this.resolveAnchor(anchorId),
      emitTrail: (x, y, color, phase) => this.vfx.missileTrail(x, y, color, phase),
    })

    if (this.level.hasBoss && !this.bossEntered && this.elapsed >= this.bossTriggerTime) {
      this.enterBoss()
    }
    if (this.boss) {
      const bossUpdate = this.boss.update(delta, enemyTargets)
      for (const event of bossUpdate.events) {
        this.handleBossEvent(event)
      }
      events.push(...bossUpdate.events)
      for (const hazard of bossUpdate.hazards) {
        this.hazards.push({ ...hazard, elapsed: 0, pulse: 0 })
      }
    }

    this._cachedPlayerProjectiles = this.playerBullets.getActive()
    this._cachedEnemyProjectiles = this.enemyBullets.getActive()
    this.handleCollisions(events)

    this.vfx.setHazardTint(this.hazards.length > 0 ? 0.7 : 0)
    this.vfx.update(delta)
    this.background.update(delta, this.vfx.getHazardTint())
    this.group.position.set(this.vfx.getShakeOffset().x, this.vfx.getShakeOffset().y, 0)

    if (this.boss && this.boss.isDefeated()) {
      if (this.isFinalLevel && !this.portal) {
        this.spawnPortal()
      }
      if (!this.portal) this.beginClear(true)
    } else if (!this.level.hasBoss && this.elapsed >= this.level.duration && this.enemies.getActive().length === 0) {
      this.beginClear(true)
    }

    if (this.portal) {
      this.portal.update(delta)
      if (this.players.some((player) => {
        const state = player.getState()
        return state.alive && this.portal?.checkCollision(state.position)
      })) {
        events.push({ type: 'portal_entered' })
        this.portal.dispose()
        this.portal = null
        this.beginClear(true)
      }
    }

    if (this.players.every((player) => {
      const state = player.getState()
      return !state.alive && state.lives <= 0
    })) {
      this.beginClear(false)
    }

    if (this.clearDelay > 0) {
      this.clearDelay -= delta
      if (this.clearDelay <= 0) {
        this.finish(events)
      }
    }

    return events
  }

  getSnapshot(): ArenaSnapshot {
    const players = this.players
      .filter((player) => player.isActive())
      .map((player) => player.getState())
    const accuracy = this.scoreState.shotsFired > 0
      ? (this.scoreState.shotsHit / this.scoreState.shotsFired) * 100
      : 100
    return {
      levelId: this.level.id,
      levelName: this.level.name,
      planetId: this.level.planet,
      elapsed: this.elapsed,
      wave: this.wave,
      totalWaves: this.totalWaves,
      score: this.scoreState.score,
      credits: this.campaignStartCredits + this.scoreState.credits,
      combo: this.scoreState.combo,
      grazeCount: this.scoreState.grazeCount,
      accuracy,
      player: players[0],
      players,
      boss: this.boss?.getState() ?? null,
      synergy: this.activeSynergy,
      discoveredSecrets: this.discoveredSecrets,
      comms: this.latestComms,
      powerups: this.powerups.getActive().map((pu) => ({
        playerId: pu.ownerId,
        label: pu.label,
        remaining: pu.remaining,
        duration: pu.duration,
      })),
      coopPromptVisible: !this.players[1]?.isActive() && this.clearDelay <= 0,
    }
  }

  setViewportBounds(visibleHalfWidth: number): void {
    for (const player of this.players) {
      player.setMoveBounds(visibleHalfWidth)
    }
    this.enemies.setViewportBounds(visibleHalfWidth)
  }

  isDone(): boolean {
    return this.result.ended
  }

  wasSuccessful(): boolean {
    return this.result.success
  }

  getDebrief(): DebriefData | null {
    return this.levelDebrief
  }

  getResultLoadout(): CampaignState['inventory'] {
    return this.players[0].getState().loadout
  }

  getCollectedLogs(): string[] {
    return this.collectedLogs
  }

  getSecretFinds(): string[] {
    return this.discoveredSecrets
  }

  getWeaponKills(): Record<string, number> {
    return this.scoreState.weaponKills
  }

  getEarnedUpgrades(): string[] {
    return this.earnedUpgrades
  }

  activateAudio(): void {
    this.audio.activate()
  }

  forceFinish(success: boolean): ArcadeEvent[] {
    if (this.result.ended) return []

    this.result.success = success
    const finalized = this.finalizeCombat(this.result.success)
    this.result = finalized.result
    this.levelDebrief = finalized.debrief
    return finalized.events
  }

  dispose(): void {
    for (const input of this.inputs) input.detach()
    this.background.dispose()
    for (const player of this.players) player.dispose()
    this.enemies.dispose()
    this.meteors.dispose()
    this.terrain.dispose()
    this.pickups.dispose()
    this.boss?.dispose()
    this.portal?.dispose()
    this.playerBullets.dispose()
    this.enemyBullets.dispose()
    this.vfx.dispose()
    this.audio.dispose()
    this.group.removeFromParent()
  }

  private cacheDamageableTargets(): void {
    this._cachedEnemies = this.enemies.getActive()
    this._cachedMeteors = this.meteors.getActive()
    this._cachedTerrain = this.terrain.getActive()
    this._cachedTargets.length = 0
    this._cachedPlayerHomingTargets.length = 0

    this.cacheDamageableEntities(this._cachedEnemies, 'enemy', (entity, damage) => this.enemies.hit(entity, damage))
    this.cacheDamageableEntities(this._cachedMeteors, 'meteor', (entity, damage) => this.meteors.hit(entity, damage))
    this.cacheDamageableEntities(this._cachedTerrain, 'terrain', (entity, damage) => this.terrain.hit(entity, damage))
    if (this.boss && !this.boss.isDefeated()) {
      const boss = this.boss.getState()
      this._cachedPlayerHomingTargets.push({ id: `boss:${this.level.bossId ?? 'core'}`, position: boss.position, radius: boss.radius })
    }
  }

  private cacheDamageableEntities(
    entities: DamageableTarget['entity'][],
    kind: DamageableKind,
    hit: DamageableTarget['hit'],
  ): void {
    for (const entity of entities) {
      this._cachedTargets.push({ entity, kind, hit })
      this._cachedPlayerHomingTargets.push({
        id: `${kind}:${entity.id}`,
        position: entity.position,
        radius: entity.radius,
      })
    }
  }

  private cacheEnemyHomingTargets(playerProjectiles: ProjectileEntity[]): void {
    this._cachedEnemyHomingTargets.length = 0
    for (const projectile of playerProjectiles) {
      if (!projectile.alive || !projectile.decoy) continue
      this._cachedEnemyHomingTargets.push({
        id: `decoy:${projectile.id}`,
        position: projectile.position,
        radius: Math.max(projectile.radius, projectile.proximityRadius || 0.8),
      })
    }
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      this._cachedEnemyHomingTargets.push({
        id: `player:${state.id}`,
        position: state.position,
        radius: state.radius,
      })
    }
  }

  private findCachedTarget(targets: HomingTarget[], position: Vec2, preferredId?: string): HomingTarget | null {
    if (targets.length === 0) return null

    if (preferredId) {
      for (const target of targets) {
        if (target.id === preferredId) return target
      }
    }

    let best = targets[0]
    let bestDistance = (best.position.x - position.x) ** 2 + (best.position.y - position.y) ** 2
    for (let index = 1; index < targets.length; index++) {
      const candidate = targets[index]
      const distance = (candidate.position.x - position.x) ** 2 + (candidate.position.y - position.y) ** 2
      if (distance < bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
    return best
  }

  private processSegments(): void {
    while (this.nextSegmentIndex < this.level.segments.length && this.level.segments[this.nextSegmentIndex].time <= this.elapsed) {
      const segment = this.level.segments[this.nextSegmentIndex]
      this.executeSegment(segment)
      this.nextSegmentIndex += 1
    }
  }

  private executeSegment(segment: LevelSegment): void {
    const context = {
      elapsed: this.elapsed,
      scheduled: this.scheduled,
      hazards: this.hazards,
      latestComms: this.latestComms,
      spawnEnemy: (command: NonNullable<LevelSegment['spawns']>[number]) => this.enemies.spawn(command),
      spawnMeteor: (command: NonNullable<LevelSegment['meteors']>[number]) => this.meteors.spawn(command),
      spawnTerrain: (command: NonNullable<LevelSegment['terrain']>[number]) => this.terrain.spawn(command),
      spawnPickup: (type: PickupType, position: Vec2, id?: string, value?: number) => {
        this.pickups.spawn(type, position, id, value)
      },
    }
    executeLevelSegment(segment, context)
    this.latestComms = context.latestComms
  }

  private processScheduled(): void {
    processScheduledSpawns(this.scheduled, this.elapsed)
  }

  private processFillerSpawns(delta: number): void {
    if (this.bossEntered || this.clearDelay > 0) return
    this.fillerTimer -= delta
    if (this.fillerTimer > 0) return
    this.fillerTimer = this.fillerInterval

    const types = getPlanetFillerTypes(this.level.planet)
    const type = types[Math.floor(Math.random() * types.length)]
    const count = Math.max(2, Math.round((2 + Math.random() * 3) * this.difficulty.enemyCountMul))
    const directions: Array<'top' | 'left' | 'right'> = ['top', 'left', 'right']
    const direction = directions[Math.floor(Math.random() * directions.length)]
    this.enemies.spawn({ enemyType: type, count, x: 'random', direction })
  }

  private updateWaves(events: ArcadeEvent[]): void {
    const waveUpdate = resolveWaveAdvance({
      elapsed: this.elapsed,
      waveMilestones: this.waveMilestones,
      currentWave: this.wave,
      totalWaves: this.totalWaves,
      levelId: this.level.id,
    })
    if (waveUpdate.nextWave > this.wave) {
      this.wave = waveUpdate.nextWave
      this.enemies.setProgressionHealth(this.enemyHealthProgression())
      this.grazeSet.clear()
      events.push(...waveUpdate.events)
      this.audio.combo()
    }
  }

  private updateHazards(delta: number): void {
    for (let index = this.hazards.length - 1; index >= 0; index--) {
      const hazard = this.hazards[index]
      hazard.elapsed += delta
      hazard.pulse = Math.sin(hazard.elapsed * 6)

      if (hazard.type === 'acid_rain' && Math.random() < delta * hazard.intensity * 2) {
        this.enemyBullets.spawn({
          owner: 'enemy',
          weaponId: 'acid_rain',
          slot: 'hazard',
          type: 'bullet',
          position: { x: Math.random() * ARENA.WIDTH - ARENA.HALF_W, y: ARENA.HALF_H + 1 },
          velocity: { x: 0, y: -(18 + hazard.intensity * 8) },
          radius: 0.28,
          damage: 3,
          sprite: 'laserGreen02',
          maxAge: 4,
          scale: 0.9,
          tint: '#9ef26f',
        })
      }

      if (hazard.type === 'lightning' && Math.random() < delta * hazard.intensity * 1.5) {
        const strikeX = Math.random() * ARENA.WIDTH - ARENA.HALF_W
        this.enemyBullets.spawn({
          owner: 'enemy',
          weaponId: 'lightning',
          slot: 'hazard',
          type: 'beam',
          position: { x: strikeX, y: 0 },
          radius: 0.8,
          damage: 5,
          sprite: 'beam6',
          beamLength: ARENA.HEIGHT,
          maxAge: 0.25,
          scale: 1.1,
          tint: '#d8f6ff',
        })
      }

      if (hazard.elapsed >= hazard.duration) {
        this.hazards.splice(index, 1)
      }
    }
  }

  private applyBossPull(delta: number): void {
    if (!this.boss || this.boss.getPullStrength() <= 0) return
    const bossState = this.boss.getState()
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      const dx = bossState.position.x - state.position.x
      const dy = bossState.position.y - state.position.y
      const distance = Math.hypot(dx, dy) || 1
      player.nudge(
        (dx / distance) * this.boss.getPullStrength() * delta * 0.2,
        (dy / distance) * this.boss.getPullStrength() * delta * 0.2,
      )
    }
  }

  private handleCollisions(events: ArcadeEvent[]): void {
    const playerProjectiles = this._cachedPlayerProjectiles
    const enemyProjectiles = this._cachedEnemyProjectiles

    this.handlePlayerProjectiles(playerProjectiles, events)
    this.handleFieldProjectiles(playerProjectiles, events)
    this.handleEnemyProjectiles(enemyProjectiles, events)
    this.handleBodyCollisions(events)
    this.handlePickups(events)
    this.handleGrazing(enemyProjectiles)
    this.trackShieldBreaks()
  }

  private handlePlayerProjectiles(projectiles: ProjectileEntity[], events: ArcadeEvent[]): void {
    const targets = this._cachedTargets
    const boss = this.boss
    const bossState = boss?.getState()

    for (const projectile of projectiles) {
      if (!projectile.alive || projectile.type === 'field' || projectile.type === 'orbit') continue

      if (projectile.type === 'beam') {
        this.damageBeam(projectile, events)
        continue
      }

      for (const target of targets) {
        if (!target.entity.alive) continue
        if (!circleHit(projectile.position.x, projectile.position.y, projectile.radius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
        this.damageTargetWithProjectile(projectile, target, projectile.damage, events)
        if (this.isExplosivePlayerProjectile(projectile)) {
          this.explodePlayerProjectile(projectile, events, {
            excludeEntityId: target.entity.id,
            alreadyCountedHit: true,
          })
        } else if (projectile.piercing > 0) {
          projectile.piercing -= 1
        } else {
          this.playerBullets.despawn(projectile)
        }
        break
      }

      if (projectile.alive && bossState && boss && !boss.isDefeated() && circleHit(
        projectile.position.x,
        projectile.position.y,
        projectile.radius,
        bossState.position.x,
        bossState.position.y,
        bossState.radius,
      )) {
        this.damageBossWithProjectile(projectile, projectile.damage)
        if (this.isExplosivePlayerProjectile(projectile)) {
          this.explodePlayerProjectile(projectile, events, { excludeBoss: true, alreadyCountedHit: true })
        } else {
          this.playerBullets.despawn(projectile)
          this.vfx.explosion(projectile.position.x, projectile.position.y, '#ffb8a8', 0.5)
        }
      }

      if (projectile.alive && this.isExplosivePlayerProjectile(projectile) && projectile.detonated) {
        this.explodePlayerProjectile(projectile, events)
      }
    }
  }

  private damageBeam(projectile: ProjectileEntity, events: ArcadeEvent[]): void {
    const targets = this._cachedTargets
    const boss = this.boss
    const beamTop = projectile.position.y + projectile.beamLength * 0.5
    const beamBottom = projectile.position.y - projectile.beamLength * 0.5

    for (const target of targets) {
      if (!target.entity.alive) continue
      if (Math.abs(target.entity.position.x - projectile.position.x) > projectile.radius + target.entity.radius) continue
      if (target.entity.position.y < beamBottom || target.entity.position.y > beamTop) continue
      this.damageTargetWithProjectile(projectile, target, projectile.damage * 0.35, events, true)
    }
    if (boss && !boss.isDefeated()) {
      const state = boss.getState()
      if (Math.abs(state.position.x - projectile.position.x) <= projectile.radius + state.radius) {
        this.damageBossWithProjectile(projectile, projectile.damage * 0.35)
      }
    }
  }

  private handleFieldProjectiles(projectiles: ProjectileEntity[], events: ArcadeEvent[]): void {
    for (const projectile of projectiles) {
      if (!projectile.alive) continue

      if (projectile.type === 'orbit') {
        for (const enemy of this._cachedEnemies) {
          if (!enemy.alive) continue
          if (!circleHit(projectile.position.x, projectile.position.y, projectile.radius, enemy.position.x, enemy.position.y, enemy.radius)) continue
          this.damageTargetWithProjectile(
            projectile,
            { entity: enemy, kind: 'enemy', hit: (entity, damage) => this.enemies.hit(entity, damage) },
            projectile.damage * 0.22,
            events,
            true,
          )
        }
      }

      if (projectile.type === 'field') {
        const targets = this._cachedTargets
        for (const target of targets) {
          if (!target.entity.alive) continue
          if (!circleHit(projectile.position.x, projectile.position.y, projectile.fieldRadius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
          this.damageTargetWithProjectile(projectile, target, projectile.damage * 0.08, events, true)
        }
        if (projectile.weaponId === 'repulsor') {
          for (const enemyProjectile of this._cachedEnemyProjectiles) {
            if (!circleHit(projectile.position.x, projectile.position.y, projectile.fieldRadius, enemyProjectile.position.x, enemyProjectile.position.y, enemyProjectile.radius)) continue
            const dx = enemyProjectile.position.x - projectile.position.x
            const dy = enemyProjectile.position.y - projectile.position.y
            const distance = Math.hypot(dx, dy) || 1
            enemyProjectile.velocity.x += (dx / distance) * 14 * 0.016
            enemyProjectile.velocity.y += (dy / distance) * 14 * 0.016
          }
        }
      }
    }
  }

  private handleEnemyProjectiles(projectiles: ProjectileEntity[], events: ArcadeEvent[]): void {
    const shieldDrones = this._cachedPlayerProjectiles.filter(
      (candidate) => candidate.weaponId === 'shield_drone' && candidate.type === 'orbit',
    )
    for (const projectile of projectiles) {
      if (!projectile.alive) continue
      if (projectile.type !== 'beam') {
        const blocker = shieldDrones.find((candidate) => candidate.alive && circleHit(
          projectile.position.x,
          projectile.position.y,
          projectile.radius,
          candidate.position.x,
          candidate.position.y,
          candidate.radius,
        ))
        if (blocker) {
          this.enemyBullets.despawn(projectile)
          this.playerBullets.despawn(blocker)
          this.vfx.explosion(blocker.position.x, blocker.position.y, '#ffe98d', 0.45)
          this.audio.shieldHit()
          continue
        }
      }

      if (projectile.type === 'missile' && projectile.detonated) {
        this.explodeEnemyProjectile(projectile, events)
        continue
      }

      if (projectile.type === 'missile') {
        const directHit = this.findFirstHitPlayer(projectile)
        if (!directHit) continue
        this.explodeEnemyProjectile(projectile, events, directHit.getState().id)
      } else {
        if (projectile.type === 'beam') {
          const hitPlayers = this.findBeamHitPlayers(projectile)
          if (hitPlayers.length === 0) continue
          this.enemyBullets.despawn(projectile)
          for (const hitPlayer of hitPlayers) {
            this.damagePlayer(hitPlayer, projectile.damage, events)
          }
          continue
        }

        const hitPlayer = this.findFirstHitPlayer(projectile)
        if (!hitPlayer) continue
        this.enemyBullets.despawn(projectile)
        this.damagePlayer(hitPlayer, projectile.damage, events)
      }
    }
  }

  private explodePlayerProjectile(
    projectile: ProjectileEntity,
    events: ArcadeEvent[],
    options?: { excludeEntityId?: number | string; excludeBoss?: boolean; alreadyCountedHit?: boolean },
  ): void {
    const splashRadius = Math.max(projectile.splashRadius, projectile.proximityRadius, projectile.radius)
    let countedHit = options?.alreadyCountedHit ?? false
    const countHit = () => {
      if (countedHit) return
      this.recordScoredProjectileHit(projectile)
      countedHit = true
    }

    if (splashRadius > 0) {
      for (const target of this._cachedTargets) {
        if (!target.entity.alive || target.entity.id === options?.excludeEntityId) continue
        if (!circleHit(projectile.position.x, projectile.position.y, splashRadius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
        countHit()
        const result = target.hit(target.entity, this.applyDamageMods(projectile.damage * 0.6, false))
        this.handleKillResult(result, target.kind, events, projectile.weaponId)
      }

      if (this.boss && !this.boss.isDefeated() && !options?.excludeBoss) {
        const boss = this.boss.getState()
        if (circleHit(projectile.position.x, projectile.position.y, splashRadius, boss.position.x, boss.position.y, boss.radius)) {
          countHit()
          this.boss.hit(this.applyDamageMods(projectile.damage * 0.6, true))
        }
      }
    }

    this.explodeProjectile(this.playerBullets, projectile, 0.7, 0.28)
  }

  private explodeEnemyProjectile(projectile: ProjectileEntity, events: ArcadeEvent[], forceHitPlayerId?: string): void {
    const splashRadius = this.explodeProjectile(this.enemyBullets, projectile, 0.58, 0.22)
    this.damagePlayersInRadius(projectile.position, splashRadius, projectile.damage, events, forceHitPlayerId)
  }

  private handleBodyCollisions(events: ArcadeEvent[]): void {
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      for (const enemy of this._cachedEnemies) {
        if (!enemy.alive) continue
        if (!circleHit(state.position.x, state.position.y, state.radius, enemy.position.x, enemy.position.y, enemy.radius)) continue
        this.damagePlayer(player, enemy.def.collisionDamage ?? 6, events)
        const result = this.enemies.hit(enemy, 999)
        this.handleKillResult(result, 'enemy', events)
        if (!state.alive) break
      }
      if (!state.alive) continue
      for (const meteor of this._cachedMeteors) {
        if (!meteor.alive) continue
        if (!circleHit(state.position.x, state.position.y, state.radius, meteor.position.x, meteor.position.y, meteor.radius)) continue
        this.damagePlayer(player, 8, events)
        const result = this.meteors.hit(meteor, 999)
        this.handleKillResult(result, 'meteor', events)
        if (!state.alive) break
      }
    }
  }

  private handlePickups(events: ArcadeEvent[]): void {
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      const collected = this.pickups.collect(state.position, PLAYER_CONST.PICKUP_RADIUS)
      for (const pickup of collected) {
        this.handleCollectedPickup(player, pickup, events)
      }
    }
  }

  private handleCollectedPickup(
    player: PlayerController,
    pickup: ReturnType<PickupManager['collect']>[number],
    events: ArcadeEvent[],
  ): void {
    const state = player.getState()
    const isNewDataLog = pickup.type !== 'data_cube'
      || !pickup.payload
      || !this.collectedLogs.includes(pickup.payload)

    this.audio.pickup()

    if (pickup.type === 'data_cube' && pickup.payload && isNewDataLog) {
      this.collectedLogs.push(pickup.payload)
    }

    if (pickup.type !== 'data_cube' || isNewDataLog) {
      const effect = applyPickupEffect(pickup, {
        player,
        scoreState: this.scoreState,
        powerups: this.powerups,
        scorePopup: (x, y, text, color) => this.vfx.scorePopup(x, y, text, color),
      })
      if (effect.latestComms) {
        this.latestComms = effect.latestComms
      }
      if (effect.event) {
        events.push(effect.event)
      }
    }

    const secret = resolveSecretFromPickup({
      trigger: this.level.secretTrigger,
      type: pickup.type,
      payload: pickup.payload,
      value: pickup.value,
      rearWeaponId: state.loadout.weapons.rear,
      progress: this.secretProgress,
      discoveredSecrets: this.discoveredSecrets,
    })
    this.secretProgress = secret.nextProgress
    if (secret.message) {
      this.latestComms = [secret.message]
    }
    if (secret.revealSecretId) {
      this.revealSecretLevel(secret.revealSecretId, events)
    }

    events.push({ type: 'pickup_collected', pickupType: pickup.type, value: pickup.value })
  }

  private handleGrazing(projectiles: ProjectileEntity[]): void {
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      for (const projectile of projectiles) {
        if (!projectile.alive || projectile.type === 'field') continue
        const grazeId = `${state.id}:${projectile.id}`
        const distance = Math.hypot(projectile.position.x - state.position.x, projectile.position.y - state.position.y)
        if (distance <= PLAYER_CONST.GRAZE_RADIUS && distance > state.hitboxRadius + projectile.radius && !this.grazeSet.has(grazeId)) {
          this.grazeSet.add(grazeId)
          registerGraze(this.scoreState)
          this.vfx.scorePopup(state.position.x, state.position.y + 1, '+10', '#91f0ff')
          this.audio.graze()
        }
      }
    }
  }

  private handleKillResult(result: HitResult, kind: DamageableKind, events: ArcadeEvent[], weaponId?: string): void {
    if (!result.killed) return
    const colors = { enemy: '#ff9d72', meteor: '#d4b48b', terrain: '#ffc56c' } as const
    if (kind === 'enemy') {
      const creditBonus = 1 + this.modifiers.creditGain
      registerKill(this.scoreState, result.score, Math.round(result.credits * creditBonus))
      if (weaponId) registerWeaponKill(this.scoreState, weaponId)
      this.vfx.scorePopup(result.position.x, result.position.y + 0.5, `+${result.score}`)
    } else {
      this.scoreState.score += result.score
      this.scoreState.credits += result.credits
    }
    if (kind === 'enemy') {
      this.vfx.enemyExplosion(result.position.x, result.position.y, colors[kind], 0.9)
    } else {
      this.vfx.explosion(result.position.x, result.position.y, colors[kind], 0.8)
    }
    this.audio.explosion()
    this.maybeDrop(result.position, result.drops)
    if (kind === 'enemy') this.maybeDropPowerUp(result.position)
    if (kind !== 'enemy') {
      const secret = resolveSecretFromDestroyedTarget({
        trigger: this.level.secretTrigger,
        destroyedId: result.id,
        progress: this.secretProgress,
        requiredProgress: this.level.id === 'mercury_2' ? 3 : 1,
        discoveredSecrets: this.discoveredSecrets,
      })
      this.secretProgress = secret.nextProgress
      if (secret.revealSecretId) {
        this.revealSecretLevel(secret.revealSecretId, events)
      }
    }
  }

  private revealSecretLevel(secretId: string, events: ArcadeEvent[]): void {
    if (this.discoveredSecrets.includes(secretId)) return
    this.discoveredSecrets.push(secretId)
    this.latestComms = [formatSecretUnlockMessage(secretId)]
    events.push({ type: 'secret_revealed', secretId, levelId: this.level.id })
  }

  private maybeDropPowerUp(position: Vec2): void {
    if (Math.random() >= POWERUP_DROP_CHANCE) return
    const drop = this.powerups.roll(this.players[0].getState().loadout)
    if (!drop) return
    this.pickups.spawn('powerup', position, String(drop.dropId), 1, drop.sprite)
  }

  private maybeDrop(position: Vec2, drops: { credits?: [number, number]; pickups?: Array<{ type: PickupType; chance: number; value?: number }> }): void {
    if (drops.credits) {
      const [min, max] = drops.credits
      this.pickups.spawn('credits', position, undefined, Math.round(min + Math.random() * (max - min)))
    }
    for (const pickup of drops.pickups ?? []) {
      if (Math.random() <= pickup.chance) {
        this.pickups.spawn(pickup.type, position, undefined, pickup.value)
      }
    }
  }

  private getPickupMagnets(): Array<{ point: Vec2; radius: number }> {
    const magnets = new Map<string, number>()
    for (const projectile of this._cachedPlayerProjectiles) {
      if (!projectile.alive || projectile.weaponId !== 'attractor_field' || !projectile.anchorId) continue
      magnets.set(
        projectile.anchorId,
        Math.max(magnets.get(projectile.anchorId) ?? 0, projectile.orbitRadius || 4),
      )
    }

    return this.players.flatMap((player) => {
      const state = player.getState()
      const radius = magnets.get(state.id) ?? 0
      if (!state.alive || radius <= 0) return []
      return [{ point: { ...state.position }, radius }]
    })
  }

  private getPowerUpOwners(): PowerUpOwner[] {
    return this.players.flatMap((player) => {
      if (!player.isActive()) return []
      const playerState = player.getState()
      return [{
        playerId: playerState.id,
        loadout: playerState.loadout,
        playerState,
      }]
    })
  }

  private getPlayerById(playerId: string): PlayerController | null {
    return this.players.find((player) => player.getState().id === playerId) ?? null
  }

  private isExplosivePlayerProjectile(projectile: ProjectileEntity): boolean {
    return projectile.type === 'missile' || projectile.type === 'flare'
  }

  private recordScoredProjectileHit(projectile: ProjectileEntity): void {
    this.recordPlayerProjectileHit(projectile)
    recordShotHit(this.scoreState)
  }

  private recordPlayerProjectileHit(projectile: ProjectileEntity): void {
    const owner = projectile.anchorId
      ? this.getPlayerById(projectile.anchorId)
      : this.findNearestPlayerController(projectile.position)
    owner?.recordHit()
  }

  private damageTargetWithProjectile(
    projectile: ProjectileEntity,
    target: DamageableTarget,
    damage: number,
    events: ArcadeEvent[],
    applySlow = false,
  ): void {
    this.recordScoredProjectileHit(projectile)
    const result = target.hit(target.entity, this.applyDamageMods(damage, false))
    if (applySlow) {
      this.applySlowEffect(projectile, target.entity as EnemyEntity | MeteorEntity | TerrainEntity)
    }
    this.handleKillResult(result, target.kind, events, projectile.weaponId)
  }

  private damageBossWithProjectile(projectile: ProjectileEntity, damage: number): void {
    if (!this.boss || this.boss.isDefeated()) return
    this.recordScoredProjectileHit(projectile)
    this.boss.hit(this.applyDamageMods(damage, true))
  }

  private findNearestPlayerController(position: Vec2): PlayerController | null {
    let best: PlayerController | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    for (const player of this.players) {
      if (!player.isActive()) continue
      const state = player.getState()
      const distance = (state.position.x - position.x) ** 2 + (state.position.y - position.y) ** 2
      if (distance < bestDistance) {
        best = player
        bestDistance = distance
      }
    }

    return best
  }

  private trackShieldBreaks(): void {
    for (const player of this.players) {
      const state = player.getState()
      if (!player.isActive()) {
        this.shieldBreakPlayed.delete(state.id)
        continue
      }
      if (state.maxShield <= 0 || state.shield > 0) {
        this.shieldBreakPlayed.delete(state.id)
        continue
      }
      if (this.shieldBreakPlayed.has(state.id)) continue
      this.shieldBreakPlayed.add(state.id)
      this.audio.shieldBreak()
    }
  }

  private findBeamHitPlayers(projectile: ProjectileEntity): PlayerController[] {
    return this.players.filter((player) => {
      const state = player.getState()
      return state.alive
        && Math.abs(projectile.position.x - state.position.x) <= projectile.radius + state.hitboxRadius
        && state.position.y <= projectile.position.y + projectile.beamLength * 0.5
        && state.position.y >= projectile.position.y - projectile.beamLength * 0.5
    })
  }

  private findFirstHitPlayer(projectile: ProjectileEntity): PlayerController | null {
    const alivePlayers = this.players.filter((player) => player.getState().alive)
    for (const player of alivePlayers) {
      const state = player.getState()
      if (circleHit(projectile.position.x, projectile.position.y, projectile.radius, state.position.x, state.position.y, state.radius)) {
        return player
      }
    }
    return null
  }

  private damagePlayer(player: PlayerController, amount: number, events: ArcadeEvent[]): boolean {
    const state = player.getState()
    const died = player.applyDamage(amount)
    this.vfx.screenShake(died ? 0.8 : 0.25, died ? 0.4 : 0.12)
    if (died) {
      this.audio.explosion(true)
      this.vfx.explosion(state.position.x, state.position.y, '#7acbff', 1.6)
      this.background.flashBackground('#ff4444', 0.25)
      events.push({ type: 'player_down', playerId: state.id })
    } else {
      this.audio.shieldHit()
    }
    return died
  }

  private damagePlayersInRadius(
    position: Vec2,
    radius: number,
    damage: number,
    events: ArcadeEvent[],
    forceHitPlayerId?: string,
  ): void {
    for (const player of this.players) {
      const state = player.getState()
      if (!state.alive) continue
      const shouldHit = forceHitPlayerId === state.id
        || circleHit(position.x, position.y, radius, state.position.x, state.position.y, state.radius)
      if (!shouldHit) continue
      this.damagePlayer(player, damage, events)
    }
  }

  private applyDamageMods(baseDamage: number, isBoss: boolean): number {
    return applyDamageModifiers(baseDamage, this.modifiers, isBoss)
  }

  private enemyHealthProgression(): number {
    return 1 + this.level.episode * 0.1 + (this.wave - 1) * 0.08
  }

  private projectileExplosionColor(projectile: ProjectileEntity): string {
    return projectile.trailColor ?? projectile.tint ?? (projectile.owner === 'enemy' ? '#ff9d72' : '#ffd08a')
  }

  private explodeProjectile(
    pool: BulletPool,
    projectile: ProjectileEntity,
    baseScale: number,
    radiusScale: number,
  ): number {
    const splashRadius = Math.max(projectile.splashRadius, projectile.proximityRadius, projectile.radius)
    pool.despawn(projectile)
    this.vfx.explosion(
      projectile.position.x,
      projectile.position.y,
      this.projectileExplosionColor(projectile),
      baseScale + splashRadius * radiusScale,
    )
    return splashRadius
  }

  private applySlowEffect(
    projectile: ProjectileEntity,
    target: EnemyEntity | MeteorEntity | TerrainEntity,
  ): void {
    if (projectile.slowFactor <= 0) return
    target.slowFactor = Math.min(target.slowFactor, Math.max(0.25, projectile.slowFactor))
    target.slowTimer = Math.max(target.slowTimer, projectile.type === 'beam' ? 0.9 : 1.4)
  }

  private resolveAnchor(anchorId: string): Vec2 | null {
    return this.getPlayerById(anchorId)?.getState().position ?? null
  }

  private enterBoss(): void {
    if (!this.level.bossId || this.bossEntered) return
    const bossDef = getBossDef(this.level.bossId)
    this.bossEntered = true
    this.enemies.clear()
    this.enemyBullets.clear()
    this.grazeSet.clear()
    this.boss = new BossController(this.group, this.enemyBullets, bossDef)
    this.audio.bossEntry()
    this.vfx.screenShake(0.7, 0.4)
    this.background.setBossDarken(true)
    this.latestComms = [bossDef.introLine]
  }

  private handleBossEvent(event: ArcadeEvent): void {
    switch (event.type) {
      case 'boss_phase':
      case 'boss_vulnerable':
        this.audio.bossPhase()
        break
      case 'boss_defeated': {
        this.scoreState.score += event.score
        this.scoreState.credits += event.credits
        this.background.setBossDarken(false)
        const bossId = this.level.bossId
        const upgrade = bossId ? getBossUpgrade(bossId) : null
        if (upgrade && !this.ownedUpgrades.has(upgrade.id) && !this.earnedUpgrades.includes(upgrade.id)) {
          this.earnedUpgrades.push(upgrade.id)
          this.latestComms = [
            `${event.name.toUpperCase()} DESTROYED.`,
            `UPGRADE ACQUIRED: ${upgrade.label} (${upgrade.description})`,
          ]
        } else {
          this.latestComms = [`${event.name.toUpperCase()} DESTROYED.`]
        }
        break
      }
    }
  }

  private handleBomb(player: PlayerController, events: ArcadeEvent[]): void {
    const state = player.getState()
    const bombsRemaining = state.loadout.specialAmmo.mega_bomb ?? 0
    if (bombsRemaining <= 0) return
    state.loadout.specialAmmo.mega_bomb = bombsRemaining - 1
    state.bombs = bombsRemaining - 1
    this.enemyBullets.clear()
    const managers = [
      { mgr: this.enemies, kind: 'enemy' as DamageableKind },
      { mgr: this.meteors, kind: 'meteor' as DamageableKind },
      { mgr: this.terrain, kind: 'terrain' as DamageableKind },
    ]
    for (const { mgr, kind } of managers) {
      for (const result of mgr.damageAt(state.position.x, state.position.y, PLAYER_CONST.BOMB_RADIUS, PLAYER_CONST.BOMB_DAMAGE)) {
        this.handleKillResult(result, kind, events)
      }
    }
    if (this.boss && !this.boss.isDefeated()) {
      this.boss.hit(PLAYER_CONST.BOMB_DAMAGE)
    }
    this.vfx.explosion(state.position.x, state.position.y, '#9fd6ff', 2)
    this.vfx.screenShake(1, 0.45)
    this.background.flashBackground('#ffffff', 0.4)
    this.audio.explosion(true)
    events.push({ type: 'pickup_collected', pickupType: 'bomb', value: -1 })
  }

  private spawnPortal(): void {
    const bossPos = this.boss?.getState()?.position
    const x = bossPos?.x ?? 0
    const y = bossPos?.y ?? 10
    this.portal = new Portal(x, y)
    this.group.add(this.portal.group)
    this.audio.victory()
    this.vfx.screenShake(0.6, 0.5)
    this.latestComms = ['A PORTAL HAS OPENED — FLY INTO IT!']
  }

  private beginClear(success: boolean): void {
    if (this.clearDelay > 0) return
    this.result.success = success
    this.clearDelay = COMBAT_CONST.LEVEL_CLEAR_DELAY
    this.vfx.screenShake(success ? 0.6 : 0.4, 0.5)
    if (success) this.audio.victory()
  }

  private finalizeCombat(success: boolean): ReturnType<typeof finalizeCombatResult> {
    this.powerups.clear(this.getPowerUpOwners())
    return finalizeCombatResult(success, this.level, this.elapsed, this.scoreState)
  }

  private finish(events: ArcadeEvent[]): void {
    if (this.result.ended) return
    const finalized = this.finalizeCombat(this.result.success)
    this.result.ended = finalized.result.ended
    this.result.debrief = finalized.debrief
    this.levelDebrief = finalized.debrief
    events.push(...finalized.events)
  }
}
