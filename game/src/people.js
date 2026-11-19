// Pedestrians and animals: walkers on the pavements, wildlife in its corners,
// and the low-poly hero body both protagonists share.
import * as THREE from 'three';
import { makeRng, range, pick, clamp } from './rng.js';
import { WORLD } from './config.js';

export function makePersonMesh(shirt, pants, skin, isFemale) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32), pantsMat);
  legs.position.y = 0.43; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.22; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.4), skinMat);
  head.position.y = 1.85; g.add(head);
  const hairCol = isFemale ? 0x2c1a0e : 0x1a1a1a;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, isFemale ? 0.55 : 0.2, 0.44),
    new THREE.MeshLambertMaterial({ color: hairCol }));
  hair.position.y = isFemale ? 1.95 : 2.08; g.add(hair);
  const armGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
  const armL = new THREE.Mesh(armGeo, shirtMat); armL.position.set(-0.4, 1.25, 0); g.add(armL);
  const armR = new THREE.Mesh(armGeo, shirtMat); armR.position.set(0.4, 1.25, 0); g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR; g.userData.legs = legs;
  return g;
}
export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed + 31);
    this.list = [];
    const shirts = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    for (let i = 0; i < 42; i++) {
      const female = this.rng() < 0.5;
      const mesh = makePersonMesh(
        pick(this.rng, shirts), pick(this.rng, [0x2c3e50, 0x5d6d7e, 0x7d6608]),
        pick(this.rng, skins), female);
      const x = range(this.rng, -420, 420), z = range(this.rng, -420, 420);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.list.push({
        mesh, x, z, heading: range(this.rng, 0, 6.28),
        speed: range(this.rng, 1.2, 2.4), state: 'walk',
        fear: 0, targetX: x, targetZ: z, female,
        greeting: pick(this.rng, ['Morning!', 'Lovely day.', 'Watch it!', 'Nice car!']),
      });
    }
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const p of this.list) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  scare(x, z, radius) {
    let count = 0;
    for (const p of this.list) {
      if (Math.hypot(p.x - x, p.z - z) < radius) { p.state = 'flee'; p.fear = 6; count++; }
    }
    return count;
  }
  update(dt, playerX, playerZ) {
    for (const p of this.list) {
      if (p.state === 'flee') {
        p.fear -= dt;
        const a = Math.atan2(p.x - playerX, p.z - playerZ);
        p.heading = a;
        p.x += Math.sin(a) * 5 * dt;
        p.z += Math.cos(a) * 5 * dt;
        if (p.fear <= 0) p.state = 'walk';
      } else {
        if (Math.hypot(p.targetX - p.x, p.targetZ - p.z) < 3 || Math.random() < dt * 0.02) {
          p.targetX = clamp(p.x + range(this.rng, -60, 60), -430, 430);
          p.targetZ = clamp(p.z + range(this.rng, -60, 60), -430, 430);
        }
        const a = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
        p.heading = a;
        p.x += Math.sin(a) * p.speed * dt;
        p.z += Math.cos(a) * p.speed * dt;
      }
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = p.heading;
      const swing = Math.sin(performance.now() * 0.008 + p.x) * 0.4;
      p.mesh.userData.armL.rotation.x = swing;
      p.mesh.userData.armR.rotation.x = -swing;
    }
  }
}
export class Animals {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = makeRng(seed + 55);
    this.list = [];
    this.spawn('gull', 14, 'coast');
    this.spawn('pelican', 5, 'coast');
    this.spawn('dog', 8, 'suburb');
    this.spawn('deer', 7, 'fields');
    this.spawn('gator', 6, 'swamp');
    this.spawn('heron', 2, 'swamp');
    this.spawn('fox', 2, 'cliff');
  }
  spawn(kind, n, zone) {
    const spots = {
      coast: () => [range(this.rng, -460, 460), range(this.rng, -460, 460)],
      suburb: () => [range(this.rng, 180, 420), range(this.rng, 120, 360)],
      fields: () => [range(this.rng, 200, 420), range(this.rng, 180, 380)],
      swamp: () => [range(this.rng, 180, 420), range(this.rng, -400, -180)],
      cliff: () => [range(this.rng, -440, -260), range(this.rng, -420, -220)],
    };
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[zone]();
      let mesh;
      if (kind === 'gull' || kind === 'pelican' || kind === 'heron') {
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 6),
          new THREE.MeshLambertMaterial({ color: kind === 'heron' ? 0x5d6d7e : 0xffffff }));
        body.rotation.x = Math.PI / 2; mesh.add(body);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.7),
          new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
        wing.position.y = 0.2; mesh.add(wing);
        mesh.position.set(x, kind === 'gull' ? 22 : 14, z);
      } else {
        const col = kind === 'dog' ? 0x8b5a2b : kind === 'deer' ? 0xa67c52 : kind === 'gator' ? 0x2e7d32 : 0xc0392b;
        mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 1.5),
          new THREE.MeshLambertMaterial({ color: col }));
        body.position.y = 0.6; mesh.add(body);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.6),
          new THREE.MeshLambertMaterial({ color: col }));
        head.position.set(0, 0.9, 0.9); mesh.add(head);
        mesh.position.set(x, 0, z);
      }
      this.scene.add(mesh);
      this.list.push({ kind, mesh, x, z, heading: range(this.rng, 0, 6.28),
        phase: this.rng() * 6.28, zone, studied: false });
    }
  }
  nearest(x, z, maxD) {
    let best = null, bd = maxD;
    for (const a of this.list) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  update(dt, t) {
    for (const a of this.list) {
      if (a.kind === 'gull' || a.kind === 'pelican' || a.kind === 'heron') {
        a.phase += dt * 0.25;
        a.x += Math.cos(a.phase) * 6 * dt;
        a.z += Math.sin(a.phase) * 6 * dt;
        a.mesh.position.set(a.x, 14 + Math.sin(t + a.phase) * 3, a.z);
        a.mesh.rotation.y = -a.phase;
      } else {
        a.heading += (this.rng() - 0.5) * dt * 0.6;
        a.x += Math.sin(a.heading) * 1.4 * dt;
        a.z += Math.cos(a.heading) * 1.4 * dt;
        a.x = clamp(a.x, -450, 450); a.z = clamp(a.z, -450, 450);
        a.mesh.position.set(a.x, 0, a.z);
        a.mesh.rotation.y = a.heading;
      }
    }
  }
}
