import type { ShopTab } from './progression/shop'
import type { ArcadePhase, Difficulty, WeaponSlot } from './types'

export interface ArcadeUiActionContext {
  phase: ArcadePhase
  debriefSuccess: boolean
  firstDataLogId: string | null
  startCampaign: (slot: number, continueExisting: boolean) => void
  setDifficulty: (difficulty: Difficulty) => void
  exitArcade: () => void
  persistCampaignState: (options?: { refreshSlots?: boolean; syncSummary?: boolean }) => void
  setPhase: (phase: ArcadePhase) => void
  setSelectedLevel: (levelId: string) => void
  setMessage: (message: string) => void
  openBriefing: () => void
  launchLevel: () => void
  setShopTab: (tab: ShopTab) => void
  openShop: () => void
  closeShop: () => void
  runShopAction: (action: string, entryId: string, slot?: WeaponSlot) => void
  abortOrBackToMap: () => void
  continueDebrief: () => void
  setSelectedLog: (logId: string | null) => void
  retryLevel: () => void
}

export function routeArcadeUiAction(
  action: string,
  params: Record<string, string>,
  ctx: ArcadeUiActionContext,
): void {
  switch (action) {
    case 'new_campaign':
    case 'overwrite_campaign':
      ctx.startCampaign(Number(params.slot ?? 0), false)
      return
    case 'continue_campaign':
      ctx.startCampaign(Number(params.slot ?? 0), true)
      return
    case 'set_difficulty':
      ctx.setDifficulty((params.difficulty as Difficulty) ?? 'normal')
      return
    case 'exit_arcade':
      ctx.exitArcade()
      return
    case 'back_to_title':
      ctx.persistCampaignState()
      ctx.setPhase('title')
      return
    case 'select_level':
      if (params.level) {
        ctx.setSelectedLevel(params.level)
        ctx.setMessage(`${params.level.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())} selected.`)
      }
      return
    case 'open_briefing':
      ctx.openBriefing()
      return
    case 'launch_level':
      ctx.launchLevel()
      return
    case 'open_shop':
      ctx.openShop()
      return
    case 'close_shop':
      ctx.closeShop()
      return
    case 'open_data_log':
      ctx.setSelectedLog(ctx.firstDataLogId)
      ctx.setPhase('data_log')
      return
    case 'close_data_log':
      ctx.setPhase('map')
      return
    case 'shop_tab':
      ctx.setShopTab((params.tab as ShopTab) ?? 'front')
      return
    case 'buy_entry':
      ctx.runShopAction('buy_entry', String(params.entry ?? ''), params.slot as WeaponSlot | undefined)
      return
    case 'equip_entry':
      ctx.runShopAction('equip_entry', String(params.entry ?? ''))
      return
    case 'upgrade_entry':
      ctx.runShopAction('upgrade_entry', String(params.entry ?? ''))
      return
    case 'sell_slot':
      ctx.runShopAction('sell_slot', '', String(params.slot ?? 'front') as WeaponSlot)
      return
    case 'buy_ammo':
      ctx.runShopAction('buy_ammo', String(params.entry ?? ''))
      return
    case 'equip_left':
      ctx.runShopAction('equip_left', String(params.entry ?? ''), 'sidekickL')
      return
    case 'equip_right':
      ctx.runShopAction('equip_right', String(params.entry ?? ''), 'sidekickR')
      return
    case 'back_to_map':
      ctx.abortOrBackToMap()
      return
    case 'debrief_continue':
      if (ctx.debriefSuccess) {
        ctx.continueDebrief()
        ctx.setPhase('map')
      } else {
        ctx.openBriefing()
      }
      return
    case 'select_log':
      ctx.setSelectedLog(params.log ?? null)
      return
    case 'retry_level':
      ctx.retryLevel()
      return
  }
}
