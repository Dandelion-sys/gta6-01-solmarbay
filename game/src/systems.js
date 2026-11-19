// Phase-two systems, part one: reputation, witness and disguise, Focus,
// robbery preparation, car-theft minigames, weapons and the wildlife
// compendium. Each one is playable, shows on the HUD or phone, and pays
// or costs money where money makes sense.
import { clamp, dist2, PLACES } from './tuning.js';
import { addHeat } from './police.js';
export function createSystems(G) {
  G.systems = {
    reputation: 0,
    focus: 100,
    robberyPrep: {},
    carTheft: { scannerOn: false },
    weapons: { locker: [], wear: {} },
    wildlife: { log: {}, rareSeen: [] },
    safehouse: { bed: false, workshop: false, armoury: false, decor: false, crew: [] },
    strangers: {},
    bounties: { taken: [], done: 0 },
    treasure: { chain: 0, clue: 0 },
    challenges: {},
    sports: { wins: 0 },
    kayak: false, scuba: false, baseJump: 0,
    airboat: { tours: 0 },
    hunting: { pelts: 0, trophies: 0 },
    hurricane: { active: false, helped: 0 },
    transport: { rides: 0 },
    social: { followers: 12, likes: 0 },
    body: { meals: 0, gym: 0, sleep: 0 },
  };
}
export function changeReputation(G, delta, why) {
  G.reputation = clamp(G.reputation + delta, -100, 100);
  G.systems.reputation = G.reputation;
  if (why) G.hud.toast(`${why} (Rep ${delta > 0 ? '+' : ''}${delta})`);
}
export function updateFocus(G, dt) {
  const input = G.input;
  if (input.down('KeyC') && G.focus > 0 && G.player.onFoot) {
    G.focus = clamp(G.focus - 34 * dt, 0, 100);
    G.focusActive = true;
    G.timeScale = 0.35;
  } else {
    G.focus = clamp(G.focus + 7 * dt, 0, 100);
    G.focusActive = false;
    G.timeScale = 1;
  }
}
export function scoutShop(G, shopKey) {
  const prep = G.systems.robberyPrep[shopKey] || { scouted: false, backDoor: false, safeCode: false, cameras: false };
  if (!prep.scouted) { prep.scouted = true; G.hud.toast('Scouted: you note the guard shifts and the till.'); }
  else if (!prep.backDoor) { prep.backDoor = true; G.hud.toast('Found the back entrance, down the alley.'); }
  else if (!prep.safeCode) { prep.safeCode = true; G.hud.toast('Safe code learned: the owner says it aloud every morning.'); }
  else if (!prep.cameras) { prep.cameras = true; G.hud.toast('Cameras mapped. Disable them from the service box.'); }
  G.systems.robberyPrep[shopKey] = prep;
  return prep;
}
export function stealCar(G, car) {
  if (!car) return { ok: false };
  if (!car.locked) {
    car.stolen = true;
    G.stats.crimes++;
    addHeat(G, 1, 'car theft');
    G.hud.toast('The door was open. You slip in and drive off.');
    return { ok: true, method: 'open door' };
  }
  const roll = Math.random();
  if (roll < 0.45) {
    car.stolen = true; car.locked = false;
    G.stats.crimes++;
    addHeat(G, 1, 'car theft');
    G.hud.toast('Slim jim worked — the lock pops on the first try.');
    return { ok: true, method: 'slim jim' };
  }
  if (roll < 0.7) {
    G.hud.toast('The slim jim slips. Try again — or smash the window.');
    return { ok: false, why: 'slim jim slipped' };
  }
  car.stolen = true; car.locked = false;
  G.stats.crimes++;
  addHeat(G, 2, 'smashed window');
  scarePedsLocal(G);
  G.hud.toast('Window smashed. Loud, but you are in.');
  return { ok: true, method: 'smashed window' };
}
function scarePedsLocal(G) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  for (const p of G.peds) {
    if (dist2(p.x, p.z, px, pz) < 25) p.panic = 4;
  }
}
export function storeWeapon(G, type) {
  const inv = G.inventory.weapons;
  const i = inv.findIndex((w) => w.type === type);
  if (i < 0) return { ok: false, why: 'Not carrying it.' };
  const w = inv.splice(i, 1)[0];
  G.systems.weapons.locker.push(w);
  G.hud.toast(`${type} stored in the locker.`);
  return { ok: true };
}
export function takeWeapon(G, type) {
  const locker = G.systems.weapons.locker;
  const pistols = G.inventory.weapons.filter((w) => w.type === 'pistol').length;
  const rifles = G.inventory.weapons.filter((w) => w.type === 'rifle').length;
  const i = locker.findIndex((w) => w.type === type);
  if (i < 0) return { ok: false, why: 'Not in the locker.' };
  if (type === 'pistol' && pistols >= 2) return { ok: false, why: 'You carry at most two pistols.' };
  if (type === 'rifle' && rifles >= 2) return { ok: false, why: 'You carry at most two rifles.' };
  G.inventory.weapons.push(locker.splice(i, 1)[0]);
  G.hud.toast(`${type} taken from the locker.`);
  return { ok: true };
}
export function wearWeapon(G, type, amount) {
  const w = G.inventory.weapons.find((x) => x.type === type);
  if (!w) return;
  w.wear = clamp((w.wear || 0) + amount, 0, 100);
  if (w.wear > 80) G.hud.toast(`${type} is filthy — clean it at Gull and Gun or it will jam.`);
}
