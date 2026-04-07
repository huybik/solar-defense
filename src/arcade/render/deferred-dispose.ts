type Disposable = { dispose(): void }

type DisposableMaterial =
  | ({ dispose?: () => void; map?: Disposable | null } & Record<string, unknown>)
  | null
  | undefined

type DisposableGeometry = Disposable | null | undefined

type DisposableObject = {
  removeFromParent(): void
  geometry?: DisposableGeometry
  material?: DisposableMaterial | DisposableMaterial[]
}

const pendingDisposals: Array<() => void> = []

function disposeMaterial(material: DisposableMaterial | DisposableMaterial[], disposeMap: boolean): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeMaterial(entry, disposeMap)
    }
    return
  }

  if (!material) return
  if (disposeMap && material.map && typeof material.map.dispose === 'function') {
    material.map.dispose()
  }
  if (typeof material.dispose === 'function') {
    material.dispose()
  }
}

export function disposeMaterialLater(
  material: DisposableMaterial | DisposableMaterial[],
  options: { disposeMap?: boolean } = {},
): void {
  const { disposeMap = false } = options
  pendingDisposals.push(() => disposeMaterial(material, disposeMap))
}

export function removeAndDisposeObjectLater(
  object: DisposableObject,
  options: { disposeGeometry?: boolean; disposeMap?: boolean } = {},
): void {
  const { disposeGeometry = true, disposeMap = false } = options
  object.removeFromParent()
  pendingDisposals.push(() => {
    if (disposeGeometry && object.geometry && typeof object.geometry.dispose === 'function') {
      object.geometry.dispose()
    }
    disposeMaterial(object.material, disposeMap)
  })
}

export function flushDeferredDisposals(): void {
  while (pendingDisposals.length > 0) {
    const dispose = pendingDisposals.shift()
    dispose?.()
  }
}
