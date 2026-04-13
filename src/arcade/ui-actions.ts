import type { ShopTab } from './progression/shop'
import type { Difficulty, WeaponSlot } from './types'

export type ArcadeShopAction =
  | 'buy_entry'
  | 'equip_entry'
  | 'upgrade_entry'
  | 'sell_slot'
  | 'buy_ammo'
  | 'equip_left'
  | 'equip_right'

const SHOP_ACTIONS = new Set<ArcadeShopAction>([
  'buy_entry',
  'equip_entry',
  'upgrade_entry',
  'sell_slot',
  'buy_ammo',
  'equip_left',
  'equip_right',
])

export interface ArcadeUiActionContext {
  startCampaign: (slot: number, continueExisting: boolean) => void
  setDifficulty: (difficulty: Difficulty) => void
  exitArcade: () => void
  returnToTitle: () => void
  selectLevel: (levelId: string) => void
  openBriefing: () => void
  launchLevel: () => void
  setShopTab: (tab: ShopTab) => void
  openShop: () => void
  closeShop: () => void
  openDataLog: () => void
  closeDataLog: () => void
  runShopAction: (action: ArcadeShopAction, entryId: string, slot?: WeaponSlot) => void
  backToMap: () => void
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
      ctx.returnToTitle()
      return
    case 'select_level':
      if (params.level) {
        ctx.selectLevel(params.level)
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
      ctx.openDataLog()
      return
    case 'close_data_log':
      ctx.closeDataLog()
      return
    case 'shop_tab':
      ctx.setShopTab((params.tab as ShopTab) ?? 'front')
      return
    case 'back_to_map':
      ctx.backToMap()
      return
    case 'debrief_continue':
      ctx.continueDebrief()
      return
    case 'select_log':
      ctx.setSelectedLog(params.log ?? null)
      return
    case 'retry_level':
      ctx.retryLevel()
      return
  }

  if (isShopAction(action)) {
    ctx.runShopAction(action, String(params.entry ?? ''), getShopActionSlot(action, params))
  }
}

function isShopAction(action: string): action is ArcadeShopAction {
  return SHOP_ACTIONS.has(action as ArcadeShopAction)
}

function getShopActionSlot(
  action: ArcadeShopAction,
  params: Record<string, string>,
): WeaponSlot | undefined {
  switch (action) {
    case 'buy_entry':
      return params.slot as WeaponSlot | undefined
    case 'sell_slot':
      return String(params.slot ?? 'front') as WeaponSlot
    case 'equip_left':
      return 'sidekickL'
    case 'equip_right':
      return 'sidekickR'
    case 'equip_entry':
    case 'upgrade_entry':
    case 'buy_ammo':
      return undefined
  }
}
