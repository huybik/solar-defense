import { normalizeId } from '../types'
import type { Phase, PlanetMission, SolarState } from '../types'

export function resolveHotspot(mission: PlanetMission, value: string) {
  const normalized = normalizeId(value)
  return mission.hotspots.find(
    (item) => item.id === value || item.label === value || normalizeId(item.label) === normalized,
  )
}

export function resolveChoice(mission: PlanetMission, value: string) {
  const normalized = normalizeId(value)
  return mission.choices.find((item) => item.id === normalized || normalizeId(item.label) === normalized)
}

export function getCorrectChoiceId(mission: PlanetMission): string {
  return mission.choices.find((item) => item.label === mission.answer)?.id ?? normalizeId(mission.answer)
}

export function revealAllHotspots(state: SolarState, mission: PlanetMission): void {
  const scanned = new Set(state.scannedHotspots)
  for (const hotspot of mission.hotspots) scanned.add(hotspot.id)
  state.scannedHotspots = [...scanned]
}

export function answerPuzzle(
  state: SolarState,
  mission: PlanetMission,
  value: string,
): { choiceLabel: string; correct: boolean } | null {
  if (state.answered) return null

  const choice = resolveChoice(mission, value)
  if (!choice) return null

  state.answered = true
  state.selectedChoice = choice.id

  const correct = choice.label === mission.answer
  if (correct) {
    state.score += 120 + state.streak * 12 + state.scannedHotspots.length * 10
    state.streak += 1
  } else {
    state.streak = 0
  }

  return {
    choiceLabel: choice.label,
    correct,
  }
}

export function resetVoyageProgress(state: SolarState): void {
  state.phase = 'briefing'
  state.planetIndex = 0
  state.score = 0
  state.streak = 0
  state.scannedHotspots = []
  state.answered = false
  state.selectedChoice = null
}

export function resetPlanetProgress(state: SolarState, index: number): void {
  state.phase = 'briefing'
  state.planetIndex = index
  state.scannedHotspots = []
  state.answered = false
  state.selectedChoice = null
}

export function nextPlanetIndex(currentIndex: number, missionCount: number): number | null {
  const nextIndex = currentIndex + 1
  return nextIndex >= missionCount ? null : nextIndex
}

export function shouldHandleStagePhase(phase: Phase): boolean {
  return phase === 'explore'
}
