// The two protagonists. Ryan is a man in his late thirties, a former
// advertising man rebuilding his life with hustle and charm. Ian is a
// woman in her late thirties, sharp, funny and fearless, his partner in
// life and in crime. They share one wallet, one wanted level and one home.
import * as THREE from 'three';
import { clamp } from './tuning.js';
import { collideCircle, keepOnIsland } from './world.js';
export const CHAR_DEFS = {
  ryan: { name: 'Ryan', sex: 'male', shirt: 0x2E6FB0, pants: 0x2A2E35, skin: 0xC98E6B, hair: 0x3A2A1A, height: 1.85, style: 'charm' },
  ian: { name: 'Ian', sex: 'female', shirt: 0xC0392B, pants: 0x1F2A44, skin: 0xE0AC82, hair: 0x1A1210, height: 1.72, style: 'nerve' },
};
export function makePersonMesh(def, outfit) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: def.skin });
  const shirt = new THREE.MeshLambertMaterial({ color: outfit === 'fancy' ? 0xF5F0E1 : def.shirt });
  const pants = new THREE.MeshLambertMaterial({ color: def.pants });
  const hair = new THREE.MeshLambertMaterial({ color: def.hair });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirt);
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.72; g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, 1.4), hair);
  hairM.position.y = 1.76; g.add(hairM);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.22), pants);
  legL.position.set(-0.15, 0.4, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.18), shirt);
  armL.position.set(-0.38, 1.15, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.38; g.add(armR);
  g.userData = { legL, legR, armL, armR, torso, head };
  return g;
}
export function createCharacters(G) {
  G.chars = {
    ryan: { def: CHAR_DEFS.ryan, strength: 50, stamina: 50, build: 0 },
    ian: { def: CHAR_DEFS.ian, strength: 45, stamina: 55, build: 0 },
  };
  G.player = {
    mesh: makePersonMesh(CHAR_DEFS.ryan, 'street'),
    heading: 0, speed: 0, onFoot: true, vehicle: null,
    health: 100, armour: 0, outfit: 'street',
    strength: 50, stamina: 50, build: 0, walkPhase: 0,
  };
  G.player.mesh.position.set(-20, 0, 130);
  G.scene.add(G.player.mesh);
  // Ian waits at the safehouse until the player switches.
  G.partner = {
    mesh: makePersonMesh(CHAR_DEFS.ian, 'street'),
    heading: 2.4, atHome: true,
  };
  G.partner.mesh.position.set(-24, 0, 124);
  G.scene.add(G.partner.mesh);
}
export function switchCharacter(G) {
  const from = G.activeChar;
  G.activeChar = from === 'ryan' ? 'ian' : 'ryan';
  const def = CHAR_DEFS[G.activeChar];
  const old = G.player.mesh;
  G.scene.remove(old);
  G.player.mesh = makePersonMesh(def, G.player.outfit);
  G.player.mesh.position.copy(old.position);
  G.player.mesh.rotation.y = G.player.heading;
  G.scene.add(G.player.mesh);
  const stats = G.chars[G.activeChar];
  G.player.strength = stats.strength; G.player.stamina = stats.stamina;
  G.player.build = stats.build;
  return G.activeChar;
}
export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  const input = G.input;
  const run = input.down('ShiftLeft') || input.down('ShiftRight');
  const speed = run ? TUNING_RUN(p) : 6;
  let mx = 0, mz = 0;
  if (input.down('KeyW')) mz -= 1;
  if (input.down('KeyS')) mz += 1;
  if (input.down('KeyA')) mx -= 1;
  if (input.down('KeyD')) mx += 1;
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    const camYaw = G.cam.yaw;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx;
    const dx = (fx * mz + rx * mx) / len;
    const dz = (fz * mz + rz * mx) / len;
    p.heading = Math.atan2(dx, dz);
    p.mesh.rotation.y = p.heading;
    p.mesh.position.x += dx * speed * dt;
    p.mesh.position.z += dz * speed * dt;
    p.walkPhase += dt * speed * 1.6;
    const u = p.mesh.userData;
    u.legL.rotation.x = Math.sin(p.walkPhase) * 0.6;
    u.legR.rotation.x = -Math.sin(p.walkPhase) * 0.6;
    u.armL.rotation.x = -Math.sin(p.walkPhase) * 0.5;
    u.armR.rotation.x = Math.sin(p.walkPhase) * 0.5;
    if (Math.random() < dt * speed * 0.25) G.sound.step();
    p.speed = speed;
    p.stamina = clamp(p.stamina - (run ? dt * 1.5 : 0), 0, 100);
  } else {
    p.speed = 0;
    const u = p.mesh.userData;
    u.legL.rotation.x *= 0.8; u.legR.rotation.x *= 0.8;
    u.armL.rotation.x *= 0.8; u.armR.rotation.x *= 0.8;
  }
  collideCircle(G, p.mesh.position, 0.7);
  keepOnIsland(G, p.mesh.position);
}
function TUNING_RUN(p) { return 11 * (0.8 + p.stamina / 250); }
