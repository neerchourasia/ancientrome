"use strict";
// The passing of time, and your house. A day lasts a few minutes, and when night falls you go home to sleep.
// Depends on world.js (frame, materials) and physics.js. Saved in the browser between visits.

const Time = (() => {
  const KEY = "rome-time";
  const DAY_SECONDS = 1200; // one full day, in real seconds (20 minutes, so one hour is 50 seconds)
  const s = { hour: 9, day: 1 };
  let saveT = 0;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && Number.isFinite(v.hour) && Number.isFinite(v.day)) { s.hour = ((v.hour % 24) + 24) % 24; s.day = Math.max(1, Math.floor(v.day)); }
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const PRESETS = [8, 12, 18, 22]; // the T key jumps to the next of these

  return {
    get hour() { return s.hour; },
    get day() { return s.day; },
    get isNight() { return s.hour >= 20.5 || s.hour < 5.5; },
    get bedtime() { return s.hour >= 20 || s.hour < 5; }, // late enough to sleep
    get late() { return s.hour >= 22.5 || s.hour < 4; }, // you should really be in bed
    get exhausted() { return s.hour >= 4 && s.hour < 6.5; }, // you collapse from tiredness (from 4 am until the usual dawn wake-up time)
    DAY_SECONDS,
    advance(dt) {
      s.hour += (dt * 24) / DAY_SECONDS;
      if (s.hour >= 24) { s.hour -= 24; s.day++; }
      saveT += dt;
      if (saveT > 3) { saveT = 0; save(); }
    },
    setClock(h, d) { s.hour = ((h % 24) + 24) % 24; s.day = Math.max(1, Math.floor(d)); save(); },
    set(h) { s.hour = ((h % 24) + 24) % 24; save(); },
    nextPreset() {
      const h = s.hour;
      let n = PRESETS.find((p) => p > h + 0.05);
      const wraps = n === undefined; // past the last preset: on to the next morning
      if (wraps) n = PRESETS[0];
      // Skipping through the night without sleeping: you stay up until 4 am, then collapse.
      if (h < 4 || (wraps && h >= 4)) { if (wraps) s.day++; s.hour = 4; save(); return 4; }
      s.hour = n; save(); return n;
    },
    // Sleeping through the night: wake at dawn on the next morning.
    wake() { if (s.hour >= 12) s.day++; s.hour = 6.5; save(); },
    label() {
      const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60 / 5) * 5;
      return `Day ${s.day} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} · ${phaseName(s.hour)}`;
    },
  };
})();

// Your house (a small domus): a room with a bed, a table and a lamp, just south of the Via Sacra beside the Colosseum road.
const Home = (() => {
  const X = 255, Z = 50, W = 12, D = 10; // centre and size, in metres
  let glass = null, lamp = null, lit = false, floorMat = null, floorMap = null, mosaicTex = null;
  const banners = [];

  const inside = (x, z) => Math.abs(x - X) < W / 2 - 0.4 && Math.abs(z - Z) < D / 2 - 0.4;

  function build() {
    const F = frame(X, Z, 2); // front (with the door) faces north, toward the road
    const wall = M.travertine, wood = lambert(0x6b4a2b), linen = lambert(0xf0e8d6), red = lambert(0x9c3a2e);
    const H = 4, t = 0.5;

    // floor, walls with a doorway, lintel, roof
    const floor = F.box(0, 0, 0, W, 0.15, D, lambert(0xb9a17c, { map: stoneTex("#ffffff") }), { walk: true, map: "#c9a878" });
    floorMat = floor.material; floorMap = floorMat.map;
    F.box(-W / 2 + t / 2, 0, 0, t, H, D, wall, { solid: true });
    F.box(W / 2 - t / 2, 0, 0, t, H, D, wall, { solid: true });
    F.box(0, 0, -D / 2 + t / 2, W, H, t, wall, { solid: true });
    const seg = (W - 2.4) / 2;
    for (const sx of [-1, 1]) F.box(sx * (1.2 + seg / 2), 0, D / 2 - t / 2, seg, H, t, wall, { solid: true });
    F.box(0, 2.8, D / 2 - t / 2, 2.4, H - 2.8, t, wall);
    F.box(0, H, 0, W + 1.2, 0.45, D + 1.2, M.roof);
    F.box(0, H + 0.45, 0, W + 0.4, 0.5, D + 0.4, M.roof);
    F.stairs(0, D / 2, 2.4, 1, 0.15, 0.7, M.marble2); // a doorstep
    { const [dx, dz] = F.toW(0, D / 2 - t / 2); Doors.add(worldScene, dx, dz, "x", 2.4, 2.8, -1, null, F.y + 0.15); }   // the front door: it opens inwards when you come near

    // a sign over the door
    const plaque = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#d9b44a"; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = "#f3d98a"; g.font = "bold 34px serif"; g.textAlign = "center"; g.fillText("DOMUS MEA", w / 2, 44);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(2.4, 0.6), new T.MeshBasicMaterial({ map: plaque }));
    sign.position.set(0, 3.4, D / 2 + 0.02); F.add(sign);

    // windows that glow at night
    glass = new T.MeshBasicMaterial({ color: 0x5a4a30 });
    for (const [wx, wz, ry] of [[-3.6, D / 2 + 0.02, 0], [3.6, D / 2 + 0.02, 0], [-3, -D / 2 - 0.02, Math.PI], [3, -D / 2 - 0.02, Math.PI]]) {
      const w = new T.Mesh(new T.PlaneGeometry(1.1, 1.2), glass);
      w.position.set(wx, 2.1, wz); w.rotation.y = ry; F.add(w);
    }

    // furniture, all inside the walls
    F.box(-3.6, 0.15, -3.1, 2.2, 0.5, 3.2, wood, { walk: true });           // bed frame
    F.box(-3.6, 0.65, -3.0, 2.0, 0.25, 3.0, linen);                          // mattress
    F.box(-3.6, 0.9, -2.2, 2.0, 0.08, 1.7, red);                             // blanket
    F.box(-3.6, 0.9, -4.3, 1.4, 0.18, 0.6, linen);                           // pillow
    F.box(3.6, 0.15, -3.4, 2.4, 0.9, 1.2, wood, { walk: true });             // chest
    F.box(2.2, 0.15, 1.2, 1.6, 0.9, 1.0, wood, { walk: true });              // table
    F.cyl(2.2, 1.05, 1.2, 0.12, 0.28, M.bronze);                             // oil lamp on the table
    const flame = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), new T.MeshBasicMaterial({ color: 0xffd27a }));
    flame.position.set(2.2, 1.45, 1.2); F.add(flame);
    F.cyl(-4.9, 0.15, 3.7, 0.3, 0.8, lambert(0xa5552f));                      // amphora
    F.box(0, 0.16, -0.5, 3.2, 0.03, 2.4, red, { cast: false });              // rug

    // the dresser, against the east wall (see dresser.js): look at what you own to wear
    const dm = { wood: wood, top: lambert(0x8a6a3a), drawer: lambert(0x5a3e22), mirror: new T.MeshBasicMaterial({ color: 0xb8d0dc }), frame: M.bronze };
    for (const p of Dresser.parts(259.9, 49.0, "w")) {
      const m = shadowed(new T.Mesh(BOX, dm[p.mat]));
      m.scale.set(p.w, p.h, p.d); m.position.set(p.x, 0.15 + p.y0 + p.h / 2, p.z); worldScene.add(m);
      if (p.solid) addBlockerBox(p.x - p.w / 2, p.x + p.w / 2, p.z - p.d / 2, p.z + p.d / 2, 0.15, 0.15 + p.y0 + p.h);
    }
    Dresser.register("rome", 259.9, 49.0, "w", () => true);

    const [lx, lz] = F.toW(2.2, 1.2);
    lamp = new T.PointLight(0xffc477, 0.3, 17);
    lamp.position.set(lx, F.y + 3, lz);
    worldScene.add(lamp);
    Cage.build(worldScene, 255, 53.3, -1);   // the menagerie, against the back wall between the bed and the chest
    buildExtensions();

    // door banners, bought in the Market (hidden until then)
    const cloth = lambert(0xa8342c, { side: T.DoubleSide }), trimGold = lambert(0xd9b44a, { emissive: 0x3d2f05 });
    for (const bx of [252.9, 257.1]) {
      const b = shadowed(new T.Mesh(BOX, cloth)); b.scale.set(0.8, 2.4, 0.06); b.position.set(bx, 2.0, 44.88);
      const bar = shadowed(new T.Mesh(BOX, trimGold)); bar.scale.set(0.95, 0.1, 0.1); bar.position.set(bx, 3.25, 44.86);
      const tas = shadowed(new T.Mesh(BOX, trimGold)); tas.scale.set(0.12, 0.3, 0.06); tas.position.set(bx, 0.7, 44.88);
      for (const m of [b, bar, tas]) { m.visible = false; worldScene.add(m); banners.push(m); }
    }
  }

  // Market decorations: the banners outside, a mosaic floor inside
  function setDecor(d) {
    for (const m of banners) m.visible = !!d.banners;
    if (floorMat) {
      if (d.mosaic && !mosaicTex) mosaicTex = makeMosaic();
      floorMat.map = d.mosaic ? mosaicTex : floorMap;
      floorMat.needsUpdate = true;
    }
  }

  function makeMosaic() {
    const c = document.createElement("canvas");
    c.width = 240; c.height = 200;
    const g = c.getContext("2d");
    g.fillStyle = "#efe2c0"; g.fillRect(0, 0, 240, 200);
    for (let x = 0; x < 240; x += 10) for (let y = 0; y < 200; y += 10) { g.fillStyle = (x / 10 + y / 10) % 2 ? "rgba(120,90,50,.07)" : "rgba(255,255,255,.1)"; g.fillRect(x, y, 10, 10); }
    for (const [inset, col] of [[6, "#2f5d8a"], [18, "#a8342c"], [30, "#2f5d8a"]]) { g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(inset, inset, 240 - inset * 2, 200 - inset * 2); }
    g.translate(120, 100);
    for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillStyle = i % 2 ? "#a8342c" : "#d9b44a"; g.beginPath(); g.moveTo(0, 0); g.lineTo(8, -38); g.lineTo(-8, -38); g.closePath(); g.fill(); }
    g.fillStyle = "#2f5d8a"; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#efe2c0"; g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  // ---- house upgrades, bought in the Market: each tier is built hidden (its collision switched off) and appears when you own it
  const ext = [null, ...Array.from({ length: 5 }, () => ({ meshes: [], blockers: [] }))];
  let tier = 0;
  const GROUNDS = [232, 278, 28, 58]; // x0, x1, z0, z1: resting here heals faster (the villa's back garden counts too)

  function buildExtensions() {
    const stone = M.travertine, green = lambert(0x5f8a3f), hedge = lambert(0x3f6b34), leaf = lambert(0x2f5a35);
    const gold = lambert(0xd9b44a, { emissive: 0x3d2f05 });
    // a box (or a cone/cylinder) at world coordinates, belonging to one tier; `solid` also makes it block the way
    const piece = (t, geo, mat, x, y, z, sx, sy, sz, solid, round) => {
      const m = shadowed(new T.Mesh(geo, mat));
      m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.visible = false;
      worldScene.add(m); ext[t].meshes.push(m);
      if (solid) ext[t].blockers.push(round ? addBlockerCircle(x, z, sx, y - sy / 2, y + sy / 2, { off: true }) : addBlockerBox(x - sx / 2, x + sx / 2, z - sz / 2, z + sz / 2, y - sy / 2, y + sy / 2, { off: true }));
      return m;
    };
    const CONE = new T.ConeGeometry(1, 1, 8), PYR = new T.ConeGeometry(1, 1, 4);

    // tier 1: a walled garden in front of the door, with a fountain, hedges and cypress trees
    piece(1, BOX, green, 255, 0.05, 37.2, 34, 0.1, 16.4);
    piece(1, BOX, hedge, 238.5, 0.65, 37.2, 1, 1.3, 16, true);
    piece(1, BOX, hedge, 271.5, 0.65, 37.2, 1, 1.3, 16, true);
    piece(1, BOX, hedge, 243.5, 0.65, 29.5, 10, 1.3, 1, true);
    piece(1, BOX, hedge, 266.5, 0.65, 29.5, 10, 1.3, 1, true);
    piece(1, CYL, stone, 246, 0.6, 37, 2.3, 1.2, 2.3, true, true);        // fountain basin (taller than a step, so it blocks you)
    piece(1, CYL, M.water, 246, 1.18, 37, 1.95, 0.1, 1.95);
    piece(1, CYL, stone, 246, 2.0, 37, 0.3, 1.8, 0.3);
    piece(1, CYL, stone, 246, 3.0, 37, 0.8, 0.25, 0.8);
    for (const [cx, cz] of [[241.5, 32.5], [268.5, 32.5], [241.5, 41.5], [268.5, 41.5]]) {
      piece(1, CYL, lambert(0x5c4630), cx, 0.5, cz, 0.18, 1, 0.18);
      piece(1, CONE, leaf, cx, 3.2, cz, 1.2, 5.4, 1.2, true, true);
    }

    // a garage beside the house for every upgrade (not the small house you start with), open to the north
    const gmat = { wall: stone, roof: M.roof, dark: lambert(0x55504a), door: lambert(0x7a5a34) };
    for (const p of Garage.parts(284, 52, "n")) piece(1, BOX, gmat[p.mat], p.x, p.y0 + p.h / 2, p.z, p.w, p.h, p.d, p.solid);
    Garage.register("rome", worldScene, 284, 52, "n", () => tier);

    // tier 2: two wings either side of the house, and a colonnade over the garden path
    for (const wx of [243, 267]) {
      piece(2, BOX, stone, wx, 2, 50, 12, 4, 10, true);
      piece(2, BOX, M.roof, wx, 4.3, 50, 13.2, 0.6, 11.2);
      piece(2, BOX, M.dark, wx, 1.2, 44.9, 2, 2.4, 0.2);
    }
    for (const cx of [240, 245, 265, 270]) piece(2, CYL, M.marble, cx, 2.3, 43.2, 0.45, 4.6, 0.45, true, true);
    piece(2, BOX, M.marble2, 242.5, 4.8, 43.2, 8.6, 0.7, 2);
    piece(2, BOX, M.marble2, 267.5, 4.8, 43.2, 8.6, 0.7, 2);
    piece(2, BOX, M.marble2, 264, 0.6, 35.5, 1.6, 1.2, 1.6, true);        // a statue on its plinth
    piece(2, CYL, M.bronze, 264, 2.2, 35.5, 0.4, 2, 0.4);
    piece(2, new T.SphereGeometry(1, 10, 8), M.bronze, 264, 3.45, 35.5, 0.3, 0.3, 0.3);

    // tier 3: a tower on the roof, a pool behind the house and a gilded pavilion
    piece(3, BOX, stone, 255, 7.45, 50, 7, 5, 6);
    piece(3, PYR, gold, 255, 11.5, 50, 5.4, 3, 5.4).rotation.y = Math.PI / 4;
    piece(3, BOX, M.marble2, 255, 0.06, 66, 22, 0.12, 12);
    piece(3, BOX, M.water, 255, 0.1, 66, 19.6, 0.1, 9.6);
    for (const [cx, cz] of [[268, 70], [273, 70], [268, 75], [273, 75]]) piece(3, CYL, M.marble, cx, 2, cz, 0.4, 4, 0.4, true, true);
    piece(3, PYR, gold, 270.5, 4.9, 72.5, 5.2, 1.8, 5.2).rotation.y = Math.PI / 4;

    // tier 4: a patrician palace behind the pool: a great hall with a columned portico, four corner towers and a dome
    const SPH = new T.SphereGeometry(1, 18, 12);
    piece(4, BOX, stone, 255, 4.5, 96, 36, 9, 14, true);                          // the great hall
    piece(4, BOX, M.roof, 255, 9.5, 96, 38, 1, 16);
    piece(4, BOX, M.marble2, 255, 0.35, 85.6, 26, 0.7, 2.4);                      // steps up to the portico
    piece(4, BOX, M.marble2, 255, 0.9, 86.9, 26, 0.5, 1.6);
    piece(4, BOX, M.dark, 255, 2.4, 88.95, 4.2, 4.6, 0.2);                         // the great door
    for (let i = 0; i < 8; i++) piece(4, CYL, M.marble, 244 + i * 3.14, 4.6, 87.8, 0.5, 8.4, 0.5, true, true);   // the portico columns
    piece(4, BOX, M.marble2, 255, 9.2, 87.8, 26, 1.0, 2.4);
    piece(4, BOX, M.marble2, 255, 10.2, 87.8, 12, 1.2, 2.2);                      // a pediment over the middle
    piece(4, CYL, stone, 255, 11.7, 96, 4.4, 3.6, 4.4);                           // the drum and the dome
    piece(4, SPH, gold, 255, 13.5, 96, 4.4, 3.6, 4.4);
    for (const [cx, cz] of [[238, 90], [272, 90], [238, 102], [272, 102]]) {      // corner towers
      piece(4, CYL, stone, cx, 7, cz, 2.3, 14, 2.3, true, true);
      piece(4, CONE, M.roof, cx, 16, cz, 2.9, 4, 2.9);
    }

    // tier 5: an imperial palace: golden roofs, a triumphal gate at the road and statues along the path
    piece(5, BOX, gold, 255, 10.1, 96, 38.4, 0.5, 16.4);                          // a gilded roof
    for (const [cx, cz] of [[238, 90], [272, 90], [238, 102], [272, 102]]) piece(5, SPH, gold, cx, 15.8, cz, 3.1, 3.1, 3.1);
    piece(5, CYL, gold, 255, 19.6, 96, 0.5, 5, 0.5);                              // a spire over the dome
    for (const px of [247, 263]) piece(5, BOX, M.marble, px, 5, 22.5, 3.2, 10, 3.2, true);   // the triumphal gate
    piece(5, BOX, M.marble2, 255, 10.4, 22.5, 19, 2, 3.2);
    piece(5, BOX, gold, 255, 11.7, 22.5, 19.4, 0.6, 3.5);
    for (const [sx, sz] of [[251, 33], [259, 33], [251, 41], [259, 41]]) {         // statues on plinths along the path
      piece(5, BOX, M.marble2, sx, 0.8, sz, 1.4, 1.6, 1.4, true);
      piece(5, CYL, M.bronze, sx, 2.7, sz, 0.38, 2.2, 0.38);
      piece(5, SPH, M.bronze, sx, 4.0, sz, 0.3, 0.3, 0.3);
    }
  }

  // 0 = the small house you start with; 1, 2, 3 = the upgrades
  function setTier(n) {
    tier = Math.max(0, Math.min(5, n | 0));
    for (let t = 1; t <= 5; t++) {
      const on = t <= tier;
      for (const m of ext[t].meshes) m.visible = on;
      for (const b of ext[t].blockers) b.off = !on;
    }
  }

  // How much faster you recover when resting at home (see Market.REST for the numbers)
  function restBoost(x, z) {
    const inGrounds = x > GROUNDS[0] && x < GROUNDS[1] && z > GROUNDS[2] && z < (tier >= 4 ? 112 : tier >= 3 ? 78 : GROUNDS[3]);
    return inGrounds || inside(x, z) ? [1, 1.5, 2, 3, 4, 5][tier] : 1;
  }

  // Brighten the windows and the room after dark.
  function update(night) {
    if (!glass) return;
    const on = night > 0.4;
    if (on !== lit) { lit = on; glass.color.setHex(on ? 0xffd27a : 0x5a4a30); }
    lamp.intensity = 0.25 + night * 1.0;
  }

  return { X, Z, W, D, inside, build, update, setTier, setDecor, restBoost, get tier() { return tier; } };
})();
