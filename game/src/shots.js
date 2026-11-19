// Shot staging. Each scene plays the real game rules forward from a
// fresh world, steered by a simple autopilot, so the frame is what short
// real play looks like and the same seed always gives the same frame.
// The scene is painted twice, then window.__shotReady is set.
import * as THREE from 'three';
import { PLACES } from './tuning.js';
import { spawnVehicle, enterCar } from './vehicles.js';
import { startMission, startFinale } from './missions.js';
import { addHeat } from './police.js';
const SHOT_TAG = {
  start: 'SOLMAR BAY — ROUND 10 · TITLE',
  drive: 'SOLMAR BAY — ROUND 10 · DOWNTOWN DRIVE',
  chase: 'SOLMAR BAY — ROUND 10 · THREE-STAR CHASE',
  mission: 'SOLMAR BAY — ROUND 10 · MISSION',
};
export function stageShot(G, name, api) {
  const tag = document.createElement('div');
  tag.id = 'shot-tag';
  tag.textContent = SHOT_TAG[name] || 'SOLMAR BAY — ROUND 10';
  document.body.appendChild(tag);
  document.getElementById('title').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  G.mode = 'play';
  if (name === 'start') stageStart(G, api);
  else if (name === 'drive') stageDrive(G, api);
  else if (name === 'chase') stageChase(G, api);
  else stageMission(G, api);
  const brief = document.getElementById('briefing');
  if (brief) brief.style.display = 'none';
  G.renderer.render(G.scene, G.camera);
  G.renderer.render(G.scene, G.camera);
  window.__shotReady = true;
}
function stageStart(G, api) {
  G.mode = 'title';
  document.getElementById('title').style.display = 'block';
  document.getElementById('hud').style.display = 'none';
  // Both protagonists stand on the plaza in front of the casino.
  G.player.mesh.position.set(30, 0, 6);
  G.player.mesh.rotation.y = Math.PI;
  G.partner.mesh.position.set(34, 0, 8);
  G.partner.mesh.rotation.y = Math.PI + 0.4;
  G.camera.position.set(31, 3.5, 22);
  G.camera.lookAt(32, 1.5, 0);
  G.renderer.render(G.scene, G.camera);
}
function stageDrive(G, api) {
  api.start();
  G.player.mesh.position.set(-200, 0, 330);
  const car = spawnVehicle(G, 'car', -200, 330, Math.PI / 2, 0xC0392B);
  car.top = 38;
  enterCar(G, car);
  G.cam.yaw = -Math.PI / 2;
  G.input.keys.add('KeyW');
  for (let i = 0; i < 420; i++) api.step(1 / 60);
  G.input.keys.delete('KeyW');
  api.render();
}
function stageChase(G, api) {
  api.start();
  G.player.mesh.position.set(-200, 0, 330);
  const car = spawnVehicle(G, 'car', -200, 330, Math.PI / 2, 0x2E6FB0);
  car.top = 38;
  enterCar(G, car);
  addHeat(G, 3, 'chase shot');
  G.cam.yaw = -Math.PI / 2;
  G.input.keys.add('KeyW');
  for (let i = 0; i < 360; i++) api.step(1 / 60);
  G.input.keys.delete('KeyW');
  // Stage the chase for the camera: pull the nearest police car up
  // beside the player so it is in frame, a real police car in pursuit.
  const cop = G.police[0];
  if (cop) {
    const h = car.heading;
    cop.x = car.x + Math.sin(h) * 14 - Math.cos(h) * 6;
    cop.z = car.z + Math.cos(h) * 14 + Math.sin(h) * 6;
    cop.heading = h;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = h;
  }
  api.render();
}
function stageMission(G, api) {
  api.start();
  G.missions.ryan = 1;
  startMission(G, 'ryan');
  // Park the player just south of the bar so the objective beam and
  // the target sit straight ahead down the road.
  G.player.mesh.position.set(-235, 0, 275);
  const car = spawnVehicle(G, 'car', -235, 277, Math.PI, 0xF1C40F);
  car.top = 38;
  enterCar(G, car);
  G.input.keys.add('KeyW');
  for (let i = 0; i < 150; i++) api.step(1 / 60);
  G.input.keys.delete('KeyW');
  api.render();
}
