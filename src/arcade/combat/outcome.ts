import { buildDebrief, type CombatScoreState } from '../progression/scoring'
import type { ArcadeEvent, CombatResult, DebriefData, LevelDef } from '../types'

export function finalizeCombatResult(
  success: boolean,
  level: LevelDef,
  elapsed: number,
  scoreState: CombatScoreState,
): { result: CombatResult; debrief: DebriefData; events: ArcadeEvent[] } {
  const debrief = buildDebrief(success, level.id, level.name, level.parTime, elapsed, scoreState)
  const result: CombatResult = {
    success,
    ended: true,
    events: [],
    debrief,
  }

  const events: ArcadeEvent[] = success
    ? [{ type: 'stage_clear', score: scoreState.score, credits: scoreState.credits, levelId: level.id }]
    : [{ type: 'stage_failed', levelId: level.id }]

  return { result, debrief, events }
}
