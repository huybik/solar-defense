import {
  Mesh,
  SRGBColorSpace,
  TextureLoader,
  type Material,
} from 'three/webgpu'
import {
  createCloudLayer,
  createEarthSurfaceMaterial,
  getOfficialPlanetMap,
} from './factory'
import { createMoonMaterial } from '../scene/webgpu-materials'
import type { LoadedTextures, PlanetVisual } from '../types'

export async function loadNasaTextures(): Promise<LoadedTextures> {
  const loader = new TextureLoader()
  const load = (path: string) => loader.loadAsync(new URL(`../assets/planets/${path}`, import.meta.url).href)

  const names: (keyof LoadedTextures)[] = [
    'earthDay', 'earthNormal', 'earthLights', 'earthClouds', 'earthSpecular',
    'moon', 'mercuryDiffuse', 'venusDiffuse', 'marsDiffuse',
    'jupiterDiffuse', 'saturnDiffuse', 'uranusDiffuse', 'neptuneDiffuse',
  ]

  const results = await Promise.allSettled([
    load('earth_day_4096.jpg'), load('earth_normal_2048.jpg'),
    load('earth_lights_2048.png'), load('earth_clouds_1024.png'),
    load('earth_specular_2048.jpg'), load('moon_1024.jpg'),
    load('mercury_nasa.jpg'), load('venus_nasa.jpg'), load('mars_nasa.jpg'),
    load('jupiter_nasa.jpg'), load('saturn_nasa.jpg'),
    load('uranus_nasa.png'), load('neptune_nasa.jpg'),
  ])

  const srgbKeys = new Set<keyof LoadedTextures>([
    'earthDay', 'earthLights', 'earthClouds', 'moon',
    'mercuryDiffuse', 'venusDiffuse', 'marsDiffuse',
    'jupiterDiffuse', 'saturnDiffuse', 'uranusDiffuse', 'neptuneDiffuse',
  ])

  const textures = {} as LoadedTextures
  for (let i = 0; i < names.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      if (srgbKeys.has(names[i])) r.value.colorSpace = SRGBColorSpace
      textures[names[i]] = r.value
    } else {
      console.warn(`Failed to load NASA texture "${names[i]}":`, r.reason)
      textures[names[i]] = null
    }
  }

  return textures
}

export async function applyNasaTextures(visuals: Map<string, PlanetVisual>, textures: LoadedTextures): Promise<void> {
  for (const visual of visuals.values()) {
    if (visual.mission.visualKind === 'earth') {
      if (textures.earthDay) {
        disposeMaterial(visual.surface.material)
        visual.surface.material = createEarthSurfaceMaterial(textures)
      }
      if (!visual.cloudLayer && textures.earthClouds) {
        const cloudLayer = await createCloudLayer(visual.mission, textures)
        if (cloudLayer) {
          visual.bodyGroup.add(cloudLayer)
          visual.cloudLayer = cloudLayer
        }
      }
      if (textures.moon) {
        for (const pivot of visual.moonPivots) {
          const moonMesh = pivot.children[0]
          if (!(moonMesh instanceof Mesh)) continue
          disposeMaterial(moonMesh.material)
          moonMesh.material = createMoonMaterial(textures.moon, '#d1c1aa')
        }
      }
      continue
    }

    const officialMap = getOfficialPlanetMap(visual.mission, textures)
    if (!officialMap) continue
    const material = Array.isArray(visual.surface.material) ? visual.surface.material[0] : visual.surface.material
    if (material && 'map' in material) {
      ;(material as Material & { map?: unknown }).map = officialMap
      material.needsUpdate = true
    }
  }
}

function disposeMaterial(material: Material | Material[]) {
  const items = Array.isArray(material) ? material : [material]
  items.forEach((m) => m.dispose())
}
