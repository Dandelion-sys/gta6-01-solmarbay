// Saving and loading: money, cars, weapons, outfits, mission progress,
// properties, stats and position, kept in the browser's local storage.
const KEY = 'solmar-bay-save-v1';
const BEST_KEY = 'solmar-bay-best-v1';
export function saveGameData(state) {
  try {
    const data = {
      money: state.economy.money,
      bestMoney: state.economy.bestMoney,
      ownedCars: state.economy.ownedCars,
      ownedPlanes: state.economy.ownedPlanes,
      ownedBoats: state.economy.ownedBoats,
      ownedProperties: state.economy.ownedProperties,
      weapons: state.economy.weapons,
      ownedOutfits: state.economy.ownedOutfits,
      crew: state.economy.crew,
      upgrades: state.economy.upgrades,
      challenges: state.economy.challenges,
      treasuresFound: state.economy.treasuresFound,
      strangersDone: state.economy.strangersDone,
      bountiesDone: state.economy.bountiesDone,
      completed: state.missions.completed,
      finaleDone: state.missions.finaleDone,
      activeHero: state.heroes.active,
      ryan: pickHero(state.heroes.ryan),
      ian: pickHero(state.heroes.ian),
      bond: state.heroes.bond,
      reputation: state.heroes.reputation,
      fieldGuide: Array.from(state.fieldGuide || []),
      hour: state.city.hour,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    localStorage.setItem(BEST_KEY, String(Math.max(state.economy.bestMoney, readBest())));
    return true;
  } catch (e) { return false; }
}
function pickHero(h) {
  return { x: h.x, z: h.z, heading: h.heading, health: h.health, armour: h.armour,
    strength: h.strength, stamina: h.stamina, weight: h.weight, outfit: h.outfit };
}
export function loadGameData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}
export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}
export function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch (e) { return 0; }
}
export function applySave(state, data) {
  if (!data) return false;
  const e = state.economy;
  e.money = data.money ?? e.money;
  e.bestMoney = Math.max(data.bestMoney ?? 0, e.bestMoney);
  e.ownedCars = data.ownedCars || e.ownedCars;
  e.ownedPlanes = data.ownedPlanes || [];
  e.ownedBoats = data.ownedBoats || [];
  e.ownedProperties = data.ownedProperties || ['safehouse'];
  e.weapons = data.weapons || e.weapons;
  e.ownedOutfits = data.ownedOutfits || ['tee'];
  e.crew = data.crew || [];
  e.upgrades = data.upgrades || e.upgrades;
  e.challenges = data.challenges || {};
  e.treasuresFound = data.treasuresFound || [];
  e.strangersDone = data.strangersDone || [];
  e.bountiesDone = data.bountiesDone || [];
  state.missions.completed = data.completed || { ryan: [], ian: [] };
  state.missions.finaleDone = !!data.finaleDone;
  state.heroes.active = data.activeHero || 'ryan';
  if (data.ryan) Object.assign(state.heroes.ryan, data.ryan);
  if (data.ian) Object.assign(state.heroes.ian, data.ian);
  state.heroes.bond = data.bond ?? 50;
  state.heroes.reputation = data.reputation ?? 0;
  state.fieldGuide = new Set(data.fieldGuide || []);
  if (data.hour) state.city.hour = data.hour;
  state.heroes.syncMeshes();
  return true;
}
