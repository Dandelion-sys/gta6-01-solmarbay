// Solmar Bay protagonists: Ryan and Ian, a couple who share one wallet,
// one wanted level and one reputation, with their own mission chains.
import * as THREE from 'three';
import { TUNING, clamp } from './tuning.js';
import { makePersonMesh } from './people.js';

export const HEROES = {
  ryan: {
    id: 'ryan', name: 'Ryan', sex: 'male', age: 39,
    bio: 'A former advertising man rebuilding his life with hustle and charm.',
    shirt: 0x2b6fd9, skin: 0xd9a066, hair: 0x2a1a10,
    style: 'Smooth talker: better prices, slower heat.',
    skill: 'negotiator',
  },
  ian: {
    id: 'ian', name: 'Ian', sex: 'female', age: 38,
    bio: 'Sharp, funny and fearless — Ryan’s partner in life and in crime.',
    shirt: 0xd93a2b, skin: 0xe8b88a, hair: 0x1a1a1a,
    style: 'Quick hands: faster driving, faster Focus refill.',
    skill: 'driver',
  },
};

export class Hero {
  constructor(scene, id) {
    this.def = HEROES[id];
    this.id = id;
    this.mesh = new THREE.Group();
    const body = makePersonMesh(this.def.shirt, this.def.skin);
    this.mesh.add(body);
    // Hair cap.
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8),
      new THREE.MeshLambertMaterial({ color: this.def.hair }));
    hair.position.y = 1.86; hair.scale.y = 0.7;
    this.mesh.add(hair);
    this.x = -60; this.z = 60; this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.health = TUNING.maxHealth;
    this.armour = 0;
    this.stamina = 100; this.strength = 50;
    this.focus = 100; // Focus meter for slow-motion aiming
    this.focusActive = false;
    this.outfit = 'street';
    this.mesh.position.set(this.x, 0, this.z);
    scene.add(this.mesh);
    this.walkPhase = 0;
  }
  setPosition(x, z) { this.x = x; this.z = z; this.mesh.position.set(x, 0, z); }
  sync(dt, moving) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (moving) this.walkPhase += dt * 11;
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.07 : 0;
    this.mesh.position.y = bob;
  }
  hurt(amount) {
    let left = amount;
    if (this.armour > 0) {
      const absorbed = Math.min(this.armour, left);
      this.armour -= absorbed; left -= absorbed;
    }
    this.health = Math.max(0, this.health - left);
    return this.health;
  }
  heal(amount) { this.health = clamp(this.health + amount, 0, TUNING.maxHealth); }
  eat(food) {
    this.heal(food.heal || 10);
    this.stamina = clamp(this.stamina + (food.energy || 10), 0, 100);
  }
  train() {
    this.strength = clamp(this.strength + 2, 0, 100);
    this.stamina = clamp(this.stamina - 15, 0, 100);
  }
  sleep() {
    this.health = TUNING.maxHealth;
    this.stamina = 100;
    this.focus = 100;
  }
}

export class Couple {
  constructor(scene) {
    this.ryan = new Hero(scene, 'ryan');
    this.ian = new Hero(scene, 'ian');
    this.active = this.ryan;
    this.inactive = this.ian;
    this.ian.mesh.visible = false;
    this.bond = 40; // 0..100, grows with gifts, dates and duo missions
    this.wallet = 850;
    this.reputation = 0; // -100 bad .. +100 good
    this.best = 0;
  }
  switchHero() {
    const from = this.active, to = this.inactive;
    to.setPosition(from.x + 2, from.z + 2);
    to.health = from.health; to.armour = from.armour;
    from.mesh.visible = false;
    to.mesh.visible = true;
    this.active = to; this.inactive = from;
    return to;
  }
  addMoney(n) { this.wallet += n; if (this.wallet > this.best) this.best = this.wallet; return this.wallet; }
  spend(n) { if (this.wallet < n) return false; this.wallet -= n; return true; }
  addBond(n) { this.bond = clamp(this.bond + n, 0, 100); }
  addReputation(n) { this.reputation = clamp(this.reputation + n, -100, 100); }
  dawnBonus() {
    // A high bond pays a small bonus at dawn and a little extra health.
    if (this.bond >= 70) {
      this.addMoney(120);
      this.active.heal(15);
      return 120;
    }
    return 0;
  }
  outfitPriceFactor() {
    // Good reputation earns shop discounts; bad reputation pays more.
    return 1 - this.reputation * 0.002;
  }
}
