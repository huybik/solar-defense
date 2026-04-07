import { ARMOR, GENERATORS, HULLS, SHIELDS, WINGS, ensureWeaponOwnership } from './inventory'
import type { CampaignState, PlayerLoadout, WeaponSlot } from '../types'
import { SIDEKICK_SLOTS } from '../types'
import { WEAPON_DEFS, WEAPONS_BY_SLOT } from '../data/weapons'

export type ShopTab = 'ship' | 'front' | 'rear' | 'sidekicks' | 'special' | 'shield' | 'generator' | 'wing' | 'armor'

export interface ShopEntry {
  id: string
  label: string
  description: string
  cost: number
  owned: boolean
  equipped: boolean
  level?: number
  maxLevel?: number
  detail: string
  slot?: WeaponSlot
  sprite?: string
}

export interface ShopResult {
  changed: boolean
  message: string
}

export const SHOP_TABS: ShopTab[] = ['ship', 'front', 'rear', 'sidekicks', 'special', 'shield', 'generator', 'wing', 'armor']

const SHIELD_SPRITES: Record<string, string> = {
  none: 'shield1',
  light_barrier: 'shield1',
  pulse_barrier: 'shield_bronze',
  standard_shield: 'shield2',
  combat_shield: 'powerupBlue_shield',
  heavy_shield: 'shield3',
  adaptive_shield: 'powerupGreen_shield',
  reflector_shield: 'shield_silver',
  nova_shield: 'powerupRed_shield',
  quantum_shield: 'shield_gold',
}

const GENERATOR_SPRITES: Record<string, string> = {
  basic_cell: 'engine1',
  ion_cell: 'spaceRocketParts_015',
  solar_array: 'engine2',
  thermal_core: 'spaceRocketParts_012',
  fusion_core: 'engine3',
  plasma_reactor: 'engine4',
  antimatter_cell: 'spaceRocketParts_013',
  quantum_cell: 'engine5',
  zero_point_core: 'spaceBuilding_003',
  dark_matter_core: 'engine5',
}

const WING_SPRITES: Record<string, string> = {
  none: 'wingBlue_0',
  training_fins: 'wingGreen_0',
  scout_wings: 'wingBlue_0',
  delta_wings: 'wingYellow_1',
  assault_wings: 'wingRed_2',
  interceptor_wings: 'wingGreen_3',
  viper_wings: 'wingRed_4',
  talon_wings: 'wingGreen_5',
  raptor_wings: 'wingYellow_5',
  nova_wings: 'wingYellow_7',
  phantom_wings: 'wingBlue_7',
}

const ARMOR_SPRITES: Record<string, string> = {
  none: 'spaceParts_054',
  scout_plating: 'spaceParts_012',
  light_plating: 'spaceParts_036',
  ceramic_plates: 'spaceParts_097',
  composite_armor: 'spaceParts_042',
  nano_weave: 'spaceParts_098',
  reactive_armor: 'spaceParts_014',
  titanium_hull: 'spaceParts_013',
  ablative_shell: 'spaceParts_041',
  phase_armor: 'spaceParts_053',
  quantum_mesh: 'spaceParts_055',
}

function isSidekickSlot(slot: WeaponSlot | null | undefined): slot is 'sidekickL' | 'sidekickR' {
  return slot === 'sidekickL' || slot === 'sidekickR'
}

function resolveSidekickSlot(loadout: PlayerLoadout, slot: WeaponSlot | null | undefined): 'sidekickL' | 'sidekickR' {
  if (isSidekickSlot(slot)) return slot
  if (!loadout.weapons.sidekickL) return 'sidekickL'
  if (!loadout.weapons.sidekickR) return 'sidekickR'
  return 'sidekickL'
}

function sidekickLabel(slot: 'sidekickL' | 'sidekickR'): string {
  return slot === 'sidekickL' ? 'left wing' : 'right wing'
}

export function getShopEntries(state: CampaignState, tab: ShopTab): ShopEntry[] {
  switch (tab) {
    case 'ship':
      return Object.values(HULLS)
        .filter((hull) => (hull.unlockEpisode ?? 0) <= state.currentEpisode || state.inventory.ownedHulls.includes(hull.id))
        .map((hull) => ({
          id: hull.id,
          label: hull.name,
          description: hull.description,
          cost: hull.cost,
          owned: state.inventory.ownedHulls.includes(hull.id),
          equipped: hull.id === state.inventory.hull,
          detail: `ARM ${hull.armor} SPD ${hull.speed.toFixed(1)} ENG ${hull.energyRegen.toFixed(1)}`,
          sprite: hull.sprite,
        }))
    case 'front':
      return availableWeapons(state, 'front').map((weapon) => weaponEntry(state.inventory, weapon.id, weapon.slot))
    case 'rear':
      return availableWeapons(state, 'rear').map((weapon) => weaponEntry(state.inventory, weapon.id, weapon.slot))
    case 'sidekicks':
      return availableWeapons(state, 'sidekicks').map((weapon) => weaponEntry(state.inventory, weapon.id, weapon.slot))
    case 'special':
      return availableWeapons(state, 'special').map((weapon) => weaponEntry(state.inventory, weapon.id, weapon.slot))
    case 'shield':
      return Object.values(SHIELDS)
        .filter((shield) => (shield.unlockEpisode ?? 0) <= state.currentEpisode || state.inventory.ownedShields.includes(shield.id))
        .map((shield) => ({
          id: shield.id,
          label: shield.name,
          description: shield.description,
          cost: shield.cost,
          owned: state.inventory.ownedShields.includes(shield.id),
          equipped: shield.id === state.inventory.shield,
          detail: `SHD ${shield.maxShield} REGEN ${shield.regenRate}/s DELAY ${shield.regenDelay}s`,
          sprite: SHIELD_SPRITES[shield.id],
        }))
    case 'generator':
      return Object.values(GENERATORS)
        .filter((generator) => (generator.unlockEpisode ?? 0) <= state.currentEpisode || state.inventory.ownedGenerators.includes(generator.id))
        .map((generator) => ({
          id: generator.id,
          label: generator.name,
          description: generator.description,
          cost: generator.cost,
          owned: state.inventory.ownedGenerators.includes(generator.id),
          equipped: generator.id === state.inventory.generator,
          detail: `ENG ${generator.maxEnergy} REGEN ${generator.regenRate}/s`,
          sprite: GENERATOR_SPRITES[generator.id],
        }))
    case 'wing':
      return Object.values(WINGS)
        .filter((wing) => (wing.unlockEpisode ?? 0) <= state.currentEpisode || state.inventory.ownedWings.includes(wing.id))
        .map((wing) => ({
          id: wing.id,
          label: wing.name,
          description: wing.description,
          cost: wing.cost,
          owned: state.inventory.ownedWings.includes(wing.id),
          equipped: wing.id === state.inventory.wing,
          detail: `SPD +${Math.round(wing.speedBonus * 100)}% FOC +${Math.round(wing.focusBonus * 100)}%`,
          sprite: WING_SPRITES[wing.id],
        }))
    case 'armor':
      return Object.values(ARMOR)
        .filter((armor) => (armor.unlockEpisode ?? 0) <= state.currentEpisode || state.inventory.ownedArmor.includes(armor.id))
        .map((armor) => ({
          id: armor.id,
          label: armor.name,
          description: armor.description,
          cost: armor.cost,
          owned: state.inventory.ownedArmor.includes(armor.id),
          equipped: armor.id === state.inventory.armor,
          detail: `HP +${armor.healthBonus}`,
          sprite: ARMOR_SPRITES[armor.id],
        }))
  }
}

function weaponEntry(loadout: PlayerLoadout, weaponId: string, slot: WeaponSlot): ShopEntry {
  const weapon = WEAPON_DEFS[weaponId]
  const owned = loadout.ownedWeapons.includes(weaponId)
  const currentLevel = loadout.weaponLevels[weaponId] ?? 0
  const equippedSidekick = isSidekickSlot(slot)
    ? SIDEKICK_SLOTS.some((sidekickSlot) => loadout.weapons[sidekickSlot] === weaponId)
    : false
  const equipped =
    loadout.weapons[slot] === weaponId ||
    equippedSidekick ||
    loadout.activeSpecial === weaponId

  return {
    id: weapon.id,
    label: weapon.name,
    description: weapon.description,
    cost: weapon.baseCost,
    owned,
    equipped,
    level: currentLevel + 1,
    maxLevel: weapon.maxLevel,
    detail: `${weapon.projectileType.toUpperCase()} L${currentLevel + 1}/${weapon.maxLevel}`,
    slot,
    sprite: weapon.projectileSprite,
  }
}

function availableWeapons(state: CampaignState, tab: Extract<ShopTab, 'front' | 'rear' | 'sidekicks' | 'special'>) {
  const slot = tab === 'sidekicks' ? 'sidekickL' : tab
  return WEAPONS_BY_SLOT[slot].filter((weapon) => weapon.unlockEpisode <= state.currentEpisode || state.inventory.ownedWeapons.includes(weapon.id))
}

export function buyEntry(state: CampaignState, tab: ShopTab, id: string, slot: WeaponSlot | null = null): ShopResult {
  switch (tab) {
    case 'ship':
      return buyHull(state, id)
    case 'shield':
      return buyShield(state, id)
    case 'generator':
      return buyGenerator(state, id)
    case 'wing':
      return buyWing(state, id)
    case 'armor':
      return buyArmor(state, id)
    case 'front':
    case 'rear':
    case 'sidekicks':
    case 'special':
      return buyWeapon(state, id, slot ?? inferredSlot(tab))
  }
}

export function equipEntry(state: CampaignState, tab: ShopTab, id: string, slot: WeaponSlot | null = null): ShopResult {
  switch (tab) {
    case 'ship':
      if (!HULLS[id]) return { changed: false, message: 'Unknown hull.' }
      if (!state.inventory.ownedHulls.includes(id)) return { changed: false, message: 'Hull not owned.' }
      state.inventory.hull = id
      return { changed: true, message: `${HULLS[id].name} equipped.` }
    case 'shield':
      if (!SHIELDS[id]) return { changed: false, message: 'Unknown shield.' }
      if (!state.inventory.ownedShields.includes(id)) return { changed: false, message: 'Shield not owned.' }
      state.inventory.shield = id
      return { changed: true, message: `${SHIELDS[id].name} equipped.` }
    case 'generator':
      if (!GENERATORS[id]) return { changed: false, message: 'Unknown generator.' }
      if (!state.inventory.ownedGenerators.includes(id)) return { changed: false, message: 'Generator not owned.' }
      state.inventory.generator = id
      return { changed: true, message: `${GENERATORS[id].name} equipped.` }
    case 'wing':
      if (!WINGS[id]) return { changed: false, message: 'Unknown wing.' }
      if (!state.inventory.ownedWings.includes(id)) return { changed: false, message: 'Wing not owned.' }
      state.inventory.wing = id
      return { changed: true, message: `${WINGS[id].name} equipped.` }
    case 'armor':
      if (!ARMOR[id]) return { changed: false, message: 'Unknown armor.' }
      if (!state.inventory.ownedArmor.includes(id)) return { changed: false, message: 'Armor not owned.' }
      state.inventory.armor = id
      return { changed: true, message: `${ARMOR[id].name} equipped.` }
    case 'special':
      if (!state.inventory.specialInventory.includes(id)) return { changed: false, message: 'Special not owned.' }
      state.inventory.activeSpecial = id
      state.inventory.weapons.special = id
      return { changed: true, message: `${WEAPON_DEFS[id].name} armed.` }
    case 'sidekicks': {
      if (!state.inventory.ownedWeapons.includes(id)) return { changed: false, message: 'Sidekick not owned.' }
      const target = resolveSidekickSlot(state.inventory, slot)
      state.inventory.weapons[target] = id
      return { changed: true, message: `${WEAPON_DEFS[id].name} deployed on the ${sidekickLabel(target)}.` }
    }
    default: {
      const target = slot ?? inferredSlot(tab)
      state.inventory.weapons[target] = id
      return { changed: true, message: `${WEAPON_DEFS[id].name} equipped.` }
    }
  }
}

export function upgradeWeapon(state: CampaignState, weaponId: string): ShopResult {
  const weapon = WEAPON_DEFS[weaponId]
  if (!weapon) return { changed: false, message: 'Unknown weapon.' }
  ensureWeaponOwnership(state.inventory, weaponId)

  const level = state.inventory.weaponLevels[weaponId] ?? 0
  if (level >= weapon.maxLevel - 1) {
    return { changed: false, message: `${weapon.name} is already maxed.` }
  }

  const cost = weaponUpgradeCost(weaponId, level + 1)
  if (state.credits < cost) {
    return { changed: false, message: 'Not enough credits.' }
  }

  state.credits -= cost
  state.inventory.weaponLevels[weaponId] = level + 1
  return { changed: true, message: `${weapon.name} upgraded to level ${level + 2}.` }
}

export function buyAmmo(state: CampaignState, weaponId: string): ShopResult {
  const weapon = WEAPON_DEFS[weaponId]
  if (!weapon || weapon.slot !== 'special') return { changed: false, message: 'Unknown special weapon.' }
  ensureWeaponOwnership(state.inventory, weaponId)

  const cost = Math.max(100, Math.round(weapon.baseCost * 0.3))
  if (state.credits < cost) return { changed: false, message: 'Not enough credits.' }

  state.credits -= cost
  state.inventory.specialAmmo[weaponId] = (state.inventory.specialAmmo[weaponId] ?? 0) + (weapon.ammoBundle ?? 5)
  if (!state.inventory.specialInventory.includes(weaponId)) {
    state.inventory.specialInventory.push(weaponId)
  }
  return { changed: true, message: `${weapon.name} ammo restocked.` }
}

export function sellEquipped(state: CampaignState, slot: WeaponSlot): ShopResult {
  const currentId = slot === 'special' ? state.inventory.activeSpecial : state.inventory.weapons[slot]
  if (!currentId) return { changed: false, message: 'Nothing equipped in that slot.' }
  const weapon = WEAPON_DEFS[currentId]
  if (!weapon) return { changed: false, message: 'Unknown item.' }
  if (weapon.baseCost === 0) return { changed: false, message: 'Starter gear cannot be sold.' }

  state.credits += Math.round(weapon.baseCost * 0.75)
  state.inventory.ownedWeapons = state.inventory.ownedWeapons.filter((id) => id !== currentId)
  delete state.inventory.weaponLevels[currentId]
  if (slot === 'special') {
    state.inventory.specialInventory = state.inventory.specialInventory.filter((id) => id !== currentId)
    delete state.inventory.specialAmmo[currentId]
    state.inventory.activeSpecial = state.inventory.specialInventory[0] ?? null
    state.inventory.weapons.special = state.inventory.activeSpecial
  } else {
    for (const weaponSlot of Object.keys(state.inventory.weapons) as WeaponSlot[]) {
      if (state.inventory.weapons[weaponSlot] === currentId) {
        state.inventory.weapons[weaponSlot] = null
      }
    }
  }
  return { changed: true, message: `${weapon.name} sold.` }
}

export function weaponUpgradeCost(weaponId: string, nextLevel: number): number {
  const weapon = WEAPON_DEFS[weaponId]
  return Math.round(weapon.baseCost * 0.35 + nextLevel * 85)
}

function buyHull(state: CampaignState, id: string): ShopResult {
  const hull = HULLS[id]
  if (!hull) return { changed: false, message: 'Unknown hull.' }
  if (state.inventory.ownedHulls.includes(id)) {
    state.inventory.hull = id
    return { changed: true, message: `${hull.name} equipped.` }
  }
  if ((hull.unlockEpisode ?? 0) > state.currentEpisode) return { changed: false, message: 'Not available yet.' }
  if (state.credits < hull.cost) return { changed: false, message: 'Not enough credits.' }
  state.credits -= hull.cost
  state.inventory.ownedHulls.push(id)
  state.inventory.hull = id
  return { changed: true, message: `${hull.name} purchased and equipped.` }
}

function buyShield(state: CampaignState, id: string): ShopResult {
  const shield = SHIELDS[id]
  if (!shield) return { changed: false, message: 'Unknown shield.' }
  if (state.inventory.ownedShields.includes(id)) {
    state.inventory.shield = id
    return { changed: true, message: `${shield.name} equipped.` }
  }
  if ((shield.unlockEpisode ?? 0) > state.currentEpisode) return { changed: false, message: 'Not available yet.' }
  if (state.credits < shield.cost) return { changed: false, message: 'Not enough credits.' }
  state.credits -= shield.cost
  state.inventory.ownedShields.push(id)
  state.inventory.shield = id
  return { changed: true, message: `${shield.name} equipped.` }
}

function buyGenerator(state: CampaignState, id: string): ShopResult {
  const generator = GENERATORS[id]
  if (!generator) return { changed: false, message: 'Unknown generator.' }
  if (state.inventory.ownedGenerators.includes(id)) {
    state.inventory.generator = id
    return { changed: true, message: `${generator.name} equipped.` }
  }
  if ((generator.unlockEpisode ?? 0) > state.currentEpisode) return { changed: false, message: 'Not available yet.' }
  if (state.credits < generator.cost) return { changed: false, message: 'Not enough credits.' }
  state.credits -= generator.cost
  state.inventory.ownedGenerators.push(id)
  state.inventory.generator = id
  return { changed: true, message: `${generator.name} equipped.` }
}

function buyWeapon(state: CampaignState, id: string, slot: WeaponSlot): ShopResult {
  const weapon = WEAPON_DEFS[id]
  if (!weapon) return { changed: false, message: 'Unknown weapon.' }
  if (!state.inventory.ownedWeapons.includes(id) && weapon.unlockEpisode > state.currentEpisode) {
    return { changed: false, message: 'That weapon is not stocked yet.' }
  }
  if (state.credits < weapon.baseCost) return { changed: false, message: 'Not enough credits.' }

  state.credits -= weapon.baseCost
  ensureWeaponOwnership(state.inventory, id)

  if (weapon.slot === 'special') {
    if (!state.inventory.specialInventory.includes(id)) {
      state.inventory.specialInventory.push(id)
    }
    state.inventory.specialAmmo[id] = (state.inventory.specialAmmo[id] ?? 0) + (weapon.ammoBundle ?? 5)
    state.inventory.activeSpecial = id
    state.inventory.weapons.special = id
  } else {
    const target = weapon.slot === 'sidekickL' ? resolveSidekickSlot(state.inventory, slot) : slot
    state.inventory.weapons[target] = id
  }

  return { changed: true, message: `${weapon.name} purchased.` }
}

function buyWing(state: CampaignState, id: string): ShopResult {
  const wing = WINGS[id]
  if (!wing) return { changed: false, message: 'Unknown wing.' }
  if (state.inventory.ownedWings.includes(id)) {
    state.inventory.wing = id
    return { changed: true, message: `${wing.name} equipped.` }
  }
  if ((wing.unlockEpisode ?? 0) > state.currentEpisode) return { changed: false, message: 'Not available yet.' }
  if (state.credits < wing.cost) return { changed: false, message: 'Not enough credits.' }
  state.credits -= wing.cost
  state.inventory.ownedWings.push(id)
  state.inventory.wing = id
  return { changed: true, message: `${wing.name} purchased and equipped.` }
}

function buyArmor(state: CampaignState, id: string): ShopResult {
  const armor = ARMOR[id]
  if (!armor) return { changed: false, message: 'Unknown armor.' }
  if (state.inventory.ownedArmor.includes(id)) {
    state.inventory.armor = id
    return { changed: true, message: `${armor.name} equipped.` }
  }
  if ((armor.unlockEpisode ?? 0) > state.currentEpisode) return { changed: false, message: 'Not available yet.' }
  if (state.credits < armor.cost) return { changed: false, message: 'Not enough credits.' }
  state.credits -= armor.cost
  state.inventory.ownedArmor.push(id)
  state.inventory.armor = id
  return { changed: true, message: `${armor.name} purchased and equipped.` }
}

function inferredSlot(tab: ShopTab): WeaponSlot {
  switch (tab) {
    case 'front':
      return 'front'
    case 'rear':
      return 'rear'
    case 'special':
      return 'special'
    case 'sidekicks':
      return 'sidekickL'
    default:
      return 'front'
  }
}
