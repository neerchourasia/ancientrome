"use strict";
// Chariot race in the Circus Maximus: three laps around the spina against the four racing factions.

const inCircusTrack = (x, z) => Math.abs(x + 230) < 48 && z > 132 && z < 735;

const Race = (() => {
  const CX = -230, MIDZ = 430, R0 = 22, LS = 340, LAPS = 3;
  const ZN = MIDZ - LS / 2, ZS = MIDZ + LS / 2;
  const ARC = Math.PI * R0, LEN = 2 * LS + 2 * ARC;
  const VMAX = 27, LAT = 16, D_MIN = -16, D_MAX = 26;
  const CRASH_T = 1.4; // seconds a chariot stays slowed after a collision

  const TEAMS = [
    { name: "Greens", color: 0x2f8f4a, skill: 1 },
    { name: "Blues", color: 0x2c5fb0, skill: 0.92 },
    { name: "Reds", color: 0xc23a2f, skill: 0.94 },
    { name: "Whites", color: 0xeeeeee, skill: 0.9 },
  ];
  const START_D = [10, -8, 2, 20];
  // Nine speed levels (keys 1-9): share of top speed, and stamina change per second (negative = the horses recover).
  const PACES = [
    { name: "Walk", speed: 0.15, tire: -6 },
    { name: "Slow walk", speed: 0.28, tire: -4.5 },
    { name: "Trot", speed: 0.4, tire: -3 },
    { name: "Fast trot", speed: 0.52, tire: -1.5 },
    { name: "Slow canter", speed: 0.64, tire: -0.3 },
    { name: "Canter", speed: 0.76, tire: 0.2 },
    { name: "Fast canter", speed: 0.86, tire: 0.7 },
    { name: "Run", speed: 0.94, tire: 1.7 },
    { name: "Gallop", speed: 1.0, tire: 2.8 },
  ];
  const LANE = 6; // width of a lane hop
  const CAM_NAMES = ["Chase", "High", "Driver", "Overhead"];
  let camMode = 0, keysRef = new Set();

  let scene, active = false, state = "idle", t = 0, elapsed = 0, endT = 0, camYaw = 0;
  let cars = [], me = null, msgTimer, watching = false, entryFee = 0; // entryFee: what you paid this race (your class can lower it)
  const el = (id) => document.getElementById(id);

  // ---------- track geometry ----------
  // Cars follow a loop around the spina: south on the east side, north on the west side.
  // `s` is distance along the loop centre-line, `d` is the offset away from the spina.

  function pathAt(s, d) {
    s = ((s % LEN) + LEN) % LEN;
    if (s < LS) return { x: CX + R0 + d, z: ZN + s, dx: 0, dz: 1, turn: false };
    if (s < LS + ARC) { const a = (s - LS) / R0, R = R0 + d; return { x: CX + R * Math.cos(a), z: ZS + R * Math.sin(a), dx: -Math.sin(a), dz: Math.cos(a), turn: true }; }
    if (s < 2 * LS + ARC) return { x: CX - R0 - d, z: ZS - (s - LS - ARC), dx: 0, dz: -1, turn: false };
    const a = (s - 2 * LS - ARC) / R0, R = R0 + d;
    return { x: CX - R * Math.cos(a), z: ZN - R * Math.sin(a), dx: Math.sin(a), dz: -Math.cos(a), turn: true };
  }

  // ---------- models ----------

  function makeChariot(team) {
    const g = new THREE.Group();
    const wood = lambert(0x8a5a2b), dark = lambert(0x3a2a1c), tc = lambert(team.color), skin = lambert(0xc9956b);
    const box = (w, h, d, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    box(1.7, 0.14, 1.5, wood, 0, 0.62, 0);
    box(1.7, 0.7, 0.1, tc, 0, 1.0, 0.72);
    box(0.1, 0.6, 1.4, tc, -0.85, 0.98, 0);
    box(0.1, 0.6, 1.4, tc, 0.85, 0.98, 0);
    box(0.1, 0.1, 3.6, wood, 0, 0.7, 2.2);
    box(3.6, 0.08, 0.1, wood, 0, 1.55, 3.9);
    const wheels = [];
    for (const sx of [-1.02, 1.02]) {
      const w = new THREE.Group();
      w.position.set(sx, 0.62, 0);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 14), wood);
      disc.rotation.z = Math.PI / 2; disc.castShadow = true;
      w.add(disc);
      box(0.16, 1.1, 0.1, dark, 0, 0, 0, w);
      box(0.16, 0.1, 1.1, dark, 0, 0, 0, w);
      g.add(w); wheels.push(w);
    }
    // charioteer
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.85, 8), tc);
    body.position.set(0, 1.2, -0.1); body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), skin);
    head.position.set(0, 1.85, -0.1); g.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), tc);
    cap.position.set(0, 1.9, -0.1); g.add(cap);
    // four horses abreast
    const horses = [];
    const coats = [0x5a3a22, 0x2b211a, 0x8a6a48, 0xc8b89a];
    [-2.4, -0.8, 0.8, 2.4].forEach((hx, i) => {
      const h = new THREE.Group();
      h.position.set(hx, 0, 5.0);
      const coat = lambert(coats[(i + team.color) % coats.length]);
      box(0.75, 0.85, 2.1, coat, 0, 1.4, 0, h);
      const neck = box(0.35, 0.9, 0.4, coat, 0, 1.95, 1.1, h); neck.rotation.x = 0.5;
      box(0.3, 0.32, 0.72, coat, 0, 2.35, 1.5, h);
      box(0.1, 0.5, 0.12, dark, 0, 1.9, -1.1, h);
      box(0.8, 0.12, 0.9, tc, 0, 1.87, 0.1, h);
      const legs = [];
      for (const [lx, lz] of [[-0.24, 0.85], [0.24, 0.85], [-0.24, -0.85], [0.24, -0.85]]) {
        const leg = new THREE.Group();
        leg.position.set(lx, 1.0, lz);
        box(0.16, 1.0, 0.16, coat, 0, -0.5, 0, leg);
        h.add(leg); legs.push(leg);
      }
      g.add(h); horses.push({ h, legs });
    });
    g.traverse((c) => { c.frustumCulled = false; });
    return { g, wheels, horses };
  }

  // ---------- flow ----------

  function msg(text, ms = 1200) {
    const m = el("center-msg");
    m.textContent = text;
    m.classList.add("show");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove("show"), ms);
  }

  function init(sc) { scene = sc; }

  // `opts.watch`: all four chariots are AI and the player spectates from the stands.
  function start(opts = {}) {
    if (active) return;
    watching = !!opts.watch;
    if (!watching) { // racing costs money, and needs rested horses
      if (!Vitals.canRace()) { toast(`The horses are too tired to race (${Math.round(Vitals.horses)}/100). Rest at the Circus stables with Z.`); return; }
      entryFee = Math.round(Vitals.RACE_ENTRY * Character.mod("fee"));
      if (Vitals.coins < entryFee) { toast(`The entry fee is ${entryFee} denarii and you only have ${Vitals.coins}. Win some fights first.`); return; }
      Vitals.coins -= entryFee;
    }
    active = true; mode = watching ? "watch" : "race"; state = "countdown"; t = 3.2; elapsed = 0;
    for (const c of cars) scene.remove(c.model.g);
    cars = TEAMS.map((team, i) => ({
      skill: team.skill + (Math.random() - 0.5) * 0.03, // each race the rivals are a little different
      restAt: 17 + Math.random() * 12, resumeAt: 46 + Math.random() * 18, // each rival tires and recovers at its own points
      aggressive: i !== 0 && Math.random() < 0.2, // only the occasional rival tries to block you
      team, model: makeChariot(team), player: !watching && i === 0, s: 0, d: START_D[i], v: 0, phase: 0,
      whip: 0, stam: 100, laneGoal: START_D[i], laneT: 1 + Math.random() * 2, finished: false, finishT: 0, bump: 0, yaw: 0,
      slowT: 0, hitCd: 0, shake: 0, pace: 7, horse: 100, tired: false, cruise: false, sv: 0, pd: START_D[i], lean: 0, pathYaw: 0, hopTo: null,
    }));
    me = watching ? null : cars[0];
    if (me) { me.horse = Vitals.horses; me.tired = me.horse < 10; } // the horses start as tired as they are
    for (const c of cars) { scene.add(c.model.g); place(c); }
    camYaw = cars[0].yaw;
    const hud = el("race-hud");
    hud.classList.add("show");
    hud.classList.toggle("watching", watching);
    Crowd.setCheer(true);
    closePanels();
    updateHud();
  }

  function stop(title, text) {
    if (!active) return;
    // Racing wears the horses out, and finishing a race takes even more out of them.
    if (!watching && me) Vitals.horses = Math.max(5, me.horse - (me.finished ? 12 : 0));
    active = false; state = "idle";
    mode = watching ? "watch" : "walk"; // Watch decides what happens after a spectated race
    for (const c of cars) scene.remove(c.model.g);
    cars = [];
    el("race-hud").classList.remove("show");
    el("flash").style.opacity = 0;
    el("countdown").classList.remove("show");
    if (!watching) Crowd.setCheer(false);
    camera.fov = 70; camera.updateProjectionMatrix();
    if (watching) return;
    placeAt(CX + 30, ZN - 60, Math.PI); // back on foot near the start, facing south
    if (title) showResult(title, text, [
      { label: "Race again", fn: () => { closePanels(); start(); } },
      { label: "Leave the circus", fn: closePanels },
    ]);
    else msg("You leave the race.", 1400);
  }

  function place(c) {
    const p = pathAt(c.s, c.d);
    c.model.g.position.set(p.x, 0.05, p.z);
    c.yaw = c.pathYaw = Math.atan2(p.dx, p.dz);
    c.model.g.rotation.y = c.yaw;
  }

  const lapOf = (c) => Math.min(LAPS, Math.floor(c.s / LEN) + 1);
  const ranking = () => [...cars].sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.s - a.s));

  // ---------- physics ----------

  function whip() {
    if (!active || !me || state !== "race" || me.finished || me.stam < 25 || me.whip > 0) return;
    me.whip = 1.2; me.stam -= 25;
    Sfx.play("whip");
  }

  // ---------- player controls beyond gas, brake and steer ----------

  // Speed level 1-9. Higher levels are faster but tire the horses.
  function setPace(n) {
    if (!active || !me || n < 1 || n > PACES.length || n === me.pace) return;
    me.pace = n;
    me.cruise = true; // a level key holds that speed without keeping W down; S or X cancels it
    msg(`Speed ${n}/${PACES.length}: ${PACES[n - 1].name}`, 800);
  }

  function toggleCruise() {
    if (!active || !me) return;
    me.cruise = !me.cruise;
    msg(me.cruise ? "Cruise on: the horses hold your pace" : "Cruise off: hold W to go", 1200);
  }

  // Q/E: hop one lane to the left (outward) or right (inward).
  function hop(dir) {
    if (!active || !me || state !== "race") return;
    const to = Math.max(D_MIN, Math.min(D_MAX, (me.hopTo ?? me.d) + (dir < 0 ? -LANE : LANE) * -1));
    me.hopTo = to;
  }

  function cycleCamera() {
    camMode = (camMode + 1) % CAM_NAMES.length;
    msg(`Camera: ${CAM_NAMES[camMode]}`, 900);
  }

  function stepCar(c, dt, keys) {
    const p = pathAt(c.s, c.d);
    let target = VMAX * c.skill, accel = 9, steer = 0;

    if (c.player) {
      const gas = keys.has("KeyW") || keys.has("ArrowUp") || c.cruise, brake = keys.has("KeyS") || keys.has("ArrowDown");
      steer = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      // exhausted horses can't go faster than a fast trot until they have recovered
      const pace = PACES[(c.tired ? Math.min(c.pace, 4) : c.pace) - 1];
      target = gas ? VMAX * pace.speed * Character.mod("racespeed") : 0;
      if (brake) { c.v = Math.max(0, c.v - 26 * dt); c.cruise = false; }
      if (state === "race") {
        c.horse = Math.max(0, Math.min(100, c.horse - PACES[c.pace - 1].tire * Character.mod("tire") * (c.v > 3 ? 1 : 0) * dt + (c.v <= 3 ? 8 * dt : 0)));
        if (!c.tired && c.horse < 10) { c.tired = true; msg("The horses are exhausted! Slow down to let them recover", 2000); }
        else if (c.tired && c.horse > 35) { c.tired = false; msg("The horses have recovered", 1200); }
      }
      c.stam = Math.min(100, c.stam + 7 * dt);
    } else {
      // The rivals' horses tire and recover too: they gallop while fresh, ease off as they wear out, and rest when spent.
      if (c.horse < c.restAt) c.resting = true; else if (c.horse > c.resumeAt) c.resting = false;
      if (!c.tired && c.horse < 8) c.tired = true; else if (c.tired && c.horse > 30) c.tired = false;
      let level = c.resting ? 3 : c.horse > 45 ? 9 : 7;
      if (c.tired) level = Math.min(level, 3);
      c.aiLevel = level;
      target = VMAX * c.skill * PACES[level - 1].speed;
      if (state === "race") c.horse = Math.max(0, Math.min(100, c.horse - PACES[level - 1].tire * (c.v > 3 ? 1 : 0) * dt + (c.v <= 3 ? 8 * dt : 0)));
      // AI: keep to a chosen lane, dodge cars ahead, rubber-band gently
      c.laneT -= dt;
      if (c.laneT <= 0) { c.laneT = 3 + Math.random() * 5; c.laneGoal = -9 + Math.random() * 22; }
      for (const o of cars) {
        if (o === c) continue;
        const ahead = o.s - c.s;
        if (ahead > 0 && ahead < 14 && Math.abs(o.d - c.d) < 3.6) {
          c.laneGoal = Math.max(D_MIN + 1, Math.min(D_MAX - 1, o.d + (c.d >= o.d ? 5 : -5)));
          c.laneT = 1.5;
          if (ahead < 6) target = Math.min(target, o.v);
        }
      }
      if (me && !me.finished && c.aggressive && Math.abs(c.s - me.s) < 28 && !c.finished) {
        c.laneGoal = Math.max(D_MIN + 1, Math.min(D_MAX - 1, me.d + (c.d >= me.d ? 2.2 : -2.2)));
        c.laneT = 0.6;
      }
      const gap = me ? Math.max(-1, Math.min(1, (me.s - c.s) / 400)) : 0;
      target *= 1 + gap * 0.05;
      const dd = c.laneGoal - c.d;
      c.d += Math.sign(dd) * Math.min(Math.abs(dd), 7 * dt);
    }

    if (c.whip > 0) { c.whip -= dt; target += 7; accel = 16; }
    // after a collision the horses are thrown off stride: reduced top speed that recovers over a couple of seconds
    c.slowT = Math.max(0, c.slowT - dt); c.hitCd = Math.max(0, c.hitCd - dt);
    if (c.slowT > 0) { const k = 0.5 + 0.5 * (1 - c.slowT / CRASH_T); target *= k; accel *= 0.6; }
    if (state === "countdown") { c.v = 0; return; }
    if (c.finished) target = Math.min(target, 14);

    if (c.v < target) c.v = Math.min(target, c.v + accel * dt);
    else c.v = Math.max(target, c.v - 3 * dt);

    if (c.player) {
      // Steering ramps up the longer you hold it (smooth, analog feel). Shift = fine steering.
      const fine = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 0.45 : 1;
      const maxRate = (7 + c.v * 0.3) * fine;
      if (steer !== 0) c.hopTo = null;
      c.steerAmt = (c.steerAmt || 0) + ((steer * 1) - (c.steerAmt || 0)) * Math.min(1, dt * (steer !== 0 ? 5 : 9));
      let move = -c.steerAmt * maxRate * dt; // steering right moves toward the spina (d decreases)
      if (c.hopTo !== null) {
        const dd = c.hopTo - c.d;
        move = Math.sign(dd) * Math.min(Math.abs(dd), 15 * dt);
        if (Math.abs(dd) < 0.05) c.hopTo = null;
      }
      c.d += move;
    }
    const raw = c.d;
    c.d = Math.max(D_MIN, Math.min(D_MAX, c.d));
    if (raw !== c.d && c.v > 2) { // scraping the spina or the stands
      c.v *= 1 - Math.min(1, 1.1 * dt);
      c.slowT = Math.max(c.slowT, 0.6);
      if (c.player && c.bump <= 0) { c.bump = 0.8; c.shake = Math.max(c.shake, 0.4); Vitals.hp = Math.max(5, Vitals.hp - 1.5); msg("Scraping the wall!", 600); }
    }

    // corners cap speed: tight inside lanes are slow, wide outside lanes are fast
    if (p.turn) {
      // The tightest lane is slow (the horses can't turn that sharply), so the best line is the middle of the track.
      const R = R0 + c.d, cap = 0.85 * R * (0.4 + 0.6 * Math.min(1, R / R0));
      if (c.v > cap) c.v -= (c.v - cap) * Math.min(1, dt * 14); // slows almost at once, so a tight line can't carry full speed
    }
    c.s += c.v * dt * (p.turn ? R0 / (R0 + c.d) : 1);
    c.phase += c.v * dt * 1.6;
    c.bump = Math.max(0, c.bump - dt);
  }

  function collisions(dt) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const pa = pathAt(a.s, a.d), pb = pathAt(b.s, b.d);
        const dist = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        if (dist > 4.2) continue;
        const push = (4.2 - dist) * 0.5 + 0.02;
        const dir = a.d === b.d ? (i % 2 ? 1 : -1) : Math.sign(a.d - b.d);
        a.d = Math.max(D_MIN, Math.min(D_MAX, a.d + dir * push));
        b.d = Math.max(D_MIN, Math.min(D_MAX, b.d - dir * push));
        const rear = a.s < b.s ? a : b;
        rear.v = Math.max(0, rear.v - 14 * dt);
        // impact: both chariots lose speed (the one hit from behind loses the most) and are slowed for a moment
        for (const x of [a, b]) {
          if (x.hitCd > 0) continue;
          x.v *= x === rear ? 0.6 : 0.8;
          if (x.player) Sfx.play("crash");
          x.slowT = CRASH_T; x.hitCd = 0.9;
          if (x.player) { x.shake = 0.7; el("flash").style.opacity = 0.35; Vitals.hp = Math.max(5, Vitals.hp - 6); msg("Collision! You lose speed and are bruised", 900); }
        }
      }
    }
  }

  // ---------- per-frame ----------

  function update(dt, keys) {
    if (!active) return;
    keysRef = keys;
    if (state === "countdown") {
      t -= dt;
      const n = Math.ceil(t - 0.2);
      const cd = el("countdown");
      const label = t > 0.2 ? String(n) : "GO!";
      if (label !== cd.textContent) Sfx.play(label === "GO!" ? "horn" : "beep");
      cd.textContent = label;
      cd.classList.add("show");
      if (t <= 0) { state = "race"; setTimeout(() => el("countdown").classList.remove("show"), 700); }
    } else if (state === "race" || state === "ending") {
      elapsed += dt;
    }

    for (const c of cars) stepCar(c, dt, keys);
    if (state !== "countdown") collisions(dt);

    for (const c of cars) {
      if (!c.finished && c.s >= LAPS * LEN) {
        c.finished = true; c.finishT = elapsed;
        if (c === me && state === "race") { state = "ending"; endT = 2.2; msg("Finish!", 1800); Sfx.play("horn"); Sfx.play("cheer"); }
        else if (!watching && c !== me && state === "race") { state = "ending"; endT = 3; msg(`The ${c.team.name} win the race!`, 3000); Sfx.play("horn"); }
        else if (watching && state === "race") { state = "ending"; endT = 3.5; msg(`The ${c.team.name} win!`, 3000); }
      }
      // visuals
      const p = pathAt(c.s, c.d);
      const pathYaw = Math.atan2(p.dx, p.dz);
      // point slightly into a lane change, so steering is visible
      const sv = dt > 0 ? (c.d - c.pd) / dt : 0;
      c.pd = c.d;
      c.sv += (sv - c.sv) * Math.min(1, dt * 8);
      const lean = Math.max(-0.3, Math.min(0.3, (c.sv / Math.max(c.v, 6)) * 0.9));
      c.pathYaw += angDiff(c.pathYaw, pathYaw) * Math.min(1, dt * 10);
      c.yaw += angDiff(c.yaw, pathYaw + lean) * Math.min(1, dt * 10);
      c.model.g.position.set(p.x, 0.05 + Math.sin(c.phase * 2) * 0.02, p.z);
      c.model.g.rotation.y = c.yaw;
      for (const w of c.model.wheels) w.rotation.x = c.phase * 1.2;
      c.model.horses.forEach((hs, i) => {
        hs.h.position.y = Math.abs(Math.sin(c.phase * 1.4 + i)) * 0.12 * Math.min(1, c.v / 10);
        hs.legs.forEach((leg, k) => { leg.rotation.x = Math.sin(c.phase * 1.4 + i * 0.7 + (k % 2 ? Math.PI : 0) + (k > 1 ? 1.2 : 0)) * 0.7 * Math.min(1, c.v / 8); });
      });
    }

    if (me) {
      player.x = me.model.g.position.x; player.z = me.model.g.position.z; player.feet = 0;
      me.shake = Math.max(0, me.shake - dt * 1.4);
      const f = el("flash");
      f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.2);
    }
    updateHud();

    if (state === "ending") {
      endT -= dt;
      if (endT <= 0) { if (watching) stop(); else finish(); }
    }
  }

  function finish() {
    const rank = ranking().indexOf(me) + 1;
    const ords = ["", "1st", "2nd", "3rd", "4th"];
    const won = rank === 1;
    const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const time = me.finished ? fmt(me.finishT) : null;
    const leader = ranking()[0];
    const prize = Math.round((rank === 1 ? 100 : rank === 2 ? 40 : 0) * Character.mod("coin")); // only the top two are paid
    Vitals.coins += prize;
    const money = prize
      ? ` Prize: +${prize} denarii (after the ${entryFee} denarii entry fee).`
      : ` No prize: you lose your ${entryFee} denarii entry fee.`;
    const tired = " Your horses are worn out, so rest them at the stables with Z.";
    stop(
      won ? "Victory in the Circus!" : `You finished ${ords[rank]}${rank > 2 ? ": you lose the race" : ""}`,
      (won
        ? `You drove the Greens to victory in ${time}. The crowd showers you with cheers, and the winning charioteer receives a palm branch and prize money. The star Diocles won 1,462 races over a career of 24 years.`
        : `${time ? `Finished in ${time}.` : `The ${leader.team.name} won in ${fmt(leader.finishT)} while you were still on the track.`} Real races were 7 laps of the track and could be brutal, with crashes (naufragia, or 'shipwrecks') a common sight. Try a wider lane in the corners, and save your whip for the straights.`) + money + tired
    );
  }

  // Chase camera behind `target` (defaults to the player's chariot; spectators follow the leader).
  function camera_(cam, dt, target = me) {
    if (!active || !target) return;
    camYaw += angDiff(camYaw, target.pathYaw) * Math.min(1, dt * 5);
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), p = target.model.g.position;
    const view = target === me ? camMode : 0;
    const dir = target === me && keysRef.has("KeyB") ? -1 : 1; // hold B to look behind you
    if (view === 2) { // driver's eye view
      cam.position.set(p.x - fx * 0.4 * dir, 2.2, p.z - fz * 0.4 * dir);
      cam.lookAt(p.x + fx * 25 * dir, 1.7, p.z + fz * 25 * dir);
    } else if (view === 3) { // overhead
      cam.position.set(p.x - fx * 4, 34, p.z - fz * 4);
      cam.lookAt(p.x + fx * 6, 0, p.z + fz * 6);
    } else {
      const dist = view === 1 ? 17 : 10.5, height = view === 1 ? 9.5 : 4.8;
      cam.position.set(p.x - fx * dist * dir, height, p.z - fz * dist * dir);
      cam.lookAt(p.x + fx * 9 * dir, 1.6, p.z + fz * 9 * dir);
    }
    if (target === me && me.shake > 0) { // camera shake after a collision
      cam.position.x += (Math.random() - 0.5) * me.shake * 0.8;
      cam.position.y += (Math.random() - 0.5) * me.shake * 0.6;
      cam.position.z += (Math.random() - 0.5) * me.shake * 0.8;
    }
    const fov = 70 + Math.min(14, target.v * 0.45);
    if (Math.abs(cam.fov - fov) > 0.3) { cam.fov += (fov - cam.fov) * 0.1; cam.updateProjectionMatrix(); }
  }

  function updateHud() {
    const order = ranking(), focus = me || order[0];
    if (me) {
      el("race-pace").textContent = `Speed ${me.pace}/${PACES.length}: ${PACES[me.pace - 1].name}${me.cruise ? " (cruise)" : ""}${me.tired ? " (tired)" : ""}${me.slowT > 0 ? " (SLOWED)" : ""} · ${CAM_NAMES[camMode]} cam`;
      el("race-horse").style.width = `${me.horse}%`;
      el("race-horse").style.background = me.tired ? "#c0392b" : me.horse < 35 ? "#e2b955" : "#3aa557";
    }
    el("race-lap").textContent = `Lap ${lapOf(focus)} / ${LAPS}`;
    el("race-speed").textContent = `${Math.round(focus.v * 3.6)} km/h`;
    if (me) {
      el("race-pos").textContent = `${["1st", "2nd", "3rd", "4th"][order.indexOf(me)]} of ${cars.length}`;
      el("race-stam").style.width = `${me.stam}%`;
    } else el("race-pos").textContent = "Spectating";
    el("race-order").innerHTML = order.map((c, i) => `<li><span class="sw" style="background:#${c.team.color.toString(16).padStart(6, "0")}"></span>${i + 1}. ${c.team.name}${c.player ? " (you)" : ""}${!c.player && c.resting ? " (resting)" : ""}</li>`).join("");
  }

  return { init, start, stop: () => stop(), update, whip, setPace, toggleCruise, hop, cycleCamera, camera: camera_, leader: () => ranking()[0], speed: () => (me ? me.v : 0), get active() { return active; }, debug: () => ({ state, LEN, LAPS, cars }) };
})();
