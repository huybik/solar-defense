import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
} from 'three/webgpu'
import type { PlanetVisualKind } from '../types'

export interface RockyTextureSet {
  map: Texture
  bumpMap: Texture
  roughnessMap: Texture
  emissiveMap?: Texture
}

export interface CloudTextureSet {
  map: Texture
}

// ── Worker setup ──

const worker = new Worker(new URL('./texture-worker.ts', import.meta.url), { type: 'module' })
let nextId = 0
const pending = new Map<number, (result: { bitmaps: ImageBitmap[]; isColor: boolean[] }) => void>()

worker.onmessage = (e: MessageEvent) => {
  const { id, bitmaps, isColor } = e.data
  pending.get(id)?.({ bitmaps, isColor })
  pending.delete(id)
}

function postToWorker(msg: Record<string, unknown>): Promise<{ bitmaps: ImageBitmap[]; isColor: boolean[] }> {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve)
    worker.postMessage({ id, ...msg })
  })
}

// ── Bitmap → Three.js texture conversion ──

function bitmapToTexture(bitmap: ImageBitmap, color: boolean): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  if (color) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function bitmapsToTextureSet(bitmaps: ImageBitmap[], isColor: boolean[]): RockyTextureSet {
  const result: RockyTextureSet = {
    map: bitmapToTexture(bitmaps[0], isColor[0]),
    bumpMap: bitmapToTexture(bitmaps[1], isColor[1]),
    roughnessMap: bitmapToTexture(bitmaps[2], isColor[2]),
  }
  if (bitmaps[3]) result.emissiveMap = bitmapToTexture(bitmaps[3], isColor[3])
  return result
}

// ── Async texture generation (off main thread) ──

export async function createPlanetTexture(kind: PlanetVisualKind): Promise<RockyTextureSet> {
  const { bitmaps, isColor } = await postToWorker({ type: 'planet', kind })
  return bitmapsToTextureSet(bitmaps, isColor)
}

export async function createCloudTexture(seedLabel: string, baseColor: string, accentColor = '#ffffff'): Promise<CloudTextureSet> {
  const { bitmaps, isColor } = await postToWorker({ type: 'cloud', seedLabel, baseColor, accentColor })
  return { map: bitmapToTexture(bitmaps[0], isColor[0]) }
}

export async function createRingTexture(seedLabel: string, palette: string[]): Promise<Texture> {
  const { bitmaps, isColor } = await postToWorker({ type: 'ring', seedLabel, palette })
  return bitmapToTexture(bitmaps[0], isColor[0])
}

export async function createSunTexture(seedLabel: string): Promise<Texture> {
  const { bitmaps, isColor } = await postToWorker({ type: 'sun', seedLabel })
  return bitmapToTexture(bitmaps[0], isColor[0])
}

// ── Sync textures (cheap, no FBM — stay on main thread) ──

function makeTexture(canvas: HTMLCanvasElement, color = true): Texture {
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearMipmapLinearFilter
  if (color) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map((item) => `${item}${item}`).join('')
    : value
  const int = Number.parseInt(normalized, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function valueNoise(seed: number, x: number, y: number): number {
  const fract = (v: number) => v - Math.floor(v)
  const hash = (s: number, a: number, b: number) => fract(Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453123)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const tx = x - x0, ty = y - y0
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty)
  return lerp(lerp(hash(seed, x0, y0), hash(seed, x0 + 1, y0), sx), lerp(hash(seed, x0, y0 + 1), hash(seed, x0 + 1, y0 + 1), sx), sy)
}

export function createGlowTexture(innerColor: string, outerColor = 'rgba(255,255,255,0)'): Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 128)
  gradient.addColorStop(0, innerColor)
  gradient.addColorStop(0.28, innerColor)
  gradient.addColorStop(1, outerColor)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  return makeTexture(canvas)
}

const glowCache = new Map<string, Texture>()

export function getGlowTexture(color: string): Texture {
  if (!glowCache.has(color)) {
    glowCache.set(color, createGlowTexture(color))
  }
  return glowCache.get(color)!
}

export function createNebulaTexture(seedLabel: string): Texture {
  const width = 1024
  const height = 512
  const seed = Array.from(seedLabel).reduce((t, c) => t + c.charCodeAt(0), 0)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#030612')
  background.addColorStop(0.5, '#090f1f')
  background.addColorStop(1, '#02030a')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const palette = ['#4b63a8', '#56839d', '#926b82', '#9d846f']
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  for (let i = 0; i < 40; i += 1) {
    const color = palette[i % palette.length]
    const x = valueNoise(seed + 3, i * 1.7, 0.3) * width
    const y = valueNoise(seed + 5, i * 2.3, 0.8) * height
    const radius = lerp(width * 0.07, width * 0.16, valueNoise(seed + 9, i * 0.9, 0.2))
    const gradient = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius)
    gradient.addColorStop(0, `${color}3c`)
    gradient.addColorStop(0.45, `${color}14`)
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  for (let i = 0; i < 900; i += 1) {
    const x = valueNoise(seed + 21, i * 1.31, 0.44) * width
    const y = valueNoise(seed + 31, i * 1.97, 0.62) * height
    const size = lerp(0.25, 1.35, valueNoise(seed + 41, i * 0.73, 0.81))
    ctx.fillStyle = `rgba(255,255,255,${lerp(0.08, 0.34, valueNoise(seed + 51, i * 0.41, 0.11))})`
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }

  return makeTexture(canvas)
}
