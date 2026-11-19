// Saving and loading. The save keeps money, cars, weapons, mission
// progress, owned properties, reputation, bond and the clock.
export const SAVE_KEY = 'solmar-bay-save-v1';
export function saveGame(G) {
  try {
    const data = {
      money: G.money, day: G.time.day, minutes: G.time.minutes,
      wanted: G.wanted, reputation: G.reputation, bond: G.bond,
      activeChar: G.activeChar,
      missions: { ryan: G.missions.ryan, ian: G.missions.ian, finaleDone: G.missions.finaleDone },
      inventory: G.inventory, properties: G.properties,
      stats: G.stats, systems: G.systems,
      player: {
        x: G.player.mesh.position.x, z: G.player.mesh.position.z,
        heading: G.player.heading, health: G.player.health,
        armour: G.player.armour, strength: G.player.strength,
        stamina: G.player.stamina, outfit: G.player.outfit,
      },
      best: G.stats.best,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}
export function loadGame(G) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.money = d.money; G.time.day = d.day; G.time.minutes = d.minutes;
    G.wanted = d.wanted || 0; G.reputation = d.reputation || 0;
    G.bond = d.bond || 0; G.activeChar = d.activeChar || 'ryan';
    G.missions.ryan = d.missions.ryan; G.missions.ian = d.missions.ian;
    G.missions.finaleDone = d.missions.finaleDone;
    G.inventory = d.inventory; G.properties = d.properties;
    G.stats = d.stats; G.systems = Object.assign(G.systems, d.systems || {});
    const p = d.player;
    G.player.mesh.position.set(p.x, 1, p.z);
    G.player.heading = p.heading; G.player.health = p.health;
    G.player.armour = p.armour; G.player.strength = p.strength;
    G.player.stamina = p.stamina; G.player.outfit = p.outfit;
    return true;
  } catch (e) { return false; }
}
export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
