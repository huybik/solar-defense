# Solar Defense — Polish Plan

## Lesson Mode

### 1. Planet Arrival Cinematic
When warping to a new planet, briefly show the ship streaking through a starfield with speed-line particles, then ease into orbit. Currently warp is a 1.2s timeout with a text banner — no visual payoff.

### 2. Hotspot Discovery Feedback
When clicking a beacon: particle burst from the hotspot, scan-line ripple over the planet surface, glassy clue card that slides in from the side. Currently just updates the sidebar list silently.

### 3. Puzzle Answer Feedback
Correct answer: confetti particles + brief planet glow. Wrong answer: subtle red screen-edge vignette + shake. Currently it's a CSS class swap only.

### 4. Planet-to-Planet Transition
Instead of cutting between planets, animate the camera pulling back to show the solar system overview, then sweep to the next planet. The orbit infrastructure already supports this — just needs a wider camera path.

### 5. Explore Mode Compass
Show a subtle directional indicator (arrow or radar dot) hinting at unfound beacon direction when the user is rotating away from them. Kids get lost rotating aimlessly on larger planets.

---

## Arcade — Combat Feel

### 6. Death Animation
Player ship currently vanishes instantly. Add a 0.5s explosion → ship fragments flying outward → brief invulnerability shimmer on respawn. VFX system already supports explosions — needs fragment meshes + respawn visual.

### 7. Boss Entrance Cutscene
Before the boss fight, brief 1s pause where the boss name appears in large dramatic text with a zoom, then combat resumes. Currently just a comms message.

### 8. Weapon Feel
Add per-weapon screen shake on heavy weapons (SDF Main Gun, Mega Cannon). Vulcan should have subtle camera vibration. Beam weapons should have a sustained hum. Recoil values exist in weapon data but are underused visually.

### 9. Hit Flash on Enemies
When enemies take damage, briefly flash them white (0.1s). When shields break on shielded enemies, show a blue shield-break particle ring. Currently damage has zero visual feedback on the target.

### 10. Combo Visual Escalation
At combo x5, x10, x20, show increasingly dramatic screen-edge glow (gold → orange → red). The combo counter exists but carries no visual weight.

### 11. Boss Part Destruction
When a boss part is destroyed, spawn debris fragments that drift (avoidable). Show sparks continuously from the destroyed mount point. Currently parts just disappear.

### 12. Grazing Visual
When grazing, spawn brief spark trails along the near-miss side of the player ship. The graze counter exists but the near-miss feeling is invisible.

---

## UI/UX

### 13. Shop Preview
When hovering a weapon in the shop, show a small looping animation of its fire pattern (a tiny sandbox). Players currently can't judge weapons before buying.

### 14. Campaign Map Visual
Replace the text button grid with a starfield map where planets are positioned roughly to scale and route lines connect them. Completed levels glow, locked ones dim. All data is there — just needs visual presentation.

### 15. Level Select Planet Backdrop
When selecting a level on the map, show its planet rotating slowly in the background (reuse lesson mode planet meshes). Currently the map screen is pure DOM with no 3D.

### 16. Debrief Animation
Stats should count up one by one (score ticking, credits ticking) with satisfying audio ticks, then the medal stamps in with a sound. Currently everything appears at once.

### 17. Loading State
First load has a noticeable gap while WebGPU inits + procedural textures generate. Show a themed loading bar ("Generating star charts...") instead of blank screen.

---

## Audio

### 18. Ambient Lesson Audio
Subtle space ambiance during explore phase (low hum + distant star crackle). The arcade has full music but the lesson mode is completely silent.

### 19. UI Sound Design
Button clicks, phase transitions, hotspot scans, puzzle answer jingles. The arcade has audio infrastructure (`ArcadeAudio`) that could be shared or adapted.

### 20. Boss Music Escalation
During boss rage mode, the FM synth should add a distortion layer and increase tempo. The mood system distinguishes boss vs action, but rage sounds the same as regular boss.

---

## Technical

### 21. Texture Generation Off-Thread
Procedural texture generation (FBM noise for 8 planets + clouds + rings) blocks the main thread at startup. Move to a Web Worker with OffscreenCanvas.

### 22. WebGL Fallback
Currently hard-fails on no WebGPU with an error card. Three.js 0.178 supports both renderers. A quality-reduced WebGL path would widen compatibility significantly.

### 23. Mobile Touch Controls
The arcade assumes keyboard (WASD+Space). A virtual joystick + fire button overlay for touch would make it playable on tablets. This is a learning platform — kids often use iPads.
