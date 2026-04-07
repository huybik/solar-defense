# Solar Defense — Architecture

Two games in one: an educational **lesson mode** (explore 8 planets, scan clues, solve puzzles) and a full **Tyrian-style arcade shooter** ("Solar Defense Command") unlocked after the lesson.

## Tech Stack

- **Three.js 0.178 + WebGPU** (mandatory — no WebGL fallback)
- **Vite + TypeScript** standalone build
- **Kenney Space Shooter Redux** sprite atlas (PNG) + OGG audio
- **NASA textures** vendored for all 8 planets + Moon (async hot-swap over procedural)
- **Game SDK** (`@learnfun/game-sdk`): GameBridge, postMessage protocol, multiplayer sync

## File Map

```
src/
├── main.ts                  Entry: creates GameBridge + SolarDefenseGame
├── game.ts                  SolarDefenseGame (GameAPI + MultiplayerGame)
├── types.ts                 Shared lesson types, PlanetMission, SolarState
├── utils.ts                 escapeHtml, clamp, lerp
├── style.css                Lesson UI styles
│
├── planet/
│   ├── data.ts              8 default missions + TA override merging
│   ├── factory.ts           Planet mesh builder (surface/atmo/clouds/rings/moons/hotspots)
│   ├── procedural-textures.ts  CPU texture gen (rocky, gas, venus, clouds, ring, sun, nebula)
│   └── nasa-textures.ts     13 NASA textures — async load, hot-swap onto procedural
│
├── scene/
│   ├── manager.ts           SceneManager: renderer, camera, controls, bloom, animation, raycasting
│   ├── camera.ts            CameraController: transitions, planet tracking, drag-detach
│   └── environment.ts       Starfield (3 layers), nebula, sun+glow, orbit lines, asteroid belt
│
├── ui/
│   ├── shell.ts             DOM scaffold (stage/topbar/sidebar/panel/banner/support/peers)
│   ├── render.ts            Phase renderers (briefing/explore/puzzle/warp/end), peer bar
│   ├── helpers.ts           Re-exports escapeHtml
│   └── index.ts             Barrel exports
│
└── arcade/
    ├── index.ts             Barrel: ArcadeMode
    ├── mode.ts              ArcadeMode class — campaign orchestrator (9 phases)
    ├── types.ts             800 lines: all arcade types, ARENA/PLAYER/COMBAT constants
    ├── utils.ts             circleHit, nearest, disposeMesh, tickSlow, randRange, etc.
    ├── style.css            Arcade HUD styles
    │
    ├── data/
    │   ├── campaign.ts      8 episodes, 25 main-route levels, 6 secret levels, unlock graph
    │   ├── levels.ts        31 hand-crafted LevelDefs with timed segments + data terminals
    │   ├── enemies.ts       20 enemy types (EnemyDef: sprite, HP, behavior, drops)
    │   ├── bosses.ts        16 bosses (8 full 3-phase + 8 mini 1-phase)
    │   ├── weapons.ts       Weapon catalog: front/rear/sidekick/special, hulls, generators, shields
    │   ├── lore.ts          Data log entries (story/humor/alien/secret)
    │   └── difficulty.ts    5 difficulty scales (easy → suicide)
    │
    ├── combat/
    │   ├── arena.ts         Main combat loop: collisions, segments, waves, boss trigger, scoring
    │   ├── player.ts        PlayerController: movement, focus, invuln, firing, respawn
    │   ├── bullets.ts       BulletPool: InstancedMesh for all projectiles
    │   ├── weapons.ts       Weapon runtime: fire patterns, beams, orbits, synergies
    │   ├── enemies.ts       EnemyManager: 13 behavior types, AI targeting
    │   ├── boss.ts          BossController: multi-phase, parts, vulnerability, rage
    │   ├── meteors.ts       Asteroid obstacles (split on destroy)
    │   ├── terrain.ts       Destructible structures + turrets
    │   ├── pickups.ts       12 pickup types (credits, health, data_cube, powerup, etc.)
    │   └── power-ups.ts     Temporary combat buffs
    │
    ├── progression/
    │   ├── inventory.ts     localStorage save/load (3 slots), loadout init
    │   ├── shop.ts          Buy/sell/equip/upgrade, tab-based shop entries
    │   └── scoring.ts       Score, combo, graze, debrief + medal calculation
    │
    └── render/
        ├── background.ts    Multi-layer parallax, planet palettes, flash/darken
        ├── sprites.ts       Kenney atlas preload, sprite mesh creation
        ├── vfx.ts           Explosions, score popups, screen shake, hazard tint
        ├── audio.ts         SFX (Kenney OGG): role-based playback
        ├── music.ts         Procedural FM synth (calm/action/boss/danger per planet)
        └── hud.ts           Full DOM HUD: title, map, shop, briefing, combat, debrief, log, pause
```

## Lesson Mode

### Flow

```
  ┌─────────┐    ┌─────────┐    ┌────────┐    ┌──────┐
  │ Briefing │───▶│ Explore │───▶│ Puzzle │───▶│ Warp │──┐
  └─────────┘    └─────────┘    └────────┘    └──────┘  │
       ▲              click 3        answer       1.2s   │
       │              beacons        question     timer  │
       └─────────────────────────────────────────────────┘
                        ×8 planets (Mercury → Neptune)
                                    │
                                    ▼
                              ┌──────────┐
                              │   End    │──▶ COMMAND CENTER (arcade)
                              └──────────┘
```

- **Briefing**: cinematic banner + planet subtitle, "Enter Scan Mode" button
- **Explore**: rotate 3D planet, click 3 glowing hotspot beacons → each reveals a clue
- **Puzzle**: multiple-choice question from scanned clues, 2.2s auto-advance on answer
- **Warp**: 1.2s transition to next planet
- **End**: final score + "COMMAND CENTER" button to enter arcade

### Scene Architecture

```
SceneManager.setup()
  │
  ├─▶ WebGPU renderer init
  ├─▶ buildEnvironment()        starfield, nebula, sun, orbits, asteroids
  ├─▶ buildAllPlanets()         8 planets with procedural textures
  ├─▶ buildPostProcessing()     bloom pass (0.44 strength)
  ├─▶ setAnimationLoop()        kicks off render loop
  └─▶ loadNasaTextures() ····▶  async: swaps in NASA diffuse maps when ready
```

`CameraController` follows the active planet's orbit position each frame. On planet change, smooth cubic transition (1.6s). User drag detaches tracking; auto-rotate during briefing.

### Planet Rendering

```
Scene
 └── pivot (Group)                    ← rotates around Y (orbit)
      └── anchor (Group)              ← positioned at orbitRadius on X, tilted on Z
           ├── bodyGroup (Group)      ← rotates around Y (self-rotation)
           │    ├── surface (Mesh)         sphere + diffuse/bump/roughness/emissive
           │    ├── atmosphere (Mesh)      slightly larger sphere, additive backside
           │    ├── cloudLayer (Mesh)      alpha-blended cloud sphere
           │    └── hotspots (Mesh×3)      glowing beacons at lat/lon positions
           ├── ring (Mesh)            ← RingGeometry, only Saturn/Uranus
           └── moonPivots (Group[])   ← each contains a small sphere on offset X
```

Texture pipeline:
```
Boot                                  Async (after first render)
 │                                     │
 ├─ procedural-textures.ts             ├─ nasa-textures.ts
 │   FBM noise → 1024×512 canvas      │   loadAsync() → 13 JPEG/PNG
 │   ├─ rocky: terrain+craters         │   earth_day_4096, earth_normal,
 │   ├─ gas: bands+storms+vortices     │   earth_lights, earth_clouds, ...
 │   ├─ venus: swirl+haze              │   mercury_nasa, venus_nasa, ...
 │   └─ each → diffuse+bump+rough      │
 │            (+emissive for gas)       └─▶ applyNasaTextures()
 │                                          hot-swap diffuse map on each
 └─▶ planets render immediately             planet material.needsUpdate=true
```

### Multiplayer

```
  Leader (authoritative)                  Follower
  ┌──────────────────┐                   ┌──────────────────┐
  │ SolarDefenseGame  │                   │ SolarDefenseGame  │
  │  handleAction()   │    postMessage    │  setRole(true)    │
  │  state changes    │ ◀──────────────── │  relayAction()    │
  │  syncState()      │ ──────────────▶   │  applyFullState() │
  └──────────────────┘    Yjs / bridge    └──────────────────┘
```

Leader is authoritative: followers relay actions via `relayAction()`. `applyFullState()` replays state; camera re-focuses if planet changed. Peer bar shows sorted scores.

### TA Integration

```
  TA (Gemini Flash)                  game.ts
  ┌──────────────┐   postMessage    ┌──────────────┐
  │ generates 8   │ ──────────────▶ │ buildMissions │
  │ MissionOverride│  init(data)    │  merge onto   │
  │ per skill.md  │                 │  8 defaults   │
  └──────────────┘                  └──────────────┘
                                     visual/orbit constants preserved
```

`skill.md` defines the data contract. TA generates subtitle, clues, question, options, answer per planet. `buildMissions()` merges overrides onto the 8 default missions.

---

## Arcade Mode ("Solar Defense Command")

### Flow

```
┌─────────┐     ┌──────────────┐     ┌────────┐
│  Title   │────▶│ Campaign Map │◀───▶│  Shop  │
│ save/diff│     │ 8 episodes   │◀───▶│ 7 tabs │
└─────────┘     └──────┬───────┘◀───▶└────────┘
                       │         ◀───▶┌──────────┐
                       │              │ Data Log │
                       ▼              └──────────┘
                ┌──────────┐
                │ Briefing │
                └────┬─────┘
                     ▼
                ┌──────────┐    success    ┌──────────┐
                │  Combat  │──────────────▶│ Debrief  │──▶ back to Map
                └────┬─────┘               └──────────┘
                     │ all lives lost
                     ▼
                ┌──────────┐
                │Game Over │──▶ Retry / Map
                └──────────┘
```

### Campaign Structure

```
Episode 1: Mercury          Episode 5: Jupiter
  mercury_1  First Contact    jupiter_1  Outer Moons ─┬─▶ io_flyby (branch)
  mercury_2  Mining Colony    jupiter_2  Storm Belt   ◀┘
  mercury_3  Solar Forge ★    jupiter_3  The Great Eye ★
  (secret: abandoned_mine)    │
        │                   Episode 6: Saturn
Episode 2: Venus              saturn_1  Ring Crossing
  venus_1  Acid Rain          saturn_2  Ice Moon Assault
  venus_2  Cloud City         saturn_3  Ring Guardian ★
  venus_3  Toxic Core ★       (secret: pretzel_nebula)
  (secret: hidden_lab)        │
        │                   Episode 7: Uranus
Episode 3: Earth              uranus_1  Diamond Rain
  earth_1  Orbital Debris     uranus_2  Frozen Fleet
  earth_2  Satellite Grid ─┬─▶ lunar_detour (branch)
  earth_3  Defense Network ★◀┘  uranus_3  Ice Titan ★
        │                     (secret: banana_dimension → galactic_diner)
Episode 4: Mars               │
  mars_1  Dust Storm        Episode 8: Neptune
  mars_2  Canyon Run          neptune_1  Dark Approach
  mars_3  Olympus Mons ★      neptune_2  Void Station
  (secret: phobos_station)    neptune_3  Leviathan's Maw ★
                              neptune_escape  Escape

★ = full boss fight     (secret: ...) = hidden level unlocked in-game
```

- **25 main-route levels** + 2 branch levels + 6 secret levels = 33 total
- Secret unlocks: destroy specific objects, collect pretzels, use Banana Blast at the right portal
- Each level: timed `LevelSegment[]` spawning enemies/meteors/terrain/hazards/pickups/terminals
- Levels are 70–120 seconds, ending in boss fight (levels 2/3) or time clear (level 1)

### Combat Loop (`Arena.update`)

```
 ┌──────────────────────────────────────────────────────────────┐
 │  1. Poll keyboard ──▶ pause?                                 │
 │  2. Tick combo decay                                         │
 │  3. Process level segments (time-based spawn scripts)        │
 │  4. Update player (move, fire, synergy, bomb)                │
 │  5. Update enemies (AI + fire), meteors, terrain turrets     │
 │  6. Update pickups (magnet if attractor active)              │
 │  7. Update power-ups (timed buffs)                           │
 │  8. Update bullets (homing, wave, orbit, anchored)           │
 │  9. Boss trigger? (55% duration, min 28s) ──▶ clear + spawn  │
 │ 10. Update boss (phases, attacks, vulnerability)             │
 │ 11. Collision resolution ──────────────────────────┐         │
 │ 12. VFX + background update                        │         │
 │ 13. Check win/lose ──▶ debrief or game over        │         │
 └─────────────────────────────────────────────────────┼────────┘
                                                       │
  ┌────────────────────────────────────────────────────┘
  │  Collision matrix:
  │
  │  player bullets ──▶ enemies, meteors, terrain, boss parts
  │  enemy bullets  ──▶ shield drones (block) ──▶ player
  │  beams          ──▶ axis-aligned range check (not circle)
  │  body           ──▶ player vs enemies, player vs meteors
  │  grazing        ──▶ enemy bullet in GRAZE_RADIUS (1.15)
  │                     but outside hitbox (0.26) = +10 score
  │  pickups        ──▶ player within PICKUP_RADIUS (2.35)
  └────────────────────────────────────────────────────────────
```

### Boss System

```
BossController (shared by all 16 bosses)
 │
 ├── Full Boss (8, one per planet level 3)
 │    ├── 3 phases (healthThreshold triggers transition)
 │    ├── core + 2 removable parts (independent HP)
 │    ├── 3 attack patterns per boss
 │    ├── vulnerability windows between phases
 │    └── rage mode after ~90s (rageAfter)
 │
 └── Mini-Boss (8, one per planet level 2)
      ├── 1 phase
      ├── core only (no removable parts)
      ├── 2 attack patterns
      ├── ~40-50% HP of full boss
      └── rageAfter: 999 (effectively never)

Attack patterns: ring, spiral, beam_sweep, barrage,
                 gravity_pull, hazard, tentacles, missiles, shatter
```

### Weapon System

```
Ship Loadout (5 slots)
 ┌─────────────────────────────────────────────┐
 │               ┌───────────┐                 │
 │               │   Front   │  primary gun    │
 │  ┌─────────┐ └───────────┘ ┌─────────┐     │
 │  │SidekickL│               │SidekickR│     │
 │  │ (drone) │    [ SHIP ]   │ (drone) │     │
 │  └─────────┘               └─────────┘     │
 │               ┌───────────┐                 │
 │               │   Rear    │  backward/      │
 │               └───────────┘  special pattern│
 │               ┌───────────┐                 │
 │               │  Special  │  energy-based   │
 │               └───────────┘  (missiles,     │
 │                               bombs, fields)│
 └─────────────────────────────────────────────┘

Each weapon: up to 11 power levels, bought/upgraded at shop
Synergies: front+rear combos (e.g. Pulse Cannon + Starburst = "Pulse Nova")
Projectile types: bullet, beam, missile, spread, wave, mine, orbit
```

### Economy & Progression

```
  Combat                         Between missions
  ┌──────────────┐               ┌──────────────────────────┐
  │ kill enemy   │──▶ +score     │  Shop (7 tabs)           │
  │ collect $$   │──▶ +credits   │  ┌────┬────┬──────────┐  │
  │ graze bullet │──▶ +10 score  │  │Ship│Guns│Sidekicks │  │
  │ rescue crew  │──▶ +bonus     │  │Hull│F/R │ L / R    │  │
  │ find terminal│──▶ +data log  │  ├────┴────┴──────────┤  │
  │ combo kills  │──▶ multiplier │  │Special│Shield│Gen  │  │
  └──────┬───────┘               │  └───────┴──────┴─────┘  │
         ▼                       │  buy / sell / equip /     │
  ┌──────────────┐               │  upgrade (power levels)   │
  │   Debrief    │               └──────────────────────────┘
  │ medal:       │
  │  platinum ◀── under par + high accuracy
  │  gold     ◀── under par
  │  silver   ◀── completed
  │  bronze   ◀── completed, lower stats
  └──────────────┘

Save: 3 localStorage slots, full CampaignState serialized
```

### Rendering

```
Arena coordinate space (42×60 units)
          ─21              0              +21
   +30 ┌──────────────────┬──────────────────┐
       │  enemies spawn   │   enemies spawn  │
       │  from top        │   from top       │
       │                  │                  │
       │                  │                  │
       │ ◀─ enemies       │     enemies ──▶  │
       │    from left     │     from right   │
       │                  │                  │
       │          ┌───────────────┐          │
       │          │  BOSS ZONE    │          │
       │          └───────────────┘          │
       │                  │                  │
       │      pickups drift down             │
       │                  │                  │
       │              ◆ player               │
       │          (move area clamped         │
   -24 │           to -24..+18 Y)            │
       │                  │                  │
   -30 └──────────────────┴──────────────────┘

Camera: fixed at z=80, 40° FOV, looking at origin
```

- **Sprites**: Kenney PNGs loaded into texture atlases, rendered as textured PlaneGeometry
- **Bullets**: single InstancedMesh pool (up to 300), color-coded by owner
- **Background**: multi-layer parallax (3 scrolling planes), planet-themed color palettes, flash/darken on boss
- **VFX**: particle explosions, score popups (floating text meshes), screen shake (group offset)
- **Audio**: 73 Kenney OGG samples for SFX + procedural FM synth music (4 moods × 8 planet keys)

### HUD

```
Combat HUD layout (DOM overlay on 3D canvas)
┌────────────────────────────────────────────────────┐
│ [SCORE 12,400]  [CREDITS 850]          [WAVE 2/3] │
├──────────┐                          ┌──────────────┤
│ ARMOR ██░│                          │ Combo   x4   │
│ SHIELD██ │                          │ Graze   12   │
│ ENERGY█░░│       3D canvas          │ Accuracy 87% │
│          │                          │              │
│ Lives: 3 │                          │ [Homing  x5] │
│ Bombs: 2 │                          │ SYNERGY OFF  │
├──────────┘                          │ [powerups..] │
│                                     └──────────────┤
│         ┌─── BOSS: STORM KING ───┐                 │
│         │ PHASE 2   ████████░░░░ │                 │
│         └────────────────────────┘                 │
│ ┌────────────────────────────────────────────────┐ │
│ │ COMMS: Storm King is vulnerable!               │ │
│ └────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘

Optimized: setText/setBar DOM patching during combat (no innerHTML per frame)
Full re-render on phase change only (title, map, shop, briefing, debrief, log, pause)
```

---

## Data Flow

```
 ┌────────────────────────────────────────────────────────────────────┐
 │                        LearnFun Host                              │
 │  ┌──────────┐   postMessage   ┌──────────────────────────────┐    │
 │  │ GameHost │ ◀═════════════▶ │  iframe: Solar Defense Game   │    │
 │  │ (React)  │   init/action   │                              │    │
 │  │          │   ready/state   │  GameBridge ──▶ SolarDefense │    │
 │  │          │   event/end     │       │            Game      │    │
 │  └────┬─────┘                 │       │              │       │    │
 │       │                       │       │         ┌────┴────┐  │    │
 │       ▼                       │       │         │ Arcade  │  │    │
 │  Room.tsx ──▶ /api/teacher/   │       │         │  Mode   │  │    │
 │    [game_state_update]        │       │         └─────────┘  │    │
 │    [game_event:{name}]        │       │                      │    │
 │       │                       └───────┼──────────────────────┘    │
 │       ▼                               │                           │
 │  Teacher (Gemini Live)                │ emitEvent() for every     │
 │    game_action tool ──────────────────┘ significant moment:       │
 │    (Redis → SSE → iframe)               gameStarted, phaseChange, │
 │                                         scanRevealed, puzzleSolved│
 │                                         arcade_started, boss_enter│
 └────────────────────────────────────────────────────────────────────┘
```

## Key Patterns

- **No React**: all DOM is raw innerHTML + event delegation via `data-action` attributes
- **No bundled physics**: all collision is manual circle-circle + axis-aligned beam checks
- **Procedural-first, swap-in-quality**: textures + music generated at boot, high-quality assets stream in
- **Data-driven levels**: `LevelDef.segments[]` are pure data; Arena interprets them uniformly
- **Single BossController**: mini-bosses vs full bosses are purely a data difference in `BossConfig`
- **Bridge events**: every significant gameplay moment emits a typed event for the teacher to react to
