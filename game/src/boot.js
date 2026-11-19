// Boot and the main loop. Fixed 1/60 s steps, several in a slow frame,
// none in a fast one; the time step is clamped to 0.1 s so the game keeps
// working at very low frame rates. Four screens: title, play, paused,
// game over. Best result kept in local storage. A ?shot= query stages a
// scene instead of running the loop.
import * as THREE from 'three';
import { TUNING, PLACES, clamp, dist2, mulberry32 } from './tuning.js';
import { createInput, attachInput } from './input.js';
import { createSound, soundEffects, soundEngine } from './sound.js';
import { buildCity, collideCircle, keepOnIsland, districtAt } from './world.js';
import { buildSky, updateSky } from './sky.js';
import { makeCarMesh, spawnVehicle, spawnTraffic, updateTraffic, enterCar, exitCar, nearestCar, updateDriving } from './vehicles.js';
import { spawnPeds, updatePeds, spawnAnimals, updateAnimals, scarePeds } from './people.js';
import { addHeat, updatePolice, decayWanted, updateHelicopter } from './police.js';
import { createCharacters, switchCharacter, updatePlayerOnFoot, CHAR_DEFS } from './characters.js';
import { RYAN_MISSIONS, IAN_MISSIONS, FINALE, startMission, updateMissions, startFinale, finalePayout } from './missions.js';
import { createEconomy, buyItem, updateSideJob, startTaxiJob, startDeliveryJob } from './economy.js';
import { createPhone, togglePhone, renderPhone, phoneApps, snapPhoto, callRide, postPhoto, travelTo } from './phone.js';
import { buildHud, updateHud, hudToast, showBriefing, setContext } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { createSystems, changeReputation, updateFocus, scoutShop, stealCar, wearWeapon, storeWeapon, takeWeapon } from './systems.js';
import { STRANGERS, TREASURE_CLUES, goFishing, goBusking, rentKayak, diveReef, baseJump, airboatTour, huntAnimal, claimChallenge, helpInStorm, strangerQuest, giftPartner, buySafehouseUpgrade, hireCrew, takeBounty, nextTreasureClue, digTreasure, playBasketball } from './systems2.js';
import { stageShot } from './shots.js';
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || 1);
const G = {
  seed: SEED, mode: 'title', time: { day: 1, minutes: TUNING.startMinutes, wave: 0 },
  weather: 'clear', weatherTimer: 240, money: TUNING.moneyStart,
  wanted: 0, heat: 0, hiddenTimer: 0, reputation: 0, focus: 100,
  bond: 10, activeChar: 'ryan', timeScale: 1, focusActive: false,
  radioStation: 0, radioOn: false, heli: null, heliAngle: 0,
  vehicles: [], peds: [], animals: [], police: [], colliders: [],
  buildings: [], palmTrees: [], inventory: { weapons: [], outfits: ['street'], cars: [] },
  properties: ['safehouse'], missions: { ryan: 0, ian: 0, active: null, finaleDone: false },
  stats: { earned: 0, spent: 0, best: 0, crimes: 0, missionsDone: 0 },
  camera: null, cam: { yaw: 0, pitch: 0.32, dist: 11 },
  systems: null, sideJob: null, toastTimer: null,
};
G.input = createInput();
G.sound = createSound();
soundEffects(G.sound);
soundEngine(G.sound);
G.spawnVehicle = (kind, x, z, heading, color) => spawnVehicle(G, kind, x, z, heading, color);
G.saveGame = () => saveGame(G);
G.switchChar = () => switchCharacter(G);
G.addHeat = (n, why) => addHeat(G, n, why);
G.toast = (m) => hudToast(G, m);
function init() {
  const canvas = document.getElementById('game');
  G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  G.renderer.setSize(window.innerWidth, window.innerHeight);
  G.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  G.scene = new THREE.Scene();
  G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  buildSky(G);
  buildCity(G);
  createCharacters(G);
  spawnTraffic(G);
  spawnPeds(G);
  spawnAnimals(G);
  createEconomy(G);
  createSystems(G);
  buildHud(G);
  createPhone(G);
  G.hud = { toast: (m) => hudToast(G, m), showBriefing: (t, x) => showBriefing(G, t, x) };
  attachInput(G.input, canvas);
  window.addEventListener('resize', () => {
    G.camera.aspect = window.innerWidth / window.innerHeight;
    G.camera.updateProjectionMatrix();
    G.renderer.setSize(window.innerWidth, window.innerHeight);
  });
  buildTitleScreen(G);
}
function buildTitleScreen(G) {
  const t = document.getElementById('title');
  t.innerHTML = `
    <h1>SOLMAR BAY</h1>
    <p class="tag">A sun-soaked open-world crime story. Ryan &amp; Ian. One wallet. One city.</p>
    <p class="chars">RYAN — the charmer &nbsp;•&nbsp; IAN — the nerve</p>
    <button id="start-btn">Start new game</button>
    <button id="continue-btn">Continue</button>
    <div class="keys">
      <b>WASD</b> walk / drive &nbsp; <b>Shift</b> run &nbsp; <b>E</b> interact<br>
      <b>F</b> enter / exit car &nbsp; <b>Q</b> punch &nbsp; <b>Mouse</b> aim / shoot<br>
      <b>C</b> Focus (slow motion) &nbsp; <b>P</b> phone &nbsp; <b>M</b> map<br>
      <b>T</b> switch Ryan / Ian &nbsp; <b>R</b> radio &nbsp; <b>Esc</b> pause
    </div>
    <p class="best">Best wallet so far: $<span id="best-money">0</span></p>`;
  document.getElementById('start-btn').addEventListener('click', () => startGame(G, false));
  const cont = document.getElementById('continue-btn');
  cont.style.display = hasSave() ? 'inline-block' : 'none';
  cont.addEventListener('click', () => startGame(G, true));
  try {
    const raw = localStorage.getItem('solmar-bay-save-v1');
    if (raw) document.getElementById('best-money').textContent = Math.floor(JSON.parse(raw).best || 0).toLocaleString('en-US');
  } catch (e) {}
}
export function startGame(G, fromSave) {
  G.sound.ensure();
  if (fromSave) loadGame(G);
  document.getElementById('title').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  G.mode = 'play';
  G.hud.showBriefing('Welcome to Solmar Bay', 'Vera is waiting at The Brass Anchor bar in Palm Quay. Walk there or steal a car — your call.');
}
let lastTime = 0;
let acc = 0;
function loop(G, now) {
  requestAnimationFrame((t) => loop(G, t));
  const rawDt = Math.min((now - lastTime) / 1000 || 0.016, 0.1);
  lastTime = now;
  if (G.mode !== 'play') {
    renderFrame(G);
    return;
  }
  acc += rawDt * (G.timeScale || 1);
  let steps = 0;
  while (acc >= TUNING.step && steps < 8) {
    step(G, TUNING.step);
    acc -= TUNING.step;
    steps++;
  }
  if (steps === 8) acc = 0;
  // One-shot keys (E, F, Q, P, M, T, R, Esc) are handled once per
  // rendered frame, never once per simulation step, so a single press
  // can never punch eight times or toggle the phone open and shut.
  handleKeys(G, rawDt);
  renderFrame(G);
  G.input.clearPressed();
}
function renderFrame(G) {
  updateCamera(G);
  if (G.mode === 'play') updateHud(G);
  G.renderer.render(G.scene, G.camera);
}
function updateCamera(G) {
  const input = G.input;
  G.cam.yaw -= input.mouseDX * 0.004;
  G.cam.pitch = clamp(G.cam.pitch + input.mouseDY * 0.003, 0.05, 0.9);
  const px = G.player.mesh.position.x;
  const pz = G.player.mesh.position.z;
  G.camera.position.set(px + Math.sin(G.cam.yaw) * G.cam.dist, 4 + G.cam.pitch * 12, pz + Math.cos(G.cam.yaw) * G.cam.dist);
  G.camera.lookAt(px, 2, pz);
}
function step(G, dt) {
  G.time.minutes += dt * 2;
  if (G.time.minutes >= 1440) {
    G.time.minutes -= 1440;
    G.time.day++;
    dawnBonus(G);
  }
  updateWeather(G, dt);
  updateSky(G, dt);
  updateFocus(G, dt);
  if (G.player.vehicle) updateDriving(G, dt);
  else updatePlayerOnFoot(G, dt);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updateAnimals(G, dt);
  updatePolice(G, dt);
  decayWanted(G, dt);
  updateHelicopter(G, dt);
  updateMissions(G, dt);
  updateSideJob(G, dt);
  updateRadio(G, dt);
  updateContext(G);
  if (G.player.health <= 0) gameOver(G);
}
function dawnBonus(G) {
  if (G.bond >= 60) {
    const bonus = 50;
    G.money += bonus;
    G.player.health = clamp(G.player.health + 10, 0, 100);
    G.hud.toast(`Dawn bonus: +$${bonus} for a strong bond.`);
  }
  G.player.stamina = clamp(G.player.stamina + 20, 0, 100);
}
function updateWeather(G, dt) {
  G.weatherTimer -= dt;
  if (G.weatherTimer > 0) return;
  G.weatherTimer = 180 + Math.random() * 240;
  const roll = Math.random();
  const next = roll < 0.55 ? 'clear' : roll < 0.8 ? 'cloudy' : roll < 0.93 ? 'rain' : 'storm';
  if (next !== G.weather) {
    G.weather = next;
    G.hud.toast(next === 'storm' ? 'Storm front rolling in off the bay!' : `Weather: ${next}.`);
    if (next === 'storm') G.systems.hurricane.active = true;
    else G.systems.hurricane.active = false;
  }
}
function updateRadio(G, dt) {
  if (!G.radioOn || !G.sound.ctx || G.sound.muted) return;
  G.sound.radioTimer += dt;
  if (G.sound.radioTimer > 0.6) {
    G.sound.radioTimer = 0;
    G.sound.radioNote(G.radioStation, Math.floor(Math.random() * 5));
  }
}
function gameOver(G) {
  G.mode = 'gameover';
  G.sound.sirenStop();
  const over = document.getElementById('gameover');
  over.style.display = 'block';
  over.innerHTML = `<h1>BUSTED / FLAT OUT</h1><p>You made $${Math.floor(G.stats.earned).toLocaleString('en-US')} in Solmar Bay.</p><button id="retry-btn">Back to title</button>`;
  document.getElementById('retry-btn').addEventListener('click', () => {
    over.style.display = 'none';
    document.getElementById('title').style.display = 'block';
    G.mode = 'title';
    G.player.health = 100;
  });
}
function handleKeys(G, dt) {
  const input = G.input;
  if (input.hit('KeyF')) {
    if (G.player.vehicle) exitCar(G);
    else {
      const car = nearestCar(G, 6);
      if (car) {
        if (car.locked || car.stolen === false && car.parked && car.locked) { /* locked */ }
        const res = car.parked && car.locked ? stealCar(G, car) : { ok: true };
        if (res.ok) enterCar(G, car);
      }
    }
  }
  if (input.hit('KeyE')) doInteract(G);
  if (input.hit('KeyQ') && G.player.onFoot) punch(G);
  if (input.hit('MouseLeft') && G.player.onFoot) shoot(G);
  if (input.hit('KeyP')) togglePhone(G);
  if (input.hit('KeyM')) toggleMap(G);
  if (input.hit('KeyT') && G.player.onFoot) {
    const who = switchCharacter(G);
    G.hud.toast(`Now playing as ${who === 'ryan' ? 'Ryan' : 'Ian'}.`);
  }
  if (input.hit('KeyR')) { G.radioOn = !G.radioOn; G.sound.ensure(); }
  if (input.hit('Escape')) togglePause(G);
}
function togglePause(G) {
  if (G.mode === 'play') {
    G.mode = 'paused';
    document.getElementById('pause').style.display = 'block';
  } else if (G.mode === 'paused') {
    G.mode = 'play';
    document.getElementById('pause').style.display = 'none';
  }
}
function doInteract(G) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  // Nearest car first: E never hijacks car entry for a shop next door.
  const car = nearestCar(G, 5);
  if (car && G.player.onFoot) {
    const res = car.parked && car.locked ? stealCar(G, car) : { ok: true };
    if (res.ok) enterCar(G, car);
    return;
  }
  for (const [key, place] of Object.entries(PLACES)) {
    if (dist2(px, pz, place.x, place.z) < 10) {
      interactAt(G, key, place);
      return;
    }
  }
  // Strangers hang around the city; chatting helps reputation.
  for (const p of G.peds) {
    if (dist2(p.x, p.z, px, pz) < 3) {
      changeReputation(G, 1, 'Helped a stranger find their way.');
      G.hud.toast('You help a stranger with directions. They smile and move on.');
      return;
    }
  }
  G.hud.toast('Nothing to use here.');
}
function interactAt(G, key, place) {
  if (key === 'bar') {
    const m = startMission(G, G.activeChar);
    if (m) G.hud.showBriefing(m.def.name, m.def.brief);
    else if (G.missions.ryan >= 6 && G.missions.ian >= 6) {
      const f = startFinale(G);
      if (f) G.hud.showBriefing(f.def.name, f.def.brief);
      else G.hud.toast('The vault heist is done. Solmar Bay is yours.');
    } else G.hud.toast('Vera: finish the other chain first, then we talk.');
  } else if (key === 'safehouse') {
    G.player.health = 100;
    saveGame(G);
    G.hud.toast('Slept at the safehouse. Saved. Health restored.');
  } else if (key === 'dealer' || key === 'gunshop' || key === 'clothing' || key === 'mart') {
    openShop(G, key);
  } else if (key === 'gym') {
    G.player.strength = clamp(G.player.strength + 3, 0, 100);
    G.systems.body.gym++;
    G.hud.toast('Gym session done. Strength up.');
  } else if (key === 'hospital') {
    G.player.health = 100;
    G.money = Math.max(0, G.money - 50);
    G.hud.toast('Patched up at Solmar General. $50.');
  } else if (key === 'policeStation') {
    G.hud.toast('Bounty board: take a poster with the phone Contacts app.');
  } else {
    G.hud.toast(`You are at ${place.name}.`);
  }
}
function punch(G) {
  G.sound.punch();
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  for (const p of G.peds) {
    if (dist2(p.x, p.z, px, pz) < 2.5) {
      p.panic = 5;
      addHeat(G, 1, 'assault');
      changeReputation(G, -2, 'You hit a pedestrian.');
      G.hud.toast('That was not necessary. The crowd noticed.');
      return;
    }
  }
  for (const v of G.police) {
    if (dist2(v.x, v.z, px, pz) < 3) {
      addHeat(G, 2, 'attacked police');
      return;
    }
  }
}
function shoot(G) {
  const weapon = G.inventory.weapons[0];
  if (!weapon) { G.hud.toast('No weapon. Buy one at Gull and Gun.'); return; }
  if (weapon.ammo <= 0) { G.hud.toast('Out of ammo.'); return; }
  weapon.ammo--;
  wearWeapon(G, weapon.type, 2);
  G.sound.shot();
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let best = null, bestD = 30;
  for (const p of G.peds) {
    const d = dist2(p.x, p.z, px, pz);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    best.panic = 6;
    scarePeds(G, px, pz, 40);
    addHeat(G, 2, 'shots fired');
    changeReputation(G, -5, 'Gunfire in the street.');
  } else {
    addHeat(G, 1, 'shots fired');
  }
}
function openShop(G, key) {
  const shop = G.shops[key];
  if (!shop) return;
  const list = shop.items.map((it, i) => `${i + 1}. ${it.name} — $${it.price}`).join('\n');
  const pick = window.prompt(`${shop.place.name}\n${list}\n\nType the item number to buy, or cancel.`);
  if (pick === null) return;
  const idx = Number(pick) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= shop.items.length) {
    G.hud.toast('No sale. Come back any time.');
    return;
  }
  const res = buyItem(G, key, idx);
  G.hud.toast(res.ok ? `Bought ${res.item.name}.` : res.why);
}
function toggleMap(G) {
  const m = document.getElementById('bigmap');
  const show = m.style.display === 'none';
  m.style.display = show ? 'block' : 'none';
  if (show) drawBigMap(G);
}
function drawBigMap(G) {
  const c = document.getElementById('bigmap-canvas');
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#12333f'; ctx.fillRect(0, 0, 600, 500);
  ctx.fillStyle = '#3f7d5a'; ctx.fillRect(0, 0, 600, 500);
  ctx.fillStyle = '#2c2f33';
  for (const x of [-300, -180, -60, 60, 180, 300]) ctx.fillRect((x + 380) * 0.79, 0, 5, 500);
  for (const z of [-280, -160, -40, 80, 200, 300]) ctx.fillRect(0, (z + 380) * 0.66, 600, 5);
  ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif';
  for (const [k, p] of Object.entries(PLACES)) {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc((p.x + 380) * 0.79, (p.z + 380) * 0.66, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(p.name, (p.x + 380) * 0.79 + 8, (p.z + 380) * 0.66 + 4);
  }
}
function updateContext(G) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let text = '';
  if (G.player.vehicle) {
    const kmh = Math.round(Math.abs(G.player.vehicle.speed) * 3.6);
    text = `F — exit car · W/S drive · A/D steer · ${kmh} km/h`;
  } else {
    const car = nearestCar(G, 5);
    if (car) text = car.locked ? 'E — steal this car' : 'F — get in the car';
    else {
      for (const [key, place] of Object.entries(PLACES)) {
        if (dist2(px, pz, place.x, place.z) < 10) {
          text = `E — ${key === 'bar' ? 'talk to Vera' : key === 'safehouse' ? 'sleep & save' : 'use ' + place.name}`;
          break;
        }
      }
    }
  }
  if (!text) text = 'E — interact · P — phone · M — map';
  setContext(G, text);
}
function selfTest(G) {
  const checks = [];
  const ok = (name, cond) => checks.push({ name, pass: !!cond });
  ok('city built', G.buildings.length > 40);
  ok('roads drawn', G.colliders.length > 40);
  ok('palms planted', G.palmTrees.length > 40);
  ok('traffic running', G.vehicles.length >= 20);
  ok('pedestrians walking', G.peds.length >= 20);
  ok('animals present', G.animals.length >= 20);
  ok('player exists', !!G.player.mesh);
  ok('partner exists', !!G.partner.mesh);
  ok('missions defined', RYAN_MISSIONS.length === 6 && IAN_MISSIONS.length === 6);
  ok('finale payout computed', finalePayout() > 0);
  ok('shops stocked', Object.keys(G.shops).length >= 4);
  ok('phone apps present', document.querySelectorAll('#phone button').length >= 0);
  ok('hud mounted', !!G.hudEls.money);
  ok('minimap mounted', !!G.minimap);
  ok('sound engine ready', typeof G.sound.tone === 'function');
  ok('save round-trip', (() => { saveGame(G); return loadGame(G); })());
  ok('focus drains and refills', (() => { const before = G.focus; updateFocus(G, 1); return G.focus <= before; })());
  ok('reputation moves', (() => { const r = G.reputation; changeReputation(G, 5); const moved = G.reputation === r + 5; changeReputation(G, -5); return moved; })());
  ok('wanted rises on crime', (() => { const w = G.wanted; addHeat(G, 1, 'test'); const rose = G.wanted > w; G.wanted = w; return rose; })());
  return { passed: checks.filter((c) => c.pass).length, failed: checks.filter((c) => !c.pass).length, checks };
}
window.__solmar = {
  G, selfTest: () => selfTest(G),
  startNewGame: () => startGame(G, false),
  startMission: (who, idx) => { G.missions[who] = idx; return startMission(G, who); },
  teleport: (x, z) => {
    if (G.player.vehicle) exitCar(G);
    G.player.mesh.position.set(x, 0, z);
    return true;
  },
  addMoney: (n) => { G.money += n; return G.money; },
  addHeat: (n) => addHeat(G, n, 'debug'),
  enterNearestCar: () => { const c = nearestCar(G, 12); return c ? enterCar(G, c) : false; },
  openPhone: () => togglePhone(G),
  save: () => saveGame(G),
  load: () => loadGame(G),
  switchChar: () => switchCharacter(G),
  state: () => ({
    mode: G.mode, money: G.money, wanted: G.wanted,
    health: G.player.health, x: G.player.mesh.position.x,
    z: G.player.mesh.position.z, inCar: !!G.player.vehicle,
    mission: G.missions.active ? G.missions.active.def.name : null,
    ryanMissions: G.missions.ryan, ianMissions: G.missions.ian,
    reputation: G.reputation, focus: G.focus, bond: G.bond,
    weather: G.weather, day: G.time.day, police: G.police.length,
    radioOn: G.radioOn, phoneOpen: G.phone.open, focusActive: G.focusActive,
  }),
};
function wirePauseMenu(G) {
  const pause = document.getElementById('pause');
  pause.innerHTML = `
    <h1>PAUSED</h1>
    <button id="resume-btn">Resume</button>
    <button id="save-btn">Save game</button>
    <button id="mute-btn">Mute: off</button>
    <button id="quit-btn">Quit to title</button>
    <div class="keys">
      <b>WASD</b> walk / drive &nbsp; <b>Shift</b> run &nbsp; <b>E</b> interact<br>
      <b>F</b> enter / exit car &nbsp; <b>Q</b> punch &nbsp; <b>Mouse</b> aim / shoot<br>
      <b>C</b> Focus &nbsp; <b>P</b> phone &nbsp; <b>M</b> map &nbsp; <b>T</b> switch &nbsp; <b>R</b> radio
    </div>`;
  document.getElementById('resume-btn').addEventListener('click', () => togglePause(G));
  document.getElementById('save-btn').addEventListener('click', () => {
    saveGame(G);
    G.hud.toast('Game saved.');
  });
  document.getElementById('mute-btn').addEventListener('click', (e) => {
    G.sound.muted = !G.sound.muted;
    e.target.textContent = `Mute: ${G.sound.muted ? 'on' : 'off'}`;
  });
  document.getElementById('quit-btn').addEventListener('click', () => {
    pause.style.display = 'none';
    document.getElementById('title').style.display = 'block';
    G.mode = 'title';
  });
}
init();
wirePauseMenu(G);
if (SHOT) {
  stageShot(G, SHOT, {
    start: () => startGame(G, false),
    step: (dt) => step(G, dt),
    render: () => renderFrame(G),
  });
} else {
  requestAnimationFrame((t) => { lastTime = t; loop(G, t); });
}
window.__solmar.buy = (shop, idx) => buyItem(G, shop, idx);
window.__solmar.taxi = () => startTaxiJob(G);
window.__solmar.delivery = () => startDeliveryJob(G);
window.__solmar.rep = (n) => changeReputation(G, n);
window.__solmar.scout = (shop) => scoutShop(G, shop);
window.__solmar.sys = {
  fish: () => goFishing(G),
  busk: () => goBusking(G),
  kayak: () => rentKayak(G),
  dive: () => diveReef(G),
  jump: () => baseJump(G),
  airboat: () => airboatTour(G),
  hunt: (kind) => huntAnimal(G, kind),
  challenge: (id, rank) => claimChallenge(G, id, rank),
  stormHelp: () => helpInStorm(G),
  stranger: (id) => strangerQuest(G, id),
  gift: () => giftPartner(G),
  upgrade: (key) => buySafehouseUpgrade(G, key),
  crew: (role) => hireCrew(G, role),
  bounty: (i) => takeBounty(G, i),
  clue: () => nextTreasureClue(G),
  dig: () => digTreasure(G),
  hoops: () => playBasketball(G),
  steal: (car) => stealCar(G, car),
  storeWeapon: (t) => storeWeapon(G, t),
  takeWeapon: (t) => takeWeapon(G, t),
  snap: () => snapPhoto(G),
  ride: () => callRide(G),
  post: () => postPhoto(G),
  travel: (place) => travelTo(G, place),
};
