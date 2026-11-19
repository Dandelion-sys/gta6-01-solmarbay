// Solmar Bay save and load: money, cars, weapons, mission progress,
// properties and the active hero, kept in local storage between visits.
const SAVE_KEY = 'solmar-bay-save-v1';
const BEST_KEY = 'solmar-best';

export function saveGameData(game) {
  const c = game.couple;
  const data = {
    version: 1,
    wallet: c.wallet,
    best: c.best,
    bond: c.bond,
    reputation: c.reputation,
    activeHero: c.active.id,
    ryanDone: game.missions.ryanDone,
    ianDone: game.missions.ianDone,
    completed: game.missions.completed,
    finaleDone: game.missions.finaleDone,
    ownedCars: c.ownedCars || [],
    ownedProps: c.ownedProps || [],
    heroState: {
      ryan: { x: c.ryan.x, z: c.ryan.z, health: c.ryan.health, armour: c.ryan.armour, strength: c.ryan.strength, outfit: c.ryan.outfit, weapons: c.ryan.weapons || [] },
      ian: { x: c.ian.x, z: c.ian.z, health: c.ian.health, armour: c.ian.armour, strength: c.ian.strength, outfit: c.ian.outfit, weapons: c.ian.weapons || [] },
    },
    fieldGuide: game.phone ? game.phone.fieldGuide : [],
    timeOfDay: game.sky.timeOfDay,
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    localStorage.setItem(BEST_KEY, String(Math.max(c.best, c.wallet)));
  } catch (e) { /* storage unavailable: the game still plays */ }
  return data;
}

export function loadGameData() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) { return null; }
}

export function applySaveData(game, data) {
  const c = game.couple;
  c.wallet = data.wallet; c.best = data.best;
  c.bond = data.bond; c.reputation = data.reputation;
  c.ownedCars = data.ownedCars || []; c.ownedProps = data.ownedProps || [];
  game.missions.ryanDone = data.ryanDone || 0;
  game.missions.ianDone = data.ianDone || 0;
  game.missions.completed = data.completed || [];
  game.missions.finaleDone = !!data.finaleDone;
  for (const id of ['ryan', 'ian']) {
    const hs = data.heroState && data.heroState[id];
    if (!hs) continue;
    const h = c[id];
    h.setPosition(hs.x, hs.z);
    h.health = hs.health; h.armour = hs.armour;
    h.strength = hs.strength; h.outfit = hs.outfit; h.weapons = hs.weapons || [];
  }
  if (data.activeHero === 'ian' && c.active.id === 'ryan') c.switchHero();
  if (game.phone) game.phone.fieldGuide = data.fieldGuide || [];
  if (data.timeOfDay) game.sky.timeOfDay = data.timeOfDay;
  return true;
}

export function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch (e) { return 0; }
}
