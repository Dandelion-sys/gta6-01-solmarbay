// HUD, minimap and screens: money, health, stars, clock, objective,
// context line, and the title / pause / game-over overlays.
import { fmtMoney, fmtClock, fmtTimer, clamp } from './rng.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this.el = {
      money: document.getElementById('hud-money'),
      health: document.getElementById('hud-health'),
      armour: document.getElementById('hud-armour'),
      stars: document.getElementById('hud-stars'),
      clock: document.getElementById('hud-clock'),
      objective: document.getElementById('hud-objective'),
      hero: document.getElementById('hud-hero'),
      bounty: document.getElementById('hud-bounty'),
      context: document.getElementById('hud-context'),
      toast: document.getElementById('hud-toast'),
      district: document.getElementById('hud-district'),
      speed: document.getElementById('hud-speed'),
      focus: document.getElementById('hud-focus'),
      rep: document.getElementById('hud-rep'),
    };
    this.mapCanvas = document.getElementById('minimap');
    this.mapCtx = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
    this.toastTimer = 0;
  }
  toast(text, seconds) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.style.display = 'block';
    this.toastTimer = seconds || 3;
  }
  update(dt) {
    const g = this.game;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.el.toast) this.el.toast.style.display = 'none';
    }
    if (this.el.money) this.el.money.textContent = fmtMoney(g.economy.money);
    const h = g.hero;
    if (this.el.health) {
      this.el.health.textContent = '♥ ' + Math.round(h.health);
      this.el.health.style.color = h.health < 30 ? '#ff5555' : '#ffffff';
    }
    if (this.el.armour) this.el.armour.textContent = '⛨ ' + Math.round(h.armour);
    if (this.el.stars) {
      this.el.stars.textContent = '★'.repeat(g.police.wanted) + '☆'.repeat(6 - g.police.wanted);
      this.el.stars.style.color = g.police.wanted > 0 ? '#ffcc00' : '#888888';
    }
    if (this.el.clock) this.el.clock.textContent = fmtClock(g.city.hour) + '  ' + g.city.weather;
    if (this.el.hero) this.el.hero.textContent = h.name + ' — ' + g.heroes.repLabel() + ' — Bond ' + Math.round(g.heroes.bond);
    if (this.el.bounty) this.el.bounty.textContent = g.police.bounty > 0 ? 'Bounty ' + fmtMoney(g.police.bounty) : '';
    if (this.el.rep) this.el.rep.textContent = 'Rep ' + Math.round(g.heroes.reputation);
    if (this.el.focus) this.el.focus.textContent = 'Focus ' + Math.round(g.heroes.focus) + '%';
    if (this.el.speed) {
      this.el.speed.textContent = g.inCar ? Math.round(Math.abs(g.car.speed) * 2.2) + ' mph' : '';
    }
    const step = g.missions.currentStep();
    if (this.el.objective) {
      let text = '';
      if (g.missions.active) {
        text = g.missions.active.name + ': ' + (step ? step.label : '');
        if (g.missions.timeLeft > 0) text += '  ⏱ ' + fmtTimer(g.missions.timeLeft);
      } else if (g.economy.job) {
        text = 'Job: ' + (g.economy.jobTarget ? g.economy.jobTarget.label : g.economy.job.kind);
      } else if (g.missions.finaleReady() && !g.missions.finaleDone) {
        text = 'Finale ready: rob the Marina Royale vault with Vera!';
      } else {
        const next = g.missions.nextFor(g.heroes.active);
        text = next ? 'Next job: see Vera at The Brass Anchor — ' + next.name : 'Free roam — earn, explore, have fun.';
      }
      this.el.objective.textContent = text;
    }
    if (this.el.district) {
      const d = g.city.districtAt(g.hero.x, g.hero.z);
      this.el.district.textContent = d ? d.name : 'Solmar Bay';
    }
    if (this.el.context) this.el.context.textContent = g.contextLine || '';
    this.drawMinimap();
  }
  drawMinimap() {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 150, half = 460;
    const toMap = (x, z) => [(x + half) / (half * 2) * S, (z + half) / (half * 2) * S];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10, 40, 60, 0.85)';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2f9e44';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a3f46'; ctx.lineWidth = 3;
    for (const x of [-340, -220, -110, 0, 110, 220, 340]) {
      const [mx] = toMap(x, 0);
      ctx.beginPath(); ctx.moveTo(mx, 4); ctx.lineTo(mx, S - 4); ctx.stroke();
    }
    for (const z of [-340, -220, -110, 0, 110, 220, 340]) {
      const [, mz] = toMap(0, z);
      ctx.beginPath(); ctx.moveTo(4, mz); ctx.lineTo(S - 4, mz); ctx.stroke();
    }
    ctx.fillStyle = '#1e90c8';
    ctx.beginPath(); ctx.arc(...toMap(-120, 560), 10, 0, Math.PI * 2); ctx.fill();
    const g = this.game;
    for (const p of g.cityPlaces || []) {
      const [px, pz] = toMap(p.x, p.z);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(px - 2, pz - 2, 4, 4);
    }
    const step = g.missions.currentStep();
    const target = step || (g.economy.jobTarget);
    if (target) {
      const [tx, tz] = toMap(target.x, target.z);
      ctx.fillStyle = '#ff3355';
      ctx.beginPath(); ctx.arc(tx, tz, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(tx, tz, 8, 0, Math.PI * 2); ctx.stroke();
    }
    for (const c of g.police.cars) {
      const [cx, cz] = toMap(c.x, c.z);
      ctx.fillStyle = '#2266ff';
      ctx.beginPath(); ctx.arc(cx, cz, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    const [hx, hz] = toMap(g.hero.x, g.hero.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(hx, hz, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3355';
    ctx.beginPath(); ctx.arc(hx, hz, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
  }
  showScreen(name) {
    for (const id of ['screen-title', 'screen-pause', 'screen-over', 'screen-map']) {
      const el = document.getElementById(id);
      if (el) el.style.display = id === 'screen-' + name ? 'flex' : 'none';
    }
  }
}
