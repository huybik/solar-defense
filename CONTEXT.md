# Solar Defense

Vite + TypeScript + Three.js WebGPU game. Runs either inside the learnfun host via `@learnfun/game-sdk` or as a standalone deploy (no SDK required).

## Loop

Eight-planet route: Mercury to Neptune.

- `briefing`: cinematic intro card and objective
- `explore`: rotate around the current planet and click 3 scan beacons
- `puzzle`: answer one multiple-choice question using the scanned clues
- `warp`: short transition to the next planet
- `end`: summary and final score → unlock COMMAND CENTER
- `arcade`: post-lesson Tyrian-style campaign shooter (see below)

### Cinematic Introduction (standalone mode)
On first standalone visit, a cinematic plays before the lesson begins. Camera flies Neptune → Sun (9 beats) with voice-over narration (Web Speech API, text fallback) telling a Lord of the Rings-inspired invasion story. Skippable. Uses `sessionStorage` to play once per session.

- `src/cinematic/narration.ts`: `NarrationBeat` data (9 beats, planet indices, text, hold durations)
- `src/cinematic/voice.ts`: `VoiceEngine` — Web Speech API wrapper with voice selection and graceful fallback
- `src/cinematic/ui.ts`: `CinematicUI` — DOM overlay (letterbox, narration text, skip/begin buttons)
- `src/cinematic/style.css`: cinematic-specific styles
- `src/cinematic/cinematic.ts`: `CinematicController` — orchestrates camera flyTo, voice, and UI through the sequence
- `src/scene/camera.ts`: `flyTo()` method added for arbitrary position-to-position camera transitions (used by cinematic)

## Music

Shared background music now covers the full game loop: cinematic, lesson phases, voyage ending, and arcade menus/combat. Tracks are sourced from CC0 OpenGameArt packs and crossfaded through one Web Audio controller.

- `src/audio/music.ts`: shared cue-based music controller and track loading/crossfade logic
- `src/assets/music/SOURCES.md`: source URLs, authors, and licenses for bundled music tracks

## Architecture

- `src/utils.ts`: shared utilities (`escapeHtml`, `clamp`, `lerp`) used by both lesson and arcade
- `src/types.ts`: shared types, constants (`INTERACTIVE_PHASES`), and `normalizeId` utility
- `src/game.ts`: thin SDK-facing facade (`createGame()` wiring, actions, initial state) that delegates to `src/lesson/runtime.ts`
- `src/sdk-shim.ts`: standalone stub for `@learnfun/game-sdk` — provides `createGame`, `GameBridge`, and type exports with no-op host communication; `vite.config.ts` auto-selects the real SDK or this shim based on whether `../_sdk/src` exists at build time
- `src/lesson/`: lesson runtime split by responsibility — `runtime.ts` (scene/UI orchestration), `flow.ts` (hotspot/puzzle/phase helpers), `events.ts` (teacher event emission), `interactions.ts` (UI + pointer helpers)
- `src/main.ts`: bridge registration and default init data
- `src/style.css`: explorer/lesson styles (CSS vars, glass cards, mission UI, responsive)

### `src/planet/` — planet data & rendering
- `data.ts`: default missions data plus `buildMissions()` composition
- `mission-overrides.ts`: pure mission override parsing/merging helpers
- `factory.ts`: planet mesh creation (surface, atmosphere, clouds, rings, moons, hotspots)
- `nasa-textures.ts`: async NASA texture loading and hot-swap onto procedural planets
- `procedural-textures.ts`: generated textures for planets, rings, nebulae, glows, sun, and glow cache

### `src/scene/` — Three.js rendering layer
- `manager.ts`: SceneManager — renderer/camera/controls setup, animation loop, hotspot raycasting, post-processing
- `camera.ts`: camera transitions and planet-tracking follow system
- `environment.ts`: starfield, nebula backdrop, sun with glow, orbit lines, asteroid belt

### `src/ui/` — DOM rendering
- `shell.ts`: buildShell (DOM structure), UIElements interface
- `render.ts`: lesson UI composer that delegates to `src/ui/regions/*`
- `regions/`: topbar, sidebar, panel, banner, support, and peer-bar DOM render helpers
- `helpers.ts`: re-exports `escapeHtml` from `src/utils.ts`
- `index.ts`: re-exports

## Arcade Mode (`src/arcade/`)

"Solar Defense Command" is now a full campaign shooter layered on top of the lesson finale.

### Flow
title → save slot + difficulty → campaign map → shop/data log/briefing → combat → debrief → next route

### Structure
- `types.ts`: compatibility barrel re-exporting the split domain type modules in `src/arcade/types/`
- `utils.ts`: runtime utilities (`circleHit`, `nearest`, `disposeMesh`, `tickSlow`, `randRange`, `pickRandom`, `distance`, `HitResult`), re-exports `clamp`/`lerp` from `src/utils.ts`
- `mode.ts`: thinner arcade coordinator over extracted helpers
- `mode-view.ts`: arcade view-model/state shaping (`buildArcadeViewModel`, combat snapshot mapping, level summaries)
- `campaign-state.ts`: pure campaign reward/route helpers used by `ArcadeMode`
- `ui-actions.ts`: command-center UI action routing
- `index.ts`, `style.css`: public arcade entry and styles
- `render/deferred-dispose.ts`: queues material/geometry cleanup until after render so WebGPU does not submit destroyed buffers during combat/menu transitions
- `data/`: static definitions — `weapons.ts`, `enemies.ts`, `bosses.ts`, `levels.ts`, `campaign.ts`, `lore.ts`, `difficulty.ts`, `mastery.ts`
- `combat/`: runtime entities — `arena.ts`, `player.ts`, `bullets.ts`, `weapons.ts`, `enemies.ts`, `boss.ts`, `meteors.ts`, `terrain.ts`, `pickups.ts`, `power-ups.ts`, plus extracted helper modules
- `combat/bullets.ts`: projectile runtime now keeps reusable mesh pools plus a 3-phase missile model (`launch -> acquire -> terminal`) with smoothed visual rotation, cached lock reacquire, target memory, proximity fuse state, splash metadata, and trail hooks
- `combat/arena.ts`: combat facade; still owns the live loop/collision flow, but now delegates boss-upgrade math, timeline/scheduled spawns, pickup application, secret rules, debrief/result finalization, and 2-player co-op runtime coordination (P1 + wingmate)
- Regular enemies now resolve through planet-specific sprite/tint variant tables, so the authored `EnemyType` archetypes can stay shared while each planet still gets its own visual roster; filler waves also pull from planet-specific enemy pools, and normal-enemy HP now scales with campaign episode + combat wave on top of difficulty
- `combat/modifiers.ts`, `timeline.ts`, `pickup-effects.ts`, `secret-rules.ts`, `outcome.ts`: extracted arcade combat subsystems; `timeline.ts` now delays boss entry until the authored spawn/hazard script has played out instead of interrupting late segments
- `progression/`: economy & persistence — `inventory.ts`, `shop.ts`, `scoring.ts`
- `render/`: presentation — `background.ts`, `sprites.ts`, `vfx.ts`, `audio.ts`, `music.ts`, `hud.ts`

### Co-op combat
- Combat now starts with P1 only; P2 joins mid-fight by pressing `P`, which also reveals a flashing top-right co-op prompt until joined
- Stage failure still only happens when every active ship is out of lives
- P1 uses the original keyboard bindings. P2 can use the dedicated keyboard bindings in `src/arcade/combat/player.ts` or the first connected gamepad
- Combat HUD/state now exposes both pilots, and power-up ownership is tracked per pilot even though campaign progression still persists the main campaign loadout

### Boss system
- 8 full bosses (one per planet, level 3 finale): Solar Forge, Acid Empress, Orbital Sentinel, Dust Devil, Storm King, Ring Guardian, Ice Titan, Void Leviathan
- 8 mini-bosses (one per planet, level 2 finale): Heat Sentinel, Spore Mother, Drone Nexus, Sand Wyrm, Stormcaller, Shard Captain, Frost Warden, Shadow Herald
- Mini-bosses: 1 phase, 1 core part (no removable parts), 2 attacks, ~40-50% full boss HP
- Full bosses: 3 phases, core + 2 removable parts, 3 attacks, vulnerability windows, rage mode at ~90s
- Both use the same `BossController` class — mini-bosses are purely a data difference
- Arena now computes boss trigger from both stage duration and the latest authored spawn/hazard beat so bosses stay the finale even on scripted mini/full-boss stages

### Weapon mastery
- Per-weapon kill counter persisted in `CampaignState.weaponMastery`
- Tiers: Bronze (25 kills), Silver (75), Gold (200) — each adds a stacking bonus
- Front weapons: fire rate +5/10/15%. Rear: damage +5/10/15%. Left/right sidekicks: +1 projectile at Silver and Gold. Special: ammo save chance 5/10/15%
- Data and logic in `data/mastery.ts`, applied in `combat/weapons.ts` via `applyMastery()`
- Kill tracking: `scoring.ts` `registerWeaponKill()`, called from `arena.ts` collision handlers
- Mastery persists on both success and failure in `mode.ts` `finishCombat()`

### Sidekick slots
- Ship loadouts now support independent `sidekickL` and `sidekickR` slots
- Sidekick catalog entries remain shared across both sides; the shop can buy/equip the same sidekick model on either wing
- Combat spawns, buddy sprites, power-up trials/boosts, mastery perks, and loadout summaries all treat both sidekick slots as first-class weapon mounts

### Teacher / bridge events
`arcade_started`, `wave_start`, `wave_clear`, `boss_enter`, `boss_phase`, `boss_vulnerable`, `boss_defeated`, `player_down`, `pickup_collected`, `terminal_found`, `secret_revealed`, `synergy_discovered`, `stage_clear`, `stage_failed`

### Controls
Auto-fire is always on.
P1: WASD or arrows move, E uses special, Q cycles specials, Space/F drops MegaBomb.
P2: IJKL move, O uses special, U cycles specials, P drops MegaBomb, or use the first connected gamepad.
Esc pauses.

### Mobile / Touch Controls
On touch-primary devices (`pointer: coarse`), Touhou-style drag-to-move input replaces keyboard for P1. Drag anywhere on screen to move the ship (relative movement, 1:1 mapped to arena units). On-screen BOMB, SP, and pause buttons appear during combat. Portrait orientation widens the camera FOV from 40° to 55° and clamps player movement to the visible area. Touch buttons are DOM overlays managed by `createTouchSource()` in `src/arcade/combat/player.ts`. Browser zoom/pan gestures are suppressed via `touch-action: none` and viewport meta.

## Visual System

- WebGPU-only renderer with bloom post-processing
- Official NASA diffuse textures are vendored for Earth, Moon, Venus, Mars, Jupiter, Saturn, Neptune, plus Mercury/Uranus extracted from official NASA GLBs
- Scene boots with lighter procedural textures first, then swaps in the official NASA diffuse maps asynchronously to reduce startup latency
- Focus camera continuously tracks the active planet as it moves along its orbit
- Other planets are procedural with layered maps: diffuse + bump + roughness + emissive where useful, plus cloud layers, atmosphere shells, and rings
- Scene includes sun glow, orbit ribbons, asteroid belt, starfield, nebula sphere, and animated moons
- Arcade mode: fixed camera locked on planet, gameplay on a 42×60 arena plane with DOM command-center HUD overlays
- Command-center title/map/briefing phases now render a planet backdrop too, so new campaigns no longer sit on an empty black canvas between fights
- Missile exhaust now uses pooled point-trail VFX so authored `trailColor` values render without per-missile trail mesh churn
- Arcade combat teardown now defers sprite/material/geometry disposal until after render, side-entry enemies spawn fully offscreen again, and empty VFX point clouds hide instead of issuing WebGPU zero-vertex draw warnings
