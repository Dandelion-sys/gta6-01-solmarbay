// Witness and disguise: crimes are remembered by outfit, vehicle and face.
export class Witness {
  constructor() {
    this.reports = [];
    this.heatByOutfit = {};
    this.cameras = [
      { x: 45, z: -35, name: 'Casino cameras' },
      { x: -10, z: 75, name: 'Bay Mart cameras' },
      { x: 25, z: 40, name: 'Gun shop cameras' },
      { x: 70, z: -60, name: 'Police station cameras' },
    ];
  }
  noteCrime(kind, x, z, outfit, vehicle, withPartner) {
    const seen = [];
    for (const c of this.cameras) {
      if (Math.hypot(c.x - x, c.z - z) < 45) seen.push(c.name);
    }
    const report = { kind, x, z, outfit, vehicle, withPartner, cameras: seen, at: Date.now() };
    this.reports.push(report);
    if (this.reports.length > 20) this.reports.shift();
    this.heatByOutfit[outfit] = (this.heatByOutfit[outfit] || 0) + 1;
    return report;
  }
  shedHeat(game) {
    // Changing clothes and switching vehicles sheds heat faster.
    const p = game.player;
    const outfitHeat = this.heatByOutfit[p.outfit] || 0;
    if (outfitHeat > 0) {
      game.police.heat = Math.max(0, game.police.heat - 20);
      this.heatByOutfit[p.outfit] = 0;
      return 'New outfit — the witnesses describe someone else now.';
    }
    return null;
  }
  changeOutfit(game, outfit) {
    const old = game.player.outfit;
    game.player.outfit = outfit;
    if (!game.economy.ownedClothes.includes(outfit)) game.economy.ownedClothes.push(outfit);
    const msg = this.shedHeat(game);
    return { old, outfit, msg };
  }
  cameraNear(x, z) {
    return this.cameras.find(c => Math.hypot(c.x - x, c.z - z) < 45) || null;
  }
  recentCount() { return this.reports.length; }
  describeLast() {
    const r = this.reports[this.reports.length - 1];
    if (!r) return 'No crimes on record. Keep it that way.';
    return `Last report: ${r.kind}, outfit ${r.outfit}, vehicle ${r.vehicle || 'on foot'}${r.cameras.length ? ', seen by ' + r.cameras.join(', ') : ', no cameras saw it'}.`;
  }
}
