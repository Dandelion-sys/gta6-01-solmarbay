// Solmar Bay police: a wanted level of one to six stars, patrol cars
// that chase the player, roadblocks at high heat, a helicopter from four
// stars, and a city lockdown at six.
import * as THREE from 'three';
import { TUNING, clamp } from './tuning.js';
import { makeCarMesh, Car } from './vehicles.js';

export class Police {
  constructor(scene) {
    this.scene = scene;
    this.wanted = 0;
    this.heat = 0; // 0..100, decays when hidden
    this.cars = [];
    this.bustedTimer = 0;
    this.lockdown = false;
    this.heli = null;
    this.heliLight = null;
    this._makeHeli();
  }
  _makeHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.5),
      new THREE.MeshLambertMaterial({ color: 0x1c2733 }));
    body.position.y = 0; g.add(body);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.1; rotor.name = 'rotor'; g.add(rotor);
    const spot = new THREE.SpotLight(0xfff2c0, 60, 80, 0.35, 0.5);
    spot.position.set(0, -1, 0); g.add(spot);
    g.visible = false;
    this.heli = g; this.heliLight = spot;
    this.scene.add(g);
  }
  addCrime(level) {
    this.wanted = clamp(this.wanted + level, 0, 6);
    this.heat = Math.min(100, this.heat + level * 22);
    this.lockdown = this.wanted >= 6;
  }
  decay(dt, hidden) {
    if (this.wanted === 0) return;
    this.heat = Math.max(0, this.heat - dt * (hidden ? 4.5 : 1.2));
    if (this.heat <= 0) this.wanted = Math.max(0, this.wanted - 1), this.heat = this.wanted > 0 ? 40 : 0;
    this.lockdown = this.wanted >= 6;
  }
  wantedCars() { return Math.min(4, this.wanted); }
  update(dt, px, pz, elapsed) {
    // Keep the right number of patrol cars.
    const want = this.wantedCars();
    while (this.cars.length < want) {
      const a = Math.random() * Math.PI * 2;
      const car = new Car(makeCarMesh(0x1c2733, 'police'),
        px + Math.cos(a) * 55, pz + Math.sin(a) * 55, 0);
      car.parked = false; car.isPolice = true; car.speed = 0;
      this.cars.push(car);
      this.scene.add(car.mesh);
    }
    while (this.cars.length > want) {
      const c = this.cars.pop();
      this.scene.remove(c.mesh);
    }
    for (const c of this.cars) {
      const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz) || 1;
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - c.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      c.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
      c.speed = TUNING.policeChaseSpeed * (0.8 + this.wanted * 0.06);
      const f = c.forward();
      c.x += f.x * c.speed * dt; c.z += f.z * c.speed * dt;
      c.sync();
      const bar = c.mesh.getObjectByName('lightbar');
      if (bar) bar.material.emissive.setHex(Math.floor(elapsed * 6) % 2 === 0 ? 0xcc1111 : 0x1133cc);
      c.nearPlayer = d;
    }
    // Helicopter from four stars.
    const heliOn = this.wanted >= 4;
    this.heli.visible = heliOn;
    if (heliOn) {
      this.heli.position.set(px + Math.sin(elapsed * 0.5) * 18, 42, pz + Math.cos(elapsed * 0.5) * 18);
      this.heli.lookAt(px, 0, pz);
      const rotor = this.heli.getObjectByName('rotor');
      if (rotor) rotor.rotation.y = elapsed * 22;
      this.heliLight.target.position.set(px, 0, pz);
      this.heli.add(this.heliLight.target);
    }
  }
  // Busted check: a patrol car touching the player on foot.
  bustedCheck(px, pz, onFoot) {
    if (!onFoot || this.wanted === 0) return false;
    for (const c of this.cars) if (Math.hypot(px - c.x, pz - c.z) < 3.0) return true;
    return false;
  }
  reset() {
    this.wanted = 0; this.heat = 0; this.lockdown = false;
    for (const c of this.cars) this.scene.remove(c.mesh);
    this.cars = [];
    this.heli.visible = false;
  }
}
