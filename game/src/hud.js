// Solmar Bay HUD: money, health, armour, wanted stars, clock, objective,
// context line, minimap, toasts, hit flash, title screen, pause menu and
// the full map. The touch controls never cover the HUD or the minimap.
import { DISTRICTS } from './tuning.js';

export class HUD {
  constructor(app) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.el.className = 'hidden';
    this.el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;font-family:"Trebuchet MS",Verdana,sans-serif;';
    this.el.innerHTML = `
    <div id="hud-top-left" style="position:absolute;left:14px;top:12px;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,0.8);">
      <div id="hud-money" style="font-size:26px;font-weight:bold;color:#7dff9a;">$850</div>
      <div id="hud-hero" style="font-size:14px;">Ryan</div>
      <div id="hud-bars" style="margin-top:6px;width:180px;">
        <div style="background:rgba(0,0,0,0.5);border-radius:6px;height:12px;overflow:hidden;"><div id="hud-health" style="height:100%;width:100%;background:#2ed573;"></div></div>
        <div style="background:rgba(0,0,0,0.5);border-radius:6px;height:8px;overflow:hidden;margin-top:3px;"><div id="hud-armour" style="height:100%;width:0%;background:#7fb3d5;"></div></div>
      </div>
      <div id="hud-stars" style="font-size:20px;letter-spacing:2px;color:#ffd23f;margin-top:4px;"></div>
      <div id="hud-clock" style="font-size:14px;">10:12 · Clear skies</div>
    </div>
    <canvas id="minimap" width="170" height="170" style="position:absolute;right:14px;top:12px;border:2px solid rgba(255,255,255,0.7);border-radius:12px;background:rgba(10,30,45,0.85);"></canvas>
    <div id="hud-objective" style="position:absolute;left:14px;bottom:14px;max-width:46vw;color:#fff;background:rgba(0,0,0,0.55);padding:8px 12px;border-radius:10px;font-size:14px;line-height:1.4;"></div>
    <div id="hud-context" style="position:absolute;left:50%;transform:translateX(-50%);bottom:14px;color:#ffe9a8;background:rgba(0,0,0,0.55);padding:8px 14px;border-radius:10px;font-size:15px;font-weight:bold;"></div>
    <div id="hud-toast" style="position:absolute;left:50%;transform:translateX(-50%);top:16%;color:#fff;background:rgba(20,60,90,0.9);padding:10px 18px;border-radius:12px;font-size:16px;display:none;"></div>
    <div id="hud-speed" style="position:absolute;right:14px;bottom:14px;color:#fff;font-size:22px;font-weight:bold;text-shadow:0 2px 4px rgba(0,0,0,0.8);"></div>
    <div id="hit-flash" style="position:fixed;inset:0;background:radial-gradient(ellipse at center, transparent 40%, rgba(220,30,30,0.55) 100%);display:none;pointer-events:none;"></div>`;
    document.body.appendChild(this.el);
    this.mapEl = document.createElement('div');
    this.mapEl.id = 'bigmap';
    this.mapEl.className = 'hidden';
    this.mapEl.style.cssText = 'position:fixed;inset:0;background:rgba(5,15,25,0.92);z-index:55;color:#fff;display:flex;flex-direction:column;align-items:center;padding:20px;';
    this.mapEl.innerHTML = `<div style="font-size:24px;font-weight:bold;margin-bottom:8px;">Solmar Bay</div><canvas id="bigmap-canvas" width="640" height="640" style="max-width:92vw;max-height:78vh;border:2px solid #7fb3d5;border-radius:12px;"></canvas><div style="margin-top:10px;font-size:14px;">M = close · Yellow = mission · Blue = you · Red = police</div>`;
    document.body.appendChild(this.mapEl);
    this.toastTimer = 0;
  }
  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  toast(msg, secs) {
    const t = this.el.querySelector('#hud-toast');
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.style.display = 'none'; }, (secs || 3.5) * 1000);
  }
  flashHit() {
    const f = this.el.querySelector('#hit-flash');
    f.style.display = 'block';
    setTimeout(() => { f.style.display = 'none'; }, 450);
  }
  setContext(text) {
    const c = this.el.querySelector('#hud-context');
    c.textContent = text || '';
    c.style.display = text ? 'block' : 'none';
  }

  update(g) {
    const hero = g.couple.active;
    this.el.querySelector('#hud-money').textContent = '$' + g.couple.wallet.toLocaleString('en-US');
    this.el.querySelector('#hud-hero').textContent = `${hero.def.name} · ${hero.outfit} · Bond ${g.couple.bond}`;
    this.el.querySelector('#hud-health').style.width = Math.max(0, hero.health) + '%';
    this.el.querySelector('#hud-health').style.background = hero.health > 50 ? '#2ed573' : hero.health > 25 ? '#f2c14e' : '#d93a2b';
    this.el.querySelector('#hud-armour').style.width = Math.max(0, hero.armour) + '%';
    const stars = '★'.repeat(g.police.wanted) + '☆'.repeat(6 - g.police.wanted);
    this.el.querySelector('#hud-stars').textContent = g.police.wanted > 0 ? stars : '';
    this.el.querySelector('#hud-clock').textContent = `${g.sky.clockString()} · ${g.sky.weatherLabel()} · ${g.districtName}`;
    let obj = g.missions.active
      ? `★ ${g.missions.active.def.name} — ${g.missions.active.def.brief}${g.missions.active.timer > 0 ? ' · ' + Math.ceil(g.missions.active.timer) + 's' : ''}`
      : (g.missions.nextFor(hero.id) ? `Next: ${g.missions.nextFor(hero.id).name} — open the phone (P) to start.` : g.missions.finaleReady() ? 'FINALE READY — open the phone to rob the Marina Royale vault.' : 'All missions complete. Free roam Solmar Bay.');
    if (g.missions.finaleDone) obj = '🏆 The vault is yours. Legends of Solmar Bay.';
    this.el.querySelector('#hud-objective').textContent = obj + '  ·  ' + g.missions.progressText();
    const speedEl = this.el.querySelector('#hud-speed');
    speedEl.textContent = g.driving ? Math.round(Math.abs(g.drivenCar.speed) * 3.6) + ' km/h' : '';
    this._drawMinimap(g, this.el.querySelector('#minimap'));
  }
  _drawMapOn(canvas, g, big) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const toXY = (x, z) => [((x + 460) / 920) * W, ((z + 460) / 920) * H];
    ctx.fillStyle = '#12344a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a7fa8';
    ctx.beginPath(); ctx.arc(W * 0.97, H * 0.97, W * 0.1, 0, Math.PI * 2); ctx.fill();
    // Roads.
    ctx.strokeStyle = '#5a636e'; ctx.lineWidth = big ? 5 : 3;
    for (let i = -3; i <= 3; i++) {
      const [x1, y1] = toXY(i * 120, -430); const [x2, y2] = toXY(i * 120, 430);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toXY(-430, i * 120); const [x4, y4] = toXY(430, i * 120);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Districts.
    ctx.font = (big ? 13 : 9) + 'px sans-serif'; ctx.fillStyle = '#9fc8e8';
    for (const d of DISTRICTS) {
      const [x, y] = toXY(d.cx, d.cz);
      ctx.fillText(d.name, x - 22, y);
    }
    // Mission marker.
    if (g.missions.active) {
      const [x, y] = toXY(g.missions.active.def.x, g.missions.active.def.z);
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, big ? 9 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x, y, big ? 15 : 10, 0, Math.PI * 2); ctx.stroke();
    }
    // Police.
    ctx.fillStyle = '#ff4040';
    for (const c of g.police.cars) {
      const [x, y] = toXY(c.x, c.z);
      ctx.beginPath(); ctx.arc(x, y, big ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player.
    const hero = g.couple.active;
    const [px, py] = toXY(hero.x, hero.z);
    ctx.fillStyle = '#2ed573';
    ctx.beginPath(); ctx.arc(px, py, big ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, big ? 11 : 7, 0, Math.PI * 2); ctx.stroke();
  }
  _drawMinimap(g, canvas) { this._drawMapOn(canvas, g, false); }
  drawBigMap(g) { this._drawMapOn(this.mapEl.querySelector('#bigmap-canvas'), g, true); }
  showMap() { this.mapEl.classList.remove('hidden'); }
  hideMap() { this.mapEl.classList.add('hidden'); }
  mapOpen() { return !this.mapEl.classList.contains('hidden'); }
}
