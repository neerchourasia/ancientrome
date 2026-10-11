"use strict";
// Games of Old Delhi (press N in Delhi): a race down Chandni Chowk, defending the Red Fort's gate with a cannon,
// kushti wrestling, kite fights, a food run through the crowds, pachisi and bazaar trading. All single-player, all in
// the same spirit as the games in Rome. Depends on game.js, delhi.js, car.js and vitals.js at run time.

const DGames = (() => {
  const X = (x) => DELHI_X + x;
  const $d = (id) => document.getElementById(id);
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ordinal = (n) => ["", "1st", "2nd", "3rd", "4th", "5th"][n] || `${n}th`;

  let sc = null, game = null, runGame = null, hudT = 0;
  const effects = [];
  let puffTex = null;

  const GAMES = [
    { id: "race", where: "the start arch at the Fatehpuri Masjid end of Chandni Chowk", name: "Race down Chandni Chowk", text: "Rickshaws (Modern Delhi) or elephants (Mughal Delhi) race from the Fatehpuri Masjid to the Lahori Gate. Dodge the street traffic and use your boost. Win 60 denarii.", keys: "W go · S brake · A D change lane · 1-9 speed level · X cruise · Space boost" },
    { id: "defend", where: "the cannon on the rampart: climb the long ramp inside the west wall of the Red Fort", name: "Defend the Red Fort", text: "Raiders march down Chandni Chowk at the Lahori Gate. Aim the cannon on the gate and break up their ranks before they reach it. Three waves. Win 80 denarii.", keys: "W S farther or nearer · A D left or right · Space or click fire" },
    { id: "kushti", where: "the akhara on the open square in front of the Lahori Gate", name: "Kushti wrestling", text: "Pehlwani wrestling in a mud pit. Get to grips with your opponent, then fight for the throw by pressing Space as fast as you can. First to two throws wins 40 denarii.", keys: "WASD move · Space grip, then mash Space to throw" },
    { id: "kites", where: "the kite stall on the open square in front of the Lahori Gate", name: "Kite fights", text: "A tradition in Old Delhi: fly your kite, cross strings with the others and saw through theirs before they saw through yours. Cut all three kites for 60 denarii.", keys: "WASD fly the kite · hold Space to saw while the strings cross" },
    { id: "run", where: "the chaat stall on Chandni Chowk, near the Metro", name: "Chaat run", text: "Carry hot street food through the crowded lanes to three hungry customers. It cools as you go and spills when you bump into people. Earn up to 90 denarii.", keys: "walk as usual · Esc to give up" },
    { id: "pachisi", where: "the pavilion in the Red Fort courtyard", name: "Pachisi", text: "The Mughal court's board game of cowrie shells and racing pawns, against a rival. Win 25 denarii.", keys: "" },
    { id: "bazaar", where: "the bazaar stall beside the pool on Chandni Chowk", name: "Bazaar trader", text: "Buy goods where they are cheap and sell them where they are dear, over six market days across Old Delhi's bazaars. Keep the profit.", keys: "" },
  ];

  // ------------------------------------------------------------------ shared pieces

  function init(scene) { sc = scene; }

  function hud(title, info, keysText, bar) {
    $d("dg-title").textContent = title;
    $d("dg-info").textContent = info;
    if (keysText !== undefined) $d("dg-keys").textContent = keysText;
    if (bar !== undefined) { $d("dg-bar-row").hidden = bar === null; if (bar !== null) $d("dg-bar").style.width = `${clamp(bar, 0, 1) * 100}%`; }
  }

  function puff(x, y, z, size, life, color, grow = 6, opacity = 0.9) {
    if (!puffTex) puffTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const m = new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color, opacity });
    const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.set(size, size, 1); sc.add(s);
    effects.push({ s, life, max: life, grow, op: opacity });
  }
  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i]; e.life -= dt;
      if (e.life <= 0) { sc.remove(e.s); e.s.material.dispose(); effects.splice(i, 1); continue; }
      e.s.scale.x = e.s.scale.y += e.grow * dt; e.s.material.opacity = e.op * (e.life / e.max);
    }
  }

  function begin(g) { // a 3D game takes over the screen
    mode = "dgame";
    closePanels();
    Vitals.stopRest(); Nav.clear();
    game = g;
    $d("dg-hud").classList.add("show");
    Crowd.setVisible(false);
  }

  function leaveGame() {
    if (!game) return;
    if (game.cleanup) game.cleanup();
    for (const e of effects) { sc.remove(e.s); e.s.material.dispose(); }
    effects.length = 0;
    game = null;
    mode = "walk";
    $d("dg-hud").classList.remove("show");
    Crowd.setVisible(era !== "modern" && city === "rome");
    const f = $d("flash"); f.style.opacity = 0;
  }

  // The end of a game: a result screen with the prize paid, and a button to go again.
  function finish(id, title, text, prize, back) {
    leaveGame();
    if (back) placeAt(back.x, back.z, back.yaw);
    if (prize) Vitals.coins += prize;
    showResult(title, `${text}${prize ? ` Prize: +${prize} denarii.` : ""}`, [
      { label: "Play again", fn: () => { closePanels(); play(id); } },
      { label: "More games", fn: () => { closePanels(); open(); } },
      { label: "Back to Delhi", fn: closePanels },
    ]);
  }

  // ------------------------------------------------------------------ the games menu

  function open() {
    if (city !== "delhi") { toast("The games of Old Delhi are played in Delhi. Press B to travel there."); return; }
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    const ul = $d("dgames-list");
    ul.replaceChildren(...GAMES.map((g) => {
      const li = document.createElement("li"), txt = document.createElement("span"), b = document.createElement("button");
      const name = document.createElement("strong"), note = document.createElement("small");
      name.textContent = g.name; note.textContent = `${g.text} Where: ${g.where}.`;
      txt.append(name, note);
      b.type = "button"; b.textContent = "Play"; b.addEventListener("click", () => play(g.id));
      li.append(txt, b);
      return li;
    }));
    openPanel("#dgames");
  }

  function play(id) {
    if (city !== "delhi" || mode !== "walk" || sleepT > 0) return;
    if (id === "pachisi") { openPachisi(); return; }
    if (id === "bazaar") { openBazaar(); return; }
    if (!Vitals.canFight() && id !== "kites") { toast(`You are too wounded for that (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`); return; }
    closePanels();
    const info = GAMES.find((g) => g.id === id);
    if (id === "run") { runGame = startRun(); return; }
    const makers = { race: raceGame, defend: defendGame, kushti: kushtiGame, kites: kiteGame };
    const back = { x: player.x, z: player.z, yaw: player.yaw };
    const g = makers[id](back);
    g.id = id; g.back = back; g.keysText = info.keys;
    begin(g);
    hud(info.name, "", info.keys, null);
    if (g.start) g.start();
  }

  function update(dt, keys) {
    if (!game) return;
    updateEffects(dt);
    game.update(Math.min(dt, 0.05), keys);
    const f = $d("flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
  }
  function camera(cam, dt) { if (!game || !game.camera) return false; game.camera(cam, dt); return true; }
  function stop() {
    if (game) { const g = game; leaveGame(); if (g.back) placeAt(g.back.x, g.back.z, g.back.yaw); toast("You left the game."); }
    else if (runGame) { endRun(false, "You gave up the food run."); }
  }
  function fire() { if (game && game.fire) game.fire(); }
  function key(k) { if (game && game.key) game.key(k); }
  function playHere() {
    const v = Delhi.venueAt(player.x, player.z, player.feet);
    if (v) play(v.id); else toast("Walk to one of the game spots in Old Delhi, or press N for the list.");
  }

  // ------------------------------------------------------------------ 1. the race down Chandni Chowk

  function raceGame() {
    const modern = era === "modern";
    const id = modern ? "rickshaw" : "elephant", max = modern ? 8 : 10.5, acc = modern ? 5.5 : 4.2;
    const START = -585, FINISH = -30;
    const lanes = [3, -3, 9, -9], colors = [0x2f8f4a, 0xd9411f, 0x2f6bd9, 0x8a3fd0], names = ["You", "Bhola", "Jamna", "Kallu"];
    const group = new THREE.Group(); sc.add(group);
    const racers = colors.map((c, i) => {
      const g = Car.model(id, c); g.rotation.y = -Math.PI / 2; group.add(g);
      return { g, x: X(START), z: lanes[i], v: 0, name: names[i], me: i === 0, fin: null, lane: lanes[i], hitCd: 0, boostT: 0, boostCd: 0, ph: Math.random() * 6, skill: 0.8 + Math.random() * 0.08 };
    });
    const me = racers[0];
    const FRAC = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.93, 1.0], LEVELS = ["Crawl", "Slow", "Easy", "Steady", "Brisk", "Quick", "Fast", "Very fast", "Flat out"];
    me.pace = 7; me.cruise = false; me.stam = 100; me.tired = false;
    let t = -3, over = false, msgCd = 0;
    const say = (s) => { if (msgCd <= 0) { toast(s); msgCd = 1.4; } };
    return {
      key(k) {
        if (k === "KeyX") { me.cruise = !me.cruise; toast(me.cruise ? "Cruise on: you hold your speed level" : "Cruise off: hold W to go"); return; }
        const m = /^(?:Digit|Key|Numpad)([1-9])$/.exec(k);
        if (m && Number(m[1]) !== me.pace) { me.pace = Number(m[1]); me.cruise = true; toast(`Speed ${me.pace}/9: ${LEVELS[me.pace - 1]}`); }
      },
      start() { Sfx.play("horn"); toast("Get ready... keys 1 to 9 pick your speed, X holds it (cruise)"); player.x = me.x; player.z = me.z; },
      update(dt, keys) {
        t += dt; msgCd -= dt;
        if (t < 0) { hud("Race down Chandni Chowk", `${Math.ceil(-t)}...`, undefined, 0); }
        const go = t >= 0;
        if (go && t - dt < 0) { Sfx.play("horn"); toast("Go!"); }
        for (const r of racers) {
          if (r.fin !== null) { r.v = Math.max(0, r.v - 5 * dt); r.x += r.v * dt; continue; }
          r.hitCd -= dt; r.boostT -= dt; r.boostCd -= dt;
          let target = 0, steer = 0, brake = false;
          if (r.me) {
            const gas = keys.has("KeyW") || keys.has("ArrowUp") || me.cruise; brake = keys.has("KeyS") || keys.has("ArrowDown");
            if (brake) me.cruise = false;
            steer = (keys.has("KeyA") || keys.has("ArrowLeft") ? -1 : 0) + (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0); // + = south
            let frac = FRAC[me.pace - 1];
            if (me.tired) frac = Math.min(frac, 0.55);
            // the higher the level, the faster you wear out; easy levels let you get your breath back
            if (go && r.v > 1) me.stam = clamp(me.stam - Math.max(0, (frac - 0.75) * 26) * dt + (frac <= 0.75 ? (0.8 - frac) * 14 + 2 : 0) * dt, 0, 100);
            if (me.stam <= 0 && !me.tired) { me.tired = true; toast("You are worn out! Slow down to get your breath back"); }
            else if (me.tired && me.stam > 25) { me.tired = false; toast("You have your breath back"); }
            target = gas ? max * frac : 0;
            if (keys.has("Space") && r.boostCd <= 0 && go) { r.boostT = 1.3; r.boostCd = 5; Sfx.play("whip"); }
          } else {
            r.ph += dt;
            target = max * (r.skill + 0.06 * Math.sin(r.ph * 0.5)) ;
            if (r.boostCd <= 0 && Math.random() < 0.01) { r.boostT = 1.1; r.boostCd = 6 + Math.random() * 3; }
            // look ahead for traffic and slower racers and pick another lane
            const ahead = Delhi.hits(r.x + 12, r.z) || racers.some((o) => o !== r && o.x > r.x && o.x - r.x < 9 && Math.abs(o.z - r.z) < 2.4);
            if (ahead && r.hitCd <= 0) { r.lane = clamp(r.z + (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 3), -12, 12); r.hitCd = 0.8; }
            steer = clamp((r.lane - r.z) * 0.6, -1, 1);
          }
          if (!go) target = 0;
          const cap = r.boostT > 0 ? max * 1.45 : max;
          if (r.boostT > 0) target = cap;
          r.v += clamp(target - r.v, brake ? -12 * dt : -3 * dt, acc * (r.boostT > 0 ? 2 : 1) * dt);
          r.v = clamp(r.v, 0, cap);
          r.x += r.v * dt;
          r.z += steer * (2.2 + r.v * 0.45) * dt;
          if (Math.abs(r.z) > 13.5) { r.z = clamp(r.z, -13.5, 13.5); r.v *= 1 - 1.5 * dt; }
          // street traffic
          const h = go ? Delhi.hits(r.x + 1, r.z) : null;
          if (h && r.hitCd <= 0) {
            r.v *= 0.25; r.z += h.side * 2.2; r.hitCd = 1; if (r.me) { say(`You ran into ${h.what}!`); player.shake = 0.6; Sfx.play("crash"); }
          }
        }
        // racers jostle each other
        for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
          const a = racers[i], b = racers[j], dx = b.x - a.x, dz = b.z - a.z;
          if (Math.abs(dx) < 3.4 && Math.abs(dz) < 1.9) {
            const s = dz >= 0 ? 1 : -1, push = (1.9 - Math.abs(dz)) * 0.5;
            a.z -= s * push; b.z += s * push;
            const slow = dx > 0 ? a : b; slow.v *= 1 - 1.2 * dt;
            if (a.me || b.me) say("Bump!");
          }
        }
        for (const r of racers) {
          const rel = r.x - DELHI_X;
          if (r.fin === null && rel >= FINISH) { r.fin = t; if (r.me) { Sfx.play("cheer"); } }
          r.g.position.set(r.x, groundAt(r.x, r.z) + (Math.abs(Math.sin(t * r.v * 0.6 + r.ph)) * 0.04), r.z);
          r.g.rotation.y = -Math.PI / 2 - clamp((r.lane - r.z) * 0.02, -0.2, 0.2);
          for (const w of r.g.userData.wheels || []) w.rotation.x += (r.v * dt) / 0.34;
          const legs = r.g.userData.legs || [];
          legs.forEach((l, k) => { l.rotation.x = Math.sin(t * r.v * 0.55 + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.55 * Math.min(1, r.v / 2); });
        }
        player.x = me.x; player.z = me.z; player.feet = 0;
        const order = [...racers].sort((a, b) => (a.fin !== null && b.fin !== null ? a.fin - b.fin : a.fin !== null ? -1 : b.fin !== null ? 1 : b.x - a.x));
        const rank = order.indexOf(me) + 1;
        if (go) hud("Race down Chandni Chowk", `${ordinal(rank)} of 4 · ${Math.max(0, Math.round(FINISH - (me.x - DELHI_X)))} m to the gate · Speed ${me.pace}/9: ${LEVELS[me.pace - 1]}${me.cruise ? " (cruise)" : ""}${me.tired ? " (worn out)" : ""} · boost ${me.boostCd > 0 ? Math.ceil(me.boostCd) + " s" : "ready"}`, undefined, me.stam / 100);
        if (me.fin !== null && !over) {
          over = true;
          const prize = rank === 1 ? 60 : rank === 2 ? 25 : 0;
          setTimeout(() => { if (game && game.id === "race") finish("race", rank === 1 ? "You won the race!" : `You finished ${ordinal(rank)}`, `${order.map((r, i) => `${i + 1}. ${r.name}`).join("  ·  ")}.`, prize, game.back); }, 1200);
        }
        if (t > 110 && !over) { over = true; finish("race", "Too slow", "The street emptied before you reached the gate.", 0, game.back); }
      },
      camera(cam, dt) {
        const k = Math.min(1, dt * 6);
        cam.position.x += (me.x - 12 - cam.position.x) * k; cam.position.y += (5.4 - cam.position.y) * k; cam.position.z += (me.z * 0.8 - cam.position.z) * k;
        cam.lookAt(me.x + 10, 1.4, me.z);
        if (player.shake > 0) { cam.position.x += (Math.random() - 0.5) * player.shake * 0.4; cam.position.y += (Math.random() - 0.5) * player.shake * 0.3; player.shake = Math.max(0, player.shake - dt * 2.4); }
      },
      cleanup() { sc.remove(group); },
    };
  }

  // ------------------------------------------------------------------ the other games are added below
  // ------------------------------------------------------------------ 2. defend the Red Fort

  function defendGame() {
    const group = new THREE.Group(); sc.add(group);
    const MAXR = 80, WAVES = [14, 24, 36];
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.42, 1.35, 8); bodyGeo.translate(0, 0.68, 0);
    const headGeo = new THREE.SphereGeometry(0.2, 8, 6); headGeo.translate(0, 1.58, 0);
    const hatGeo = new THREE.SphereGeometry(0.26, 8, 6); hatGeo.scale(1, 0.7, 1); hatGeo.translate(0, 1.76, 0);
    const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXR);
    const head = new THREE.InstancedMesh(headGeo, lam(0xa8724c), MAXR);
    const hat = new THREE.InstancedMesh(hatGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXR);
    for (const m of [body, head, hat]) { m.frustumCulled = false; m.castShadow = true; group.add(m); }
    const cols = [0x2a2a2a, 0x8a1f1f, 0x1f3a6a].map((c) => new THREE.Color(c));
    const raiders = [];
    const ret = new THREE.Mesh(new THREE.RingGeometry(6.2, 7.4, 28), new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ret.rotation.x = -Math.PI / 2; group.add(ret);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0xffd45a, side: THREE.DoubleSide })); dot.rotation.x = -Math.PI / 2; group.add(dot);
    const gun = new THREE.Group(), barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 5, 12), lam(0x2e2e30)); barrel.rotation.x = Math.PI / 2; barrel.position.z = 2.2;
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 3), lam(0x6b4a2b)); cradle.position.y = -0.9;
    gun.add(barrel, cradle); gun.position.set(X(2.6), 27.1, 45); group.add(gun); Delhi.cannonShow(false);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), lam(0x1a1a1c)); ball.visible = false; group.add(ball);
    let d = 140, az = 0, cool = 0, wave = -1, toSpawn = 0, spawnT = 0, rest = 2, gate = 100, kills = 0, shot = null, over = false, t = 0;
    const o = new THREE.Object3D();
    const alive = () => raiders.filter((r) => r.alive).length;
    const nextWave = () => { wave++; toSpawn = WAVES[wave]; spawnT = 0; toast(`Wave ${wave + 1} of ${WAVES.length}: ${toSpawn} raiders!`); Sfx.play("horn"); };
    function boom(tx, tz) {
      let k = 0;
      for (const r of raiders) if (r.alive && Math.hypot(r.x - tx, r.z - tz) < 8) { r.alive = false; k++; kills++; }
      puff(tx, 2, tz, 5, 0.5, 0xffb347, 18); puff(tx, 3, tz, 6, 1.5, 0x5a5a5a, 7, 0.8);
      Sfx.play("cannon", { x: tx, z: tz }); if (k) Sfx.play("crash", { x: tx, z: tz, range: 200 });
      if (k >= 4) toast(`A direct hit: ${k} raiders down!`);
    }
    return {
      dbg: () => ({ raiders, gate, wave, kills, d, az }), aim(nd, naz) { d = nd; az = naz; },
      start() { toast("Raiders at the gate! Aim with W A S D, fire with Space"); nextWave(); },
      fire() { if (cool > 0 || over) return; cool = 1.5; shot = { t: 0, tx: X(-d), tz: az, from: new THREE.Vector3(gun.position.x, gun.position.y, gun.position.z) }; Sfx.play("cannon", { x: gun.position.x, z: 7 }); puff(gun.position.x, gun.position.y, gun.position.z - 1, 3, 0.4, 0xffd45a, 12); },
      update(dt, keys) {
        t += dt; cool -= dt;
        if (keys.has("KeyW") || keys.has("ArrowUp")) d += 70 * dt;
        if (keys.has("KeyS") || keys.has("ArrowDown")) d -= 70 * dt;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) az += 16 * dt;
        if (keys.has("KeyD") || keys.has("ArrowRight")) az -= 16 * dt;
        if (keys.has("Space")) this.fire();
        d = clamp(d, 30, 290); az = clamp(az, -14, 14);
        ret.position.set(X(-d), 0.25, az); dot.position.set(X(-d), 0.26, az);
        gun.lookAt(X(-d * 0.7), 8, az * 0.8);
        // the shell in flight
        if (shot) {
          shot.t += dt / 1.15;
          const k = Math.min(1, shot.t);
          ball.visible = true;
          ball.position.set(shot.from.x + (shot.tx - shot.from.x) * k, shot.from.y * (1 - k) + 1 + 22 * Math.sin(Math.PI * k), shot.from.z + (shot.tz - shot.from.z) * k);
          if (k >= 1) { ball.visible = false; boom(shot.tx, shot.tz); shot = null; }
        }
        // waves
        if (wave < WAVES.length) {
          if (toSpawn > 0) {
            spawnT -= dt;
            if (spawnT <= 0 && raiders.length < MAXR) {
              spawnT = 0.55 + Math.random() * 0.3; toSpawn--;
              const slot = raiders.findIndex((r) => !r.alive && r.gone);
              const r = { x: X(-330 - Math.random() * 40), z: (Math.random() - 0.5) * 24, v: 2.4 + Math.random() * 1.2 + wave * 0.45, ph: Math.random() * 6, alive: true, ci: Math.floor(Math.random() * 3), gone: false };
              if (slot >= 0) raiders[slot] = r; else raiders.push(r);
            }
          } else if (alive() === 0 && !over) {
            rest -= dt;
            if (rest <= 0) { if (wave + 1 < WAVES.length) { rest = 3.5; nextWave(); } else { over = true; wave = WAVES.length; } }
          }
        }
        o.rotation.set(0, 0, 0);
        raiders.forEach((r, i) => {
          if (r.alive) {
            r.x += r.v * dt; r.z += Math.sin(t * 1.4 + r.ph) * 0.6 * dt; r.z = clamp(r.z, -14, 14);
            if (r.x - DELHI_X > -6) { r.alive = false; r.gone = true; gate -= 4; player.shake = 0.5; $d("flash").style.opacity = 0.35; Sfx.play("bump"); puff(r.x, 2, r.z, 2, 0.4, 0xff7a5a, 6); }
          } else r.gone = true;
          o.position.set(r.x, r.alive ? groundAt(r.x, r.z) + Math.abs(Math.sin(t * 6 + r.ph)) * 0.08 : -50, r.z); o.rotation.y = -Math.PI / 2; o.updateMatrix();
          body.setMatrixAt(i, o.matrix); head.setMatrixAt(i, o.matrix); hat.setMatrixAt(i, o.matrix); body.setColorAt(i, cols[r.ci]); hat.setColorAt(i, cols[(r.ci + 1) % 3]);
        });
        for (let i = raiders.length; i < MAXR; i++) { o.position.set(0, -50, 0); o.updateMatrix(); body.setMatrixAt(i, o.matrix); head.setMatrixAt(i, o.matrix); hat.setMatrixAt(i, o.matrix); }
        for (const m of [body, head, hat]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        const left = alive() + toSpawn;
        hud("Defend the Red Fort", `Wave ${Math.min(wave + 1, WAVES.length)} of ${WAVES.length} · raiders left ${left} · gate ${Math.max(0, Math.round(gate))}%`, undefined, gate / 100);
        if (gate <= 0 && !over) { over = true; finish("defend", "The gate has fallen", `The raiders broke through the Lahori Gate. You stopped ${kills} of them.`, 0, game.back); }
        else if (wave >= WAVES.length && alive() === 0 && over && gate > 0) { over = false; const prize = 50 + Math.round(gate * 0.3); wave = 99; finish("defend", "The gate holds!", `All three waves are beaten (${kills} raiders stopped) and the Lahori Gate is ${Math.round(gate)}% intact.`, prize, game.back); }
      },
      camera(cam, dt) {
        cam.position.set(X(14), 31, 49);
        cam.lookAt(X(-d * 0.55 - 10), 2, az * 0.6 + 20);
        if (player.shake > 0) { cam.position.x += (Math.random() - 0.5) * player.shake * 0.6; cam.position.y += (Math.random() - 0.5) * player.shake * 0.4; player.shake = Math.max(0, player.shake - dt * 2.4); }
      },
      cleanup() { sc.remove(group); Delhi.cannonShow(true); },
    };
  }

  // ------------------------------------------------------------------ 3. kushti wrestling

  function kushtiGame() {
    const C = { x: X(-45), z: 35 }, R = 7.5;
    const group = new THREE.Group(); sc.add(group);
    const mk = (look, worn) => { const f = createFigure(); paintFigure(f.mats, look); applyAccessories(f, worn || []); f.g.rotation.order = "YXZ"; group.add(f.g); return f; };
    const fm = mk(Character.look, Market.worn), ff = mk({ skin: 3, hair: 0, toga: 4, sash: 2 }, ["armbands"]);
    const me = { f: fm, x: -3.5, z: 0, yaw: -Math.PI / 2, lie: 0 }, foe = { f: ff, x: 3.5, z: 0, yaw: Math.PI / 2, lie: 0 };
    const round = { me: 0, foe: 0 };
    let state = "free", bal = 0, wait = 0, prevSpace = false, aiT = 0, aiCool = 1.2, t = 0, msg = "", over = false, gx = 0, gz = 0, gdir = [1, 0];
    const strength = 0.8;
    function reset() { me.x = -3.5; me.z = 0; foe.x = 3.5; foe.z = 0; me.lie = foe.lie = 0; state = "free"; bal = 0; aiCool = 1.2; }
    function point(who, why) {
      round[who]++; state = "down"; wait = 2; Sfx.play(who === "me" ? "cheer" : "oof");
      (who === "me" ? foe : me).lie = 1;
      msg = `${why} ${round.me} – ${round.foe}`; toast(msg);
      if (round.me >= 2 || round.foe >= 2) over = true;
    }
    const pose = (p, walkV, grip) => {
      const swing = Math.sin(t * 7) * Math.min(1, walkV / 3) * 0.7, a = p.f.parts;
      a.armL.rotation.x = grip ? -1.3 : -swing; a.armR.rotation.x = grip ? -1.3 : swing; a.legL.rotation.x = swing; a.legR.rotation.x = -swing;
      p.f.g.position.set(C.x + p.x, p.lie > 0 ? 0.3 : 0, C.z + p.z);
      p.f.g.rotation.y = p.yaw; p.f.g.rotation.x += ((p.lie > 0 ? -Math.PI / 2 : 0) - p.f.g.rotation.x) * 0.25;
    };
    return {
      dbg: () => ({ me, foe, state, bal, round }),
      start() { reset(); toast("Kushti! Get close, press Space to take hold, then mash Space to throw"); Sfx.play("horn"); },
      update(dt, keys) {
        t += dt;
        const space = keys.has("Space"), press = space && !prevSpace; prevSpace = space;
        let mvx = 0, mvz = 0;
        if (state === "free") {
          if (keys.has("KeyW") || keys.has("ArrowUp")) mvz -= 1; if (keys.has("KeyS") || keys.has("ArrowDown")) mvz += 1;
          if (keys.has("KeyA") || keys.has("ArrowLeft")) mvx -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) mvx += 1;
          const l = Math.hypot(mvx, mvz) || 1; mvx /= l; mvz /= l;
          me.x += mvx * 3.2 * dt; me.z += mvz * 3.2 * dt;
          if (mvx || mvz) me.yaw = Math.atan2(-mvx, -mvz);
          // the rival closes in
          const dx = me.x - foe.x, dz = me.z - foe.z, dist = Math.hypot(dx, dz) || 1;
          foe.yaw = Math.atan2(-dx, -dz);
          if (dist > 1.25) { foe.x += (dx / dist) * 2.5 * dt; foe.z += (dz / dist) * 2.5 * dt; }
          aiCool -= dt;
          if (dist < 1.7) {
            if (press || (aiCool <= 0 && Math.random() < dt * 1.6)) { state = "grip"; bal = 0; gdir = [-dx / dist, -dz / dist]; Sfx.play("clash"); toast("Locked in! Mash Space!"); }
          }
          for (const p of [me, foe]) { const r = Math.hypot(p.x, p.z); if (r > R) { if (!over && state === "free") point(p === me ? "foe" : "me", p === me ? "You stepped out of the pit." : "Your rival stepped out."); } }
          pose(me, Math.hypot(mvx, mvz) * 3, false); pose(foe, dist > 1.3 ? 3 : 0, false);
        } else if (state === "grip") {
          if (press) bal += 0.095;
          aiT -= dt; if (aiT <= 0) { aiT = 0.13 + Math.random() * 0.09; bal -= 0.095 * (0.9 + round.me * 0.15); }
          bal *= 1 - 0.35 * dt;
          // the pair shuffles toward whoever is losing
          const mx = (me.x + foe.x) / 2 + gdir[0] * bal * 1.1 * dt, mz = (me.z + foe.z) / 2 + gdir[1] * bal * 1.1 * dt;
          me.x = mx - gdir[0] * 0.55; me.z = mz - gdir[1] * 0.55; foe.x = mx + gdir[0] * 0.55; foe.z = mz + gdir[1] * 0.55;
          me.yaw = Math.atan2(-gdir[0], -gdir[1]); foe.yaw = me.yaw + Math.PI;
          pose(me, 0, true); pose(foe, 0, true);
          if (Math.hypot(mx, mz) > R - 0.5) point(bal >= 0 ? "me" : "foe", bal >= 0 ? "You pushed your rival out of the pit!" : "You were pushed out of the pit.");
          else if (bal >= 1) point("me", "You threw your rival!");
          else if (bal <= -1) point("foe", "Your rival threw you.");
        } else { // down: a short pause, then the next bout
          wait -= dt; pose(me, 0, false); pose(foe, 0, false);
          if (wait <= 0) {
            if (over) { const won = round.me >= 2; finish("kushti", won ? "Victory in the akhara!" : "Defeated in the akhara", won ? "You beat Pehlwan Bala, two throws to " + round.foe + "." : "Pehlwan Bala threw you twice.", won ? 40 : 0, game.back); }
            else reset();
          }
        }
        player.x = C.x; player.z = C.z;
        hud("Kushti wrestling", `You ${round.me} – ${round.foe} Pehlwan Bala · first to 2`, undefined, state === "grip" ? (bal + 1) / 2 : null);
      },
      camera(cam, dt) { cam.position.set(C.x + Math.sin(t * 0.2) * 3, 8.5, C.z + 12.5); cam.lookAt(C.x, 0.9, C.z); },
      cleanup() { sc.remove(group); },
    };
  }

  // ------------------------------------------------------------------ 4. kite fights

  function kiteGame() {
    const cx = X(-45), kx = cx - 48;
    const group = new THREE.Group(); sc.add(group);
    const palette = [0xe23b3b, 0x2c7fe0, 0xf2c21b, 0x27a35a, 0xf26a1b, 0xd94fa0];
    const shape = new THREE.Shape(); shape.moveTo(0, 1.5); shape.lineTo(1.1, 0.2); shape.lineTo(0, -1.3); shape.lineTo(-1.1, 0.2); shape.closePath();
    const kiteGeo = new THREE.ShapeGeometry(shape), centreGeo = new THREE.ShapeGeometry(shape); centreGeo.scale(0.5, 0.5, 1);
    const tethers = [new THREE.Vector3(cx + 0.4, 1.3, 0.2), new THREE.Vector3(cx - 6, 0.3, -20), new THREE.Vector3(cx - 11, 0.3, 14), new THREE.Vector3(cx - 4, 0.3, 28)];
    const kites = tethers.map((tp, i) => {
      const g = new THREE.Group(), c = palette[(i * 2 + Math.floor(Math.random() * 2)) % palette.length];
      const body = new THREE.Mesh(kiteGeo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); const mid = new THREE.Mesh(centreGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); mid.position.set(0, 0.1, 0.02);
      g.add(body, mid);
      const tail = []; for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); g.add(m); tail.push(m); }
      g.rotation.y = Math.PI / 2; g.scale.setScalar(1.7); group.add(g);
      const geo = new THREE.BufferGeometry().setFromPoints([tp, tp]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: i === 0 ? 0xfff1b0 : 0xeeeeee })); line.frustumCulled = false; group.add(line);
      return { i, g, tail, line, tether: tp, u: i === 0 ? 0 : (i - 2) * 22, v: i === 0 ? 24 : 18 + Math.random() * 20, vu: 0, vv: 0, tu: 0, tv: 24, alive: true, fall: 0, rate: 0.3 + Math.random() * 0.2, think: 0, surge: 1, surgeT: 0 };
    });
    const me = kites[0], eng = new Map();
    const pos = (k) => new THREE.Vector3(kx, k.v, k.u);
    function segDist(a0, a1, b0, b1) { // closest distance between two segments (checked at sample points along the first)
      let best = Infinity; const ab = b1.clone().sub(b0), l2 = ab.lengthSq() || 1;
      for (let s = 0; s <= 1.0001; s += 0.04) {
        const p = a0.clone().lerp(a1, s), t = clamp(p.clone().sub(b0).dot(ab) / l2, 0, 1);
        best = Math.min(best, p.distanceTo(b0.clone().add(ab.clone().multiplyScalar(t))));
      }
      return best;
    }
    let t = 0, cuts = 0, over = false, left = 120, sawNow = null;
    const cut = (k, by) => { k.alive = false; k.fall = 0.001; k.line.visible = false; if (k === me) { /* lost */ } else if (by === me) { cuts++; Sfx.play("cheer"); toast(`You cut a kite! (${cuts} of 3)`); } else toast("Two rivals cut each other's strings!"); };
    return {
      dbg: () => ({ kites, me, cuts, eng }),
      start() { toast("Fly your kite into the others' strings, then hold Space to saw through them"); },
      update(dt, keys) {
        t += dt; left -= dt;
        const sx = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0), sy = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        // facing west, the left of the screen is +z
        for (const k of kites) {
          k.surgeT -= dt; if (k.surgeT <= 0) { k.surgeT = 0.6 + Math.random() * 0.9; k.surge = 0.5 + Math.random() * 1.4; }
          if (k.alive) {
            if (k === me) { k.vu += (-sx * -18 - k.vu) * Math.min(1, dt * 4); k.vv += (sy * 14 - k.vv) * Math.min(1, dt * 4); }
            else {
              k.think -= dt;
              if (k.think <= 0) { k.think = 1.6 + Math.random() * 1.8; const foes = kites.filter((o) => o !== k && o.alive); const tgt = Math.random() < 0.65 ? foes[Math.floor(Math.random() * foes.length)] : null; if (tgt) { k.tu = tgt.u + (Math.random() - 0.5) * 8; k.tv = clamp(tgt.v - 2 + Math.random() * 6, 11, 44); } else { k.tu = (Math.random() - 0.5) * 60; k.tv = 14 + Math.random() * 28; } }
              k.vu += (clamp(k.tu - k.u, -9, 9) - k.vu) * Math.min(1, dt * 2.2); k.vv += (clamp(k.tv - k.v, -7, 7) - k.vv) * Math.min(1, dt * 2.2);
            }
            k.u = clamp(k.u + k.vu * dt, -42, 42); k.v = clamp(k.v + k.vv * dt, 10, 46);
          } else {
            k.fall += dt; k.v -= 6 * dt; k.u += Math.sin(t * 2 + k.i) * 2 * dt; if (k.v < 0.5 || k.fall > 8) { k.g.visible = false; }
          }
          k.g.position.set(kx, k.v, k.u); k.g.rotation.z = Math.sin(t * 2.1 + k.i) * 0.12 + (k.alive ? 0 : k.fall * 2);
          k.tail.forEach((m, j) => m.position.set(Math.sin(t * 3 + j * 0.7 + k.i) * 0.25, -1.55 - j * 0.55, 0));
          if (k.alive) { const p = k.line.geometry.attributes.position; p.setXYZ(0, k.tether.x, k.tether.y, k.tether.z); p.setXYZ(1, kx, k.v - 1.2, k.u); p.needsUpdate = true; }
        }
        // strings that cross are sawn through
        sawNow = null;
        for (let a = 0; a < kites.length; a++) for (let b = a + 1; b < kites.length; b++) {
          const A = kites[a], B = kites[b], key = `${a}-${b}`;
          if (!A.alive || !B.alive) { eng.delete(key); continue; }
          const d = segDist(A.tether, new THREE.Vector3(kx, A.v - 1.2, A.u), B.tether, new THREE.Vector3(kx, B.v - 1.2, B.u));
          let s = eng.get(key) || 0;
          if (d < 1.6) {
            const ra = A === me ? (keys.has("Space") ? 0.75 : 0.05) : A.rate * A.surge, rb = B === me ? (keys.has("Space") ? 0.75 : 0.05) : B.rate * B.surge;
            s += (ra - rb) * dt * 1.2; eng.set(key, s);
            if (A === me || B === me) sawNow = A === me ? s : -s;
            if (s >= 1) { cut(B, A); eng.delete(key); } else if (s <= -1) { cut(A, B); eng.delete(key); }
          } else if (d > 2.6) eng.set(key, s * (1 - 2 * dt));
        }
        player.x = cx; player.z = 0;
        const enemiesLeft = kites.filter((k) => k !== me && k.alive).length;
        hud("Kite fights", `Rival kites ${enemiesLeft} · cut ${cuts} · ${Math.ceil(left)} s`, undefined, sawNow === null ? null : (sawNow + 1) / 2);
        if (!over && (!me.alive || enemiesLeft === 0 || left <= 0)) {
          over = true;
          const won = me.alive && enemiesLeft === 0, prize = Math.min(60, cuts * 20) + (won ? 0 : 0);
          setTimeout(() => { if (game && game.id === "kites") finish("kites", won ? "The sky is yours!" : !me.alive ? "Your string was cut" : "Time is up", won ? "You cut every rival kite." : `You cut ${cuts} kite${cuts === 1 ? "" : "s"}.`, prize, game.back); }, 1200);
        }
      },
      camera(cam) { cam.position.set(cx, 1.7, 0.001); cam.lookAt(kx, 23, 0); },
      cleanup() { sc.remove(group); },
    };
  }

  // ------------------------------------------------------------------ 5. the chaat run

  function startRun() {
    const spots = [{ n: "Katra Neel", x: -420, z: -12 }, { n: "the Chandni Chowk pool", x: -310, z: 12 }, { n: "the Fatehpuri Masjid", x: -596, z: 0 }, { n: "the Meena Bazaar lane", x: -150, z: 40 }, { n: "the Begum ki Serai", x: -240, z: -16 }, { n: "the Lahori Gate", x: -38, z: 0 }]
      .sort(() => Math.random() - 0.5).slice(0, 3);
    placeAt(X(-215), 8, Math.PI / 2); player.pitch = -0.02;
    const run = { idx: 0, time: 150, q: 100, earned: 0, cool: 0 };
    const target = () => spots[run.idx];
    const go = () => { const s = target(); Nav.set({ name: s.n, x: X(s.x), z: s.z, stand: [X(s.x), s.z] }); };
    go();
    $d("dg-hud").classList.add("show"); $d("dg-keys").textContent = "walk to the marker · bumping people spills the food · Esc to give up";
    toast(`Chaat run! First stop: ${target().n}`); Sfx.play("coin");
    run.bump = () => { if (run.cool > 0) return; run.cool = 0.6; run.q = Math.max(0, run.q - 18); toast("You spilled some of the food!"); };
    run.tick = (dt) => {
      run.time -= dt; run.cool -= dt;
      const pace = Math.hypot(player.vx, player.vz);
      run.q = Math.max(0, run.q - (1.1 + (pace > 6.5 ? 1.6 : 0)) * dt);
      const s = target();
      if (Math.hypot(player.x - X(s.x), player.z - s.z) < 6.5) {
        const pay = Math.round((run.q / 100) * 30); run.earned += pay; run.idx++;
        Sfx.play("coin"); toast(`Delivered to ${s.n}: ${pay} denarii (food ${Math.round(run.q)}% fresh)`);
        if (run.idx >= 3) { endRun(true, `All three customers are fed. The food was ${Math.round(run.q)}% fresh at the end.`); return; }
        run.q = Math.min(100, run.q + 35); go(); // a fresh tray from a stall on the way
        toast(`Delivered! A fresh tray from a stall, then on to ${target().n}`);
      }
      if (run.time <= 0) { endRun(false, "Time ran out and the customers went hungry."); return; }
      hud("Chaat run", `Delivery ${Math.min(run.idx + 1, 3)} of 3 · ${target().n} · ${Math.ceil(run.time)} s`, undefined, run.q / 100);
    };
    return run;
  }

  function endRun(done, text) {
    const r = runGame; runGame = null;
    Nav.clear(); $d("dg-hud").classList.remove("show");
    Vitals.coins += r.earned;
    showResult(done ? "Food delivered!" : "The run is over", `${text}${r.earned ? ` You earned ${r.earned} denarii.` : ""}`, [
      { label: "Run again", fn: () => { closePanels(); play("run"); } }, { label: "More games", fn: () => { closePanels(); open(); } }, { label: "Back to Delhi", fn: closePanels },
    ]);
  }
  function tickRun(dt) { if (runGame && mode === "walk" && !panelOpen) runGame.tick(dt); }

  // ------------------------------------------------------------------ 6. pachisi

  const PC = { ring: 28, safe: [0, 7, 14, 21], goal: 32 };
  let pc = null;

  function pcNew() {
    pc = { turn: "me", phase: "throw", steps: 0, pawns: { me: [-1, -1], bot: [-1, -1] }, msg: "Your throw.", over: false, paid: false, movable: [], timer: null };
    pcDraw(); pcSync();
  }
  const pcStart = (who) => (who === "me" ? 0 : 14);
  const pcCell = (who, p) => (pcStart(who) + p) % PC.ring;
  function pcPoint(who, p, cw) {
    const cx = 170, cy = 170, R = 128;
    if (p < 0) { const base = who === "me" ? [[40, 300], [75, 300]] : [[300, 40], [265, 40]]; return base[cw]; }
    if (p >= PC.goal) return [170 + (who === "me" ? -10 : 10), 170];
    if (p < PC.ring) { const c = pcCell(who, p), a = -Math.PI / 2 + (c / PC.ring) * Math.PI * 2; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; }
    const c = (pcStart(who) + PC.ring - 1) % PC.ring, a = -Math.PI / 2 + (c / PC.ring) * Math.PI * 2, r = R - (p - PC.ring + 1) * 24;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }
  function pcDraw() {
    const cv = $d("pc-board"), g = cv.getContext("2d");
    g.clearRect(0, 0, 340, 340); g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, 340, 340);
    for (let c = 0; c < PC.ring; c++) {
      const a = -Math.PI / 2 + (c / PC.ring) * Math.PI * 2, x = 170 + Math.cos(a) * 128, y = 170 + Math.sin(a) * 128;
      g.beginPath(); g.arc(x, y, 11, 0, 7); g.fillStyle = PC.safe.includes(c) ? "#e2b955" : "#8a6a42"; g.fill();
    }
    for (const who of ["me", "bot"]) for (let k = 1; k <= 4; k++) { const [x, y] = pcPoint(who, PC.ring - 1 + k, 0); g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = who === "me" ? "#4f7a3a" : "#8a3a2f"; g.fill(); }
    g.beginPath(); g.arc(170, 170, 16, 0, 7); g.fillStyle = "#e2b955"; g.fill();
    for (const who of ["me", "bot"]) { const [bx, by] = pcPoint(who, -1, 0); g.beginPath(); g.arc(bx + (who === "me" ? 17 : -17), by, 26, 0, 7); g.strokeStyle = "rgba(255,255,255,.25)"; g.stroke(); }
    pc.pawns.me.forEach((p, i) => pcPawn(g, "me", p, i)); pc.pawns.bot.forEach((p, i) => pcPawn(g, "bot", p, i));
  }
  function pcPawn(g, who, p, i) {
    const [x, y] = pcPoint(who, p, i), canPick = who === "me" && pc.phase === "pick" && pc.movable.includes(i);
    g.beginPath(); g.arc(x, y, canPick ? 12 : 10, 0, 7); g.fillStyle = who === "me" ? "#7bd45a" : "#e0604f"; g.fill();
    g.lineWidth = canPick ? 4 : 2; g.strokeStyle = canPick ? "#ffffff" : "#1a1208"; g.stroke(); g.lineWidth = 1;
  }
  function pcSync() {
    $d("pc-msg").textContent = pc.msg;
    $d("pc-throw").disabled = !(pc.turn === "me" && pc.phase === "throw" && !pc.over);
  }
  function pcLegal(who) {
    const out = [];
    pc.pawns[who].forEach((p, i) => { const to = p < 0 ? pc.steps - 1 : p + pc.steps; if (to <= PC.goal) out.push(i); });
    return out;
  }
  function pcThrow() {
    if (pc.turn !== "me" || pc.phase !== "throw" || pc.over) return;
    pcRoll("me");
  }
  function pcRoll(who) {
    let k = 0; for (let i = 0; i < 6; i++) if (Math.random() < 0.5) k++;
    pc.steps = k === 0 ? 6 : k; pc.extra = k === 0 || k === 6;
    const shells = "●".repeat(k) + "○".repeat(6 - k);
    pc.msg = `${who === "me" ? "You throw" : "Your rival throws"} ${shells}: move ${pc.steps}${pc.extra ? " (and throw again)" : ""}.`;
    Sfx.play("coin");
    const legal = pcLegal(who);
    if (!legal.length) { pc.msg += " No pawn can move."; pcEnd(who); return; }
    pc.phase = "pick"; pc.movable = legal;
    if (who === "me") { if (legal.length === 1 || (legal.length === 2 && pc.pawns.me[0] === pc.pawns.me[1])) pc.timer = setTimeout(() => pcMove("me", legal[0]), 600); }
    else pc.timer = setTimeout(() => pcMove("bot", pcBotPick(legal)), 800);
    pcDraw(); pcSync();
  }
  function pcBotPick(legal) {
    let best = legal[0], bs = -1;
    for (const i of legal) {
      const p = pc.pawns.bot[i], to = p < 0 ? pc.steps - 1 : p + pc.steps; let s = to; if (to === PC.goal) s += 100;
      if (to < PC.ring && !PC.safe.includes(pcCell("bot", to))) { const c = pcCell("bot", to); if (pc.pawns.me.some((q) => q >= 0 && q < PC.ring && pcCell("me", q) === c)) s += 60; }
      if (p < 0) s += 8;
      if (s > bs) { bs = s; best = i; }
    }
    return best;
  }
  function pcMove(who, i) {
    if (pc.phase !== "pick" || pc.turn !== who || !pc.movable.includes(i)) return;
    clearTimeout(pc.timer);
    const p = pc.pawns[who][i], to = p < 0 ? pc.steps - 1 : p + pc.steps;
    pc.pawns[who][i] = to;
    const other = who === "me" ? "bot" : "me";
    if (to < PC.ring && !PC.safe.includes(pcCell(who, to))) {
      const c = pcCell(who, to);
      pc.pawns[other].forEach((q, j) => { if (q >= 0 && q < PC.ring && pcCell(other, q) === c) { pc.pawns[other][j] = -1; pc.msg += ` ${who === "me" ? "You sent a red pawn home!" : "A green pawn of yours was sent home!"}`; Sfx.play("oof"); } });
    }
    if (pc.pawns[who].every((q) => q >= PC.goal)) {
      pc.over = true; pc.phase = "done";
      if (who === "me" && !pc.paid) { pc.paid = true; Vitals.coins += 25; pc.msg = "You win at pachisi! Prize: +25 denarii."; Sfx.play("cheer"); } else pc.msg = "Your rival wins this game.";
      pcDraw(); pcSync(); return;
    }
    pcEnd(who);
  }
  function pcEnd(who) {
    pc.movable = [];
    if (pc.extra && !pc.over) { pc.phase = "throw"; pc.turn = who; pcDraw(); pcSync(); if (who === "bot") pc.timer = setTimeout(() => pcRoll("bot"), 800); return; }
    pc.turn = who === "me" ? "bot" : "me"; pc.phase = "throw"; pc.extra = false;
    pc.msg += pc.turn === "me" ? " Your throw." : " Your rival's throw.";
    pcDraw(); pcSync();
    if (pc.turn === "bot") pc.timer = setTimeout(() => pcRoll("bot"), 1000);
  }
  function openPachisi() {
    if (!pc) { $d("pc-throw").addEventListener("click", pcThrow); $d("pc-new").addEventListener("click", () => { clearTimeout(pc && pc.timer); pcNew(); }); $d("pc-board").addEventListener("click", pcClick); }
    openPanel("#dg-pachisi"); clearTimeout(pc && pc.timer); pcNew();
  }
  function pcClick(e) {
    if (!pc || pc.turn !== "me" || pc.phase !== "pick") return;
    const cv = e.currentTarget, r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 340, y = ((e.clientY - r.top) / r.height) * 340;
    let best = null, bd = 22;
    for (const i of pc.movable) { const [px, py] = pcPoint("me", pc.pawns.me[i], i), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } }
    if (best !== null) pcMove("me", best);
  }

  // ------------------------------------------------------------------ 7. bazaar trader

  const GOODS = [{ id: "spice", name: "Spices", base: 10 }, { id: "silk", name: "Silk", base: 30 }, { id: "indigo", name: "Indigo", base: 20 }, { id: "jewels", name: "Jewels", base: 60 }, { id: "attar", name: "Attar (perfume)", base: 40 }];
  const BAZAARS = [{ id: "urdu", name: "Urdu Bazaar", cheap: ["silk"] }, { id: "johri", name: "Johri Bazaar", cheap: ["jewels", "attar"] }, { id: "katra", name: "Katra Neel", cheap: ["indigo"] }, { id: "fateh", name: "Fatehpuri Bazaar", cheap: ["spice"] }];
  const DAYS = 6, CAP = 20;
  let bz = null;

  function bzPrices() {
    const event = Math.random() < 0.6 ? { good: GOODS[Math.floor(Math.random() * GOODS.length)].id, mul: Math.random() < 0.5 ? 0.7 : 1.4 } : null;
    bz.event = event;
    bz.prices = {};
    for (const b of BAZAARS) { bz.prices[b.id] = {}; for (const g of GOODS) { let m = b.cheap.includes(g.id) ? 0.6 : 0.95 + Math.random() * 0.5; m *= 0.92 + Math.random() * 0.16; if (event && event.good === g.id) m *= event.mul; bz.prices[b.id][g.id] = Math.max(1, Math.round(g.base * m)); } }
  }
  function bzNew() {
    const stake = Math.min(150, Math.floor(Vitals.coins));
    bz = { day: 1, at: "urdu", cash: stake, stake, hold: Object.fromEntries(GOODS.map((g) => [g.id, 0])), prices: {}, event: null, done: false };
    bzPrices(); bzRender();
  }
  const bzCount = () => Object.values(bz.hold).reduce((a, b) => a + b, 0);
  function bzRender() {
    const here = BAZAARS.find((b) => b.id === bz.at), P = bz.prices[bz.at];
    $d("bz-head").textContent = `Day ${bz.day} of ${DAYS} · ${here.name} · cash ${bz.cash} · carrying ${bzCount()} of ${CAP}${bz.event ? ` · News: ${GOODS.find((g) => g.id === bz.event.good).name.split(" ")[0]} ${bz.event.mul < 1 ? "is cheap today" : "is dear today"}` : ""}`;
    const t = $d("bz-table"); t.replaceChildren();
    const head = t.insertRow(); for (const h of ["Goods", "Price", "Have", ""]) { const th = document.createElement("th"); th.textContent = h; head.append(th); }
    for (const g of GOODS) {
      const row = t.insertRow(), price = P[g.id];
      const nm = row.insertCell(); nm.textContent = g.name;
      const pr = row.insertCell(); pr.textContent = price; pr.className = price < g.base * 0.85 ? "down" : price > g.base * 1.15 ? "up" : "";
      row.insertCell().textContent = bz.hold[g.id];
      const act = row.insertCell();
      const btn = (label, fn, dis) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = !!dis || bz.done; b.addEventListener("click", fn); act.append(b); };
      btn("Buy 1", () => bzBuy(g.id, 1), bz.cash < price || bzCount() >= CAP); btn("Buy 5", () => bzBuy(g.id, 5), bz.cash < price * 5 || bzCount() > CAP - 5);
      btn("Sell 1", () => bzSell(g.id, 1), bz.hold[g.id] < 1); btn("Sell all", () => bzSell(g.id, bz.hold[g.id]), bz.hold[g.id] < 1);
    }
    const tr = $d("bz-travel"); tr.replaceChildren();
    for (const b of BAZAARS.filter((x) => x.id !== bz.at)) { const bt = document.createElement("button"); bt.type = "button"; bt.textContent = `Go to ${b.name} (1 day)`; bt.disabled = bz.done || bz.cash < 2; bt.addEventListener("click", () => bzGo(b.id)); tr.append(bt); }
  }
  function bzBuy(id, n) { const p = bz.prices[bz.at][id]; if (bz.cash < p * n || bzCount() + n > CAP) return; bz.cash -= p * n; bz.hold[id] += n; Sfx.play("coin"); bzRender(); }
  function bzSell(id, n) { const p = bz.prices[bz.at][id]; n = Math.min(n, bz.hold[id]); if (n < 1) return; bz.cash += p * n; bz.hold[id] -= n; Sfx.play("coin"); bzRender(); }
  function bzGo(id) { bz.cash -= 2; bz.at = id; bz.day++; if (bz.day > DAYS) { bzFinish(); return; } bzPrices(); bzRender(); }
  function bzFinish() {
    if (bz.done) return;
    for (const g of GOODS) bz.cash += bz.hold[g.id] * bz.prices[bz.at][g.id]; // whatever you still carry is sold at today's price
    bz.done = true;
    const profit = bz.cash - bz.stake;
    Vitals.coins = Math.max(0, Vitals.coins + (profit > 0 ? profit : -Math.min(bz.stake, -profit)));
    closePanels();
    showResult(profit > 0 ? "A profitable trip!" : profit === 0 ? "You broke even" : "A losing trip", `You started with ${bz.stake} denarii and ended with ${bz.cash}: ${profit >= 0 ? "+" : ""}${profit} denarii.`, [
      { label: "Trade again", fn: () => { closePanels(); openBazaar(); } }, { label: "More games", fn: () => { closePanels(); open(); } }, { label: "Back to Delhi", fn: closePanels },
    ]);
  }
  function openBazaar() {
    if (Vitals.coins < 20) { toast("You need at least 20 denarii to trade."); return; }
    if (!document.getElementById("bz-end").dataset.bound) { $d("bz-end").dataset.bound = "1"; $d("bz-end").addEventListener("click", () => bz && bzFinish()); }
    openPanel("#dg-bazaar"); bzNew();
  }


  return { get game() { return game; }, key, playHere, init, open, play, update, camera, stop, fire, tickRun, GAMES, get active() { return !!game || !!runGame; }, get running() { return !!runGame; }, bumped: () => { if (runGame) runGame.bump(); } };
})();
