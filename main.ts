// Solmar Bay — an original open-world crime game by Dandelion-sys.
// V2: radio, weapons, vehicles, air/sea, airports, big Florida-shaped map,
// characters Ryan + Ian (a couple), vest, voice, day/night, rain, river, bounty,
// races, fishing, animals, phone, gamepad — see README.md "V2 additions".
// A sun-soaked coastal city: Ian and Ryan, fixer Marisol, car theft, police chases,
// missions, combat and a living city, built on three.js with procedural art.
// Entry: "Solmar Bay" for the make.fun bounty gta6-01 ("Make GTA 6").
// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

// Round 4 additions (this session): Coral Cay island with its lighthouse town and
// six glowing shells, two fan-driven hovercraft that cross water and land, a four-job
// Marisol chain (tailing, a plaza photograph, a four-drop courier run, an escort),
// darts at the pink-neon bar, a five-round street-race league with season standings,
// a repeatable job board, five new random street events, and salvage diving at four
// blue-ringed buoys off the east coast. See README.md "Round 4 additions" for how
// each one is triggered in the game.
// How to reach each Round 4 system in the game (keys, in play mode):
//   Coral Cay island — hovercraft from the beach, ferry from the mainland pier,
//   or boat + swim. Shells glow on the sand.
//   Marisol chain — L, after the three main missions. Tailing, photo, drops, escort.
//   Darts — K at the pink-neon bar; Bram's $500 challenge — E near Bram.
//   Race league — T at the airport flag; five rounds a season.
//   Job board — Z at the wooden board near the north-west plaza.
//   Salvage diving — X at a blue-ringed buoy on the east coast.
//   Buried loot — map $50 at Nadia's Cay stall, then hold F at a mound.
//   Smuggler coves — E at a purple cove, night only.
const r4FeatureNames = [
  'Coral Cay island', 'hovercraft', 'Marisol chain', 'darts', 'race league',
  'job board', 'random events', 'salvage diving', 'night market', 'viewpoints',
  'Cay ferry', 'bay storms', 'buried loot', 'keeper quest',
];
function roundFourSummary(): string {
  return r4FeatureNames.map((f, i) => `${i + 1}. ${f}`).join('\n');
}
console.log(`Round 4 features in this build: ${r4FeatureNames.length} (${r4FeatureNames.join(', ')})`);
console.log(roundFourSummary());
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
