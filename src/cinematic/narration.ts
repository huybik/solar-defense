export interface NarrationBeat {
  planetIndex: number;
  text: string;
  holdMs: number;
}

export const CINEMATIC_SCRIPT: readonly NarrationBeat[] = [
  {
    planetIndex: 7,
    text: "A rift tore open beyond Neptune. The Void Swarm poured through — world after world fell silent as the darkness swept inward.",
    holdMs: 7000,
  },
  {
    planetIndex: 2,
    text: "They harvested everything in their path, feeding it toward the Sun. Nothing we threw at them held for long.",
    holdMs: 6000,
  },
  {
    planetIndex: -1,
    text: "Now we see why. The Dark Ring — a crown of stolen fire around our star. The Forgelord's gate. Destroy it, and the Swarm dies. This is the only road.",
    holdMs: 8000,
  },
];

export const CAMERA_FLY_MS = 2000;
