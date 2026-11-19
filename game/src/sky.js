// Sea, sky, sun and weather. The bay is a big animated plane; the sky
// changes colour through the day and night cycle; rain and storm fronts
// roll in and out on their own timetable.
import * as THREE from 'three';
import { clamp, lerp } from './tuning.js';
export function buildSky(G) {
  const scene = G.scene;
  G.sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400, 24, 24),
    new THREE.MeshLambertMaterial({ color: 0x1E7FA8 }));
  G.sea.rotation.x = -Math.PI / 2;
  G.sea.position.y = -0.6;
  scene.add(G.sea);
  G.seaBase = G.sea.geometry.attributes.position.array.slice();
  G.sun = new THREE.DirectionalLight(0xFFF2CC, 1.4);
  G.sun.position.set(200, 300, 100);
  scene.add(G.sun);
  G.ambient = new THREE.AmbientLight(0xBFD9E8, 0.7);
  scene.add(G.ambient);
  scene.background = new THREE.Color(0x87CEEB);
  scene.fog = new THREE.Fog(0x9FC9DD, 350, 1100);
  // A few drifting clouds made of flat white blobs.
  G.clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(14 + j * 5, 8, 6),
        new THREE.MeshLambertMaterial({ color: 0xFFFFFF }));
      b.position.set(j * 14 - 14, j * 2, 0);
      b.scale.y = 0.45; c.add(b);
    }
    c.position.set(-400 + i * 90, 150 + (i % 3) * 20, -350 + (i % 4) * 180);
    scene.add(c); G.clouds.push(c);
  }
}
export function updateSky(G, dt) {
  const mins = G.time.minutes;
  const dayFrac = mins / 1440;
  const sunAngle = (dayFrac - 0.25) * Math.PI * 2;
  const sunH = Math.sin(sunAngle);
  G.sun.position.set(Math.cos(sunAngle) * 300, Math.max(20, sunH * 300), 120);
  const isDay = sunH > 0.05;
  const dusk = clamp(1 - Math.abs(sunH) * 4, 0, 1);
  const skyDay = new THREE.Color(0x87CEEB);
  const skyNight = new THREE.Color(0x0B1E33);
  const skyDusk = new THREE.Color(0xE8915A);
  const sky = skyDay.clone().lerp(skyNight, isDay ? 0 : 0.9);
  if (dusk > 0.2 && sunH > -0.2) sky.lerp(skyDusk, dusk * 0.6);
  G.scene.background = sky;
  G.scene.fog.color.copy(sky);
  G.sun.intensity = isDay ? 1.4 : 0.15;
  G.ambient.intensity = isDay ? 0.7 : 0.3;
  // Sea waves: a gentle sine ripple on the plane's vertices.
  const pos = G.sea.geometry.attributes.position;
  const t = G.time.wave || 0;
  for (let i = 0; i < pos.count; i++) {
    const x = G.seaBase[i * 3], y = G.seaBase[i * 3 + 1];
    pos.setZ(i, Math.sin(x * 0.05 + t) * 0.5 + Math.cos(y * 0.06 + t * 1.3) * 0.4);
  }
  pos.needsUpdate = true;
  G.time.wave = t + dt * 1.2;
  for (const c of G.clouds) {
    c.position.x += dt * 2;
    if (c.position.x > 500) c.position.x = -500;
  }
}
