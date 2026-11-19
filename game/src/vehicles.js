// Vehicles: traffic cars, parked cars, the player's car, boats, planes.
import * as THREE from 'three';
import { TUNE, CAR_MODELS } from './config.js';

function carMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.75; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 2.2), new THREE.MeshLambertMaterial({ color: 0x222831 }));
  cab.position.set(0, 1.35, -0.2); g.add(cab);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const [wx, wz] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.42, wz); g.add(w);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.8, -0.2); g.add(bar); g.userData.lightBar = bar;
  }
  return g;
}
export class Vehicle {
  constructor(scene, x, z, yaw, model, kind) {
    this.model = model; this.kind = kind || 'traffic';
    this.mesh = carMesh(model.color, kind);
    this.mesh.position.set(x, 0, z); this.mesh.rotation.y = yaw;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0;
    this.steer = 0; this.ai = kind === 'traffic';
    this.route = null; this.routeT = 0; this.stuck = 0;
    this.isPolice = kind === 'police';
    this.solidRadius = TUNE.carSolidRadius;
  }
  forward() { return { x: Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  // Drive with throttle -1..1 and steer -1..1. Forward is along facing.
  drive(dt, throttle, steer) {
    const top = this.model.top || 36;
    this.speed += throttle * TUNE.carAccel * dt;
    if (throttle === 0) this.speed *= Math.pow(0.4, dt);
    if (this.speed > top) this.speed = top;
    if (this.speed < -TUNE.carReverseMax) this.speed = -TUNE.carReverseMax;
    if (Math.abs(this.speed) < 0.05 && throttle === 0) this.speed = 0;
    const dir = this.speed >= 0 ? 1 : -1;
    this.yaw += steer * TUNE.carTurn * dt * dir * Math.min(1, Math.abs(this.speed) / 8 + 0.2);
    const f = this.forward();
    this.x += f.x * this.speed * dt; this.z += f.z * this.speed * dt;
    this.x = Math.max(-240, Math.min(240, this.x));
    this.z = Math.max(-240, Math.min(240, this.z));
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.yaw;
  }
}
export class Traffic {
  constructor(scene) {
    this.scene = scene; this.cars = [];
    this.spawnPoints = [];
    for (let i = 0; i < 10; i++) this.spawnPoints.push({ x: -180 + i * 40, z: 0, yaw: Math.PI / 2 });
    for (let i = 0; i < 10; i++) this.spawnPoints.push({ x: 0, z: -180 + i * 40, yaw: 0 });
    for (let i = 0; i < 14; i++) this.addTrafficCar();
    for (let i = 0; i < 12; i++) this.addParkedCar();
  }
  addTrafficCar() {
    const p = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    const m = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
    const v = new Vehicle(this.scene, p.x + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 4, p.yaw, m, 'traffic');
    v.speed = 8 + Math.random() * 8; this.cars.push(v); return v;
  }
  addParkedCar() {
    const spots = [[-25, 48], [-35, 62], [30, 32], [60, 12], [-15, 68], [48, -28], [-48, -38], [75, -52], [125, 82], [-145, 112], [105, 132], [-60, -112]];
    const s = spots[this.cars.length % spots.length];
    const m = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
    const v = new Vehicle(this.scene, s[0], s[1], Math.random() * Math.PI * 2, m, 'parked');
    this.cars.push(v); return v;
  }
  addPoliceCar(x, z) {
    const v = new Vehicle(this.scene, x, z, 0, { name: 'Interceptor', top: 46, color: 0x111111 }, 'police');
    v.speed = 0; this.cars.push(v); return v;
  }
  removeCar(v) { this.scene.remove(v.mesh); this.cars = this.cars.filter(c => c !== v); }
  update(dt, player) {
    for (const v of this.cars) {
      if (v.kind === 'traffic') {
        if (v.chase) {
          const wantYaw = Math.atan2(player.x - v.x, -(player.z - v.z));
          let dy = wantYaw - v.yaw;
          while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
          v.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
          v.drive(dt, 0.8, 0);
        } else v.drive(dt, 0.35, 0);
        if (Math.abs(v.x) > 230 || Math.abs(v.z) > 230) { v.x = -v.x * 0.8; v.z = -v.z * 0.8; }
        if (Math.random() < dt * 0.05) v.yaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
    }
  }
  nearestCar(x, z, maxD) {
    let best = null; let bd = maxD;
    for (const v of this.cars) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = v; } }
    return best;
  }
}
