import type { ArmorDef, CampaignState, Difficulty, GeneratorDef, PlayerLoadout, ShieldDef, ShipHull, WeaponSlot, WingDef } from '../types'
import { WEAPON_SLOTS } from '../types'

const SAVE_KEY = 'solar-defense-command-save-v1'

interface SaveBlob {
  version: 1
  slots: Array<CampaignState | null>
}

export const HULLS: Record<string, ShipHull> = {
  cadet_blue: { id: 'cadet_blue', name: 'Cadet Blue', sprite: 'playerShip1_blue', armor: 28, speed: 20, focusSpeed: 10, energyRegen: 3, slots: WEAPON_SLOTS, cost: 0, description: 'Balanced trainer hull.', unlockEpisode: 0 },
  cadet_green: { id: 'cadet_green', name: 'Cadet Green', sprite: 'playerShip1_green', armor: 24, speed: 22, focusSpeed: 11, energyRegen: 3.4, slots: WEAPON_SLOTS, cost: 450, description: 'Fast and efficient early hull.', unlockEpisode: 0 },
  cadet_orange: { id: 'cadet_orange', name: 'Cadet Orange', sprite: 'playerShip1_orange', armor: 30, speed: 19, focusSpeed: 9.6, energyRegen: 3, slots: WEAPON_SLOTS, cost: 550, description: 'Heavier early hull with extra armor.', unlockEpisode: 0 },
  cadet_red: { id: 'cadet_red', name: 'Cadet Red', sprite: 'playerShip1_red', armor: 26, speed: 21, focusSpeed: 10.2, energyRegen: 3.2, slots: WEAPON_SLOTS, cost: 600, description: 'Aggressive starter frame.', unlockEpisode: 0 },
  striker_blue: { id: 'striker_blue', name: 'Striker Blue', sprite: 'playerShip2_blue', armor: 34, speed: 22, focusSpeed: 10.5, energyRegen: 4.2, slots: WEAPON_SLOTS, cost: 1800, description: 'Mid-tier balanced striker hull.', unlockEpisode: 2 },
  striker_green: { id: 'striker_green', name: 'Striker Green', sprite: 'playerShip2_green', armor: 31, speed: 24, focusSpeed: 11.4, energyRegen: 4.6, slots: WEAPON_SLOTS, cost: 1900, description: 'Fast striker with excellent recharge.', unlockEpisode: 2 },
  striker_orange: { id: 'striker_orange', name: 'Striker Orange', sprite: 'playerShip2_orange', armor: 38, speed: 20, focusSpeed: 9.8, energyRegen: 4, slots: WEAPON_SLOTS, cost: 2100, description: 'Mid-game bruiser hull.', unlockEpisode: 2 },
  striker_red: { id: 'striker_red', name: 'Striker Red', sprite: 'playerShip2_red', armor: 35, speed: 21.5, focusSpeed: 10.2, energyRegen: 4.2, slots: WEAPON_SLOTS, cost: 2200, description: 'Redline striker with stable handling.', unlockEpisode: 2 },
  elite_blue: { id: 'elite_blue', name: 'Elite Blue', sprite: 'playerShip3_blue', armor: 44, speed: 23, focusSpeed: 11.2, energyRegen: 5.5, slots: WEAPON_SLOTS, cost: 6500, description: 'Endgame precision hull.', unlockEpisode: 5 },
  elite_green: { id: 'elite_green', name: 'Elite Green', sprite: 'playerShip3_green', armor: 40, speed: 25, focusSpeed: 12, energyRegen: 6.1, slots: WEAPON_SLOTS, cost: 7000, description: 'Speed-focused elite frame.', unlockEpisode: 5 },
  elite_orange: { id: 'elite_orange', name: 'Elite Orange', sprite: 'playerShip3_orange', armor: 48, speed: 21, focusSpeed: 10.3, energyRegen: 5.1, slots: WEAPON_SLOTS, cost: 7200, description: 'Siege platform with the best armor.', unlockEpisode: 5 },
  elite_red: { id: 'elite_red', name: 'Elite Red', sprite: 'playerShip3_red', armor: 46, speed: 22.2, focusSpeed: 10.8, energyRegen: 5.6, slots: WEAPON_SLOTS, cost: 7600, description: 'Endgame assault hull.', unlockEpisode: 5 },
}

export const GENERATORS: Record<string, GeneratorDef> = {
  basic_cell: { id: 'basic_cell', name: 'Basic Cell', maxEnergy: 50, regenRate: 3, cost: 0, description: 'Starter power cell.', unlockEpisode: 0 },
  ion_cell: { id: 'ion_cell', name: 'Ion Cell', maxEnergy: 60, regenRate: 3.5, cost: 250, description: 'Cheap ion-powered upgrade.', unlockEpisode: 0 },
  solar_array: { id: 'solar_array', name: 'Solar Array', maxEnergy: 75, regenRate: 4, cost: 500, description: 'Improved reserve and recharge.', unlockEpisode: 1 },
  thermal_core: { id: 'thermal_core', name: 'Thermal Core', maxEnergy: 85, regenRate: 4.5, cost: 900, description: 'Heat-recycling core with steady output.', unlockEpisode: 1 },
  fusion_core: { id: 'fusion_core', name: 'Fusion Core', maxEnergy: 100, regenRate: 5, cost: 1500, description: 'Strong all-round generator.', unlockEpisode: 2 },
  plasma_reactor: { id: 'plasma_reactor', name: 'Plasma Reactor', maxEnergy: 130, regenRate: 7, cost: 4000, description: 'Mid-game beam specialist core.', unlockEpisode: 3 },
  antimatter_cell: { id: 'antimatter_cell', name: 'Antimatter Cell', maxEnergy: 145, regenRate: 8, cost: 6000, description: 'Volatile but powerful energy source.', unlockEpisode: 4 },
  quantum_cell: { id: 'quantum_cell', name: 'Quantum Cell', maxEnergy: 160, regenRate: 9, cost: 8000, description: 'High-end rapid recharge generator.', unlockEpisode: 5 },
  zero_point_core: { id: 'zero_point_core', name: 'Zero-Point Core', maxEnergy: 180, regenRate: 10.5, cost: 11000, description: 'Taps vacuum energy for near-limitless power.', unlockEpisode: 6 },
  dark_matter_core: { id: 'dark_matter_core', name: 'Dark Matter Core', maxEnergy: 200, regenRate: 12, cost: 15000, description: 'Top-tier endgame power source.', unlockEpisode: 7 },
}

export const SHIELDS: Record<string, ShieldDef> = {
  none: { id: 'none', name: 'None', maxShield: 0, regenRate: 0, regenDelay: 999, cost: 0, description: 'No shield fitted.', unlockEpisode: 0 },
  light_barrier: { id: 'light_barrier', name: 'Light Barrier', maxShield: 20, regenRate: 2, regenDelay: 3, cost: 300, description: 'Basic regenerative shield.', unlockEpisode: 0 },
  pulse_barrier: { id: 'pulse_barrier', name: 'Pulse Barrier', maxShield: 15, regenRate: 3.5, regenDelay: 2, cost: 600, description: 'Low capacity but rapid pulse recharge.', unlockEpisode: 0 },
  standard_shield: { id: 'standard_shield', name: 'Standard Shield', maxShield: 40, regenRate: 3, regenDelay: 2.5, cost: 1000, description: 'Reliable all-round shield.', unlockEpisode: 1 },
  combat_shield: { id: 'combat_shield', name: 'Combat Shield', maxShield: 55, regenRate: 3.5, regenDelay: 2.2, cost: 1800, description: 'Balanced mid-tier combat barrier.', unlockEpisode: 1 },
  heavy_shield: { id: 'heavy_shield', name: 'Heavy Shield', maxShield: 70, regenRate: 4, regenDelay: 2, cost: 3000, description: 'Slow but sturdy barrier.', unlockEpisode: 2 },
  adaptive_shield: { id: 'adaptive_shield', name: 'Adaptive Shield', maxShield: 60, regenRate: 4.5, regenDelay: 1.8, cost: 4500, description: 'Self-tuning barrier that adapts to threats.', unlockEpisode: 3 },
  reflector_shield: { id: 'reflector_shield', name: 'Reflector Shield', maxShield: 50, regenRate: 5, regenDelay: 1.5, cost: 6000, description: 'Fast recharge, tuned for reflected energy.', unlockEpisode: 4 },
  nova_shield: { id: 'nova_shield', name: 'Nova Shield', maxShield: 85, regenRate: 6, regenDelay: 1.2, cost: 9000, description: 'High-capacity barrier with stellar recharge.', unlockEpisode: 5 },
  quantum_shield: { id: 'quantum_shield', name: 'Quantum Shield', maxShield: 100, regenRate: 8, regenDelay: 1, cost: 12000, description: 'Endgame shield envelope.', unlockEpisode: 6 },
}

export const WINGS: Record<string, WingDef> = {
  none: { id: 'none', name: 'None', speedBonus: 0, focusBonus: 0, cost: 0, description: 'No wings fitted.', unlockEpisode: 0 },
  training_fins: { id: 'training_fins', name: 'Training Fins', speedBonus: 0.03, focusBonus: 0.02, cost: 200, description: 'Small stabilizer fins for cadets.', unlockEpisode: 0 },
  scout_wings: { id: 'scout_wings', name: 'Scout Wings', speedBonus: 0.05, focusBonus: 0.03, cost: 400, description: 'Lightweight stabilizers for nimble pilots.', unlockEpisode: 0 },
  delta_wings: { id: 'delta_wings', name: 'Delta Wings', speedBonus: 0.07, focusBonus: 0.04, cost: 800, description: 'Swept delta profile for fast turns.', unlockEpisode: 1 },
  assault_wings: { id: 'assault_wings', name: 'Assault Wings', speedBonus: 0.08, focusBonus: 0.05, cost: 1200, description: 'Reinforced swept wings for combat maneuvers.', unlockEpisode: 1 },
  interceptor_wings: { id: 'interceptor_wings', name: 'Interceptor Wings', speedBonus: 0.12, focusBonus: 0.08, cost: 2800, description: 'High-aspect wings for superior agility.', unlockEpisode: 2 },
  viper_wings: { id: 'viper_wings', name: 'Viper Wings', speedBonus: 0.13, focusBonus: 0.10, cost: 3800, description: 'Razor-thin wings designed for tight dodging.', unlockEpisode: 3 },
  talon_wings: { id: 'talon_wings', name: 'Talon Wings', speedBonus: 0.14, focusBonus: 0.11, cost: 4500, description: 'Forward-swept talons with aggressive handling.', unlockEpisode: 3 },
  raptor_wings: { id: 'raptor_wings', name: 'Raptor Wings', speedBonus: 0.15, focusBonus: 0.12, cost: 5500, description: 'Variable-geometry wings tuned for rapid pursuit.', unlockEpisode: 4 },
  nova_wings: { id: 'nova_wings', name: 'Nova Wings', speedBonus: 0.18, focusBonus: 0.14, cost: 7500, description: 'High-performance wings with plasma edge trim.', unlockEpisode: 5 },
  phantom_wings: { id: 'phantom_wings', name: 'Phantom Wings', speedBonus: 0.20, focusBonus: 0.15, cost: 10000, description: 'Top-tier stealth wings with unmatched speed.', unlockEpisode: 6 },
}

export const ARMOR: Record<string, ArmorDef> = {
  none: { id: 'none', name: 'None', healthBonus: 0, cost: 0, description: 'No extra plating.', unlockEpisode: 0 },
  scout_plating: { id: 'scout_plating', name: 'Scout Plating', healthBonus: 4, cost: 150, description: 'Minimal plating for weight-conscious builds.', unlockEpisode: 0 },
  light_plating: { id: 'light_plating', name: 'Light Plating', healthBonus: 8, cost: 350, description: 'Thin alloy shell for basic protection.', unlockEpisode: 0 },
  ceramic_plates: { id: 'ceramic_plates', name: 'Ceramic Plates', healthBonus: 12, cost: 650, description: 'Heat-resistant ceramic inserts.', unlockEpisode: 1 },
  composite_armor: { id: 'composite_armor', name: 'Composite Armor', healthBonus: 16, cost: 1000, description: 'Layered composite with good weight ratio.', unlockEpisode: 1 },
  nano_weave: { id: 'nano_weave', name: 'Nano-Weave', healthBonus: 20, cost: 1700, description: 'Self-repairing nanomesh underlayer.', unlockEpisode: 2 },
  reactive_armor: { id: 'reactive_armor', name: 'Reactive Armor', healthBonus: 24, cost: 2500, description: 'Explosive-reactive tiles that deflect shrapnel.', unlockEpisode: 2 },
  titanium_hull: { id: 'titanium_hull', name: 'Titanium Hull', healthBonus: 30, cost: 3500, description: 'Full titanium wrap for serious protection.', unlockEpisode: 3 },
  ablative_shell: { id: 'ablative_shell', name: 'Ablative Shell', healthBonus: 35, cost: 5000, description: 'Heat-ablating shell for prolonged engagements.', unlockEpisode: 4 },
  phase_armor: { id: 'phase_armor', name: 'Phase Armor', healthBonus: 42, cost: 7000, description: 'Partially phased plating that dampens impacts.', unlockEpisode: 5 },
  quantum_mesh: { id: 'quantum_mesh', name: 'Quantum Mesh', healthBonus: 50, cost: 9500, description: 'Phase-shifted mesh that dissipates kinetic energy.', unlockEpisode: 6 },
}

export interface LoadoutStats {
  hull: ShipHull
  generator: GeneratorDef
  shield: ShieldDef
  wing: WingDef
  armor: ArmorDef
  maxHealth: number
  speed: number
  focusSpeed: number
  maxEnergy: number
  energyRegen: number
  maxShield: number
  shieldRegenRate: number
  shieldRegenDelay: number
}

function blankWeapons(): Record<WeaponSlot, string | null> {
  return {
    front: 'pulse_cannon',
    rear: 'rear_pulse',
    sidekickL: null,
    sidekickR: null,
    special: 'mega_bomb',
  }
}

export function createDefaultLoadout(): PlayerLoadout {
  return {
    hull: 'cadet_blue',
    generator: 'basic_cell',
    shield: 'none',
    ownedHulls: ['cadet_blue'],
    ownedGenerators: ['basic_cell'],
    ownedShields: ['none'],
    wing: 'none',
    armor: 'none',
    ownedWings: ['none'],
    ownedArmor: ['none'],
    weapons: blankWeapons(),
    ownedWeapons: ['pulse_cannon', 'rear_pulse', 'mega_bomb', 'homing_missiles'],
    weaponLevels: {
      pulse_cannon: 0,
      rear_pulse: 0,
      mega_bomb: 0,
      homing_missiles: 0,
    },
    specialAmmo: {
      mega_bomb: 3,
      homing_missiles: 10,
    },
    specialInventory: ['mega_bomb', 'homing_missiles'],
    activeSpecial: 'mega_bomb',
    knownSynergies: [],
  }
}

export function createNewCampaign(slot: number, difficulty: Difficulty, playerName = 'Kai Reeves'): CampaignState {
  return {
    saveSlot: slot,
    playerName,
    currentEpisode: 0,
    currentLevel: 'mercury_1',
    credits: 250,
    score: 0,
    lives: 3,
    difficulty,
    inventory: createDefaultLoadout(),
    secretsFound: [],
    dataLog: [],
    completedLevels: [],
    knownChallenges: [],
    weaponMastery: {},
    bossUpgrades: [],
    lastDebrief: null,
  }
}

export function normalizeLoadout(loadout: PlayerLoadout): PlayerLoadout {
  const next = createDefaultLoadout()
  next.hull = loadout.hull || next.hull
  next.generator = loadout.generator || next.generator
  next.shield = loadout.shield || next.shield
  next.ownedHulls = Array.from(new Set([...next.ownedHulls, ...(loadout.ownedHulls ?? []), next.hull]))
  next.ownedGenerators = Array.from(new Set([...next.ownedGenerators, ...(loadout.ownedGenerators ?? []), next.generator]))
  next.ownedShields = Array.from(new Set([...next.ownedShields, ...(loadout.ownedShields ?? []), next.shield]))
  next.wing = loadout.wing || next.wing
  next.armor = loadout.armor || next.armor
  next.ownedWings = Array.from(new Set([...next.ownedWings, ...(loadout.ownedWings ?? []), next.wing]))
  next.ownedArmor = Array.from(new Set([...next.ownedArmor, ...(loadout.ownedArmor ?? []), next.armor]))
  next.weapons = { ...next.weapons, ...loadout.weapons }
  next.ownedWeapons = Array.from(new Set([...next.ownedWeapons, ...(loadout.ownedWeapons ?? [])]))
  next.weaponLevels = { ...next.weaponLevels, ...(loadout.weaponLevels ?? {}) }
  next.specialAmmo = { ...next.specialAmmo, ...(loadout.specialAmmo ?? {}) }
  next.specialInventory = Array.from(new Set([...next.specialInventory, ...(loadout.specialInventory ?? [])]))
  next.activeSpecial = loadout.activeSpecial || next.activeSpecial
  next.knownSynergies = Array.from(new Set([...(loadout.knownSynergies ?? [])]))
  return next
}

export function buildLoadoutStats(loadout: PlayerLoadout): LoadoutStats {
  const hull = HULLS[loadout.hull] ?? HULLS.cadet_blue
  const generator = GENERATORS[loadout.generator] ?? GENERATORS.basic_cell
  const shield = SHIELDS[loadout.shield] ?? SHIELDS.none
  const wing = WINGS[loadout.wing] ?? WINGS.none
  const armor = ARMOR[loadout.armor] ?? ARMOR.none

  return {
    hull,
    generator,
    shield,
    wing,
    armor,
    maxHealth: hull.armor + armor.healthBonus,
    speed: hull.speed * (1 + wing.speedBonus),
    focusSpeed: hull.focusSpeed * (1 + wing.focusBonus),
    maxEnergy: generator.maxEnergy,
    energyRegen: hull.energyRegen + generator.regenRate,
    maxShield: shield.maxShield,
    shieldRegenRate: shield.regenRate,
    shieldRegenDelay: shield.regenDelay,
  }
}

function readBlob(): SaveBlob {
  if (typeof window === 'undefined') {
    return { version: 1, slots: [null, null, null] }
  }
  const raw = window.localStorage.getItem(SAVE_KEY)
  if (!raw) return { version: 1, slots: [null, null, null] }

  try {
    const parsed = JSON.parse(raw) as SaveBlob
    if (parsed.version !== 1 || !Array.isArray(parsed.slots)) {
      return { version: 1, slots: [null, null, null] }
    }
    return {
      version: 1,
      slots: [0, 1, 2].map((index) => parsed.slots[index] ?? null),
    }
  } catch {
    return { version: 1, slots: [null, null, null] }
  }
}

function writeBlob(blob: SaveBlob): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(blob))
}

export function listSaveSlots(): Array<CampaignState | null> {
  return readBlob().slots
}

export function loadCampaign(slot: number): CampaignState | null {
  const save = readBlob().slots[slot] ?? null
  if (!save) return null
  return {
    ...save,
    inventory: normalizeLoadout(save.inventory),
    weaponMastery: save.weaponMastery ?? {},
    bossUpgrades: save.bossUpgrades ?? [],
  }
}

export function saveCampaign(state: CampaignState): void {
  const blob = readBlob()
  blob.slots[state.saveSlot] = {
    ...state,
    inventory: normalizeLoadout(state.inventory),
  }
  writeBlob(blob)
}

export function cycleSpecial(loadout: PlayerLoadout): string | null {
  if (loadout.specialInventory.length === 0) return null
  const current = loadout.activeSpecial
  const index = current ? loadout.specialInventory.indexOf(current) : -1
  const nextIndex = (index + 1 + loadout.specialInventory.length) % loadout.specialInventory.length
  loadout.activeSpecial = loadout.specialInventory[nextIndex] ?? null
  loadout.weapons.special = loadout.activeSpecial
  return loadout.activeSpecial
}

export function ensureWeaponOwnership(loadout: PlayerLoadout, weaponId: string): void {
  if (!loadout.ownedWeapons.includes(weaponId)) {
    loadout.ownedWeapons.push(weaponId)
  }
  if (loadout.weaponLevels[weaponId] === undefined) {
    loadout.weaponLevels[weaponId] = 0
  }
}
