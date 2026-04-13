declare module 'three/webgpu' {
  import type {
    Material,
    MeshBasicMaterial,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    PointsMaterial,
    SpriteMaterial,
  } from 'three'

  export * from 'three'
  export class MeshBasicNodeMaterial extends MeshBasicMaterial {
    [key: string]: any
  }
  export class MeshStandardNodeMaterial extends MeshStandardMaterial {
    [key: string]: any
  }
  export class MeshPhysicalNodeMaterial extends MeshPhysicalMaterial {
    [key: string]: any
  }
  export class SpriteNodeMaterial extends SpriteMaterial {
    [key: string]: any
  }
  export class PointsNodeMaterial extends PointsMaterial {
    [key: string]: any
  }
  export class PostProcessing {
    constructor(renderer: any)
    outputNode: any
    needsUpdate: boolean
    render(): void
    renderAsync(): Promise<void>
    dispose(): void
  }
  export class WebGPURenderer {
    constructor(options?: any)
    domElement: HTMLCanvasElement
    toneMapping: any
    toneMappingExposure: number
    outputColorSpace: any
    setPixelRatio(value: number): void
    setSize(width: number, height: number): void
    setAnimationLoop(callback: ((time: number) => void) | null): void
    render(scene: any, camera: any): void
    renderAsync(scene: any, camera: any): Promise<void>
    init(): Promise<void>
    dispose(): void
  }
}

declare module 'three/tsl' {
  export function pass(scene: any, camera: any): any
  export const cameraPosition: any
  export const color: any
  export const float: any
  export const mix: any
  export const normalMap: any
  export const normalWorld: any
  export const positionLocal: any
  export const positionWorld: any
  export const saturation: any
  export const screenUV: any
  export const smoothstep: any
  export const texture: any
  export const time: any
  export const uniform: any
  export const uv: any
  export const vec2: any
  export const vertexColor: any
}

declare module 'three/addons/controls/OrbitControls.js' {
  import { Camera, Vector3 } from 'three'
  export class OrbitControls {
    constructor(camera: Camera, domElement?: HTMLElement)
    enabled: boolean
    enableDamping: boolean
    dampingFactor: number
    enablePan: boolean
    autoRotate: boolean
    autoRotateSpeed: number
    mouseButtons: any
    touches: any
    minDistance: number
    maxDistance: number
    target: Vector3
    update(): void
    dispose(): void
  }
}

declare module 'three/addons/tsl/display/BloomNode.js' {
  export function bloom(input: any, strength?: number, radius?: number, threshold?: number): any
}
