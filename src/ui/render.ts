import type { PlanetMission, SolarState } from '../types'
import type { UIElements } from './shell'
import { renderBanner as buildBanner } from './regions/banner'
import { renderPanel as buildPanel } from './regions/panel'
import { renderPeerBar as buildPeerBar } from './regions/peer-bar'
import { renderSidebar as buildSidebar } from './regions/sidebar'
import { renderSupport as buildSupport } from './regions/support'
import { renderTopbar as buildTopbar } from './regions/topbar'

export function renderUI(
  ui: UIElements,
  state: SolarState,
  missions: PlanetMission[],
  fatalError: string,
) {
  // Hide lesson UI during arcade mode (arcade HUD manages its own overlay)
  if (state.phase === 'arcade') {
    ui.topbar.innerHTML = ''
    ui.sidebar.innerHTML = ''
    ui.panel.innerHTML = ''
    ui.banner.innerHTML = ''
    ui.peerBar.innerHTML = ''
    const support = buildSupport(fatalError)
    ui.support.className = support.className
    ui.support.innerHTML = support.html
    return
  }

  const mission = missions[state.planetIndex] || null
  ui.topbar.innerHTML = buildTopbar(state)
  ui.sidebar.innerHTML = buildSidebar(state, mission, missions)
  ui.panel.innerHTML = buildPanel(state, mission, missions)
  ui.banner.innerHTML = buildBanner(state, mission, missions)
  const support = buildSupport(fatalError)
  ui.support.className = support.className
  ui.support.innerHTML = support.html
  renderPeerBar(ui.peerBar, state)
}

export function renderPeerBar(el: HTMLElement, state: SolarState) {
  el.innerHTML = buildPeerBar(state)
}
