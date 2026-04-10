import bossBattleLoopUrl from '../assets/music/boss-battle-loop.mp3'
import outInSpaceUrl from '../assets/music/out-in-space.ogg'
import outInSpaceMenuUrl from '../assets/music/out-in-space-menu.ogg'
import spaceBattleUrl from '../assets/music/space-battle.ogg'

type TrackId = 'out_in_space_menu' | 'out_in_space' | 'space_battle' | 'boss_battle'

interface TrackConfig {
  url: string
}

interface CueConfig {
  trackId: TrackId
  volume: number
}

interface Channel {
  trackId: TrackId
  source: AudioBufferSourceNode
  gain: GainNode
}

const MASTER_VOLUME = 0.18
const FADE_SECONDS = 0.75
const SILENT_GAIN = 0.0001

const TRACKS: Record<TrackId, TrackConfig> = {
  out_in_space_menu: { url: outInSpaceMenuUrl },
  out_in_space: { url: outInSpaceUrl },
  space_battle: { url: spaceBattleUrl },
  boss_battle: { url: bossBattleLoopUrl },
}

const CUES = {
  cinematic: { trackId: 'out_in_space_menu', volume: 0.42 },
  lesson_briefing: { trackId: 'out_in_space_menu', volume: 0.56 },
  lesson_explore: { trackId: 'out_in_space', volume: 0.62 },
  lesson_puzzle: { trackId: 'out_in_space', volume: 0.58 },
  lesson_warp: { trackId: 'space_battle', volume: 0.48 },
  lesson_end: { trackId: 'out_in_space_menu', volume: 0.6 },
  arcade_menu: { trackId: 'out_in_space_menu', volume: 0.54 },
  arcade_action: { trackId: 'space_battle', volume: 0.46 },
  arcade_danger: { trackId: 'boss_battle', volume: 0.44 },
  arcade_boss: { trackId: 'boss_battle', volume: 0.5 },
} as const satisfies Record<string, CueConfig>

export type MusicCue = keyof typeof CUES

export class GameMusic {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private active: Channel | null = null
  private readonly buffers = new Map<TrackId, AudioBuffer>()
  private readonly inflight = new Map<TrackId, Promise<AudioBuffer>>()
  private disposed = false
  private requestId = 0
  private currentCue: MusicCue | null = null
  private currentTrack: TrackId | null = null

  warm(): void {
    if (this.disposed) return
    this.ensure()
    for (const trackId of Object.keys(TRACKS) as TrackId[]) {
      void this.loadTrack(trackId)
    }
  }

  setCue(cue: MusicCue | null): void {
    if (this.disposed) return
    if (cue === this.currentCue) {
      this.resume()
      return
    }

    this.currentCue = cue
    this.requestId += 1

    if (!cue) {
      this.currentTrack = null
      this.fadeOut(this.active)
      this.active = null
      return
    }

    const next = CUES[cue]
    this.ensure()
    this.resume()

    if (this.active && this.currentTrack === next.trackId) {
      this.currentTrack = next.trackId
      this.rampGain(this.active.gain, next.volume)
      return
    }

    this.currentTrack = next.trackId
    const requestId = this.requestId
    void this.activate(next.trackId, next.volume, requestId).catch(() => {
      if (requestId !== this.requestId) return
      this.currentCue = null
      this.currentTrack = null
    })
  }

  dispose(): void {
    this.disposed = true
    this.requestId += 1
    this.currentCue = null
    this.currentTrack = null

    if (this.active) {
      try {
        this.active.source.stop()
      } catch {
        // Already stopped.
      }
      this.active = null
    }

    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
      this.master = null
    }

    this.buffers.clear()
    this.inflight.clear()
  }

  private ensure(): AudioContext {
    if (this.disposed) {
      throw new Error('Music controller has been disposed.')
    }
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = MASTER_VOLUME
      this.master.connect(this.ctx.destination)
    }
    return this.ctx
  }

  private resume(): void {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume()
    }
  }

  private async activate(trackId: TrackId, volume: number, requestId: number): Promise<void> {
    const buffer = await this.loadTrack(trackId)
    if (
      requestId !== this.requestId
      || this.currentTrack !== trackId
      || !this.ctx
      || !this.master
    ) {
      return
    }

    const source = this.ctx.createBufferSource()
    const gain = this.ctx.createGain()
    gain.gain.value = SILENT_GAIN
    source.buffer = buffer
    source.loop = true
    source.connect(gain).connect(this.master)
    source.start()

    const previous = this.active
    this.active = { trackId, source, gain }
    this.rampGain(gain, volume)
    this.fadeOut(previous)
  }

  private async loadTrack(trackId: TrackId): Promise<AudioBuffer> {
    const cached = this.buffers.get(trackId)
    if (cached) return cached

    const pending = this.inflight.get(trackId)
    if (pending) return pending

    const promise = fetch(TRACKS[trackId].url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load music track: ${trackId}`)
        }
        const data = await response.arrayBuffer()
        if (this.disposed) {
          throw new Error(`Music controller was disposed while loading: ${trackId}`)
        }
        const buffer = await this.ensure().decodeAudioData(data)
        this.buffers.set(trackId, buffer)
        this.inflight.delete(trackId)
        return buffer
      })
      .catch((error) => {
        this.inflight.delete(trackId)
        throw error
      })

    this.inflight.set(trackId, promise)
    return promise
  }

  private rampGain(gainNode: GainNode, volume: number): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    gainNode.gain.cancelScheduledValues(now)
    gainNode.gain.setValueAtTime(Math.max(SILENT_GAIN, gainNode.gain.value), now)
    gainNode.gain.exponentialRampToValueAtTime(Math.max(SILENT_GAIN, volume), now + FADE_SECONDS)
  }

  private fadeOut(channel: Channel | null): void {
    if (!channel || !this.ctx) return
    const now = this.ctx.currentTime
    channel.gain.gain.cancelScheduledValues(now)
    channel.gain.gain.setValueAtTime(Math.max(SILENT_GAIN, channel.gain.gain.value), now)
    channel.gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, now + FADE_SECONDS)
    try {
      channel.source.stop(now + FADE_SECONDS + 0.05)
    } catch {
      // Already stopped.
    }
  }
}
