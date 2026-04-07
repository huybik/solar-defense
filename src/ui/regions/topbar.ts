import type { SolarState } from '../../types'

export function renderTopbar(state: SolarState): string {
  return `
    <div class="solar-brand">
      <span class="eyebrow">Solar Defense</span>
      <h1>Observatory Route</h1>
    </div>
    <div class="solar-stats">
      <div class="stat-card">
        <span>Score</span>
        <strong>${state.score}</strong>
      </div>
      <div class="stat-card">
        <span>Streak</span>
        <strong>${state.streak}</strong>
      </div>
    </div>
  `
}
