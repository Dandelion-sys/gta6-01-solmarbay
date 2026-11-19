# Solmar Bay

A sun-soaked coastal open-world crime game in the spirit of GTA 6, played in
a desktop browser from its own files. Explore a bay island city on foot and
by car, steal and drive cars, take missions from Vera at The Brass Anchor,
earn and spend money, deal with the police, and build a life of crime and
side hustles. Two protagonists share the story: Ryan, a former advertising
man rebuilding his life, and Ian, his sharp, fearless partner. Switch between
them; they share one wallet. The finale is the Marina Royale vault heist,
whose payout the game computes from the most expensive aircraft plus the
most expensive property for sale in the game.

[![Solmar Bay](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01?ref=9y382syd)
[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/c/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank?ref=9y382syd)
[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/c/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward?ref=9y382syd)

Built by Fahrian Hidayat Azwar (Dandelion-sys) — hagio.ryan@gmail.com

## How to play

Start at the title screen and press Start. Walk to The Brass Anchor bar in
Palm Quay and talk to Vera to take a mission. Follow the gold beam and the
minimap marker. Earn money, buy cars, weapons, clothes and properties, and
stay out of jail. Save at the safehouse or from the pause menu.

### Key map

- W A S D — Walk / drive (W = forward, away from the camera)
- Shift — Run (on foot)
- Mouse drag — Look around / camera
- E — Enter or exit car / interact with nearest thing
- Space — Punch (on foot) / handbrake (driving)
- F — Aim and shoot with owned weapon
- Q — Focus slow-motion aiming
- P — Phone
- M — Map
- C — Switch Ryan / Ian (at safehouse or via phone)
- R — Reload / repair weapon
- Esc — Pause menu
- H — Horn

## Systems

City with seven districts (Palm Quay, Coral Row, Sunset Fields, Gull Point,
Mangrove Flats, North Docks, Tern Isle); walking and driving; traffic and
pedestrians; wildlife (gulls, pelicans, dogs, deer, alligators); police with
a 1–6 star wanted level, roadblocks, helicopters and a six-star lockdown;
two six-mission story chains plus the computed-payout finale; money, shops
and properties; HUD with minimap; phone apps (BayRide, camera field guide,
SnapBay social, car scanner, jobs, radio); save/load; day/night cycle and
weather (clear, cloudy, rain, storm); synthesised Web Audio sound and three
radio stations; reputation; witness and disguise wanted; Focus slow-motion;
robbery preparation; car-theft minigames; weapon lockers and wear; wildlife
compendium; safehouse upgrades and crew; stranger missions (8); bounty
hunting; treasure hunts (3 clue chains); challenges (9 categories, bronze /
silver / gold); sports (basketball, pool, boxing); kayaking and scuba;
base jumping; airboat swamp tours; hunting lodge and pelts; hurricanes;
public transport and the island ferry; body and stats (food, gym, sleep).

## Run locally

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No network is needed;
every file the game loads is under `game/`.
