import type { PickupType, SecretTrigger } from '../types'

export interface SecretResolution {
  nextProgress: number
  revealSecretId: string | null
  message: string | null
}

export function resolveSecretFromPickup(options: {
  trigger: SecretTrigger | null | undefined
  type: PickupType
  payload?: string
  value: number
  rearWeaponId?: string | null
  progress: number
  discoveredSecrets: string[]
}): SecretResolution {
  const { trigger, type, payload, value, rearWeaponId, progress, discoveredSecrets } = options
  if (!trigger) {
    return { nextProgress: progress, revealSecretId: null, message: null }
  }

  if (type === 'pretzel' && trigger.id === 'pretzel') {
    const nextProgress = progress + value
    return {
      nextProgress,
      revealSecretId: nextProgress >= 3 && !discoveredSecrets.includes(trigger.targetLevelId)
        ? trigger.targetLevelId
        : null,
      message: null,
    }
  }

  if (payload !== trigger.id) {
    return { nextProgress: progress, revealSecretId: null, message: null }
  }

  if (trigger.id === 'banana_portal' && rearWeaponId !== 'banana_blast') {
    return {
      nextProgress: progress,
      revealSecretId: null,
      message: 'Portal detected. Banana Blast required to lock the route.',
    }
  }

  return {
    nextProgress: progress,
    revealSecretId: discoveredSecrets.includes(trigger.targetLevelId) ? null : trigger.targetLevelId,
    message: null,
  }
}

export function resolveSecretFromDestroyedTarget(options: {
  trigger: SecretTrigger | null | undefined
  destroyedId: string | number | undefined
  progress: number
  requiredProgress: number
  discoveredSecrets: string[]
}): SecretResolution {
  const { trigger, destroyedId, progress, requiredProgress, discoveredSecrets } = options
  if (!trigger || trigger.id !== destroyedId) {
    return { nextProgress: progress, revealSecretId: null, message: null }
  }

  const nextProgress = progress + 1
  return {
    nextProgress,
    revealSecretId: nextProgress >= requiredProgress && !discoveredSecrets.includes(trigger.targetLevelId)
      ? trigger.targetLevelId
      : null,
    message: null,
  }
}

export function formatSecretUnlockMessage(secretId: string): string {
  return `Secret route unlocked: ${secretId.replaceAll('_', ' ').toUpperCase()}.`
}
