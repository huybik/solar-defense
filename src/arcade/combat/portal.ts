import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  TorusGeometry,
} from 'three/webgpu'
import { removeAndDisposeObjectLater } from '../render/deferred-dispose'
import type { Vec2 } from '../types'

const PORTAL_RADIUS = 5
const TUBE_RADIUS = 0.6
const PARTICLE_COUNT = 400
const COLLISION_RADIUS = 4

export class Portal {
  readonly group = new Group()
  private readonly ring: Mesh
  private readonly inner: Mesh
  private readonly particles: Points
  private readonly particlePositions: Float32Array
  private elapsed = 0

  constructor(x: number, y: number) {
    this.group.position.set(x, y, 0)

    // Torus ring
    const ringGeo = new TorusGeometry(PORTAL_RADIUS, TUBE_RADIUS, 16, 64)
    const ringMat = new MeshBasicMaterial({
      color: new Color('#00ff88'),
      transparent: true,
      opacity: 0.85,
    })
    this.ring = new Mesh(ringGeo, ringMat)
    this.group.add(this.ring)

    // Inner glow disk
    const innerGeo = new CircleGeometry(PORTAL_RADIUS - 0.5, 48)
    const innerMat = new MeshBasicMaterial({
      color: new Color('#00cc66'),
      transparent: true,
      opacity: 0.35,
      side: DoubleSide,
      blending: AdditiveBlending,
    })
    this.inner = new Mesh(innerGeo, innerMat)
    this.inner.position.z = 0.01
    this.group.add(this.inner)

    // Swirling particles
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const colors = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2
      const r = PORTAL_RADIUS + (Math.random() - 0.5) * 2
      const i3 = i * 3
      positions[i3] = Math.cos(angle) * r
      positions[i3 + 1] = Math.sin(angle) * r
      positions[i3 + 2] = (Math.random() - 0.5) * 1.5
      colors[i3] = 0.1 + Math.random() * 0.2
      colors[i3 + 1] = 0.7 + Math.random() * 0.3
      colors[i3 + 2] = 0.3 + Math.random() * 0.3
    }
    this.particlePositions = positions
    const particleGeo = new BufferGeometry()
    particleGeo.setAttribute('position', new Float32BufferAttribute(positions, 3))
    particleGeo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const particleMat = new PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
    })
    this.particles = new Points(particleGeo, particleMat)
    this.group.add(this.particles)

    // Start invisible, fade in
    this.group.visible = true
    this.group.scale.setScalar(0.01)
  }

  update(delta: number): void {
    this.elapsed += delta

    // Scale-in animation
    const scale = Math.min(1, this.elapsed * 1.2)
    this.group.scale.setScalar(scale)

    // Pulse the inner disk
    const pulse = 0.3 + Math.sin(this.elapsed * 2.5) * 0.1
    ;(this.inner.material as MeshBasicMaterial).opacity = pulse

    // Rotate ring slowly
    this.ring.rotation.z = this.elapsed * 0.4

    // Swirl particles
    const positions = this.particlePositions
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const x = positions[i3]
      const y = positions[i3 + 1]
      const angle = Math.atan2(y, x) + delta * (1.2 + (i % 5) * 0.15)
      const r = Math.sqrt(x * x + y * y)
      positions[i3] = Math.cos(angle) * r
      positions[i3 + 1] = Math.sin(angle) * r
      positions[i3 + 2] += Math.sin(this.elapsed * 2 + i) * 0.01
    }
    this.particles.geometry.attributes.position.needsUpdate = true
  }

  checkCollision(pos: Vec2): boolean {
    const dx = pos.x - this.group.position.x
    const dy = pos.y - this.group.position.y
    return dx * dx + dy * dy < COLLISION_RADIUS * COLLISION_RADIUS
  }

  dispose(): void {
    removeAndDisposeObjectLater(this.ring)
    removeAndDisposeObjectLater(this.inner)
    removeAndDisposeObjectLater(this.particles)
    this.group.removeFromParent()
  }
}
