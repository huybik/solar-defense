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
import { PowerUpManager, POWERUP_DROP_CHANCE } from './power-ups'
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
import { PlayerController, createCombatKeyboardHandler } from './player'
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
  type HazardCommand,
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
  boss: BossEntity | null
  synergy: string | null
  discoveredSecrets: string[]
  comms: string[]
  powerups: Array<{ label: string; remaining: number; duration: number }>
}

export class Arena {
  readonly group: Group

  private readonly background: BackgroundController
  private readonly playerBullets: BulletPool
  private readonly enemyBullets: BulletPool
  private readonly player: PlayerController
  private readonly enemies: EnemyManager
  private readonly meteors: MeteorManager
  private readonly terrain: TerrainManager
  private readonly pickups: PickupManager
  private readonly vfx: VFXManager
  private readonly audio: ArcadeAudio
  private readonly powerups: PowerUpManager
  private readonly keyboard = createCombatKeyboardHandler()
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
  private grazeSet = new Set<number>()
  private shieldBreakPlayed = false
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
    this.player = new PlayerController(this.group, 'player_0', this.playerBullets, JSON.parse(JSON.stringify(campaign.inventory)), campaign.weaponMastery ?? {})
    applyFlatBossUpgradeEffects(this.player.getState(), campaign.bossUpgrades ?? [])
    this.enemies = new EnemyManager(this.group, this.enemyBullets, this.level.planet)
    this.enemies.setDifficulty(this.difficulty)
    this.enemies.setProgressionHealth(this.enemyHealthProgression())
    this.meteors = new MeteorManager(this.group)
    this.terrain = new TerrainManager(this.group, this.enemyBullets)
    this.pickups = new PickupManager(this.group)
    this.powerups = new PowerUpManager()
    this.vfx = new VFXManager(this.group)
    this.audio = new ArcadeAudio()

    this.keyboard.attach()
    this.audio.ui()

    this.isFinalLevel = getNextMainLevel(levelId) === null
    this.bossTriggerTime = createBossTriggerTime(this.level)
    this.waveMilestones = createWaveMilestones(this.bossTriggerTime)

    this.result.events.push({ type: 'wave_start', wave: 1, levelId: this.level.id })
  }

  update(delta: number): ArcadeEvent[] {
    if (this.result.ended) return []

    const input = this.keyboard.poll()
    this.elapsed += delta
    const events: ArcadeEvent[] = [...this.result.events]
    this.result.events = []

    this.cacheDamageableTargets()

    const comboLost = tickCombo(this.scoreState, delta)
    if (comboLost) {
      this.latestComms = ['COMBO LOST']
    }

    this.processSegments(events)
    this.processScheduled()
    this.processFillerSpawns(delta)
    this.updateWaves(events)

    const playerUpdate = this.player.update(input, {
      delta,
      elapsed: this.elapsed,
      findEnemy: (position) => this.findNearestEnemy(position),
    })
    if (playerUpdate.shotsFired > 0) {
      recordShotFired(this.scoreState, playerUpdate.shotsFired)
    }
    this.activeSynergy = playerUpdate.synergy
    if (playerUpdate.discoveredSynergy) {
      this.latestComms = [`SYNERGY DISCOVERED: ${playerUpdate.discoveredSynergy}`]
      events.push({ type: 'synergy_discovered', combo: playerUpdate.discoveredSynergy })
      this.audio.combo()
    }
    if (playerUpdate.usedBomb) {
      this.handleBomb(events)
    }
    if (playerUpdate.usedSpecial) {
      this.audio.missile()
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
    this.pickups.update(delta, this.player.getState().position, this.currentPickupMagnetRadius())
    this.powerups.update(delta, this.player.getState().loadout, this.player.getState())
    this.player.setBonusWeapons(this.powerups.getBonusWeapons())
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
      if (this.player.getState().alive && this.portal.checkCollision(this.player.getState().position)) {
        events.push({ type: 'portal_entered' })
        this.portal.dispose()
        this.portal = null
        this.beginClear(true)
      }
    }

    if (!this.player.getState().alive && this.player.getState().lives <= 0) {
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
    const player = this.player.getState()
    const accuracy = player.shotsFired > 0 ? (player.shotsHit / player.shotsFired) * 100 : 100
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
      player,
      boss: this.boss?.getState() ?? null,
      synergy: this.activeSynergy,
      discoveredSecrets: this.discoveredSecrets,
      comms: this.latestComms,
      powerups: this.powerups.getActive().map((pu) => ({ label: pu.label, remaining: pu.remaining, duration: pu.duration })),
    }
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
    return this.player.getState().loadout
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

  forceFinish(success: boolean): ArcadeEvent[] {
    if (this.result.ended) return []

    this.result.success = success
    this.powerups.clear(this.player.getState().loadout, this.player.getState())
    const finalized = finalizeCombatResult(this.result.success, this.level, this.elapsed, this.scoreState)
    this.result = finalized.result
    this.levelDebrief = finalized.debrief
    return finalized.events
  }

  dispose(): void {
    this.keyboard.detach()
    this.background.dispose()
    this.player.dispose()
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

  private getDamageableTargets(): DamageableTarget[] {
    return this._cachedTargets
  }

  private cacheDamageableTargets(): void {
    this._cachedEnemies = this.enemies.getActive()
    this._cachedMeteors = this.meteors.getActive()
    this._cachedTerrain = this.terrain.getActive()
    this._cachedTargets.length = 0
    this._cachedPlayerHomingTargets.length = 0

    for (const enemy of this._cachedEnemies) {
      this._cachedTargets.push({ entity: enemy, kind: 'enemy', hit: (entity: any, damage: number) => this.enemies.hit(entity, damage) })
      this._cachedPlayerHomingTargets.push({ id: `enemy:${enemy.id}`, position: enemy.position, radius: enemy.radius })
    }
    for (const meteor of this._cachedMeteors) {
      this._cachedTargets.push({ entity: meteor, kind: 'meteor', hit: (entity: any, damage: number) => this.meteors.hit(entity, damage) })
      this._cachedPlayerHomingTargets.push({ id: `meteor:${meteor.id}`, position: meteor.position, radius: meteor.radius })
    }
    for (const terrain of this._cachedTerrain) {
      this._cachedTargets.push({ entity: terrain, kind: 'terrain', hit: (entity: any, damage: number) => this.terrain.hit(entity, damage) })
      this._cachedPlayerHomingTargets.push({ id: `terrain:${terrain.id}`, position: terrain.position, radius: terrain.radius })
    }
    if (this.boss && !this.boss.isDefeated()) {
      const boss = this.boss.getState()
      this._cachedPlayerHomingTargets.push({ id: `boss:${this.level.bossId ?? 'core'}`, position: boss.position, radius: boss.radius })
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
    const player = this.player.getState()
    this._cachedEnemyHomingTargets.push({
      id: `player:${player.id}`,
      position: player.position,
      radius: player.radius,
    })
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

  private processSegments(events: ArcadeEvent[]): void {
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
    const player = this.player.getState()
    const bossState = this.boss.getState()
    const dx = bossState.position.x - player.position.x
    const dy = bossState.position.y - player.position.y
    const distance = Math.hypot(dx, dy) || 1
    this.player.nudge(
      (dx / distance) * this.boss.getPullStrength() * delta * 0.2,
      (dy / distance) * this.boss.getPullStrength() * delta * 0.2,
    )
  }

  private handleCollisions(events: ArcadeEvent[]): void {
    const playerState = this.player.getState()
    const playerProjectiles = this._cachedPlayerProjectiles
    const enemyProjectiles = this._cachedEnemyProjectiles

    this.handlePlayerProjectiles(playerProjectiles, events)
    this.handleFieldProjectiles(playerProjectiles, events)
    this.handleEnemyProjectiles(enemyProjectiles, events)
    this.handleBodyCollisions(events)
    this.handlePickups(events)
    this.handleGrazing(enemyProjectiles)

    if (playerState.maxShield <= 0) {
      this.shieldBreakPlayed = false
    } else if (playerState.shield > 0) {
      this.shieldBreakPlayed = false
    } else if (!this.shieldBreakPlayed) {
      this.shieldBreakPlayed = true
      this.audio.shieldBreak()
    }
  }

  private handlePlayerProjectiles(projectiles: ProjectileEntity[], events: ArcadeEvent[]): void {
    const targets = this.getDamageableTargets()
    const bossState = this.boss?.getState()

    for (const projectile of projectiles) {
      if (!projectile.alive || projectile.type === 'field' || projectile.type === 'orbit') continue

      if (projectile.type === 'beam') {
        this.damageBeam(projectile, events)
        continue
      }

      for (const target of targets) {
        if (!target.entity.alive) continue
        if (!circleHit(projectile.position.x, projectile.position.y, projectile.radius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
        this.player.recordHit()
        recordShotHit(this.scoreState)
        const result = target.hit(target.entity, this.applyDamageMods(projectile.damage, false))
        this.handleKillResult(result, target.kind, events, projectile.weaponId)
        if (projectile.type === 'missile' || projectile.type === 'flare') {
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

      if (projectile.alive && bossState && this.boss && !this.boss.isDefeated() && circleHit(
        projectile.position.x,
        projectile.position.y,
        projectile.radius,
        bossState.position.x,
        bossState.position.y,
        bossState.radius,
      )) {
        this.player.recordHit()
        recordShotHit(this.scoreState)
        this.boss.hit(this.applyDamageMods(projectile.damage, true))
        if (projectile.type === 'missile' || projectile.type === 'flare') {
          this.explodePlayerProjectile(projectile, events, { excludeBoss: true, alreadyCountedHit: true })
        } else {
          this.playerBullets.despawn(projectile)
          this.vfx.explosion(projectile.position.x, projectile.position.y, '#ffb8a8', 0.5)
        }
      }

      if (projectile.alive && (projectile.type === 'missile' || projectile.type === 'flare') && projectile.detonated) {
        this.explodePlayerProjectile(projectile, events)
      }
    }
  }

  private damageBeam(projectile: ProjectileEntity, events: ArcadeEvent[]): void {
    const targets = this.getDamageableTargets()
    const boss = this.boss
    const beamTop = projectile.position.y + projectile.beamLength * 0.5
    const beamBottom = projectile.position.y - projectile.beamLength * 0.5

    for (const target of targets) {
      if (!target.entity.alive) continue
      if (Math.abs(target.entity.position.x - projectile.position.x) > projectile.radius + target.entity.radius) continue
      if (target.entity.position.y < beamBottom || target.entity.position.y > beamTop) continue
      this.player.recordHit()
      recordShotHit(this.scoreState)
      const result = target.hit(target.entity, this.applyDamageMods(projectile.damage * 0.35, false))
      this.applySlowEffect(projectile, target.entity as any)
      this.handleKillResult(result, target.kind, events, projectile.weaponId)
    }
    if (boss && !boss.isDefeated()) {
      const state = boss.getState()
      if (Math.abs(state.position.x - projectile.position.x) <= projectile.radius + state.radius) {
        this.player.recordHit()
        recordShotHit(this.scoreState)
        boss.hit(this.applyDamageMods(projectile.damage * 0.35, true))
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
          this.player.recordHit()
          recordShotHit(this.scoreState)
          const result = this.enemies.hit(enemy, this.applyDamageMods(projectile.damage * 0.22, false))
          this.applySlowEffect(projectile, enemy)
          this.handleKillResult(result, 'enemy', events, projectile.weaponId)
        }
      }

      if (projectile.type === 'field') {
        const targets = this.getDamageableTargets()
        for (const target of targets) {
          if (!target.entity.alive) continue
          if (!circleHit(projectile.position.x, projectile.position.y, projectile.fieldRadius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
          this.player.recordHit()
          recordShotHit(this.scoreState)
          const result = target.hit(target.entity, this.applyDamageMods(projectile.damage * 0.08, false))
          this.applySlowEffect(projectile, target.entity as any)
          this.handleKillResult(result, target.kind, events, projectile.weaponId)
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
    const player = this.player.getState()
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

      const hit = projectile.type === 'beam'
        ? Math.abs(projectile.position.x - player.position.x) <= projectile.radius + player.hitboxRadius
          && player.position.y <= projectile.position.y + projectile.beamLength * 0.5
          && player.position.y >= projectile.position.y - projectile.beamLength * 0.5
        : circleHit(projectile.position.x, projectile.position.y, projectile.radius, player.position.x, player.position.y, player.radius)

      if (!hit) continue
      if (projectile.type === 'missile') {
        this.explodeEnemyProjectile(projectile, events, true)
      } else {
        this.enemyBullets.despawn(projectile)
        const died = this.player.applyDamage(projectile.damage)
        this.vfx.screenShake(died ? 0.8 : 0.25, died ? 0.4 : 0.12)
        if (died) this.audio.explosion(true)
        else this.audio.shieldHit()
        if (died) {
          this.vfx.explosion(player.position.x, player.position.y, '#7acbff', 1.6)
          this.background.flashBackground('#ff4444', 0.25)
          events.push({ type: 'player_down', playerId: player.id })
        }
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

    if (splashRadius > 0) {
      for (const target of this.getDamageableTargets()) {
        if (!target.entity.alive || target.entity.id === options?.excludeEntityId) continue
        if (!circleHit(projectile.position.x, projectile.position.y, splashRadius, target.entity.position.x, target.entity.position.y, target.entity.radius)) continue
        if (!countedHit) {
          this.player.recordHit()
          recordShotHit(this.scoreState)
          countedHit = true
        }
        const result = target.hit(target.entity, this.applyDamageMods(projectile.damage * 0.6, false))
        this.handleKillResult(result, target.kind, events, projectile.weaponId)
      }

      if (this.boss && !this.boss.isDefeated() && !options?.excludeBoss) {
        const boss = this.boss.getState()
        if (circleHit(projectile.position.x, projectile.position.y, splashRadius, boss.position.x, boss.position.y, boss.radius)) {
          if (!countedHit) {
            this.player.recordHit()
            recordShotHit(this.scoreState)
          }
          this.boss.hit(this.applyDamageMods(projectile.damage * 0.6, true))
        }
      }
    }

    this.playerBullets.despawn(projectile)
    this.vfx.explosion(projectile.position.x, projectile.position.y, this.projectileExplosionColor(projectile), 0.7 + splashRadius * 0.28)
  }

  private explodeEnemyProjectile(projectile: ProjectileEntity, events: ArcadeEvent[], forceHitPlayer = false): void {
    const player = this.player.getState()
    const splashRadius = Math.max(projectile.splashRadius, projectile.proximityRadius, projectile.radius)
    const hitPlayer = forceHitPlayer
      || circleHit(projectile.position.x, projectile.position.y, splashRadius, player.position.x, player.position.y, player.radius)

    this.enemyBullets.despawn(projectile)
    this.vfx.explosion(projectile.position.x, projectile.position.y, this.projectileExplosionColor(projectile), 0.58 + splashRadius * 0.22)

    if (!hitPlayer) return

    const died = this.player.applyDamage(projectile.damage)
    this.vfx.screenShake(died ? 0.8 : 0.25, died ? 0.4 : 0.12)
    if (died) this.audio.explosion(true)
    else this.audio.shieldHit()
    if (died) {
      this.vfx.explosion(player.position.x, player.position.y, '#7acbff', 1.6)
      this.background.flashBackground('#ff4444', 0.25)
      events.push({ type: 'player_down', playerId: player.id })
    }
  }

  private handleBodyCollisions(events: ArcadeEvent[]): void {
    const player = this.player.getState()
    for (const enemy of this._cachedEnemies) {
      if (!circleHit(player.position.x, player.position.y, player.radius, enemy.position.x, enemy.position.y, enemy.radius)) continue
      const died = this.player.applyDamage(enemy.def.collisionDamage ?? 6)
      const result = this.enemies.hit(enemy, 999)
      this.handleKillResult(result, 'enemy', events)
      if (died) { this.background.flashBackground('#ff4444', 0.25); events.push({ type: 'player_down', playerId: player.id }) }
    }
    for (const meteor of this._cachedMeteors) {
      if (!circleHit(player.position.x, player.position.y, player.radius, meteor.position.x, meteor.position.y, meteor.radius)) continue
      const died = this.player.applyDamage(8)
      const result = this.meteors.hit(meteor, 999)
      this.handleKillResult(result, 'meteor', events)
      if (died) { this.background.flashBackground('#ff4444', 0.25); events.push({ type: 'player_down', playerId: player.id }) }
    }
  }

  private handlePickups(events: ArcadeEvent[]): void {
    const player = this.player.getState()
    const collected = this.pickups.collect(player.position, PLAYER_CONST.PICKUP_RADIUS)
    for (const pickup of collected) {
      this.audio.pickup()
      const isNewDataLog = pickup.type !== 'data_cube'
        || !pickup.payload
        || !this.collectedLogs.includes(pickup.payload)

      if (pickup.type === 'data_cube' && pickup.payload && isNewDataLog) {
        this.collectedLogs.push(pickup.payload)
      }

      if (pickup.type !== 'data_cube' || isNewDataLog) {
        const effect = applyPickupEffect(pickup, {
          player: this.player,
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
        rearWeaponId: this.player.getState().loadout.weapons.rear,
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
  }

  private handleGrazing(projectiles: ProjectileEntity[]): void {
    const player = this.player.getState()
    for (const projectile of projectiles) {
      if (!projectile.alive || projectile.type === 'field') continue
      const distance = Math.hypot(projectile.position.x - player.position.x, projectile.position.y - player.position.y)
      if (distance <= PLAYER_CONST.GRAZE_RADIUS && distance > player.hitboxRadius + projectile.radius && !this.grazeSet.has(projectile.id)) {
        this.grazeSet.add(projectile.id)
        registerGraze(this.scoreState)
        this.vfx.scorePopup(player.position.x, player.position.y + 1, '+10', '#91f0ff')
        this.audio.graze()
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
      this.player.addScore(result.score)
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
    const drop = this.powerups.roll(this.player.getState().loadout)
    if (!drop) return
    this.pickups.spawn('powerup', position, String(drop.dropId), 1, drop.sprite)
  }

  private maybeDrop(position: Vec2, drops: { credits?: [number, number]; pickups?: Array<{ type: PickupType; chance: number; value?: number }>; dataCubeChance?: number }): void {
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

  private currentPickupMagnetRadius(): number {
    const orbitals = this._cachedPlayerProjectiles.filter((projectile) => projectile.weaponId === 'attractor_field')
    if (orbitals.length === 0) return 0
    return Math.max(...orbitals.map((projectile) => projectile.orbitRadius || 4))
  }

  private findNearestEnemy(position: Vec2): Vec2 | null {
    return this.findCachedTarget(this._cachedPlayerHomingTargets, position)?.position ?? null
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

  private applySlowEffect(
    projectile: ProjectileEntity,
    target: EnemyEntity | MeteorEntity | TerrainEntity,
  ): void {
    if (projectile.slowFactor <= 0) return
    target.slowFactor = Math.min(target.slowFactor, Math.max(0.25, projectile.slowFactor))
    target.slowTimer = Math.max(target.slowTimer, projectile.type === 'beam' ? 0.9 : 1.4)
  }

  private resolveAnchor(anchorId: string): Vec2 | null {
    if (anchorId === this.player.getState().id) {
      return this.player.getState().position
    }
    return null
  }

  private enterBoss(): void {
    if (!this.level.bossId || this.bossEntered) return
    this.bossEntered = true
    this.enemies.clear()
    this.enemyBullets.clear()
    this.grazeSet.clear()
    this.boss = new BossController(this.group, this.enemyBullets, getBossDef(this.level.bossId))
    this.audio.bossEntry()
    this.vfx.screenShake(0.7, 0.4)
    this.background.setBossDarken(true)
    this.latestComms = [getBossDef(this.level.bossId).introLine]
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

  private handleBomb(events: ArcadeEvent[]): void {
    const player = this.player.getState()
    const bombsRemaining = player.loadout.specialAmmo.mega_bomb ?? 0
    if (bombsRemaining <= 0) return
    player.loadout.specialAmmo.mega_bomb = bombsRemaining - 1
    player.bombs = bombsRemaining - 1
    this.enemyBullets.clear()
    const managers = [
      { mgr: this.enemies, kind: 'enemy' as DamageableKind },
      { mgr: this.meteors, kind: 'meteor' as DamageableKind },
      { mgr: this.terrain, kind: 'terrain' as DamageableKind },
    ]
    for (const { mgr, kind } of managers) {
      for (const result of mgr.damageAt(player.position.x, player.position.y, PLAYER_CONST.BOMB_RADIUS, PLAYER_CONST.BOMB_DAMAGE)) {
        this.handleKillResult(result, kind, events)
      }
    }
    if (this.boss && !this.boss.isDefeated()) {
      this.boss.hit(PLAYER_CONST.BOMB_DAMAGE)
    }
    this.vfx.explosion(player.position.x, player.position.y, '#9fd6ff', 2)
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

  private finish(events: ArcadeEvent[]): void {
    if (this.result.ended) return
    this.powerups.clear(this.player.getState().loadout, this.player.getState())
    const finalized = finalizeCombatResult(this.result.success, this.level, this.elapsed, this.scoreState)
    this.result.ended = finalized.result.ended
    this.result.debrief = finalized.debrief
    this.levelDebrief = finalized.debrief
    events.push(...finalized.events)
  }
}
