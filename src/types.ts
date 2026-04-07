import type { MultiplayerPeer } from '@learnfun/game-sdk'
import type { Group, Mesh, Texture } from 'three/webgpu'

export type Phase = 'briefing' | 'explore' | 'puzzle' | 'warp' | 'end' | 'arcade'

export const INTERACTIVE_PHASES = new Set<Phase>(['briefing', 'explore', 'puzzle'])

export type PlanetVisualKind =
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'

export interface MissionChoice {
  id: string
  label: string
}

export interface HotspotConfig {
  id: string
  label: string
  clue: string
  lat: number
  lon: number
  color: string
}

export interface PlanetMission {
  id: string
  name: string
  subtitle: string
  prompt: string
  question: string
  answer: string
  celebration: string
  choices: MissionChoice[]
  hotspots: HotspotConfig[]
  visualKind: PlanetVisualKind
  radius: number
  orbitRadius: number
  orbitSpeed: number
  rotationSpeed: number
  focusDistance: number
  atmosphereColor: string
  glowColor: string
  ringColor?: string
  hasRings?: boolean
  moonCount?: number
  moonScale?: number
  moonOrbitRadius?: number
  axialTilt?: number
}

export interface MissionOverride {
  planet?: string
  name?: string
  subtitle?: string
  prompt?: string
  clues?: string[]
  question?: string
  options?: string[]
  answer?: string
  celebration?: string
}

export interface SolarDefenseInitData {
  missions?: MissionOverride[] | Record<string, MissionOverride>
}

export interface SolarState {
  phase: Phase
  planetIndex: number
  score: number
  streak: number
  scannedHotspots: string[]
  answered: boolean
  selectedChoice: string | null
  isFollower: boolean
  peers: MultiplayerPeer[]
}

export interface PlanetVisual {
  mission: PlanetMission
  pivot: Group
  anchor: Group
  bodyGroup: Group
  surface: Mesh
  atmosphere?: Mesh
  cloudLayer?: Mesh
  ring?: Mesh
  moonPivots: Group[]
  hotspots: Map<string, Mesh>
}

export interface LoadedTextures {
  earthDay: Texture | null
  earthNormal: Texture | null
  earthLights: Texture | null
  earthClouds: Texture | null
  earthSpecular: Texture | null
  moon: Texture | null
  mercuryDiffuse: Texture | null
  venusDiffuse: Texture | null
  marsDiffuse: Texture | null
  jupiterDiffuse: Texture | null
  saturnDiffuse: Texture | null
  uranusDiffuse: Texture | null
  neptuneDiffuse: Texture | null
}

export function normalizeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
