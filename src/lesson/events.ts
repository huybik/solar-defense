import type { GameContext } from '@learnfun/game-sdk'
import type { PlanetMission, Phase, SolarState } from '../types'

export function emitGameStarted(ctx: GameContext<SolarState>, total: number): void {
  ctx.emit('gameStarted', { total, phase: 'briefing' })
}

export function emitPlanetArrived(
  ctx: GameContext<SolarState>,
  mission: PlanetMission,
  index: number,
): void {
  ctx.emit('planetArrived', { planet: mission.name, index })
  ctx.emit('phaseChange', { phase: 'briefing', planet: mission.name })
}

export function emitPhaseChange(
  ctx: GameContext<SolarState>,
  phase: Phase,
  mission: PlanetMission | null,
): void {
  ctx.emit('phaseChange', { phase, planet: mission?.name ?? '' })
}

export function emitPuzzleUnlocked(ctx: GameContext<SolarState>, mission: PlanetMission): void {
  ctx.emit('puzzleUnlocked', { planet: mission.name })
}

export function emitScanRevealed(
  ctx: GameContext<SolarState>,
  mission: PlanetMission,
  payload: { hotspot: string; clue: string; count: number },
): void {
  ctx.emit('scanRevealed', {
    planet: mission.name,
    hotspot: payload.hotspot,
    clue: payload.clue,
    count: payload.count,
  })
}

export function emitPuzzleResolved(
  ctx: GameContext<SolarState>,
  mission: PlanetMission,
  payload: { choiceLabel: string; correct: boolean; score: number },
): void {
  if (payload.correct) {
    ctx.emit('puzzleSolved', {
      planet: mission.name,
      answer: payload.choiceLabel,
      score: payload.score,
    })
    return
  }

  ctx.emit('puzzleMissed', {
    planet: mission.name,
    answer: payload.choiceLabel,
    correct: mission.answer,
  })
}

export function emitGameCompleted(
  ctx: GameContext<SolarState>,
  payload: { score: number; outcome: 'completed' | 'quit' | 'failed'; planetsCompleted: number },
): void {
  ctx.emit('gameCompleted', { score: payload.score, outcome: payload.outcome })
  ctx.end({
    outcome: payload.outcome,
    finalScore: payload.score,
    planetsCompleted: payload.planetsCompleted,
  })
}
