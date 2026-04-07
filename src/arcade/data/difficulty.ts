import type { Difficulty, DifficultyScale } from '../types'

export const DIFFICULTY_SCALES: Record<Difficulty, DifficultyScale> = {
  easy: {
    enemyHealthMul: 0.7,
    enemyFireRateMul: 0.6,
    creditMul: 0.5,
    enemyBulletSpeedMul: 0.8,
    enemyCountMul: 1.2,
  },
  normal: {
    enemyHealthMul: 1,
    enemyFireRateMul: 1,
    creditMul: 1,
    enemyBulletSpeedMul: 1,
    enemyCountMul: 1.4,
  },
  hard: {
    enemyHealthMul: 1.3,
    enemyFireRateMul: 1.3,
    creditMul: 1.5,
    enemyBulletSpeedMul: 1.2,
    enemyCountMul: 1.7,
  },
  impossible: {
    enemyHealthMul: 1.6,
    enemyFireRateMul: 1.8,
    creditMul: 2,
    enemyBulletSpeedMul: 1.5,
    enemyCountMul: 2.1,
  },
  suicide: {
    enemyHealthMul: 2.0,
    enemyFireRateMul: 2.5,
    creditMul: 3,
    enemyBulletSpeedMul: 1.8,
    enemyCountMul: 2.8,
  },
}

export function getDifficultyScale(difficulty: Difficulty): DifficultyScale {
  return DIFFICULTY_SCALES[difficulty]
}
