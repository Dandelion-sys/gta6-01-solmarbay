# Solmar Bay

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the make.fun bounty **gta6-01 ("Make GTA 6")** — built by [Dandelion-sys](https://make.fun/bounty/gta6-01).

**Referral:** https://make.fun/?ref=9y382syd

## The game

Welcome to **Solmar Bay**, a sun-soaked coastal city of towers, palm-lined
boulevards, a marina and a long sandy beach. You are **Rico Vane**, broke and
fresh out of the harbour district. The fixer **Marisol** has work for you —
if you can handle the heat.

- **Explore on foot** — third-person character, WASD movement, mouse-orbit
  camera, Shift to run, Space to jump.
- **Steal and drive** — sedans, taxis, pickups, trucks and police cars, all
  built from boxes with arcade handling. Press **E** to enter or exit the
  nearest car.
- **Living city** — a procedural 9×9-block grid with 100+ buildings (canvas
  window textures), roads, sidewalks, palm trees, streetlights, a beach and
  an ocean, plus ~14 AI traffic cars on road loops and ~20 pedestrians.
- **Wanted system** — 0–5 stars. Stealing a car, hitting a pedestrian or
  shooting raises your wanted level; police cars spawn, chase and ram you.
  Lay low and the heat decays.
- **Missions and story** — three missions from Marisol with cash rewards:
  *M1 First Wheels* (steal a car, drive to the marina beacon), *M2 Package
  Run* (pick up at the north docks, deliver downtown against the clock),
  *M3 Lose the Heat* (reach 3 stars, then shake the cops). A 3D beacon, a
  minimap blip and objective text guide you.
- **Combat** — **F** to punch, click to shoot (hitscan with tracer), health
  bar, game over and restart.
- **HUD** — health, cash, wanted stars, speedometer, a live 2D minimap with
  player / car / police / mission blips, objective banner and crosshair.
- **Menus and saves** — start screen, pause (**P** / **Esc**), and progress
  (cash, missions done) saved to localStorage with a Continue option.
- **Sound** — 100% synthesized WebAudio: engine hum by speed, two-tone
  police siren, gunshot noise burst, pickup chime and UI clicks. **M** mutes.

Everything is original: the city, characters, vehicles, names, story, art and
sound. No Rockstar / GTA assets, no network requests at runtime, no audio or
image files — textures are procedural canvas art and sound is synthesized.
three.js is vendored locally under `game/vendor/`.

## How to run

```bash
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Keyboard + mouse.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Orbit camera |
| Shift | Run |
| Space | Jump |
| E | Enter / exit car |
| F | Punch |
| Click | Shoot |
| P / Esc | Pause |
| M | Mute |

## Screenshots

Deterministic scenes rendered with `?shot=start|drive|chase|mission&seed=1`
(see `shots.json`); regenerate them with `node shots.mjs` and verify the game
end-to-end with `node playtest.mjs`.

## License

MIT — see `LICENSE`.
