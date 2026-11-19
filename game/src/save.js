// Save and load through local storage.
import { TUNE } from './config.js';
export function saveGame(game) {
  const data = {
    money: game.economy.money, reputation: game.economy.reputation, bond: game.economy.bond,
    progress: game.missions.progress, finaleDone: game.missions.finaleDone,
    ownedCars: game.economy.ownedCars, ownedWeapons: game.economy.ownedWeapons,
    ownedProps: game.economy.ownedProps, ownedClothes: game.economy.ownedClothes,
    strength: game.economy.strength, stamina: game.economy.stamina,
    x: game.player.x, z: game.player.z, health: game.player.health,
    activeChar: game.activeChar, timeOfDay: game.timeOfDay, day: game.day,
    best: Math.max(game.economy.money, Number(localStorage.getItem(TUNE.bestKey) || 0)),
  };
  localStorage.setItem(TUNE.saveKey, JSON.stringify(data));
  localStorage.setItem(TUNE.bestKey, String(data.best));
  return data;
}
export function loadGame(game) {
  const raw = localStorage.getItem(TUNE.saveKey);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    game.economy.money = d.money; game.economy.reputation = d.reputation; game.economy.bond = d.bond;
    game.missions.progress = d.progress; game.missions.finaleDone = d.finaleDone;
    game.economy.ownedCars = d.ownedCars; game.economy.ownedWeapons = d.ownedWeapons;
    game.economy.ownedProps = d.ownedProps; game.economy.ownedClothes = d.ownedClothes || ['Street Tee'];
    game.economy.strength = d.strength; game.economy.stamina = d.stamina;
    game.player.x = d.x; game.player.z = d.z; game.player.health = d.health;
    game.activeChar = d.activeChar; game.timeOfDay = d.timeOfDay; game.day = d.day;
    return d;
  } catch { return null; }
}
export function hasSave() { return !!localStorage.getItem(TUNE.saveKey); }
export function bestMoney() { return Number(localStorage.getItem(TUNE.bestKey) || 0); }
