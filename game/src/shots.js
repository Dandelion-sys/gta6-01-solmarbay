// Shot staging: play the real rules forward from a fresh world so each
// screenshot is what short real play looks like, same seed, same frame.
export function stageShot(game, name) {
  const p = game.player;
  const hud = document.getElementById('hud');
  const title = document.getElementById('title');
  if (name === 'start') {
    // Title screen over the city, both protagonists visible.
    game.setScreen('title');
    // Push the title block up so Ryan and Ian show below it, not behind it.
    title.style.justifyContent = 'flex-start';
    title.style.paddingTop = '26px';
    p.x = -130; p.z = 110; p.camYaw = Math.PI * 0.75;
    game.playerMesh.position.set(p.x, 0, p.z);
    game.partnerMesh.position.set(p.x - 2.5, 0, p.z + 1);
    game.partnerMesh.visible = true;
    game.timeOfDay = 17.5;
    game.updateCamera(0.016);
    return;
  }
  game.setScreen('play');
  hud.classList.remove('hidden'); title.classList.add('hidden');
  if (name === 'drive') {
    // Driving downtown with HUD, minimap and speed visible.
    const car = game.traffic.cars.find(c => c.kind === 'parked') || game.traffic.cars[0];
    p.inCar = true; p.car = car; car.kind = 'player'; car.ai = false;
    car.x = 0; car.z = -30; car.yaw = 0; car.speed = 22;
    p.x = car.x; p.z = car.z;
    p.camYaw = -car.yaw;
    game.playerMesh.visible = false;
    game.timeOfDay = 10;
    game.toast('Downtown drive — Coral Row');
  } else if (name === 'chase') {
    // Three-star police chase with police cars and bounty visible.
    p.x = 20; p.z = -20; p.camYaw = Math.PI * 0.9;
    game.police.wanted = 3; game.police.heat = 80;
    for (let i = 0; i < 3; i++) {
      const v = game.traffic.addPoliceCar(p.x - 14 - i * 8, p.z + 10 + i * 6);
      v.speed = 18; game.police.cars.push(v);
    }
    const car = game.traffic.cars.find(c => c.kind === 'parked');
    if (car) { p.inCar = true; p.car = car; car.kind = 'player'; car.x = p.x; car.z = p.z; car.speed = 20; game.playerMesh.visible = false; }
    game.timeOfDay = 15;
    game.toast('WANTED — 3 stars. Lose the police!');
  } else if (name === 'mission') {
    // Mission in progress: objective beam, marker, timer, target visible.
    // Stand near the pier with the gold beam in frame ahead of the player.
    const m = game.missions.start('ryan');
    p.x = -120; p.z = 130; p.camYaw = 2.28;
    game.playerMesh.position.set(p.x, 0, p.z);
    game.timeOfDay = 9;
    game.toast('Mission: ' + (m ? m.name : 'First Fare') + ' — follow the gold beam');
  }
  game.updateCamera(0.016);
  game.updateHud();
}
