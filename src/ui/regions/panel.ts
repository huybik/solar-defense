import type { PlanetMission, SolarState } from '../../types'
import { escapeHtml } from '../../utils'

function renderPuzzle(state: SolarState, mission: PlanetMission): string {
  const correctChoice = mission.choices.find((item) => item.label === mission.answer)

  const choices = mission.choices
    .map((choice) => {
      const selected = state.selectedChoice === choice.id
      const correct = state.answered && choice.label === mission.answer
      const wrong = state.answered && selected && choice.label !== mission.answer
      const cls = correct ? 'correct' : wrong ? 'wrong' : selected ? 'selected' : ''
      const disabled = state.answered ? 'disabled' : ''
      return `<button data-choice="${escapeHtml(choice.label)}" class="choice ${cls}" ${disabled}>${escapeHtml(choice.label)}</button>`
    })
    .join('')

  const isCorrect = state.selectedChoice === correctChoice?.id
  const note = state.answered
    ? isCorrect
      ? `<strong>${escapeHtml(mission.celebration)}</strong>`
      : `Correct answer: <strong>${escapeHtml(mission.answer)}</strong>`
    : 'Use the recovered clues to pick the best answer.'

  return `
    <p class="mission-copy">${escapeHtml(mission.question)}</p>
    <div class="choice-grid">${choices}</div>
    <div class="answer-note">${note}</div>
    <div class="button-row">
      <button data-action="reveal" class="secondary">Reveal</button>
      <button data-action="next" class="primary">${state.answered ? 'Warp Onward' : 'Skip Puzzle'}</button>
    </div>
  `
}

function renderPhaseContent(state: SolarState, mission: PlanetMission): string {
  switch (state.phase) {
    case 'briefing':
      return `
        <p class="mission-copy">${escapeHtml(mission.subtitle)}</p>
        <p>${escapeHtml(mission.prompt)}</p>
        <div class="button-row">
          <button data-action="next" class="primary">Enter Scan Mode</button>
        </div>
      `
    case 'explore':
      return `
        <p class="mission-copy">${escapeHtml(mission.prompt)}</p>
        <p>Rotate the planet and click all three glowing beacons. Each beacon unlocks a clue.</p>
        <div class="button-row">
          <button data-action="next" class="secondary">Auto-complete Scan</button>
        </div>
      `
    case 'puzzle':
      return renderPuzzle(state, mission)
    case 'warp':
      return `
        <p class="mission-copy">Charting a new course through the observatory lane.</p>
        <p>Hold steady while the ship folds space toward the next world.</p>
      `
    case 'end':
      return `
        <p class="mission-copy">Voyage complete.</p>
        <p>You restored the full observatory route from Mercury to Neptune with a final score of <strong>${state.score}</strong>.</p>
        <div class="button-row">
          <button data-action="arcade" class="primary">COMMAND CENTER</button>
          <button data-ui="restart" class="secondary">Restart Voyage</button>
        </div>
      `
    default:
      return ''
  }
}

export function renderPanel(
  state: SolarState,
  mission: PlanetMission | null,
  missions: PlanetMission[],
): string {
  if (!mission) return ''

  return `
    <div class="glass-card mission-card">
      <span class="eyebrow">Mission ${state.planetIndex + 1} / ${missions.length}</span>
      <h2>${escapeHtml(mission.name)}</h2>
      ${renderPhaseContent(state, mission)}
    </div>
  `
}
