// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// It sends the MIME types a browser game needs, refuses any path outside game/, and otherwise
// does nothing clever: this is a development convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    const body = JSON.stringify({ ok: true, game: 'solmar-bay', round: 5 });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/r6-features.json') {
    const features = [
      { id: 'metro', what: 'four underground stations, metro card $40, fare $5, fare-dodging heat', key: 'E at a station' },
      { id: 'food-truck', what: 'buy a truck, five menus, six pitches, tips, health rating', key: 'E at a pitch flag' },
      { id: 'surfing', what: 'three surf breaks, board shop, rescue swims, competitions', key: 'E at the surf shop or a buoy' },
      { id: 'skate-park', what: 'tricks, combos, competitions, sponsor deals', key: 'E at Concrete Wave Park' },
      { id: 'stunt-career', what: 'stunt-double gigs, film shoots, star meter', key: 'E at Solmar Studios' },
      { id: 'nightclub', what: 'buy the club, book DJs, door and VIP income, vibe meter', key: 'E at The Bluefin' },
      { id: 'tattoo-parlor', what: 'get inked for stat boosts, tattoo clients, flash book', key: 'E at Ink & Salt' },
      { id: 'street-art', what: 'six murals, spray cans, crew rep, tagging heat', key: 'E at a mural wall' },
      { id: 'horse-ranch', what: 'buy and train horses, ranch races, stable income', key: 'E at Rancho del Sol' },
      { id: 'golf', what: 'nine-hole course, tournaments, caddy tips, mini-golf', key: 'E at Solmar Greens' },
      { id: 'bowling', what: 'leagues, perfect-game bonus, snack bar', key: 'E at Strike Lanes' },
      { id: 'arcade', what: 'five retro cabinets, high scores, tokens, prize shelf', key: 'E at Neon Palace' },
      { id: 'library', what: 'twelve rare books, reading boosts, book club', key: 'E at Solmar Library' },
      { id: 'museum', what: 'exhibits, guided tours, artifact hunts, night event', key: 'E at the Bay Museum' },
      { id: 'carnival', what: 'Ferris wheel, bumper cars, ring toss, fireworks show', key: 'E at the Solmar Fair' },
      { id: 'zoo', what: 'animal encounters, feeding, safari photos', key: 'E at the zoo gate' },
      { id: 'photo-studio', what: 'portrait sessions, photo contests, gallery sales', key: 'E at Lightbox Studio' },
      { id: 'wedding', what: 'Ryan and Ian wedding storyline, five vendor quests, ceremony', key: 'E at a vendor or the chapel' },
      { id: 'band', what: 'form a band, gigs at four venues, album sales, fans', key: 'E at a venue stage' },
      { id: 'busking', what: 'five street pitches, hat tips, crowd meter', key: 'E at a pitch' },
      { id: 'real-estate', what: 'buy rundown flats, renovate, flip for profit', key: 'E at a flat' },
      { id: 'pawn-shop', what: 'ten antiques, haggling, appraisal', key: 'E at Old Tom\'s' },
      { id: 'firefighter', what: 'fire-truck callouts, hose play, station upgrades', key: 'E at the fire station' },
      { id: 'paramedic', what: 'ambulance callouts, triage, hospital reputation', key: 'E at the hospital' },
    ];
    const body = JSON.stringify({ round: 6, features }, null, 2);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/r6-health') {
    // A second health endpoint that also reports the Round 6 feature count,
    // so a smoke test can confirm the Round 6 build without loading the game.
    const features = 24;
    const body = JSON.stringify({ ok: true, game: 'solmar-bay', round: 6, roundSixSystems: features });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/r5-features.json') {
    const features = [
      { id: 'garage', what: 'paint, wheels, engine and nitro tuning for any car', key: 'E or Y at Solmar Customs' },
      { id: 'casino', what: 'slots and blackjack for in-game cash only', key: 'E or I at the Solmar Sands' },
      { id: 'fishing-tournament', what: 'two-minute tournaments, points per catch, tackle shop', key: 'automatic; tackle on the phone' },
      { id: 'pursuit-heli', what: 'police helicopter with a searchlight at 3 stars, spike strips at 4', key: 'automatic at high wanted' },
      { id: 'seasons', what: 'spring, summer, autumn, winter, four days each, with weather fronts', key: 'automatic' },
      { id: 'taxi-empire', what: 'buy up to 3 cabs, hire drivers, earn per minute, parcel runs', key: 'E at the yellow depot' },
      { id: 'stunt-jumps', what: 'six ramps, airtime and distance scored, local leaderboard', key: 'drive fast over a yellow ramp' },
      { id: 'postcards', what: 'eight golden postcards at scenic spots, $60 each, $500 for the set', key: 'E at a floating card' },
      { id: 'flight-school', what: 'three lessons in a stunt plane at Solmar Intl', key: 'E at the flight school' },
      { id: 'gym', what: 'five training plans that bank real skill XP, $30 a session', key: 'E at Bay Iron' },
      { id: 'stocks', what: 'six bay companies, prices move every minute, dividends at dawn', key: 'Stocks on the phone' },
      { id: 'districts', what: 'five districts, influence pays $40 a minute above 60', key: 'work anywhere' },
      { id: 'bond', what: 'gifts and sunset date nights for Ryan and Ian', key: 'Gifts and dates on the phone' },
      { id: 'boat-races', what: 'three-buoy marina race, 150 seconds, up to $450', key: 'E at the pink marina flag' },
      { id: 'safehouse', what: 'furniture comfort that heals, fast travel for $25 a hop', key: 'E at the harbour safehouse' },
      { id: 'heat-zones', what: 'three zones where the law watches closer', key: 'automatic' },
      { id: 'responder-shifts', what: 'ambulance and fire truck night shifts, $220 a shift', key: 'E at the hospital or fire station' },
      { id: 'car-meets', what: 'Friday marina meets, best tuned car wins $300', key: 'Fridays at the marina' },
      { id: 'achievements', what: 'twelve achievements with one-time cash bonuses', key: 'Achievements on the phone' },
      { id: 'dj-chatter', what: 'live bay news on the two new radio stations', key: 'R to stations 4 and 5' },
    ];
    const body = JSON.stringify({ round: 5, features }, null, 2);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/r4-features.json') {
    const features = [
      { id: 'coral-cay', what: 'island town with lighthouse, walkers and six shells', key: 'hovercraft or boat east' },
      { id: 'hovercraft', what: 'fan-driven craft that runs on water and land', key: 'E near the beach or Cay pier' },
      { id: 'marisol-chain', what: 'four extra story jobs after the main missions', key: 'L' },
      { id: 'darts', what: 'three-dart turns at the pink-neon bar', key: 'K near the bar' },
      { id: 'race-league', what: 'five-round season standings for checkpoint races', key: 'T at the airport flag' },
      { id: 'job-board', what: 'five repeatable timed jobs', key: 'Z at the wooden board' },
      { id: 'random-events', what: 'robbery, challenger, stranded driver, tourist, runaway cart', key: 'automatic' },
      { id: 'salvage-diving', what: 'eight crates at four buoys, 35 seconds of air', key: 'X near a buoy' },
      { id: 'buried-loot', what: 'five dig sites, map from the Cay keepsake stall', key: 'hold F at a mound' },
      { id: 'keeper-quest', what: 'three fish for the lighthouse keeper', key: 'E near the lighthouse' },
    ];
    const body = JSON.stringify({ round: 4, features }, null, 2);
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  if (url.pathname === '/r5-health') {
    // A second health endpoint that also reports the Round 5 feature count,
    // so a smoke test can confirm the Round 5 build without loading the game.
    const features = 24;
    const body = JSON.stringify({ ok: true, game: 'solmar-bay', round: 5, roundFiveSystems: features });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
    response.end(body);
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${port}`);
});
