// Solmar Bay vehicles: parked cars, traffic, taxis, police cars and the
// player's driven car. A parked car is solid; a moving car that strikes
// the player on foot deals damage, knockback, a screen flash and a sound.
import * as THREE from 'three';
import { COLOURS, TUNING, clamp, dist2 } from './tuning.js';

export function makeCarMesh(colour, kind) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4),
    new THREE.MeshLambertMaterial({ color: colour }));
  body.position.y = 0.65; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: kind === 'police' ? 0xffffff : 0x223344 }));
  cabin.position.set(0, 1.3, -0.2); g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xd93a2b, emissive: 0x881111 }));
    bar.position.set(0, 1.75, -0.2); bar.name = 'lightbar'; g.add(bar);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x2f7bff }));
    door.position.set(-1.01, 0.7, 0); door.rotation.y = -Math.PI / 2; g.add(door);
  }
  if (kind === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5),
      new THREE.MeshLambertMaterial({ color: COLOURS.taxi, emissive: 0x664400 }));
    sign.position.set(0, 1.75, -0.2); g.add(sign);
  }
  g.userData.kind = kind || 'civil';
  return g;
}

export class Car {
  constructor(mesh, x, z, heading) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.heading = heading || 0;
    this.speed = 0; this.steer = 0;
    this.kind = mesh.userData.kind;
    this.parked = true; this.driven = false;
    this.hitCooldown = 0;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }
  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }
  sync() { this.mesh.position.set(this.x, 0, this.z); this.mesh.rotation.y = this.heading; }
}

export class Traffic {
  constructor(scene, city) {
    this.scene = scene; this.city = city;
    this.cars = [];
    this.parked = [];
    this.roadLines = [-360, -240, -120, 0, 120, 240, 360];
    // Parked cars from the city's spots.
    for (const s of city.parkedSpots) {
      const colour = COLOURS.carPaints[Math.floor(Math.random() * COLOURS.carPaints.length)];
      const car = new Car(makeCarMesh(colour, 'civil'), s.x, s.z, s.heading);
      car.parked = true;
      this.parked.push(car);
      this.cars.push(car);
      scene.add(car.mesh);
    }
    // Moving traffic on the road grid.
    for (let i = 0; i < TUNING.trafficCount; i++) {
      const colour = COLOURS.carPaints[Math.floor(Math.random() * COLOURS.carPaints.length)];
      const horizontal = i % 2 === 0;
      const line = this.roadLines[i % this.roadLines.length];
      const along = -400 + Math.random() * 800;
      const car = new Car(makeCarMesh(colour, 'civil'),
        horizontal ? along : line, horizontal ? line : along,
        horizontal ? (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() < 0.5 ? 0 : Math.PI));
      car.parked = false;
      car.speed = TUNING.trafficSpeed * (0.7 + Math.random() * 0.5);
      car.lane = line; car.horizontal = horizontal;
      this.cars.push(car);
      scene.add(car.mesh);
    }
    // One taxi cruising downtown.
    const taxi = new Car(makeCarMesh(COLOURS.taxi, 'taxi'), 60, 120, 0);
    taxi.parked = false; taxi.speed = 10; taxi.lane = 120; taxi.horizontal = false; taxi.isTaxi = true;
    this.cars.push(taxi); scene.add(taxi.mesh);
    this.taxi = taxi;
  }
  movingCars() { return this.cars.filter((c) => !c.parked); }
  nearestParked(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const c of this.parked) {
      const d = dist2(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // Drive the traffic cars along their road line, wrapping at the edge.
  update(dt) {
    for (const c of this.cars) {
      if (c.parked || c.driven) continue;
      const f = c.forward();
      c.x += f.x * c.speed * dt;
      c.z += f.z * c.speed * dt;
      if (c.horizontal) { if (c.x > 430) c.x = -430; if (c.x < -430) c.x = 430; }
      else { if (c.z > 430) c.z = -430; if (c.z < -430) c.z = 430; }
      c.sync();
    }
  }
  // Solid-body rule for a player on foot: every car blocks walking.
  // Returns true when the player was pushed out of a car.
  collidePlayer(px, pz, radius) {
    let pushed = false;
    for (const c of this.cars) {
      const dx = px - c.x, dz = pz - c.z;
      const d2 = dx * dx + dz * dz;
      const r = TUNING.carSolidRadius;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          px = c.x + (dx / d) * r; pz = c.z + (dz / d) * r;
        } else { px = c.x + r; pz = c.z; }
        pushed = true;
      }
    }
    return { x: px, z: pz, pushed };
  }
}
