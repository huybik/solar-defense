import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  type Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
} from 'three/webgpu'
import { createNebulaTexture, createSunTexture, getGlowTexture } from '../planet/procedural-textures'
import type { PlanetMission } from '../types'

export async function buildEnvironment(scene: Scene, missions: PlanetMission[]): Promise<Object3D[]> {
  const objects: Object3D[] = []

  const nebula = new Mesh(
    new SphereGeometry(720, 64, 64),
    new MeshBasicMaterial({
      map: createNebulaTexture('nebula'),
      color: new Color('#bcc9d8'),
      transparent: true,
      opacity: 0.18,
      side: BackSide,
    }),
  )
  scene.add(nebula)
  objects.push(nebula)

  for (const [count, minR, maxR, size] of [
    [2800, 160, 420, 0.12],
    [1400, 240, 620, 0.2],
    [700, 360, 860, 0.34],
  ] as const) {
    const stars = createStarfield(count, minR, maxR, size)
    scene.add(stars)
    objects.push(stars)
  }

  const ambient = new AmbientLight('#748bff', 0.25)
  const hemi = new HemisphereLight('#69baff', '#140c08', 0.34)
  const sunLight = new PointLight('#ffd27d', 9.6, 340, 1.2)
  sunLight.position.set(0, 0, 0)
  const rim = new PointLight('#55a0ff', 0.42, 180, 1.7)
  rim.position.set(-48, 18, -26)
  scene.add(ambient, hemi, sunLight, rim)

  const sunGroup = new Group()
  const sunTexture = await createSunTexture('sun')
  const sun = new Mesh(
    new SphereGeometry(3, 80, 80),
    new MeshBasicMaterial({ map: sunTexture, color: new Color('#ffcf59') }),
  )
  const innerGlow = new Sprite(
    new SpriteMaterial({
      map: getGlowTexture('#ffdf92'),
      color: '#ffcf70',
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    }),
  )
  innerGlow.scale.setScalar(9)
  const outerGlow = new Sprite(
    new SpriteMaterial({
      map: getGlowTexture('#ff7a1f'),
      color: '#ff9840',
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0.4,
    }),
  )
  outerGlow.scale.setScalar(15)
  sunGroup.add(outerGlow, innerGlow, sun)
  scene.add(sunGroup)
  objects.push(sunGroup)

  const orbitMaterial = new LineBasicMaterial({ color: '#233456', transparent: true, opacity: 0.14 })
  for (const mission of missions) {
    const orbit = createOrbitLine(mission.orbitRadius, orbitMaterial)
    scene.add(orbit)
    objects.push(orbit)
  }

  const asteroidMesh = new InstancedMesh(
    new IcosahedronGeometry(0.14, 0),
    new MeshStandardMaterial({ color: '#77695b', roughness: 1, metalness: 0.02 }),
    360,
  )
  const dummy = new Object3D()
  for (let i = 0; i < 360; i += 1) {
    const angle = (i / 360) * Math.PI * 2
    const radius = 32.8 + Math.sin(i * 14.7) * 1.1 + (i % 9) * 0.12
    dummy.position.set(Math.cos(angle) * radius, Math.sin(i * 0.61) * 0.55, Math.sin(angle) * radius)
    dummy.rotation.set(angle * 0.7, angle * 1.8, angle * 1.1)
    dummy.scale.setScalar(0.45 + (i % 7) * 0.06)
    dummy.updateMatrix()
    asteroidMesh.setMatrixAt(i, dummy.matrix)
  }
  asteroidMesh.instanceMatrix.needsUpdate = true
  scene.add(asteroidMesh)
  objects.push(asteroidMesh)

  return objects
}

function createOrbitLine(radius: number, material: LineBasicMaterial): Line {
  const points: number[] = []
  const steps = 160
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    points.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
  }
  points.push(radius, 0, 0)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3))
  return new Line(geometry, material)
}

function createStarfield(count: number, minRadius: number, maxRadius: number, size: number): Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    const radius = minRadius + (maxRadius - minRadius) * Math.random()
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const sinPhi = Math.sin(phi)
    const index = i * 3
    positions[index] = radius * sinPhi * Math.cos(theta)
    positions[index + 1] = radius * Math.cos(phi)
    positions[index + 2] = radius * sinPhi * Math.sin(theta)
    const tint = [['#d8e0ef', '#ebe1d2'], ['#eef2fb', '#d8e4f4'], ['#e4e9f5', '#eee3e6']][i % 3]
    const color = new Color(Math.random() > 0.5 ? tint[0] : tint[1])
    colors[index] = color.r
    colors[index + 1] = color.g
    colors[index + 2] = color.b
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return new Points(geometry, new PointsMaterial({
    size, transparent: true, opacity: 0.6,
    sizeAttenuation: true, vertexColors: true, depthWrite: false,
  }))
}
