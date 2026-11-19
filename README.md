# Solmar Bay

A sun-soaked open-world crime game in the spirit of GTA 6, played in a web
browser. Explore a bay island city on foot and by car, steal cars, take jobs
from Vera at The Brass Anchor, outrun the Bay Police, and rob the Marina
Royale vault with your partner.

You play Ryan and Ian, a couple starting over. Ryan is a former advertising
man rebuilding his life with hustle and charm; Ian is sharp, funny and
fearless. Switch between them, share one wallet, and finish both of their
mission chains to unlock the finale — a vault heist whose payout is computed
from the most expensive jet and the most expensive property for sale.

## How to play

Walk the streets, drive the roads, talk to people, take jobs and stay out of
jail. Money is the score. Your best wallet is kept between visits.

### Keyboard and mouse (desktop)

| Key | Action |
| --- | --- |
| W A S D | Walk / drive — W walks away from the camera, S toward it |
| Mouse drag | Look around |
| Shift | Run |
| E | Interact / enter car — always the nearest usable thing first |
| F | Punch on foot / handbrake while driving |
| Q | Focus — slow-motion aim |
| C | Switch Ryan / Ian |
| P | Phone |
| M | Map |
| Esc | Pause |

### Touch (phone)

- **Left stick** (bottom left): drag to walk or drive. Up walks away from
  the camera, down walks toward it, sideways strafes. A small drag walks
  slowly, a full drag runs. Release to stop — no sticking, no jitter.
- **Right side drag**: drag anywhere on the right side to turn the camera,
  up and down to change its height and angle. Same feel as the mouse.
- **Buttons** (bottom right): E interact / enter car, F punch / handbrake,
  P phone, M map. Big, thumb-reachable, never covering the HUD, the minimap
  or the centre of the screen. Touch controls only appear on touch devices;
  desktop mouse and keyboard play is unchanged.

## Systems

- Open-world city: seven districts (Palm Quay, Coral Row, Sunset Fields,
  Gull Point, Mangrove Flats, North Docks, Tern Isle), day/night cycle,
  weather (clear, cloudy, rain, storm fronts), traffic, pedestrians and
  wildlife (gulls, dogs, deer, alligators).
- Missions: six for Ryan, six for Ian, from Vera the fixer, plus the Marina
  Royale vault finale with a computed payout.
- Wanted level: one to six stars, patrol cars, roadblocks, a helicopter
  from four stars, a city lockdown at six.
- Reputation and witness/disguise: good deeds and brutality move prices
  and how people treat you; changing clothes and cars sheds heat faster.
- Focus: slow-motion aiming on a meter that refills over time.
- Robbery preparation: scout a shop's back door, safe code and cameras
  before robbing it; duo robberies with Ian.
- Car-theft minigame: a slim-jim timing bar (plus window smash and key
  cloner jobs in the fiction of the phone's car scanner).
- Weapons: pistols, shotguns and rifles from Gull and Gun, with armour and
  cleaning kits; a locker limit of two rifles and two pistols.
- Wildlife compendium: study animals through the phone camera for the
  field guide; rare animals appear in certain weather and hours.
- Safehouse upgrades: workshop, armoury and decorations, plus crew hires
  (driver, lookout, hacker) with morale.
- Stranger missions: eight quirky passers-by with small side quests.
- Bounty hunting: posters from the police station board; alive pays more.
- Treasure hunts: three riddle clue chains across the map.
- Challenges: nine categories (driving, shooting, flying, swimming,
  hunting, racing, stealth, stamina, style) with bronze, silver and gold.
- Sports: basketball pickup games, pool at The Break Room, boxing at
  Iron Tide.
- Kayaking and scuba: dive at reef sites for underwater loot.
- Base jumping: cliff and rooftop spots with parachute landings.
- Airboat swamp tours through Mangrove Flats.
- Hurricanes: storm fronts with wind, debris and shelter-seeking crowds.
- BayRide and public transport: a ride-share app, bus timetables and the
  island ferry.
- Phone 2.0: photo social app with followers, and a car scanner.
- Radio and podcasts: three stations, headphones on foot.
- Body and stats: food, gym work and sleep change strength, stamina and
  build; a bond meter between Ryan and Ian pays a dawn bonus.

## Run it locally

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. The game needs no
network: every script, image, sound and font is a file under `game/` or an
inline data address. Sound is synthesised in the browser; there are no
audio files.

To build the submission dossier locally:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Badges

[![Solmar Bay on make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01?ref=9y382syd)

[![Rank](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/rank.svg)](https://make.fun/competitions/gta6-01/entries/Dandelion-sys/gta6-01-solmarbay/rank?ref=9y382syd)

[![Reward](https://make.fun/badge/gta6-01/Dandelion-sys/gta6-01-solmarbay/reward.svg)](https://make.fun/competitions/gta6-01/entries/Dandelion-sys/gta6-01-solmarbay/reward?ref=9y382syd)

Built by Fahrian Hidayat Azwar (Dandelion-sys) — hagio.ryan@gmail.com
