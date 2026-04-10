import {
  AmbientLight,
  Color,
  Group,
  PerspectiveCamera,
  PostProcessing,
  Scene,
  type WebGPURenderer,
} from 'three/webgpu'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { pass } from 'three/tsl'
import type { GameBridge } from '@learnfun/game-sdk'
import { Arena } from './combat/arena'
import { BackgroundController } from './render/background'
import { MAIN_ROUTE, isLevelUnlocked } from './data/campaign'
import { getLevelDef } from './data/levels'
import { preloadAtlases } from './render/sprites'
import { ArcadeHUD } from './render/hud'
import { createNewCampaign, listSaveSlots, loadCampaign, saveCampaign } from './progression/inventory'
import {
  buyAmmo,
  buyEntry,
  equipEntry,
  sellEquipped,
  type ShopTab,
  upgradeWeapon,
} from './progression/shop'
import { applyCombatResults, advanceCampaignRoute as advanceCampaignRouteState } from './campaign-state'
import {
  buildArcadeViewModel,
  buildCampaignArcadeState,
  buildCombatState,
  combatEventMessage,
  createDefaultArcadeState,
  levelSummary,
} from './mode-view'
import { routeArcadeUiAction } from './ui-actions'
import { flushDeferredDisposals } from './render/deferred-dispose'
import { GameMusic } from '../audio/music'
import type {
  ArcadeEvent,
  ArcadePhase,
  ArcadeState,
  CampaignState,
  Difficulty,
  PlanetId,
  WeaponSlot,
} from './types'

export class ArcadeMode {
  readonly scene: Scene
  readonly camera: PerspectiveCamera

  private readonly bridge: GameBridge
  private readonly hud: ArcadeHUD
  private readonly music: GameMusic
  private readonly postProcessing: PostProcessing
  private readonly onExit: () => void
  private readonly arenaRoot = new Group()

  private arena: Arena | null = null
  private menuBackground: BackgroundController | null = null
  private menuBackgroundPlanet: PlanetId | null = null
  private state: ArcadeState = createDefaultArcadeState()
  private campaign: CampaignState | null = null
  private saveSlots: Array<CampaignState | null> = listSaveSlots()
  private selectedLevelId = 'mercury_1'
  private shopTab: ShopTab = 'front'
  private selectedLogId: string | null = null
  private message = 'Mission Control online.'

  constructor(
    bridge: GameBridge,
    renderer: WebGPURenderer,
    uiContainer: HTMLElement,
    music: GameMusic,
    onExit: () => void,
  ) {
    this.bridge = bridge
    this.music = music
    this.onExit = onExit

    this.scene = new Scene()
    this.scene.background = new Color('#02040b')
    this.scene.add(new AmbientLight('#ffffff', 1.1))
    this.scene.add(this.arenaRoot)

    const aspect = renderer.domElement.width / renderer.domElement.height || 1
    this.camera = new PerspectiveCamera(40, aspect, 0.1, 200)
    this.camera.position.set(0, 0, 80)
    this.camera.lookAt(0, 0, 0)

    const scenePass = pass(this.scene, this.camera)
    const sceneColor = scenePass.getTextureNode('output')
    const bloomPass = bloom(sceneColor, 0.35, 0.15, 0.6)
    this.postProcessing = new PostProcessing(renderer)
    this.postProcessing.outputNode = sceneColor.add(bloomPass)
    this.postProcessing.needsUpdate = true

    this.hud = new ArcadeHUD(uiContainer)
    this.hud.onAction((action, params) => this.handleUiAction(action, params))

    this.setPhase('title')
    this.syncMenuBackground()
    this.bridge.emitEvent('arcade_started', { mode: 'campaign' })
  }

  update(delta: number): void {
    this.syncMenuBackground()

    if (this.state.phase === 'combat' && this.arena) {
      const events = this.arena.update(delta)
      for (const event of events) this.handleCombatEvent(event)

      const snapshot = this.arena.getSnapshot()
      this.state = buildCombatState(this.state, snapshot, this.campaign?.score ?? 0)
      this.music.setCue(
        snapshot.boss
          ? 'arcade_boss'
          : snapshot.player.health < snapshot.player.maxHealth * 0.35
            ? 'arcade_danger'
            : 'arcade_action',
      )

      if (this.arena.isDone()) {
        this.finishCombat()
      }
    } else {
      this.menuBackground?.update(delta)
      this.music.setCue('arcade_menu')
    }
    this.hud.update(this.buildView())
  }

  render(): void {
    this.postProcessing.render()
    flushDeferredDisposals()
  }

  handleResize(width: number, height: number): void {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  handleAction(name: string, params: Record<string, unknown>): boolean {
    if (name === 'arcade') return true
    if (name === 'next_mission') {
      void this.advanceToNextMission()
      return true
    }

    if (name === 'next') {
      if (this.state.phase === 'briefing') {
        this.launchLevel()
        return true
      }
      if (this.state.phase === 'debrief') {
        this.handleUiAction('debrief_continue', {})
        return true
      }
      if (this.state.phase === 'map') {
        this.openBriefing()
        return true
      }
    }

    if (name === 'jump') {
      const value = params.to
      const levelId = typeof value === 'number'
        ? MAIN_ROUTE[Math.max(0, Math.min(MAIN_ROUTE.length - 1, value))]
        : String(value)
      if (levelId) {
        this.selectedLevelId = levelId
        this.openBriefing()
        return true
      }
    }

    if (name === 'set') {
      const field = String(params.field ?? '')
      const value = params.value
      if (field === 'phase' && (value === 'next_mission' || value === 'arcade_next_mission')) {
        void this.advanceToNextMission()
        return true
      }
      if (field === 'credits' && this.campaign) {
        this.campaign.credits = Number(value) || this.campaign.credits
        this.persistCampaignState({ syncSummary: true })
        this.message = 'Credits updated.'
        return true
      }
      if (field === 'difficulty') {
        this.setDifficulty(String(value) as Difficulty)
        return true
      }
      if (field === 'health' && this.arena && this.state.phase === 'combat') {
        this.message = 'Health override is not available in Command Center.'
        return true
      }
    }

    if (name === 'end') {
      if (this.state.phase === 'combat') {
        this.abortCombat('Combat aborted.')
      } else {
        this.exitArcade()
      }
      return true
    }

    return false
  }

  getState(): ArcadeState {
    return this.state
  }

  dispose(): void {
    this.disposeArena()
    this.menuBackground?.dispose()
    this.menuBackground = null
    this.menuBackgroundPlanet = null
    this.hud.dispose()
    this.postProcessing.dispose()
    flushDeferredDisposals()
  }

  private handleUiAction(action: string, params: Record<string, string>): void {
    routeArcadeUiAction(action, params, {
      phase: this.state.phase,
      debriefSuccess: Boolean(this.state.debrief?.success),
      firstDataLogId: this.campaign?.dataLog[0] ?? null,
      startCampaign: (slot, continueExisting) => this.startCampaign(slot, continueExisting),
      setDifficulty: (difficulty) => this.setDifficulty(difficulty),
      exitArcade: () => this.exitArcade(),
      persistCampaignState: (options) => this.persistCampaignState(options),
      setPhase: (phase) => this.setPhase(phase),
      setSelectedLevel: (levelId) => { this.selectedLevelId = levelId },
      setMessage: (message) => { this.message = message },
      openBriefing: () => this.openBriefing(),
      launchLevel: () => { void this.launchLevel() },
      setShopTab: (tab) => { this.shopTab = tab },
      runShopAction: (shopAction, entryId, slot) => this.runNamedShopAction(shopAction, entryId, slot),
      abortOrBackToMap: () => this.backToMap(),
      continueDebrief: () => this.advanceCampaignRoute(),
      setSelectedLog: (logId) => { this.selectedLogId = logId },
      retryLevel: () => this.openBriefing(),
    })
  }

  private buildView() {
    return buildArcadeViewModel({
      state: this.state,
      campaign: this.campaign,
      saveSlots: this.saveSlots,
      selectedLevelId: this.selectedLevelId,
      shopTab: this.shopTab,
      selectedLogId: this.selectedLogId,
      message: this.message,
    })
  }

  private startCampaign(slot: number, continueExisting: boolean): void {
    this.disposeArena()
    this.campaign = continueExisting
      ? loadCampaign(slot)
      : createNewCampaign(slot, this.state.difficulty)
    if (!this.campaign) {
      this.message = 'No save found in that slot.'
      return
    }

    this.shopTab = 'front'
    this.selectedLevelId = this.campaign.currentLevel
    this.state = buildCampaignArcadeState(slot, this.campaign, this.shopTab)
    this.message = continueExisting ? 'Campaign loaded.' : 'New campaign created.'
    this.persistCampaignState()
  }

  private openBriefing(): void {
    if (!this.campaign) return
    if (!isLevelUnlocked(this.campaign, this.selectedLevelId)) {
      this.message = 'That route is still locked.'
      return
    }

    this.state = {
      ...this.state,
      phase: 'briefing',
      ...levelSummary(this.selectedLevelId),
      debrief: null,
    }
    this.message = getLevelDef(this.selectedLevelId).briefing
  }

  private async launchLevel(): Promise<void> {
    if (!this.campaign) return

    await preloadAtlases()
    this.disposeArena()
    this.arena = new Arena(this.arenaRoot, this.campaign, this.selectedLevelId)
    const level = getLevelDef(this.selectedLevelId)
    this.state = {
      ...this.state,
      phase: 'combat',
      ...levelSummary(this.selectedLevelId),
      debrief: null,
      comms: [level.briefing],
    }
    this.message = level.briefing
  }

  private async advanceToNextMission(): Promise<void> {
    if (!this.campaign) {
      this.message = 'Load a campaign first.'
      return
    }

    if (this.state.phase === 'title') {
      this.message = 'Load a campaign first.'
      return
    }

    if (this.state.phase === 'combat' && this.arena) {
      for (const event of this.arena.forceFinish(true)) {
        this.handleCombatEvent(event)
      }
      this.finishCombat()
    }

    const next = advanceCampaignRouteState(this.campaign, this.selectedLevelId)
    this.campaign = next.campaign

    if (!next.nextLevel) {
      this.state = {
        ...this.state,
        credits: this.campaign.credits,
        score: this.campaign.score,
        debrief: null,
      }
      this.message = 'Campaign route complete.'
      return
    }

    this.selectedLevelId = next.selectedLevelId
    this.persistCampaignState({ refreshSlots: false, syncSummary: true })
    this.openBriefing()
    if (this.state.phase !== 'briefing') return

    await this.launchLevel()
  }

  private finishCombat(): void {
    if (!this.arena || !this.campaign) return

    const debrief = this.arena.getDebrief()
    const successful = this.arena.wasSuccessful()

    this.campaign = applyCombatResults(this.campaign, {
      selectedLevelId: this.selectedLevelId,
      successful,
      debrief,
      inventory: this.arena.getResultLoadout(),
      collectedLogs: this.arena.getCollectedLogs(),
      secretFinds: this.arena.getSecretFinds(),
      earnedUpgrades: this.arena.getEarnedUpgrades(),
      weaponKills: this.arena.getWeaponKills(),
    })
    this.persistCampaignState()

    this.state = {
      ...this.state,
      phase: debrief?.success ? 'debrief' : 'game_over',
      score: this.campaign.score,
      credits: this.campaign.credits,
      debrief: debrief ?? null,
    }
    this.message = debrief?.summary ?? 'Mission failed.'
    this.disposeArena()
  }

  private advanceCampaignRoute(): void {
    if (!this.campaign) return

    const next = advanceCampaignRouteState(this.campaign, this.selectedLevelId)
    this.campaign = next.campaign
    this.selectedLevelId = next.selectedLevelId
    if (next.nextLevel) {
      this.persistCampaignState({ refreshSlots: false })
    }

    this.state = {
      ...this.state,
      credits: this.campaign.credits,
      score: this.campaign.score,
      ...levelSummary(this.selectedLevelId),
      debrief: null,
    }
    this.message = next.nextLevel ? 'Route updated.' : 'Campaign route complete.'
  }

  private handleCombatEvent(event: ArcadeEvent): void {
    this.bridge.emitEvent(event.type, event as unknown as Record<string, unknown>)
    const message = combatEventMessage(event)
    if (message) {
      this.message = message
    }
  }

  private abortCombat(message: string): void {
    this.disposeArena()
    this.state = {
      ...this.state,
      phase: 'map',
      credits: this.campaign?.credits ?? this.state.credits,
      score: this.campaign?.score ?? this.state.score,
      debrief: null,
    }
    this.message = message
  }

  private backToMap(): void {
    if (this.state.phase === 'combat') {
      this.abortCombat('Mission aborted. Returning to campaign map.')
      return
    }

    this.persistCampaignState({ refreshSlots: false })
    this.setPhase('map')
  }

  private setPhase(phase: ArcadePhase): void {
    this.state = {
      ...this.state,
      phase,
      currentTab: this.shopTab,
    }
  }

  private runNamedShopAction(action: string, entryId: string, slot?: WeaponSlot): void {
    switch (action) {
      case 'buy_entry':
        this.runShopAction(() => buyEntry(this.mustCampaign(), this.shopTab, entryId, slot))
        return
      case 'equip_entry':
        this.runShopAction(() => equipEntry(this.mustCampaign(), this.shopTab, entryId))
        return
      case 'upgrade_entry':
        this.runShopAction(() => upgradeWeapon(this.mustCampaign(), entryId))
        return
      case 'sell_slot':
        this.runShopAction(() => sellEquipped(this.mustCampaign(), slot ?? 'front'))
        return
      case 'buy_ammo':
        this.runShopAction(() => buyAmmo(this.mustCampaign(), entryId))
        return
      case 'equip_left':
        this.runShopAction(() => equipEntry(this.mustCampaign(), 'sidekicks', entryId, 'sidekickL'))
        return
      case 'equip_right':
        this.runShopAction(() => equipEntry(this.mustCampaign(), 'sidekicks', entryId, 'sidekickR'))
        return
    }
  }

  private runShopAction(action: () => { changed: boolean; message: string }): void {
    if (!this.campaign) return
    const result = action()
    this.message = result.message
    if (result.changed) {
      this.persistCampaignState({ syncSummary: true })
    }
  }

  private refreshSlots(): void {
    this.saveSlots = listSaveSlots()
  }

  private syncCampaignSummary(): void {
    if (!this.campaign) return
    this.state = {
      ...this.state,
      credits: this.campaign.credits,
      score: this.campaign.score,
      difficulty: this.campaign.difficulty,
    }
  }

  private disposeArena(): void {
    this.arena?.dispose()
    this.arena = null
  }

  private resolveMenuPlanet(): PlanetId {
    if (this.selectedLevelId) {
      return getLevelDef(this.selectedLevelId).planet
    }
    return this.state.planetId
  }

  private syncMenuBackground(): void {
    if (this.state.phase === 'combat') {
      if (this.menuBackground) {
        this.menuBackground.group.visible = false
      }
      return
    }

    const planetId = this.resolveMenuPlanet()
    if (!this.menuBackground || this.menuBackgroundPlanet !== planetId) {
      this.menuBackground?.dispose()
      this.menuBackground = new BackgroundController(planetId)
      this.scene.add(this.menuBackground.group)
      this.menuBackgroundPlanet = planetId
    }

    this.menuBackground.group.visible = true
  }

  private setDifficulty(difficulty: Difficulty): void {
    this.state.difficulty = difficulty
    if (this.campaign) {
      this.campaign.difficulty = difficulty
      this.persistCampaignState()
    }
    this.message = `Difficulty set to ${difficulty.toUpperCase()}.`
  }

  private persistCampaignState(options: { refreshSlots?: boolean; syncSummary?: boolean } = {}): void {
    if (!this.campaign) return

    const { refreshSlots = true, syncSummary = false } = options
    saveCampaign(this.campaign)
    if (refreshSlots) this.refreshSlots()
    if (syncSummary) this.syncCampaignSummary()
  }

  private mustCampaign(): CampaignState {
    if (!this.campaign) {
      throw new Error('Arcade campaign not loaded.')
    }
    return this.campaign
  }

  private exitArcade(): void {
    this.dispose()
    this.onExit()
  }
}
