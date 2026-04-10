import { createGame } from '@learnfun/game-sdk'
import { DEFAULT_INIT_DATA } from './planet/data'
import type { SolarState } from './types'
import { SolarGameRuntime } from './lesson/runtime'

const INITIAL_STATE: SolarState = {
  phase: 'briefing',
  planetIndex: 0,
  score: 0,
  streak: 0,
  scannedHotspots: [],
  answered: false,
  selectedChoice: null,
  isFollower: false,
  peers: [],
}

const runtime = new SolarGameRuntime()

createGame<SolarState>({
  initialState: INITIAL_STATE,

  localKeys: ['isFollower', 'peers'],
  hasOwnHUD: true,

  defaultInitData: DEFAULT_INIT_DATA,

  actionDefs: [
    { name: 'submit', params: { value: 'string' }, description: 'Submit a hotspot id or puzzle answer' },
    { name: 'next', description: 'Advance the current phase' },
    { name: 'next_mission', description: 'Advance the arcade campaign to the next mission and launch it', godMode: true },
    { name: 'reveal', description: 'Reveal remaining clues or the correct answer', godMode: true },
    { name: 'jump', params: { to: 'number' }, description: 'Jump to a planet index', godMode: true },
    { name: 'end', description: 'End the voyage immediately', godMode: true },
    { name: 'arcade', description: 'Enter arcade shooter mode', godMode: true },
    { name: 'cinematic', description: 'Play the cinematic introduction', godMode: true },
    { name: 'set', params: { field: 'string', value: 'string' }, description: 'Override a game field', godMode: true },
  ],

  init(ctx, data) {
    runtime.init(ctx, data)
  },

  actions: {
    submit(_ctx, params) { runtime.dispatchAction('submit', params) },
    next() { runtime.dispatchAction('next', {}) },
    next_mission() { runtime.dispatchAction('next_mission', {}) },
    reveal() { runtime.dispatchAction('reveal', {}) },
    jump(_ctx, params) { runtime.dispatchAction('jump', params) },
    end() { runtime.dispatchAction('end', {}) },
    arcade() { runtime.dispatchAction('arcade', {}) },
    cinematic() { runtime.dispatchAction('cinematic', {}) },
    set(_ctx, params) { runtime.dispatchAction('set', params) },
  },

  render() {
    runtime.render()
  },

  teacherState: () => runtime.getTeacherState(),

  serializeState(state) {
    return runtime.serializeState(state)
  },

  destroy() {
    runtime.destroy()
  },
})
