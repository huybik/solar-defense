import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
} from 'three/webgpu'
import { float, texture } from 'three/tsl'
import { ARENA, type BackgroundPalette, type PlanetId } from '../types'
import { cloneTexture } from './sprites'
import { removeAndDisposeObjectLater } from './deferred-dispose'

export const BACKGROUND_PALETTES: Record<PlanetId, BackgroundPalette> = {
  mercury: { id: 'mercury', tint: '#9da0a6', glow: '#ffd27a', far: 'black', near: 'darkPurple', texture: 'mercury_nasa', scroll: [0.008, 0.014, 0.02] },
  venus: { id: 'venus', tint: '#f48f45', glow: '#ffb26f', far: 'purple', near: 'purple', texture: 'venus_nasa', scroll: [0.01, 0.016, 0.024] },
  earth: { id: 'earth', tint: '#4cc9ff', glow: '#8ae0ff', far: 'blue', near: 'blue', texture: 'earth_day_4096', scroll: [0.009, 0.015, 0.022] },
  mars: { id: 'mars', tint: '#d96f45', glow: '#ff9a64', far: 'darkPurple', near: 'darkPurple', texture: 'mars_nasa', scroll: [0.01, 0.017, 0.026] },
  jupiter: { id: 'jupiter', tint: '#d89b54', glow: '#f1c47d', far: 'purple', near: 'purple', texture: 'jupiter_nasa', scroll: [0.008, 0.013, 0.019] },
  saturn: { id: 'saturn', tint: '#d2b57c', glow: '#f3e0ad', far: 'blue', near: 'blue', texture: 'saturn_nasa', scroll: [0.008, 0.012, 0.018] },
  uranus: { id: 'uranus', tint: '#6fd0d4', glow: '#9de7e8', far: 'blue', near: 'blue', texture: 'uranus_nasa', scroll: [0.008, 0.014, 0.02] },
  neptune: { id: 'neptune', tint: '#4770d6', glow: '#74a4ff', far: 'darkPurple', near: 'black', texture: 'neptune_nasa', scroll: [0.008, 0.014, 0.022] },
  secret: { id: 'secret', tint: '#f7d760', glow: '#ffefad', far: 'black', near: 'purple', texture: 'moon_1024', scroll: [0.01, 0.018, 0.025] },
}

export class BackgroundController {
  readonly group = new Group()

  private planetMesh: Mesh
  private tintMesh: Mesh
  private flashMesh: Mesh
  private palette: BackgroundPalette
  private flashOpacity = 0
  private bossDarken = false
  private bossDarkenT = 0

  constructor(planetId: PlanetId) {
    this.palette = BACKGROUND_PALETTES[planetId]

    this.planetMesh = this.createPlanetLayer(this.palette.texture)
    this.planetMesh.position.z = -6

    this.tintMesh = new Mesh(
      new PlaneGeometry(ARENA.WIDTH * 3.4, ARENA.HEIGHT * 2.6),
      new MeshBasicMaterial({
        color: new Color(this.palette.tint),
        transparent: true,
        opacity: 0.18,
        blending: AdditiveBlending,
      }),
    )
    this.tintMesh.position.z = -3.5

    this.flashMesh = new Mesh(
      new PlaneGeometry(ARENA.WIDTH * 3.5, ARENA.HEIGHT * 2.8),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }),
    )
    this.flashMesh.position.z = -2
    this.flashMesh.visible = false

    this.group.add(this.planetMesh, this.tintMesh, this.flashMesh)
  }

  update(delta: number, hazardTint = 0): void {
    const mat = this.planetMesh.material as MeshBasicMaterial
    if (mat.map) {
      mat.map.offset.x += this.palette.scroll[1] * delta
    }

    this.updateFlash(delta)
    this.updateBossDarken(delta)

    const darken = 1 - this.bossDarkenT * 0.4
    const tintMaterial = this.tintMesh.material as MeshBasicMaterial
    tintMaterial.opacity = (0.18 + hazardTint * 0.24) * darken
  }

  flashBackground(color: string, intensity: number): void {
    ; (this.flashMesh.material as MeshBasicMaterial).color.set(color)
    this.flashOpacity = intensity
    this.flashMesh.visible = true
      ; (this.flashMesh.material as MeshBasicMaterial).opacity = intensity
  }

  setBossDarken(active: boolean): void {
    this.bossDarken = active
  }

  dispose(): void {
    this.disposeMesh(this.planetMesh, true)
    this.disposeMesh(this.tintMesh)
    this.disposeMesh(this.flashMesh)
    this.group.removeFromParent()
  }

  private createPlanetLayer(key: string): Mesh {
    const layerTexture = cloneTexture(key)
    layerTexture.wrapS = RepeatWrapping
    layerTexture.wrapT = RepeatWrapping
    layerTexture.rotation = Math.PI / 2
    layerTexture.center.set(0.5, 0.5)
    layerTexture.repeat.set(1.8, 1.18)

    const material = new MeshBasicNodeMaterial()

    material.map = layerTexture
    material.colorNode = texture(layerTexture).rgb
    material.opacityNode = float(0.4)
    material.transparent = true
    material.toneMapped = false

    const mesh = new Mesh(
      new PlaneGeometry(ARENA.WIDTH * 3.5, ARENA.HEIGHT * 2.8),
      material,
    )
    return mesh
  }

  private updateFlash(delta: number): void {
    if (this.flashOpacity <= 0) return
    this.flashOpacity = Math.max(0, this.flashOpacity - delta / 0.3)
      ; (this.flashMesh.material as MeshBasicMaterial).opacity = this.flashOpacity
    if (this.flashOpacity <= 0) this.flashMesh.visible = false
  }

  private updateBossDarken(delta: number): void {
    const target = this.bossDarken ? 1 : 0
    if (Math.abs(this.bossDarkenT - target) < 0.001) { this.bossDarkenT = target; return }
    this.bossDarkenT += (target - this.bossDarkenT) * Math.min(1, delta * 2.5)
    const darken = 1 - this.bossDarkenT * 0.4
      ; (this.planetMesh.material as MeshBasicNodeMaterial).opacityNode = float(0.4 * darken)
  }

  private disposeMesh(mesh: Mesh, disposeMap = false): void {
    removeAndDisposeObjectLater(mesh, { disposeMap })
  }
}
