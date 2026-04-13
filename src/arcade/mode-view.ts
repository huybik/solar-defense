import { EPISODES, getEpisodeIndexForLevel, isLevelUnlocked } from './data/campaign'
import { getBossDef } from './data/bosses'
import { getLevelDef } from './data/levels'
import { listDataLogEntries } from './data/lore'
import { getShopEntries, type ShopTab } from './progression/shop'
import type { ArcadeViewModel, MapEpisodeView } from './render/hud'
import {
  PLANET_LABELS,
  type ArcadeEvent,
  type ArcadeState,
  type CampaignState,
} from './types'
import type { ArenaSnapshot } from './combat/arena'

export function createDefaultArcadeState(): ArcadeState {
  return {
    phase: 'title',
    paused: false,
    mode: 'campaign',
    difficulty: 'normal',
    saveSlot: null,
    planetId: 'saturn',
    planetName: 'Saturn',
    episodeName: 'Solar Route',
    levelId: '',
    levelName: '',
    wave: 1,
    totalWaves: 3,
    score: 0,
    credits: 0,
    lives: 3,
    bombs: 3,
    health: 0,
    maxHealth: 0,
    shield: 0,
    maxShield: 0,
    energy: 0,
    maxEnergy: 0,
    combo: 0,
    grazeCount: 0,
    accuracy: 100,
    bossName: '',
    bossHealth: 0,
    bossMaxHealth: 0,
    bossPhase: 0,
    elapsed: 0,
    specialName: '',
    specialAmmo: 0,
    players: [],
    synergy: null,
    knownSynergies: [],
    discoveredSecrets: [],
    comms: [],
    currentTab: 'front',
    debrief: null,
    powerups: [],
    coopPromptVisible: false,
  }
}

export function buildCombatState(
  currentState: ArcadeState,
  snapshot: ArenaSnapshot,
  campaignScore: number,
): ArcadeState {
  const level = getLevelDef(snapshot.levelId)
  const bossName = snapshot.boss?.alive && level.bossId
    ? getBossDef(level.bossId).name
    : ''
  const players = snapshot.players.map((player, index) => ({
    id: player.id,
    label: `P${index + 1}`,
    health: player.health,
    maxHealth: player.maxHealth,
    shield: player.shield,
    maxShield: player.maxShield,
    energy: player.energy,
    maxEnergy: player.maxEnergy,
    lives: player.lives,
    bombs: player.bombs,
    specialName: player.loadout.activeSpecial
      ? prettyId(player.loadout.activeSpecial)
      : 'None',
    specialAmmo: player.loadout.activeSpecial
      ? (player.loadout.specialAmmo[player.loadout.activeSpecial] ?? 0)
      : 0,
    alive: player.alive,
  }))
  const primary = players[0]
  const knownSynergies = Array.from(new Set(
    snapshot.players.flatMap((player) => player.loadout.knownSynergies),
  ))
  const powerups = snapshot.powerups

  return {
    ...currentState,
    paused: snapshot.paused,
    planetId: snapshot.planetId,
    planetName: PLANET_LABELS[snapshot.planetId],
    levelId: snapshot.levelId,
    levelName: snapshot.levelName,
    wave: snapshot.wave,
    totalWaves: snapshot.totalWaves,
    score: snapshot.score + campaignScore,
    credits: snapshot.credits,
    lives: primary?.lives ?? 0,
    bombs: primary?.bombs ?? 0,
    health: primary?.health ?? 0,
    maxHealth: primary?.maxHealth ?? 0,
    shield: primary?.shield ?? 0,
    maxShield: primary?.maxShield ?? 0,
    energy: primary?.energy ?? 0,
    maxEnergy: primary?.maxEnergy ?? 0,
    combo: snapshot.combo,
    grazeCount: snapshot.grazeCount,
    accuracy: snapshot.accuracy,
    bossName,
    bossHealth: snapshot.boss?.health ?? 0,
    bossMaxHealth: snapshot.boss?.maxHealth ?? 0,
    bossPhase: snapshot.boss?.phase ?? 0,
    elapsed: snapshot.elapsed,
    specialName: primary?.specialName ?? '',
    specialAmmo: primary?.specialAmmo ?? 0,
    players,
    synergy: snapshot.synergy,
    knownSynergies,
    discoveredSecrets: snapshot.discoveredSecrets,
    comms: snapshot.comms,
    powerups,
    coopPromptVisible: snapshot.coopPromptVisible,
  }
}

export function buildCampaignArcadeState(
  slot: number,
  campaign: CampaignState,
  shopTab: ShopTab,
): ArcadeState {
  return {
    ...createDefaultArcadeState(),
    phase: 'map',
    mode: 'campaign',
    difficulty: campaign.difficulty,
    saveSlot: slot,
    credits: campaign.credits,
    score: campaign.score,
    ...levelSummary(campaign.currentLevel),
    episodeName: EPISODES[campaign.currentEpisode]?.name ?? 'Campaign',
    currentTab: shopTab,
  }
}

export function buildEpisodeViews(
  campaign: CampaignState | null,
  selectedLevelId: string,
): MapEpisodeView[] {
  if (!campaign) return []

  const completed = new Set(campaign.completedLevels ?? [])

  return EPISODES.map((episode) => ({
    title: episode.name,
    levels: [...episode.levels, ...(episode.secretLevels ?? [])].map((levelId) => {
      const level = getLevelDef(levelId)
      return {
        id: levelId,
        name: level.name,
        planetName: PLANET_LABELS[level.planet],
        locked: !isLevelUnlocked(campaign, levelId),
        completed: completed.has(levelId),
        selected: selectedLevelId === levelId,
        secret: Boolean(level.isSecret),
      }
    }),
  }))
}

export function buildArcadeViewModel(options: {
  state: ArcadeState
  campaign: CampaignState | null
  saveSlots: Array<CampaignState | null>
  selectedLevelId: string
  shopTab: ShopTab
  selectedLogId: string | null
  message: string
}): ArcadeViewModel {
  const { state, campaign, saveSlots, selectedLevelId, shopTab, selectedLogId, message } = options
  const level = selectedLevelId ? getLevelDef(selectedLevelId) : null
  const collectedLogs = new Set(campaign?.dataLog ?? [])
  const dataLogEntries = listDataLogEntries().map((entry) => ({
    entry,
    locked: !collectedLogs.has(entry.id),
  }))
  const selectedLog = selectedLogId
    ? dataLogEntries.find((entry) => entry.entry.id === selectedLogId) ?? null
    : dataLogEntries.find((entry) => !entry.locked) ?? dataLogEntries[0] ?? null

  return {
    state,
    saveSlots,
    episodes: buildEpisodeViews(campaign, selectedLevelId),
    briefing: level?.briefing ?? '',
    shopEntries: campaign ? getShopEntries(campaign, shopTab) : [],
    shopTab,
    dataLogEntries,
    selectedLog,
    selectedLoadout: campaign ? loadoutLines(campaign) : [],
    message,
  }
}

export function levelSummary(
  levelId: string,
): Pick<ArcadeState, 'planetId' | 'planetName' | 'levelId' | 'levelName' | 'episodeName'> {
  const level = getLevelDef(levelId)
  return {
    planetId: level.planet,
    planetName: PLANET_LABELS[level.planet],
    levelId: level.id,
    levelName: level.name,
    episodeName: EPISODES[getEpisodeIndexForLevel(level.id)]?.name ?? 'Campaign',
  }
}

export function combatEventMessage(event: ArcadeEvent): string | null {
  switch (event.type) {
    case 'wave_start':
      return `Wave ${event.wave} inbound.`
    case 'boss_enter':
      return `${event.name} has entered the sector.`
    case 'boss_phase':
      return `${event.attackName}.`
    case 'boss_vulnerable':
      return `${event.name} is vulnerable.`
    case 'terminal_found':
      return `Data log recovered: ${event.title}.`
    case 'secret_revealed':
      return `Secret route unlocked: ${prettyId(event.secretId)}.`
    case 'synergy_discovered':
      return `Synergy discovered: ${event.combo}.`
    case 'player_down':
      return `${event.playerId === 'player_1' ? 'P2' : 'P1'} hull breach. Respawn sequence engaged.`
    case 'challenge_complete':
    case 'wave_clear':
    case 'boss_defeated':
    case 'arcade_started':
    case 'player_respawn':
    case 'pickup_collected':
    case 'stage_clear':
    case 'stage_failed':
    case 'portal_entered':
      return null
  }
}

export function loadoutLines(campaign: CampaignState): string[] {
  const front = campaign.inventory.weapons.front ? prettyId(campaign.inventory.weapons.front) : 'None'
  const rear = campaign.inventory.weapons.rear ? prettyId(campaign.inventory.weapons.rear) : 'None'
  const leftSidekick = campaign.inventory.weapons.sidekickL ? prettyId(campaign.inventory.weapons.sidekickL) : 'None'
  const rightSidekick = campaign.inventory.weapons.sidekickR ? prettyId(campaign.inventory.weapons.sidekickR) : 'None'
  const special = campaign.inventory.activeSpecial ? prettyId(campaign.inventory.activeSpecial) : 'None'
  return [
    `Hull: ${prettyId(campaign.inventory.hull)}`,
    `Front: ${front}`,
    `Rear: ${rear}`,
    `Left Sidekick: ${leftSidekick}`,
    `Right Sidekick: ${rightSidekick}`,
    `Special: ${special}`,
    `Wing: ${prettyId(campaign.inventory.wing)}`,
    `Armor: ${prettyId(campaign.inventory.armor)}`,
  ]
}

export function prettyId(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}
