# Solmar Bay

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the make.fun bounty **gta6-01 ("Make GTA 6")** — built by [Dandelion-sys](https://make.fun/bounty/gta6-01).

**Referral:** https://make.fun/?ref=9y382syd

## The game

Welcome to **Solmar Bay**, a sun-soaked coastal city of towers, palm-lined
boulevards, a marina and a long sandy beach. You are **Ian**, broke and
fresh out of the harbour district — with your partner **Ryan** a switch away
(**C**). The fixer **Marisol** has work for you — if you can handle the heat.

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

## V2 additions

V2 builds on the V1 city with a much bigger, Florida-shaped map and a long
list of new systems — all original, all offline, all synthesized or procedural:

- **Radio (F1)** — 3 original WebAudio synth stations: Solmar FM 88.5
  (synthwave), Bay Beats 101.1 (hip-hop), Coast Rock 95.3 (rock). **R** cycles,
  **M** mutes everything, station name on the HUD.
- **Weapon variety (F2)** — Pistol (infinite), Shotgun (5-pellet spread),
  SMG (hold to spray). **1/2/3** switch; glowing pickups around the city
  grant ammo; ammo count on the HUD.
- **Vehicle variety (F3)** — Motorcycles, bicycles, dune buggies, a muscle car
  (6th car type), plus horses (F15, gallop with Shift, jump with Space) and
  quad bikes / ATVs (F16). All enter/exit with **E**, each with its own
  handling.
- **Air & sea (F4)** — Flyable helicopters (light, transport, police),
  flyable planes (prop, jet, seaplane — all hijackable with **E**, pilot
  flees, +1 wanted), drivable boats, and 2 airports: Solmar Intl (long
  runway, terminal, hangar, tower, helipad) and Bay Airstrip (short runway,
  hangar). Ambient planes still fly by. Airports are marked **A** on the
  minimap.
- **World beyond the city (F5 + F10)** — Beach + sea, farmland, forest,
  desert hills, mountains ringing the map (with a winding road and a
  viewpoint), a highway out of town, a river + lake, keys islands, swamp,
  and a small west-coast town — laid out Florida-style: big city on the
  southeast coast, lake in the north-central basin, mountains north, keys
  south. Zones have their own culture: farm pedestrians in hats/flannel,
  beach pedestrians in bright clothes, old pickups in the countryside,
  buggies on the beach, city police (black-and-white) vs county Sheriff
  (tan) outside the city.
- **Carjacking (F6)** — Moving traffic cars can be jacked with **E**: the
  car stops, the driver flees, +1 wanted star.
- **Characters (F7)** — Two playable characters, switch with **C** (sky-zoom
  transition, name on screen + HUD, shared cash/missions): **Ian**
  (woman, coral shirt, hair bun) and **Ryan** (male, yellow shirt, blue cap).
  Marisol stays the fixer NPC.
- **Vest / armor (F8)** — Blue armor bar under the health bar; armor absorbs
  damage first. Vest pickups (+50, cap 100) scattered around the city.
- **Voice dialogue (F9)** — Marisol's mission lines spoken with the browser's
  built-in speechSynthesis (English, no files/network); **M** mutes speech.
- **Day/night (F11)** — A 9-minute game day: sun moves, sky shifts
  (pink morning, bright day, orange evening, dark night + stars + a visible
  moon), streetlights and headlights glow at night, clock on the HUD.
- **Rain (F12)** — Weather cycles clear ↔ rain: 1,400-drop particle rain,
  darkened sky, WebAudio rain noise, occasional lightning + thunder.
- **River + watercraft (F13)** — A winding river (lake → sea) with bridges,
  navigable by boat/jetski; jackable watercraft: yacht (slow), speedboat,
  jetski (nimble), river boat, plus moving boats to jack (captain flees,
  +1 wanted).
- **Drive-by + bounty (F14)** — Shoot from cars, bikes and boats (crosshair
  shown, lower accuracy while moving; heli excluded). Bounty = $250/star on
  the HUD; tiers scale up — 1★ patrols, 2★ faster, 3★ bounty hunters +
  roadblock, 4★ police helicopter, 5★ maximum. Marisol bounty targets
  (marked pink on the minimap, $600) spawn all over the map.
- **Races (F17)** — Checkpoint race from the airport flag (**T** to start):
  6 checkpoints across the whole map, 150 s, vs 1 AI racer; prizes
  $600–$1500 by time, repeatable.
- **Fishing (F18)** — Near water, press **F** to cast, wait for the bite,
  press **F** again to reel in: Sardine $10, Sea Bass $25, Bluefin Tuna $60,
  Golden Marlin $200.
- **Wild animals (F19)** — Deer, rabbits, birds, fish, wolves and a bear in
  the outer zones; passive animals flee, predators attack up close, hunting
  sells meat/hide ($15–$80).
- **Phone (F20)** — Press **U** for the in-game phone: Marisol's messages,
  call Marisol for a hint (voice + text), call a taxi (it drives to you),
  stats.
- **Gamepad (F21)** — Standard Gamepad API mapping: left stick move, right
  stick look, A jump, B punch, X enter/exit, Y weapon, LB radio, RB switch
  character, RT shoot, Start pause, Back phone.
- **Shops (F22)** — Approach a shop and press **E** for a buy menu: Binco
  Clothing in the city (outfits recolour the active character, $50–$150),
  Solmar Motors dealers in the city and on the farm (cars, motorcycles,
  quad bikes, horses — owned vehicles spawn nearby, no wanted level), and
  Bay Aircraft Sales at the airport (prop plane $2,000, jet $5,000,
  helicopter $3,000, luxury yacht $8,000 — delivered to the runway/helipad
  or marina). Shops are marked pink on the minimap; not enough cash = no sale.
- **Parachute (F23)** — Bail out of a plane/heli at height with **J**, then
  press **Space** while falling to open the parachute (visible canopy,
  steerable with WASD, soft landing). Falling from height without one hurts.
- **Terrain (F24)** — The ground is a real heightmap, not a flat plain:
  rolling hills outside the city, cliffs rising to the northern mountains,
  desert dunes, a beach sloping to the sea, per-zone ground colours, roads
  flattened along their corridors, lakes and river with clear banks.
  Players, cars, horses, pedestrians and animals follow the terrain height.
- **Finale heist (F25)** — Endgame, unlocked after M1–M3: start at the gold
  marker downtown (**H**), 4 stages in 300 s — airport vault, river bridge,
  marina, southern keys island. Grabbing the loot jumps wanted straight to
  5 stars (bounty hunters + police heli + roadblock). Payout is computed
  from the actual prices in the game: Luxury Yacht ($8,000) + Luxury
  Mansion ($50,000,000) = **$50,008,000**. Repeatable if it fails.
- **Property (F26)** — Buyable property, marked on the map, **E** for the
  buy menu: Small House $5,000, Apartment $15,000, Luxury Mansion
  $50,000,000 (the most expensive item in the game). A bought house is a
  safehouse: respawn there after being wasted (RESPAWN AT SAFEHOUSE button).
  Businesses earn passive income per minute: Bar $150, Garage $100,
  Workshop $200.
- **Businesses (F27)** — More buyable businesses, each with its own price
  and passive income: Golf Course $250,000 ($1,500/min), Nightclub $500,000
  ($3,000/min), Factory $750,000 ($5,000/min), Car Rental $120,000
  ($800/min), Gas Station $90,000 ($600/min). Owning a garage/workshop
  unlocks car customisation in its shop menu: paint ($500), sport wheels
  ($800), engine +15% ($2,000), handling +15% ($1,500).
- **Pay 'n Spray (F28)** — Drive a car into the blue canopy on the road at
  (-60, 84) and press **E**: pick a colour for $200 — the car is repainted
  and wanted stars are cleared immediately.
- **GPS (F29)** — A cyan dashed route line on the minimap from the player
  to the active mission objective, updating with the mission.
- **Street events (F30)** — Random events every few minutes: a stranger
  needs a ride (press **E** near them, drive them to the marker, $200) or
  a thief snatches a bag (chase him down, $150). Marked orange on the map.
- **Golf (F31)** — At the Solmar Golf Club, press **G**: 3 holes, direction
  + power sliders, par 12 total — beat par to win $500.
- **Peds (F32)** — Pedestrians have random behaviour types (calm,
  emotional, maniac) and crowds follow the time of day: rush hour busy,
  midday moderate, night quiet, beach busy at midday. Punched peds react:
  angry ones fight back, scared ones scream and run away.
- **New weapons (F33)** — Knife (key 4, melee, faster + nastier than a
  punch), Grenade (5, thrown, area explosion), Molotov (6, thrown, burning
  fire patch). Ammo is limited — buy more at Bay Arms or grab glowing
  pickups on the map.
- **Bazooka (F34)** — The strongest weapon (key 7): rocket with a big
  explosion that downs peds/police and destroys vehicles nearby. Very
  limited ammo: $5,000 for the launcher, $800 per rocket at Bay Arms, or a
  rare glowing pickup.
- **Barber + tattoo (F35)** — Solmar Barber: haircuts (short, long,
  mohawk, bald) + hair colour, applied to the active character at once.
  Ink Bay Tattoo: dragon/snake arm, rose chest, skull back tattoos —
  several can be stacked on the character model.
- **Police bikes (F36)** — At 2+ stars, police motorcycles join the chase:
  faster and more agile than police cars, weaving between traffic, more of
  them at higher stars (up to 3 at 5 stars).
- **Emergency vehicles (F37)** — Fire truck + ambulance with strobe
  lights + siren, parked at the fire station (-132, 60) and hospital
  (132, -60), both marked F/H on the map, drivable with **E**. Side jobs:
  firefighter (drive the fire truck to random fires, $300) and paramedic
  (pick up an injured ped in the ambulance, deliver to the hospital, $400).
  Fire trucks/ambulances also pass on the road as ambient traffic.
- **Taxi + bus (F38)** — Yellow taxis parked in the city (hijackable, also
  callable via the phone) and a drivable city bus. Ambient buses run a
  fixed route with 4 marked stops. Driver jobs with **B**: taxi fares
  ($100–$200) and the bus route ($50 per stop, $200 bonus).
- **Sniper rifle (F39)** — Key 8: huge damage, 220-unit range, slow fire
  rate, limited ammo ($2,000 rifle, $200 per 5 rounds at Bay Arms). Scope:
  right-click or **V** to zoom (fov 18, scope overlay).
- **Skills (F40)** — Driving, Shooting and Stamina level up with use
  (drive fast, hit targets, sprint) — up to level 10, with small bonuses
  (faster cars, tighter aim, faster running). Shown in phone stats.
- **Hidden packages (F41)** — 50 glowing gold packages hidden across the
  whole map (alleys, forest, beach, mountains, farm, desert). Counter in
  the HUD (📦 n/50) and stats. All 50 = +$10,000 and a gold supercar
  downtown.
- **Photo mode (F42)** — Press **O**: the game pauses, the HUD hides, and
  the camera flies freely (WASD + Q/E up/down, mouse drag to look). Press
  **Enter** to save a PNG photo, **O** to exit.
- **Character missions (F43)** — Each character has their own mission line,
  started with **N** (progress tracked per character, money shared):
  Ryan — Harbour Hustle, Desert Run, Airport Pickup; Ian — Lake Flower
  Run, Nightclub Delivery, Mountain View.
- **Story: Ryan & Ian are a couple** — The intro establishes it, duo
  dialogue scenes play after each mission, and during story missions the
  partner follows as an AI companion (rides in the car, helps shoot cops).
- **Shops (F22)** — Approach a shop and press **E** for a buy menu: Binco
  Clothing in the city (outfits recolour the active character, $50–$150),
  Solmar Motors dealers in the city and on the farm (cars, motorcycles,
  quad bikes, horses — owned vehicles spawn nearby, no wanted level), and
  Bay Aircraft Sales at the airport (prop plane $2,000, jet $5,000,
  helicopter $3,000 — delivered to the runway/helipad). Shops are marked
  pink on the minimap; not enough cash = no sale.
- **Parachute (F23)** — Bail out of a plane/heli at height with **J**, then
  press **Space** while falling to open the parachute (visible canopy,
  steerable with WASD, soft landing). Falling from height without one hurts.
- **Terrain (F24)** — The ground is a real heightmap, not a flat plain:
  rolling hills outside the city, cliffs rising to the northern mountains,
  desert dunes, a beach sloping to the sea, per-zone ground colours, roads
  flattened along their corridors, lakes and river with clear banks.
  Players, cars, horses, pedestrians and animals follow the terrain height.
- **Finale heist (F25)** — Endgame, unlocked after M1–M3: start at the gold
  marker downtown (**H**), 4 stages in 300 s — airport vault, river bridge,
  marina, southern keys island. Grabbing the loot jumps wanted straight to
  5 stars (bounty hunters + police heli + roadblock). Payout is computed
  from the actual prices in the game: the most expensive aircraft-shop item
  (Luxury Yacht, $8,000) + the most expensive property (Luxury Mansion,
  $50,000,000) = **$50,008,000** — exactly enough to buy both.
  Repeatable if it fails.
- **Mission spread** — M1 marina (beach), M2 docks (north) → Solmar Intl
  airport (far west), M3 anywhere; races, bounty targets and fishing span
  city, beach, countryside, forest, mountains, airport, lake and river.

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
| E | Enter / exit car (or jack a moving car / boat / plane) |
| E | Open a shop / property menu at the door |
| F | Punch (or cast / reel in while fishing near water) |
| Click | Shoot (works from cars, bikes and boats too) |
| 1–8 | Pistol / Shotgun / SMG / Knife / Grenade / Molotov / Bazooka / Sniper |
| V / Right-click | Sniper scope zoom |
| R | Cycle radio station |
| C | Switch character (Ian ↔ Ryan) |
| N | Start the active character's personal mission |
| B | Start a taxi / bus driver job (in a taxi or bus) |
| H | Start the finale heist (at the gold marker, after M1–M3) |
| J | Bail out of a plane/heli (parachute with Space) |
| G | Play golf (at the golf course) |
| O | Photo mode (Enter takes the photo) |
| T | Start checkpoint race (at the airport flag) |
| U | In-game phone (Marisol, taxi, stats) |
| P / Esc | Pause |
| M | Mute |

## Screenshots

Deterministic scenes rendered with `?shot=start|drive|chase|mission&seed=1`
(see `shots.json`); regenerate them with `node shots.mjs` and verify the game
end-to-end with `node playtest.mjs`.

## Author

Built by **Fahrian Hidayat Azwar** ([Dandelion-sys](https://github.com/Dandelion-sys)) — hagio.ryan@gmail.com

## License

MIT — see `LICENSE`.
