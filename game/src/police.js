// Wanted level and the police: patrol cars, roadblocks, helicopters,
// lockdown at six stars, and the bounty board at the precinct.
import * as THREE from 'three';
import { makeCarMesh, Vehicle } from './vehicles.js';
import { clamp, fmtMoney } from './rng.js';

export class Police {
  constructor(scene, seed) {
    this.scene = scene;
    this.wanted = 0;
    this.heat = 0;
    this.hiddenTimer = 0;
    this.bounty = 0;
    this.cars = [];
    this.heli = null;
    this.heliLight = null;
    this.roadblocks = [];
    this.spawnTimer = 0;
    this.lockdown = false;
    this.bounties = [
      { id: 'b1', name: 'Marlon Vex', crime: 'Smuggled crates', reward: 1200, alive: true },
      { id: 'b2', name: 'Tessa Kline', crime: 'Casino cheat', reward: 2200, alive: true },
      { id: 'b3', name: 'Big Otto', crime: 'Truck hijack', reward: 3500, alive: true },
    ];
    this.spawnedBounty = null;
  }
  addCrime(amount, reason) {
    this.heat = clamp(this.heat + amount, 0, 100);
    const next = Math.min(6, Math.ceil(this.heat / 16));
    if (next > this.wanted) this.wanted = next;
    this.bounty += amount * 25;
    this.hiddenTimer = 0;
    return reason;
  }
  shedHeat(amount) {
    this.heat = Math.max(0, this.heat - amount);
    this.wanted = Math.min(this.wanted, Math.ceil(this.heat / 16));
    if (this.wanted === 0) this.bounty = 0;
  }
  spawnCar(x, z) {
    const mesh = makeCarMesh(0x1a2a4a, 'police');
    const v = new Vehicle(mesh, x, z, 0, { top: 44, accel: 34, colour: 0x1a2a4a, kind: 'police' });
    v.parked = false;
    this.scene.add(mesh);
    this.cars.push(v);
    return v;
  }
  spawnHeli(x, z) {
    if (this.heli) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 4.6),
      new THREE.MeshLambertMaterial({ color: 0x1a2a4a }));
    g.add(body);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 0.6),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1; g.add(rotor);
    const spot = new THREE.Mesh(new THREE.ConeGeometry(4, 26, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.22 }));
    spot.position.y = -13; g.add(spot);
    g.position.set(x, 46, z);
    this.scene.add(g);
    this.heli = { mesh: g, rotor, x, z };
  }
  removeHeli() {
    if (!this.heli) return;
    this.scene.remove(this.heli.mesh);
    this.heli = null;
  }
  clearCars() {
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
    this.removeHeli();
    for (const r of this.roadblocks) this.scene.remove(r);
    this.roadblocks = [];
    this.lockdown = false;
  }
  update(dt, px, pz, playerVisible, city) {
    if (this.wanted > 0) {
      if (playerVisible) this.hiddenTimer = 0;
      else {
        this.hiddenTimer += dt;
        if (this.hiddenTimer > 6) this.shedHeat(dt * 3.2);
      }
      this.spawnTimer -= dt;
      const want = this.wanted >= 4 ? 4 : this.wanted >= 2 ? 3 : this.wanted >= 1 ? 2 : 0;
      if (this.spawnTimer <= 0 && this.cars.length < want) {
        this.spawnTimer = 2.5;
        const a = Math.random() * Math.PI * 2;
        this.spawnCar(px + Math.sin(a) * 70, pz + Math.cos(a) * 70);
      }
      if (this.wanted >= 4 && !this.heli) this.spawnHeli(px, pz);
      if (this.wanted < 4 && this.heli) this.removeHeli();
      if (this.wanted >= 6 && !this.lockdown) {
        this.lockdown = true;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 1.4),
            new THREE.MeshLambertMaterial({ color: 0xff8800 }));
          mesh.position.set(px + Math.sin(a) * 55, 1, pz + Math.cos(a) * 55);
          this.scene.add(mesh);
          this.roadblocks.push(mesh);
        }
      }
    } else {
      this.clearCars();
    }
    for (const c of this.cars) {
      const dx = px - c.x, dz = pz - c.z;
      const d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -1.6 * dt, 1.6 * dt);
      const speed = d > 12 ? 40 : 18;
      c.x += Math.sin(c.heading) * speed * dt;
      c.z += Math.cos(c.heading) * speed * dt;
      c.sync();
      if (c.mesh.userData.lightBar) {
        c.mesh.userData.lightBar.material.color.setHex(
          Math.floor(performance.now() / 300) % 2 ? 0xff2222 : 0x2266ff);
      }
      if (d < 3.2) { c.speed = 0; }
    }
    if (this.heli) {
      this.heli.x += (px - this.heli.x) * dt * 0.5;
      this.heli.z += (pz - this.heli.z) * dt * 0.5;
      this.heli.mesh.position.set(this.heli.x, 46 + Math.sin(performance.now() * 0.001) * 2, this.heli.z);
      this.heli.rotor.rotation.y += dt * 22;
    }
  }
  bountyText() { return this.bounty > 0 ? 'Bounty ' + fmtMoney(this.bounty) : ''; }
}
