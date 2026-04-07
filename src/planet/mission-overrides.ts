import { normalizeId } from '../types'
import type {
  HotspotConfig,
  MissionChoice,
  MissionOverride,
  PlanetMission,
  SolarDefenseInitData,
} from '../types'

const cloneMission = (mission: PlanetMission): PlanetMission => ({
  ...mission,
  choices: mission.choices.map((choice) => ({ ...choice })),
  hotspots: mission.hotspots.map((hotspot) => ({ ...hotspot })),
})

export function applyClueOverride(
  base: HotspotConfig[],
  clues: MissionOverride['clues'],
): HotspotConfig[] {
  if (!Array.isArray(clues) || clues.length === 0) return base

  return base.map((hotspot, index) => {
    const incoming = clues[index]
    if (!incoming) return hotspot
    return { ...hotspot, clue: incoming }
  })
}

export function applyChoiceOverride(
  base: MissionChoice[],
  options?: string[],
  answer?: string,
): { choices: MissionChoice[]; answer: string } {
  if (!Array.isArray(options) || options.length !== 3) {
    return {
      choices: base,
      answer: answer || '',
    }
  }

  const nextChoices = options.map((label) => ({ id: normalizeId(label), label }))
  const nextAnswer = options.find((option) => option === answer) || options[0]
  return {
    choices: nextChoices,
    answer: nextAnswer,
  }
}

export function normalizeMissionOverrides(data: unknown): MissionOverride[] {
  const init = (data || {}) as SolarDefenseInitData
  return Array.isArray(init.missions)
    ? init.missions
    : Object.values(init.missions || {})
}

export function findMissionForOverride(
  missions: PlanetMission[],
  override: MissionOverride,
): PlanetMission | null {
  const key = normalizeId(override.planet || override.name || '')
  return missions.find((mission) => (
    normalizeId(mission.id) === key || normalizeId(mission.name) === key
  )) ?? null
}

export function applyMissionOverride(
  mission: PlanetMission,
  override: MissionOverride,
): PlanetMission {
  const nextMission = cloneMission(mission)

  nextMission.subtitle = override.subtitle?.trim() || nextMission.subtitle
  nextMission.prompt = override.prompt?.trim() || nextMission.prompt
  nextMission.question = override.question?.trim() || nextMission.question
  nextMission.celebration = override.celebration?.trim() || nextMission.celebration
  nextMission.hotspots = applyClueOverride(nextMission.hotspots, override.clues)

  const choiceOverride = applyChoiceOverride(nextMission.choices, override.options, override.answer)
  nextMission.choices = choiceOverride.choices
  if (choiceOverride.answer) {
    nextMission.answer = choiceOverride.answer
  }

  return nextMission
}

export function buildMissionList(
  baseMissions: PlanetMission[],
  data: unknown,
): PlanetMission[] {
  const missions = baseMissions.map(cloneMission)
  for (const override of normalizeMissionOverrides(data)) {
    const mission = findMissionForOverride(missions, override)
    if (!mission) continue

    const nextMission = applyMissionOverride(mission, override)
    const index = missions.findIndex((candidate) => candidate.id === mission.id)
    missions[index] = nextMission
  }
  return missions
}
