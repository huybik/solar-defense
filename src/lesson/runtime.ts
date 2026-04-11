import type { GameContext } from '@learnfun/game-sdk'
import { Clock, MathUtils } from 'three/webgpu'
import { DEFAULT_INIT_DATA, buildMissions } from '../planet/data'
import { SceneManager } from '../scene/manager'
import { CameraController } from '../scene/camera'
import { buildShell, renderUI, type UIElements } from '../ui/index'
import { INTERACTIVE_PHASES } from '../types'
import type { Phase, PlanetMission, SolarState } from '../types'
import { ArcadeMode } from '../arcade'
import { GameMusic, type MusicCue } from '../audio/music'
import { CinematicController } from '../cinematic/cinematic'
import {
  answerPuzzle,
  getCorrectChoiceId,
  nextPlanetIndex,
  resetPlanetProgress,
  resetVoyageProgress,
  resolveHotspot,
  revealAllHotspots,
} from './flow'
import {
  emitGameCompleted,
  emitGameStarted,
  emitPhaseChange,
  emitPlanetArrived,
  emitPuzzleResolved,
  emitPuzzleUnlocked,
  emitScanRevealed,
} from './events'
import {
  createLessonPointerState,
  endLessonPointer,
  resolveLessonUiInteraction,
  startLessonPointer,
} from './interactions'

declare const __IS_STANDALONE__: boolean

const VALID_PHASES = new Set<Phase>(['briefing', 'explore', 'puzzle', 'warp', 'end', 'arcade'])

export class SolarGameRuntime {
  private readonly sceneManager = new SceneManager()
  private readonly cameraController = new CameraController()
  private readonly clock = new Clock()
  private readonly music = new GameMusic()

  private ctx!: GameContext<SolarState>
  private ui!: UIElements
  private missions: PlanetMission[] = buildMissions(DEFAULT_INIT_DATA)
  private initDataStore: unknown = DEFAULT_INIT_DATA
  private setupPromise: Promise<void> | null = null
  private warmupComplete = false
  private fatalError = ''
  private hoverHotspotId = ''
  private autoAdvanceTimer = 0
  private warpTimer = 0
  private onReadyToken = 0
  private pointerState = createLessonPointerState()
  private arcadeMode: ArcadeMode | null = null
  private cinematicActive = false
  private lastRenderedPlanetIndex = -1

  init(ctx: GameContext<SolarState>, data: unknown) {
    this.ctx = ctx
    this.ui = buildShell(ctx.root)
    this.ui.shell.addEventListener('click', this.handleUiClick)
    this.doInit(data)
  }

  dispatchAction(name: string, params: Record<string, unknown>) {
    if (this.ctx.state.phase === 'arcade' && this.arcadeMode?.handleAction(name, params)) {
      this.commitState()
      return
    }

    if (this.fatalError && name !== 'end') return

    switch (name) {
      case 'submit': {
        const value = String(params.value ?? '')
        if (this.ctx.state.phase === 'explore') this.revealHotspot(value)
        else if (this.ctx.state.phase === 'puzzle') this.answerPuzzle(value)
        return
      }
      case 'next':
        this.advance()
        return
      case 'reveal':
        this.revealCurrentPhase()
        return
      case 'jump': {
        const index = MathUtils.clamp(Number(params.to), 0, this.missions.length - 1)
        this.clearTimers()
        this.enterPlanet(index, true)
        return
      }
      case 'end':
        this.finish('quit')
        return
      case 'arcade':
        this.enterArcade()
        return
      case 'cinematic':
        if (!this.cinematicActive) void this.playCinematic()
        return
      case 'set':
        this.handleSetAction(params)
        return
    }
  }

  render() {
    renderUI(this.ui, this.ctx.state, this.missions, this.fatalError)
    this.syncHotspots()

    if (
      this.lastRenderedPlanetIndex >= 0
      && this.lastRenderedPlanetIndex !== this.ctx.state.planetIndex
    ) {
      this.hoverHotspotId = ''
      this.clearTimers()
      this.focusCurrentPlanet(true)
    }

    this.lastRenderedPlanetIndex = this.ctx.state.planetIndex
  }

  getTeacherState(): Record<string, unknown> {
    if (this.ctx.state.phase === 'arcade' && this.arcadeMode) {
      const arcade = this.arcadeMode.getState()
      return {
        phase: 'arcade',
        arcadePhase: arcade.phase,
        mode: arcade.mode,
        difficulty: arcade.difficulty,
        planet: arcade.planetName,
        level: arcade.levelName,
        score: arcade.score,
        credits: arcade.credits,
        wave: arcade.wave,
        totalWaves: arcade.totalWaves,
        boss: arcade.bossName,
        hasOwnHUD: true,
      }
    }

    const mission = this.currentMission()
    return {
      phase: this.ctx.state.phase,
      planetIndex: this.ctx.state.planetIndex,
      planet: mission?.name ?? '',
      score: this.ctx.state.score,
      streak: this.ctx.state.streak,
      cluesFound: this.ctx.state.scannedHotspots.length,
      cluesTotal: mission?.hotspots.length ?? 0,
      answered: this.ctx.state.answered,
      currentAnswer: mission?.answer ?? '',
      hasOwnHUD: true,
    }
  }

  serializeState(state: SolarState): SolarState {
    return { ...state, peers: [] }
  }

  destroy() {
    this.arcadeMode?.dispose()
    this.arcadeMode = null
    this.clearTimers()
    this.cameraController.reset()
    this.music.dispose()
    window.removeEventListener('resize', this.handleResize)

    const canvas = this.sceneManager.renderer?.domElement
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handleStagePointerDown)
      canvas.removeEventListener('pointerup', this.handleStagePointerUp)
      canvas.removeEventListener('pointercancel', this.handleStagePointerUp)
      canvas.removeEventListener('pointermove', this.handlePointerMove)
      canvas.removeEventListener('click', this.handleStageClick)
    }

    this.ui.shell.removeEventListener('click', this.handleUiClick)
    this.sceneManager.dispose()
    this.setupPromise = null
  }

  private async ensureScene() {
    if (!this.setupPromise) {
      this.setupPromise = this.setupScene()
    }
    return this.setupPromise
  }

  private async setupScene() {
    await this.sceneManager.setup(this.ui.stage, this.missions)

    this.sceneManager.handleResize(this.ui.stage)
    window.addEventListener('resize', this.handleResize)

    const canvas = this.sceneManager.renderer!.domElement
    canvas.addEventListener('pointerdown', this.handleStagePointerDown)
    canvas.addEventListener('pointerup', this.handleStagePointerUp)
    canvas.addEventListener('pointercancel', this.handleStagePointerUp)
    canvas.addEventListener('pointermove', this.handlePointerMove)
    canvas.addEventListener('click', this.handleStageClick)

    this.sceneManager.renderer!.setAnimationLoop(this.animateLoop)
  }

  private currentMission(): PlanetMission | null {
    return this.missions[this.ctx.state.planetIndex] || null
  }

  private advance() {
    switch (this.ctx.state.phase) {
      case 'briefing':
        this.setPhase('explore')
        return
      case 'explore':
        this.revealAllHotspots()
        return
      case 'puzzle':
        if (!this.ctx.state.answered) this.revealCurrentPhase()
        this.advanceAfterPuzzle()
        return
      case 'warp':
        this.completeWarp()
        return
      case 'end':
      case 'arcade':
        return
    }
  }

  private revealCurrentPhase() {
    if (this.ctx.state.phase === 'explore') {
      this.revealAllHotspots()
      return
    }

    if (this.ctx.state.phase !== 'puzzle' || this.ctx.state.answered) return

    const mission = this.currentMission()
    if (!mission) return

    this.ctx.state.answered = true
    this.ctx.state.selectedChoice = getCorrectChoiceId(mission)
    this.commitState({ syncHotspots: false })
  }

  private revealAllHotspots() {
    const mission = this.currentMission()
    if (!mission) return

    revealAllHotspots(this.ctx.state, mission)
    this.hoverHotspotId = ''
    this.setPhase('puzzle')
    emitPuzzleUnlocked(this.ctx, mission)
  }

  private revealHotspot(value: string) {
    const mission = this.currentMission()
    if (!mission) return

    const hotspot = resolveHotspot(mission, value)
    if (!hotspot || this.ctx.state.scannedHotspots.includes(hotspot.id)) return

    this.ctx.state.scannedHotspots = [...this.ctx.state.scannedHotspots, hotspot.id]
    emitScanRevealed(this.ctx, mission, {
      hotspot: hotspot.label,
      clue: hotspot.clue,
      count: this.ctx.state.scannedHotspots.length,
    })

    if (this.ctx.state.scannedHotspots.length >= mission.hotspots.length) {
      this.setPhase('puzzle')
      emitPuzzleUnlocked(this.ctx, mission)
      return
    }

    this.commitState()
  }

  private answerPuzzle(value: string) {
    const mission = this.currentMission()
    if (!mission) return

    const result = answerPuzzle(this.ctx.state, mission, value)
    if (!result) return

    emitPuzzleResolved(this.ctx, mission, {
      choiceLabel: result.choiceLabel,
      correct: result.correct,
      score: this.ctx.state.score,
    })

    this.commitState({ syncHotspots: false })
    this.autoAdvanceTimer = window.setTimeout(() => this.advanceAfterPuzzle(), 2200)
  }

  private advanceAfterPuzzle() {
    this.clearAutoAdvanceTimer()

    const nextIndex = nextPlanetIndex(this.ctx.state.planetIndex, this.missions.length)
    if (nextIndex === null) {
      this.finish('completed')
      return
    }

    this.setPhase('warp')
    this.warpTimer = window.setTimeout(() => this.completeWarp(), 1200)
  }

  private completeWarp() {
    this.clearWarpTimer()

    const nextIndex = nextPlanetIndex(this.ctx.state.planetIndex, this.missions.length)
    if (nextIndex === null) {
      this.finish('completed')
      return
    }

    this.enterPlanet(nextIndex, true)
  }

  private enterPlanet(index: number, animate: boolean) {
    this.clearTimers()
    resetPlanetProgress(this.ctx.state, index)
    this.focusCurrentPlanet(animate)
    this.commitState()

    const mission = this.currentMission()
    if (!mission) return

    emitPlanetArrived(this.ctx, mission, index)
  }

  private setPhase(phase: Phase, emit = true) {
    this.ctx.state.phase = phase
    this.commitState()

    if (!emit) return
    emitPhaseChange(this.ctx, phase, this.currentMission())
  }

  private finish(outcome: 'completed' | 'quit' | 'failed') {
    this.clearTimers()
    this.setPhase('end')
    emitGameCompleted(this.ctx, {
      score: this.ctx.state.score,
      outcome,
      planetsCompleted: this.ctx.state.planetIndex + (outcome === 'completed' ? 1 : 0),
    })
  }

  private enterArcade() {
    if (this.arcadeMode || !this.sceneManager.renderer) return

    this.clearTimers()
    this.setPhase('arcade')
    this.arcadeMode = new ArcadeMode(
      this.ctx.bridge,
      this.sceneManager.renderer,
      this.ui.shell,
      this.music,
      () => {
        this.arcadeMode = null
        this.setPhase('end')
        this.focusCurrentPlanet(false)
      },
    )
  }

  private doInit(data: unknown) {
    this.arcadeMode?.dispose()
    this.arcadeMode = null
    this.clearTimers()

    this.fatalError = ''
    this.hoverHotspotId = ''
    this.lastRenderedPlanetIndex = -1
    this.initDataStore = data || DEFAULT_INIT_DATA
    this.missions = buildMissions(this.initDataStore)
    resetVoyageProgress(this.ctx.state)
    this.music.warm()

    this.onReadyToken += 1
    this.updateUI()
    emitGameStarted(this.ctx, this.missions.length)

    const readyToken = this.onReadyToken
    void this.ensureScene()
      .then(async () => {
        if (readyToken !== this.onReadyToken) return

        // Standalone: cinematic intro → straight to arcade (skip observatory route)
        if (__IS_STANDALONE__) {
          if (!this.warmupComplete) {
            await this.playCinematic()
            if (readyToken !== this.onReadyToken) return
          }
          this.warmupComplete = true
          this.enterArcade()
          return
        }

        this.enterPlanet(0, !this.warmupComplete)
        this.warmupComplete = true
      })
      .catch((error) => {
        this.fatalError = error instanceof Error ? error.message : String(error)
        this.updateUI()
      })
  }

  private async playCinematic() {
    this.cinematicActive = true
    // Hide lesson UI during cinematic
    const overlay = this.ui.shell.querySelector<HTMLElement>('.solar-overlay')
    if (overlay) overlay.style.display = 'none'
    const cinematic = new CinematicController(
      this.sceneManager,
      this.cameraController,
      this.missions,
      this.ui.shell,
    )
    await cinematic.play()
    if (overlay) overlay.style.display = ''
    this.cinematicActive = false
  }

  private handleSetAction(params: Record<string, unknown>) {
    const field = String(params.field ?? '')
    const value = params.value

    if (field === 'score') {
      this.ctx.state.score = Number(value) || 0
      this.commitState({ syncHotspots: false })
      return
    }

    if (field === 'phase') {
      const phase = String(value) as Phase
      if (VALID_PHASES.has(phase)) {
        this.setPhase(phase)
      }
    }
  }

  private updateUI() {
    renderUI(this.ui, this.ctx.state, this.missions, this.fatalError)
  }

  private syncHotspots() {
    this.sceneManager.updateHotspotVisibility(
      this.currentMission(),
      this.ctx.state.phase,
      this.ctx.state.scannedHotspots,
    )
  }

  private commitState(options: { syncHotspots?: boolean } = {}) {
    const { syncHotspots = true } = options
    this.updateUI()
    if (syncHotspots) this.syncHotspots()
    this.ctx.sync()
  }

  private focusCurrentPlanet(animate: boolean) {
    const mission = this.currentMission()
    if (!mission || !this.sceneManager.camera || !this.sceneManager.controls) return

    const visual = this.sceneManager.visuals.get(mission.id)
    if (!visual) return

    this.cameraController.focusPlanet(
      this.sceneManager.camera,
      this.sceneManager.controls,
      visual,
      mission,
      animate,
    )
  }

  private clearTimers() {
    this.clearAutoAdvanceTimer()
    this.clearWarpTimer()
  }

  private clearAutoAdvanceTimer() {
    clearTimeout(this.autoAdvanceTimer)
    this.autoAdvanceTimer = 0
  }

  private clearWarpTimer() {
    clearTimeout(this.warpTimer)
    this.warpTimer = 0
  }

  private readonly handleUiClick = (event: MouseEvent) => {
    if (this.ctx.state.phase === 'arcade') return

    const interaction = resolveLessonUiInteraction(event.target as HTMLElement)
    if (!interaction) return

    switch (interaction.kind) {
      case 'choice':
        this.dispatchAction('submit', { value: interaction.value })
        return
      case 'action':
        this.dispatchAction(interaction.value, {})
        return
      case 'restart':
        this.doInit(this.initDataStore)
        return
    }
  }

  private readonly handleResize = () => {
    this.sceneManager.handleResize(this.ui.stage)
    if (!this.arcadeMode) return

    const width = Math.max(1, this.ui.stage.clientWidth)
    const height = Math.max(1, this.ui.stage.clientHeight)
    this.arcadeMode.handleResize(width, height)
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (!INTERACTIVE_PHASES.has(this.ctx.state.phase)) return

    if (this.pointerState.stagePointerDown) {
      const dragged = this.cameraController.detachOnDrag(
        this.pointerState.stagePointerDown,
        event,
        this.pointerState.stagePointerDownX,
        this.pointerState.stagePointerDownY,
      )
      if (dragged) {
        this.pointerState.stageDragged = true
        this.hoverHotspotId = ''
      }
      if (event.buttons === 0) this.pointerState.stagePointerDown = false
    }

    if (this.ctx.state.phase !== 'explore') return

    const mission = this.currentMission()
    if (!mission) return

    const nextId = this.sceneManager.raycastHotspots(event, mission.id) || ''
    if (nextId === this.hoverHotspotId) return

    this.hoverHotspotId = nextId
    if (this.sceneManager.renderer) {
      this.sceneManager.renderer.domElement.style.cursor = nextId ? 'pointer' : 'grab'
    }
  }

  private readonly handleStageClick = (event: MouseEvent) => {
    if (this.ctx.state.phase !== 'explore' || this.pointerState.stageDragged) return

    const mission = this.currentMission()
    if (!mission) return

    const hotspotId = this.sceneManager.raycastHotspots(event, mission.id)
    if (hotspotId) this.revealHotspot(hotspotId)
  }

  private readonly handleStagePointerDown = (event: PointerEvent) => {
    if (!INTERACTIVE_PHASES.has(this.ctx.state.phase)) return
    startLessonPointer(this.pointerState, event)
  }

  private readonly handleStagePointerUp = () => {
    endLessonPointer(this.pointerState)
    this.cameraController.cameraDetached = false
  }

  private readonly animateLoop = () => {
    if (
      !this.sceneManager.renderer
      || !this.sceneManager.scene
      || !this.sceneManager.camera
      || !this.sceneManager.controls
      || !this.sceneManager.postProcessing
    ) {
      return
    }

    const delta = this.clock.getDelta()

    if (this.ctx.state.phase === 'arcade' && this.arcadeMode) {
      this.arcadeMode.update(delta)
      this.arcadeMode.render()
      return
    }

    const elapsed = this.clock.elapsedTime
    this.sceneManager.animate(delta, elapsed)

    const mission = this.currentMission()
    const visual = mission ? this.sceneManager.visuals.get(mission.id) : undefined
    this.cameraController.update(this.sceneManager.camera, this.sceneManager.controls, visual, mission)

    this.sceneManager.controls.enabled = !this.cinematicActive && INTERACTIVE_PHASES.has(this.ctx.state.phase)
    this.sceneManager.controls.autoRotate = !this.cinematicActive && this.ctx.state.phase === 'briefing' && !this.cameraController.cameraDetached
    this.sceneManager.controls.autoRotateSpeed = 0.25
    this.sceneManager.controls.update()
    this.music.setCue(this.resolveLessonCue(), mission?.id ?? null)

    this.sceneManager.postProcessing.render()
  }

  private resolveLessonCue(): MusicCue {
    if (this.cinematicActive) return 'cinematic'

    switch (this.ctx.state.phase) {
      case 'briefing':
        return 'lesson_briefing'
      case 'explore':
        return 'lesson_explore'
      case 'puzzle':
        return 'lesson_puzzle'
      case 'warp':
        return 'lesson_warp'
      case 'end':
      case 'arcade':
        return 'lesson_end'
    }
  }
}
