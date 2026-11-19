// The HUD: money, health, armour, wanted stars, clock, objective,
// active character, a context line for the E key, and a minimap canvas.
// All DOM, drawn over the 3D view.
import { PLACES } from './tuning.js';
export function buildHud(G) {
  const root = document.getElementById('hud');
  root.innerHTML = '';
  const el = (tag, id, cls) => {
    const e = document.createElement(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    root.appendChild(e);
    return e;
  };
  G.hudEls = {
    money: el('div', 'hud-money'),
    health: el('div', 'hud-health'),
    stars: el('div', 'hud-stars'),
    clock: el('div', 'hud-clock'),
    objective: el('div', 'hud-objective'),
    context: el('div', 'hud-context'),
    charBadge: el('div', 'hud-char'),
    focus: el('div', 'hud-focus'),
    toast: el('div', 'hud-toast'),
    radio: el('div', 'hud-radio'),
  };
  const mapWrap = document.createElement('div');
  mapWrap.id = 'minimap-wrap';
  const canvas = document.createElement('canvas');
  canvas.id = 'minimap'; canvas.width = 180; canvas.height = 180;
  mapWrap.appendChild(canvas);
  root.appendChild(mapWrap);
  G.minimap = canvas.getContext('2d');
  const brief = document.createElement('div');
  brief.id = 'briefing'; brief.style.display = 'none';
  root.appendChild(brief);
  G.briefEl = brief;
}
export function updateHud(G) {
  const e = G.hudEls;
  const p = G.player;
  e.money.textContent = `$${Math.floor(G.money).toLocaleString('en-US')}`;
  e.health.textContent = `♥ ${Math.round(p.health)}  ⛨ ${Math.round(p.armour)}`;
  e.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(6 - G.wanted);
  e.stars.style.color = G.wanted >= 4 ? '#ff4444' : '#ffd94d';
  const h = Math.floor(G.time.minutes / 60), m = Math.floor(G.time.minutes % 60);
  e.clock.textContent = `Day ${G.time.day}  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}  ${G.weather}`;
  const mAct = G.missions.active;
  e.objective.textContent = mAct
    ? `${mAct.def.name}: ${mAct.target.label}${mAct.timer > 0 ? '  ⏱ ' + Math.ceil(mAct.timer) + 's' : ''}`
    : (G.missions.ryan >= 6 && G.missions.ian >= 6 ? 'Talk to Vera — the vault heist is ready' : 'Talk to Vera at The Brass Anchor for work');
  e.charBadge.textContent = G.activeChar === 'ryan' ? 'RYAN' : 'IAN';
  e.focus.textContent = `Focus ${Math.round(G.focus)}%  •  Rep ${Math.round(G.reputation)}  •  Bond ${Math.round(G.bond)}`;
  e.radio.textContent = G.radioOn ? `♪ ${['Bay FM', 'Quay Talk', 'Tide Podcasts'][G.radioStation]}` : '';
  drawMinimap(G);
}
function drawMinimap(G) {
  const c = G.minimap;
  if (!c) return;
  const S = 180, scale = S / 760;
  c.clearRect(0, 0, S, S);
  c.fillStyle = '#12333f';
  c.fillRect(0, 0, S, S);
  c.fillStyle = '#3f7d5a';
  c.fillRect(0, 0, S, S);
  c.fillStyle = '#2c2f33';
  for (const x of [-300, -180, -60, 60, 180, 300]) c.fillRect((x + 380) * scale, 0, 3, S);
  for (const z of [-280, -160, -40, 80, 200, 300]) c.fillRect(0, (z + 380) * scale, S, 3);
  c.fillStyle = '#e8d9a0';
  c.fillRect(0, (330 + 380) * scale, S, 4);
  const dot = (x, z, color, r) => {
    c.fillStyle = color;
    c.beginPath(); c.arc((x + 380) * scale, (z + 380) * scale, r || 3, 0, 7); c.fill();
  };
  for (const k of ['bar', 'casino', 'dealer', 'mart', 'safehouse']) {
    const p = PLACES[k]; dot(p.x, p.z, '#f1c40f', 2.5);
  }
  const m = G.missions.active;
  if (m) dot(m.target.x, m.target.z, '#ff4444', 5);
  for (const v of G.police) dot(v.x, v.z, '#4488ff', 3);
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  dot(px, pz, '#ffffff', 4);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc((px + 380) * scale, (pz + 380) * scale, 7, 0, 7);
  c.stroke();
}
export function hudToast(G, msg) {
  const e = G.hudEls.toast;
  e.textContent = msg;
  e.style.opacity = '1';
  clearTimeout(G.toastTimer);
  G.toastTimer = setTimeout(() => { e.style.opacity = '0'; }, 3500);
}
export function showBriefing(G, title, text) {
  const b = G.briefEl;
  b.innerHTML = `<h2>${title}</h2><p>${text}</p><button id="brief-ok">OK</button>`;
  b.style.display = 'block';
  const ok = document.getElementById('brief-ok');
  if (ok) ok.addEventListener('click', () => { b.style.display = 'none'; });
  clearTimeout(G.briefTimer);
  G.briefTimer = setTimeout(() => { b.style.display = 'none'; }, 9000);
}
export function setContext(G, text) {
  if (G.hudEls) G.hudEls.context.textContent = text;
}
