// Vehicles: building cars, boats and planes, player driving, and road traffic.
import * as THREE from 'three';
import { WORLD } from './config.js';
import { makeRng, range, clamp } from './rng.js';

export function makeCarMesh(colour, kind) {
  const g = new THREE.Group();
  const bodyCol = new THREE.MeshLambertMaterial({ color: colour });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd8ff });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyCol);
  body.position.y = 0.65; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), glass);
  cabin.position.set(0, 1.3, -0.2); g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const spots = [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]];
  for (const [wx, wz] of spots) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.75, -0.2); g.add(bar);
    g.userData.lightBar = bar;
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe135 }));
    sign.position.set(0, 1.75, -0.2); g.add(sign);
  }
  return g;
}
export function makeBoatMesh(colour) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 6.5),
    new THREE.MeshLambertMaterial({ color: colour }));
  hull.position.y = 0.6; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 4.5),
    new THREE.MeshLambertMaterial({ color: 0xf0e0c0 }));
  deck.position.y = 1.2; g.add(deck);
  return g;
}
export function makePlaneMesh(colour) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: colour });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 7, 10), mat);
  body.rotation.x = Math.PI / 2; body.position.y = 1.2; g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 1.8), mat);
  wing.position.y = 1.2; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 1.2), mat);
  tail.position.set(0, 1.5, -3.2); g.add(tail);
  return g;
}
export class Vehicle {
  constructor(mesh, x, z, heading, spec) {
    this.mesh = mesh; this.x = x; this.z = z; this.heading = heading;
    this.speed = 0; this.spec = spec || { top: 38, accel: 24, colour: 0x888888 };
    this.health = 100; this.stolen = false; this.kind = spec && spec.kind || 'car';
    this.parked = true; this.driver = null;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading;
  }
  sync() {
    this.mesh.position.x = this.x;
    this.mesh.position.z = this.z;
    this.mesh.rotation.y = this.heading;
  }
  drive(dt, throttle, steer, brake) {
    const s = this.spec;
    if (throttle > 0) this.speed += s.accel * throttle * dt;
    if (throttle < 0) this.speed += s.accel * 0.6 * throttle * dt;
    if (brake) this.speed = Math.max(0, this.speed - 40 * dt);
    this.speed -= this.speed * 0.35 * dt;
    this.speed = clamp(this.speed, -14, s.top);
    if (Math.abs(this.speed) > 0.5) {
      this.heading += steer * WORLD.carTurn * dt * Math.sign(this.speed) * clamp(Math.abs(this.speed) / 12, 0.3, 1);
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.sync();
  }
}
export class Traffic {
  constructor(scene, city, seed) {
    this.scene = scene; this.city = city;
    this.rng = makeRng(seed + 77);
    this.cars = [];
    const cols = [0xffd23f, 0x3a86d8, 0xe8e8e8, 0x2ecc71, 0xe86a33, 0x9b59b6, 0x888888];
    for (let i = 0; i < 26; i++) {
      const vertical = this.rng() < 0.5;
      const line = [-340, -220, -110, 0, 110, 220, 340][Math.floor(this.rng() * 7)];
      const along = range(this.rng, -420, 420);
      const col = cols[Math.floor(this.rng() * cols.length)];
      const v = new Vehicle(makeCarMesh(col, 'traffic'),
        vertical ? line + 3.5 : along, vertical ? along : line + 3.5,
        vertical ? 0 : Math.PI / 2, { top: range(this.rng, 14, 22), accel: 18, colour: col, kind: 'car' });
      v.parked = false; v.speed = range(this.rng, 10, 18);
      v.vertical = vertical; v.line = line; v.dir = this.rng() < 0.5 ? 1 : -1;
      this.cars.push(v);
      scene.add(v.mesh);
    }
    this.parked = [];
    for (let i = 0; i < 18; i++) {
      const col = cols[Math.floor(this.rng() * cols.length)];
      const x = range(this.rng, -400, 400), z = range(this.rng, -400, 400);
      const v = new Vehicle(makeCarMesh(col, 'parked'), x, z, range(this.rng, 0, 6.28),
        { top: 36, accel: 24, colour: col, kind: 'car' });
      v.parked = true;
      this.parked.push(v);
      scene.add(v.mesh);
    }
  }
  nearestParked(x, z, maxD) {
    let best = null, bd = maxD;
    for (const v of this.parked) {
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  update(dt) {
    for (const v of this.cars) {
      if (v.vertical) {
        v.z += v.speed * v.dir * dt;
        v.heading = v.dir > 0 ? 0 : Math.PI;
        if (v.z > 440) v.z = -440;
        if (v.z < -440) v.z = 440;
      } else {
        v.x += v.speed * v.dir * dt;
        v.heading = v.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (v.x > 440) v.x = -440;
        if (v.x < -440) v.x = 440;
      }
      v.sync();
    }
  }
}
