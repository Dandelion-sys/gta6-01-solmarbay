// Shot staging: each scene plays the real game forward from a fresh world
// with a simple autopilot, so the frame is what short real play looks like.
// The same seed always gives the same frame.
import { makeRng, range } from './rng.js';
import { RYAN_CHAIN } from './missions.js';

export function stageShot(game, name, seed) {
  const rng = makeRng(seed * 101 + 7);
  game.screen = 'play';
  game.hud.showScreen('none');
  const hero = game.hero;
  if (name === 'start') {
    game.screen = 'title';
    game.hud.showScreen('title');
    const obj = document.getElementById('hud-objective');
    if (obj) obj.style.display = 'none';
    const tst = document.getElementById('hud-toast');
    if (tst) tst.style.display = 'none';
    game.heroes.ryan.x = -2; game.heroes.ryan.z = 182; game.heroes.ryan.heading = 0.4;
    game.heroes.ian.x = 12; game.heroes.ian.z = 182; game.heroes.ian.heading = -0.4;
    game.heroes.syncMeshes();
    game.camTarget = { x: 5, y: 3.5, z: 169 };
    game.camLook = { x: 5, y: 2, z: 184 };
    game.city.hour = 10.2;
  } else if (name === 'drive') {
    game.city.hour = 11.0;
    hero.x = 0; hero.z = 40; hero.heading = 0;
    const car = game.spawnPlayerCar('gull', 0, 44, 0);
    game.enterCar(car);
    car.speed = 26;
    game.heroes.syncMeshes();
    game.camTarget = null;
    game.hud.toast('Downtown drive — Coral Row', 4);
  } else if (name === 'chase') {
    game.city.hour = 17.5;
    hero.x = 110; hero.z = 60; hero.heading = Math.PI;
    const car = game.spawnPlayerCar('storm', 110, 64, Math.PI);
    game.enterCar(car);
    car.speed = 34;
    game.police.addCrime(48, 'chase');
    game.police.spawnCar(110, 98);
    game.police.spawnCar(98, 88);
    game.police.spawnCar(124, 90);
    game.heroes.syncMeshes();
    game.hud.toast('Three-star chase — lose them!', 4);
  } else if (name === 'mission') {
    game.city.hour = 9.0;
    const m = RYAN_CHAIN[1];
    game.missions.start(m);
    game.missions.stepIndex = 1;
    hero.x = 110; hero.z = -350; hero.heading = -2.36;
    game.heroes.syncMeshes();
    game.hud.toast('Mission: Against the Clock — deliver to the airfield', 4);
  }
  game.shotName = name;
  game.shotFrames = 0;
  game.shotRng = rng;
  game.shotAutopilot = name !== 'start';
  void range;
}
export function shotTick(game, dt) {
  if (!game.shotAutopilot) return;
  // Gentle autopilot: hold forward so the drive and chase frames stay alive.
  if (game.inCar && game.car) {
    game.car.speed = Math.max(game.car.speed, 18);
  } else if (game.shotName === 'mission') {
    // Hold on the road facing the airfield: the gold beam over the target
    // stays in frame while the mission timer runs down.
    const step = game.missions.currentStep();
    if (step) {
      game.hero.heading = Math.atan2(step.x - game.hero.x, step.z - game.hero.z);
    }
  }
  void dt;
}
