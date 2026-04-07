import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three/webgpu'

/* ── Spritesheet imports ── */
import sheetPngUrl from '../../assets/kenney/space-shooter-redux/Spritesheet/sheet.png'
import sheetXml from '../../assets/kenney/space-shooter-redux/Spritesheet/sheet.xml?raw'
import extPngUrl from '../../assets/kenney/space-shooter-extension/Spritesheet/spaceShooter2_spritesheet.png'
import extXml from '../../assets/kenney/space-shooter-extension/Spritesheet/spaceShooter2_spritesheet.xml?raw'

/* ── Non-spritesheet assets (backgrounds, planets) ── */
const imageModules = import.meta.glob(
  ['../../assets/planets/**/*.{png,jpg,jpeg}', '../../assets/kenney/space-shooter-redux/Backgrounds/**/*.png'],
  { eager: true, import: 'default' },
) as Record<string, string>

/* ── Types ── */
interface AtlasEntry {
  url: string
  x: number
  y: number
  w: number
  h: number
  atlasW: number
  atlasH: number
}

/* ── Atlas dimensions (from sips) ── */
const SHEET_W = 1024, SHEET_H = 1024
const EXT_W = 1133, EXT_H = 1134

/* ── Atlas index ── */
const atlasIndex = new Map<string, AtlasEntry>()

function parseAtlasXml(xml: string, url: string, atlasW: number, atlasH: number): void {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  for (const sub of doc.querySelectorAll('SubTexture')) {
    const name = sub.getAttribute('name')?.replace(/\.png$/, '') ?? ''
    if (!name) continue
    atlasIndex.set(name, {
      url,
      x: parseInt(sub.getAttribute('x') ?? '0', 10),
      y: parseInt(sub.getAttribute('y') ?? '0', 10),
      w: parseInt(sub.getAttribute('width') ?? '0', 10),
      h: parseInt(sub.getAttribute('height') ?? '0', 10),
      atlasW,
      atlasH,
    })
  }
}

parseAtlasXml(sheetXml, sheetPngUrl, SHEET_W, SHEET_H)
parseAtlasXml(extXml, extPngUrl, EXT_W, EXT_H)

/* ── Fallback URL index for non-spritesheet assets ── */
function basename(path: string): string {
  const file = path.split('/').pop() ?? path
  return file.replace(/\.[^.]+$/, '')
}

const fallbackUrlByKey = new Map<string, string>()
for (const [path, url] of Object.entries(imageModules)) {
  fallbackUrlByKey.set(basename(path), url)
}

/* ── Category exports (unchanged API) ── */
function buildCategory(prefixes: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of atlasIndex.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      result[key] = key
    }
  }
  for (const key of fallbackUrlByKey.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      result[key] = key
    }
  }
  return result
}

export const SHIPS = buildCategory(['playerShip'])
export const ENEMIES = buildCategory(['enemy'])
export const UFOS = buildCategory(['ufo'])
export const LASERS = buildCategory(['laser'])
export const MISSILES = buildCategory(['spaceMissiles_'])
export const EFFECTS = buildCategory(['fire', 'shield', 'star', 'speed', 'spaceEffects_', 'beam'])
export const POWERUPS = buildCategory(['powerup', 'pill_', 'things_', 'bold_'])
export const METEORS = buildCategory(['meteor', 'spaceMeteors_'])
export const BUILDINGS = buildCategory(['spaceBuilding_'])
export const STATIONS = buildCategory(['spaceStation_'])
export const PARTS = buildCategory(['spaceParts_', 'gun', 'engine', 'wing', 'cockpit', 'turretBase', 'scratch'])
export const UI = buildCategory(['numeral', 'button', 'playerLife', 'cursor'])
export const ASTRONAUTS = buildCategory(['spaceAstronauts_'])
export const ROCKETS = buildCategory(['spaceRockets_', 'spaceRocketParts_'])
export const PLANET_TEXTURES = buildCategory(['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'moon'])
export const BACKGROUNDS = buildCategory(['black', 'blue', 'purple', 'darkPurple'])

/* ── Atlas preloading ── */
const atlasImageMap = new Map<string, HTMLImageElement>()

function startImageLoad(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image()
    atlasImageMap.set(url, img)
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

const _atlasReady = Promise.all([startImageLoad(sheetPngUrl), startImageLoad(extPngUrl)])

/** Resolves when both spritesheet PNGs have loaded. */
export function preloadAtlases(): Promise<void> {
  return _atlasReady.then(() => {})
}

/* ── Texture loading ── */
const textureLoader = new TextureLoader()
const textureCache = new Map<string, Texture>()
const atlasTextureCache = new Map<string, Texture>()
const pendingTextureClones = new Map<string, Set<Texture>>()

function markPendingClonesReady(key: string): void {
  const clones = pendingTextureClones.get(key)
  if (!clones) return

  for (const texture of clones) {
    texture.needsUpdate = true
  }

  pendingTextureClones.delete(key)
}

function getAtlasTexture(url: string): Texture {
  let texture = atlasTextureCache.get(url)
  if (!texture) {
    const img = atlasImageMap.get(url)!
    texture = new Texture(img)
    texture.colorSpace = SRGBColorSpace
    texture.magFilter = NearestFilter
    texture.minFilter = LinearFilter
    texture.needsUpdate = true
    atlasTextureCache.set(url, texture)
  }
  return texture
}

export function hasAsset(key: string): boolean {
  return atlasIndex.has(key) || fallbackUrlByKey.has(key)
}

export function getAssetUrl(key: string): string {
  const entry = atlasIndex.get(key)
  if (entry) return entry.url
  return fallbackUrlByKey.get(key) ?? ''
}

/** CSS style string for rendering an atlas sprite in the DOM */
export function getSpriteCSS(key: string): string {
  const entry = atlasIndex.get(key)
  if (!entry) return ''
  return `background-image:url(${entry.url});background-position:-${entry.x}px -${entry.y}px;background-size:${entry.atlasW}px ${entry.atlasH}px;width:${entry.w}px;height:${entry.h}px;background-repeat:no-repeat;`
}

export function loadTexture(key: string): Texture {
  let texture = textureCache.get(key)
  if (texture) return texture

  const entry = atlasIndex.get(key)
  if (entry) {
    const atlas = getAtlasTexture(entry.url)
    texture = atlas.clone()
    texture.repeat.set(entry.w / entry.atlasW, entry.h / entry.atlasH)
    texture.offset.set(entry.x / entry.atlasW, 1 - (entry.y + entry.h) / entry.atlasH)
    textureCache.set(key, texture)
    return texture
  }

  const url = fallbackUrlByKey.get(key)
  if (!url) {
    throw new Error(`Missing arcade asset: ${key}`)
  }

  texture = textureLoader.load(url, () => {
    markPendingClonesReady(key)
  })
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = NearestFilter
  texture.minFilter = LinearFilter
  textureCache.set(key, texture)
  return texture
}

export function cloneTexture(key: string): Texture {
  const source = loadTexture(key)
  const texture = source.clone()
  texture.colorSpace = source.colorSpace
  texture.magFilter = source.magFilter
  texture.minFilter = source.minFilter
  if (source.image == null) {
    texture.version = 0
    let clones = pendingTextureClones.get(key)
    if (!clones) {
      clones = new Set<Texture>()
      pendingTextureClones.set(key, clones)
    }
    clones.add(texture)
    texture.addEventListener('dispose', () => {
      clones?.delete(texture)
      if (clones && clones.size === 0) {
        pendingTextureClones.delete(key)
      }
    })
  } else {
    texture.needsUpdate = true
  }
  return texture
}

export function loadSprite(
  key: string,
  width: number,
  height: number,
  options?: {
    color?: string
    opacity?: number
    additive?: boolean
    rotation?: number
  },
): Sprite {
  const material = new SpriteMaterial({
    map: loadTexture(key),
    transparent: true,
    opacity: options?.opacity ?? 1,
    color: options?.color ? new Color(options.color) : new Color('#ffffff'),
  })
  material.toneMapped = false
  material.depthWrite = false
  if (options?.additive) {
    material.blending = AdditiveBlending
  }
  if (options?.rotation) {
    material.rotation = options.rotation
  }

  const sprite = new Sprite(material)
  sprite.scale.set(width, height, 1)
  return sprite
}

export function loadPlane(
  key: string,
  width: number,
  height: number,
  options?: {
    color?: string
    opacity?: number
    additive?: boolean
  },
): Mesh {
  const material = new MeshBasicMaterial({
    map: loadTexture(key),
    transparent: true,
    opacity: options?.opacity ?? 1,
    color: options?.color ? new Color(options.color) : new Color('#ffffff'),
  })
  material.toneMapped = false
  if (options?.additive) {
    material.blending = AdditiveBlending
  }
  return new Mesh(new PlaneGeometry(width, height), material)
}

export function createGlowSprite(color: string, width: number, height: number): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return loadSprite('star1', width, height, { color, additive: true })
  }

  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.2, color)
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    blending: AdditiveBlending,
  })
  material.toneMapped = false
  const sprite = new Sprite(material)
  sprite.scale.set(width, height, 1)
  return sprite
}

export function disposeAssetCache(): void {
  for (const texture of textureCache.values()) {
    texture.dispose()
  }
  textureCache.clear()
  for (const texture of atlasTextureCache.values()) {
    texture.dispose()
  }
  atlasTextureCache.clear()
}
