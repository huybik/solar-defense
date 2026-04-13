/**
 * Standalone shim for @learnfun/game-sdk.
 * Provides the same interface so the game runs without the real SDK.
 */

// --- Types ---

export interface GameEndResults {
  outcome: string
  finalScore?: number
  [key: string]: unknown
}

export interface ActionDef {
  name: string
  params?: Record<string, string>
  description?: string
  godMode?: boolean
}

export interface MultiplayerPeer {
  id: string
  name: string
  score: number
  phase: string | null
  roleMode?: string | null
  isLeader?: boolean
  isSelf?: boolean
}

export interface GameContext<S> {
  state: S
  root: HTMLElement
  readonly isFollower: boolean
  readonly peers: MultiplayerPeer[]
  readonly isMobile: boolean
  readonly bridge: GameBridge
  emit(name: string, data?: Record<string, unknown>): void
  end(results?: Partial<GameEndResults>): void
  render(): void
  sync(): void
}

export interface GameConfig<S extends Record<string, any>> {
  initialState: S
  localKeys?: (keyof S)[]
  scoreKey?: keyof S
  hasOwnHUD?: boolean
  defaultInitData?: unknown
  actionDefs?: ActionDef[]
  init(ctx: GameContext<S>, data: unknown): void
  actions: Record<string, (ctx: GameContext<S>, params: Record<string, unknown>) => void>
  render(ctx: GameContext<S>): void
  teacherState?(ctx: GameContext<S>): Record<string, unknown>
  serializeState?(state: S): Record<string, unknown>
  deserializeState?(data: Record<string, unknown>): S
  destroy?(ctx: GameContext<S>): void
}

export type GameAPI = unknown
export type GameToHost = unknown
export type HostToGame = unknown
export type BridgeConfig = unknown
export type MultiplayerGame = unknown

;(globalThis as typeof globalThis & { __LEARNFUN_SDK_SHIM__?: boolean }).__LEARNFUN_SDK_SHIM__ = true

// --- GameBridge stub ---

export class GameBridge {
  emitEvent(_name: string, _data: Record<string, unknown> = {}) {}
  updateState(_state: Record<string, unknown>) {}
  syncState(_teacher: Record<string, unknown>, _full?: Record<string, unknown>) {}
  endGame(_results: GameEndResults) {}
  relayAction(_name: string, _params: Record<string, unknown>) {}
  register(_game: any) {}
}

// --- createGame ---

export function createGame<S extends Record<string, any>>(config: GameConfig<S>): void {
  const root = document.getElementById('game') || document.body
  let state = structuredClone(config.initialState) as S
  const bridge = new GameBridge()

  const ctx: GameContext<S> = {
    get state() { return state },
    set state(s: S) { state = s },
    root,
    get isFollower() { return false },
    get peers() { return [] },
    get isMobile() { return 'ontouchstart' in window },
    get bridge() { return bridge },
    emit(_name: string, _data: Record<string, unknown> = {}) {},
    end(_results?: Partial<GameEndResults>) {},
    render() { config.render(ctx) },
    sync() {},
  }

  state = structuredClone(config.initialState) as S
  config.init(ctx, config.defaultInitData || {})
  config.render(ctx)
}
