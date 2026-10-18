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
  // the jobs on the job board at the market square (in both cities); `names` are the local names
  const BOARD = ["baker", "scribe", "groom", "courier", "water", "haggler", "smith", "watch"];
  Object.assign(JOBS, {
    baker: { name: "Baker", names: { rome: "Baker", delhi: "Halwai (sweet maker)" }, base: 28, icon: "🍞", board: true, text: "Keep the oven at the right heat. Hold Space (or the button) to feed the fire and let go to let it cool. Keep the heat in the green." },
    scribe: { name: "Scribe", names: { rome: "Scribe", delhi: "Munshi (clerk)" }, base: 32, icon: "✍", board: true, text: "Copy the letters as they appear: press the same key as fast as you can. Each letter you miss costs you." },
    groom: { name: "Stable hand", names: { rome: "Stable hand", delhi: "Mahout's helper" }, base: 36, icon: "🐴", board: true, text: "Remember the order the animals are fed in, then repeat it with keys 1 to 4. Each round adds one more." },
    courier: { name: "Messenger", names: { rome: "Messenger", delhi: "Harkara (runner)" }, base: 55, icon: "📜", board: true, run: true, text: "Carry a message across the city to a landmark before time runs out. The sooner you arrive, the more you are paid." },
  });
  Object.assign(JOBS, {   // jobs only Ancient Rome has
    water: { name: "Water carrier", names: { rome: "Water carrier (aquarius)" }, base: 30, icon: "🪣", board: true, only: "rome-ancient", text: "Carry two full buckets from the fountain without spilling. They sway: hold A or D (or the buttons) to lean against the swing and keep the bar in the middle." },
    haggler: { name: "Market haggler", names: { rome: "Merchant's haggler" }, base: 45, icon: "🪙", board: true, only: "rome-ancient", text: "Six customers, one after another. The price creeps up: press Space to sell at the highest price you dare. If it goes over what they will pay, they walk away and you earn nothing." },
    smith: { name: "Armourer", names: { rome: "Armourer's hand (faber)" }, base: 38, icon: "🔨", board: true, only: "rome-ancient", text: "Strike the iron while it glows orange: press Space when the metal is the right colour. Too cold or too white and the blow is wasted. Twelve blows to a shift." },
    watch: { name: "Night watchman", names: { rome: "Night watchman (vigil)" }, base: 34, icon: "🏮", board: true, only: "rome-ancient", text: "Thieves creep along the rooftops. Press the arrow key that points the way they are going, fast, before they get away." },
  });
  // the Circus Maximus: work at the racetrack (the same games as above, with a racetrack story)
  const CIRCUS = ["horses", "rake", "gates", "wheel"];
  Object.assign(JOBS, {
    horses: { name: "Horse trainer", mech: "groom", place: "circus", only: "rome-ancient", base: 42, icon: "🐎", text: "Walk the racehorses through their paces: remember the order the horses are led out in, then repeat it with keys 1 to 4. Each round adds one more." },
    rake: { name: "Track raker", mech: "capstan", place: "circus", only: "rome-ancient", base: 34, icon: "🧹", text: "Drag the heavy rake round the track to smooth the sand before a race. Tap A and D one after the other and keep the speed bar in the green." },
    gates: { name: "Starting-gate keeper", mech: "props", place: "circus", only: "rome-ancient", base: 40, icon: "🚩", text: "Drop the starting rope when the chariots are lined up. Press Space when the marker is inside the green. Ten races to a shift." },
    wheel: { name: "Wheelwright", mech: "smith", place: "circus", only: "rome-ancient", base: 44, icon: "🛞", text: "Fit the iron rims to the chariot wheels while they glow orange: press Space when the iron is the right colour. Twelve wheels to a shift." },
  });
  const jobHere = (job) => !job.only || (typeof city !== "undefined" && typeof era !== "undefined" && job.only === `${city}-${era}`);
  const jobName = (kind) => { const j = JOBS[kind]; return (j.names && j.names[typeof city !== "undefined" ? city : "rome"]) || j.name; };
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
    { kind: "circus", x: -205, z: 98, r: 4.2, text: "F: look for work at the Circus Maximus" },
  ];
  let circus = null, hall = null, house = null, foreman = null, spin = null, backPos = null, greetT = 0, clock = 0;

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
    // the Circus office: a little wooden hut by the starting gates of the Circus Maximus, with a sign and bunting
    circus = new T.Group(); scene.add(circus);
    const cwood = lam(0x7a5a34), cwall = lam(0xcdb994);
    box(circus, -205, 0, 103.5, 8, 3.2, 5, cwall, true); box(circus, -205, 3.2, 103.5, 9, 0.5, 6, lam(0x9a3a2a), false); box(circus, -205, 0, 100.9, 2.4, 2.4, 0.2, lam(0x2a241d), false);
    for (const sx of [-1, 1]) cyl(circus, -205 + sx * 5.2, 0, 99, 0.18, 3.6, cwood, false);
    sign(circus, -205, 4.6, 100.8, 5.2, 1.3, "CIRCUS", "work wanted", Math.PI);
    torch(circus, -208.5, 98.8); torch(circus, -201.5, 98.8);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: -209, x1: -201, z0: 101, z1: 106, c: "#8a7a62" });
    setEra(typeof era !== "undefined" && era === "modern");
  }

  // The hypogeum and its door only exist in the ancient city; in Modern Rome the stairs are sealed
  function setEra(modern) {
    if (hall) hall.visible = !modern;
    if (house) house.visible = !modern;
    if (circus) circus.visible = !modern;
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
    $j("job-title").textContent = `${job.icon} ${jobName(kind)}`;
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
    const job0 = kind; kind = JOBS[kind].mech || kind;                 // some jobs use the same game as another (the Circus jobs)
    $j("job-btns").replaceChildren();
    const area = $j("job-area"); area.replaceChildren();
    const hud = document.createElement("p"); hud.className = "dnote"; hud.id = "job-hud"; area.append(hud);
    game = { kind, job: job0, t: SHIFT, score: 0, n: 0, hud };
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
    } else if (kind === "props") {
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
    else if (kind === "baker") {
      G.heat = 30; G.hold = false; G.inZone = 0;
      const bar = document.createElement("div"); bar.className = "jb-bar"; bar.innerHTML = '<i class="jb-zone" style="left:55%;width:22%"></i><b class="jb-mark"></b>'; area.append(bar); G.mark = bar.querySelector(".jb-mark");
      const hb = btn("🔥 Feed the fire (hold Space)", () => {}); for (const ev of ["mousedown", "touchstart"]) hb.addEventListener(ev, () => { G.hold = true; }); for (const ev of ["mouseup", "mouseleave", "touchend"]) hb.addEventListener(ev, () => { G.hold = false; }); area.append(hb);
      G.step = (dt) => {
        G.heat = Math.max(0, Math.min(100, G.heat + (G.hold ? 34 : -17) * dt));
        if (G.heat >= 55 && G.heat <= 77) G.inZone += dt;
        G.mark.style.left = G.heat + "%"; G.score = G.inZone / (SHIFT - G.t || 1);
        hud.textContent = `Oven ${Math.round(G.heat)}°. Time at the right heat: ${G.inZone.toFixed(0)} s. ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "scribe") {
      G.asks = 0; G.hits = 0; G.cur = ""; G.ttl = 0; G.gap = 0.3;
      const big = document.createElement("div"); big.className = "jb-letter"; area.append(big); G.big = big;
      G.key = (ch) => {
        if (!G.cur) return;
        if (ch === G.cur) { G.hits++; Sfx.play("coin"); } else { Sfx.play("bump"); }
        G.cur = ""; G.big.textContent = "·"; G.gap = 0.25;
      };
      G.step = (dt) => {
        if (G.cur) { G.ttl -= dt; if (G.ttl <= 0) { G.cur = ""; G.big.textContent = "·"; G.gap = 0.3; } }
        else { G.gap -= dt; if (G.gap <= 0) { G.cur = "ASDFJKL"[Math.floor(Math.random() * 7)]; G.ttl = 2.2; G.asks++; G.big.textContent = G.cur; } }
        G.score = Math.min(1, G.hits / Math.max(12, G.asks));
        hud.textContent = `Copied ${G.hits} of ${G.asks}. ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "groom") {
      G.seq = []; G.pos = 0; G.phase = "show"; G.showI = 0; G.tt = 0.8; G.best = 0; G.cages = [];
      const row = document.createElement("div"); row.className = "jb-cages";
      ["🐴", "🐘", "🐂", "🐪"].forEach((e, i) => { const c = btn(`${i + 1}\n${e}`, () => G.key(i), "jb-cage"); row.append(c); G.cages.push(c); });
      area.append(row);
      const lit = (i, on) => G.cages.forEach((c, j) => c.classList.toggle("hungry", on && j === i));
      const next = () => { G.seq.push(Math.floor(Math.random() * 4)); G.pos = 0; G.phase = "show"; G.showI = 0; G.tt = 0.7; };
      next();
      G.key = (i) => {
        if (G.phase !== "input") return;
        lit(i, true); setTimeout(() => lit(i, false), 150);
        if (i === G.seq[G.pos]) { Sfx.play("coin"); G.pos++; if (G.pos >= G.seq.length) { G.best = G.seq.length; next(); } }
        else { Sfx.play("bump"); G.seq = G.seq.slice(0, Math.max(1, G.seq.length - 1)); next(); }   // a slip: back one animal
      };
      G.step = (dt) => {
        if (G.phase === "show") {
          G.tt -= dt;
          if (G.tt <= 0) { if (G.showI < G.seq.length) { lit(G.seq[G.showI], true); G.tt = 0.5; G.showI++; G.lit = true; } else { lit(0, false); G.phase = "input"; } }
          else if (G.tt < 0.2 && G.lit) { lit(0, false); G.lit = false; }
        }
        G.score = Math.min(1, G.best / 8);
        hud.textContent = G.phase === "show" ? `Watch... (${G.seq.length} animals)` : `Your turn: repeat ${G.pos + 1} of ${G.seq.length}. Best ${G.best}. ${Math.ceil(G.t)} s left.`;
      };
    }
    else if (kind === "water") {
      G.bal = 0; G.vel = 0; G.left = false; G.right = false; G.inZone = 0; G.spills = 0;
      const bar = document.createElement("div"); bar.className = "jb-bar"; bar.innerHTML = '<i class="jb-zone" style="left:35%;width:30%"></i><b class="jb-mark"></b>'; area.append(bar); G.mark = bar.querySelector(".jb-mark");
      const row = document.createElement("div"); row.className = "dbtns";
      const hold = (label, side) => { const b = btn(label, () => {}); for (const ev of ["mousedown", "touchstart"]) b.addEventListener(ev, () => { G[side] = true; }); for (const ev of ["mouseup", "mouseleave", "touchend"]) b.addEventListener(ev, () => { G[side] = false; }); return b; };
      row.append(hold("◀ Lean left (A)", "left"), hold("Lean right (D) ▶", "right")); area.append(row);
      G.step = (dt) => {
        G.vel += (G.bal * 1.1 + (Math.random() - 0.5) * 120) * dt + ((G.right ? 1 : 0) - (G.left ? 1 : 0)) * -140 * dt * -1;
        G.vel *= Math.exp(-0.9 * dt); G.bal += G.vel * dt;
        if (Math.abs(G.bal) > 100) { G.spills++; G.bal = 0; G.vel = 0; Sfx.play("bump"); toast("Splash! You spilled some water."); }
        if (Math.abs(G.bal) < 30) G.inZone += dt;
        G.mark.style.left = (50 + G.bal / 2) + "%"; G.score = Math.max(0, G.inZone / (SHIFT - G.t || 1) - G.spills * 0.04);
        hud.textContent = `Balanced for ${G.inZone.toFixed(0)} s. Spills: ${G.spills}. ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "haggler") {
      G.round = 0; G.sum = 0; G.price = 40; G.limit = 100; G.wait = 0.5; G.live = false;
      const big = document.createElement("div"); big.className = "jb-letter"; big.textContent = "·"; area.append(big); G.big = big;
      area.append(btn("Sell! (Space)", () => G.key()));
      const next = () => { G.round++; G.price = 40; G.limit = 80 + Math.random() * 70; G.live = true; };
      G.key = () => {
        if (!G.live) return;
        G.live = false; G.wait = 1.0;
        if (G.price <= G.limit) { const q = Math.min(1, G.price / G.limit); G.sum += q; G.big.textContent = `Sold at ${Math.round(G.price)}! (${Math.round(q * 100)}% of the best price)`; Sfx.play("coin"); }
        else { G.big.textContent = "Too dear: they walked away."; Sfx.play("bump"); }
        if (G.round >= 6) G.t = Math.min(G.t, 1.2);
      };
      G.step = (dt) => {
        if (G.live) { G.price += (22 + G.round * 2) * dt; G.big.textContent = `${Math.round(G.price)}`; if (G.price > 175) { G.live = false; G.wait = 1.0; G.big.textContent = "Too slow: they left."; if (G.round >= 6) G.t = Math.min(G.t, 1.2); } }
        else if (G.round < 6) { G.wait -= dt; if (G.wait <= 0) next(); }
        G.score = G.sum / 6;
        hud.textContent = `Customer ${Math.min(6, G.round)} of 6. ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "smith") {
      G.heat = 0; G.blows = 0; G.sum = 0; G.cool = 0;
      const metal = document.createElement("div"); metal.className = "jb-metal"; area.append(metal); G.metal = metal;
      area.append(btn("🔨 Strike! (Space)", () => G.key()));
      const col = (h) => { const stops = [[0, [60, 60, 66]], [0.3, [150, 30, 20]], [0.6, [255, 130, 20]], [0.85, [255, 230, 120]], [1, [255, 255, 245]]]; for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) { const [a, ca] = stops[i - 1], [b, cb] = stops[i], u = (h - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * u)).join(",")})`; } return "#fff"; };
      G.key = () => {
        if (G.blows >= 12 || G.cool > 0) return;
        G.blows++; G.cool = 0.4;
        const q = Math.max(0, 1 - Math.abs(G.heat - 0.6) / 0.16); G.sum += q;
        Sfx.play(q > 0.6 ? "coin" : "bump"); G.metal.classList.add("hit"); setTimeout(() => G.metal.classList.remove("hit"), 150);
        if (G.blows >= 12) G.t = Math.min(G.t, 0.8);
      };
      G.step = (dt) => {
        G.cool = Math.max(0, G.cool - dt);
        G.heat += dt / (1.7 - Math.min(0.5, G.blows * 0.04)); if (G.heat > 1) G.heat = 0;                 // it heats up, then starts again cold
        G.metal.style.background = col(G.heat); G.score = G.sum / 12;
        hud.textContent = `Blow ${G.blows} of 12. Strike when it is orange! ${Math.ceil(G.t)} s left.`;
      };
    } else if (kind === "watch") {
      const ARROWS = [["ArrowLeft", "←"], ["ArrowUp", "↑"], ["ArrowRight", "→"], ["ArrowDown", "↓"]];
      G.asks = 0; G.hits = 0; G.cur = -1; G.ttl = 0; G.gap = 0.3;
      const big = document.createElement("div"); big.className = "jb-letter"; big.textContent = "·"; area.append(big); G.big = big;
      const row = document.createElement("div"); row.className = "dbtns"; ARROWS.forEach(([c, a], i) => row.append(btn(a, () => G.key(i)))); area.append(row);
      G.key = (i) => {
        if (G.cur < 0) return;
        if (i === G.cur) { G.hits++; Sfx.play("coin"); } else Sfx.play("bump");
        G.cur = -1; G.big.textContent = "·"; G.gap = 0.25;
      };
      G.step = (dt) => {
        if (G.cur >= 0) { G.ttl -= dt; if (G.ttl <= 0) { G.cur = -1; G.big.textContent = "·"; G.gap = 0.3; } }
        else { G.gap -= dt; if (G.gap <= 0) { G.cur = Math.floor(Math.random() * 4); G.ttl = 1.8; G.asks++; G.big.textContent = ARROWS[G.cur][1]; } }
        G.score = Math.min(1, G.hits / Math.max(12, G.asks));
        hud.textContent = `Caught ${G.hits} of ${G.asks}. ${Math.ceil(G.t)} s left.`;
      };
    }
    toast("The shift begins!");
  }

  function finish(done) {
    const G = game; game = null;
    if (!G) return;
    if (!done) { toast("You walked off the shift and were not paid."); return; }
    const kind = G.kind, jobKind = G.job || G.kind, job = JOBS[jobKind], r = rank();
    const score = kind === "capstan" ? Math.min(1, G.inZone / SHIFT / 0.8) : kind === "baker" || kind === "water" ? Math.min(1, Math.max(0, kind === "water" ? G.score / 0.75 : G.inZone / SHIFT / 0.75)) : G.score; // a good winch crew is in the green 80% of the time
    const pay = Math.round((job.base * r.mul * Math.max(0, Math.min(1, score)) + (score >= 0.95 ? 10 : 0)) * (typeof Festival !== "undefined" ? Festival.payMul : 1));   // festival days pay a quarter more
    Vitals.coins += pay; Vitals.hp -= HP_COST; s.shifts++; s.earned += pay; save();
    const oldRank = r, newRank = rank();
    $j("job-area").replaceChildren();
    $j("job-text").textContent = score >= 0.9 ? "Excellent work! The foreman nods." : score >= 0.5 ? "Fair work. The foreman pays you." : "Poor work. The foreman scowls and pays you a few coins.";
    $j("job-info").textContent = `You earned ${pay} denarii (${Math.round(score * 100)}% of the full pay). Total earned from jobs: ${s.earned}.${newRank !== oldRank ? ` You are promoted: ${newRank.name}!` : ""}`;
    const b = $j("job-btns"); b.replaceChildren();
    b.append(btn("Another shift", () => { closePanels(); open(jobKind); }), btn("Leave", closePanels));
    if (job.board) b.append(btn("Back to the job board", () => { closePanels(); openBoard(); }));
    else if (job.place === "circus") b.append(btn("Back to the Circus office", () => { closePanels(); openBoard(CIRCUS, "🏇 Circus Maximus: work wanted"); }));
    Sfx.play("coin");
    Narrator.say(`Shift over. You earned ${pay} denarii.${newRank !== oldRank ? ` You are now a ${newRank.name}.` : ""}`, { interrupt: true });
    if (foreman && typeof Speech !== "undefined" && inHall(player.x, player.z)) Speech.say({ x: foreman.position.x, z: foreman.position.z }, score >= 0.9 ? "Good work, lad!" : score >= 0.5 ? "Not bad. Back to it." : "Lazy hands!", 3);
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
    else if (game.kind === "baker" && k === "Space") game.hold = true;
    else if (game.kind === "water" && (k === "KeyA" || k === "ArrowLeft")) game.left = true;
    else if (game.kind === "water" && (k === "KeyD" || k === "ArrowRight")) game.right = true;
    else if ((game.kind === "haggler" || game.kind === "smith") && k === "Space") game.key();
    else if (game.kind === "watch" && /^Arrow(Left|Up|Right|Down)$/.test(k)) game.key(["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].indexOf(k));
    else if (game.kind === "scribe" && /^Key[ASDFJKL]$/.test(k)) game.key(k.slice(3));
    else if (game.kind === "groom" && /^(Digit|Numpad)[1-4]$/.test(k)) game.key(Number(k.slice(-1)) - 1);
    else used = false;
    if (used && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); } else if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  window.addEventListener("keyup", (e) => {
    if (!game) return;
    if (game.kind === "baker" && e.code === "Space") { game.hold = false; e.preventDefault(); }
    if (game.kind === "water" && (e.code === "KeyA" || e.code === "ArrowLeft")) { game.left = false; e.preventDefault(); }
    if (game.kind === "water" && (e.code === "KeyD" || e.code === "ArrowRight")) { game.right = false; e.preventDefault(); }
  }, true);

  // ---------------------------------------------------------------- the list of every job (the Jobs button)

  const GROUPS = [
    { title: "Hypogeum, under the Colosseum", where: "Ancient Rome: the stair-house by the Colosseum's west gate", city: "rome", era: "ancient", lm: "hypogeum", jobs: ["capstan", "keeper", "props"] },
    { title: "Circus Office, at the Circus Maximus", where: "Ancient Rome: the hut by the starting gates", city: "rome", era: "ancient", lm: "circusjobs", jobs: CIRCUS },
    { title: "Job board in Rome's market", where: "Rome: the market square south of the Forum (some jobs are Ancient Rome only)", city: "rome", era: null, lm: "market", jobs: BOARD },
    { title: "Job board in Delhi's market", where: "Old Delhi: the market square south of the Lahori Gate", city: "delhi", era: null, lm: "g-market", jobs: ["baker", "scribe", "groom", "courier"] },
  ];
  const nameIn = (kind, c) => { const j = JOBS[kind]; return (j.names && j.names[c]) || j.name; };

  function openList() {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#joblist");
    const r = rank(), nx = nextRank(), here = typeof city !== "undefined" ? city : "rome", ea = typeof era !== "undefined" ? era : "ancient", box = $j("jl-groups");
    $j("jl-info").textContent = `Your rank: ${r.name} (pay x${r.mul}).${nx ? ` ${nx.at - s.shifts} more shift${nx.at - s.shifts === 1 ? "" : "s"} to become ${nx.name}.` : ""} Shifts worked: ${s.shifts}, earned ${s.earned} denarii.${typeof Festival !== "undefined" && Festival.active ? ` It is ${Festival.name}: jobs pay a quarter more!` : ""} Each shift costs health and needs at least ${MIN_HP}.`;
    box.replaceChildren(...GROUPS.map((g) => {
      const open = g.city === here && (!g.era || g.era === ea), sec = document.createElement("section");
      sec.className = "jl-group" + (open ? "" : " off");
      const h = document.createElement("h3"); h.textContent = g.title; const w = document.createElement("p"); w.className = "dnote small"; w.textContent = g.where;
      sec.append(h, w);
      const ul = document.createElement("ul"); ul.className = "dlist";
      for (const kind of g.jobs) {
        const job = JOBS[kind], li = document.createElement("li"), sp = document.createElement("span"), n = document.createElement("strong"), d = document.createElement("small");
        const here2 = !job.only || job.only === `${g.city}-${ea}`;
        n.textContent = `${job.icon} ${nameIn(kind, g.city)}${here2 ? "" : "  (Ancient Rome only)"}`;
        d.textContent = `${job.text} Pays up to ${Math.round(job.base * r.mul * (typeof Festival !== "undefined" ? Festival.payMul : 1))} denarii.`;
        sp.append(n, d); li.append(sp); ul.append(li);
      }
      sec.append(ul);
      const lm = (typeof ALL_LANDMARKS !== "undefined" ? ALL_LANDMARKS : []).find((l) => l.id === g.lm), row = document.createElement("div"); row.className = "dbtns";
      if (open && lm) {
        row.append(btn("Show me the way", () => { closePanels(); if (typeof startDirections === "function") startDirections(lm); }), btn("Take me there", () => { closePanels(); if (typeof goTo === "function") goTo(lm); }));
      } else row.append(Object.assign(document.createElement("small"), { textContent: g.city !== here ? `Travel to ${g.city === "delhi" ? "Delhi" : "Rome"} first (press B).` : "Switch to Ancient Rome first (press K)." }));
      sec.append(row);
      return sec;
    }));
  }

  // ---------------------------------------------------------------- the job board at the market square

  function openBoard(list = BOARD, title = "📋 The job board") {
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return; }
    openPanel("#jobboard");
    $j("jb-title").textContent = title;
    const r = rank(), nx = nextRank(), ul = $j("jb-list"); ul.replaceChildren();
    $j("jb-info").textContent = `Your rank: ${r.name} (pay x${r.mul}).${nx ? ` ${nx.at - s.shifts} more shift${nx.at - s.shifts === 1 ? "" : "s"} to become ${nx.name}.` : ""} Shifts worked: ${s.shifts}.${typeof Festival !== "undefined" && Festival.active ? " Festival days pay a quarter more!" : ""} Each job costs ${HP_COST} health (you need ${MIN_HP}).`;
    for (const kind of list) {
      if (!jobHere(JOBS[kind])) continue;
      const job = JOBS[kind], li = document.createElement("li"), sp = document.createElement("span"), n = document.createElement("strong"), d = document.createElement("small"), b = document.createElement("button");
      n.textContent = `${job.icon} ${jobName(kind)}`; d.textContent = `${job.text} Pays up to ${Math.round(job.base * r.mul * (typeof Festival !== "undefined" ? Festival.payMul : 1))} denarii.`;
      sp.append(n, d); b.type = "button"; b.textContent = Vitals.hp >= MIN_HP ? "Take the job" : "Too tired"; b.disabled = Vitals.hp < MIN_HP;
      b.addEventListener("click", () => { closePanels(); if (JOBS[kind].run) startCourier(); else open(kind); });
      li.append(sp, b); ul.append(li);
    }
  }

  // The messenger: carry a message to a landmark across the city before the time is up (the game's directions arrow shows the way)
  let courier = null;
  function startCourier() {
    if (courier) { toast("You are already carrying a message."); return; }
    const list = (typeof LANDMARKS !== "undefined" ? LANDMARKS : []).filter((l) => !l.home && !l.game);
    const cands = list.map((l) => ({ l, d: Math.hypot(l.x - player.x, l.z - player.z) })).filter((c) => c.d > 120 && c.d < 600);
    if (!cands.length) { toast("There is nowhere to send a message from here."); return; }
    const pick = cands[Math.floor(Math.random() * cands.length)], total = Math.round(pick.d / 6.5 + 35);
    courier = { lm: pick.l, until: performance.now() + total * 1000, total, hudT: 0 };
    if (typeof startDirections === "function") startDirections(pick.l);
    toast(`Take this message to ${pick.l.name}: ${Math.round(pick.d)} m, you have ${total} seconds.`);
    Narrator.say(`Deliver the message to ${pick.l.name} within ${total} seconds.`, { interrupt: true });
    courierHud();
  }
  function courierHud() {
    const el = $j("courier-hud");
    if (!courier) { el.classList.remove("show"); return; }
    const left = Math.max(0, Math.round((courier.until - performance.now()) / 1000)), d = Math.round(Math.hypot(courier.lm.x - player.x, courier.lm.z - player.z));
    el.innerHTML = `<strong>📜 Message for ${courier.lm.name}</strong><span>${d} m to go. ${left} s left.</span>`; el.classList.add("show");
  }
  function courierUpdate(dt) {
    if (!courier) return;
    courier.hudT -= dt; if (courier.hudT <= 0) { courier.hudT = 0.5; courierHud(); }
    if (typeof city !== "undefined" && courier.lm.x > 3000 !== (city === "delhi")) { courier = null; courierHud(); toast("You left the city: the message is lost."); return; }
    const left = (courier.until - performance.now()) / 1000, d = Math.hypot(courier.lm.x - player.x, courier.lm.z - player.z);
    if (d < Math.max(14, courier.lm.r * 0.35)) {
      const r = rank(), pay = Math.round(JOBS.courier.base * r.mul * (0.4 + 0.6 * Math.max(0, left) / courier.total) * (typeof Festival !== "undefined" ? Festival.payMul : 1));
      Vitals.coins += pay; Vitals.hp -= 5; s.shifts++; s.earned += pay; save(); Sfx.play("coin");
      toast(`Message delivered to ${courier.lm.name}! You earn ${pay} denarii.`); Narrator.say(`Message delivered. You earn ${pay} denarii.`, { interrupt: true });
      if (typeof Nav !== "undefined" && Nav.clear) Nav.clear();
      courier = null; courierHud();
    } else if (left <= 0) {
      toast("Too late: the message is worthless now."); Narrator.say("Too late. The message is worthless now.", { interrupt: true });
      if (typeof Nav !== "undefined" && Nav.clear) Nav.clear();
      courier = null; courierHud();
    }
  }

  // ---------------------------------------------------------------- the game hooks

  const at = (x, z, feet = 0) => {
    if (typeof city === "undefined" || city !== "rome" || era !== "ancient" || feet > 3) return null;
    return SPOTS.find((p) => Math.hypot(x - p.x, z - p.z) < p.r) || null;
  };
  function act() {
    const p = at(player.x, player.z, player.feet);
    if (!p) return false;
    if (p.kind === "enter") enter(); else if (p.kind === "exit") leave(); else if (p.kind === "circus") openBoard(CIRCUS, "🏇 Circus Maximus: work wanted"); else open(p.kind);
    return true;
  }

  function update(dt) {
    clock += dt;
    courierUpdate(dt);
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
    build, bind, at, act, update, setEra, inHall, SPOTS, H, DOOR, openBoard, openList,
    snapshot: () => ({ shifts: s.shifts, earned: s.earned }),
    restore(r) { if (r && Number.isFinite(r.shifts)) { s = { shifts: Math.max(0, r.shifts | 0), earned: Math.max(0, (r.earned | 0)) }; save(); } },
    get rank() { return rank().name; },
  };
})();
