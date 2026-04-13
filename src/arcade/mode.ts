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
import { routeArcadeUiAction, type ArcadeShopAction } from './ui-actions'
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
  private readonly renderer: WebGPURenderer
  private readonly postProcessing: PostProcessing
  private readonly onExit: () => void
  private readonly arenaRoot = new Group()

  private audioActivated = false
  private arena: Arena | null = null
  private menuBackground: BackgroundController | null = null
  private menuBackgroundPlanet: PlanetId | null = null
  private state: ArcadeState = createDefaultArcadeState()
  private campaign: CampaignState | null = null
  private saveSlots: Array<CampaignState | null> = listSaveSlots()
  private selectedLevelId = 'mercury_1'
  private shopTab: ShopTab = 'front'
  private shopReturnPhase: ArcadePhase = 'map'
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
    this.renderer = renderer
    this.onExit = onExit

    this.scene = new Scene()
    this.scene.background = new Color('#02040b')
    this.scene.add(new AmbientLight('#ffffff', 1.1))
    this.scene.add(this.arenaRoot)

    const aspect = this.renderer.domElement.width / this.renderer.domElement.height || 1
    this.camera = new PerspectiveCamera(40, aspect, 0.1, 200)
    this.camera.position.set(0, 0, 80)
    this.camera.lookAt(0, 0, 0)

    const scenePass = pass(this.scene, this.camera)
    const sceneColor = scenePass.getTextureNode('output')
    const bloomPass = bloom(sceneColor, 0.35, 0.15, 0.6)
    this.postProcessing = new PostProcessing(this.renderer)
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
      const anyPilotInDanger = snapshot.players.some((player) =>
        player.alive && player.health < player.maxHealth * 0.35,
      )
      this.state = buildCombatState(this.state, snapshot, this.campaign?.score ?? 0)
      this.music.setCue(
        snapshot.boss
          ? 'arcade_boss'
          : anyPilotInDanger
            ? 'arcade_danger'
            : 'arcade_action',
        snapshot.planetId,
      )

      if (this.arena.isDone()) {
        this.finishCombat()
      }
    } else {
      this.menuBackground?.update(delta)
      this.music.setCue('arcade_menu', this.resolveMenuPlanet())
    }
    this.hud.update(this.buildView())
  }

  render(): void {
    this.postProcessing.render()
  }

  activateAudio(): void {
    this.audioActivated = true
    this.music.activate()
    this.arena?.activateAudio()
  }

  handleResize(width: number, height: number): void {
    this.camera.aspect = width / height
    // Widen FOV in portrait so enough arena width is visible
    this.camera.fov = width < height ? 55 : 40
    this.camera.updateProjectionMatrix()

    // Clamp player movement to visible area in portrait
    const vfov = this.camera.fov * Math.PI / 180
    const visibleHalfWidth = 80 * Math.tan(vfov / 2) * this.camera.aspect
    this.arena?.setViewportBounds(visibleHalfWidth)
  }

  handleAction(name: string, params: Record<string, unknown>): boolean {
    switch (name) {
      case 'arcade':
        return true
      case 'next_mission':
        void this.advanceToNextMission()
        return true
      case 'next':
        return this.handleNextAction()
      case 'jump':
        return this.handleJumpAction(params.to)
      case 'set':
        return this.handleSetAction(params)
      case 'end':
        if (this.state.phase === 'combat') {
          this.abortCombat('Combat aborted.')
        } else {
          this.exitArcade()
        }
        return true
      default:
        return false
    }
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
  }

  private handleUiAction(action: string, params: Record<string, string>): void {
    routeArcadeUiAction(action, params, {
      startCampaign: (slot, continueExisting) => this.startCampaign(slot, continueExisting),
      setDifficulty: (difficulty) => this.setDifficulty(difficulty),
      exitArcade: () => this.exitArcade(),
      returnToTitle: () => this.returnToTitle(),
      selectLevel: (levelId) => this.selectLevel(levelId),
      openBriefing: () => this.openBriefing(),
      launchLevel: () => { void this.launchLevel() },
      setShopTab: (tab) => { this.shopTab = tab },
      openShop: () => this.openShop(),
      closeShop: () => this.closeShop(),
      openDataLog: () => this.openDataLog(),
      closeDataLog: () => this.closeDataLog(),
      runShopAction: (shopAction, entryId, slot) => this.runNamedShopAction(shopAction, entryId, slot),
      backToMap: () => this.backToMap(),
      continueDebrief: () => this.continueDebrief(),
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

  private patchState(patch: Partial<ArcadeState>): void {
    this.state = {
      ...this.state,
      ...patch,
      currentTab: this.shopTab,
    }
  }

  private campaignSummaryPatch(): Pick<ArcadeState, 'credits' | 'score' | 'difficulty'> {
    return {
      credits: this.campaign?.credits ?? this.state.credits,
      score: this.campaign?.score ?? this.state.score,
      difficulty: this.campaign?.difficulty ?? this.state.difficulty,
    }
  }

  private routeStatePatch(levelId = this.selectedLevelId) {
    return levelSummary(levelId)
  }

  private handleNextAction(): boolean {
    switch (this.state.phase) {
      case 'briefing':
        void this.launchLevel()
        return true
      case 'debrief':
        this.continueDebrief()
        return true
      case 'map':
        this.openBriefing()
        return true
      default:
        return false
    }
  }

  private handleJumpAction(value: unknown): boolean {
    const levelId = typeof value === 'number'
      ? MAIN_ROUTE[Math.max(0, Math.min(MAIN_ROUTE.length - 1, value))]
      : typeof value === 'string'
        ? value
        : ''
    if (!levelId) return false

    this.selectLevel(levelId)
    this.openBriefing()
    return true
  }

  private handleSetAction(params: Record<string, unknown>): boolean {
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

    return false
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

  private selectLevel(levelId: string): void {
    this.selectedLevelId = levelId
    this.message = `${this.routeStatePatch(levelId).levelName} selected.`
  }

  private openBriefing(): void {
    if (!this.campaign) return
    if (!isLevelUnlocked(this.campaign, this.selectedLevelId)) {
      this.message = 'That route is still locked.'
      return
    }

    this.patchState({
      phase: 'briefing',
      ...this.routeStatePatch(),
      debrief: null,
    })
    this.message = getLevelDef(this.selectedLevelId).briefing
  }

  private async launchLevel(): Promise<void> {
    if (!this.campaign) return

    await preloadAtlases()
    this.disposeArena()
    this.arena = new Arena(this.arenaRoot, this.campaign, this.selectedLevelId)
    if (this.audioActivated) this.arena.activateAudio()
    const canvas = this.renderer.domElement
    this.handleResize(
      Math.max(1, canvas.clientWidth || canvas.width),
      Math.max(1, canvas.clientHeight || canvas.height),
    )
    const level = getLevelDef(this.selectedLevelId)
    this.patchState({
      phase: 'combat',
      ...this.routeStatePatch(),
      debrief: null,
      comms: [level.briefing],
    })
    this.message = level.briefing
  }

  private advanceRoute() {
    if (!this.campaign) return null

    const next = advanceCampaignRouteState(this.campaign, this.selectedLevelId)
    this.campaign = next.campaign
    this.selectedLevelId = next.selectedLevelId
    return next
  }

  private async advanceToNextMission(): Promise<void> {
    if (!this.campaign || this.state.phase === 'title') {
      this.message = 'Load a campaign first.'
      return
    }

    if (this.state.phase === 'combat' && this.arena) {
      for (const event of this.arena.forceFinish(true)) {
        this.handleCombatEvent(event)
      }
      this.finishCombat()
    }

    const next = this.advanceRoute()
    if (!next) return

    if (!next.nextLevel) {
      this.patchState({
        ...this.campaignSummaryPatch(),
        debrief: null,
      })
      this.message = 'Campaign route complete.'
      return
    }

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

    this.patchState({
      phase: debrief?.success ? 'debrief' : 'game_over',
      ...this.campaignSummaryPatch(),
      debrief: debrief ?? null,
    })
    this.message = debrief?.summary ?? 'Mission failed.'
    this.disposeArena()
  }

  private advanceCampaignRoute(): void {
    const next = this.advanceRoute()
    if (!next) return
    if (next.nextLevel) {
      this.persistCampaignState({ refreshSlots: false })
    }

    this.patchState({
      phase: 'map',
      ...this.campaignSummaryPatch(),
      ...this.routeStatePatch(),
      debrief: null,
    })
    this.message = next.nextLevel ? 'Route updated.' : 'Campaign route complete.'
  }

  private handleCombatEvent(event: ArcadeEvent): void {
    this.bridge.emitEvent(event.type, event as unknown as Record<string, unknown>)
    if (event.type === 'portal_entered') {
      this.navigateToPortal()
      return
    }
    const message = combatEventMessage(event)
    if (message) {
      this.message = message
    }
  }

  private navigateToPortal(): void {
    const params = new URLSearchParams()
    params.set('portal', 'true')
    params.set('ref', window.location.origin + window.location.pathname)
    params.set('username', 'pilot')
    params.set('color', '#00ff88')
    params.set('speed', '5')
    window.location.href = 'https://portal.pieter.com?' + params.toString()
  }

  private abortCombat(message: string): void {
    this.disposeArena()
    this.patchState({
      phase: 'map',
      ...this.campaignSummaryPatch(),
      debrief: null,
    })
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

  private openShop(): void {
    this.shopTab = 'front'
    this.shopReturnPhase = this.state.phase === 'debrief' ? 'debrief' : 'map'
    this.setPhase('shop')
  }

  private closeShop(): void {
    const nextPhase = this.shopReturnPhase === 'debrief' && this.state.debrief
      ? 'debrief'
      : 'map'
    this.shopReturnPhase = 'map'
    this.setPhase(nextPhase)
  }

  private openDataLog(): void {
    this.selectedLogId = this.campaign?.dataLog[0] ?? null
    this.setPhase('data_log')
  }

  private closeDataLog(): void {
    this.setPhase('map')
  }

  private continueDebrief(): void {
    if (this.state.debrief?.success) {
      this.advanceCampaignRoute()
      return
    }

    this.openBriefing()
  }

  private returnToTitle(): void {
    this.persistCampaignState()
    this.setPhase('title')
  }

  private setPhase(phase: ArcadePhase): void {
    this.patchState({ phase })
  }

  private runNamedShopAction(action: ArcadeShopAction, entryId: string, slot?: WeaponSlot): void {
    const campaign = this.mustCampaign()
    const handlers: Record<ArcadeShopAction, () => { changed: boolean; message: string }> = {
      buy_entry: () => buyEntry(campaign, this.shopTab, entryId, slot),
      equip_entry: () => equipEntry(campaign, this.shopTab, entryId),
      upgrade_entry: () => upgradeWeapon(campaign, entryId),
      sell_slot: () => sellEquipped(campaign, slot ?? 'front'),
      buy_ammo: () => buyAmmo(campaign, entryId),
      equip_left: () => equipEntry(campaign, 'sidekicks', entryId, 'sidekickL'),
      equip_right: () => equipEntry(campaign, 'sidekicks', entryId, 'sidekickR'),
    }
    this.runShopAction(handlers[action])
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
    this.patchState(this.campaignSummaryPatch())
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
    this.patchState({ difficulty })
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
