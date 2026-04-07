import { ARENA, type ArcadeEvent, type HazardState, type LevelSegment, type PickupType } from '../types'

export interface ScheduledSpawn {
  executeAt: number
  action: () => void
}

export interface TimelineSegmentContext {
  elapsed: number
  scheduled: ScheduledSpawn[]
  hazards: HazardState[]
  latestComms: string[]
  spawnEnemy: (command: NonNullable<LevelSegment['spawns']>[number]) => void
  spawnMeteor: (command: NonNullable<LevelSegment['meteors']>[number]) => void
  spawnTerrain: (command: NonNullable<LevelSegment['terrain']>[number]) => void
  spawnPickup: (
    type: PickupType,
    position: { x: number; y: number },
    id?: string,
    value?: number,
  ) => void
  random?: () => number
}

export function createBossTriggerTime(level: {
  hasBoss: boolean
  duration: number
  segments: LevelSegment[]
}): number {
  if (!level.hasBoss) return Number.POSITIVE_INFINITY

  const lastScriptedMoment = level.segments.reduce((latest, segment) => {
    const latestSpawn = Math.max(
      segment.time,
      ...((segment.spawns ?? []).map((spawn) => segment.time + (spawn.delay ?? 0))),
    )
    const latestHazard = Math.max(
      segment.time,
      ...((segment.hazards ?? []).map((hazard) => segment.time + hazard.duration)),
    )
    return Math.max(latest, latestSpawn, latestHazard)
  }, 0)

  return Math.max(28, level.duration * 0.55, lastScriptedMoment + 4)
}

export function createWaveMilestones(bossTriggerTime: number): number[] {
  return [
    bossTriggerTime / 3,
    (bossTriggerTime / 3) * 2,
    bossTriggerTime,
  ]
}

export function executeLevelSegment(segment: LevelSegment, context: TimelineSegmentContext): void {
  const random = context.random ?? Math.random

  for (const command of segment.spawns ?? []) {
    if ((command.delay ?? 0) > 0) {
      context.scheduled.push({
        executeAt: context.elapsed + (command.delay ?? 0),
        action: () => context.spawnEnemy(command),
      })
    } else {
      context.spawnEnemy(command)
    }
  }

  for (const command of segment.meteors ?? []) {
    context.spawnMeteor(command)
  }

  for (const command of segment.terrain ?? []) {
    context.spawnTerrain(command)
  }

  for (const hazard of segment.hazards ?? []) {
    context.hazards.push({ ...hazard, elapsed: 0, pulse: 0 })
  }

  for (const pickup of segment.pickups ?? []) {
    const count = pickup.count ?? 1
    for (let index = 0; index < count; index++) {
      const x = typeof pickup.x === 'number'
        ? pickup.x
        : pickup.x === 'left'
          ? -8
          : pickup.x === 'right'
            ? 8
            : pickup.x === 'center'
              ? 0
              : random() * 16 - 8
      context.spawnPickup(pickup.type, { x, y: ARENA.HALF_H - 6 - index * 1.2 }, pickup.id, pickup.value)
    }
  }

  for (const rescue of segment.rescues ?? []) {
    for (let index = 0; index < rescue.count; index++) {
      context.spawnPickup('astronaut', { x: (index - (rescue.count - 1) / 2) * 6, y: ARENA.HALF_H - 8 }, undefined, 1)
    }
  }

  for (const terminalId of segment.terminalIds ?? []) {
    context.spawnPickup('data_cube', { x: random() * 12 - 6, y: ARENA.HALF_H - 9 }, terminalId, 1)
  }

  if (segment.comms?.length) {
    context.latestComms = segment.comms
  }
}

export function processScheduledSpawns(scheduled: ScheduledSpawn[], elapsed: number): void {
  for (let index = scheduled.length - 1; index >= 0; index--) {
    if (scheduled[index].executeAt > elapsed) continue
    scheduled[index].action()
    scheduled.splice(index, 1)
  }
}

export function resolveWaveAdvance(options: {
  elapsed: number
  waveMilestones: number[]
  currentWave: number
  totalWaves: number
  levelId: string
}): { nextWave: number; events: ArcadeEvent[] } {
  const { elapsed, waveMilestones, currentWave, totalWaves, levelId } = options
  const nextWave = waveMilestones.findIndex((time) => elapsed < time) + 1 || totalWaves
  if (nextWave <= currentWave || nextWave > totalWaves) {
    return { nextWave: currentWave, events: [] }
  }

  return {
    nextWave,
    events: [
      { type: 'wave_clear', wave: currentWave, levelId },
      { type: 'wave_start', wave: nextWave, levelId },
    ],
  }
}
