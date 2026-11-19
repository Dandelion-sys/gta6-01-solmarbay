// The phone: map, camera, BayRide, radio, social, car scanner, transport
// timetables and contacts. Opens with P. Everything on it is playable.
export function createPhone(G) {
  G.phone = { open: false, app: 'home', likes: 0, followers: 12, photos: [] };
  const panel = document.createElement('div');
  panel.id = 'phone';
  panel.style.display = 'none';
  document.getElementById('hud').appendChild(panel);
  G.phoneEl = panel;
  renderPhone(G);
}
const APPS = ['Map', 'Camera', 'BayRide', 'Radio', 'Social', 'Scanner', 'Travel', 'Contacts'];
export function togglePhone(G) {
  G.phone.open = !G.phone.open;
  G.phoneEl.style.display = G.phone.open ? 'block' : 'none';
  if (G.phone.open) renderPhone(G);
  return G.phone.open;
}
export function renderPhone(G) {
  const el = G.phoneEl;
  const app = G.phone.app;
  if (app !== 'home' && app !== 'Map') { phoneApps(G); return; }
  let body = '';
  if (app === 'home') {
    body = '<div class="phone-apps">' + APPS.map((a) => `<button data-app="${a}">${a}</button>`).join('') + '</div>';
  } else if (app === 'Map') {
    body = '<h3>Solmar Bay Map</h3><p>Tap a district to fast-travel by bus ($15).</p>' + Object.keys(PLACES).slice(0, 8).map((k) => `<button data-place="${k}">${PLACES[k].name}</button>`).join('');
  }
  el.innerHTML = `<div class="phone-top">Solmar Phone — ${app}</div>${body}<button data-app="home">‹ Home</button>`;
  el.querySelectorAll('[data-app]').forEach((b) => {
    b.addEventListener('click', () => { G.phone.app = b.dataset.app; renderPhone(G); });
  });
  el.querySelectorAll('[data-place]').forEach((b) => {
    b.addEventListener('click', () => { travelTo(G, b.dataset.place); renderPhone(G); });
  });
}
import { PLACES, dist2 } from './tuning.js';
export function phoneApps(G) {
  const app = G.phone.app;
  const el = G.phoneEl;
  if (app === 'Camera') {
    el.innerHTML = `<div class="phone-top">Camera</div><p>Point at an animal and tap Snap. Logged animals fill the field guide.</p><button id="snap">Snap photo</button><p>Logged: ${Object.keys(G.systems.wildlife.log).length} species</p><button data-app="home">‹ Home</button>`;
    el.querySelector('#snap').addEventListener('click', () => snapPhoto(G));
  } else if (app === 'BayRide') {
    el.innerHTML = `<div class="phone-top">BayRide</div><p>A car comes to you. Fare $18.</p><button id="ride">Call a BayRide</button><button data-app="home">‹ Home</button>`;
    el.querySelector('#ride').addEventListener('click', () => callRide(G));
  } else if (app === 'Radio') {
    el.innerHTML = `<div class="phone-top">Radio</div><p>Station: ${['Bay FM', 'Quay Talk', 'Tide Podcasts'][G.radioStation]}</p><button id="next">Next station</button><button data-app="home">‹ Home</button>`;
    el.querySelector('#next').addEventListener('click', () => { G.radioStation = (G.radioStation + 1) % 3; G.radioOn = true; renderPhone(G); });
  } else if (app === 'Social') {
    el.innerHTML = `<div class="phone-top">SnapBay</div><p>Followers: ${G.systems.social.followers} · Likes: ${G.systems.social.likes}</p><button id="post">Post a photo</button><button data-app="home">‹ Home</button>`;
    el.querySelector('#post').addEventListener('click', () => postPhoto(G));
  } else if (app === 'Scanner') {
    const near = G.vehicles.filter((v) => dist2(v.x, v.z, G.player.mesh.position.x, G.player.mesh.position.z) < 60);
    let list = near.map((v) => `<p>${v.kind === 'boat' ? 'Boat' : 'Car'} — worth $${v.value}</p>`).join('');
    if (!list) list = '<p>No cars nearby.</p>';
    el.innerHTML = `<div class="phone-top">Car Scanner</div>${list}<button data-app="home">‹ Home</button>`;
  } else if (app === 'Travel') {
    el.innerHTML = `<div class="phone-top">Travel</div><p>Bus $15 · Ferry to Tern Isle $10, runs on the hour.</p><button id="ferry">Take the ferry</button><button data-app="home">‹ Home</button>`;
    el.querySelector('#ferry').addEventListener('click', () => {
      if (G.money < 10) { G.hud.toast('Ferry fare is $10.'); return; }
      G.money -= 10;
      G.player.mesh.position.set(0, 0, 455);
      G.hud.toast('Ferry dropped you on Tern Isle.');
      renderPhone(G);
    });
  } else if (app === 'Contacts') {
    el.innerHTML = `<div class="phone-top">Contacts</div><p>Vera — fixer at The Brass Anchor</p><p>Partner — ${G.activeChar === 'ryan' ? 'Ian' : 'Ryan'}</p><button id="call-vera">Call Vera</button><button id="swap">Switch character</button><button data-app="home">‹ Home</button>`;
    el.querySelector('#call-vera').addEventListener('click', () => {
      G.hud.toast('Vera: work is at the bar. Come see me in person.');
    });
    el.querySelector('#swap').addEventListener('click', () => {
      G.switchChar();
      renderPhone(G);
    });
  }
  el.querySelectorAll('[data-app]').forEach((b) => {
    b.addEventListener('click', () => { G.phone.app = b.dataset.app; renderPhone(G); });
  });
}
export function snapPhoto(G) {
  const px = G.player.mesh.position.x, pz = G.player.mesh.position.z;
  let best = null, bestD = 40;
  for (const a of G.animals) {
    const d = Math.hypot(a.x - px, a.z - pz);
    if (d < bestD) { bestD = d; best = a; }
  }
  if (best) {
    const first = !G.systems.wildlife.log[best.kind];
    G.systems.wildlife.log[best.kind] = (G.systems.wildlife.log[best.kind] || 0) + 1;
    G.phone.photos.push(best.kind);
    G.hud.toast(first ? `New in field guide: ${best.kind}!` : `Photographed a ${best.kind}.`);
    G.sound.chime();
  } else {
    G.hud.toast('Nothing wild in frame. Get closer to an animal.');
  }
  renderPhone(G);
}
export function callRide(G) {
  if (G.money < 18) { G.hud.toast('BayRide costs $18.'); return { ok: false, why: 'Need $18.' }; }
  G.money -= 18;
  const v = G.spawnVehicle('taxi', G.player.mesh.position.x + 30, G.player.mesh.position.z + 10, Math.PI, 0xF1C40F);
  v.route = null; v.parked = false;
  G.systems.transport.rides++;
  G.hud.toast('BayRide is on its way. Hop in with F.');
  renderPhone(G);
  return { ok: true };
}
export function postPhoto(G) {
  const gain = 3 + Math.floor(Math.random() * 9);
  G.systems.social.followers += gain;
  G.systems.social.likes += 5 + Math.floor(Math.random() * 20);
  G.phone.likes = G.systems.social.likes;
  G.hud.toast(`Posted! +${gain} followers on SnapBay.`);
  G.sound.chime();
  renderPhone(G);
}
export function travelTo(G, placeKey) {
  const p = PLACES[placeKey];
  if (!p) return false;
  if (G.money < 15) { G.hud.toast('Bus fare is $15.'); return false; }
  G.money -= 15;
  G.player.mesh.position.set(p.x + 4, 0, p.z + 4);
  if (G.player.vehicle) { exitCar(G); }
  G.systems.transport.rides++;
  G.hud.toast(`Bus dropped you at ${p.name}.`);
  return true;
}
