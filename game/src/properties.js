// Properties, safehouse upgrades and crew for hire.
export const UPGRADES = [
  { name: 'Comfy Bed', price: 800, effect: 'Sleep restores full stamina and +2 bond' },
  { name: 'Workshop', price: 3500, effect: 'Repair and tune owned cars' },
  { name: 'Armoury', price: 5200, effect: 'Store all four weapons, clean them free' },
  { name: 'Bay View Decor', price: 1200, effect: 'The apartment feels like home. Bond +5' },
  { name: 'Security Cameras', price: 2100, effect: 'Police lose you faster near the safehouse' },
  { name: 'Garage Extension', price: 6800, effect: 'Store six cars instead of two' },
];
export const CREW = [
  { name: 'Milo the Driver', role: 'driver', wage: 400, skill: 'Getaway driving, never panics' },
  { name: 'Sana the Lookout', role: 'lookout', wage: 300, skill: 'Spots police two blocks early' },
  { name: 'Otto the Mechanic', role: 'mechanic', wage: 350, skill: 'Fixes cars fast and cheap' },
  { name: 'Luz the Hacker', role: 'hacker', wage: 600, skill: 'Disables cameras from a distance' },
];
export class Properties {
  constructor(economy) {
    this.economy = economy;
    this.upgrades = [];
    this.crew = [];
    this.morale = {};
  }
  buyUpgrade(name) {
    const u = UPGRADES.find(x => x.name === name);
    if (!u || this.upgrades.includes(name)) return false;
    if (!this.economy.spend(u.price)) return false;
    this.upgrades.push(name);
    if (name === 'Bay View Decor') this.economy.bond = Math.min(100, this.economy.bond + 5);
    return true;
  }
  hire(name) {
    const c = CREW.find(x => x.name === name);
    if (!c || this.crew.includes(name)) return false;
    if (!this.economy.spend(c.wage)) return false;
    this.crew.push(name);
    this.morale[name] = 70;
    return true;
  }
  payCrew() {
    let total = 0;
    for (const name of this.crew) {
      const c = CREW.find(x => x.name === name);
      total += c.wage;
      this.morale[name] = Math.max(0, (this.morale[name] || 70) - 5);
    }
    this.economy.money = Math.max(0, this.economy.money - total);
    return total;
  }
  giftCrew(name) {
    if (!this.crew.includes(name)) return false;
    if (!this.economy.spend(150)) return false;
    this.morale[name] = Math.min(100, (this.morale[name] || 70) + 20);
    this.economy.bond = Math.min(100, this.economy.bond + 1);
    return true;
  }
  crewWill(role) {
    const member = this.crew.find(n => CREW.find(c => c.name === n && c.role === role));
    if (!member) return false;
    return (this.morale[member] || 0) >= 40;
  }
  listUpgrades() { return UPGRADES.map(u => ({ ...u, owned: this.upgrades.includes(u.name) })); }
  listCrew() { return CREW.map(c => ({ ...c, hired: this.crew.includes(c.name), morale: this.morale[c.name] || null })); }
}
