import { getDataLogEntry } from '../data/lore'
import {
  registerRescue,
  registerSecret,
  type CombatScoreState,
} from '../progression/scoring'
import type { ArcadeEvent, PickupEntity, PlayerLoadout, PlayerState } from '../types'

export interface PickupPlayerController {
  getState(): PlayerState
  addHealth(value: number): void
  addBombs(value: number): void
  addEnergy(value: number): void
  addShield(value: number): void
}

export interface PickupPowerupController {
  apply(loadout: PlayerLoadout, player: PlayerState, dropId: number): string
}

export interface PickupEffectContext {
  player: PickupPlayerController
  scoreState: CombatScoreState
  powerups: PickupPowerupController
  scorePopup: (x: number, y: number, text: string, color?: string) => void
}

export interface PickupEffectResult {
  latestComms: string[] | null
  event: ArcadeEvent | null
}

export function applyPickupEffect(
  pickup: PickupEntity,
  context: PickupEffectContext,
): PickupEffectResult {
  const player = context.player.getState()

  switch (pickup.type) {
    case 'credits':
      context.scoreState.credits += pickup.value
      context.scorePopup(pickup.position.x, pickup.position.y + 0.6, `+${pickup.value}c`, '#ffe48a')
      return { latestComms: null, event: null }
    case 'score':
      context.scoreState.score += pickup.value
      context.scorePopup(pickup.position.x, pickup.position.y + 0.6, `+${pickup.value}`)
      return { latestComms: null, event: null }
    case 'health':
      context.player.addHealth(pickup.value)
      return { latestComms: null, event: null }
    case 'bomb':
      context.player.addBombs(pickup.value)
      return { latestComms: null, event: null }
    case 'energy':
      context.player.addEnergy(pickup.value)
      return { latestComms: null, event: null }
    case 'shield':
      context.player.addShield(pickup.value)
      return { latestComms: null, event: null }
    case 'special': {
      const activeSpecial = player.loadout.activeSpecial ?? 'homing_missiles'
      player.loadout.specialAmmo[activeSpecial] = (player.loadout.specialAmmo[activeSpecial] ?? 0) + 3
      return { latestComms: null, event: null }
    }
    case 'astronaut':
      registerRescue(context.scoreState)
      context.scorePopup(pickup.position.x, pickup.position.y + 0.6, 'RESCUE', '#9dfbff')
      return { latestComms: null, event: null }
    case 'pretzel':
      context.scoreState.credits += 30
      context.scoreState.score += 120
      return { latestComms: null, event: null }
    case 'data_cube':
      if (!pickup.payload) {
        return { latestComms: null, event: null }
      }
      registerSecret(context.scoreState)
      return {
        latestComms: [getDataLogEntry(pickup.payload)?.text ?? 'Data cube secured.'],
        event: {
          type: 'terminal_found',
          terminalId: pickup.payload,
          title: getDataLogEntry(pickup.payload)?.title ?? pickup.payload,
        },
      }
    case 'weapon':
      context.scoreState.credits += 120
      context.scoreState.score += 240
      return { latestComms: null, event: null }
    case 'powerup': {
      const dropId = pickup.payload ? parseInt(pickup.payload, 10) : -1
      const label = context.powerups.apply(player.loadout, player, dropId)
      context.scorePopup(pickup.position.x, pickup.position.y + 0.6, label, '#8cffb4')
      return { latestComms: [label], event: null }
    }
  }
}
