import { MathUtils, PerspectiveCamera, Vector3 } from 'three/webgpu'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { PlanetMission, PlanetVisual } from '../types'

interface CameraTransition {
  fromPosition: Vector3
  fromTarget: Vector3
  toOffset: Vector3
  startedAt: number
  durationMs: number
}

function easeInOut(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

export class CameraController {
  private transition: CameraTransition | null = null
  private trackedPlanetId = ''
  private trackedPlanetWorld: Vector3 | null = null
  private _tmpV1 = new Vector3()
  private _tmpV2 = new Vector3()
  cameraDetached = false

  focusPlanet(
    camera: PerspectiveCamera,
    controls: OrbitControls,
    visual: PlanetVisual,
    mission: PlanetMission,
    animate: boolean,
  ) {
    const target = visual.anchor.getWorldPosition(this._tmpV1)
    const offset = this._tmpV2.set(
      mission.focusDistance * 0.96,
      mission.focusDistance * 0.34,
      mission.focusDistance,
    )
    this.cameraDetached = false
    this.trackedPlanetId = mission.id

    if (!animate) {
      controls.target.copy(target)
      camera.position.copy(target).add(offset)
      ;(this.trackedPlanetWorld ??= new Vector3()).copy(target)
      controls.update()
      return
    }

    this.transition = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toOffset: offset.clone(),
      startedAt: performance.now(),
      durationMs: 1600,
    }
    this.trackedPlanetWorld = null
  }

  update(
    camera: PerspectiveCamera,
    controls: OrbitControls,
    visual: PlanetVisual | undefined,
    mission: PlanetMission | null,
  ) {
    this.updateTransition(camera, controls, visual, mission)
    this.followPlanet(camera, controls, visual, mission)
  }

  reset() {
    this.transition = null
    this.trackedPlanetId = ''
    this.trackedPlanetWorld = null
    this.cameraDetached = false
  }

  detachOnDrag(
    pointerDown: boolean,
    event: PointerEvent,
    downX: number,
    downY: number,
  ): boolean {
    if (!pointerDown || this.cameraDetached) return false
    if (event.buttons === 0) return false
    if (Math.hypot(event.clientX - downX, event.clientY - downY) < 3) return false

    this.cameraDetached = true
    this.transition = null
    return true
  }

  private updateTransition(
    camera: PerspectiveCamera,
    controls: OrbitControls,
    visual: PlanetVisual | undefined,
    mission: PlanetMission | null,
  ) {
    if (!this.transition || !mission || !visual) return

    const currentTarget = visual.anchor.getWorldPosition(this._tmpV1)
    const destination = this._tmpV2.copy(currentTarget).add(this.transition.toOffset)
    const progress = MathUtils.clamp((performance.now() - this.transition.startedAt) / this.transition.durationMs, 0, 1)
    const eased = easeInOut(progress)

    camera.position.lerpVectors(this.transition.fromPosition, destination, eased)
    controls.target.lerpVectors(this.transition.fromTarget, currentTarget, eased)

    if (progress >= 1) {
      this.trackedPlanetId = mission.id
      ;(this.trackedPlanetWorld ??= new Vector3()).copy(currentTarget)
      this.transition = null
    }
  }

  private followPlanet(
    camera: PerspectiveCamera,
    controls: OrbitControls,
    visual: PlanetVisual | undefined,
    mission: PlanetMission | null,
  ) {
    if (this.transition || !mission || !visual) return

    const currentTarget = visual.anchor.getWorldPosition(this._tmpV1)

    if (!this.trackedPlanetWorld || this.trackedPlanetId !== mission.id) {
      this.trackedPlanetId = mission.id
      ;(this.trackedPlanetWorld ??= new Vector3()).copy(currentTarget)
      return
    }

    const delta = this._tmpV2.copy(currentTarget).sub(this.trackedPlanetWorld)
    if (delta.lengthSq() <= 0) return

    controls.target.add(delta)
    camera.position.add(delta)
    this.trackedPlanetWorld.copy(currentTarget)
  }
}
