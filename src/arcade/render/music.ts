import type { PlanetId } from '../types'

type Intensity = 'calm' | 'action' | 'boss' | 'danger'

interface Theme {
  tempo: number
  root: number
  scale: number[]
  wave: OscillatorType
}

const THEMES: Record<PlanetId, Theme> = {
  mercury: { tempo: 148, root: 46, scale: [0, 3, 7, 10], wave: 'square' },
  venus: { tempo: 92, root: 42, scale: [0, 1, 5, 8], wave: 'triangle' },
  earth: { tempo: 124, root: 48, scale: [0, 4, 7, 11], wave: 'sawtooth' },
  mars: { tempo: 132, root: 43, scale: [0, 3, 6, 10], wave: 'square' },
  jupiter: { tempo: 112, root: 40, scale: [0, 4, 7, 9], wave: 'sawtooth' },
  saturn: { tempo: 116, root: 45, scale: [0, 3, 7, 10], wave: 'triangle' },
  uranus: { tempo: 102, root: 50, scale: [0, 5, 7, 10], wave: 'sine' },
  neptune: { tempo: 96, root: 38, scale: [0, 2, 5, 8], wave: 'triangle' },
  secret: { tempo: 136, root: 53, scale: [0, 4, 7, 9], wave: 'square' },
}

export class ArcadeMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private timer = 0
  private step = 0
  private theme: Theme = THEMES.saturn
  private intensity: Intensity = 'calm'
  private activePlanet: PlanetId = 'saturn'

  update(delta: number): void {
    if (!this.ctx) return
    this.timer -= delta
    if (this.timer > 0) return

    const beat = 60 / this.theme.tempo
    this.timer = beat * (this.intensity === 'boss' ? 0.5 : this.intensity === 'action' ? 0.75 : 1)
    this.playStep()
  }

  setMood(planet: PlanetId, intensity: Intensity): void {
    this.ensure()
    this.activePlanet = planet
    this.theme = THEMES[planet]
    this.intensity = intensity
    if (this.master) {
      this.master.gain.value = intensity === 'danger' ? 0.06 : intensity === 'boss' ? 0.09 : 0.05
    }
  }

  stop(): void {
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
      this.master = null
    }
  }

  private ensure(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.05
    this.master.connect(this.ctx.destination)
  }

  private playStep(): void {
    if (!this.ctx || !this.master) return
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }

    const scale = this.theme.scale
    const noteIndex = (this.step + (this.intensity === 'danger' ? 1 : 0)) % scale.length
    const bassNote = midiToFreq(this.theme.root + scale[noteIndex] - 12)
    const leadNote = midiToFreq(this.theme.root + scale[(noteIndex + 2) % scale.length] + (this.step % 2 === 0 ? 12 : 0))
    const now = this.ctx.currentTime

    this.triggerVoice(bassNote, 0.18, this.theme.wave, now, 0.16)

    if (this.intensity !== 'calm') {
      this.triggerVoice(leadNote, 0.12, 'triangle', now + 0.04, this.intensity === 'boss' ? 0.14 : 0.08)
    }

    if (this.intensity === 'boss' || this.intensity === 'danger') {
      this.triggerVoice(leadNote * 2, 0.08, 'square', now + 0.1, 0.05)
    }

    this.step = (this.step + 1) % 16
  }

  private triggerVoice(freq: number, duration: number, wave: OscillatorType, when: number, gainValue: number): void {
    if (!this.ctx || !this.master) return

    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    const filter = this.ctx.createBiquadFilter()

    osc.type = wave
    osc.frequency.value = freq
    filter.type = 'lowpass'
    filter.frequency.value = this.activePlanet === 'neptune' ? 900 : 1600

    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)

    osc.connect(filter).connect(gain).connect(this.master)
    osc.start(when)
    osc.stop(when + duration + 0.05)
  }
}

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}
