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

## Round 4 additions

This round adds a second wave of things to do in the bay, all wired into the
same HUD, minimap, pause flow and save file as the rest of the game.

- **Coral Cay** — a small island off the east coast with a striped lighthouse
  whose beam sweeps at night, eight cottages, market stalls, a pier and five
  locals who walk the ring road and greet you. Six glowing shells hide around
  the island; each pays $150, and the full set pays a $900 bonus.
- **Hovercraft** — two fan-driven craft (one on the beach, one at the Cay pier)
  that skim across the sea and climb straight onto land and the island. They
  steer like a boat on water and grip like a car on land.
- **Marisol's chain** — four extra story jobs that open once the main missions
  are done. Press L: tail a courier without being spotted, photograph a
  handshake at the plaza (X, from the right distance), run four drops against
  the clock, then walk a witness home while staying close. Rewards run
  $700–$1500, plus a $1000 loyalty bonus for finishing all four.
- **Darts** — the bar with the pink neon sign east of downtown. Press K, aim
  with the arrow keys while your hand sways, Enter throws. Three darts a turn;
  60+ points pays $120, 100+ pays $250, 140+ pays $400.
- **Race league** — every checkpoint race now counts toward a five-round
  season against rivals Vex, Nova and Rook. Win the season for a $2000
  champion bonus; standings show under the cash panel.
- **Job board** — a wooden board near the north-west plaza. Press Z for five
  repeatable timed jobs: parcel dash, bay tour, street sweep, night patrol
  and a ferry run out to the Cay.
- **Random events** — five new ones arrive on their own: stop a masked
  robbery, beat a challenger supercar to a beacon, fix a stranded driver's
  smoking car by standing with it, walk a lost tourist to the plaza, and
  catch a runaway fruit cart.
- **Salvage diving** — four buoys with blue rings mark dive sites on the east
  coast. Swim to one, press X, and search the seabed for eight glowing
  crates at $200 each. You get 35 seconds of air per dive; surfacing early
  with X is free, running out costs 15 health.
- **The Cay ferry** — a blue-and-white ferry loops between the mainland pier
  and the Cay pier all day, free to ride. Press E near it to board, E again
  to step off. It is the slow, scenic way across if you do not fancy the
  hovercraft.
- **Bay storms** — every few minutes a storm rolls in for 45 seconds: rain,
  lightning flashes and a darker sky. It is only weather, but it makes the
  night drives feel properly dramatic.
- **Scenic viewpoints** — five gold-ringed photo spots (beach, dunes, peaks,
  lighthouse, runway). Stand in one and press X for an $80 photo; all five
  pays a $300 magazine bonus.
- **Buried loot** — buy the $50 treasure map at Nadia's keepsake stall on the
  Cay and five X-marked mounds appear around the bay. Hold F at a mound to
  dig it up ($150–$390 a stash, $400 bonus for all five).
- **Keeper Ansel** — the lighthouse keeper on Coral Cay wants three fish for
  his supper. Talk to him (E), catch three fish anywhere, come back for
  $600.
- **Smuggler coves** — three purple-lit coves around the coast only open at
  night. Press E at one to take a package to a buyer in 100 seconds for
  $350 — but the drop is seen, so you pick up a star of heat. One run a
  night; five runs pays a $500 loyalty cut.
- **Cay ring bus** — a free bus loops the island ring road and stops at the
  lighthouse, market, pier and north stop. Press E to ride, E to hop off.
  Three rides earns a $100 tip from the driver.

### Getting to Coral Cay

Three ways across, fastest first: take a hovercraft from the beach (orange,
south of the marina) or the Cay pier (blue, already on the island side);
ride the ferry from the mainland pier east of the beach; or drive a boat
out and swim the last stretch. On the island, the market, the darts bar
back on the mainland, and the job board are all marked on the minimap.

| Key | Round 4 action |
| L | Start the next Marisol chain job (after M1–M3) |
| X | Photograph a meeting / a viewpoint / dive at a buoy |
| K | Darts at the pink-neon bar |
| Z | Job board near the north-west plaza |
| E | Board the ferry / open a market stall (near one) |

### Round 4 quick reference

| System | Where | Trigger | Best payout |
| Coral Cay shells | Island, six glowing shells | Walk into one | $150 each, $900 set bonus |
| Hovercraft | Beach (orange), Cay pier (blue) | E to board | — |
| Marisol chain | Anywhere, after M1–M3 | L | $700–$1500 a job, $1000 chain bonus |
| Darts | Pink-neon bar, east downtown | K, arrows aim, Enter throws | $400 a turn |
| Bram's challenge | Same bar, gold-vested Bram | E near Bram | $500 (90+ in one turn) |
| Race league | Airport flag | T, win races | $2000 a season |
| Job board | Wooden board, north-west plaza | Z | $180–$300 a job |
| Random events | Anywhere | Automatic, every minute or so | $100–$400 |
| Salvage diving | Blue-ringed buoys, east coast | X near a buoy | $200 a crate, $500 set bonus |
| Night market | Coral Cay plaza | E near a stall | Charms set $250 |
| Viewpoints | Five gold rings | X in a ring | $80 each, $300 set bonus |
| Ferry | Mainland pier ↔ Cay pier | E to board | Free |
| Bay storms | Everywhere | Automatic | — |
| Buried loot | Five mounds, map $50 at Nadia's stall | Hold F at a mound | $150–$390, $400 set bonus |
| Keeper Ansel | Cay lighthouse | E, then catch 3 fish | $600 |
| Smuggler coves | Three purple coves, night only | E at a cove | $350 a run, $500 for five |
| Cay ring bus | Island ring road | E to ride | $100 after three rides |

### Round 5 testing

- `node --check game/src/main.js` passes (syntax).
- `node playtest.mjs` from `~/workspace/make-fun/gta6-01` must print
  `PLAYTEST ALL PASS` (103/103). The playtest exercises the base game end
  to end; Round 5 systems are exercised by the in-game self-test below.
- In the browser console, `window.__solmar.r5selftest()` runs 40 checks
  over every Round 5 system (garage parts, casino maths, tackle, heli,
  seasons, empire, ramps, postcards, lessons, gym plans, stocks, districts,
  gifts, boat race, furniture, heat zones, responder, achievements, radio,
  rivals, daily bonus, loyalty, ticker and forecast) and returns
  `{ total, passed, failed, checks }`. `window.__solmar.r5` exposes every
  Round 5 state object and opener, so a reviewer can drive each system
  from the console: `r5.openGarage()`, `r5.spin()`, `r5.buyCab()`,
  `r5.startBoatRace()`, `r5.startSchool()` and so on.
- `node cli/makefun.mjs check --repo ~/workspace/make-fun/gta6-01/entry
  --worktree` from the kit directory must pass.
- The four screenshots are unchanged: no Round 5 building sits inside the
  four shot framings, and no Round 5 system changes a shot scene.
- Economy check: the biggest single Round 5 payout is the $500 slots
  jackpot and the $500 postcard set bonus. The finale payout logic and all
  pre-existing prices and rewards are untouched.

### Round 4 design notes

A few choices made while building this round, for anyone picking the game
up later:

- **The island is reachable three ways on purpose.** A fast player takes
  the hovercraft, a patient one takes the ferry, and a broke one can still
  swim from a boat. No new content should ever sit behind a paywall or a
  single expensive vehicle.
- **Every new system pays in small amounts.** The biggest single new payout
  is the $2000 league title; most jobs pay $100–$400. Nothing here touches
  the finale heist payout or any existing price or reward.
- **Night matters.** The smuggler coves only open after dark, the lighthouse
  beam only reads at night, and the storm rolls in on its own clock. The
  day/night cycle was already there; this round just gives it things to do.
- **Progress survives reloads.** Shells, crates, viewpoints, loot, keeper
  progress, league standings, chain progress and bus rides are all saved in
  the browser's local storage alongside the main save, so a player never
  loses a half-finished collection to a refresh.
- **Nothing here needs a new key the player must learn twice.** L, X, K and
  Z are the new ones; E does the context-sensitive work (ferry, bus, cove,
  keeper, Bram, market) depending on what is nearest, and the hint bar at
  the bottom of the screen lists them all.
- **Performance on slow machines.** The frame-time clamp in the main loop
  was widened from 0.05 to 0.1 seconds so the game does not crawl in
  software rendering; at normal frame rates nothing changes. The lighthouse
  uses an emissive lamp room rather than an extra scene light, and the
  island palms were kept to seven, for the same reason.

### Known limits (Round 4)

- The ferry and the ring bus carry you as a passenger; while aboard you
  cannot walk, shoot or enter a vehicle until you step off with E.
- Diving uses the seabed as its floor, so the water is shallow in places
  and the dive feels more like wading in the shallows than deep water.
  Oxygen is the real limit, not depth.
- The smuggler coves open only at night and only once per game night; if
  you start a run and the sun comes up, the run still counts, but the next
  one waits for the next night.
- The darts champion Bram only takes one challenge a day. If you lose, the
  next try is tomorrow.
- Buried-loot digging holds F, which is also the punch key — do not dig
  next to a pedestrian you like.

## Screenshots

Deterministic scenes rendered with `?shot=start|drive|chase|mission&seed=1`
(see `shots.json`); regenerate them with `node shots.mjs` and verify the game
end-to-end with `node playtest.mjs`.

## Author

Built by **Fahrian Hidayat Azwar** ([Dandelion-sys](https://github.com/Dandelion-sys)) — hagio.ryan@gmail.com

## Round 5 additions

Round 5 adds twenty fresh systems on top of the Round 4 game. Nothing here
repeats Round 4 (no island, no hovercraft, no darts, no league, no diving,
no coves). Every reward is modest and fits the existing economy.

- **Solmar Customs garage** — **E** (or **Y**) at the orange workshop beside
  the Pay 'n Spray, south side. Eight paints ($150–$300), four wheel sets,
  four engines (up to +25% top speed) and four nitro kits (up to 8 seconds —
  hold **Shift + W** in the car to burn it). Tunes are saved per car and
  survive re-entering it.
- **Solmar Sands casino** — **E** (or **I**) at the pink-and-gold casino,
  north-east of the grid. Slots cost $20 a spin (three of a kind pays
  $100–$500, a pair pays $10); blackjack costs $50 a hand (beat the dealer,
  21 pays double, up to $150). In-game cash only — no real money anywhere.
- **Fishing tournaments + tackle** — a two-minute tournament starts
  automatically every few minutes of play. Every fish caught during it scores
  points by species (10–100); 200+ points pays $400. The tackle shop (phone
  → Tackle shop) sells four rods, the best doubling every catch value.
- **Pursuit helicopter + spike strips** — at 3 wanted stars a police
  helicopter joins the chase with a sweeping searchlight that slows wanted
  decay. At 4 stars the police lay spike strips ahead of your road; drive
  over one and your tyres are shredded (top speed cut for 8 seconds).
- **Seasons + weather fronts** — spring, summer, autumn and winter, four
  game days each. Every season change pays a $150 festival bonus. Travelling
  weather fronts roll in on a timer: sea breezes, rain fronts, calm highs
  and gusty squalls that push boats sideways.
- **Taxi + delivery empire** — **E** at the yellow depot, west side. Buy up
  to three cabs ($1,500 each), hire drivers ($200 each, $60 a day in wages).
  A cab with a driver earns $25 a minute while you roam, $8 without one.
  Parcel runs pay $180 for a 90-second delivery across the bay.
- **Stunt jumps** — six yellow ramps around the bay. Hit one fast, fly, land
  cleanly: airtime and distance are scored, prizes pay up to $300 a jump,
  and the five best jumps live on the leaderboard (phone → Stunt leaderboard).
- **Photo postcards** — eight floating golden cards at scenic spots (Sunset
  Beach, the airport tower, the north lake, the mountain pass, the south
  keys, the fire station corner, the golf greens, the harbour lights).
  **E** collects one for $60; the full set pays a $500 bonus.
- **Flight school** — **E** at the blue schoolhouse at Solmar Intl. Three
  lessons in a yellow stunt plane: takeoff ($150), fly through the golden
  sky ring ($200), and land gently on the runway ($250). Pass all three and
  earn the pilot's badge.
- **Bay Iron gym** — **E** at the gym, east side. Five training plans at $30
  a session, each banking 20–30 real skill XP (driving, shooting, stamina)
  with coach Dara. Five sessions in a row earn a free shake and $25.
- **Stock market** — phone → Stocks. Six bay companies (BAY Ferries, PALM
  Resorts, Solmar Fisheries, Customs Auto, Sands Casino Group, Solmar Golf
  Club). Prices random-walk every minute of play and drift back toward their
  base; dividends pay $2 a share at dawn.
- **District influence** — five districts (Harbour, Marina, North Docks,
  Airport, Beachfront). Races, stunt jumps and deliveries raise influence
  where they happen; it decays slowly. Above 60 you run the district and it
  pays $40 a minute. The minimap shows each district's colour.
- **Ryan & Ian bond** — phone → Gifts & dates. Four gifts ($40–$450,
  +8 to +40 bond) and sunset date nights ($120, +15 bond). At 50+ bond your
  partner leaves $100 and heals you 10 health every dawn.
- **Boat races** — **E** at the pink flag at the marina. Three pink buoys,
  150 seconds, in the fast pink boat. Win pays $350, a new best time $450.
- **Safehouse decorating + fast travel** — **E** at the harbour safehouse.
  Five furniture pieces ($180–$900) raise comfort, and comfort heals you
  while you stand at home. Fast travel to your next owned property costs
  $25 a hop.
- **Wanted-heat zones** — North Docks, Casino Row and the Airport Perimeter.
  Inside a zone the law watches closer: wanted decays slower and crimes
  add up to 2 extra stars. The HUD warns you when you cross into one.
- **Responder night shifts** — **E** at the hospital (ambulance, three
  patients) or the fire station (fire truck, two fires). 180 seconds, $220
  a completed shift.
- **Friday car meets** — Friday nights at the marina. Bring a tuned car from
  Solmar Customs: paint, wheels, engine and nitro each score, and the best
  car on the night takes $300.
- **Achievements** — phone → Achievements. Twelve achievements (Fresh Paint,
  Jackpot, Master Angler, Fleet Boss, Airtime, Postman, Licensed Pilot, Iron
  Bay, Bay Bull, King of the Bay, Soulmates, Saltwater Racer), each paying a
  one-time $100–$300 bonus the moment it is earned.
- **Rival street racers** — three rivals (Vex, Mara, Dune) cruise the bay
  in tuned muscle cars. Pull up beside one in your own car and press **E**:
  a drag race to a random landmark, 75 seconds, with a wager of $150–$400
  that grows by $100 every time you beat them. Rivals drive themselves to
  the beacon, so you have to be genuinely faster.
- **Daily bay bonus** — the first time you play on a new game day, Marisol
  leaves $100 on the safehouse step. Small, steady, and it rewards showing
  up.
- **Garage loyalty** — every fifth tune at Solmar Customs is free. The
  garage stamps your card at the till and remembers a loyal customer.
- **Bay news ticker + forecast** — a news ticker reads live bay news across
  the screen every three minutes, and the phone's stats screen gains a
  Round 5 forecast: season, tournament, fleet, stocks, bond, districts,
  postcards, rivals and achievements in one glance.
- **Radio DJ chatter** — two new stations on the dial (**R** to cycle):
  Sunset Jazz 99.9 and Turbo Pop 107.7. Their DJ reads live bay news every
  few minutes: the season, the tournament, your fleet earnings, your bond,
  heat warnings, stunt records and stock prices.

### Round 5 quick reference

| Key | Round 5 action |
| --- | --- |
| E near garage / Y | Open Solmar Customs |
| E near casino / I | Open Solmar Sands casino |
| U → Tackle shop | Buy fishing rods |
| U → Stocks | Buy and sell shares |
| U → Gifts & dates | Gifts and date nights |
| U → Stunt leaderboard | Best five jumps |
| U → Achievements | Twelve achievements |
| E at depot | Taxi empire: cabs, drivers, parcels |
| E at gym | Train with coach Dara |
| E at flight school | Start the next flying lesson |
| E at safehouse | Furniture and fast travel |
| E at marina flag | Start a boat race |
| E at hospital / fire station | Start a responder night shift |
| E at a golden card | Collect a postcard |
| E beside a rival (in your car) | Challenge them to a drag race |
| Every new game day | $100 daily bay bonus from Marisol |
| Every fifth garage tune | Next tune free (loyalty card) |

### Round 5 design notes

- The garage, casino, gym, depot, school and safehouse are all new
  buildings placed on empty ground, so no Round 4 scene changes. The four
  screenshots are unchanged.
- Nitro and engine boosts are applied after the base car's speed clamp, so
  a tuned car is genuinely faster without touching the base handling code.
- The stock market is a mean-reverting random walk: prices drift back
  toward their base, so no share runs away forever and no strategy prints
  money. Dividends are the slow, honest return.
- District influence decays every minute, so running the bay takes upkeep,
  not one good afternoon.
- The pursuit helicopter only appears at 3+ stars and leaves when the heat
  drops, so it never interferes with the opening missions.

## Round 6 additions

Round 6 adds twenty-four fresh systems on top of the Round 5 game. Nothing
here repeats Round 4 or Round 5 (no island, no hovercraft, no darts, no
garage, no casino, no fishing tournaments, no stocks, no bond gifts). Every
reward is modest and fits the existing economy. All 24 open with **E** near
the place, and the phone (U) has three new buttons: Round 6 stats, Round 6
guide, and Round 6 extras.

- **Solmar Metro** — **E** at any of the four stations (Marina, Old Town,
  Casino Row, North Docks). A metro card costs $40 and makes every ride free;
  without one the fare is $5. Riding takes 2 seconds and drops you at the
  destination platform. Dodge the fare and inspectors catch you 30% of the
  time (wanted +1). Three lines: Blue, Pink and Green.
- **Food truck** — **E** at a pitch (orange flag). Buy the truck for $2,500,
  then cook five menus ($12–$22) at six pitches around the bay. Customers
  arrive on their own and pay the menu price plus tips; a five-star health
  rating doubles every tip. A hygiene check costs $60. Catering gigs pay
  $210–$480 (phone → Round 6 extras).
- **Surfing + lifeguard** — **E** at the surf shop on the beach or at a break
  buoy. Four boards ($120–$950), three breaks (Sunset Point, Coral Barrel,
  North Swell). Every ride scores points and pays by the point; rescues pay
  $90; the surf comp pays $450 to the best ride of 70+ points.
- **Skate / BMX park** — **E** at Concrete Wave Park. Eight tricks (Kickflip
  to Backflip Drop, +30 to +120 points) chain into combos; bailing wipes the
  combo. Bank a combo for 40% of its points in cash. A 500+ combo earns a
  sponsor ($60 a day); the weekend comp pays $380.
- **Movie studio stunt career** — **E** at Solmar Studios. Four gigs
  ($160–$320) build the star meter to 100; bigger gigs need more stars.
  Getting hurt costs 15 health. The weekly shoot pays $520 at 80+ stars.
- **Nightclub ownership** — **E** at The Bluefin. Buy the club for $8,000,
  book one of four DJs ($120–$500, +18 to +60 vibe), open the doors for the
  night's take, and upgrade the lights, bar and sound ($900 each). A full
  house at 90+ vibe pays $600 a night.
- **Tattoo parlor** — **E** at Ink & Salt. Six tattoos ($90–$700) each grant
  a permanent skill boost (+5 to +12 driving, shooting or stamina). Walk-in
  clients pay $70; completing the 12-design flash book pays $350.
- **Street art crew** — **E** at a mural wall. Six murals need crew rep (0
  to 80) and spray cans (3 packs, $25–$110). Finishing a wall pays $80 plus
  $60 per size and raises rep; all six pay $500 extra. Tagging heat fades
  over time but at 3+ the police notice (wanted +1).
- **Horse ranch** — **E** at Rancho del Sol. Four horses ($600–$2,800),
  training ($40 a session), ranch races ($420 a win), stable income per
  horse, and breeding: two horses plus $200 makes a foal.
- **Golf + mini-golf** — **E** at Solmar Greens (9 holes, par 35) or the
  beach mini-golf. A round costs $45; beating par pays $200. Caddying pays
  $35 a round. Club tournaments pay $350; mini-golf costs $15, a hole-in-one
  pays $60. The driving range (extras) is $20 for +1 driving.
- **Bowling alley** — **E** at Strike Lanes. A game costs $20; 200+ pays
  $120, a perfect game (280+) pays $600. League nights pay $300 to a 200+
  bowler. Fries cost $8 and heal 5 health.
- **Arcade hall** — **E** at Neon Palace. Five retro cabinets (Bay Blaster,
  Turbo Taxi, Palm Fighter, Deep Dive, Disco Dance), tokens $5 each, beating
  a cabinet's top score pays $150, and 100 tickets trade for $80 at the
  prize shelf. Weekly tournaments pay $220.
- **Library + rare books** — **E** at Solmar Library. Twelve rare books
  hide in the stacks (shelves A1–D4); each one read grants a permanent skill
  boost (+3 to +7). Reading all twelve pays $400. The book club pays $120
  a session.
- **Museum** — **E** at the Bay Museum. Four exhibits to tour for tips
  ($25–$55 a tour), four lost artifacts to return ($110 each), and a night
  at the museum quiz night ($250, needs 3 tours first). The gift shop sells
  golden gull souvenirs.
- **Carnival / fairground** — **E** at the Solmar Fair. Ride the Ferris
  wheel ($12), play ring toss ($10 for 3 rings, 2+ hits pay $45), bumper
  cars ($15, last car spinning wins $40), and watch the fireworks show from
  the front row for $200. A season pass costs $180.
- **Zoo** — **E** at the zoo gate or an enclosure. Entry is $30; feeding an
  animal costs $15 and pays back $25. Feeding all six in one day pays a
  $150 keeper bonus. Photographing the rare white gull pays $300.
- **Photography studio** — **E** at Lightbox Studio. Four portrait themes
  ($90–$150 a session), a weekly photo contest ($280), gallery prints that
  sell for $95 while you are out, and a darkroom that develops one free
  print per session.
- **Wedding planner** — **E** at a vendor or the little white chapel. Ryan
  and Ian are getting married: five vendor quests (florist $300, baker $350,
  tailor $400, photographer $250, chapel keeper $500) lead to the ceremony
  finale, which pays $600 in guest gifts. A honeymoon on Coral Cay costs
  $900 (extras).
- **Band career** — **E** at a venue stage. Form the band for $200 (Ryan on
  guitar, Ian on vocals), play gigs at four venues ($120–$800, fans unlock
  the bigger rooms), rehearse to grow fans, record albums ($500) that sell
  at dawn, and sell merch at gigs.
- **Busking** — **E** at a street pitch. Five pitches around the bay; play a
  song to gather a crowd (crowd meter to 100) and the hat fills with tips.
  A full crowd at the marina pitch pays a $150 street-star bonus.
- **Real estate flipping** — **E** at a rundown flat. Four flats ($1,800–
  $3,100), three renovation stages ($300, $600, $900), sell at stage three
  for up to $5,100 plus $500 per stage, or keep a flat for $45 a day in
  rent. An estate agent licence costs $400.
- **Pawn shop + antiques** — **E** at Old Tom's Pawn or at a gold glint.
  Ten antiques hide around the bay; Old Tom appraises free, sells at the
  appraised price, or haggles (55% chance of +25%). Finding all ten pays a
  $900 set bonus. Pawn loans of $300 are available (extras).
- **Firefighter career** — **E** at the Bay Fire Station or at a fire.
  Five callouts ($160–$480, the warehouse fire is the big one), hose play
  with a tank that drains and refills, and three station upgrades ($700
  each, +50 hose tank). The station cat rescue pays $60.
- **Paramedic career** — **E** at Bay General Hospital or at a patient.
  Five callouts ($150–$420); triage matters — severe cases must be
  stabilised first, rushing one costs 5 hospital rep. At 80+ rep the
  hospital pays $300 a week. A first-aid course costs $90 for +10 rep.
- **Round 6 badges** — twenty-four badges, one per system, each paying $50
  the first time it is earned (first metro ride, 25 dishes served, 80+ surf
  ride, 500+ skate combo, 80 stars, 5 club nights, 3 tattoos, all 6 murals,
  3 horses, a golf tournament win, 10 strikes, an arcade top score, all 12
  books, all 4 artifacts, 10 wheel rides, all 6 animals fed, 10 photo
  sessions, the wedding, 300 band fans, a 100 busking crowd, 2 flips, all
  10 antiques, 5 fires out, 5 patients saved).
- **Round 6 extras, guide and stats** — phone (U) → Round 6 extras opens
  the second layer: catering, board wax, film rotation, VIP lists, crew
  recruitment, horse breeding, driving range, bowling team, arcade
  tournaments, gift shop, season pass, keeper talks, darkroom, honeymoon,
  band merch, street album, estate licence, pawn loans, station cat and
  first-aid course. The guide lists all 24 systems with locations; the
  stats screen shows every count plus the earnings ledger.

### Round 6 quick reference

| Key | Round 6 action |
| --- | --- |
| E at a station | Ride the metro (card $40 / fare $5) |
| E at a pitch flag | Food truck menus and serving |
| E at surf shop / buoy | Buy a board, catch a wave |
| E at the skate park | Tricks, combos, sponsor |
| E at Solmar Studios | Stunt gigs and star meter |
| E at The Bluefin | Nightclub: DJs, nights, upgrades |
| E at Ink & Salt | Tattoos and walk-in clients |
| E at a mural wall | Paint the wall (needs cans + rep) |
| E at Rancho del Sol | Horses, training, races |
| E at Solmar Greens | Golf round / tournament |
| E at Strike Lanes | Bowl a game / league night |
| E at Neon Palace | Arcade cabinets and tickets |
| E at the library | Read rare books / book club |
| E at the museum | Tours, artifacts, quiz night |
| E at the fair | Wheel, ring toss, bumper cars |
| E at the zoo | Feed animals / safari photos |
| E at Lightbox Studio | Photo sessions / contests |
| E at a vendor / chapel | Wedding quests / ceremony |
| E at a venue stage | Band gigs and albums |
| E at a street pitch | Busk for hat tips |
| E at a flat | Buy, renovate, flip or rent |
| E at Old Tom's / glint | Pawn antiques, haggle |
| E at fire station / fire | Firefighter callouts |
| E at hospital / patient | Paramedic callouts |
| U → Round 6 extras | Second-layer actions |
| U → Round 6 guide | All 24 systems + a daily tip |
| U → Round 6 stats | Counts + earnings ledger |

### Round 6 design notes

- The metro, food truck, surf shop, skate park, studio, club, tattoo
  parlor, ranch, golf course, bowling alley, arcade, library, museum, fair,
  zoo, photo studio, chapel, arena, flats, pawn shop, fire station and
  hospital are all new buildings placed on empty ground, so no Round 5 scene
  changes except the four shot framings, which gained visible Round 6 props.
- The four screenshots were regenerated in this round: carnival fireworks
  over the title skyline, a food truck and two billboards downtown, a
  striped police roadblock in the chase, and gold mission crates with a tall
  banner at the airport beacon.
- All Round 6 money moves through one wallet (state.cash) and one ledger
  (earned / spent / jobs), so the phone stats screen can show exact profit.
- Round 6 badges pay $50 each and are checked in the daily routine, so a
  badge earned mid-session pays the next time the routine runs.
- The wedding is Ryan and Ian's story: five vendors, one chapel, one
  ceremony. No other couple is named anywhere in the game.

## License

MIT — see `LICENSE`.
