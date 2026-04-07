const MASTER_VOLUME = 0.24

const allSfx = import.meta.glob('../../assets/kenney/sci-fi-sounds/*.ogg', {
  eager: true,
  import: 'default',
}) as Record<string, string>

interface RoleConfig {
  categories: string[]
  volume: number
  rateRange: [number, number]
}

const ROLES: Record<string, RoleConfig> = {
  laser_light: { categories: ['laserSmall', 'laserRetro'], volume: 0.28, rateRange: [0.95, 1.08] },
  laser_heavy: { categories: ['laserLarge'], volume: 0.42, rateRange: [0.82, 0.96] },
  missile: { categories: ['spaceEngineSmall', 'thrusterFire'], volume: 0.26, rateRange: [0.88, 1.04] },
  beam: { categories: ['laserLarge'], volume: 0.34, rateRange: [1.05, 1.2] },
  explosion_small: { categories: ['explosionCrunch'], volume: 0.48, rateRange: [0.96, 1.08] },
  explosion_big: { categories: ['lowFrequency_explosion', 'explosionCrunch'], volume: 0.82, rateRange: [0.78, 0.92] },
  hit: { categories: ['impactMetal'], volume: 0.34, rateRange: [0.92, 1.08] },
  pickup: { categories: ['forceField'], volume: 0.32, rateRange: [1.02, 1.2] },
  ui: { categories: ['doorOpen', 'computerNoise'], volume: 0.24, rateRange: [1, 1.2] },
  error: { categories: ['doorClose'], volume: 0.2, rateRange: [0.9, 1] },
  graze: { categories: ['impactMetal'], volume: 0.18, rateRange: [1.24, 1.38] },
  shield_hit: { categories: ['forceField'], volume: 0.3, rateRange: [0.8, 0.94] },
  shield_break: { categories: ['forceField', 'impactMetal'], volume: 0.44, rateRange: [0.65, 0.8] },
  boss_entry: { categories: ['spaceEngineLarge', 'laserLarge'], volume: 0.6, rateRange: [0.62, 0.74] },
  boss_phase: { categories: ['engineCircular', 'forceField'], volume: 0.42, rateRange: [0.72, 0.86] },
  combo: { categories: ['doorOpen'], volume: 0.26, rateRange: [1.18, 1.4] },
  shop_buy: { categories: ['doorOpen'], volume: 0.3, rateRange: [1.12, 1.28] },
  shop_sell: { categories: ['doorClose'], volume: 0.26, rateRange: [1.1, 1.18] },
  victory: { categories: ['forceField', 'doorOpen'], volume: 0.5, rateRange: [1.16, 1.3] },
}

function bankByCategory(): Record<string, string[]> {
  const bank: Record<string, string[]> = {}
  for (const [path, url] of Object.entries(allSfx)) {
    const file = path.split('/').pop() ?? path
    const category = file.replace(/_\d+\.ogg$/, '')
    ;(bank[category] ??= []).push(url)
  }
  return bank
}

export class ArcadeAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private roleBuffers = new Map<string, AudioBuffer[]>()
  private loading = false

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = MASTER_VOLUME
      this.master.connect(this.ctx.destination)
      if (!this.loading) void this.load()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume()
    }
    return this.ctx
  }

  private async load(): Promise<void> {
    if (!this.ctx) return
    this.loading = true
    const bank = bankByCategory()
    const decoded = await Promise.all(
      Object.entries(ROLES).map(async ([role, config]) => {
        const buffers: AudioBuffer[] = []
        for (const category of config.categories) {
          for (const url of bank[category] ?? []) {
            try {
              const response = await fetch(url)
              const data = await response.arrayBuffer()
              buffers.push(await this.ctx!.decodeAudioData(data))
            } catch {
              // ignore decode failures
            }
          }
        }
        return [role, buffers] as const
      }),
    )
    for (const [role, buffers] of decoded) {
      this.roleBuffers.set(role, buffers)
    }
  }

  play(role: keyof typeof ROLES): void {
    this.ensure()
    if (!this.ctx || this.ctx.state !== 'running') return
    const config = ROLES[role]
    const pool = this.roleBuffers.get(role)
    if (!config || !pool || pool.length === 0 || !this.master) return

    const source = this.ctx.createBufferSource()
    source.buffer = pool[Math.floor(Math.random() * pool.length)]
    source.playbackRate.value = randomBetween(config.rateRange[0], config.rateRange[1])
    const gain = this.ctx.createGain()
    gain.gain.value = config.volume
    source.connect(gain).connect(this.master)
    source.start()
  }

  missile(): void { this.play('missile') }
  explosion(big = false): void { this.play(big ? 'explosion_big' : 'explosion_small') }
  hit(): void { this.play('hit') }
  pickup(): void { this.play('pickup') }
  ui(): void { this.play('ui') }
  graze(): void { this.play('graze') }
  shieldHit(): void { this.play('shield_hit') }
  shieldBreak(): void { this.play('shield_break') }
  bossEntry(): void { this.play('boss_entry') }
  bossPhase(): void { this.play('boss_phase') }
  combo(): void { this.play('combo') }
  shopBuy(): void { this.play('shop_buy') }
  shopSell(): void { this.play('shop_sell') }
  victory(): void { this.play('victory') }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close()
      this.ctx = null
      this.master = null
    }
    this.roleBuffers.clear()
    this.loading = false
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}
