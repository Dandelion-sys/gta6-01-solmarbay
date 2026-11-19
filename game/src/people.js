// Pedestrians and animals who make the city feel alive.
import * as THREE from 'three';
const PED_NAMES = ['Mara', 'Tomas', 'Priya', 'Otto', 'Sana', 'Kofi', 'Luz', 'Bram', 'Nia', 'Ezra', 'Wren', 'Dario'];
const PED_COLORS = [0xd95f4b, 0x4b7fd9, 0xe8b93e, 0x3f8f3a, 0x8e44ad, 0xe87aa8, 0x2a9d8f, 0xc98a3a];
function personMesh(color, scale) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * scale, 0.4 * scale, 1.1 * scale, 8), mat);
  body.position.y = 0.9 * scale; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8b88a }));
  head.position.y = 1.75 * scale; g.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.5 * scale, 0.16 * scale), legMat);
    leg.position.set(0.14 * s * scale, 0.25 * scale, 0); g.add(leg);
  }
  return g;
}
export class People {
  constructor(scene) {
    this.scene = scene; this.peds = []; this.animals = [];
    for (let i = 0; i < 26; i++) this.spawnPed();
    this.spawnAnimals();
  }
  spawnPed() {
    const x = -200 + Math.random() * 400; const z = -200 + Math.random() * 400;
    const mesh = personMesh(PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)], 1);
    mesh.position.set(x, 0, z); this.scene.add(mesh);
    this.peds.push({ mesh, x, z, yaw: Math.random() * Math.PI * 2, speed: 1 + Math.random() * 1.4, name: PED_NAMES[Math.floor(Math.random() * PED_NAMES.length)], flee: 0, state: 'walk' });
  }
  spawnAnimals() {
    const kinds = [
      { kind: 'gull', color: 0xffffff, n: 8, area: [-180, 180, 120, 220] },
      { kind: 'dog', color: 0x8a6f4d, n: 5, area: [90, 200, 80, 180] },
      { kind: 'deer', color: 0xa8763e, n: 4, area: [90, 200, 60, 160] },
      { kind: 'gator', color: 0x3a5a2a, n: 4, area: [-210, -120, -170, -100] },
      { kind: 'pelican', color: 0xf2f2f2, n: 4, area: [-220, -120, 120, 200] },
    ];
    for (const k of kinds) for (let i = 0; i < k.n; i++) {
      const x = k.area[0] + Math.random() * (k.area[1] - k.area[0]);
      const z = k.area[2] + Math.random() * (k.area[3] - k.area[2]);
      const mesh = personMesh(k.color, k.kind === 'gull' || k.kind === 'pelican' ? 0.6 : 0.9);
      mesh.position.set(x, k.kind === 'gull' || k.kind === 'pelican' ? 6 + Math.random() * 8 : 0, z);
      this.scene.add(mesh);
      this.animals.push({ mesh, x, z, kind: k.kind, yaw: Math.random() * 6.28, studied: false });
    }
  }
  update(dt, player, wanted) {
    for (const p of this.peds) {
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (wanted > 0 && d < 25) p.flee = 3;
      if (p.flee > 0) {
        p.flee -= dt;
        const a = Math.atan2(p.x - player.x, p.z - player.z);
        p.x += Math.sin(a) * 4 * dt; p.z += Math.cos(a) * 4 * dt; p.yaw = a;
      } else {
        if (Math.random() < dt * 0.2) p.yaw += (Math.random() - 0.5) * 1.4;
        p.x += Math.sin(p.yaw) * p.speed * dt; p.z += Math.cos(p.yaw) * p.speed * dt;
        if (Math.abs(p.x) > 230) p.yaw += Math.PI;
        if (Math.abs(p.z) > 230) p.yaw += Math.PI;
      }
      p.mesh.position.set(p.x, 0, p.z); p.mesh.rotation.y = p.yaw;
      p.mesh.position.y = Math.abs(Math.sin(performance.now() * 0.006 + p.x)) * 0.05;
    }
    for (const a of this.animals) {
      if (a.kind === 'gull' || a.kind === 'pelican') {
        a.x += Math.sin(a.yaw) * 3 * dt; a.z += Math.cos(a.yaw) * 3 * dt;
        if (Math.random() < dt * 0.1) a.yaw += (Math.random() - 0.5);
        a.mesh.position.set(a.x, 6 + Math.sin(performance.now() * 0.001 + a.x) * 1.5, a.z);
      } else if (a.kind === 'gator') {
        a.x += Math.sin(a.yaw) * 0.5 * dt; a.z += Math.cos(a.yaw) * 0.5 * dt;
        a.mesh.position.set(a.x, 0, a.z);
      } else {
        if (Math.random() < dt * 0.3) a.yaw += (Math.random() - 0.5) * 2;
        a.x += Math.sin(a.yaw) * 1.6 * dt; a.z += Math.cos(a.yaw) * 1.6 * dt;
        a.mesh.position.set(a.x, 0, a.z); a.mesh.rotation.y = a.yaw;
      }
    }
  }
  nearestPed(x, z, maxD) {
    let best = null; let bd = maxD;
    for (const p of this.peds) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  nearestAnimal(x, z, maxD) {
    let best = null; let bd = maxD;
    for (const a of this.animals) { const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } }
    return best;
  }
}
