import {
  Group,
  type Material,
  Mesh,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Sprite,
  Vector3,
  type Texture,
} from 'three/webgpu'
import { createCloudTexture, createPlanetTexture, createRingTexture, getGlowTexture } from './procedural-textures'
import type { RockyTextureSet } from './procedural-textures'
import type { LoadedTextures, PlanetMission, PlanetVisual } from '../types'
import {
  createAtmosphereMaterial,
  createCloudMaterial,
  createEarthSurfaceMaterial as createEarthSurfaceNodeMaterial,
  createGlowSpriteMaterial,
  createHotspotMaterial,
  createMoonMaterial,
  createPlaceholderSurfaceMaterial,
  createPlanetSurfaceMaterial,
  createRingMaterial,
} from '../scene/webgpu-materials'

const GAS_GIANTS = new Set(['jupiter', 'saturn', 'uranus', 'neptune'])
const CLOUD_PLANETS = new Set(['venus', 'jupiter', 'saturn', 'uranus', 'neptune'])
const CLOUD_ACCENT: Record<string, string> = {
  jupiter: '#fff0c9',
  saturn: '#fff8e0',
  uranus: '#f2ffff',
  neptune: '#d1e6ff',
  venus: '#fff4cf',
}

function latLonToVector(radius: number, lat: number, lon: number): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

/** Synchronously creates all planet groups with placeholder surfaces. Returns immediately. */
export function buildAllPlanets(
  scene: Scene,
  missions: PlanetMission[],
  textures: LoadedTextures | null,
): Map<string, PlanetVisual> {
  const visuals = new Map<string, PlanetVisual>()

  for (const mission of missions) {
    const pivot = new Group()
    const anchor = new Group()
    const bodyGroup = new Group()

    pivot.rotation.y = mission.orbitRadius * 0.04
    anchor.position.x = mission.orbitRadius
    anchor.rotation.z = mission.axialTilt || 0
    anchor.add(bodyGroup)
    pivot.add(anchor)
    scene.add(pivot)

    // Placeholder surface — solid color, replaced once worker textures arrive
    const surface = new Mesh(
      new SphereGeometry(mission.radius, 96, 96),
      createPlaceholderSurfaceMaterial(mission),
    )
    bodyGroup.add(surface)

    const atmosphere = new Mesh(
      new SphereGeometry(mission.radius * (GAS_GIANTS.has(mission.visualKind) ? 1.03 : 1.06), 72, 72),
      createAtmosphereMaterial(mission),
    )
    bodyGroup.add(atmosphere)

    const hotspotMap = new Map<string, Mesh>()
    for (const hotspot of mission.hotspots) {
      const marker = createHotspot(mission, hotspot.id, hotspot.color)
      marker.position.copy(latLonToVector(mission.radius * 1.06, hotspot.lat, hotspot.lon))
      bodyGroup.add(marker)
      hotspotMap.set(hotspot.id, marker)
    }

    const moonPivots = createMoons(mission, anchor, textures)

    visuals.set(mission.id, {
      mission, pivot, anchor, bodyGroup, surface,
      atmosphere, cloudLayer: undefined, ring: undefined, moonPivots, hotspots: hotspotMap,
    })
  }

  return visuals
}

/** Fire-and-forget: generates procedural textures off-thread and hot-swaps each planet as it finishes. */
export function streamProceduralTextures(
  visuals: Map<string, PlanetVisual>,
  getTextures: () => LoadedTextures | null,
): void {
  for (const visual of visuals.values()) {
    if (visual.mission.visualKind === 'earth') continue
    streamOnePlanet(visual, getTextures)
  }
}

async function streamOnePlanet(
  visual: PlanetVisual,
  getTextures: () => LoadedTextures | null,
) {
  const mission = visual.mission
  const kind = mission.visualKind

  const [generated, cloudLayer, ring] = await Promise.all([
    createPlanetTexture(kind),
    CLOUD_PLANETS.has(kind) ? createCloudLayerFromTexture(mission) : null,
    mission.hasRings && mission.ringColor ? createRing(mission) : null,
  ])

  // Swap placeholder with textured surface
  const textures = getTextures()
  const newSurface = createSurfaceMesh(mission, generated, textures)
  visual.bodyGroup.remove(visual.surface)
  disposeMesh(visual.surface)
  visual.surface = newSurface
  visual.bodyGroup.add(newSurface)

  if (cloudLayer) {
    visual.bodyGroup.add(cloudLayer)
    visual.cloudLayer = cloudLayer
  }
  if (ring) {
    visual.anchor.add(ring)
    visual.ring = ring
  }
}

function createSurfaceMesh(
  mission: PlanetMission,
  generated: RockyTextureSet,
  textures: LoadedTextures | null,
): Mesh {
  const geometry = new SphereGeometry(mission.radius, 96, 96)
  const surfaceMap = getOfficialPlanetMap(mission, textures) ?? generated.map
  return new Mesh(geometry, createPlanetSurfaceMaterial(mission, generated, surfaceMap))
}

export function createEarthSurfaceMaterial(textures: LoadedTextures) {
  return createEarthSurfaceNodeMaterial(textures)
}

export function getOfficialPlanetMap(mission: PlanetMission, textures: LoadedTextures | null): Texture | null {
  if (!textures) return null
  const map: Record<string, Texture | null> = {
    mercury: textures.mercuryDiffuse,
    venus: textures.venusDiffuse,
    mars: textures.marsDiffuse,
    jupiter: textures.jupiterDiffuse,
    saturn: textures.saturnDiffuse,
    uranus: textures.uranusDiffuse,
    neptune: textures.neptuneDiffuse,
  }
  return map[mission.visualKind] ?? null
}


export async function createCloudLayer(mission: PlanetMission, textures: LoadedTextures | null): Promise<Mesh | null> {
  if (mission.visualKind === 'earth' && textures) {
    if (!textures.earthClouds) return null
    return new Mesh(
      new SphereGeometry(mission.radius * 1.018, 72, 72),
      createCloudMaterial(textures.earthClouds, '#eef6ff', 0.72),
    )
  }
  if (!CLOUD_PLANETS.has(mission.visualKind)) return null
  return createCloudLayerFromTexture(mission)
}

async function createCloudLayerFromTexture(mission: PlanetMission): Promise<Mesh> {
  const accent = CLOUD_ACCENT[mission.visualKind] || '#fff4cf'
  const clouds = await createCloudTexture(`${mission.id}-clouds`, mission.glowColor, accent)
  const opacity = mission.visualKind === 'venus' ? 0.48
    : mission.visualKind === 'jupiter' || mission.visualKind === 'neptune' ? 0.24
    : 0.2

  return new Mesh(
    new SphereGeometry(mission.radius * 1.02, 72, 72),
    createCloudMaterial(clouds.map, accent, opacity),
  )
}

async function createRing(mission: PlanetMission): Promise<Mesh> {
  const isSaturn = mission.visualKind === 'saturn'
  const innerRadius = mission.radius * (isSaturn ? 1.55 : 1.38)
  const outerRadius = mission.radius * (isSaturn ? 2.55 : 1.88)
  const texture = await getRingTexture(mission)
  const geometry = new RingGeometry(innerRadius, outerRadius, 128, 1)

  // Fix UVs: default RingGeometry UVs are polar — remap so U = inner→outer, V = around
  const uv = geometry.attributes.uv
  const pos = geometry.attributes.position
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const dist = Math.sqrt(x * x + y * y)
    uv.setXY(i, (dist - innerRadius) / (outerRadius - innerRadius), 0.5)
  }

  const mesh = new Mesh(
    geometry,
    createRingMaterial(texture, mission.ringColor || '#ffffff', isSaturn ? 0.95 : 0.42),
  )
  mesh.rotation.x = Math.PI / 2
  return mesh
}

function createMoons(mission: PlanetMission, anchor: Group, textures: LoadedTextures | null): Group[] {
  const count = mission.moonCount || 0
  if (count === 0) return []

  const result: Group[] = []
  for (let i = 0; i < count; i += 1) {
    const pivot = new Group()
    const moonRadius = mission.radius * (mission.moonScale || 0.16) * (1 - i * 0.12)
    const material = createMoonMaterial(
      mission.visualKind === 'earth' ? textures?.moon ?? null : null,
      i % 2 === 0 ? '#d1c1aa' : '#8b9aba',
    )
    const moon = new Mesh(new SphereGeometry(moonRadius, 32, 32), material)
    moon.position.x = (mission.moonOrbitRadius || mission.radius * 2.6) + i * moonRadius * 2.7
    pivot.add(moon)
    anchor.add(pivot)
    result.push(pivot)
  }
  return result
}

function createHotspot(mission: PlanetMission, hotspotId: string, color: string): Mesh {
  const marker = new Mesh(
    new SphereGeometry(Math.max(0.12, mission.radius * 0.075), 20, 20),
    createHotspotMaterial(color),
  )
  marker.userData.hotspotId = hotspotId

  const glow = new Sprite(
    createGlowSpriteMaterial(getGlowTexture(color), color, 0.75),
  )
  glow.scale.setScalar(Math.max(0.6, mission.radius * 0.55))
  marker.add(glow)
  return marker
}

const ringCache = new Map<string, Promise<Texture>>()

function getRingTexture(mission: PlanetMission): Promise<Texture> {
  if (!ringCache.has(mission.id)) {
    const palette = mission.visualKind === 'saturn'
      ? ['#6f6249', '#b99d74', '#e6d0a4', '#fdf2cd']
      : ['#94cad5', '#c4f3ff', '#e6ffff']
    ringCache.set(mission.id, createRingTexture(mission.id, palette))
  }
  return ringCache.get(mission.id)!
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose()
  const mat = mesh.material
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
  else (mat as Material).dispose()
}
