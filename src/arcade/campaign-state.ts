import { getEpisodeIndexForLevel, getNextMainLevel } from './data/campaign'
import type { CampaignState } from './types/campaign'
import type { DebriefData } from './types/state'

export interface CombatCampaignResult {
  selectedLevelId: string
  successful: boolean
  debrief: DebriefData | null
  inventory: CampaignState['inventory']
  collectedLogs: string[]
  secretFinds: string[]
  earnedUpgrades: string[]
  weaponKills: Record<string, number>
}

function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

export function applyCombatResults(
  campaign: CampaignState,
  result: CombatCampaignResult,
): CampaignState {
  const nextCampaign: CampaignState = {
    ...campaign,
    weaponMastery: { ...(campaign.weaponMastery ?? {}) },
  }

  for (const [weaponId, kills] of Object.entries(result.weaponKills)) {
    nextCampaign.weaponMastery[weaponId] = (nextCampaign.weaponMastery[weaponId] ?? 0) + kills
  }

  if (!result.successful || !result.debrief) {
    return nextCampaign
  }

  nextCampaign.credits += result.debrief.creditsEarned
  nextCampaign.score += result.debrief.scoreEarned
  nextCampaign.lastDebrief = result.debrief
  nextCampaign.inventory = result.inventory
  nextCampaign.completedLevels = uniq([...campaign.completedLevels, result.selectedLevelId])
  nextCampaign.dataLog = uniq([...campaign.dataLog, ...result.collectedLogs])
  nextCampaign.secretsFound = uniq([...campaign.secretsFound, ...result.secretFinds])
  nextCampaign.bossUpgrades = uniq([...campaign.bossUpgrades, ...result.earnedUpgrades])

  const nextLevel = getNextMainLevel(result.selectedLevelId)
  if (nextLevel) {
    nextCampaign.currentLevel = nextLevel
    nextCampaign.currentEpisode = getEpisodeIndexForLevel(nextLevel)
  } else {
    nextCampaign.currentEpisode = getEpisodeIndexForLevel(result.selectedLevelId)
  }

  return nextCampaign
}

export function advanceCampaignRoute(
  campaign: CampaignState,
  selectedLevelId: string,
): { campaign: CampaignState; selectedLevelId: string; nextLevel: string | null } {
  const nextLevel = getNextMainLevel(selectedLevelId)
  if (!nextLevel) {
    return { campaign, selectedLevelId, nextLevel: null }
  }

  return {
    campaign: {
      ...campaign,
      currentLevel: nextLevel,
      currentEpisode: getEpisodeIndexForLevel(nextLevel),
    },
    selectedLevelId: nextLevel,
    nextLevel,
  }
}
