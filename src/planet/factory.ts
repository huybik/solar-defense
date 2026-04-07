import {
  AdditiveBlending,

  Color,
  DoubleSide,
  Group,
  type Material,
  Mesh,

  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RingGeometry,
  type Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  type Texture,
} from 'three/webgpu'
import { createCloudTexture, createPlanetTexture, createRingTexture, getGlowTexture } from './procedural-textures'
import type { RockyTextureSet } from './procedural-textures'
import type { LoadedTextures, PlanetMission, PlanetVisual } from '../types'

const GAS_GIANTS = new Set(['jupiter', 'saturn', 'uranus', 'neptune'])
const CLOUD_PLANETS = new Set(['venus', 'jupiter', 'saturn', 'uranus', 'neptune'])
const CLOUD_ACCENT: Record<string, string> = {
  jupiter: '#fff0c9',
  saturn: '#fff8e0',
  uranus: '#f2ffff',
  neptune: '#d1e6ff',
  venus: '#fff4cf',
}

const PLACEHOLDER_COLOR: Record<string, string> = {
  mercury: '#726454',
  venus: '#a95f24',
  earth: '#2a5caa',
  mars: '#8b3b27',
  jupiter: '#a36f46',
  saturn: '#b29a76',
  uranus: '#9ce4ea',
  neptune: '#235bcb',
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
      new MeshStandardMaterial({
        color: PLACEHOLDER_COLOR[mission.visualKind] || '#666666',
        roughness: 0.76, metalness: 0.03,
      }),
    )
    bodyGroup.add(surface)

    const atmosphere = undefined

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
  const kind = mission.visualKind
  const surfaceMap = getOfficialPlanetMap(mission, textures) ?? generated.map

  if (kind === 'venus') {
    return new Mesh(geometry, new MeshPhysicalMaterial({
      color: new Color().setRGB(1.08, 1.05, 1.02),
      map: surfaceMap,
      bumpMap: generated.bumpMap, bumpScale: mission.radius * 0.03,
      roughnessMap: generated.roughnessMap, roughness: 0.64, metalness: 0.02,
      clearcoat: 0.7, clearcoatRoughness: 0.1,
    }))
  }

  if (GAS_GIANTS.has(kind)) {
    return new Mesh(geometry, new MeshStandardMaterial({
      color: new Color().setRGB(1.08, 1.08, 1.06),
      map: surfaceMap,
      bumpMap: generated.bumpMap, bumpScale: mission.radius * 0.018,
      roughnessMap: generated.roughnessMap,
      roughness: kind === 'saturn' ? 0.52 : 0.48,
      metalness: 0.02,
    }))
  }

  return new Mesh(geometry, new MeshStandardMaterial({
    color: new Color().setRGB(1.08, 1.08, 1.08),
    map: surfaceMap,
    bumpMap: generated.bumpMap,
    bumpScale: mission.radius * (kind === 'mercury' ? 0.1 : 0.08),
    roughnessMap: generated.roughnessMap, roughness: 0.72, metalness: 0.03,
  }))
}

export function createEarthSurfaceMaterial(textures: LoadedTextures): MeshPhongMaterial {
  return new MeshPhongMaterial({
    color: new Color().setRGB(1.07, 1.07, 1.07),
    map: textures.earthDay,
    normalMap: textures.earthNormal,
    emissiveMap: textures.earthLights,
    emissive: new Color('#285ca1'), emissiveIntensity: 0.65,
    shininess: 34, specular: new Color('#b6dbff'),
    specularMap: textures.earthSpecular,
    normalScale: new Vector2(1.15, 1.15),
  })
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
    return new Mesh(
      new SphereGeometry(mission.radius * 1.018, 72, 72),
      new MeshPhongMaterial({
        color: new Color().setRGB(1.08, 1.08, 1.08),
        map: textures.earthClouds, alphaMap: textures.earthClouds,
        transparent: true, opacity: 0.72, depthWrite: false,
        shininess: 38, specular: new Color('#eef6ff'),
      }),
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
    new MeshPhongMaterial({
      color: new Color().setRGB(1.06, 1.06, 1.06),
      map: clouds.map, alphaMap: clouds.map,
      transparent: true, opacity, depthWrite: false,
      shininess: 26, specular: new Color(accent),
    }),
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
    new MeshPhongMaterial({
      map: texture, alphaMap: texture, transparent: true,
      opacity: isSaturn ? 0.95 : 0.42, side: DoubleSide, depthWrite: false,
    }),
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
    const material = mission.visualKind === 'earth' && textures?.moon
      ? new MeshStandardMaterial({ map: textures.moon, roughness: 1, metalness: 0.02 })
      : new MeshStandardMaterial({ color: i % 2 === 0 ? '#d1c1aa' : '#8b9aba', roughness: 1, metalness: 0.01 })
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
    new MeshStandardMaterial({
      color, emissive: new Color(color), emissiveIntensity: 1.4,
      roughness: 0.2, metalness: 0.08,
    }),
  )
  marker.userData.hotspotId = hotspotId

  const glow = new Sprite(
    new SpriteMaterial({
      map: getGlowTexture(color), color,
      blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.75,
    }),
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
