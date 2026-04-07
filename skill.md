---
id: solar-defense
name: Solar Defense
tags: [science, astronomy, exploration, puzzle, planets, webgpu, cinematic]
maxPlayers: 4
selfContained: true
---

# Solar Defense

WebGPU-only cinematic exploration game. Students travel from Mercury to Neptune, scan three planetary clues, then solve a short puzzle before warping onward.

## Game Flow

For each planet: **Briefing → Explore → Puzzle → Warp**.  
Explore means finding three glowing scan beacons on the planet itself. Each beacon reveals a clue. After all clues are found, the student answers one short multiple-choice puzzle based on what they discovered.

Score rewards accurate answers and streaks. The visual presentation is the main attraction: dramatic planetary flybys, rings, clouds, glow, dust, and holographic UI.

## Input Data (for TA content generation)

Generate a JSON object with key `game_data` containing a string of JSON.

```json
{
  "missions": [
    {
      "planet": "Mercury",
      "subtitle": "World of molten dawns",
      "prompt": "Recover three thermal beacons hidden along Mercury's scarred horizon.",
      "clues": [
        { "label": "Clue 1", "clue": "Mercury has almost no atmosphere, so heat escapes quickly." },
        { "label": "Clue 2", "clue": "Its surface is covered in old impact scars." },
        { "label": "Clue 3", "clue": "One solar day on Mercury is extremely long." }
      ],
      "question": "Why does Mercury swing between extreme heat and cold?",
      "options": [
        "It barely has an atmosphere to trap heat",
        "Its rings block sunlight",
        "Its oceans freeze every night"
      ],
      "answer": "It barely has an atmosphere to trap heat",
      "celebration": "Thermal map restored."
    }
  ]
}
```

### Rules

- Use the eight planets only: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
- Provide exactly one mission object per planet if you customize missions
- **clues** should contain exactly 3 entries
- Each question should have exactly 3 answer options
- `answer` must match one option string exactly
- Keep writing concise, vivid, and kid-friendly
- Do not invent new planets, moons, or game phases

## State

Key fields: phase (briefing/explore/puzzle/warp/end/arcade), planetIndex, planet, score, streak, cluesFound, cluesTotal, answered, currentAnswer.

Arcade test hook: while in arcade mode, `set(field="phase", value="next_mission")` force-completes the current sortie and launches the next mission.

## Events

gameStarted, phaseChange, planetArrived, scanRevealed, puzzleUnlocked, puzzleSolved, puzzleMissed, gameCompleted

## Teacher Guide

- Briefing: set the scene, play up the wonder of each planet, then use `next()` to begin scanning
- Explore: encourage the student to rotate the camera and find the three glowing scan beacons
- Puzzle: celebrate clue discovery, let the student reason from the evidence, use `reveal()` if they are stuck
- Warp: build excitement for the next destination
- End: recap favorite discoveries across the full voyage
- Arcade testing: use `set(field="phase", value="next_mission")` to force-complete the current sortie and launch the next route immediately
