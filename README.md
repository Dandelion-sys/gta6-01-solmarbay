# Solmar Bay

[![Solmar Bay](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01?ref=9y382syd)
[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank?ref=9y382syd)
[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward?ref=9y382syd)

A sun-soaked coastal open-world crime game in the spirit of GTA 6, played in
a desktop web browser from its own files. Explore the bay island city of
Solmar Bay on foot and by car, steal and drive cars, take missions, earn and
spend money, deal with the police, and build a life of crime and side hustles.

Two protagonists share the story: **Ryan**, a man in his late thirties, a
former advertising man rebuilding his life with hustle and charm, and **Ian**,
a woman in her late thirties, sharp, funny and fearless, his partner in life
and in crime. Switch between them at the safehouse or through the phone. Each
has their own mission chain, and they share one wallet. The finale is the
Marina Royale vault heist, and its payout is computed from the prices of the
most expensive aircraft and the most expensive property for sale in the game.

The city is alive: seven districts, traffic that follows the roads,
pedestrians who react to crime, wildlife, weather, a day and night cycle,
radio stations, and a phone full of apps.

Built by Fahrian Hidayat Azwar (Dandelion-sys) — hagio.ryan@gmail.com

## How to play

Take a job from Vera at The Brass Anchor bar in Palm Quay, drive or walk
there, do the thing, get paid, and spend the money on cars, clothes, weapons,
properties and upgrades while staying out of jail. Money is the score, and
your best wallet is kept between visits. Between missions, earn from taxi
fares, deliveries, fishing, busking, bounty hunting, treasure hunts, airboat
tours, hunting, sports and more.

### Key map

| Key | Action |
| --- | --- |
| W A S D | Walk / drive (W accelerate, S brake / reverse, A D steer) |
| Shift | Run |
| E | Interact with the nearest thing (car first, then shops and places) |
| F | Enter / exit a car |
| Q | Punch |
| Mouse (right button / click) | Aim / shoot |
| C | Focus — slow-motion aiming on a meter that refills |
| P | Phone |
| M | Map |
| T | Switch between Ryan and Ian |
| R | Radio on / off |
| H | Horn |
| Space | Jump |
| Esc | Pause (resume, save, key map, mute, quit to title) |

The HUD always says what E will do right now, so it never hijacks another
action: it opens a car before a shop next door, for example.

## Systems

- **Open world** — seven districts (Palm Quay, Coral Row, Sunset Fields,
  Gull Point, Mangrove Flats, North Docks, Tern Isle), a causeway and a ferry,
  beaches, piers, a lighthouse, an airport strip and a swamp.
- **Missions** — six jobs for Ryan, six for Ian, from Vera the fixer, then
  the Marina Royale vault heist finale for both of them together.
- **Driving and traffic** — arcade driving, traffic on the roads, parked
  cars to steal, boats, planes on the strip and a ferry timetable.
- **Police and wanted level** — one to six stars, patrol cars, roadblocks,
  helicopters at four stars and up, and a full lockdown at six.
- **Combat** — punch, aim and shoot with owned weapons; weapons wear and jam
  unless cleaned.
- **Focus** — slow-motion aiming with limb and vital targeting.
- **Reputation** — good deeds and brutality move shop prices and how
  pedestrians treat you.
- **Witness and disguise** — witnesses and cameras note your outfit and
  vehicle; changing clothes and switching cars sheds heat faster.
- **Robbery preparation** — scout a shop, find its back entrance, learn the
  safe code and disable its cameras before the job.
- **Car-theft minigames** — slim jim timing, smashed windows, key cloners
  and a phone scanner that values nearby cars.
- **Weapons locker** — carry at most two rifles and two pistols; the rest
  lives in the locker.
- **Wildlife compendium** — photograph animals with the phone camera to log
  them in the field guide; hunt for pelts with the right weapon.
- **Safehouse upgrades and crew** — bed, workshop, armoury, decorations,
  and hired crew (driver, lookout) with morale.
- **Stranger missions** — eight quirky passers-by with small side quests.
- **Bounty hunting** — posters from the police station board; alive pays more.
- **Treasure hunts** — three riddle clue chains leading to buried loot.
- **Challenges** — nine categories with bronze, silver and gold ranks.
- **Sports** — three-on-three basketball, pool, boxing and wrestling.
- **Kayaking and scuba diving** — paddle the bay and dive the reef sites.
- **Base jumping** — cliff and rooftop jumps with a parachute.
- **Airboat swamp tours** — drive tourists through Mangrove Flats.
- **Hunting lodge and trophy room** — pelts crafted into gear that sells.
- **Hurricanes** — storm fronts with wind, surge and flying debris.
- **BayRide and public transport** — ride-share on the phone, buses and the
  island ferry.
- **Phone 2.0** — photo social app with followers, car scanner, map, radio,
  camera and travel.
- **Radio and podcasts** — three stations, headphones on foot.
- **Body and stats** — food, gym work and sleep change strength, stamina
  and build, and a bond meter between Ryan and Ian that pays a dawn bonus.

## Run it locally

Node 22 or later, no build step, no network:

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is plain static
files under `game/`; the front page is `game/index.html`. Sound is
synthesised in the browser with the Web Audio interface (engine hum,
footsteps, gunshots, cash chime, sirens, radio melodies, mission stings) —
no audio files. Mute it from the pause menu.

Save at the safehouse bed or from the pause menu; the save keeps money,
cars, weapons, mission progress and owned properties in the browser's local
storage. Your best wallet is shown on the title screen.
