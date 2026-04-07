export interface BossUpgrade {
  id: string
  label: string
  stat: string
  value: number
  description: string
}

export const BOSS_UPGRADES: Record<string, BossUpgrade> = {
  mercury_heat_sentinel: { id: 'mercury_heat_sentinel', label: 'Thermal Boost', stat: 'fireRateBonus', value: 0.05, description: '+5% fire rate' },
  solar_forge: { id: 'solar_forge', label: 'Forge Reserves', stat: 'maxBombs', value: 1, description: '+1 max bomb' },
  venus_spore_mother: { id: 'venus_spore_mother', label: 'Spore Magnet', stat: 'pickupRadius', value: 0.10, description: '+10% pickup radius' },
  acid_empress: { id: 'acid_empress', label: 'Acid Coating', stat: 'shieldRegen', value: 0.15, description: '+15% shield regen' },
  earth_drone_nexus: { id: 'earth_drone_nexus', label: 'Drone Optics', stat: 'bulletSpeed', value: 0.08, description: '+8% bullet speed' },
  orbital_sentinel: { id: 'orbital_sentinel', label: 'Sentinel Core', stat: 'maxLives', value: 1, description: '+1 extra life' },
  mars_sand_wyrm: { id: 'mars_sand_wyrm', label: 'Wyrm Bounty', stat: 'creditGain', value: 0.10, description: '+10% credit gain' },
  dust_devil: { id: 'dust_devil', label: "Devil's Mark", stat: 'damageBonus', value: 0.12, description: '+12% damage' },
  jupiter_stormcaller: { id: 'jupiter_stormcaller', label: 'Storm Drive', stat: 'moveSpeed', value: 0.05, description: '+5% move speed' },
  storm_king: { id: 'storm_king', label: "King's Cell", stat: 'energyRegen', value: 2, description: '+2 energy regen/s' },
  saturn_shard_captain: { id: 'saturn_shard_captain', label: 'Shard Lens', stat: 'energyCost', value: -0.10, description: '-10% energy cost' },
  ring_guardian: { id: 'ring_guardian', label: 'Ring Sense', stat: 'grazeRadius', value: 0.15, description: '+15% graze radius' },
  uranus_frost_warden: { id: 'uranus_frost_warden', label: 'Frost Plating', stat: 'maxShield', value: 0.08, description: '+8% max shield' },
  ice_titan: { id: 'ice_titan', label: "Titan's Gift", stat: 'powerupDuration', value: 1.0, description: 'Double power-up duration' },
  neptune_shadow_herald: { id: 'neptune_shadow_herald', label: 'Shadow Strike', stat: 'critChance', value: 0.05, description: '5% chance for 2x damage' },
  void_leviathan: { id: 'void_leviathan', label: 'Leviathan Bane', stat: 'bossDamage', value: 0.25, description: '+25% damage to bosses' },
}

export function getBossUpgrade(bossId: string): BossUpgrade | null {
  return BOSS_UPGRADES[bossId] ?? null
}
