import type { SolarState } from '../../types'
import { escapeHtml } from '../../utils'

export function renderPeerBar(state: SolarState): string {
  if (state.peers.length <= 1) return ''

  const sorted = [...state.peers].sort((a, b) => b.score - a.score)
  return `
    <div class="glass-card peer-card">
      <span class="eyebrow">Crew</span>
      ${sorted
        .map(
          (peer) => `
          <div class="peer-row ${peer.score === state.score ? 'self' : ''}">
            <span>${escapeHtml(peer.name)}</span>
            <strong>${peer.score}</strong>
          </div>
        `,
        )
        .join('')}
    </div>
  `
}
