import type { DebriefData, Medal } from '../types'

export interface CombatScoreState {
  score: number
  credits: number
  combo: number
  comboTimer: number
  bestCombo: number
  grazeCount: number
  shotsFired: number
  shotsHit: number
  rescued: number
  secretsFound: number
  killCount: number
  weaponKills: Record<string, number>
}

export interface ScoreGain {
  score: number
  credits: number
  multiplier: number
}

export function createCombatScoreState(score = 0, credits = 0): CombatScoreState {
  return {
    score,
    credits,
    combo: 0,
    comboTimer: 0,
    bestCombo: 0,
    grazeCount: 0,
    shotsFired: 0,
    shotsHit: 0,
    rescued: 0,
    secretsFound: 0,
    killCount: 0,
    weaponKills: {},
  }
}

export function tickCombo(state: CombatScoreState, delta: number): boolean {
  if (state.combo <= 0) return false
  state.comboTimer -= delta
  if (state.comboTimer > 0) return false
  state.combo = 0
  state.comboTimer = 0
  return true
}

export function recordShotFired(state: CombatScoreState, count = 1): void {
  state.shotsFired += count
}

export function recordShotHit(state: CombatScoreState, count = 1): void {
  state.shotsHit += count
}

export function registerKill(state: CombatScoreState, baseScore: number, baseCredits: number): ScoreGain {
  state.killCount += 1
  state.combo += 1
  state.comboTimer = 1.5
  state.bestCombo = Math.max(state.bestCombo, state.combo)

  const multiplier = comboMultiplier(state.combo)
  const scoreGain = Math.round(baseScore * multiplier)
  state.score += scoreGain
  state.credits += baseCredits

  return {
    score: scoreGain,
    credits: baseCredits,
    multiplier,
  }
}

export function registerWeaponKill(state: CombatScoreState, weaponId: string): void {
  state.weaponKills[weaponId] = (state.weaponKills[weaponId] ?? 0) + 1
}

export function registerGraze(state: CombatScoreState): ScoreGain {
  state.grazeCount += 1
  state.score += 10
  state.credits += 2
  return { score: 10, credits: 2, multiplier: 1 }
}

export function registerRescue(state: CombatScoreState, score = 500, credits = 100): ScoreGain {
  state.rescued += 1
  state.score += score
  state.credits += credits
  return { score, credits, multiplier: 1 }
}

export function registerSecret(state: CombatScoreState, score = 350, credits = 75): ScoreGain {
  state.secretsFound += 1
  state.score += score
  state.credits += credits
  return { score, credits, multiplier: 1 }
}

export function accuracyPercent(state: CombatScoreState): number {
  if (state.shotsFired <= 0) return 100
  return (state.shotsHit / state.shotsFired) * 100
}

export function buildDebrief(
  success: boolean,
  levelId: string,
  levelName: string,
  parTime: number,
  elapsed: number,
  state: CombatScoreState,
): DebriefData {
  const accuracy = accuracyPercent(state)
  const accuracyBonusMul = accuracy >= 90 ? 0.2 : accuracy >= 80 ? 0.1 : 0
  const timeBonus = success ? Math.max(0, Math.round((parTime - elapsed) * 20)) : 0
  const bonusScore = Math.round(state.score * accuracyBonusMul) + timeBonus
  const finalScore = state.score + bonusScore
  const medal = pickMedal(success, accuracy, state.bestCombo, state.secretsFound)

  return {
    success,
    levelId,
    levelName,
    scoreEarned: finalScore,
    creditsEarned: state.credits,
    accuracy,
    grazes: state.grazeCount,
    maxCombo: state.bestCombo,
    rescued: state.rescued,
    secretsFound: state.secretsFound,
    medal,
    summary: buildSummary(success, medal, accuracy, state.bestCombo, state.secretsFound),
  }
}

function comboMultiplier(combo: number): number {
  if (combo >= 20) return 4
  if (combo >= 10) return 3
  if (combo >= 5) return 2
  return 1
}

function pickMedal(success: boolean, accuracy: number, maxCombo: number, secretsFound: number): Medal {
  if (!success) return 'none'
  if (accuracy >= 92 && maxCombo >= 20 && secretsFound >= 2) return 'platinum'
  if (accuracy >= 88 && maxCombo >= 12) return 'gold'
  if (accuracy >= 78 || maxCombo >= 8) return 'silver'
  return 'bronze'
}

function buildSummary(
  success: boolean,
  medal: Medal,
  accuracy: number,
  maxCombo: number,
  secretsFound: number,
): string {
  if (!success) {
    return 'Mission failed. Refit, rebuild the route, and launch again.'
  }
  const medalLabel = medal === 'none' ? 'no medal' : medal.toUpperCase()
  return `${medalLabel} finish. Accuracy ${Math.round(accuracy)}%, best combo x${maxCombo}, secrets found ${secretsFound}.`
}
