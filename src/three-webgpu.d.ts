declare module 'three/webgpu' {
  export * from 'three'
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
