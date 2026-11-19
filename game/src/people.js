// Solmar Bay people and animals: pedestrians on the pavements, gulls,
// dogs, deer and swamp alligators, each with a small daily routine.
import * as THREE from 'three';
import { TUNING, clamp } from './tuning.js';

const SHIRTS = [0xd93a2b, 0x2b6fd9, 0xf2c14e, 0x2ed573, 0x9b59b6, 0xff7f50, 0xf5f0e6, 0x1f1f24];

export function makePersonMesh(shirt, skin) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), mat(0x2a3a4a));
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), mat(shirt));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(skin));
  head.position.y = 1.78; g.add(head);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), mat(shirt));
  armL.position.set(-0.4, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export class Pedestrian {
  constructor(scene, x, z) {
    this.mesh = makePersonMesh(SHIRTS[Math.floor(Math.random() * SHIRTS.length)], 0xd9a066 + Math.floor(Math.random() * 0x301010));
    this.x = x; this.z = z; this.heading = Math.random() * Math.PI * 2;
    this.speed = 1.1 + Math.random() * 0.9;
    this.target = this._pickTarget();
    this.state = 'walk'; this.panic = 0;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
  }
  _pickTarget() {
    return { x: -400 + Math.random() * 800, z: -400 + Math.random() * 800 };
  }
  update(dt, threat) {
    if (threat && threat.level > 0) {
      const d = Math.hypot(this.x - threat.x, this.z - threat.z);
      if (d < 26) { this.panic = 1; }
    }
    if (this.panic > 0) {
      this.panic = Math.max(0, this.panic - dt * 0.25);
      const away = Math.atan2(this.x - threat.x, this.z - threat.z);
      this.heading = away;
      this.x += Math.sin(away) * 4.2 * dt;
      this.z += Math.cos(away) * 4.2 * dt;
    } else {
      const dx = this.target.x - this.x, dz = this.target.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) { this.target = this._pickTarget(); return; }
      this.heading = Math.atan2(dx, dz);
      this.x += (dx / d) * this.speed * dt;
      this.z += (dz / d) * this.speed * dt;
    }
    this.x = clamp(this.x, -430, 430); this.z = clamp(this.z, -430, 430);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(performance.now() * 0.008 + this.x) * 0.5;
    this.mesh.userData.armL.rotation.x = swing;
    this.mesh.userData.armR.rotation.x = -swing;
  }
}

export class Animal {
  constructor(scene, kind, x, z) {
    this.kind = kind; this.x = x; this.z = z;
    this.heading = Math.random() * Math.PI * 2;
    this.mesh = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
    if (kind === 'gull') {
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 6), mat(0xf5f0e6));
      body.rotation.x = Math.PI / 2; this.mesh.add(body);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.4), mat(0xe8e2d2));
      wing.position.y = 0.08; this.mesh.add(wing);
      this.mesh.position.y = 14 + Math.random() * 10;
      this.circleR = 20 + Math.random() * 30; this.circleA = Math.random() * Math.PI * 2;
    } else if (kind === 'dog') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.4), mat(0x8a6b45));
      body.position.y = 0.45; this.mesh.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(0x8a6b45));
      head.position.set(0.55, 0.7, 0); this.mesh.add(head);
    } else if (kind === 'deer') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.5), mat(0xb08a5a));
      body.position.y = 0.8; this.mesh.add(body);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.7, 0.25), mat(0xb08a5a));
      neck.position.set(0.6, 1.2, 0); this.mesh.add(neck);
    } else { // alligator
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.6), mat(0x4a6b3a));
      body.position.y = 0.25; this.mesh.add(body);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 6), mat(0x4a6b3a));
      tail.rotation.z = Math.PI / 2; tail.position.x = -1.6; this.mesh.add(tail);
    }
    this.mesh.position.set(x, this.mesh.position.y || 0, z);
    scene.add(this.mesh);
    this.studied = false;
  }
  update(dt, elapsed) {
    if (this.kind === 'gull') {
      this.circleA += dt * 0.25;
      this.x = Math.cos(this.circleA) * this.circleR + (this.homeX || 0);
      this.z = Math.sin(this.circleA) * this.circleR + (this.homeZ || 0);
      this.mesh.position.set(this.x, this.mesh.position.y, this.z);
      this.mesh.rotation.y = -this.circleA;
    } else if (this.kind === 'dog' || this.kind === 'deer') {
      this.heading += (Math.random() - 0.5) * dt * 0.8;
      this.x += Math.sin(this.heading) * 1.2 * dt;
      this.z += Math.cos(this.heading) * 1.2 * dt;
      this.x = clamp(this.x, -430, 430); this.z = clamp(this.z, -430, 430);
      this.mesh.position.set(this.x, 0, this.z);
      this.mesh.rotation.y = this.heading;
    }
    // Alligators bask still in the swamp.
  }
}

export class Crowd {
  constructor(scene) {
    this.peds = [];
    for (let i = 0; i < TUNING.pedCount; i++) {
      this.peds.push(new Pedestrian(scene, -400 + Math.random() * 800, -400 + Math.random() * 800));
    }
    this.animals = [];
    const spots = [
      ['gull', -260, 380], ['gull', 100, 420], ['gull', 380, 100], ['gull', -380, -100],
      ['dog', -260, -240], ['dog', -300, -180], ['dog', -200, -260],
      ['deer', -280, -300], ['deer', -320, -260], ['deer', -240, -320],
      ['alligator', 300, 280], ['alligator', 330, 300], ['alligator', 280, 320],
    ];
    for (const [kind, x, z] of spots) {
      const a = new Animal(scene, kind, x, z);
      a.homeX = x; a.homeZ = z;
      this.animals.push(a);
    }
  }
  update(dt, elapsed, threat) {
    for (const p of this.peds) p.update(dt, threat);
    for (const a of this.animals) a.update(dt, elapsed);
  }
  nearestAnimal(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const a of this.animals) {
      const d = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
}
