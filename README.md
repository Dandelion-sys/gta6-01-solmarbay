# Solmar Bay

A sun-soaked coastal open-world crime game for the browser. You are Ryan and
Ian, a couple rebuilding their lives in a bay city — stealing cars, taking
jobs from Vera at The Brass Anchor, dodging the Bay Precinct, and pulling off
the Marina Royale vault heist together. The finale payout is computed in the
game from the most expensive aircraft plus the most expensive property, so
every run can pay out differently.

[![Solmar Bay](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01?ref=9y382syd)
[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/c/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank?ref=9y382syd)
[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/c/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward?ref=9y382syd)

## How to play

Explore the island city of Solmar Bay on foot and by car. Take story missions
from Vera, earn money from side jobs, buy cars, clothes, weapons and
properties, and keep the police off your back. Switch between Ryan and Ian
anytime — each has their own six-mission chain, and both must finish before
the vault heist unlocks. Save at the safehouse or from the pause menu.

### Key map

| Key | Action |
| --- | ------ |
| W A S D | Walk / drive |
| Shift | Run / boost |
| E | Interact / enter & exit car |
| F | Punch |
| Mouse click | Shoot (when armed) |
| Q | Focus (slow-motion aim) |
| Space | Jump |
| P | Phone |
| M | Big map |
| C | Switch Ryan / Ian |
| H | Horn |
| R | Reload |
| V | Camera view |
| Esc | Pause |
| N | Mute sound |
| Drag mouse | Look around |

## Systems

- Open world: seven districts, a causeway to Tern Isle, beaches, piers,
  a lighthouse, an airfield and a working day/night cycle with weather.
- Two protagonists: Ryan and Ian, shared wallet, shared wanted level,
  a bond meter that pays a bonus at dawn.
- Missions: six per hero plus the shared Marina Royale vault heist,
  with objective beams, timers and debriefs.
- Wanted system: six stars, patrol cars, roadblocks, helicopters and a
  city lockdown at six stars; witnesses, disguises and car swaps shed heat.
- Focus: slow-motion aiming that refills over time.
- Robbery preparation: scouting, back entrances, safe codes, camera disabling.
- Car-theft play: steal parked cars, change outfits to cool off.
- Weapons locker: pistols and rifles with wear, jams and cleaning.
- Wildlife compendium: photograph gulls, deer, alligators, herons and more.
- Safehouse upgrades and crew hiring: driver, lookout, hacker, muscle.
- Stranger missions: eight quirky passers-by with small paid quests.
- Bounty hunting: posters at the Bay Precinct board.
- Treasure hunts: three riddle chains across the map.
- Challenges: nine categories with bronze, silver and gold ranks.
- Sports: basketball, pool and boxing.
- Kayaking, scuba, base jumping, airboat swamp tours, hurricanes.
- BayRide and public transport: ride-share, bus and ferry.
- Phone 2.0: SnapShot social, car scanner, wildlife camera, radio.
- Radio and podcasts: three stations of synthesised music and talk.
- Body and stats: food, gym and sleep change strength, stamina and build.

## Run it locally

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game runs fully
offline — every script, image and sound is a local file or synthesised
in the browser. No build step, no network, no payments.

## Build the dossier

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Tech

Three.js 0.170.0, vendored under `game/vendor/`. Plain ES modules, fixed
1/60s simulation steps, Web Audio synthesis for all sound.

Built by Fahrian Hidayat Azwar (Dandelion-sys) — hagio.ryan@gmail.com
