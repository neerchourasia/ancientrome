"use strict";
// Car and plane space (the file and the object are still called NercarSpace): a huge open field of grass with things to fly round, for your cars and planes and the NERCAR. 🚀 Car and plane space (in the menu) takes you there on foot; there, two buttons at the bottom of the
// screen give you a vehicle: 🚗 Rent a NERCAR, ✈️ Rent a plane, 🛩️ Rent a jet, 🚁 Rent a helicopter or 🎈 Rent a balloon (see RENTALS: each is paid every time) or 🚗 Get out yours (a list of the cars and planes you own: buy them in the Market; no weather grounds a plane here). Press the menu button again to go back to where you were.
// It is not a city of its own: it is built far away from the others (x = -60000; the game server clamps positions to 20000, which does no harm), so you are still "in Rome" as far as everything else is
// concerned, and the walls of the map (BOUNDS) are swapped for the edges of the field while you are in it. The things to fly round (a tower, a ring of pillars, a gate to fly through, slalom walls and big
// balls, and a scatter of pillars and balls over the whole field, thirty big gates, forty city blocks of towers and seventy long walls) are solid like any building (addBlockerBox / addBlockerCircle in physics.js), so the NERCAR crashes into them if you fly low.
// Depends on game.js, car.js (the NERCAR), vitals.js (the money) and market.js (whether you own one) at run time.

const NercarSpace = (() => {
  const OX = -60000, HALF = 50000;                                 // the middle of the field, and half of its width: 100 km across (the NERCAR crosses 900 m in half a second)
  const K = 10, Z = 2;                                             // the layout below is drawn small: its distances are made K times longer and the things Z times bigger
  const RENTALS = [                                                // the rent buttons at the bottom of the screen: the button, the vehicle (a Car.MODELS id), what it is called and what it costs, every time (buying one in the Market costs more)
    { btn: "ns-rent", id: "nercar", emoji: "🚗", name: "NERCAR", price: 50000 },        // (buying one costs 1,000,000)
    { btn: "ns-rentplane", id: "plane", emoji: "✈️", name: "plane", price: 1000 },      // the light plane (buying: 3500)
    { btn: "ns-rentjet", id: "lightjet", emoji: "🛩️", name: "jet", price: 2500 },       // the light jet (buying: 8000)
    { btn: "ns-rentheli", id: "helicopter", emoji: "🚁", name: "helicopter", price: 1500 }, // (buying: 4500)
    { btn: "ns-rentballoon", id: "balloon", emoji: "🎈", name: "balloon", price: 700 },  // the hot air balloon (buying: 2000)
  ];
  const RENT = RENTALS[0].price;
  const FIELD = { minX: OX - HALF, maxX: OX + HALF, minZ: -HALF, maxZ: HALF };
  let group = null, active = false, saved = null, wired = false;
  const mats = new Map();                                          // one material for each colour (there are hundreds of things in the field)
  const lam = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshLambertMaterial({ color: c })); return mats.get(c); };
  const $n = (id) => document.getElementById(id);

  function stripes() {                                             // two greens in big squares, so you can see how fast you go
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#4f9d3a"; g.fillRect(0, 0, 64, 64);
    g.fillStyle = "#5aab44"; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HALF / 10, HALF / 10);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.magFilter = THREE.NearestFilter;
    return t;
  }

  // a solid block standing on the grass (or hanging at y0) and a solid ball, in metres from the middle of the field
  function put(x, z, w, d, h, color, y0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(color));
    m.position.set(OX + x, y0 + h / 2, z); m.updateMatrix(); m.matrixAutoUpdate = false; group.add(m);
    addBlockerBox(OX + x - w / 2, OX + x + w / 2, z - d / 2, z + d / 2, y0, y0 + h);
  }
  function putBall(x, z, r, color) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), lam(color));
    m.position.set(OX + x, r, z); m.updateMatrix(); m.matrixAutoUpdate = false; group.add(m);
    addBlockerCircle(OX + x, z, r * 0.9, 0, r * 2);
  }
  const box = (x, z, w, d, h, color, y0 = 0) => put(x * K, z * K, w * Z, d * Z, h * Z, color, y0 * Z);      // (the layout below: small numbers, scaled up by K and Z)
  const ball = (x, z, r, color) => putBall(x * K, z * K, r * Z, color);

  function build() {
    group = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: stripes() }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(OX, 0, 0); group.add(ground);
    box(0, 0, 26, 26, 130, 0xd8d2c4);                                   // the tower in the middle
    for (let i = 0; i < 6; i++) {                                       // a ring of six pillars
      const a = (i / 6) * Math.PI * 2;
      box(Math.cos(a) * 320, Math.sin(a) * 320, 14, 14, 75, i % 2 ? 0xc0392b : 0xe6b422);
    }
    box(-520, -45, 12, 12, 55, 0x2c6fbb); box(-520, 45, 12, 12, 55, 0x2c6fbb); box(-520, 0, 14, 110, 9, 0x2c6fbb, 55);   // a gate to fly through (and a lintel on top)
    for (let i = 0; i < 5; i++) box(420 + i * 60, i % 2 ? 55 : -55, 10, 130, 22, 0x8e44ad);                          // slalom walls
    ball(-180, 420, 28, 0xe74c3c); ball(220, -430, 34, 0x27ae60); ball(560, 360, 24, 0xf39c12);
    let seed = 20261121;                                                // a scatter over the whole field (the same every time), not near where you arrive
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const colors = [0xc0392b, 0xe6b422, 0x2c6fbb, 0x8e44ad, 0x27ae60, 0xe67e22, 0xd8d2c4];
    for (let i = 0; i < 30; i++) {                                      // thirty big gates in three rings round the middle, to fly through
      const ring = i % 3, a = (Math.floor(i / 3) / 10) * Math.PI * 2 + ring * 0.4, d = [9000, 22000, 38000][ring], x = Math.cos(a) * d, z = Math.sin(a) * d, c = colors[i % colors.length];
      put(x, z - 90, 26, 26, 120, c, 0); put(x, z + 90, 26, 26, 120, c, 0); put(x, z, 30, 230, 20, c, 120);
    }
    const away = (x, z) => Math.hypot(x + 3000, z) > 1500;                // (nothing where you arrive)
    for (let i = 0; i < 2500; i++) {
      const x = (rnd() * 2 - 1) * (HALF - 1500), z = (rnd() * 2 - 1) * (HALF - 1500);
      if (!away(x, z)) continue;
      const c = colors[Math.floor(rnd() * colors.length)];
      if (i % 3) put(x, z, 20 + rnd() * 30, 20 + rnd() * 30, 60 + rnd() * 200, c, 0); else putBall(x, z, 20 + rnd() * 40, c);
    }
    for (let i = 0; i < 40; i++) {                                      // forty city blocks: a dense cluster of towers of every height
      const cx = (rnd() * 2 - 1) * (HALF - 3000), cz = (rnd() * 2 - 1) * (HALF - 3000), n = 8 + Math.floor(rnd() * 10);
      if (!away(cx, cz)) continue;
      for (let j = 0; j < n; j++) put(cx + (rnd() * 2 - 1) * 300, cz + (rnd() * 2 - 1) * 300, 25 + rnd() * 35, 25 + rnd() * 35, 80 + rnd() * 240, colors[Math.floor(rnd() * colors.length)], 0);
    }
    for (let i = 0; i < 70; i++) {                                      // seventy long walls to fly over or round
      const x = (rnd() * 2 - 1) * (HALF - 2000), z = (rnd() * 2 - 1) * (HALF - 2000), len = 400 + rnd() * 1400, h = 40 + rnd() * 90, c = colors[Math.floor(rnd() * colors.length)];
      if (!away(x, z)) continue;
      if (i % 2) put(x, z, len, 14, h, c, 0); else put(x, z, 14, len, h, c, 0);
    }
    group.visible = false;
    scene.add(group);
  }

  function setHud(on) {
    const h = $n("ns-hud"); if (h) h.hidden = !on;
  }
  function wire() {                                                   // the two buttons at the bottom of the screen
    if (wired) return; wired = true;
    const own = $n("ns-own");
    for (const r of RENTALS) {
      const el = $n(r.btn);
      el.textContent = `${r.emoji} Rent a ${r.name} (${r.price} denarii)`;
      el.addEventListener("click", () => {
        if (!active || mode !== "walk") { toast(Car.driving ? "You are already in a vehicle." : "Get out of what you are in first."); return; }
        if (Vitals.coins < r.price) { toast(`A rented ${r.name} costs ${r.price} denarii: you have ${Math.floor(Vitals.coins)}.`); return; }
        Vitals.coins -= r.price; Sfx.play("coin");
        toast(`You rent a ${r.name} for ${r.price} denarii.`);
        Car.deploy(r.id);
      });
    }
    const list = document.createElement("div"); list.id = "ns-list"; list.hidden = true; $n("ns-hud").prepend(list);
    own.addEventListener("click", () => {
      if (!active || mode !== "walk") { toast(Car.driving ? "You are already in a vehicle." : "Get out of what you are in first."); return; }
      if (!list.hidden) { list.hidden = true; return; }
      const mine = Object.keys(Market.ITEMS).filter((id) => Market.ITEMS[id].type === "car" && Car.MODELS[id] && (Car.MODELS[id].era || "modern") === "modern" && Market.owns(id));
      if (!mine.length) { toast("You do not own a car or a plane yet. Buy one in the Market, or rent a NERCAR here."); return; }
      list.replaceChildren(...mine.map((id) => {
        const b = document.createElement("button"); b.type = "button"; b.textContent = `${Market.ITEMS[id].name}`;
        b.addEventListener("click", () => { list.hidden = true; if (active && mode === "walk") Car.deploy(id); });
        return b;
      }));
      list.hidden = false;
    });
  }

  function enter() {
    if (active) return;
    if (typeof NerPlace !== "undefined" && NerPlace.active) { toast("Leave Ner place first (press its button in the menu)."); return; }
    if (mode !== "walk" || panelOpen) { toast("Close what is open and get out of what you are in first"); return; }
    if (typeof Subway !== "undefined" && Subway.underground) { toast("Come up from the metro first (U on the platform)."); return; }
    if (!group) build();
    wire();
    saved = { city, period: periodNow(), x: player.x, z: player.z, yaw: player.yaw };
    if (city !== "rome") arriveIn("rome", null);
    if (periodNow() !== "modern") setPeriod("modern");                 // (the NERCAR is a modern car)
    active = true;
    group.visible = true;
    Object.assign(BOUNDS, FIELD);
    placeAt(OX - 3000, 0, -Math.PI / 2);
    $("#hud .top-left h1").innerHTML = "Time Machine <small>Car and plane space</small>";
    $("#map-title").textContent = "Car and plane space";
    setHud(true);
    toast("🚀 Car and plane space: rent a NERCAR, a plane, a jet, a helicopter or a balloon, or get out one of yours (buttons at the bottom). The menu button takes you back.");
  }

  function leave() {
    if (!active) return;
    active = false;
    setHud(false);
    if (typeof Car !== "undefined") { if (Car.driving) { Car.debugSet({ alt: 0, vy: 0, v: 0 }); Car.exit(true); } Car.stow(); }
    group.visible = false;
    Object.assign(BOUNDS, ROME_BOUNDS);
    const s = saved; saved = null;
    if (s.city !== "rome") arriveIn(s.city, null);
    placeAt(s.x, s.z, s.yaw);
    if (periodNow() !== s.period) setPeriod(s.period);
    applyEra();
    toast("You are back.");
  }

  const toggle = () => (active ? leave() : enter());
  return { enter, leave, toggle, get active() { return active; }, FIELD, RENT, RENTALS };
})();
