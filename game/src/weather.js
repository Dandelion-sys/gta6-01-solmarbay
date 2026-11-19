// Weather and storms over the bay: fronts, wind, surge, shelter.
export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm'];
export class Weather {
  constructor() {
    this.kind = 'clear'; this.timer = 120; this.wind = 2;
    this.surge = 0; this.debris = []; this.frontX = -300;
    this.announced = false;
  }
  roll() {
    const r = Math.random();
    this.kind = r < 0.55 ? 'clear' : r < 0.75 ? 'cloudy' : r < 0.9 ? 'rain' : 'storm';
    this.timer = 90 + Math.random() * 120;
    this.wind = this.kind === 'storm' ? 26 : this.kind === 'rain' ? 10 : this.kind === 'cloudy' ? 5 : 2;
    this.surge = this.kind === 'storm' ? 1.4 : this.kind === 'rain' ? 0.4 : 0;
    this.announced = false;
    return this.kind;
  }
  update(dt, game) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const k = this.roll();
      if (k === 'storm') game.toast('Storm front crossing the bay — high wind, flying debris. Take shelter!');
      else if (k === 'rain') game.toast('Rain rolling in off the bay.');
      else if (k === 'clear') game.toast('The sky clears over Solmar Bay.');
    }
    if (this.kind === 'storm') {
      this.frontX += dt * this.wind;
      if (this.frontX > 350) this.frontX = -350;
      // Wind pushes the player a little and bends the palms.
      const p = game.player;
      if (!p.inCar) { p.x += dt * 0.6; }
      for (const palm of game.world.palms) palm.rotation.z = Math.sin(performance.now() * 0.004 + palm.position.x) * 0.18;
    }
    return this.kind;
  }
  shelterAdvice() {
    if (this.kind === 'storm') return 'Seek shelter: the bar, the shops, or your safehouse.';
    if (this.kind === 'rain') return 'Rain — driving is slicker, pedestrians hurry home.';
    return 'Clear skies over the bay.';
  }
  isBad() { return this.kind === 'rain' || this.kind === 'storm'; }
}
export function windChill(kind, hour) {
  const base = kind === 'storm' ? 12 : kind === 'rain' ? 18 : 26;
  const night = hour < 6 || hour > 19 ? -5 : 0;
  return base + night;
}
