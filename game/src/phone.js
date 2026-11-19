// The phone: contacts, map, BayRide, SnapShot social, car scanner,
// wildlife camera, radio and settings — all as a DOM overlay.
export class Phone {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.app = 'home';
    this.followers = 128;
    this.likes = 0;
    this.posts = [];
    this.photosTaken = 0;
    this.el = document.getElementById('phone');
    this.screen = document.getElementById('phone-screen');
    this.buildHome();
  }
  buildHome() {
    if (!this.screen) return;
    this.screen.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'phone-title';
    title.textContent = 'Solmar Phone';
    this.screen.appendChild(title);
    const apps = [
      ['map', 'Map'], ['contacts', 'Contacts'], ['bayride', 'BayRide'],
      ['snapshot', 'SnapShot'], ['scanner', 'Scanner'], ['camera', 'Camera'],
      ['radio', 'Radio'], ['jobs', 'Jobs'], ['settings', 'Settings'],
    ];
    const grid = document.createElement('div');
    grid.className = 'phone-grid';
    for (const [id, label] of apps) {
      const b = document.createElement('button');
      b.className = 'phone-app';
      b.textContent = label;
      b.addEventListener('click', () => this.openApp(id));
      grid.appendChild(b);
    }
    this.screen.appendChild(grid);
    const back = document.createElement('button');
    back.className = 'phone-app phone-back';
    back.textContent = 'Close (P)';
    back.addEventListener('click', () => this.close());
    this.screen.appendChild(back);
  }
  setOpen(open) {
    this.open = open;
    if (this.el) this.el.style.display = open ? 'block' : 'none';
    if (open) this.buildHome();
  }
  close() { this.setOpen(false); }
  openApp(id) {
    this.app = id;
    const g = this.game;
    const s = this.screen;
    if (!s) return;
    s.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'phone-title';
    s.appendChild(head);
    const body = document.createElement('div');
    body.className = 'phone-body';
    s.appendChild(body);
    const back = document.createElement('button');
    back.className = 'phone-app phone-back';
    back.textContent = 'Back';
    back.addEventListener('click', () => this.buildHome());
    s.appendChild(back);
    const line = (t) => { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); return p; };
    const btn = (label, fn) => {
      const b = document.createElement('button');
      b.className = 'phone-app'; b.textContent = label;
      b.addEventListener('click', fn); body.appendChild(b); return b;
    };
    if (id === 'map') {
      head.textContent = 'Map — Solmar Bay';
      line('Districts: Palm Quay, Coral Row, Sunset Fields, Gull Point, Mangrove Flats, North Docks, Tern Isle.');
      line('Press M for the big map.');
    } else if (id === 'contacts') {
      head.textContent = 'Contacts';
      line('Vera — The Brass Anchor fixer. She has the story jobs.');
      line('Ryan / Ian — your partner. Switch with C.');
      btn('Call Vera — next job', () => { g.startNextMission(); this.close(); });
      btn('Switch character', () => { g.switchHero(); this.close(); });
    } else if (id === 'bayride') {
      head.textContent = 'BayRide';
      line('A ride-share car comes to you. Fare $25.');
      btn('Call a BayRide car', () => {
        if (g.economy.spend(25)) { g.spawnRideCar(); line('Car on its way!'); }
        else line('Not enough money.');
      });
      line('Bus: Coral Row ↔ Palm Quay every 20 min. Ferry: Palm Quay ↔ Tern Isle hourly.');
    } else if (id === 'snapshot') {
      head.textContent = 'SnapShot';
      line('Followers: ' + this.followers + ' — Likes: ' + this.likes);
      btn('Post a photo', () => {
        this.photosTaken++;
        const gained = 3 + Math.floor(Math.random() * 18);
        this.followers += gained; this.likes += gained * 2;
        this.posts.push('Photo ' + this.photosTaken);
        g.economy.earn(15, 'SnapShot post');
        line('Posted! +' + gained + ' followers, +$15 sponsor tip.');
      });
      for (const p of this.posts.slice(-4)) line('• ' + p);
    } else if (id === 'scanner') {
      head.textContent = 'Car Scanner';
      const near = g.traffic ? g.traffic.nearestParked(g.hero.x, g.hero.z, 60) : null;
      if (near) line('Nearby car value: $' + (1800 + Math.floor(Math.random() * 9000)) + ' — worth a look.');
      else line('No valuable cars nearby. Try the dealer district.');
      btn('Scan again', () => this.openApp('scanner'));
    } else if (id === 'camera') {
      head.textContent = 'Wildlife Camera';
      const near = g.animals ? g.animals.nearest(g.hero.x, g.hero.z, 40) : null;
      if (near) {
        line('Subject: ' + near.kind + ' — ' + (near.studied ? 'already logged' : 'new!'));
        btn('Log this animal', () => {
          if (!near.studied) {
            near.studied = true;
            const info = g.logAnimal(near.kind);
            line('Logged: ' + info.name + ' +' + info.points + ' pts, +$' + info.points * 2);
          } else line('Already in your field guide.');
        });
      } else line('No animal in frame. Try the swamp, the fields or the beach.');
      line('Field guide: ' + g.fieldGuide.size + ' of 9 species logged.');
    } else if (id === 'radio') {
      head.textContent = 'Radio';
      for (const st of g.radioStations) {
        btn(st.name + ' — ' + st.desc, () => { g.setRadio(st.id); line('Now playing ' + st.name); });
      }
      btn('Radio off', () => { g.setRadio(null); });
    } else if (id === 'jobs') {
      head.textContent = 'Side Jobs';
      btn('Taxi shift — $120', () => { g.economy.startTaxi(); this.close(); });
      btn('Delivery run — $160', () => { g.economy.startDelivery(); this.close(); });
      btn('Go fishing', () => { g.economy.startFishing(); this.close(); });
      btn('Busk on the plaza', () => { g.economy.startBusking(); this.close(); });
    } else if (id === 'settings') {
      head.textContent = 'Settings';
      line('Sound: ' + (g.sound.muted ? 'muted' : 'on'));
      btn(g.sound.muted ? 'Unmute' : 'Mute', () => { g.toggleMute(); this.openApp('settings'); });
      btn('Save game', () => { g.saveGame(); line('Saved.'); });
      line('Switch character: C — Pause: Esc');
    }
  }
}
