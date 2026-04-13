import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  PointsNodeMaterial,
  SpriteNodeMaterial,
  Texture,
  Vector2,
} from 'three/webgpu'
import {
  cameraPosition,
  color,
  float,
  mix,
  normalMap,
  normalWorld,
  positionLocal,
  positionWorld,
  smoothstep,
  texture,
  time,
  uv,
  vertexColor,
} from 'three/tsl'
import type { LoadedTextures, PlanetMission } from '../types'
import type { RockyTextureSet } from '../planet/procedural-textures'

const GAS_GIANTS = new Set(['jupiter', 'saturn', 'uranus', 'neptune'])

const PLACEHOLDER_SURFACE: Record<string, string> = {
  mercury: '#726454',
  venus: '#a95f24',
  earth: '#2a5caa',
  mars: '#8b3b27',
  jupiter: '#a36f46',
  saturn: '#b29a76',
  uranus: '#9ce4ea',
  neptune: '#235bcb',
}

function nodeColor(value: string) {
  return color(new Color(value))
}

function rimGlow(power: number) {
  const viewDir = cameraPosition.sub(positionWorld).normalize()
  const nDotV = normalWorld.dot(viewDir).abs().saturate()
  return float(1).sub(nDotV).pow(float(power))
}

function sunFacing() {
  return normalWorld.dot(positionWorld.negate().normalize()).saturate()
}

export function createPlaceholderSurfaceMaterial(mission: PlanetMission): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.colorNode = nodeColor(PLACEHOLDER_SURFACE[mission.visualKind] || '#666666')
  material.roughness = 0.78
  material.metalness = 0.03
  material.emissiveNode = nodeColor(mission.glowColor).mul(rimGlow(4.2).mul(0.18))
  return material
}

export function createPlanetSurfaceMaterial(
  mission: PlanetMission,
  generated: RockyTextureSet,
  surfaceMap: Texture,
): MeshStandardNodeMaterial | MeshPhysicalNodeMaterial {
  const kind = mission.visualKind
  const litRim = rimGlow(kind === 'venus' ? 4.5 : 3.6)
  const sunFactor = sunFacing()
  const rimColor = nodeColor(mission.glowColor).mul(litRim.mul(sunFactor.mul(0.24).add(0.05)))

  if (kind === 'venus') {
    const material = new MeshPhysicalNodeMaterial()
    material.map = surfaceMap
    material.bumpMap = generated.bumpMap
    material.bumpScale = mission.radius * 0.03
    material.roughnessMap = generated.roughnessMap
    material.color = new Color('#ffffff')
    material.roughness = 0.64
    material.metalness = 0.02
    material.clearcoat = 0.7
    material.clearcoatRoughness = 0.1
    material.emissiveNode = rimColor
    return material
  }

  const material = new MeshStandardNodeMaterial()
  material.map = surfaceMap
  material.bumpMap = generated.bumpMap
  material.bumpScale = mission.radius * (GAS_GIANTS.has(kind) ? 0.018 : kind === 'mercury' ? 0.1 : 0.08)
  material.roughnessMap = generated.roughnessMap
  material.color = new Color('#ffffff')
  material.roughness = GAS_GIANTS.has(kind)
    ? kind === 'saturn' ? 0.52 : 0.48
    : 0.72
  material.metalness = 0.02
  material.emissiveNode = rimColor
  return material
}

export function createEarthSurfaceMaterial(textures: LoadedTextures): MeshStandardNodeMaterial {
  if (!textures.earthDay) {
    throw new Error('Earth day texture is required to build the Earth surface.')
  }

  const material = new MeshStandardNodeMaterial()
  const sunFactor = sunFacing()
  const nightFactor = float(1).sub(smoothstep(float(0.08), float(0.36), sunFactor))
  const atmosphereRim = nodeColor('#8ad7ff').mul(rimGlow(4.2).mul(sunFactor.mul(0.34).add(0.08)))

  material.map = textures.earthDay
  material.color = new Color('#ffffff')
  material.metalness = 0.02
  material.roughness = 0.72

  if (textures.earthNormal) {
    material.normalMap = textures.earthNormal
    material.normalScale = new Vector2(1.15, 1.15)
    material.normalNode = normalMap(texture(textures.earthNormal, uv()).rgb, new Vector2(1.15, 1.15))
  }

  if (textures.earthSpecular) {
    material.roughnessNode = mix(float(0.92), float(0.34), texture(textures.earthSpecular, uv()).r)
  }

  let emissiveNode = atmosphereRim
  if (textures.earthLights) {
    material.emissiveMap = textures.earthLights
    emissiveNode = emissiveNode.add(
      texture(textures.earthLights, uv()).rgb.mul(nightFactor.pow(float(1.4)).mul(1.05)),
    )
  }

  material.emissiveNode = emissiveNode
  return material
}

export function createAtmosphereMaterial(mission: PlanetMission): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  const sunFactor = sunFacing()
  const opacity = mission.visualKind === 'venus' ? 0.58
    : GAS_GIANTS.has(mission.visualKind) ? 0.34
    : mission.visualKind === 'earth' ? 0.42
    : 0.24

  material.colorNode = mix(
    nodeColor(mission.glowColor),
    nodeColor(mission.atmosphereColor),
    sunFactor.mul(0.7).add(0.15),
  )
  material.opacityNode = rimGlow(mission.visualKind === 'venus' ? 2.2 : 2.9)
    .mul(opacity)
    .mul(sunFactor.mul(0.58).add(0.22))
  material.transparent = true
  material.side = BackSide
  material.depthWrite = false
  material.toneMapped = false
  return material
}

export function createCloudMaterial(
  cloudMap: Texture,
  accent: string,
  opacity: number,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  const sample = texture(cloudMap, uv())
  const sunFactor = sunFacing()

  material.map = cloudMap
  material.alphaMap = cloudMap
  material.colorNode = sample.rgb.mul(0.9).add(nodeColor(accent).mul(0.12))
  material.opacityNode = sample.r.mul(opacity)
  material.emissiveNode = nodeColor(accent).mul(sunFactor.mul(0.08).add(0.02))
  material.roughness = 0.24
  material.metalness = 0
  material.transparent = true
  material.side = DoubleSide
  material.depthWrite = false
  return material
}

export function createRingMaterial(
  textureMap: Texture,
  ringColor: string,
  opacity: number,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  const sample = texture(textureMap, uv())

  material.map = textureMap
  material.alphaMap = textureMap
  material.colorNode = sample.rgb.mul(nodeColor(ringColor))
  material.opacityNode = sample.r.mul(opacity)
  material.transparent = true
  material.side = DoubleSide
  material.depthWrite = false
  material.toneMapped = false
  return material
}

export function createMoonMaterial(textureMap: Texture | null, fallbackColor: string): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.roughness = 1
  material.metalness = 0.02

  if (textureMap) {
    material.map = textureMap
    material.color = new Color('#ffffff')
  } else {
    material.colorNode = nodeColor(fallbackColor)
  }

  return material
}

export function createHotspotMaterial(colorHex: string): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial()
  material.colorNode = nodeColor(colorHex)
  material.emissiveNode = nodeColor(colorHex).mul(1.35).add(nodeColor('#ffffff').mul(rimGlow(6).mul(0.08)))
  material.roughness = 0.16
  material.metalness = 0.08
  return material
}

export function createGlowSpriteMaterial(glowMap: Texture, tint: string, opacity: number): SpriteNodeMaterial {
  const material = new SpriteNodeMaterial()
  const sample = texture(glowMap, uv())

  material.map = glowMap
  material.colorNode = sample.rgb.mul(nodeColor(tint))
  material.opacityNode = sample.a.mul(opacity)
  material.transparent = true
  material.depthWrite = false
  material.blending = AdditiveBlending
  material.toneMapped = false
  return material
}

export function createNebulaMaterial(nebulaMap: Texture): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()
  const driftedSample = texture(nebulaMap, uv())

  material.map = nebulaMap
  material.colorNode = driftedSample.rgb.mul(nodeColor('#bcc9d8'))
  material.opacityNode = float(0.18)
  material.transparent = true
  material.side = BackSide
  material.toneMapped = false
  return material
}

export function createSunMaterial(sunMap: Texture): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial()

  material.map = sunMap
  material.colorNode = texture(sunMap, uv()).rgb.mul(nodeColor('#ffcf59'))
  material.toneMapped = false
  return material
}

export function createStarfieldMaterial(size: number): PointsNodeMaterial {
  const material = new PointsNodeMaterial()
  const twinkle = positionLocal.x
    .mul(0.13)
    .add(positionLocal.y.mul(0.17))
    .add(positionLocal.z.mul(0.11))
    .add(time.mul(0.65))
    .sin()
    .mul(0.18)
    .add(0.82)

  material.colorNode = vertexColor().mul(twinkle)
  material.opacityNode = twinkle.mul(0.72)
  material.sizeNode = float(size)
  material.vertexColors = true
  material.transparent = true
  material.depthWrite = false
  material.toneMapped = false
  return material
}
