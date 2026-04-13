import { VoiceEngine } from '../../cinematic/voice'
import type { ArcadeEvent } from '../types'

const MIN_REPEAT_GAP_MS = 400

export class ArcadeWarningVoice {
  private readonly voice: VoiceEngine | null
  private readonly enabled: boolean
  private active = false
  private lastEventKey = ''
  private lastEventAt = 0

  constructor(enabled: boolean) {
    this.voice = enabled ? new VoiceEngine() : null
    this.enabled = enabled && (this.voice?.supported ?? false)
  }

  activate(): void {
    if (!this.enabled || !this.voice) return
    this.active = true
    this.voice.activate()
  }

  announce(event: ArcadeEvent): void {
    if (!this.enabled || !this.active) return

    const line = voiceLineForEvent(event)
    if (!line) return

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const eventKey = getEventKey(event)
    if (eventKey === this.lastEventKey && now - this.lastEventAt < MIN_REPEAT_GAP_MS) return

    this.lastEventKey = eventKey
    this.lastEventAt = now
    void this.voice?.speak(line)
  }

  stop(): void {
    this.voice?.stop()
  }
}

function voiceLineForEvent(event: ArcadeEvent): string | null {
  switch (event.type) {
    case 'wave_start':
      return `Warning. Wave ${event.wave} inbound.`
    case 'boss_enter': {
      const hint = finishSentence(event.hint)
      return hint
        ? `Boss alert. ${event.name} entering the sector. ${hint}`
        : `Boss alert. ${event.name} entering the sector.`
    }
    case 'boss_phase': {
      const hint = finishSentence(event.hint)
      return hint
        ? `Phase ${event.phase + 1}. ${event.attackName}. ${hint}`
        : `Phase ${event.phase + 1}. ${event.attackName}.`
    }
    case 'boss_vulnerable':
      return `${event.name} is vulnerable. Fire at will.`
    case 'player_down':
      return 'Pilot down. Respawn sequence engaged.'
    default:
      return null
  }
}

function getEventKey(event: ArcadeEvent): string {
  switch (event.type) {
    case 'wave_start':
      return `${event.type}:${event.levelId}:${event.wave}`
    case 'boss_enter':
      return `${event.type}:${event.bossId}`
    case 'boss_phase':
      return `${event.type}:${event.phase}:${event.attackName}`
    case 'boss_vulnerable':
      return `${event.type}:${event.name}`
    case 'player_down':
      return `${event.type}:${event.playerId}`
    default:
      return event.type
  }
}

function finishSentence(value: string): string {
  const text = value.trim()
  if (!text) return ''
  return /[.!?]$/.test(text) ? text : `${text}.`
}
