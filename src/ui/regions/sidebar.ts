import type { PlanetMission, SolarState } from '../../types'
import { escapeHtml } from '../../utils'

export function renderSidebar(
  state: SolarState,
  mission: PlanetMission | null,
  missions: PlanetMission[],
): string {
  if (!mission) return ''

  const progress = missions
    .map((item, index) => {
      const cls = index < state.planetIndex ? 'done' : index === state.planetIndex ? 'current' : ''
      return `<span class="planet-pill ${cls}">${escapeHtml(item.name)}</span>`
    })
    .join('')

  return `
    <div class="glass-card">
      <span class="eyebrow">Route</span>
      <div class="planet-progress">${progress}</div>
      <span class="eyebrow">Recovered Clues</span>
      <ul class="clue-list">
        ${mission.hotspots
          .map((item) => {
            const found = state.scannedHotspots.includes(item.id)
            return `
              <li class="${found ? 'found' : ''}">
                <span class="clue-label">${escapeHtml(item.label)}</span>
                <span class="clue-text">${found ? escapeHtml(item.clue) : 'Signal not yet resolved.'}</span>
              </li>
            `
          })
          .join('')}
      </ul>
    </div>
  `
}
