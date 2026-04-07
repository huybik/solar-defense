/// <reference lib="webworker" />

// ── Math utilities (inlined — worker can't import from three/webgpu) ──

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function fract(value: number): number {
  return value - Math.floor(value)
}

function hash(seed: number, x: number, y: number): number {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123)
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = x - x0
  const ty = y - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const n00 = hash(seed, x0, y0)
  const n10 = hash(seed, x0 + 1, y0)
  const n01 = hash(seed, x0, y0 + 1)
  const n11 = hash(seed, x0 + 1, y0 + 1)
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy)
}

function fbm(seed: number, x: number, y: number, octaves = 5): number {
  let amplitude = 0.5
  let frequency = 1
  let sum = 0
  let total = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(seed + i * 19, x * frequency, y * frequency) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return sum / total
}

// ── Color utilities ──

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map((item) => `${item}${item}`).join('')
    : value
  const int = Number.parseInt(normalized, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function rgbString(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

function samplePalette(palette: string[], t: number): [number, number, number] {
  const colors = palette.map(hexToRgb)
  const scaled = clamp(t) * (colors.length - 1)
  const index = Math.floor(scaled)
  const nextIndex = Math.min(colors.length - 1, index + 1)
  const localT = scaled - index
  return [
    Math.round(lerp(colors[index][0], colors[nextIndex][0], localT)),
    Math.round(lerp(colors[index][1], colors[nextIndex][1], localT)),
    Math.round(lerp(colors[index][2], colors[nextIndex][2], localT)),
  ]
}

function mixRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ]
}

function seededNumber(seed: string): number {
  return Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0)
}

// ── Canvas helpers (OffscreenCanvas) ──

interface TexChannel {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
  data: ImageData
}

function createChannel(w: number, h: number): TexChannel {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx, data: ctx.createImageData(w, h) }
}

function setRgb(data: Uint8ClampedArray, i: number, r: number, g: number, b: number, a = 255) {
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
}

function setGray(data: Uint8ClampedArray, i: number, v: number) {
  data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255
}

function flushChannels(...channels: TexChannel[]) {
  for (const ch of channels) ch.ctx.putImageData(ch.data, 0, 0)
}

// ── Overlay helpers ──

function overlayCraters(
  seed: number, width: number, height: number,
  colorCtx: OffscreenCanvasRenderingContext2D,
  bumpCtx: OffscreenCanvasRenderingContext2D,
  tint: string,
) {
  const craterCount = Math.max(90, Math.floor(width * 0.18))
  const tintRgb = hexToRgb(tint)

  for (let i = 0; i < craterCount; i += 1) {
    const radius = lerp(width * 0.008, width * 0.032, valueNoise(seed + 901, i * 1.7, 0.2))
    const x = valueNoise(seed + 911, i * 2.1, 0.4) * width
    const y = valueNoise(seed + 919, i * 2.7, 0.6) * height

    const shadow = colorCtx.createRadialGradient(x - radius * 0.18, y - radius * 0.14, radius * 0.08, x, y, radius)
    shadow.addColorStop(0, rgbString(tintRgb, 0.12))
    shadow.addColorStop(0.7, 'rgba(12, 8, 4, 0.18)')
    shadow.addColorStop(1, 'rgba(12, 8, 4, 0)')
    colorCtx.fillStyle = shadow
    colorCtx.beginPath()
    colorCtx.arc(x, y, radius, 0, Math.PI * 2)
    colorCtx.fill()

    bumpCtx.strokeStyle = 'rgba(255,255,255,0.18)'
    bumpCtx.lineWidth = Math.max(1, radius * 0.08)
    bumpCtx.beginPath()
    bumpCtx.arc(x - radius * 0.06, y - radius * 0.06, radius * 0.82, 0, Math.PI * 2)
    bumpCtx.stroke()

    bumpCtx.fillStyle = 'rgba(20,20,20,0.22)'
    bumpCtx.beginPath()
    bumpCtx.arc(x + radius * 0.05, y + radius * 0.05, radius * 0.64, 0, Math.PI * 2)
    bumpCtx.fill()
  }
}

function paintPolarCap(
  ctx: OffscreenCanvasRenderingContext2D,
  width: number, height: number,
  topColor: string, bottomColor: string,
) {
  const top = ctx.createLinearGradient(0, 0, 0, height * 0.16)
  top.addColorStop(0, `${topColor}dd`)
  top.addColorStop(1, `${topColor}00`)
  ctx.fillStyle = top
  ctx.fillRect(0, 0, width, height * 0.18)

  const bottom = ctx.createLinearGradient(0, height, 0, height * 0.84)
  bottom.addColorStop(0, `${bottomColor}dd`)
  bottom.addColorStop(1, `${bottomColor}00`)
  ctx.fillStyle = bottom
  ctx.fillRect(0, height * 0.82, width, height * 0.18)
}

function paintRockyAccents(
  seedLabel: string, seed: number, width: number, height: number,
  colorCtx: OffscreenCanvasRenderingContext2D,
  bumpCtx: OffscreenCanvasRenderingContext2D,
) {
  if (seedLabel === 'mars') {
    paintPolarCap(colorCtx, width, height, '#f5ddd2', '#f4e6df')
    colorCtx.strokeStyle = 'rgba(105, 24, 12, 0.2)'
    colorCtx.lineWidth = width * 0.01
    for (let i = 0; i < 3; i += 1) {
      const y = lerp(height * 0.32, height * 0.7, i / 2)
      colorCtx.beginPath()
      colorCtx.moveTo(width * 0.08, y)
      colorCtx.bezierCurveTo(width * 0.26, y - height * 0.08, width * 0.64, y + height * 0.12, width * 0.9, y - height * 0.03)
      colorCtx.stroke()

      bumpCtx.strokeStyle = 'rgba(255,255,255,0.08)'
      bumpCtx.lineWidth = width * 0.006
      bumpCtx.beginPath()
      bumpCtx.moveTo(width * 0.08, y)
      bumpCtx.bezierCurveTo(width * 0.26, y - height * 0.08, width * 0.64, y + height * 0.12, width * 0.9, y - height * 0.03)
      bumpCtx.stroke()
    }
    return
  }

  if (seedLabel === 'mercury') {
    for (let i = 0; i < 6; i += 1) {
      const x = valueNoise(seed + 301, i * 0.77, 0.4) * width
      const y = valueNoise(seed + 303, i * 0.91, 0.7) * height
      const radius = lerp(width * 0.06, width * 0.12, valueNoise(seed + 309, i * 1.1, 0.2))
      const gradient = colorCtx.createRadialGradient(x, y, radius * 0.08, x, y, radius)
      gradient.addColorStop(0, 'rgba(242, 227, 198, 0.2)')
      gradient.addColorStop(0.55, 'rgba(196, 174, 138, 0.06)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      colorCtx.fillStyle = gradient
      colorCtx.beginPath()
      colorCtx.arc(x, y, radius, 0, Math.PI * 2)
      colorCtx.fill()
    }
  }
}

// ── Texture size constants ──

const PLANET_W = 1024
const PLANET_H = 512
const RING_W = 1024
const RING_H = 64
const SUN_W = 512
const SUN_H = 256

// ── Generation functions ──

interface GenResult {
  bitmaps: ImageBitmap[]
  isColor: boolean[]
}

function toBitmaps(channels: TexChannel[], isColor: boolean[]): GenResult {
  return {
    bitmaps: channels.map((ch) => ch.canvas.transferToImageBitmap()),
    isColor,
  }
}

function genRockyPlanet(seedLabel: string, palette: string[]): GenResult {
  const seed = seededNumber(seedLabel)
  const colorCh = createChannel(PLANET_W, PLANET_H)
  const bumpCh = createChannel(PLANET_W, PLANET_H)
  const roughCh = createChannel(PLANET_W, PLANET_H)

  for (let y = 0; y < PLANET_H; y += 1) {
    const v = y / PLANET_H
    for (let x = 0; x < PLANET_W; x += 1) {
      const u = x / PLANET_W
      const latitude = Math.abs(v - 0.5) * 2
      const terrain = fbm(seed, u * 6.3, v * 4.1, 6)
      const ridges = 1 - Math.abs(fbm(seed + 23, u * 12.5, v * 9.2, 4) * 2 - 1)
      const cracks = fbm(seed + 41, u * 18.4, v * 13.7, 3)
      const micro = fbm(seed + 67, u * 32, v * 24, 2)
      const basins = smoothstep(0.55, 0.88, fbm(seed + 87, u * 2.8, v * 2.4, 4))
      const heightValue = clamp(terrain * 0.44 + ridges * 0.22 + micro * 0.16 + (1 - latitude) * 0.06 - basins * 0.1 - cracks * 0.06)
      const roughness = clamp(0.4 + ridges * 0.28 + basins * 0.18 + micro * 0.08)
      const color = samplePalette(palette, heightValue * 0.82 + ridges * 0.08 + basins * 0.14)
      const index = (y * PLANET_W + x) * 4

      setRgb(colorCh.data.data, index, color[0], color[1], color[2])
      setGray(bumpCh.data.data, index, Math.round(heightValue * 255))
      setGray(roughCh.data.data, index, Math.round(roughness * 255))
    }
  }

  flushChannels(colorCh, bumpCh, roughCh)
  overlayCraters(seed, PLANET_W, PLANET_H, colorCh.ctx, bumpCh.ctx, palette[palette.length - 1])
  paintRockyAccents(seedLabel, seed, PLANET_W, PLANET_H, colorCh.ctx, bumpCh.ctx)
  return toBitmaps([colorCh, bumpCh, roughCh], [true, false, false])
}

interface GasOptions {
  stormColor?: string
  polarTint?: string
  stormCount?: number
  emissiveStrength?: number
}

function genGasPlanet(seedLabel: string, palette: string[], options: GasOptions = {}): GenResult {
  const seed = seededNumber(seedLabel)
  const colorCh = createChannel(PLANET_W, PLANET_H)
  const bumpCh = createChannel(PLANET_W, PLANET_H)
  const roughCh = createChannel(PLANET_W, PLANET_H)
  const emissiveCh = createChannel(PLANET_W, PLANET_H)
  const polarTint = options.polarTint ? hexToRgb(options.polarTint) : null
  const glowColor = hexToRgb(options.stormColor || options.polarTint || palette[palette.length - 1])
  const emissiveStrength = options.emissiveStrength ?? 0.16

  for (let y = 0; y < PLANET_H; y += 1) {
    const v = y / PLANET_H
    const latitude = Math.abs(v - 0.5) * 2
    const bandShift = Math.sin(v * Math.PI * (12 + (seed % 7)) + seed * 0.1) * 0.04
    for (let x = 0; x < PLANET_W; x += 1) {
      const u = x / PLANET_W
      const turbulence = fbm(seed, u * 10 + bandShift * 4, v * 30, 5)
      const ribbon = fbm(seed + 17, u * 4, v * 18, 4)
      const vortices = fbm(seed + 31, u * 18 + ribbon * 3, v * 42, 3)
      const micro = fbm(seed + 57, u * 44, v * 72, 2)
      const value = clamp(v + bandShift + (turbulence - 0.5) * 0.18 + (ribbon - 0.5) * 0.12 + (micro - 0.5) * 0.03)
      const color = samplePalette(palette, value)
      const finalColor = polarTint && latitude > 0.7
        ? mixRgb(color, polarTint, smoothstep(0.7, 1, latitude) * 0.65)
        : color
      const index = (y * PLANET_W + x) * 4

      setRgb(colorCh.data.data, index, finalColor[0], finalColor[1], finalColor[2])
      setGray(bumpCh.data.data, index, Math.round(clamp(0.48 + (vortices - 0.5) * 0.34 + (micro - 0.5) * 0.4 + bandShift * 1.8) * 255))
      setGray(roughCh.data.data, index, Math.round(clamp(0.4 + Math.abs(bandShift) * 2.4 + (1 - turbulence) * 0.14 + latitude * 0.1) * 255))

      const emissive = Math.round(clamp((micro - 0.73) * 2.4 * emissiveStrength + smoothstep(0.82, 1, latitude) * emissiveStrength * 0.2) * 255)
      setRgb(emissiveCh.data.data, index, Math.round((glowColor[0] / 255) * emissive), Math.round((glowColor[1] / 255) * emissive), Math.round((glowColor[2] / 255) * emissive))
    }
  }

  flushChannels(colorCh, bumpCh, roughCh, emissiveCh)

  const stormCount = options.stormCount ?? 6
  const stormRgb = hexToRgb(options.stormColor || palette[Math.max(1, palette.length - 2)])
  for (let s = 0; s < stormCount; s += 1) {
    const centerX = PLANET_W * (0.14 + valueNoise(seed + 151, s * 0.9, 0.3) * 0.72)
    const centerY = PLANET_H * (0.2 + valueNoise(seed + 157, s * 1.4, 0.7) * 0.6)
    const radiusX = lerp(PLANET_W * 0.04, PLANET_W * 0.11, valueNoise(seed + 163, s * 0.7, 0.2))
    const radiusY = radiusX * lerp(0.28, 0.65, valueNoise(seed + 173, s * 0.6, 0.5))
    const rotation = lerp(-0.24, 0.24, valueNoise(seed + 181, s * 0.9, 0.9))

    for (let i = 0; i < 5; i += 1) {
      const scale = 1 - i * 0.14
      colorCh.ctx.fillStyle = rgbString(stormRgb, 0.16 - i * 0.02)
      colorCh.ctx.beginPath()
      colorCh.ctx.ellipse(centerX + i * 5, centerY - i * 2, radiusX * scale, radiusY * scale, rotation, 0, Math.PI * 2)
      colorCh.ctx.fill()

      bumpCh.ctx.fillStyle = `rgba(255,255,255,${0.08 - i * 0.01})`
      bumpCh.ctx.beginPath()
      bumpCh.ctx.ellipse(centerX + i * 4, centerY - i * 2, radiusX * scale, radiusY * scale, rotation, 0, Math.PI * 2)
      bumpCh.ctx.fill()

      roughCh.ctx.fillStyle = `rgba(30,30,30,${0.05 - i * 0.006})`
      roughCh.ctx.beginPath()
      roughCh.ctx.ellipse(centerX + i * 3, centerY - i * 1, radiusX * scale, radiusY * scale, rotation, 0, Math.PI * 2)
      roughCh.ctx.fill()

      emissiveCh.ctx.fillStyle = rgbString(glowColor, 0.08 - i * 0.01)
      emissiveCh.ctx.beginPath()
      emissiveCh.ctx.ellipse(centerX + i * 5, centerY - i * 2, radiusX * scale, radiusY * scale, rotation, 0, Math.PI * 2)
      emissiveCh.ctx.fill()
    }
  }

  return toBitmaps([colorCh, bumpCh, roughCh, emissiveCh], [true, false, false, true])
}

function genVenus(seedLabel: string): GenResult {
  const seed = seededNumber(seedLabel)
  const palette = ['#6c3e18', '#a95f24', '#d1a05e', '#f7dea3']
  const colorCh = createChannel(PLANET_W, PLANET_H)
  const bumpCh = createChannel(PLANET_W, PLANET_H)
  const roughCh = createChannel(PLANET_W, PLANET_H)
  const emissiveCh = createChannel(PLANET_W, PLANET_H)
  const glow = hexToRgb('#ffb85d')

  for (let y = 0; y < PLANET_H; y += 1) {
    const v = y / PLANET_H
    for (let x = 0; x < PLANET_W; x += 1) {
      const u = x / PLANET_W
      const swirl = fbm(seed, u * 8 + Math.sin(v * Math.PI * 4) * 1.6, v * 10, 6)
      const haze = fbm(seed + 27, u * 3.2, v * 18, 5)
      const cells = fbm(seed + 51, u * 28, v * 34, 3)
      const latitude = Math.abs(v - 0.5) * 2
      const value = clamp(swirl * 0.48 + haze * 0.3 + cells * 0.22 + Math.sin(v * Math.PI * 8 + u * 2) * 0.05)
      const color = samplePalette(palette, value)
      const index = (y * PLANET_W + x) * 4

      setRgb(colorCh.data.data, index, color[0], color[1], color[2])
      setGray(bumpCh.data.data, index, Math.round(clamp(0.52 + (cells - 0.5) * 0.4 + (swirl - 0.5) * 0.22) * 255))
      setGray(roughCh.data.data, index, Math.round(clamp(0.72 + (1 - haze) * 0.12 + latitude * 0.06) * 255))

      const emissive = Math.round(clamp((haze - 0.66) * 1.7 + smoothstep(0.78, 1, latitude) * 0.1) * 255)
      setRgb(emissiveCh.data.data, index, Math.round((glow[0] / 255) * emissive), Math.round((glow[1] / 255) * emissive), Math.round((glow[2] / 255) * emissive))
    }
  }

  flushChannels(colorCh, bumpCh, roughCh, emissiveCh)
  return toBitmaps([colorCh, bumpCh, roughCh, emissiveCh], [true, false, false, true])
}

function genCloud(seedLabel: string, baseColor: string, accentColor: string): GenResult {
  const seed = seededNumber(seedLabel)
  const ch = createChannel(PLANET_W, PLANET_H)
  const rgb = hexToRgb(baseColor)
  const accent = hexToRgb(accentColor)

  for (let y = 0; y < PLANET_H; y += 1) {
    const v = y / PLANET_H
    for (let x = 0; x < PLANET_W; x += 1) {
      const u = x / PLANET_W
      const noise = fbm(seed, u * 11, v * 7, 6)
      const wisps = fbm(seed + 73, u * 24, v * 14, 4)
      const curls = fbm(seed + 97, u * 42, v * 38, 2)
      const alpha = smoothstep(0.54, 0.84, noise * 0.55 + wisps * 0.3 + curls * 0.15)
      const color = mixRgb(rgb, accent, clamp(noise * 0.6 + curls * 0.35))
      setRgb(ch.data.data, (y * PLANET_W + x) * 4, color[0], color[1], color[2], Math.round(alpha * 255))
    }
  }

  ch.ctx.putImageData(ch.data, 0, 0)
  return toBitmaps([ch], [true])
}

function genRing(seedLabel: string, palette: string[]): GenResult {
  const seed = seededNumber(seedLabel)
  const ch = createChannel(RING_W, RING_H)

  for (let x = 0; x < RING_W; x += 1) {
    const u = x / RING_W
    const band = fbm(seed, u * 32, 0.2, 4)
    const glitter = fbm(seed + 22, u * 96, 0.8, 2)
    const alpha = clamp(smoothstep(0.1, 0.92, Math.sin(u * Math.PI) * 0.9 + band * 0.3) * (0.35 + glitter * 0.55))
    const color = samplePalette(palette, clamp(u * 0.75 + band * 0.25))

    for (let y = 0; y < RING_H; y += 1) {
      const edgeFade = Math.sin((y / (RING_H - 1)) * Math.PI)
      setRgb(ch.data.data, (y * RING_W + x) * 4, color[0], color[1], color[2], Math.round(alpha * edgeFade * 255))
    }
  }

  ch.ctx.putImageData(ch.data, 0, 0)
  return toBitmaps([ch], [true])
}

function genSun(seedLabel: string): GenResult {
  const seed = seededNumber(seedLabel)
  const palette = ['#5a1200', '#c94906', '#ff8a10', '#ffd15b', '#fff2bd']
  const ch = createChannel(SUN_W, SUN_H)

  for (let y = 0; y < SUN_H; y += 1) {
    const v = y / SUN_H
    for (let x = 0; x < SUN_W; x += 1) {
      const u = x / SUN_W
      const plasma = fbm(seed, u * 7 + Math.sin(v * Math.PI * 12) * 0.6, v * 9, 5)
      const flare = fbm(seed + 39, u * 24, v * 18, 2)
      const value = clamp(plasma * 0.78 + flare * 0.22)
      const color = samplePalette(palette, value)
      setRgb(ch.data.data, (y * SUN_W + x) * 4, color[0], color[1], color[2])
    }
  }

  ch.ctx.putImageData(ch.data, 0, 0)
  return toBitmaps([ch], [true])
}

function genPlanet(kind: string): GenResult {
  switch (kind) {
    case 'mercury':
      return genRockyPlanet('mercury', ['#3f3f44', '#726454', '#a1917b', '#d9c8a3'])
    case 'mars':
      return genRockyPlanet('mars', ['#4c1b12', '#8b3b27', '#c1623b', '#f0b18b'])
    case 'venus':
      return genVenus('venus')
    case 'jupiter':
      return genGasPlanet('jupiter', ['#6f472c', '#a36f46', '#d9b082', '#f3d9ab', '#a35a42'], { stormColor: '#ff9369', stormCount: 8, emissiveStrength: 0.24 })
    case 'saturn':
      return genGasPlanet('saturn', ['#70624f', '#b29a76', '#dbc8a0', '#f2e1b4', '#d7c18d'], { polarTint: '#fff1c9', stormCount: 5, emissiveStrength: 0.12 })
    case 'uranus':
      return genGasPlanet('uranus', ['#8ed0d8', '#9ce4ea', '#b8fbff', '#d8ffff'], { polarTint: '#efffff', stormCount: 4, emissiveStrength: 0.1 })
    case 'neptune':
      return genGasPlanet('neptune', ['#0a2e90', '#235bcb', '#4d8cff', '#8cc3ff'], { stormColor: '#79b5ff', stormCount: 7, emissiveStrength: 0.22 })
    default:
      return genRockyPlanet('earth-fallback', ['#1c365e', '#2c6d6a', '#63996d', '#d8d0ab'])
  }
}

// ── Worker message handler ──

self.onmessage = (e: MessageEvent) => {
  const { id, type } = e.data
  let result: GenResult

  switch (type) {
    case 'planet': result = genPlanet(e.data.kind); break
    case 'cloud': result = genCloud(e.data.seedLabel, e.data.baseColor, e.data.accentColor); break
    case 'ring': result = genRing(e.data.seedLabel, e.data.palette); break
    case 'sun': result = genSun(e.data.seedLabel); break
    default: throw new Error(`Unknown texture type: ${type}`)
  }

  ;(self as unknown as Worker).postMessage(
    { id, bitmaps: result.bitmaps, isColor: result.isColor },
    result.bitmaps as unknown as Transferable[],
  )
}
