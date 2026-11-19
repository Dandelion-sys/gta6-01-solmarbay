// Boats, planes and the ferry: water and air vehicles of Solmar Bay.
import * as THREE from 'three';
function hullMat(color) { return new THREE.MeshLambertMaterial({ color }); }
export class Boat {
  constructor(scene, x, z, yaw, kind) {
    this.kind = kind || 'speedboat';
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0;
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 9), hullMat(kind === 'ferry' ? 0x2b6fd6 : 0xffffff));
    hull.position.y = 0.6; g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 4), hullMat(0x8a6f4d));
    deck.position.set(0, 1.4, -1); g.add(deck);
    if (kind === 'ferry') {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 5), hullMat(0xf2e6c9));
      cabin.position.set(0, 2.4, 0); g.add(cabin);
    } else {
      const motor = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMat(0x222222));
      motor.position.set(0, 1, 4.6); g.add(motor);
    }
    this.mesh = g; this.mesh.position.set(x, 0, z); this.mesh.rotation.y = yaw;
    scene.add(g);
  }
  drive(dt, throttle, steer) {
    this.speed += throttle * 18 * dt;
    if (throttle === 0) this.speed *= Math.pow(0.5, dt);
    this.speed = Math.max(-6, Math.min(30, this.speed));
    this.yaw += steer * 1.4 * dt * (this.speed >= 0 ? 1 : -1);
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += -Math.cos(this.yaw) * this.speed * dt;
    this.mesh.position.set(this.x, Math.sin(performance.now() * 0.002) * 0.2, this.z);
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.z = Math.sin(performance.now() * 0.001) * 0.04;
  }
}
export class Plane {
  constructor(scene, x, z, yaw, kind) {
    this.kind = kind || 'prop';
    this.x = x; this.z = z; this.yaw = yaw; this.speed = 0; this.alt = 0;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 10), hullMat(0xffffff));
    body.rotation.x = Math.PI / 2; g.add(body);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 2.2), hullMat(kind === 'jet' ? 0x8e44ad : 0x2b6fd6));
    g.add(wing);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 1.4), hullMat(0xffffff));
    tail.position.set(0, 0.4, 4); g.add(tail);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), hullMat(0x222222));
    prop.position.set(0, 0, -4.8); g.add(prop);
    g.userData.prop = prop;
    this.mesh = g; this.mesh.position.set(x, 2, z); this.mesh.rotation.y = yaw;
    scene.add(g);
  }
  fly(dt, throttle) {
    this.speed += throttle * 12 * dt;
    this.speed = Math.max(0, Math.min(this.kind === 'jet' ? 90 : 45, this.speed));
    if (this.speed > 12) this.alt += dt * 8;
    this.x += Math.sin(this.yaw) * this.speed * dt;
    this.z += -Math.cos(this.yaw) * this.speed * dt;
    this.mesh.position.set(this.x, 2 + this.alt, this.z);
    this.mesh.rotation.y = this.yaw;
    if (this.mesh.userData.prop) this.mesh.userData.prop.rotation.z += dt * this.speed;
  }
}
export class Ferry {
  constructor(scene) {
    this.boat = new Boat(scene, -180, 175, Math.PI / 2, 'ferry');
    this.route = [[-180, 175], [-260, -20]];
    this.leg = 0; this.timer = 45; this.docked = true;
  }
  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.docked = false;
    const target = this.route[this.leg];
    const dx = target[0] - this.boat.x; const dz = target[1] - this.boat.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) { this.leg = (this.leg + 1) % this.route.length; this.timer = 45; this.docked = true; return; }
    this.boat.yaw = Math.atan2(dx, -dz);
    this.boat.drive(dt, 0.5, 0);
  }
}
