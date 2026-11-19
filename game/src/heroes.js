// The two protagonists: Ryan and Ian, a couple who share one wallet,
// one wanted level and one reputation, with stats that shift with living.
import { makePersonMesh } from './people.js';
import { clamp } from './rng.js';

export class Heroes {
  constructor(scene) {
    this.scene = scene;
    this.active = 'ryan';
    this.ryan = {
      id: 'ryan', name: 'Ryan', gender: 'male',
      shirt: 0x2e86c1, pants: 0x2c3e50, skin: 0xe0ac69,
      x: -20, z: 170, heading: 0, health: 100, armour: 0,
      strength: 55, stamina: 60, weight: 78, outfit: 'tee',
      style: 'Hustler', bio: 'Ex-advertising man, rebuilding with charm.',
    };
    this.ian = {
      id: 'ian', name: 'Ian', gender: 'female',
      shirt: 0xe74c3c, pants: 0x2c3e50, skin: 0xf1c27d,
      x: -24, z: 172, heading: 0, health: 100, armour: 0,
      strength: 50, stamina: 70, weight: 62, outfit: 'tee',
      style: 'Sharp', bio: 'Sharp, funny, fearless — Ryan\'s partner in everything.',
    };
    this.ryan.mesh = makePersonMesh(this.ryan.shirt, this.ryan.pants, this.ryan.skin, false);
    this.ian.mesh = makePersonMesh(this.ian.shirt, this.ian.pants, this.ian.skin, true);
    scene.add(this.ryan.mesh); scene.add(this.ian.mesh);
    this.bond = 50;
    this.focus = 100;
    this.focusActive = false;
    this.reputation = 0;
    this.sleepDebt = 0;
    this.partner = this.ian;
    this.syncMeshes();
  }
  get current() { return this.active === 'ryan' ? this.ryan : this.ian; }
  get other() { return this.active === 'ryan' ? this.ian : this.ryan; }
  syncMeshes() {
    for (const h of [this.ryan, this.ian]) {
      h.mesh.position.set(h.x, 0, h.z);
      h.mesh.rotation.y = h.heading;
      const scale = 1 + (h.weight - 70) / 400;
      h.mesh.scale.set(scale, 1, scale);
    }
    this.ryan.mesh.visible = true;
    this.ian.mesh.visible = true;
  }
  switchHero() {
    const from = this.current;
    this.active = this.active === 'ryan' ? 'ian' : 'ryan';
    const to = this.current;
    to.x = from.x + 2; to.z = from.z + 2; to.heading = from.heading;
    to.health = Math.max(to.health, 40);
    this.syncMeshes();
    return to;
  }
  eat(food) {
    const h = this.current;
    h.health = clamp(h.health + food.health, 0, 100);
    h.stamina = clamp(h.stamina + food.stamina, 0, 100);
    h.weight = clamp(h.weight + 0.4, 45, 120);
    this.syncMeshes();
  }
  gymSession() {
    const h = this.current;
    h.strength = clamp(h.strength + 4, 0, 100);
    h.stamina = clamp(h.stamina + 3, 0, 100);
    h.weight = clamp(h.weight - 0.6, 45, 120);
    this.syncMeshes();
  }
  sleep() {
    for (const h of [this.ryan, this.ian]) {
      h.health = 100; h.stamina = 100;
    }
    this.sleepDebt = 0;
  }
  addBond(n) {
    this.bond = clamp(this.bond + n, 0, 100);
  }
  bondBonus() { return this.bond >= 70 ? 150 : this.bond >= 40 ? 60 : 0; }
  addRep(n) { this.reputation = clamp(this.reputation + n, -100, 100); }
  repLabel() {
    if (this.reputation >= 50) return 'Beloved';
    if (this.reputation >= 15) return 'Liked';
    if (this.reputation <= -50) return 'Feared';
    if (this.reputation <= -15) return 'Notorious';
    return 'Unknown';
  }
  useFocus(dt) {
    if (this.focusActive) {
      this.focus -= dt * 30;
      if (this.focus <= 0) { this.focus = 0; this.focusActive = false; }
    } else {
      this.focus = clamp(this.focus + dt * 6, 0, 100);
    }
  }
  wear(outfitId) {
    const h = this.current;
    h.outfit = outfitId;
    const cols = { tee: 0x2e86c1, hawaiian: 0xf39c12, suit: 0x2c3e50,
      hoodie: 0x5d6d7e, hiVis: 0xf1c40f, tux: 0x1a1a1a };
    const col = cols[outfitId] || 0x2e86c1;
    const old = h.mesh;
    const fresh = makePersonMesh(col, h.pants, h.skin, h.id === 'ian');
    fresh.position.copy(old.position);
    fresh.rotation.y = old.rotation.y;
    this.scene.remove(old);
    this.scene.add(fresh);
    h.mesh = fresh;
    h.shirt = col;
    this.syncMeshes();
  }
}
