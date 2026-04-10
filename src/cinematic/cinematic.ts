import { Vector3 } from 'three/webgpu'
import type { SceneManager } from '../scene/manager'
import type { CameraController } from '../scene/camera'
import type { PlanetMission } from '../types'
import { CINEMATIC_SCRIPT, CAMERA_FLY_MS } from './narration'
import { VoiceEngine } from './voice'
import { CinematicUI } from './ui'
import { SwarmEffect } from './swarm'
import './style.css'

/**
 * Orchestrates the cinematic intro sequence:
 * camera flies planet-to-planet while narration plays.
 */
export class CinematicController {
  private voice = new VoiceEngine()
  private swarm = new SwarmEffect()
  private ui: CinematicUI
  private aborted = false
  private abortController = new AbortController()

  constructor(
    private scene: SceneManager,
    private camera: CameraController,
    private missions: readonly PlanetMission[],
    container: HTMLElement,
  ) {
    this.ui = new CinematicUI(container)
  }

  /** Plays the full cinematic. Resolves when finished or skipped. */
  play(): Promise<void> {
    if (this.scene.scene) void this.swarm.start(this.scene.scene)

    return new Promise<void>((resolve) => {
      const done = () => {
        if (this.aborted) return
        this.aborted = true
        this.abortController.abort()
        this.voice.stop()
        if (this.scene.scene) this.swarm.destroy(this.scene.scene)
        this.ui.destroy()
        resolve()
      }

      this.ui.onSkip(done)
      void this.runSequence(done)
    })
  }

  // ── internal ──────────────────────────────────────────

  private async runSequence(done: () => void) {
    if (this.voice.needsActivation) {
      this.ui.showText('Tap BEGIN TRANSMISSION to enable voice-over.')
      const activated = await this.ui.waitForActionButton(
        'BEGIN TRANSMISSION',
        () => {},
        { signal: this.abortController.signal },
      )
      this.ui.hideText()
      if (!activated || this.aborted) return
      await this.wait(150)
    }

    for (const beat of CINEMATIC_SCRIPT) {
      if (this.aborted) return

      // Fly camera to planet (or sun)
      await this.flyToBeat(beat.planetIndex)
      if (this.aborted) return

      // Spawn visible swarm wave at current camera position
      if (this.scene.camera && this.scene.controls) {
        this.swarm.spawnWave(this.scene.camera.position, this.scene.controls.target)
      }

      // Show narration text + speak
      this.ui.showText(beat.text)

      const spoken = this.voice.supported
        ? await this.voice.speak(beat.text)
        : false

      if (!spoken) {
        await this.wait(beat.holdMs)
      }
      if (this.aborted) return

      // Brief pause between beats
      this.ui.hideText()
      await this.wait(400)
    }

    if (this.aborted) return

    // Show "BEGIN YOUR MISSION" button
    await this.ui.waitForActionButton(
      'BEGIN YOUR MISSION',
      done,
      { hideNarration: true, signal: this.abortController.signal },
    )
  }

  private flyToBeat(planetIndex: number): Promise<void> {
    const cam = this.scene.camera
    const controls = this.scene.controls
    if (!cam || !controls) return Promise.resolve()

    const tmp = new Vector3()

    if (planetIndex === -1) {
      // Fly toward the Sun (origin)
      const sunTarget = new Vector3(0, 0, 0)
      const sunPosition = new Vector3(8, 3, 12)
      return this.flyCamera(cam, controls, sunPosition, sunTarget)
    }

    // Find the planet visual
    const mission = this.missions[planetIndex]
    if (!mission) return Promise.resolve()

    const visual = this.scene.visuals.get(mission.id)
    if (!visual) return Promise.resolve()

    const worldPos = visual.anchor.getWorldPosition(tmp)
    const offset = new Vector3(
      mission.focusDistance * 0.96,
      mission.focusDistance * 0.34,
      mission.focusDistance,
    )
    const camPos = worldPos.clone().add(offset)

    return this.flyCamera(cam, controls, camPos, worldPos)
  }

  private flyCamera(
    cam: import('three/webgpu').PerspectiveCamera,
    controls: import('three/addons/controls/OrbitControls.js').OrbitControls,
    toPosition: Vector3,
    toTarget: Vector3,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      this.camera.flyTo(cam, controls, toPosition, toTarget, CAMERA_FLY_MS, resolve)
    })
  }

  private wait(ms: number): Promise<void> {
    if (this.aborted || this.abortController.signal.aborted) return Promise.resolve()

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.abortController.signal.removeEventListener('abort', handleAbort)
        resolve()
      }, ms)

      const handleAbort = () => {
        window.clearTimeout(timer)
        resolve()
      }

      this.abortController.signal.addEventListener('abort', handleAbort, { once: true })
    })
  }
}
