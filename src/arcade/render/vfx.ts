import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  Sprite,
  SpriteMaterial,
} from 'three/webgpu'
import { getGlowTexture } from '../../planet/procedural-textures'
import type { MissilePhase, Vec2 } from '../types'
import { disposeMaterialLater, removeAndDisposeObjectLater } from './deferred-dispose'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  maxAge: number
  color: Color
}

interface Popup {
  sprite: Sprite
  age: number
  maxAge: number
  vy: number
}

interface Flash {
  sprite: Sprite
  age: number
  maxAge: number
  startScale: number
  endScale: number
  maxOpacity: number
}

interface TrailParticle {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  maxAge: number
  color: Color
}

interface Shake {
  intensity: number
  duration: number
  elapsed: number
  offset: Vec2
}

const MAX_PARTICLES = 240
const MAX_TRAIL_PARTICLES = 960

export class VFXManager {
  private readonly parent: Group
  private readonly particles: Particle[] = []
  private readonly trailParticles: TrailParticle[] = []
  private readonly popups: Popup[] = []
  private readonly flashes: Flash[] = []
  private readonly points: Points
  private readonly pointMaterial: PointsMaterial
  private readonly trailPoints: Points
  private readonly trailMaterial: PointsMaterial
  private readonly positions: Float32BufferAttribute
  private readonly colors: Float32BufferAttribute
  private readonly trailPositions: Float32BufferAttribute
  private readonly trailColors: Float32BufferAttribute
  private readonly shake: Shake = { intensity: 0, duration: 0, elapsed: 0, offset: { x: 0, y: 0 } }
  private hazardTint = 0

  constructor(parent: Group) {
    this.parent = parent
    this.positions = new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    this.colors = new Float32BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', this.positions)
    geometry.setAttribute('color', this.colors)
    geometry.setDrawRange(0, 0)
    this.trailPositions = new Float32BufferAttribute(new Float32Array(MAX_TRAIL_PARTICLES * 3), 3)
    this.trailColors = new Float32BufferAttribute(new Float32Array(MAX_TRAIL_PARTICLES * 3), 3)
    const trailGeometry = new BufferGeometry()
    trailGeometry.setAttribute('position', this.trailPositions)
    trailGeometry.setAttribute('color', this.trailColors)
    trailGeometry.setDrawRange(0, 0)

    this.pointMaterial = new PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    this.pointMaterial.toneMapped = false
    this.trailMaterial = new PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    this.trailMaterial.toneMapped = false

    this.points = new Points(geometry, this.pointMaterial)
    this.points.frustumCulled = false
    this.points.visible = false
    this.trailPoints = new Points(trailGeometry, this.trailMaterial)
    this.trailPoints.frustumCulled = false
    this.trailPoints.visible = false
    parent.add(this.points)
    parent.add(this.trailPoints)
  }

  explosion(x: number, y: number, color: string, scale = 1): void {
    const tone = new Color(color)
    const count = Math.min(MAX_PARTICLES - this.particles.length, Math.floor(10 + scale * 8))
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.4
      const speed = (6 + Math.random() * 10) * scale
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        maxAge: 0.5 + Math.random() * 0.3,
        color: tone.clone(),
      })
    }
  }

  enemyExplosion(x: number, y: number, color: string, radius = 1): void {
    const scale = Math.max(0.72, radius)
    const flashSize = 2.8 + scale * 1.9
    const variant = Math.floor(Math.random() * 3)
    if (variant === 0) {
      this.spawnFlash(x, y, '#fff2bf', flashSize, 0.78, 0.18)
      this.explosion(x, y, color, scale * 1.18)
      this.explosion(x, y, '#fff1bf', scale * 0.52)
      return
    }

    if (variant === 1) {
      this.spawnFlash(x - scale * 0.08, y + scale * 0.04, '#ffd8a6', flashSize * 0.9, 0.72, 0.16)
      this.spawnFlash(x + scale * 0.16, y - scale * 0.03, color, flashSize * 0.68, 0.55, 0.14)
      this.explosion(x - scale * 0.16, y + scale * 0.05, color, scale * 0.98)
      this.explosion(x + scale * 0.2, y - scale * 0.04, '#ffd39f', scale * 0.84)
      return
    }

    this.spawnFlash(x, y, '#ffcf8a', flashSize * 1.06, 0.82, 0.2)
    this.explosion(x, y, color, scale * 0.92)
    this.explosion(x, y, '#ffb178', scale * 1.16)
    this.explosion(x, y, '#fff4cc', scale * 0.38)
  }

  scorePopup(x: number, y: number, text: string, color = '#ffd765'): void {
    const canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.font = 'bold 36px monospace'
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 96, 32)
    const texture = new CanvasTexture(canvas)
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
    material.toneMapped = false
    const sprite = new Sprite(material)
    sprite.position.set(x, y, 0.4)
    sprite.scale.set(3.2, 1.1, 1)
    this.parent.add(sprite)
    this.popups.push({ sprite, age: 0, maxAge: 0.9, vy: 4.5 })
  }

  missileTrail(x: number, y: number, color: string, phase: MissilePhase): void {
    if (this.trailParticles.length >= MAX_TRAIL_PARTICLES) return
    const tone = new Color(color)
    const linger = phase === 'terminal' ? 0.24 : phase === 'launch' ? 0.18 : 0.2
    const speed = phase === 'terminal' ? 1.2 : 0.8
    this.trailParticles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * speed,
      vy: -0.4 - Math.random() * speed,
      age: 0,
      maxAge: linger + Math.random() * 0.08,
      color: tone,
    })
  }

  screenShake(intensity: number, duration: number): void {
    this.shake.intensity = Math.max(this.shake.intensity, intensity)
    this.shake.duration = Math.max(this.shake.duration, duration)
    this.shake.elapsed = 0
  }

  setHazardTint(amount: number): void {
    this.hazardTint = amount
  }

  getHazardTint(): number {
    return this.hazardTint
  }

  getShakeOffset(): Vec2 {
    return this.shake.offset
  }

  update(delta: number): void {
    for (const particle of this.particles) {
      particle.age += delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.vx *= 0.96
      particle.vy *= 0.96
    }

    let writeIndex = 0
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i]
      if (particle.age >= particle.maxAge) continue
      const alpha = 1 - particle.age / particle.maxAge
      this.positions.setXYZ(writeIndex, particle.x, particle.y, 0.1)
      this.colors.setXYZ(writeIndex, particle.color.r * alpha, particle.color.g * alpha, particle.color.b * alpha)
      this.particles[writeIndex] = particle
      writeIndex += 1
    }
    this.particles.length = writeIndex
    this.positions.needsUpdate = true
    this.colors.needsUpdate = true
    this.points.geometry.setDrawRange(0, writeIndex)
    this.points.visible = writeIndex > 0

    for (const particle of this.trailParticles) {
      particle.age += delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.vx *= 0.92
      particle.vy *= 0.92
    }

    let trailWriteIndex = 0
    for (let i = 0; i < this.trailParticles.length; i++) {
      const particle = this.trailParticles[i]
      if (particle.age >= particle.maxAge) continue
      const alpha = 1 - particle.age / particle.maxAge
      this.trailPositions.setXYZ(trailWriteIndex, particle.x, particle.y, 0.12)
      this.trailColors.setXYZ(trailWriteIndex, particle.color.r * alpha, particle.color.g * alpha, particle.color.b * alpha)
      this.trailParticles[trailWriteIndex] = particle
      trailWriteIndex += 1
    }
    this.trailParticles.length = trailWriteIndex
    this.trailPositions.needsUpdate = true
    this.trailColors.needsUpdate = true
    this.trailPoints.geometry.setDrawRange(0, trailWriteIndex)
    this.trailPoints.visible = trailWriteIndex > 0

    for (const popup of this.popups) {
      popup.age += delta
      popup.sprite.position.y += popup.vy * delta
      const alpha = Math.max(0, 1 - popup.age / popup.maxAge)
      ;(popup.sprite.material as SpriteMaterial).opacity = alpha
    }
    for (let index = this.popups.length - 1; index >= 0; index--) {
      const popup = this.popups[index]
      if (popup.age < popup.maxAge) continue
      popup.sprite.removeFromParent()
      disposeMaterialLater(popup.sprite.material, { disposeMap: true })
      this.popups.splice(index, 1)
    }

    for (const flash of this.flashes) {
      flash.age += delta
      const t = Math.min(1, flash.age / flash.maxAge)
      const alpha = (1 - t) * (1 - t)
      const scale = flash.startScale + (flash.endScale - flash.startScale) * t
      flash.sprite.scale.setScalar(scale)
      ;(flash.sprite.material as SpriteMaterial).opacity = flash.maxOpacity * alpha
    }
    for (let index = this.flashes.length - 1; index >= 0; index--) {
      const flash = this.flashes[index]
      if (flash.age < flash.maxAge) continue
      flash.sprite.removeFromParent()
      disposeMaterialLater(flash.sprite.material)
      this.flashes.splice(index, 1)
    }

    if (this.shake.elapsed < this.shake.duration) {
      this.shake.elapsed += delta
      const damping = 1 - this.shake.elapsed / this.shake.duration
      const angle = this.shake.elapsed * 32
      this.shake.offset.x = Math.sin(angle) * this.shake.intensity * damping
      this.shake.offset.y = Math.cos(angle * 1.2) * this.shake.intensity * damping
    } else {
      this.shake.offset.x = 0
      this.shake.offset.y = 0
    }

    this.hazardTint = Math.max(0, this.hazardTint - delta * 0.4)
  }

  dispose(): void {
    removeAndDisposeObjectLater(this.points)
    removeAndDisposeObjectLater(this.trailPoints)
    for (const popup of this.popups) {
      popup.sprite.removeFromParent()
      disposeMaterialLater(popup.sprite.material, { disposeMap: true })
    }
    for (const flash of this.flashes) {
      flash.sprite.removeFromParent()
      disposeMaterialLater(flash.sprite.material)
    }
    this.popups.length = 0
    this.flashes.length = 0
    this.particles.length = 0
    this.trailParticles.length = 0
  }

  private spawnFlash(x: number, y: number, color: string, scale: number, opacity: number, maxAge: number): void {
    const material = new SpriteMaterial({
      map: getGlowTexture(color),
      color,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      opacity,
    })
    material.toneMapped = false
    const sprite = new Sprite(material)
    sprite.renderOrder = 4
    sprite.position.set(x, y, 0.24)
    sprite.scale.setScalar(scale * 0.8)
    this.parent.add(sprite)
    this.flashes.push({
      sprite,
      age: 0,
      maxAge,
      startScale: scale * 0.8,
      endScale: scale * 1.9,
      maxOpacity: opacity,
    })
  }
}
