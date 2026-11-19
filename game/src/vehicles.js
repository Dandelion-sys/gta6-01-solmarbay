// Vehicles: cars, boats, planes and the traffic that drives them.
// Player driving is simple arcade physics: throttle, brake, steering
// that bites harder at low speed, and a little slide.
import * as THREE from 'three';
import { CAR_COLORS, clamp, dist2, mulberry32 } from './tuning.js';
import { collideCircle, keepOnIsland } from './world.js';
export function makeCarMesh(color, kind) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1A2E3A });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 4.4), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.2), glassMat);
  cabin.position.set(0, 1.15, -0.2); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    g.add(w); g.userData.wheels.push(w);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xF1C40F }));
    sign.position.set(0, 1.6, -0.2); g.add(sign);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2244FF }));
    bar.position.set(0, 1.55, -0.2); g.add(bar);
  }
  return g;
}
export function makeBoatMesh(color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 6.5),
    new THREE.MeshLambertMaterial({ color }));
  hull.position.y = 0.4; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 4.5),
    new THREE.MeshLambertMaterial({ color: 0xF5F0E1 }));
  deck.position.y = 1.0; g.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x5D6D7E }));
  mast.position.set(0, 2.2, 0.5); g.add(mast);
  return g;
}
export function spawnVehicle(G, kind, x, z, heading, color) {
  const mesh = kind === 'boat' ? makeBoatMesh(color ?? 0xEAF2F8)
    : makeCarMesh(color ?? CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], kind);
  mesh.position.set(x, kind === 'boat' ? -0.2 : 0, z);
  mesh.rotation.y = heading || 0;
  G.scene.add(mesh);
  const v = {
    mesh, kind: kind || 'car', heading: heading || 0, speed: 0,
    x, z, parked: false, driver: null, health: 100, value: 4000 + Math.floor(Math.random() * 8000),
    locked: false, route: null, routeIndex: 0, stolen: false,
  };
  G.vehicles.push(v);
  return v;
}
export function spawnTraffic(G) {
  const rng = mulberry32(G.seed + 77);
  G.trafficRoutes = [];
  const xs = [-300, -180, -60, 60, 180, 300];
  const zs = [-280, -160, -40, 80, 200, 300];
  for (let i = 0; i < 14; i++) {
    const vertical = rng() > 0.5;
    const line = vertical ? xs[Math.floor(rng() * xs.length)] : zs[Math.floor(rng() * zs.length)];
    const start = -320 + rng() * 640;
    const v = spawnVehicle(G, 'car', vertical ? line : start, vertical ? start : line, vertical ? (rng() > 0.5 ? 0 : Math.PI) : (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2));
    v.route = { vertical, line, dir: rng() > 0.5 ? 1 : -1, speed: 8 + rng() * 6 };
    v.parked = false;
    G.trafficRoutes.push(v);
  }
  // Parked cars along the downtown streets for stealing and driving.
  for (let i = 0; i < 10; i++) {
    const x = [-60, 60, 180][i % 3] + (rng() > 0.5 ? 6 : -6);
    const z = -140 + i * 32;
    const v = spawnVehicle(G, 'car', x, z, Math.PI / 2);
    v.parked = true;
    v.locked = rng() > 0.6;
  }
}
export function updateTraffic(G, dt) {
  for (const v of G.trafficRoutes) {
    if (!v || v === G.player.vehicle) continue;
    const r = v.route;
    const step = r.speed * r.dir * dt;
    if (r.vertical) {
      v.z += step;
      if (v.z > 340) v.z = -340;
      if (v.z < -340) v.z = 340;
      v.mesh.position.z = v.z;
      v.mesh.rotation.y = r.dir > 0 ? 0 : Math.PI;
    } else {
      v.x += step;
      if (v.x > 350) v.x = -350;
      if (v.x < -350) v.x = 350;
      v.mesh.position.x = v.x;
      v.mesh.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    v.heading = v.mesh.rotation.y;
  }
}
export function enterCar(G, car) {
  if (!car || G.player.vehicle) return false;
  G.player.vehicle = car;
  G.player.onFoot = false;
  car.driver = 'player';
  car.parked = false;
  G.player.mesh.visible = false;
  if (G.player.vehicle === car) G.sound.ensure();
  return true;
}
export function exitCar(G) {
  const car = G.player.vehicle;
  if (!car) return false;
  G.player.vehicle = null;
  G.player.onFoot = true;
  car.driver = null;
  car.speed = 0;
  const p = G.player.mesh;
  p.visible = true;
  p.position.set(car.x + Math.sin(car.heading + Math.PI / 2) * 2.4, 0, car.z + Math.cos(car.heading + Math.PI / 2) * 2.4);
  p.rotation.y = car.heading;
  G.player.heading = car.heading;
  return true;
}
export function nearestCar(G, maxDist) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let best = null, bestD = maxDist || 6;
  for (const v of G.vehicles) {
    if (v.kind === 'boat') continue;
    const d = dist2(v.x, v.z, px, pz);
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
export function updateDriving(G, dt) {
  const car = G.player.vehicle;
  if (!car) return;
  const input = G.input;
  const fwd = input.down('KeyW') ? 1 : 0;
  const back = input.down('KeyS') ? 1 : 0;
  const steer = (input.down('KeyA') ? 1 : 0) - (input.down('KeyD') ? 1 : 0);
  const top = car.top || 34;
  if (fwd) car.speed += 26 * dt;
  if (back) car.speed -= car.speed > 0.5 ? 40 * dt : 14 * dt;
  if (!fwd && !back) car.speed *= Math.max(0, 1 - 1.2 * dt);
  car.speed = clamp(car.speed, -12, top);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.heading += steer * 1.9 * dt * dirSign * clamp(Math.abs(car.speed) / 8, 0, 1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  collideCircle(G, car, 2.0);
  keepOnIsland(G, car);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const wheels = car.mesh.userData.wheels || [];
  for (const w of wheels) w.rotation.x += car.speed * dt * 2;
  G.player.heading = car.heading;
  G.player.mesh.position.set(car.x, 0, car.z);
  if (Math.abs(car.speed) > 1) G.sound.engineHum(Math.abs(car.speed) / top);
}
