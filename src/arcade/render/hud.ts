import type { ArcadeState, CampaignState, DataLogEntry } from '../types'
import type { ShopEntry, ShopTab } from '../progression/shop'
import { getSpriteCSS } from './sprites'
import { escapeHtml } from '../../utils'
import { isTouchDevice } from '../combat/player'

export interface MapLevelView {
  id: string
  name: string
  planetName: string
  locked: boolean
  completed: boolean
  selected: boolean
  secret: boolean
}

export interface MapEpisodeView {
  title: string
  levels: MapLevelView[]
}

export interface DataLogViewEntry {
  entry: DataLogEntry
  locked: boolean
}

export interface ArcadeViewModel {
  state: ArcadeState
  saveSlots: Array<CampaignState | null>
  episodes: MapEpisodeView[]
  briefing: string
  shopEntries: ShopEntry[]
  shopTab: ShopTab
  dataLogEntries: DataLogViewEntry[]
  selectedLog: DataLogViewEntry | null
  selectedLoadout: string[]
  message: string
}

type ActionCallback = (action: string, params: Record<string, string>) => void

const DIFFICULTIES = ['easy', 'normal', 'hard', 'impossible', 'suicide'] as const

export class ArcadeHUD {
  private readonly root: HTMLDivElement
  private lastPhase = ''
  private lastMarkup = ''
  private callback: ActionCallback | null = null
  private combatEls = new Map<string, HTMLElement | null>()

  constructor(container: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'arcade-hud'
    this.root.addEventListener('click', this.handleClick)
    container.appendChild(this.root)
  }

  onAction(callback: ActionCallback): void {
    this.callback = callback
  }

  update(view: ArcadeViewModel): void {
    const phaseChanged = view.state.phase !== this.lastPhase

    if (view.state.phase === 'combat') {
      if (phaseChanged) {
        this.lastPhase = view.state.phase
        this.commitMarkup(this.render(view), true)
      }
      this.updateCombat(view)
      return
    }

    this.lastPhase = view.state.phase
    this.commitMarkup(this.render(view), phaseChanged)
  }

  dispose(): void {
    this.root.removeEventListener('click', this.handleClick)
    this.root.remove()
    this.callback = null
    this.lastMarkup = ''
  }

  private cachedEl(selector: string): HTMLElement | null {
    let el = this.combatEls.get(selector)
    if (el === undefined) {
      el = this.root.querySelector<HTMLElement>(selector)
      this.combatEls.set(selector, el)
    }
    return el
  }

  private render(view: ArcadeViewModel): string {
    switch (view.state.phase) {
      case 'title':
        return this.renderTitle(view)
      case 'map':
        return this.renderMap(view)
      case 'shop':
        return this.renderShop(view)
      case 'briefing':
        return this.renderBriefing(view)
      case 'combat':
        return this.renderCombat(view)
      case 'debrief':
        return this.renderDebrief(view)
      case 'data_log':
        return this.renderDataLog(view)
      case 'game_over':
        return this.renderGameOver(view)
    }
  }

  private updateCombat(view: ArcadeViewModel): void {
    const state = view.state
    const el = (s: string) => this.cachedEl(s)

    setTextEl(el('.arc-score-value'), state.score.toLocaleString())
    setTextEl(el('.arc-credits-value'), state.credits.toLocaleString())
    setTextEl(el('.arc-wave-pill'), state.bossMaxHealth > 0 ? 'BOSS' : `WAVE ${state.wave}/${state.totalWaves}`)
    setTextEl(el('.arc-combo-value'), state.combo > 1 ? `x${state.combo}` : 'x1')
    setTextEl(el('.arc-graze-value'), String(state.grazeCount))
    setTextEl(el('.arc-synergy'), state.synergy ? `SYNERGY ${escapeHtml(state.synergy)}` : 'SYNERGY OFFLINE')
    setTextEl(el('.arc-comms-text'), state.comms[0] ?? view.message)
    setTextEl(el('.arc-accuracy-value'), `${Math.round(state.accuracy)}%`)

    const teamEl = el('.arc-team-status')
    if (teamEl) {
      teamEl.innerHTML = renderCombatPlayers(state)
    }

    const powerupsEl = el('.arc-powerups')
    if (powerupsEl) {
      powerupsEl.innerHTML = renderCombatPowerups(state)
    }

    const coopPromptEl = el('.arc-coop-prompt')
    if (coopPromptEl) {
      coopPromptEl.style.display = state.coopPromptVisible ? '' : 'none'
    }

    const bossWrap = el('.arc-boss')
    if (bossWrap) {
      bossWrap.style.display = state.bossMaxHealth > 0 ? '' : 'none'
      setTextEl(el('.arc-boss-name'), state.bossName || 'BOSS')
      setTextEl(el('.arc-boss-phase'), `PHASE ${state.bossPhase + 1}`)
      setBarEl(el('.arc-boss-fill'), state.bossHealth, state.bossMaxHealth)
    }
  }

  private renderTitle(view: ArcadeViewModel): string {
    const difficultyRow = DIFFICULTIES
      .map((difficulty) => `
        <button
          class="arc-difficulty-chip${view.state.difficulty === difficulty ? ' active' : ''}"
          data-action="set_difficulty"
          data-difficulty="${difficulty}"
        >
          ${difficulty.toUpperCase()}
        </button>
      `)
      .join('')

    const slots = view.saveSlots.map((slot, index) => {
      if (!slot) {
        return `
          <div class="arc-slot-card">
            <span class="arc-slot-label">SLOT ${index + 1}</span>
            <strong>Empty Slot</strong>
            <div class="arc-slot-actions">
              <button class="arc-btn arc-btn-primary" data-action="new_campaign" data-slot="${index}">NEW CAMPAIGN</button>
            </div>
          </div>
        `
      }
      return `
        <div class="arc-slot-card">
          <span class="arc-slot-label">SLOT ${index + 1}</span>
          <strong>${escapeHtml(slot.playerName)}</strong>
          <span>${escapeHtml(slot.currentLevel.split('_').join(' '))}</span>
          <span>${slot.credits.toLocaleString()} credits</span>
          <div class="arc-slot-actions">
            <button class="arc-btn arc-btn-primary" data-action="continue_campaign" data-slot="${index}">CONTINUE</button>
            <button class="arc-btn arc-btn-secondary" data-action="overwrite_campaign" data-slot="${index}">RESET</button>
          </div>
        </div>
      `
    }).join('')

    return `
      <div class="arc-screen arc-title-screen">
        <div class="arc-screen-inner arc-title-panel">
          <span class="arc-eyebrow">SOLAR DEFENSE COMMAND</span>
          <h2 class="arc-title">Command Center</h2>
          <p class="arc-copy">Eight episodes. Shops between sorties. Secret routes if you know where to look.</p>
          <div class="arc-difficulty-row">${difficultyRow}</div>
          <p class="arc-controls-note">${isTouchDevice()
            ? 'Drag anywhere to move. Auto-fire is always on. Use the BOMB and SP buttons during combat.'
            : 'P1: WASD or Arrows move, E use special, Q cycle, Space/F MegaBomb. Press P during combat to bring P2 online. After joining, P2 uses IJKL move, O use special, U cycle, P MegaBomb, or the first connected gamepad. Esc pauses.'
          }</p>
          <div class="arc-slot-grid">${slots}</div>
          <div class="arc-screen-actions">
            <button class="arc-btn arc-btn-secondary" data-action="exit_arcade">EXIT</button>
          </div>
        </div>
      </div>
    `
  }

  private renderMap(view: ArcadeViewModel): string {
    const episodes = view.episodes.map((episode) => `
      <section class="arc-map-episode">
        <h3>${escapeHtml(episode.title)}</h3>
        <div class="arc-map-levels">
          ${episode.levels.map((level) => `
            <button
              class="arc-map-level${level.selected ? ' selected' : ''}${level.completed ? ' done' : ''}${level.locked ? ' locked' : ''}${level.secret ? ' secret' : ''}"
              data-action="select_level"
              data-level="${escapeHtml(level.id)}"
              ${level.locked ? 'disabled' : ''}
            >
              <span>${escapeHtml(level.secret && level.locked ? '???' : level.name)}</span>
              <small>${escapeHtml(level.secret && level.locked ? 'CLASSIFIED' : level.planetName)}</small>
            </button>
          `).join('')}
        </div>
      </section>
    `).join('')

    return `
      <div class="arc-screen arc-map-screen">
        <div class="arc-map-shell">
          <div class="arc-map-sidebar">
            <button class="arc-btn arc-btn-back" data-action="back_to_title">\u2190 TITLE</button>
            <span class="arc-eyebrow">CAMPAIGN MAP</span>
            <h2 class="arc-title">${escapeHtml(view.state.episodeName || 'Solar Route')}</h2>
            <div class="arc-map-stats">
              <span>Credits <strong>${view.state.credits.toLocaleString()}</strong></span>
              <span>Score <strong>${view.state.score.toLocaleString()}</strong></span>
              <span>Difficulty <strong>${escapeHtml(view.state.difficulty.toUpperCase())}</strong></span>
            </div>
            <div class="arc-loadout">
              ${view.selectedLoadout.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
            </div>
            <div class="arc-status-message">${escapeHtml(view.message)}</div>
            <div class="arc-sidebar-actions">
              <button class="arc-btn arc-btn-primary" data-action="open_briefing">LAUNCH</button>
              <div class="arc-sidebar-row">
                <button class="arc-btn arc-btn-secondary" data-action="open_shop">SHOP</button>
                <button class="arc-btn arc-btn-secondary" data-action="open_data_log">DATA LOG</button>
              </div>
            </div>
          </div>
          <div class="arc-map-main">${episodes}</div>
        </div>
      </div>
    `
  }

  private renderShop(view: ArcadeViewModel): string {
    const tabs = ['ship', 'front', 'rear', 'sidekicks', 'special', 'shield', 'generator', 'wing', 'armor']
      .map((tab) => `
        <button class="arc-shop-tab${view.shopTab === tab ? ' active' : ''}" data-action="shop_tab" data-tab="${tab}">${tab.split('_').join(' ').toUpperCase()}</button>
      `)
      .join('')

    const entries = view.shopEntries.map((entry) => {
      const actions = renderEntryActions(view.shopTab, entry)
      const spriteCss = entry.sprite ? getSpriteCSS(entry.sprite) : ''
      const thumb = spriteCss
        ? `<div class="arc-shop-sprite" style="${spriteCss}"></div>`
        : '<div class="arc-shop-sprite"></div>'
      return `
        <article class="arc-shop-entry${entry.equipped ? ' equipped' : ''}">
          <div class="arc-shop-visual">
            ${thumb}
            <span class="arc-shop-price">${entry.cost.toLocaleString()}c</span>
          </div>
          <div class="arc-shop-info">
            <strong>${escapeHtml(entry.label)}</strong>
            <small>${escapeHtml(entry.description)}</small>
            <span>${escapeHtml(entry.detail)}</span>
          </div>
          <div class="arc-shop-actions">${actions}</div>
        </article>
      `
    }).join('')

    return `
      <div class="arc-screen arc-shop-screen">
        <div class="arc-screen-inner wide">
          <div class="arc-shop-topbar">
            <button class="arc-btn arc-btn-back" data-action="close_shop">\u2190 BACK</button>
            <span class="arc-shop-wallet">Wallet <strong>${view.state.credits.toLocaleString()}</strong></span>
          </div>
          <span class="arc-eyebrow">SHOP</span>
          <h2 class="arc-title">Hangar &amp; Armory</h2>
          <div class="arc-loadout arc-loadout-shop">
            ${view.selectedLoadout.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}
          </div>
          <div class="arc-shop-tabs">${tabs}</div>
          <div class="arc-shop-list">${entries || '<p class="arc-copy">Nothing available in this tab.</p>'}</div>
          <div class="arc-status-message">${escapeHtml(view.message)}</div>
        </div>
      </div>
    `
  }

  private renderBriefing(view: ArcadeViewModel): string {
    return `
      <div class="arc-screen arc-briefing-screen">
        <div class="arc-screen-inner">
          <span class="arc-eyebrow">${escapeHtml(view.state.episodeName)}</span>
          <h2 class="arc-title">${escapeHtml(view.state.levelName)}</h2>
          <p class="arc-copy">${escapeHtml(view.briefing)}</p>
          <div class="arc-screen-actions">
            <button class="arc-btn arc-btn-primary" data-action="launch_level">LAUNCH</button>
            <button class="arc-btn arc-btn-secondary" data-action="back_to_map">BACK</button>
          </div>
        </div>
      </div>
    `
  }

  private renderCombat(view: ArcadeViewModel): string {
    const state = view.state
    return `
      <div class="arc-combat-shell">
        <div class="arc-combat-top">
          <div class="arc-stat-pill">SCORE <strong class="arc-score-value">${state.score.toLocaleString()}</strong></div>
          <div class="arc-stat-pill">CREDITS <strong class="arc-credits-value">${state.credits.toLocaleString()}</strong></div>
          <div class="arc-wave-pill">${state.bossMaxHealth > 0 ? 'BOSS' : `WAVE ${state.wave}/${state.totalWaves}`}</div>
        </div>
        <div class="arc-combat-left">
          <div class="arc-team-status">${renderCombatPlayers(state)}</div>
        </div>
        <div class="arc-combat-right">
          <div class="arc-coop-prompt"${state.coopPromptVisible ? '' : ' style="display:none"'}>
            Press <strong>[P]</strong> for co-op
          </div>
          <div class="arc-meta-row">Combo <strong class="arc-combo-value">${state.combo > 1 ? `x${state.combo}` : 'x1'}</strong></div>
          <div class="arc-meta-row">Graze <strong class="arc-graze-value">${state.grazeCount}</strong></div>
          <div class="arc-meta-row">Accuracy <strong class="arc-accuracy-value">${Math.round(state.accuracy)}%</strong></div>
          <div class="arc-synergy">${state.synergy ? `SYNERGY ${escapeHtml(state.synergy)}` : 'SYNERGY OFFLINE'}</div>
          <div class="arc-powerups">${renderCombatPowerups(state)}</div>
        </div>
        <div class="arc-boss"${state.bossMaxHealth > 0 ? '' : ' style="display:none"'}>
          <div class="arc-boss-head">
            <span class="arc-boss-name">${escapeHtml(state.bossName || 'BOSS')}</span>
            <span class="arc-boss-phase">PHASE ${state.bossPhase + 1}</span>
          </div>
          <div class="arc-bar arc-boss-track"><div class="arc-bar-fill arc-boss-fill"></div></div>
        </div>
        <div class="arc-comms-panel"><p class="arc-comms-text">${escapeHtml(state.comms[0] ?? view.message)}</p></div>
      </div>
    `
  }

  private renderDebrief(view: ArcadeViewModel): string {
    const debrief = view.state.debrief
    if (!debrief) return ''
    return `
      <div class="arc-screen arc-debrief-screen">
        <div class="arc-screen-inner">
          <span class="arc-eyebrow">${debrief.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</span>
          <h2 class="arc-title">${escapeHtml(debrief.levelName)}</h2>
          ${debrief.success ? `
            <div class="arc-debrief-shop-callout">
              <span class="arc-status-label">Upgrade Window</span>
              <button class="arc-btn arc-btn-primary arc-debrief-shop-btn" data-action="open_shop">OPEN SHOP</button>
              <span class="arc-debrief-shop-wallet">Wallet <strong>${view.state.credits.toLocaleString()}c</strong></span>
            </div>
          ` : ''}
          <div class="arc-debrief-grid">
            <div><span>Score</span><strong>${debrief.scoreEarned.toLocaleString()}</strong></div>
            <div><span>Credits</span><strong>${debrief.creditsEarned.toLocaleString()}</strong></div>
            <div><span>Accuracy</span><strong>${Math.round(debrief.accuracy)}%</strong></div>
            <div><span>Best Combo</span><strong>x${debrief.maxCombo}</strong></div>
            <div><span>Grazes</span><strong>${debrief.grazes}</strong></div>
            <div><span>Medal</span><strong>${debrief.medal.toUpperCase()}</strong></div>
          </div>
          <p class="arc-copy">${escapeHtml(debrief.summary)}</p>
          <div class="arc-screen-actions">
            <button class="arc-btn arc-btn-primary" data-action="debrief_continue">${debrief.success ? 'CONTINUE' : 'RETRY'}</button>
            <button class="arc-btn arc-btn-secondary" data-action="back_to_map">MAP</button>
          </div>
        </div>
      </div>
    `
  }

  private renderDataLog(view: ArcadeViewModel): string {
    const entries = view.dataLogEntries
      .map(({ entry, locked }) => `
        <button class="arc-log-entry${view.selectedLog?.entry.id === entry.id ? ' active' : ''}" data-action="select_log" data-log="${escapeHtml(entry.id)}">
          <span>${escapeHtml(locked ? '???' : entry.title)}</span>
          <small>${escapeHtml(locked ? (entry.hint ?? 'CLASSIFIED') : entry.category.toUpperCase())}</small>
        </button>
      `)
      .join('')

    const selected = view.selectedLog

    return `
      <div class="arc-screen arc-log-screen">
        <div class="arc-log-shell">
        <div class="arc-log-list">
          <button class="arc-btn arc-btn-back" data-action="close_data_log">\u2190 BACK</button>
          <span class="arc-eyebrow">DATA LOG</span>
          ${entries || '<p class="arc-copy">No recovered logs yet.</p>'}
        </div>
        <div class="arc-log-detail">
          <h2 class="arc-title">${escapeHtml(selected ? (selected.locked ? '???' : selected.entry.title) : 'No entry selected')}</h2>
          <span class="arc-log-source">${escapeHtml(selected ? (selected.locked ? (selected.entry.hint ?? 'Classified source') : selected.entry.source) : '')}</span>
          <p class="arc-copy">${escapeHtml(selected ? (selected.locked ? (selected.entry.hint ?? 'Recover this log to decode it.') : selected.entry.text) : view.message)}</p>
        </div>
      </div>
      </div>
    `
  }

  private renderGameOver(view: ArcadeViewModel): string {
    return `
      <div class="arc-screen arc-gameover-screen">
        <div class="arc-screen-inner">
          <span class="arc-eyebrow">GAME OVER</span>
          <h2 class="arc-title">${escapeHtml(view.state.levelName)}</h2>
          <p class="arc-copy">${escapeHtml(view.message)}</p>
          <div class="arc-screen-actions">
            <button class="arc-btn arc-btn-primary" data-action="retry_level">RETRY</button>
            <button class="arc-btn arc-btn-secondary" data-action="back_to_map">MAP</button>
          </div>
        </div>
      </div>
    `
  }

  private handleClick = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target || !this.callback) return

    event.stopPropagation()
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(target.dataset)) {
      if (key === 'action' || value === undefined) continue
      params[key] = value
    }
    this.callback(target.dataset.action ?? '', params)
  }

  private commitMarkup(markup: string, entering = false): void {
    if (markup === this.lastMarkup) return
    this.root.classList.toggle('arc-entering', entering)
    this.root.innerHTML = markup
    this.lastMarkup = markup
    this.combatEls.clear()
  }
}

function renderEntryActions(tab: ShopTab, entry: ShopEntry): string {
  if (tab === 'special') {
    return `
      ${entry.owned
        ? `<button class="arc-btn arc-btn-secondary" data-action="equip_entry" data-entry="${escapeHtml(entry.id)}">ARM</button>`
        : `<button class="arc-btn arc-btn-primary" data-action="buy_entry" data-entry="${escapeHtml(entry.id)}">BUY</button>`
      }
      ${entry.equipped && entry.cost > 0 ? `<button class="arc-btn arc-btn-secondary" data-action="sell_slot" data-slot="special">SELL</button>` : ''}
    `
  }

  if (tab === 'sidekicks') {
    return `
      ${entry.owned
        ? `<button class="arc-btn arc-btn-secondary" data-action="equip_left" data-entry="${escapeHtml(entry.id)}">LEFT</button>
           <button class="arc-btn arc-btn-secondary" data-action="equip_right" data-entry="${escapeHtml(entry.id)}">RIGHT</button>`
        : `<button class="arc-btn arc-btn-primary" data-action="buy_entry" data-entry="${escapeHtml(entry.id)}" data-slot="sidekickL">BUY LEFT</button>
           <button class="arc-btn arc-btn-primary" data-action="buy_entry" data-entry="${escapeHtml(entry.id)}" data-slot="sidekickR">BUY RIGHT</button>`
      }
      ${entry.owned ? `<button class="arc-btn arc-btn-secondary" data-action="upgrade_entry" data-entry="${escapeHtml(entry.id)}">UPGRADE</button>` : ''}
    `
  }

  if (tab === 'ship' || tab === 'shield' || tab === 'generator' || tab === 'wing' || tab === 'armor') {
    return entry.owned
      ? `<button class="arc-btn arc-btn-secondary" data-action="equip_entry" data-entry="${escapeHtml(entry.id)}">EQUIP</button>`
      : `<button class="arc-btn arc-btn-primary" data-action="buy_entry" data-entry="${escapeHtml(entry.id)}">BUY</button>`
  }

  const sellSlot = slotForTab(tab)
  return `
    ${entry.owned
      ? `<button class="arc-btn arc-btn-secondary" data-action="equip_entry" data-entry="${escapeHtml(entry.id)}">EQUIP</button>`
      : `<button class="arc-btn arc-btn-primary" data-action="buy_entry" data-entry="${escapeHtml(entry.id)}">BUY</button>`
    }
    ${entry.owned ? `<button class="arc-btn arc-btn-secondary" data-action="upgrade_entry" data-entry="${escapeHtml(entry.id)}">UPGRADE</button>` : ''}
    ${entry.equipped && entry.cost > 0 && sellSlot ? `<button class="arc-btn arc-btn-secondary" data-action="sell_slot" data-slot="${sellSlot}">SELL</button>` : ''}
  `
}

function slotForTab(tab: ShopTab): string | null {
  switch (tab) {
    case 'front':
      return 'front'
    case 'rear':
      return 'rear'
    case 'special':
      return 'special'
    default:
      return null
  }
}

function renderCombatPlayers(state: ArcadeState): string {
  return state.players.map((player) => `
    <section class="arc-player-card${player.alive ? '' : ' down'}">
      <div class="arc-player-head">
        <span class="arc-player-label">${escapeHtml(player.label)}</span>
        <span class="arc-player-state">${player.alive ? 'ONLINE' : player.lives > 0 ? 'RESPAWNING' : 'DOWN'}</span>
      </div>
      <div class="arc-meter"><span>Armor</span><div class="arc-bar"><div class="arc-bar-fill arc-health-fill" style="width:${barWidth(player.health, player.maxHealth)}%"></div></div></div>
      <div class="arc-meter"><span>Shield</span><div class="arc-bar"><div class="arc-bar-fill arc-shield-fill" style="width:${barWidth(player.shield, player.maxShield)}%"></div></div></div>
      <div class="arc-meter"><span>Energy</span><div class="arc-bar"><div class="arc-bar-fill arc-energy-fill" style="width:${barWidth(player.energy, player.maxEnergy)}%"></div></div></div>
      <div class="arc-meta-row">Lives <strong>${player.lives}</strong></div>
      <div class="arc-meta-row">Bombs <strong>${player.bombs}</strong></div>
      <div class="arc-special-box">
        <span class="arc-special-name">${escapeHtml(player.specialName || 'NONE')}</span>
        <strong class="arc-special-ammo">${player.specialAmmo}</strong>
      </div>
    </section>
  `).join('')
}

function renderCombatPowerups(state: ArcadeState): string {
  const labels = new Map(state.players.map((player) => [player.id, player.label]))
  return state.powerups.map((pu) => {
    const pct = Math.max(0, Math.min(100, (pu.remaining / pu.duration) * 100))
    const secs = Math.ceil(pu.remaining)
    return `<div class="arc-pu-item"><span class="arc-pu-label">${escapeHtml(labels.get(pu.playerId) ?? 'P?')} ${escapeHtml(pu.label)}<em>${secs}s</em></span><div class="arc-bar arc-pu-bar"><div class="arc-bar-fill arc-pu-fill" style="width:${pct}%"></div></div></div>`
  }).join('')
}

function barWidth(value: number, max: number): number {
  return max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
}


function setTextEl(element: HTMLElement | null, value: string): void {
  if (element) element.textContent = value
}

function setBarEl(element: HTMLElement | null, value: number, max: number): void {
  if (!element) return
  const width = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  element.style.width = `${width}%`
}
