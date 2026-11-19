// Solmar Bay phone: missions, map, ride-share, camera field guide,
// radio, stats and character switch — all working in the game.
import { SIDE_JOBS, STRANGERS, BOUNTIES, TREASURES, CHALLENGES } from './economy.js';
import { RADIO_STATIONS } from './sound.js';

export class Phone {
  constructor(app) {
    this.app = app;
    this.open = false;
    this.screen = 'home';
    this.el = null;
    this.fieldGuide = []; // studied animals
    this.photos = 0;
    this.followers = 12;
    this._build();
  }
  _build() {
    const el = document.createElement('div');
    el.id = 'phone';
    el.className = 'hidden';
    el.style.cssText = 'position:fixed;right:18px;top:50%;transform:translateY(-50%);width:300px;max-width:88vw;height:520px;max-height:86vh;background:#101820;border:3px solid #3a4a5a;border-radius:26px;color:#e8f0f5;z-index:60;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.6);';
    el.innerHTML = `<div style="padding:12px 14px;background:#1c2a38;font-weight:bold;display:flex;justify-content:space-between;"><span>Solmar Phone</span><button id="phone-close" style="background:#d93a2b;color:#fff;border:none;border-radius:8px;padding:2px 10px;cursor:pointer;">X</button></div><div id="phone-body" style="flex:1;overflow:auto;padding:12px;font-size:14px;line-height:1.5;"></div>`;
    document.body.appendChild(el);
    this.el = el;
    this.body = el.querySelector('#phone-body');
    el.querySelector('#phone-close').addEventListener('click', () => this.close());
  }
  toggle() { this.open ? this.close() : this.openPhone(); }
  openPhone() {
    this.open = true; this.screen = 'home';
    this.el.classList.remove('hidden');
    this.render();
    this.app.sound.click();
  }
  close() { this.open = false; this.el.classList.add('hidden'); }
  render() {
    const a = this.app, g = a.game;
    const btn = (label, fn) => `<button data-fn="${fn}" style="display:block;width:100%;margin:6px 0;padding:10px;background:#24405a;color:#fff;border:none;border-radius:10px;cursor:pointer;text-align:left;">${label}</button>`;
    if (this.screen === 'home') {
      this.body.innerHTML = `<b>${g.couple.active.def.name} — $${g.couple.wallet}</b><br><span style="opacity:.8">Bond ${g.couple.bond} · Rep ${g.couple.reputation} · ${a.sky.clockString()} · ${a.sky.weatherLabel()}</span><br><br>`
        + btn('📋 Missions', 'missions') + btn('🗺️ Map', 'map') + btn('🚕 BayRide — call a cab ($25)', 'taxi')
        + btn('📷 Camera — study wildlife', 'camera') + btn('📻 Radio', 'radio')
        + btn('📊 Stats & challenges', 'stats') + btn('🔄 Switch to ' + (g.couple.active.id === 'ryan' ? 'Ian' : 'Ryan'), 'switch')
        + btn('💾 Save game', 'save');
    } else if (this.screen === 'missions') {
      const m = g.missions;
      this.body.innerHTML = `<b>Missions</b><br>${m.progressText()}<br><br>` +
        (m.active ? `<b>Active:</b> ${m.active.def.name}<br>${m.active.def.brief}<br>Timer: ${m.active.timer > 0 ? Math.ceil(m.active.timer) + 's' : '—'}`
          : (m.nextFor(g.couple.active.id) ? `<b>Next:</b> ${m.nextFor(g.couple.active.id).name}<br>${m.nextFor(g.couple.active.id).brief}<br><br><button data-fn="start-mission" style="padding:10px;background:#2ed573;color:#062;border:none;border-radius:10px;cursor:pointer;">Start mission</button>`
            : m.finaleReady() ? '<b>FINALE READY:</b> The Marina Royale Vault.<br><button data-fn="start-finale" style="padding:10px;background:#f2c14e;border:none;border-radius:10px;cursor:pointer;">Start the finale</button>'
              : 'All missions done.')) + '<br><br>' + btn('← Back', 'home');
    } else if (this.screen === 'camera') {
      this.body.innerHTML = `<b>Field Guide</b><br>Studied: ${this.fieldGuide.length} / 4 kinds<br>Photos: ${this.photos} · Followers: ${this.followers}<br><br>` +
        this.fieldGuide.map((f) => `✓ ${f}<br>`).join('') +
        `<br><button data-fn="snap" style="padding:10px;background:#2b6fd9;color:#fff;border:none;border-radius:10px;cursor:pointer;">Take a photo now</button><br><br>` + btn('← Back', 'home');
    } else if (this.screen === 'radio') {
      this.body.innerHTML = `<b>Radio</b><br>` + RADIO_STATIONS.map((s, i) =>
        `<button data-fn="radio-${i}" style="display:block;width:100%;margin:6px 0;padding:10px;background:${a.sound.radioStation === i && a.sound.radioOn ? '#2ed573' : '#24405a'};color:#fff;border:none;border-radius:10px;cursor:pointer;">${s}</button>`).join('') + btn('⏹ Stop radio', 'radio-off') + btn('← Back', 'home');
    } else if (this.screen === 'stats') {
      const h = g.couple.active;
      this.body.innerHTML = `<b>Stats — ${h.def.name}</b><br>Health ${Math.round(h.health)} · Armour ${Math.round(h.armour)}<br>Strength ${h.strength} · Stamina ${Math.round(h.stamina)} · Focus ${Math.round(h.focus)}<br>Outfit: ${h.outfit}<br><br><b>Challenges</b><br>` +
        CHALLENGES.map((c) => `${c.cat}: bronze $${c.bronze} · silver $${c.silver} · gold $${c.gold}<br>`).join('') +
        `<br><b>Bounties</b><br>` + BOUNTIES.map((b) => `${b.name} — $${b.pay} ($${b.alive} alive) · ${b.place}<br>`).join('') +
        `<br><b>Treasure clues</b><br>` + TREASURES.map((t) => `“${t.clue}” — $${t.pay}<br>`).join('') + '<br>' + btn('← Back', 'home');
    }
    this.body.querySelectorAll('[data-fn]').forEach((b) => {
      b.addEventListener('click', () => this._action(b.dataset.fn));
    });
  }

  _action(fn) {
    const a = this.app, g = a.game;
    if (fn === 'home') { this.screen = 'home'; this.render(); return; }
    if (fn === 'missions') { this.screen = 'missions'; this.render(); return; }
    if (fn === 'camera') { this.screen = 'camera'; this.render(); return; }
    if (fn === 'radio') { this.screen = 'radio'; this.render(); return; }
    if (fn === 'stats') { this.screen = 'stats'; this.render(); return; }
    if (fn === 'map') { this.close(); a.toggleMap(true); return; }
    if (fn === 'taxi') {
      if (g.couple.spend(25)) {
        a.spawnTaxiPickup();
        a.hud.toast('BayRide cab is on its way — $25.');
      } else a.hud.toast('Need $25 for a cab.');
      return;
    }
    if (fn === 'snap') {
      const near = a.crowd.nearestAnimal(g.couple.active.x, g.couple.active.z, 30);
      this.photos++;
      if (near && !this.fieldGuide.includes(near.kind)) {
        this.fieldGuide.push(near.kind);
        g.couple.addMoney(150);
        a.hud.toast(`New field guide entry: ${near.kind}! +$150.`);
        a.sound.cash();
      } else {
        this.followers += 3;
        a.hud.toast('Photo posted. +3 followers.');
      }
      this.render(); return;
    }
    if (fn === 'start-mission') {
      const next = g.missions.nextFor(g.couple.active.id);
      if (next) { g.startMission(next); this.close(); }
      return;
    }
    if (fn === 'start-finale') { g.startFinale(); this.close(); return; }
    if (fn === 'switch') { g.switchHero(); this.render(); return; }
    if (fn === 'save') { a.saveGame(); a.hud.toast('Game saved.'); this.render(); return; }
    if (fn === 'radio-off') { a.sound.radioOn = false; this.render(); return; }
    if (fn.startsWith('radio-')) {
      a.sound.radioStation = Number(fn.slice(6));
      a.sound.radioOn = true; a.sound.ensure();
      this.render(); return;
    }
  }
}
