# Solar Defense — Cinematic Introduction (Story Mode)

## Concept

Inspired by The Lord of the Rings, but at solar system scale. A dark entity called **The Forgelord** has created a **Dark Ring** around the Sun — a massive parasitic structure that channels solar energy to open a rift into the Void. From this ring, the **Void Swarm** pours into our solar system, consuming world after world from the outer reaches inward. We are the last defense pilots who must fight our way from Neptune to the Sun and destroy the Dark Ring to end the invasion once and for all.

This cinematic replaces the current "Now Approaching [Planet]" briefing screen in standalone mode. It plays once on first boot, flying the camera from planet to planet (Neptune → Sun) with narrated voice-over, establishing the stakes before the player begins the lesson or arcade campaign.

---

## Narrative Script

Three beats, ~25 seconds total. Camera flies Neptune → Earth → Sun with one continuous invasion story.

### Beat 1 — NEPTUNE (opening)
> *"A rift tore open beyond Neptune. The Void Swarm poured through — world after world fell silent as the darkness swept inward."*

### Beat 2 — EARTH
> *"They harvested everything in their path, feeding it toward the Sun. Nothing we threw at them held for long."*

### Beat 3 — THE SUN (finale)
> *"Now we see why. The Dark Ring — a crown of stolen fire around our star. The Forgelord's gate. Destroy it, and the Swarm dies. This is the only road."*

After the cinematic ends → straight to arcade mode (standalone skips the observatory route entirely).

---

## Technical Implementation Plan

### New Files

| File | Purpose |
|------|---------|
| `src/cinematic/cinematic.ts` | Main cinematic controller — orchestrates camera, narration, UI, timing |
| `src/cinematic/narration.ts` | Narration script data (text per planet, timing, camera hints) |
| `src/cinematic/voice.ts` | Web Speech API voice-over engine (SpeechSynthesis with fallback to text-only) |
| `src/cinematic/ui.ts` | Cinematic overlay DOM — narration text box, skip button, progress dots |
| `src/cinematic/style.css` | Cinematic-specific styles (letterbox bars, text animations, fade transitions) |

### Modified Files

| File | Change |
|------|--------|
| `src/lesson/runtime.ts` | Detect standalone mode + first boot → launch cinematic before entering planet 0. Add `playCinematic()` call in init flow. After cinematic ends, resume normal `enterPlanet(0)` |
| `src/scene/camera.ts` | Add `flyTo(position, target, duration, easing)` method for cinematic camera paths (more flexible than current `focusPlanet` which is planet-index-bound). Add optional `onComplete` callback |
| `src/types.ts` | Add `'cinematic'` to the phase union type if needed for UI gating |
| `src/style.css` | Import cinematic styles |

### Architecture

```
┌─────────────────────────────────────┐
│         CinematicController         │
│  (src/cinematic/cinematic.ts)       │
│                                     │
│  - Receives SceneManager + Camera   │
│  - Steps through planet sequence    │
│  - Coordinates voice + UI + camera  │
│  - Emits "complete" when done       │
└───────┬─────────┬─────────┬─────────┘
        │         │         │
   ┌────▼───┐ ┌──▼────┐ ┌──▼──────┐
   │ Voice  │ │  UI   │ │ Camera  │
   │ Engine │ │Overlay│ │ FlyTo   │
   └────────┘ └───────┘ └─────────┘
```

### Detailed Steps

#### Step 1: Narration Data (`src/cinematic/narration.ts`)

```typescript
export interface NarrationBeat {
  planetIndex: number;      // -1 for Sun
  text: string;             // Voice-over text
  duration: number;         // Ms to hold (fallback if TTS unavailable)
}

export const CINEMATIC_SCRIPT: NarrationBeat[] = [
  { planetIndex: 7, text: "It came from beyond the edge of light...", duration: 8000 },
  { planetIndex: 6, text: "World after world went silent...", duration: 6000 },
  { planetIndex: 5, text: "The Swarm wasn't just destroying...", duration: 7000 },
  { planetIndex: 4, text: "Nothing could hold them...", duration: 6000 },
  { planetIndex: 3, text: "On Mars, a handful of miners...", duration: 6000 },
  { planetIndex: 2, text: "Enough to send one ship...", duration: 5000 },
  { planetIndex: 1, text: "Because our scouts found the source...", duration: 5000 },
  { planetIndex: 0, text: "And from Mercury's scorched horizon...", duration: 4000 },
  { planetIndex: -1, text: "The Dark Ring. A crown of stolen fire...", duration: 8000 },
];
```

#### Step 2: Voice Engine (`src/cinematic/voice.ts`)

- Uses `window.speechSynthesis` (Web Speech API) — zero dependencies, works in all modern browsers
- Selects a deep/dramatic English voice if available
- Methods: `speak(text): Promise<void>`, `stop()`, `isSupported(): boolean`
- Falls back gracefully to text-only with timed auto-advance if TTS unavailable
- Speech rate ~0.9 for dramatic pacing

#### Step 3: Cinematic UI (`src/cinematic/ui.ts` + `style.css`)

- **Letterbox bars**: Top and bottom black bars (cinematic aspect ratio feel)
- **Narration text**: Bottom-center, fade-in word by word or line by line, semi-transparent dark backdrop
- **Skip button**: Top-right corner, "Skip ▸" — fades in after 2 seconds
- **Progress dots**: Small dots at bottom showing which planet step we're on
- **Final call-to-action**: After Sun narration, "BEGIN YOUR MISSION" button fades in
- All elements use CSS transitions/animations (opacity, transform) for smooth feel

#### Step 4: Camera Extensions (`src/scene/camera.ts`)

Add a `flyTo` method alongside existing `focusPlanet`:

```typescript
flyTo(
  toPosition: Vector3,
  toTarget: Vector3,
  duration: number,
  onComplete?: () => void
): void
```

This is more general than `focusPlanet` — it doesn't need a planet index, just raw positions. The cinematic controller computes positions from planet world transforms.

Also add support for a slow cinematic orbit (slower than the current 0.25 autoRotate speed) — something like 0.08 for gentle drift during narration.

#### Step 5: Cinematic Controller (`src/cinematic/cinematic.ts`)

```typescript
export class CinematicController {
  constructor(
    private scene: SceneManager,
    private camera: CameraController,
    private container: HTMLElement
  ) {}

  async play(): Promise<void> {
    // 1. Build overlay UI (letterbox, text area, skip button)
    // 2. For each step in CINEMATIC_SCRIPT:
    //    a. Fly camera to planet (using flyTo or focusPlanet)
    //    b. Show planet name card (fade in/out)
    //    c. Start voice-over (or text display with timer)
    //    d. Wait for voice/timer to complete
    //    e. Brief pause, then next
    // 3. On Sun step: dramatic push-in, final narration
    // 4. Show "BEGIN YOUR MISSION" button
    // 5. On click or skip: clean up overlay, resolve promise
  }

  skip(): void {
    // Stop voice, clean up UI, resolve play() promise immediately
  }
}
```

The `play()` method returns a Promise so the runtime can simply `await` it.

#### Step 6: Runtime Integration (`src/lesson/runtime.ts`)

In `init()`, after scene setup completes but before `enterPlanet(0)`:

```typescript
// In standalone mode, play cinematic on first visit
if (isStandalone && !sessionStorage.getItem('solar-cinematic-seen')) {
  const cinematic = new CinematicController(this.sceneManager, this.cameraController, this.root);
  await cinematic.play();
  sessionStorage.setItem('solar-cinematic-seen', '1');
}
// Then proceed to normal enterPlanet(0)
```

Uses `sessionStorage` so the cinematic plays once per browser session (refreshing the tab replays it, but navigating between planets doesn't re-trigger it).

### Visual Enhancements During Cinematic

- **Dim UI**: Hide all lesson UI (topbar, sidebar, panel) during cinematic — only show the cinematic overlay
- **Slower orbits**: Reduce planet orbit speeds during cinematic for a more still, dramatic feel
- **Bloom boost**: Slightly increase bloom intensity during the Sun reveal for dramatic effect
- **Planet labels hidden**: No hotspots, no scan markers, no game UI — pure cinematic

### Accessibility & UX

- **Skip always available**: "Skip" button appears after 2s, skips entire cinematic
- **TTS fallback**: If speechSynthesis unavailable, narration text displays with timed auto-advance
- **Click to advance**: Clicking/tapping advances to the next narration step (impatient users)
- **Keyboard**: Escape or Space to skip, Enter or ArrowRight to advance
- **Session memory**: Won't replay on same session unless user explicitly triggers it

### Implementation Order

1. **Narration data** — write the script, export the typed array
2. **Voice engine** — Web Speech API wrapper with fallback
3. **Cinematic UI** — DOM overlay with letterbox, text display, skip
4. **Camera flyTo** — extend CameraController
5. **Cinematic controller** — wire everything together
6. **Runtime integration** — hook into standalone init flow
7. **Polish** — timing tweaks, easing, bloom effects, fade transitions

### Planet Index Reference

| Index | Planet  | Cinematic Order |
|-------|---------|-----------------|
| 7     | Neptune | 1st (start)     |
| 6     | Uranus  | 2nd             |
| 5     | Saturn  | 3rd             |
| 4     | Jupiter | 4th             |
| 3     | Mars    | 5th             |
| 2     | Earth   | 6th             |
| 1     | Venus   | 7th             |
| 0     | Mercury | 8th             |
| -1    | Sun     | 9th (finale)    |

### Estimated Cinematic Duration

- 3 beats x ~6-8 seconds narration = ~20-25 seconds of voice
- Camera transitions: ~2 seconds between stops
- Total: ~25-30 seconds
- Skippable at any point

---

## Narrative Tie-ins to Existing Lore

The cinematic integrates with the existing Void Swarm / Gravitium backstory:

- **Gravitium** → The Forgelord's Ring is built from harvested Gravitium, explaining why the Swarm targets mining operations
- **Void Swarm** → Creatures pouring through the rift opened by the Ring
- **Boss names** → Solar Forge (Mercury boss) is a servant of the Forgelord; Void Leviathan (Neptune boss) guards the outer rift
- **Data logs** → "Swarm Origin Fragment" already mentions the Swarm following "singing stones" (Gravitium) as a "map home" — the Ring is that home
- **Campaign flow** → The arcade campaign (Mercury → Neptune) is the military pushback; the cinematic shows the invasion wave (Neptune → Sun) that preceded it
