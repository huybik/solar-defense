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

const DISPOSAL_DELAY_FLUSHES = 3
const pendingDisposals = Array.from(
  { length: DISPOSAL_DELAY_FLUSHES + 1 },
  (): Array<() => void> => [],
)

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
  pendingDisposals[pendingDisposals.length - 1].push(() => disposeMaterial(material, disposeMap))
}

export function removeAndDisposeObjectLater(
  object: DisposableObject,
  options: { disposeGeometry?: boolean; disposeMap?: boolean } = {},
): void {
  const { disposeGeometry = true, disposeMap = false } = options
  object.removeFromParent()
  pendingDisposals[pendingDisposals.length - 1].push(() => {
    if (disposeGeometry && object.geometry && typeof object.geometry.dispose === 'function') {
      object.geometry.dispose()
    }
    disposeMaterial(object.material, disposeMap)
  })
}

export function flushDeferredDisposals(options: { force?: boolean } = {}): void {
  const { force = false } = options

  if (force) {
    for (const bucket of pendingDisposals) {
      while (bucket.length > 0) {
        const dispose = bucket.shift()
        dispose?.()
      }
    }
    return
  }

  const ready = pendingDisposals.shift()
  pendingDisposals.push([])
  while (ready && ready.length > 0) {
    const dispose = ready.shift()
    dispose?.()
  }
}
