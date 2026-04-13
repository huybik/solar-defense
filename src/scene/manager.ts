import {
  ACESFilmicToneMapping,
  Color,
  MOUSE,
  PerspectiveCamera,
  PostProcessing,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TOUCH,
  Vector2,
  WebGPURenderer,
} from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { float, pass, saturation, screenUV, smoothstep } from 'three/tsl'
import { buildEnvironment } from './environment'
import { buildAllPlanets, streamProceduralTextures } from '../planet/factory'
import { applyNasaTextures, loadNasaTextures } from '../planet/nasa-textures'
import { INTERACTIVE_PHASES } from '../types'
import type { LoadedTextures, Phase, PlanetMission, PlanetVisual } from '../types'

export class SceneManager {
  renderer: WebGPURenderer | null = null
  scene: Scene | null = null
  camera: PerspectiveCamera | null = null
  controls: OrbitControls | null = null
  postProcessing: PostProcessing | null = null
  visuals = new Map<string, PlanetVisual>()

  private textures: LoadedTextures | null = null
  private textureLoadPromise: Promise<void> | null = null
  private textureLoadToken = 0
  private raycaster = new Raycaster()
  private pointer = new Vector2()

  async setup(stage: HTMLDivElement, missions: PlanetMission[]): Promise<void> {
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is required for Solar Defense.')
    }
    const adapter = await (navigator.gpu as any).requestAdapter()
    if (!adapter) {
      throw new Error('No compatible WebGPU adapter was found on this device.')
    }

    this.renderer = new WebGPURenderer({ antialias: true, alpha: true })
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.25
    this.renderer.outputColorSpace = SRGBColorSpace
    await this.renderer.init()

    stage.innerHTML = ''
    stage.appendChild(this.renderer.domElement)
    this.renderer.domElement.style.cursor = 'default'

    this.scene = new Scene()
    this.scene.background = new Color('#02040b')

    this.camera = new PerspectiveCamera(40, 1, 0.1, 1600)
    this.camera.position.set(0, 18, 74)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 4
    this.controls.maxDistance = 220
    this.controls.enablePan = true
    this.controls.target.set(0, 0, 0)
    this.controls.mouseButtons.LEFT = MOUSE.ROTATE
    this.controls.mouseButtons.RIGHT = MOUSE.PAN
    this.controls.touches.ONE = TOUCH.ROTATE
    this.controls.touches.TWO = TOUCH.DOLLY_PAN

    // Sync: placeholders + scene graph (instant)
    this.visuals = buildAllPlanets(this.scene, missions, null)

    // Environment (sun texture is async but small — ~100ms)
    await buildEnvironment(this.scene, missions)
    this.buildPostProcessing()

    // Stream procedural + NASA textures in background — planets pop in as they finish
    streamProceduralTextures(this.visuals, () => this.textures)
    this.loadTexturesInBackground(++this.textureLoadToken)
  }

  animate(delta: number, elapsed: number) {
    for (const visual of this.visuals.values()) {
      visual.pivot.rotation.y += visual.mission.orbitSpeed * delta
      visual.bodyGroup.rotation.y += visual.mission.rotationSpeed * delta
      if (visual.cloudLayer) {
        visual.cloudLayer.rotation.y += visual.mission.rotationSpeed * delta * 1.18
      }
      if (visual.ring) {
        visual.ring.rotation.z += delta * 0.02
      }
      visual.moonPivots.forEach((pivot, index) => {
        pivot.rotation.y += delta * (0.24 + index * 0.06)
      })
      for (const mesh of visual.hotspots.values()) {
        const glow = mesh.children[0]
        const pulse = 0.9 + Math.sin(elapsed * 3.4 + mesh.position.x) * 0.18
        mesh.scale.setScalar(pulse)
        if (glow) {
          glow.scale.setScalar(
            visual.mission.radius * 0.55 * (1 + Math.sin(elapsed * 2.6 + mesh.position.y) * 0.12),
          )
        }
      }
    }
  }

  updateHotspotVisibility(currentMission: PlanetMission | null, phase: Phase, scanned: string[]) {
    if (this.renderer?.domElement) {
      this.renderer.domElement.style.cursor = INTERACTIVE_PHASES.has(phase) ? 'grab' : 'default'
    }
    for (const visual of this.visuals.values()) {
      for (const [hotspotId, mesh] of visual.hotspots) {
        mesh.visible =
          visual.mission.id === currentMission?.id
          && phase === 'explore'
          && !scanned.includes(hotspotId)
      }
    }
  }

  raycastHotspots(event: MouseEvent | PointerEvent, missionId: string): string | null {
    if (!this.renderer || !this.camera) return null
    const visual = this.visuals.get(missionId)
    if (!visual) return null

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointer, this.camera)
    const meshes = Array.from(visual.hotspots.values()).filter((m) => m.visible)
    const intersects = this.raycaster.intersectObjects(meshes, true)
    const hit = intersects.find((item: any) => item.object.userData.hotspotId)
    return hit?.object.userData.hotspotId || null
  }

  handleResize(stage: HTMLDivElement) {
    if (!this.renderer || !this.camera) return
    const width = Math.max(1, stage.clientWidth)
    const height = Math.max(1, stage.clientHeight)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height)
  }

  dispose() {
    this.textureLoadToken += 1
    this.controls?.dispose()
    this.postProcessing?.dispose()
    this.renderer?.setAnimationLoop(null)
    this.disposeSceneGraph()
    this.renderer?.dispose()
    this.controls = null
    this.postProcessing = null
    this.renderer = null
    this.scene = null
    this.camera = null
    this.visuals.clear()
    if (this.textures) {
      for (const texture of Object.values(this.textures)) {
        texture?.dispose()
      }
    }
    this.textures = null
    this.textureLoadPromise = null
  }

  private buildPostProcessing() {
    if (!this.renderer || !this.scene || !this.camera) return
    const scenePass = pass(this.scene, this.camera)
    const sceneColor = scenePass.getTextureNode('output')
    const bloomPass = bloom(sceneColor, 0.44, 0.18, 0.68)
    const graded = saturation(sceneColor.add(bloomPass), 1.04)
    const vignette = float(1).sub(smoothstep(float(0.3), float(0.92), screenUV.sub(0.5).length()).mul(0.22))
    this.postProcessing = new PostProcessing(this.renderer)
    this.postProcessing.outputNode = graded.mul(vignette)
    this.postProcessing.needsUpdate = true
  }

  private loadTexturesInBackground(loadToken: number) {
    if (this.textures || this.textureLoadPromise) return
    this.textureLoadPromise = loadNasaTextures()
      .then((textures) => {
        if (loadToken !== this.textureLoadToken) {
          for (const texture of Object.values(textures)) {
            texture?.dispose()
          }
          return
        }
        this.textures = textures
        applyNasaTextures(this.visuals, textures)
      })
      .catch((error) => {
        console.warn('[SolarDefenseGame] Failed to load official textures, using generated textures instead.', error)
      })
      .finally(() => {
        this.textureLoadPromise = null
      })
  }

  private disposeSceneGraph() {
    if (!this.scene) return

    const geometries = new Set<{ dispose(): void }>()
    const materials = new Set<Record<string, unknown> & { dispose(): void }>()
    const textures = new Set<{ dispose(): void }>()
    const materialTextureKeys = [
      'map',
      'alphaMap',
      'bumpMap',
      'normalMap',
      'roughnessMap',
      'metalnessMap',
      'emissiveMap',
      'specularMap',
    ]

    this.scene.traverse((object: any) => {
      if (object.geometry?.dispose) {
        geometries.add(object.geometry)
      }

      const materialList = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materialList) {
        if (!material?.dispose) continue
        materials.add(material)
        for (const key of materialTextureKeys) {
          const texture = material[key]
          if (texture?.dispose) {
            textures.add(texture)
          }
        }
      }
    })

    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) material.dispose()
    for (const texture of textures) texture.dispose()
  }
}
