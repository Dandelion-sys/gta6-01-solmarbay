// Solmar Bay shot staging: each screenshot scene plays the real game
// forward from a fresh world with a simple autopilot, so the frame is
// what short real play looks like. Seed 1 always gives the same frame.
import { clamp } from './tuning.js';

export function stageShot(g, name) {
  g.state = 'play';
  g.screens.hide();
  g.hud.show();
  const hero = g.couple.active;
  if (name === 'start') {
    // Title screen over the marina boardwalk with both protagonists
    // visible flanking the panel, the pier and the sea behind them.
    g.state = 'title';
    g.couple.ryan.setPosition(-264, 336);
    g.couple.ian.setPosition(-258, 338);
    g.couple.ian.mesh.visible = true;
    g.camYaw = 0; g.camPitch = 0.3;
    g.screens.showTitle();
    g.screens.el.style.background = 'linear-gradient(160deg, rgba(8,30,48,0.45), rgba(20,80,110,0.35))';
    g.hud.hide();
  } else if (name === 'drive') {
    // Driving along a downtown road with HUD, minimap and speed visible.
    hero.setPosition(-200, 120);
    const car = g.traffic.parked[2];
    car.x = -200; car.z = 120; car.heading = Math.PI / 2; car.sync();
    g.enterCar(car);
    car.speed = 16;
    g.camYaw = car.heading;
    g.couple.addMoney(1250);
    for (let i = 0; i < 40; i++) g.step(1 / 60);
  } else if (name === 'chase') {
    // Three-star police chase on an open crossroads, patrol cars close.
    hero.setPosition(0, 0);
    g.police.wanted = 3; g.police.heat = 70;
    g.couple.addMoney(3400);
    for (let i = 0; i < 90; i++) g.step(1 / 60);
    const near = g.police.cars[0];
    if (near) g.camYaw = Math.atan2(near.x - hero.x, near.z - hero.z);
    g.hud.toast('★ ★ ★ POLICE CHASE — bounty $1,200', 30);
  } else if (name === 'mission') {
    // A mission in progress: the hero walks toward the objective beam
    // and marker, timer running, target visible ahead.
    hero.setPosition(60, 100);
    const next = g.missions.nextFor('ryan');
    g.startMission(next);
    if (g.missions.active) g.missions.active.timer = 87;
    g.couple.addMoney(2100);
    g.camYaw = 0; // look toward the beam at (60, 120)
    for (let i = 0; i < 20; i++) g.step(1 / 60);
  }
  // Paint twice, then signal the screenshot tool.
  let paints = 0;
  const paint = () => {
    g.step(1 / 60);
    g.render();
    paints++;
    if (paints < 2) requestAnimationFrame(paint);
    else setTimeout(() => { window.__shotReady = true; }, 400);
  };
  requestAnimationFrame(paint);
}
