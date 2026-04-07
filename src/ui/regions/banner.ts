import type { PlanetMission, SolarState } from '../../types'
import { escapeHtml } from '../../utils'

export function renderBanner(
  state: SolarState,
  mission: PlanetMission | null,
  missions: PlanetMission[],
): string {
  if (!mission) return ''

  if (state.phase === 'warp') {
    const next = missions[state.planetIndex + 1]
    return `
      <div class="center-banner">
        <span class="eyebrow">Warp Corridor</span>
        <strong>${escapeHtml(next?.name || 'Outer Silence')}</strong>
      </div>
    `
  }

  if (state.phase === 'briefing') {
    return `
      <div class="center-banner">
        <span class="eyebrow">Now Approaching</span>
        <strong>${escapeHtml(mission.name)}</strong>
      </div>
    `
  }

  if (state.phase === 'explore') {
    return `
      <div class="center-banner compact">
        <span>${state.scannedHotspots.length} / ${mission.hotspots.length} beacons recovered</span>
      </div>
    `
  }

  return ''
}
