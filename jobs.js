"use strict";
// Jobs in the hypogeum, the cellars beneath the Colosseum arena (Ancient Rome only). Go down the stairs by the west gate
// and take a shift for the lanista's foreman: turn the capstan that raises the lifts (A and D), feed the beasts in their cages
// (1 to 4) or hoist the scenery into place (Space). Pay is in denarii, and the more shifts you work the higher your rank and pay.
// A shift costs a little health. Depends on world.js, physics.js, game.js, vitals.js and tax.js (Speech) at run time.

const Jobs = (() => {
  const T = THREE;
  const BOXG = new T.BoxGeometry(1, 1, 1), CYLG = new T.CylinderGeometry(1, 1, 1, 14);
  const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  const KEY = "rome-jobs";
  const H = { x: -500, z: -480 };                 // the middle of the hypogeum hall (a sealed hall of its own, reached by the stairs)
  const DOOR = { x: 318, z: 58 };                 // where you stand at the stair-house by the Colosseum's west gate
  const ERA = { era: "ancient" };
  const RANKS = [
    { at: 0, name: "Hand", mul: 1 },
    { at: 4, name: "Journeyman", mul: 1.2 },
    { at: 12, name: "Foreman", mul: 1.45 },
    { at: 28, name: "Master of the Hypogeum", mul: 1.8 },
  ];
  const SHIFT = 40, HP_COST = 8, MIN_HP = 25;
  const JOBS = {
    capstan: { name: "Winch crew", base: 30, icon: "⚙", text: "Push the capstan round to raise the lifts. Tap A and D one after the other, never the same key twice. Keep the speed bar in the green." },
    keeper: { name: "Beast keeper", base: 40, icon: "🦁", text: "The beasts get hungry in turn. When a cage lights up, press its number (1 to 4) quickly to throw it meat." },
    props: { name: "Scenery crew", base: 35, icon: "🏛", text: "Hoist the painted scenery up to the arena. Press Space when the marker is inside the green. Ten hoists to a shift." },
  };
  const BEASTS = [["🦁", "Lion"], ["🐻", "Bear"], ["🐆", "Leopard"], ["🐗", "Boar"]];

  let s = { shifts: 0, earned: 0 };
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && Number.isFinite(r.shifts)) s = { shifts: Math.max(0, r.shifts | 0), earned: Math.max(0, r.earned | 0) }; } catch (e) { /* ignore */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const rank = () => { let r = RANKS[0]; for (const x of RANKS) if (s.shifts >= x.at) r = x; return r; };
  const nextRank = () => RANKS.find((x) => x.at > s.shifts) || null;
  const $j = (id) => document.getElementById(id);

  const SPOTS = [
    { kind: "enter", x: DOOR.x, z: DOOR.z, r: 3.6, text: "F: go down to the hypogeum and look for work" },
    { kind: "exit", x: H.x - 29, z: H.z + 19, r: 3.4, text: "F: climb the stairs up to the Colosseum" },
    { kind: "capstan", x: H.x - 14, z: H.z + 6, r: 4.5, text: "F: take a shift on the winch crew" },
    { kind: "keeper", x: H.x, z: H.z - 13, r: 8, text: "F: take a shift as beast keeper" },
    { kind: "props", x: H.x + 24, z: H.z + 11, r: 4.5, text: "F: take a shift on the scenery crew" },
  ];
  let hall = null, house = null, foreman = null, spin = null, backPos = null, greetT = 0, clock = 0;

  // ---------------------------------------------------------------- building

  function box(g, x, y0, z, w, h, d, mat, solid) {
    const m = new T.Mesh(BOXG, mat); m.scale.set(w, h, d); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (solid) addBlockerBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, y0 + h, ERA);
    return m;
  }
  function cyl(g, x, y0, z, r, h, mat, solid) {
    const m = new T.Mesh(CYLG, mat); m.scale.set(r, h, r); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (solid) addBlockerCircle(x, z, r, y0, y0 + h, ERA);
    return m;
  }
  function sign(g, x, y, z, w, h, text, sub, rotY = 0) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 80;
    const k = c.getContext("2d");
    k.fillStyle = "#3a2a1a"; k.fillRect(0, 0, 256, 80); k.strokeStyle = "#f2d98a"; k.lineWidth = 4; k.strokeRect(4, 4, 248, 72);
    k.fillStyle = "#f2d98a"; k.textAlign = "center"; k.textBaseline = "middle"; k.font = "bold 32px sans-serif"; k.fillText(text, 128, 30); k.font = "bold 18px sans-serif"; k.fillText(sub, 128, 58);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: new T.CanvasTexture(c), side: T.DoubleSide, emissive: 0x2a2010 }));
    m.position.set(x, y, z); m.rotation.y = rotY; g.add(m);
  }
  function person(g, x, z, robe) {
    const p = new T.Group(); p.position.set(x, 0, z); g.add(p);
    cyl(p, 0, 0, 0, 0.36, 1.2, lam(robe)); cyl(p, 0, 1.2, 0, 0.3, 0.45, lam(robe));
    const head = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), lam(0xc99a70)); head.position.set(0, 2.0, 0); head.castShadow = true; p.add(head);
    return p;
  }
  const torch = (g, x, z, light) => {
    cyl(g, x, 0, z, 0.12, 2.4, lam(0x4a3a2a));
    const f = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), new T.MeshBasicMaterial({ color: 0xffb347 })); f.position.set(x, 2.7, z); g.add(f);
    if (light) { const l = new T.PointLight(0xffb060, 2.2, 46, 1.2); l.position.set(x, 3, z); g.add(l); }
  };

  function build(scene) {
    // the stair-house outside the west gate: a stone doorway going down, with a sign
    house = new T.Group(); scene.add(house);
    const stone = lam(0xb9a98a), dark = lam(0x2a241d);
    box(house, DOOR.x, 0, DOOR.z + 5, 11, 4.2, 7, stone, true);
    box(house, DOOR.x, 0, DOOR.z + 1.45, 3.2, 3.2, 0.2, dark);                  // the dark doorway
    for (const sx of [-1, 1]) box(house, DOOR.x + sx * 2.2, 0, DOOR.z + 1.4, 0.7, 3.8, 0.7, lam(0xd8c9a8), true);
    box(house, DOOR.x, 3.4, DOOR.z + 1.4, 5.4, 0.7, 0.8, lam(0xd8c9a8));
    sign(house, DOOR.x, 5.4, DOOR.z + 1.3, 5, 1.25, "HYPOGEUM", "work wanted", Math.PI);
    torch(house, DOOR.x - 3.2, DOOR.z + 0.6); torch(house, DOOR.x + 3.2, DOOR.z + 0.6);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: DOOR.x - 5.5, x1: DOOR.x + 5.5, z0: DOOR.z + 1.5, z1: DOOR.z + 8.5, c: "#8a7a62" });

    // the hall: a long stone room with a roof, pillars, torches and three workplaces
    hall = new T.Group(); scene.add(hall);
    const W = 72, D = 48, x0 = H.x - W / 2, x1 = H.x + W / 2, z0 = H.z - D / 2, z1 = H.z + D / 2, wall = lam(0x6b6256), floorM = lam(0x4a4338);
    const floor = new T.Mesh(new T.PlaneGeometry(W, D), floorM); floor.rotation.x = -Math.PI / 2; floor.position.set(H.x, 0.05, H.z); floor.receiveShadow = true; hall.add(floor);
    box(hall, H.x, 0, z0, W + 1.2, 7, 1.2, wall, true); box(hall, H.x, 0, z1, W + 1.2, 7, 1.2, wall, true);
    box(hall, x0, 0, H.z, 1.2, 7, D, wall, true); box(hall, x1, 0, H.z, 1.2, 7, D, wall, true);
    const roof = box(hall, H.x, 7, H.z, W + 2, 0.8, D + 2, lam(0x3a352c), false);
    for (let i = -3; i <= 3; i++) for (const sz of [-1, 1]) cyl(hall, H.x + i * 10, 0, H.z + sz * 9, 0.9, 7, lam(0x8a8272), true);
    torch(hall, x0 + 3, z0 + 3, true); torch(hall, x1 - 3, z0 + 3, true); torch(hall, x0 + 3, z1 - 3, true); torch(hall, x1 - 3, z1 - 3, true); torch(hall, H.x, H.z, true);
    sign(hall, H.x, 5.2, z0 + 0.8, 8, 1.6, "THE HYPOGEUM", "beneath the arena");
    // the stairs back up, in the south-west corner
    for (let i = 0; i < 5; i++) box(hall, x0 + 3 + i * 1.1, 0, z1 - 3, 1.1, 0.25 + i * 0.35, 4, lam(0x9a9080));
    sign(hall, x0 + 2.5, 3.6, z1 - 1.2, 4, 1, "UP", "to the arena gate", Math.PI);

    // the capstan: a big wooden drum with spokes, and a lift platform beside it
    const cx = H.x - 14, cz = H.z + 3;
    cyl(hall, cx, 0, cz, 1.1, 1.8, lam(0x7a5a34), true);
    spin = new T.Group(); spin.position.set(cx, 1.4, cz); hall.add(spin);
    for (let i = 0; i < 4; i++) { const b = new T.Mesh(BOXG, lam(0x6a4c2a)); b.scale.set(5.6, 0.2, 0.25); b.rotation.y = i * Math.PI / 4; spin.add(b); }
    box(hall, cx + 6.5, 0, cz - 1, 4, 0.3, 4, lam(0x6a4c2a));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(hall, cx + 6.5 + sx * 1.9, 0, cz - 1 + sz * 1.9, 0.14, 5, lam(0x4a3a2a));
    sign(hall, cx, 3.6, cz + 3.4, 4.4, 1.1, "WINCH", "raise the lifts");

    // four cages of beasts along the north wall
    BEASTS.forEach(([, name], i) => {
      const bx = H.x - 15 + i * 10, bz = H.z - 19;
      box(hall, bx, 0, bz, 7, 3.6, 4.4, lam(0x3a2e22), true);
      for (let b = -3; b <= 3; b += 1) box(hall, bx + b * 0.95, 0, bz + 2.3, 0.14, 3.6, 0.14, lam(0x1d1a16));
      box(hall, bx, 3.4, bz + 2.3, 7.2, 0.25, 0.25, lam(0x1d1a16));
      const colors = [0xc9a24a, 0x5a3a22, 0xd9b640, 0x4a3a30];
      box(hall, bx, 0.1, bz + 0.3, 2.2, 1.1, 1.0, lam(colors[i]));
      sign(hall, bx, 4.4, bz + 2.5, 3.2, 0.9, String(i + 1), name);
    });
    // the scenery: crates, a painted flat and a rope hoist
    const px = H.x + 24, pz = H.z + 5;
    for (let i = 0; i < 4; i++) box(hall, px - 3 + i * 1.8, 0, pz + 3.2, 1.5, 1.2 + (i % 2) * 0.6, 1.5, lam(0x8a6a3a), true);
    box(hall, px, 0.6, pz - 2.2, 7, 4.4, 0.3, lam(0xb86a4a));
    box(hall, px - 1.2, 1.4, pz - 2.4, 2.2, 2.2, 0.15, lam(0x2f6b8f)); box(hall, px + 1.8, 2.4, pz - 2.4, 1.6, 1.6, 0.15, lam(0xd9b640));
    cyl(hall, px, 0, pz - 4.5, 0.15, 6, lam(0x4a3a2a));
    sign(hall, px, 6.1, pz + 5.5, 4.4, 1.1, "SCENERY", "for the games");
    // the foreman, and a couple of workers standing about
    foreman = person(hall, H.x - 22, H.z - 6, 0x9a2a2a);
    person(hall, H.x + 11, H.z - 4, 0x6a5a3a); person(hall, H.x + 4, H.z + 12, 0x5a6a4a);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0, x1, z0, z1, c: "#4a4338" });
    setEra(typeof era !== "undefined" && era === "modern");
  }

  // The hypogeum and its door only exist in the ancient city; in Modern Rome the stairs are sealed
  function setEra(modern) {
    if (hall) hall.visible = !modern;
    if (house) house.visible = !modern;
    if (modern && inHall(player.x, player.z)) { leave(true); }
  }
  const inHall = (x, z) => Math.abs(x - H.x) < 38 && Math.abs(z - H.z) < 26;

  // ---------------------------------------------------------------- the stairs

  function arrive(x, z, yaw) {
    player.x = x; player.z = z; player.feet = 0; player.vx = player.vz = 0; player.yaw = yaw;
    if (typeof Nav !== "undefined") Nav.clear();
  }
  function enter() {
    backPos = { x: DOOR.x, z: DOOR.z - 4 };
    arrive(H.x - 22.5, H.z + 17, -Math.PI / 2 + 0.3);
    toast("You go down into the hypogeum. Find the foreman for work.");
    Narrator.say("You go down into the hypogeum, the cellars under the arena.", { interrupt: true });
    greetT = 1.5;
  }
  function leave(silent) {
    const b = backPos || { x: DOOR.x, z: DOOR.z - 4 };
    arrive(b.x, b.z, Math.PI);
    if (!silent) toast("You climb back up into the daylight.");
  }

  // ---------------------------------------------------------------- the shifts

  let game = null; // the shift in progress: { kind, t, score, ... }

  function open(kind) {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    const job = JOBS[kind];
    if (!job) return;
    openPanel("#job");
    game = null;
    $j("job-title").textContent = `${job.icon} ${job.name}`;
    const r = rank(), nx = nextRank();
    $j("job-text").textContent = job.text;
    $j("job-area").replaceChildren();
    $j("job-info").textContent = `Your rank: ${r.name} (pay x${r.mul}). ${nx ? `${nx.at - s.shifts} more shift${nx.at - s.shifts === 1 ? "" : "s"} to become ${nx.name}.` : "You are the best in the hypogeum."} A shift is ${SHIFT} seconds, pays up to ${Math.round(job.base * r.mul)} denarii and costs ${HP_COST} health. Shifts worked: ${s.shifts}.`;
    const ok = Vitals.hp >= MIN_HP;
    const b = $j("job-btns"); b.replaceChildren();
    const start = document.createElement("button"); start.type = "button"; start.textContent = ok ? "Start the shift" : `Too tired (need ${MIN_HP} health)`; start.disabled = !ok;
    start.addEventListener("click", () => begin(kind)); b.append(start);
  }

  function btn(label, fn, cls) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (cls) b.className = cls; b.addEventListener("click", fn); return b; }

  function begin(kind) {
    if (Vitals.hp < MIN_HP) return;
    $j("job-btns").replaceChildren();
    const area = $j("job-area"); area.replaceChildren();
    const hud = document.createElement("p"); hud.className = "dnote"; hud.id = "job-hud"; area.append(hud);
    game = { kind, t: SHIFT, score: 0, n: 0, hud };
    const G = game;
    if (kind === "capstan") {
      G.v = 30; G.last = ""; G.inZone = 0;
      const bar = document.createElement("div"); bar.className = "jb-bar"; bar.innerHTML = '<i class="jb-zone" style="left:42%;width:30%"></i><b class="jb-mark"></b>'; area.append(bar); G.mark = bar.querySelector(".jb-mark");
      const row = document.createElement("div"); row.className = "dbtns";
      row.append(btn("◀ A", () => G.key("a")), btn("D ▶", () => G.key("d"))); area.append(row);
      G.key = (k) => { if (k === G.last) G.v = Math.max(0, G.v - 12); else G.v = Math.min(100, G.v + 9); G.last = k; Sfx.play("bump"); };
      G.step = (dt) => {
        G.v = Math.max(0, G.v * Math.exp(-0.9 * dt) - 3 * dt); // it slows by itself: about 5 to 7 taps a second hold it in the green
        if (G.v >= 42 && G.v <= 72) G.inZone += dt;
        G.mark.style.left = G.v + "%";
        G.score = G.inZone / (SHIFT - G.t || 1);
        if (spin) spin.rotation.y += G.v * 0.02 * dt * 10;
        hud.textContent = `Speed ${Math.round(G.v)}. Time in the green: ${G.inZone.toFixed(0)} s. ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "keeper") {
      G.asks = 0; G.hits = 0; G.cur = -1; G.ttl = 0; G.gap = 0.5; G.cages = [];
      const row = document.createElement("div"); row.className = "jb-cages";
      BEASTS.forEach(([e, name], i) => { const c = btn(`${i + 1}\n${e}`, () => G.key(i), "jb-cage"); c.title = name; row.append(c); G.cages.push(c); });
      area.append(row);
      G.key = (i) => {
        if (G.cur < 0) { G.gap = Math.max(G.gap, 0.6); return; }
        if (i === G.cur) { G.hits++; Sfx.play("coin"); } else { Sfx.play("bump"); }
        G.cur = -1; G.gap = 0.5; G.cages.forEach((c) => c.classList.remove("hungry"));
      };
      G.step = (dt) => {
        if (G.cur >= 0) { G.ttl -= dt; if (G.ttl <= 0) { G.cur = -1; G.gap = 0.4; G.cages.forEach((c) => c.classList.remove("hungry")); } }
        else { G.gap -= dt; if (G.gap <= 0) { G.cur = Math.floor(Math.random() * 4); G.ttl = 2.0; G.asks++; G.cages[G.cur].classList.add("hungry"); } }
        G.score = G.asks ? G.hits / G.asks : 0;
        hud.textContent = `Fed ${G.hits} of ${G.asks}. ${Math.ceil(G.t)} s left.`;
      };
    } else {
      G.hoists = 0; G.hits = 0; G.pos = 0; G.dir = 1; G.zone = 0.4;
      const bar = document.createElement("div"); bar.className = "jb-bar"; bar.innerHTML = '<i class="jb-zone"></i><b class="jb-mark"></b>'; area.append(bar);
      G.mark = bar.querySelector(".jb-mark"); G.zoneEl = bar.querySelector(".jb-zone");
      const place = () => { G.zone = 0.1 + Math.random() * 0.6; G.zoneEl.style.left = G.zone * 100 + "%"; G.zoneEl.style.width = (22 - Math.min(8, s.shifts * 0.3)) + "%"; G.zw = (22 - Math.min(8, s.shifts * 0.3)) / 100; };
      place();
      const row = document.createElement("div"); row.className = "dbtns"; row.append(btn("Hoist! (Space)", () => G.key())); area.append(row);
      G.key = () => {
        if (G.hoists >= 10) return;
        G.hoists++;
        if (G.pos >= G.zone && G.pos <= G.zone + G.zw) { G.hits++; Sfx.play("coin"); } else Sfx.play("bump");
        if (G.hoists >= 10) { G.t = Math.min(G.t, 0.3); } else place();
      };
      G.step = (dt) => {
        G.pos += G.dir * dt * (0.8 + 0.07 * G.hoists + Math.min(0.3, s.shifts * 0.01));
        if (G.pos > 1) { G.pos = 1; G.dir = -1; } else if (G.pos < 0) { G.pos = 0; G.dir = 1; }
        G.mark.style.left = G.pos * 100 + "%";
        G.score = G.hits / 10;
        hud.textContent = `Hoisted ${G.hits} of ${G.hoists} (10 to a shift). ${Math.ceil(G.t)} s left.`;
      };
    }
    toast("The shift begins!");
  }

  function finish(done) {
    const G = game; game = null;
    if (!G) return;
    if (!done) { toast("You walked off the shift and were not paid."); return; }
    const kind = G.kind, job = JOBS[kind], r = rank();
    const score = kind === "capstan" ? Math.min(1, G.inZone / SHIFT / 0.8) : G.score; // a good winch crew is in the green 80% of the time
    const pay = Math.round(job.base * r.mul * Math.max(0, Math.min(1, score))) + (score >= 0.95 ? 10 : 0);
    Vitals.coins += pay; Vitals.hp -= HP_COST; s.shifts++; s.earned += pay; save();
    const oldRank = r, newRank = rank();
    $j("job-area").replaceChildren();
    $j("job-text").textContent = score >= 0.9 ? "Excellent work! The foreman nods." : score >= 0.5 ? "Fair work. The foreman pays you." : "Poor work. The foreman scowls and pays you a few coins.";
    $j("job-info").textContent = `You earned ${pay} denarii (${Math.round(score * 100)}% of the full pay). Total earned in the hypogeum: ${s.earned}.${newRank !== oldRank ? ` You are promoted: ${newRank.name}!` : ""}`;
    const b = $j("job-btns"); b.replaceChildren();
    b.append(btn("Another shift", () => { closePanels(); open(kind); }), btn("Leave", closePanels));
    Sfx.play("coin");
    Narrator.say(`Shift over. You earned ${pay} denarii.${newRank !== oldRank ? ` You are now a ${newRank.name}.` : ""}`, { interrupt: true });
    if (foreman && typeof Speech !== "undefined") Speech.say({ x: foreman.position.x, z: foreman.position.z }, score >= 0.9 ? "Good work, lad!" : score >= 0.5 ? "Not bad. Back to it." : "Lazy hands!", 3);
  }

  // keys while a shift is running (they never reach the rest of the game)
  window.addEventListener("keydown", (e) => {
    if (!game) return;
    const k = e.code;
    let used = true;
    if (game.kind === "capstan" && (k === "KeyA" || k === "ArrowLeft")) game.key("a");
    else if (game.kind === "capstan" && (k === "KeyD" || k === "ArrowRight")) game.key("d");
    else if (game.kind === "keeper" && /^(Digit|Numpad)[1-4]$/.test(k)) game.key(Number(k.slice(-1)) - 1);
    else if (game.kind === "props" && k === "Space") game.key();
    else used = false;
    if (used && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); } else if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- the game hooks

  const at = (x, z, feet = 0) => {
    if (typeof city === "undefined" || city !== "rome" || era !== "ancient" || feet > 3) return null;
    return SPOTS.find((p) => Math.hypot(x - p.x, z - p.z) < p.r) || null;
  };
  function act() {
    const p = at(player.x, player.z, player.feet);
    if (!p) return false;
    if (p.kind === "enter") enter(); else if (p.kind === "exit") leave(); else open(p.kind);
    return true;
  }

  function update(dt) {
    clock += dt;
    if (spin && !game) spin.rotation.y += dt * 0.3;
    if (game) {
      if (!$j("job").classList.contains("show")) { finish(false); return; }
      game.t -= Math.min(dt, 0.1);
      game.step(Math.min(dt, 0.1));
      if (game.t <= 0) finish(true);
      return;
    }
    if (foreman && typeof city !== "undefined" && city === "rome" && inHall(player.x, player.z)) {
      foreman.rotation.y = Math.atan2(player.x - foreman.position.x, player.z - foreman.position.z);
      greetT -= dt;
      if (greetT <= 0 && typeof Speech !== "undefined") {
        greetT = 25 + Math.random() * 10;
        const lines = ["Hands wanted! See the winch, the cages or the scenery.", "The games are tomorrow. Plenty to do!", "Work hard and I will make you foreman."];
        Speech.say({ x: foreman.position.x, z: foreman.position.z }, lines[Math.floor(Math.random() * lines.length)], 3.5);
      }
    }
  }

  function bind() {
    // nothing to bind: the panel's close button is handled with the other panels
  }

  return {
    build, bind, at, act, update, setEra, inHall, SPOTS, H, DOOR,
    snapshot: () => ({ shifts: s.shifts, earned: s.earned }),
    restore(r) { if (r && Number.isFinite(r.shifts)) { s = { shifts: Math.max(0, r.shifts | 0), earned: Math.max(0, (r.earned | 0)) }; save(); } },
    get rank() { return rank().name; },
  };
})();
