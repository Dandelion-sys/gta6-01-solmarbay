// Phone apps, HUD, minimap, save/load, and shot staging.
import { finaleBreakdown } from './missions.js';
export function phoneHtml(game) {
  const e = game.economy;
  return `<h3>Solmar Phone — ${game.activeChar === 'ryan' ? 'Ryan' : 'Ian'}</h3>
  <div class="app" data-app="contacts">Contacts — Vera (fixer), switch to ${game.activeChar === 'ryan' ? 'Ian' : 'Ryan'}</div>
  <div class="app" data-app="bayride">BayRide — call a car ($35)</div>
  <div class="app" data-app="camera">Camera — study wildlife (${e.photos} logged)</div>
  <div class="app" data-app="social">SnapBay — ${e.followers} followers</div>
  <div class="app" data-app="scanner">Car Scanner — values nearby cars</div>
  <div class="app" data-app="jobs">Jobs — taxi, delivery, fishing, tours</div>
  <div class="app" data-app="radio">Radio — ${e.radioNames[e.radioStation]}</div>
  <div class="app" data-app="finale">Finale payout — ${finaleBreakdown()}</div>
  <div class="app" data-app="close">Close phone (P)</div>`;
}
export function drawMinimap(canvas, game) {
  const ctx = canvas.getContext('2d'); const S = canvas.width;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#12324a'; ctx.fillRect(0, 0, S, S);
  const toMap = (x, z) => [S / 2 + x / 520 * S, S / 2 + z / 520 * S];
  ctx.strokeStyle = '#5a6a78'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.fillStyle = '#1e7fa8';
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.stroke();
  // sea ring
  ctx.strokeStyle = '#1e7fa8'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2); ctx.stroke();
  for (const s of game.world.shops) {
    const [mx, my] = toMap(s.x, s.z);
    ctx.fillStyle = s.kind === 'safehouse' ? '#ffd23e' : '#9fe8ff';
    ctx.fillRect(mx - 2, my - 2, 4, 4);
  }
  if (game.missions.active) {
    const [mx, my] = toMap(game.missions.active.target.x, game.missions.active.target.z);
    ctx.fillStyle = '#ffd23e'; ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill();
  }
  for (const c of game.police.cars) {
    const [mx, my] = toMap(c.x, c.z);
    ctx.fillStyle = '#ff3333'; ctx.fillRect(mx - 3, my - 3, 6, 6);
  }
  const [px, py] = toMap(game.player.x, game.player.z);
  ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
}
export function drawBigMap(canvas, game) {
  const ctx = canvas.getContext('2d'); const S = canvas.width;
  ctx.fillStyle = '#12324a'; ctx.fillRect(0, 0, S, S);
  const toMap = (x, z) => [S / 2 + x / 520 * S, S / 2 + z / 520 * S];
  ctx.fillStyle = '#e8d9a0'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.44, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6fae4e'; ctx.beginPath(); ctx.arc(S / 2, S / 2, S * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.stroke();
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#fff';
  for (const d of game.world.districts || []) {}
  const names = [['Palm Quay', -140, 130], ['Coral Row', 0, 0], ['Sunset Fields', 150, 120], ['Gull Point', 170, -150], ['Mangrove Flats', -160, -140], ['North Docks', -40, -190], ['Tern Isle', -260, -40]];
  for (const [n, x, z] of names) { const [mx, my] = toMap(x, z); ctx.fillText(n, mx - 30, my); }
  for (const s of game.world.shops) { const [mx, my] = toMap(s.x, s.z); ctx.fillStyle = '#ffd23e'; ctx.fillRect(mx - 3, my - 3, 6, 6); ctx.fillStyle = '#fff'; ctx.fillText(s.name, mx + 6, my + 4); }
  const [px, py] = toMap(game.player.x, game.player.z);
  ctx.fillStyle = '#7dff9a'; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();
}
