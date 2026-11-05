"use strict";
// Beijing: the Ming capital around 1420 and the city today. Tiananmen, the Forbidden City (its gates, the three great halls and the garden), the hill behind it, the Temple of Heaven, the Drum and
// Bell Towers, a district of hutongs with your courtyard house, the Summer Palace and Kunming Lake in the north-west, the Great Wall on the ridge far to the north, and, today only, Tiananmen
// Square and the skyscrapers of the CBD. Built the first time you travel there, far to the east of Cancún in the same world. Coordinates in this file are metres around the middle of
// Tiananmen Square (x east, z south); world x is BX + x. Depends on world.js (lambert, canvasTex), physics.js and beijing-data.js. Not to scale: the Summer Palace and the Wall are really far out.

const Beijing = (() => {
  const BX = BEIJING_X;
  const BOUNDS_B = { minX: BX - 1050, maxX: BX + 760, minZ: -1260, maxZ: 700 };
  const MAP_B = { x0: BX - 1100, x1: BX + 800, z0: -1280, z1: 720 };
  const SPAWN = { x: BX, z: 90, yaw: 0 };
  const X = (x) => BX + x;

  let built = false, root = null, clock = 0;
  const ancientG = new T.Group(), modernG = new T.Group();      // what exists in only one era
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rnd = mulberry(1420);

  const tileTex = (base, line, rx, ry) => canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.globalAlpha = 0.35; g.lineWidth = 1;
    for (let i = 0; i <= w; i += 16) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, h); g.stroke(); }
    for (let j = 0; j <= h; j += 16) { g.beginPath(); g.moveTo(0, j + 0.5); g.lineTo(w, j + 0.5); g.stroke(); }
  }, rx, ry);
  const C = {
    red: lambert(0xa8281f),
    redDark: lambert(0x7a1c16),
    gold: lambert(0xe2b52a, { emissive: 0x3a2a05 }),
    marble: lambert(0xe9e7df),
    stone: lambert(0xa9a79f),
    brick: lambert(0x77746d),
    tile: lambert(0x45454a),
    blue: lambert(0x2d62b5, { emissive: 0x0a1e40 }),
    wood: lambert(0x6b4a2b),
    green: lambert(0x4a7a35),
    leaf: lambert(0x2f6a30),
    water: lambert(0x2f8f9a, { emissive: 0x0b3d44 }),
    dark: lambert(0x1c1612),
    white: lambert(0xf3f1ea),
    glass: lambert(0x6fa8c9, { emissive: 0x10283a }),
    glassDark: lambert(0x3a5a78, { emissive: 0x0a1624 }),
    road: lambert(0x3a3a3c),
    concrete: lambert(0xb9b7b0),
  };

  // ---------- small building helpers (world coordinates) ----------

  function mbox(parent, cx, y0, cz, w, h, d, m, o = {}) {
    const mesh = new T.Mesh(BOX, m);
    mesh.scale.set(w, h, d); mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    parent.add(mesh);
    const ex = o.era ? { era: o.era } : undefined;
    if (o.solid) mesh.userData.blk = addBlockerBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0, y0 + h, ex);
    if (o.walk) addPlatformBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0 + h, ex);
    if (o.map) MAP_SHAPES.push({ k: "r", x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, c: o.map });
    return mesh;
  }
  function mcyl(parent, cx, y0, cz, r, h, m, o = {}) {
    const mesh = new T.Mesh(CYL, m);
    mesh.scale.set(r, h, r); mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    if (o.solid) addBlockerCircle(cx, cz, r, y0, y0 + h, o.era ? { era: o.era } : undefined);
    if (o.map) MAP_SHAPES.push({ k: "e", cx, cz, ax: r, az: r, c: o.map });
    return mesh;
  }
  // a Chinese roof: a thin overhanging slab with a four-sided pointed roof on it (stack two for a double roof)
  const CONE4 = new T.ConeGeometry(1, 1, 4);
  function roof(parent, cx, y, cz, w, d, h, m) {
    const slab = new T.Mesh(BOX, m); slab.scale.set(w + 3, 0.7, d + 3); slab.position.set(cx, y + 0.35, cz); slab.castShadow = true; parent.add(slab);
    const cone = new T.Mesh(CONE4, m); cone.scale.set(w * 0.76 + 2, h, d * 0.76 + 2); cone.position.set(cx, y + 0.7 + h / 2, cz); cone.rotation.y = Math.PI / 4; cone.castShadow = true; parent.add(cone);
  }
  // Steps up to a platform (edge at (x0, z0), on the `dir` side) from height `base`: each step is 0.56 high, so you can walk up them.
  function stairs(parent, x0, z0, dir, width, base, n, rise = 0.56, tread = 0.9, mat = C.marble, era) {
    for (let k = 1; k <= n; k++) {
      const run = (n - k + 1) * tread, top = base + k * rise;
      let a, b, c, d;
      if (dir === "-x") { a = x0 - run; b = x0; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "+x") { a = x0; b = x0 + run; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "-z") { a = x0 - width / 2; b = x0 + width / 2; c = z0 - run; d = z0; }
      else { a = x0 - width / 2; b = x0 + width / 2; c = z0; d = z0 + run; }
      addPlatformBox(a, b, c, d, top, era ? { era } : undefined);
      const m = new T.Mesh(BOX, mat);
      m.scale.set(b - a, top - base, d - c); m.position.set((a + b) / 2, base + (top - base) / 2, (c + d) / 2);
      m.receiveShadow = true; parent.add(m);
    }
  }
  const sign = (parent, x, y, z, w, h, text, sub, rotY = 0) => {
    const t = canvasTex(256, 80, (g, ww, hh) => { g.fillStyle = "#6a1610"; g.fillRect(0, 0, ww, hh); g.strokeStyle = "#f2d98a"; g.lineWidth = 4; g.strokeRect(4, 4, ww - 8, hh - 8); g.fillStyle = "#f2d98a"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 28px Georgia, serif"; g.fillText(text, ww / 2, sub ? 28 : 40); if (sub) { g.font = "16px Georgia, serif"; g.fillText(sub, ww / 2, 58); } });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: t, side: T.DoubleSide, emissive: 0x201808 }));
    m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m);
  };
  const plane = (w, d, mat, x, y, z, parent = root) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; };
  const flat = (x0, x1, z0, z1, c) => MAP_SHAPES.push({ k: "r", x0: X(x0), x1: X(x1), z0, z1, c });

  // a hill: heightAt (physics.js) makes it walkable, and this draws the same shape as a mesh of revolution
  function hill(cx, cz, r, flatR, h, mat) {
    HILLS.push({ name: "Beijing", x: X(cx), z: cz, r, flat: flatR, h });
    const pts = [];
    for (let i = 0; i <= 24; i++) { const d = r * (1 - i / 24), t = Math.min(1, (r - d) / (r - flatR)); pts.push(new T.Vector2(Math.max(0.01, d), h * t * t * (3 - 2 * t))); }
    mat.side = T.DoubleSide;
    const mesh = new T.Mesh(new T.LatheGeometry(pts.reverse(), 40), mat); mesh.position.set(X(cx), 0, cz); mesh.receiveShadow = true; root.add(mesh);
    return mesh;
  }
  const treeCone = new T.ConeGeometry(1, 1, 7), treeBall = new T.SphereGeometry(1, 8, 6);
  function trees(cx, cz, w, d, n, kind = "cypress") {
    const m = new T.InstancedMesh(kind === "cypress" ? treeCone : treeBall, kind === "cypress" ? C.leaf : C.green, n), o = new T.Object3D();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const x = X(cx) + (rnd() - 0.5) * w, z = cz + (rnd() - 0.5) * d;
      if (blockedAt(x, z, groundAt(x, z)) || groundAt(x, z) < -0.1) continue;
      const s = 3 + rnd() * 3, y = groundAt(x, z);
      if (kind === "cypress") { o.position.set(x, y + s * 1.4, z); o.scale.set(s * 0.45, s * 2.8, s * 0.45); } else { o.position.set(x, y + s * 1.9, z); o.scale.set(s, s * 0.9, s); }
      o.updateMatrix(); m.setMatrixAt(k++, o.matrix);
      if (kind !== "cypress") addBlockerCircle(x, z, 0.5, 0, 4);
    }
    m.count = k; m.castShadow = true; m.frustumCulled = false; root.add(m);
  }

  // ---------- the ground and the paved axis ----------

  function buildGround() {
    plane(2200, 2300, lambert(0x657f49), X(-150), -0.03, -280);                                                     // the plain round Beijing
    plane(60, 1950, new T.MeshLambertMaterial({ map: tileTex("#b9b6ac", "#6a675f", 4, 150) }), X(0), 0.02, -300);   // the central axis, from the Bell Tower to the Temple of Heaven
    plane(250, 330, new T.MeshLambertMaterial({ map: tileTex("#c4c1b6", "#7a766c", 25, 33) }), X(0), 0.03, 55);     // the great square
    plane(240, 430, new T.MeshLambertMaterial({ map: tileTex("#aaa79c", "#6a675f", 24, 43) }), X(0), 0.04, -355);   // the courtyards of the Forbidden City
    flat(-125, 125, -110, 220, "#c9c6ba"); flat(-120, 120, -560, -140, "#b5b2a6"); flat(-30, 30, -870, 700, "#b9b6ac");
    flat(-1100, -500, -1280, -480, "#6fa06a"); flat(-1100, 800, -1280, -1000, "#7e8a63");
  }

  // ---------- Tiananmen: the red gate with its five doorways ----------

  function buildTiananmen() {
    const g = root, z = -62;
    const piers = [[-50, -33], [-27, -18], [-12, -3], [3, 12], [18, 27], [33, 50]];           // between them, five passages
    for (const [a, b] of piers) mbox(g, X((a + b) / 2), 0, z, b - a, 11, 20, C.red, { solid: true, map: "#a8281f" });
    mbox(g, X(0), 7.5, z, 102, 3.5, 20, C.redDark);                                                 // the lintel over the doorways
    mbox(g, X(0), 11, z, 82, 9, 14, C.red, { solid: true });
    for (let k = -3; k <= 3; k++) mbox(g, X(k * 12), 11.5, z + 7.1, 2, 6.5, 0.3, C.dark, { cast: false });   // windows
    roof(g, X(0), 20, z, 82, 14, 6, C.gold);
    roof(g, X(0), 27, z, 66, 10, 5, C.gold);
    mbox(g, X(0), 0, z + 14, 112, 0.5, 14, C.marble, { cast: false });                              // the marble in front
    for (const sx of [-1, 1]) {
      mcyl(g, X(sx * 38), 0, z + 30, 0.9, 11, C.marble, { solid: true });                              // the carved marble columns, huabiao
      mbox(g, X(sx * 38), 8, z + 30, 5, 0.6, 0.6, C.marble); mbox(g, X(sx * 38), 0, z + 30, 3, 1.2, 3, C.marble);
      mbox(g, X(sx * 28), 0, z + 22, 3, 2.4, 6, C.stone, { solid: true });                              // a stone lion
    }
    sign(g, X(0), 33, z + 7.2, 14, 3, "天安门", "Tiananmen", 0);
    // the walls of the Imperial City: east and west of the gate, and the old walled court in front of it (ancient only)
    for (const sx of [-1, 1]) {
      mbox(ancientG, X(sx * 100), 0, z + 6, 100, 9, 4, C.red, { solid: true, era: "ancient" }); mbox(ancientG, X(sx * 100), 9, z + 6, 102, 1.2, 5, C.gold);
      mbox(ancientG, X(sx * 62), 0, 40, 3, 6, 200, C.red, { solid: true, era: "ancient" }); mbox(ancientG, X(sx * 62), 6, 40, 4, 0.8, 200, C.gold);   // the long covered galleries of the old court
    }
    // today: the portrait over the middle door, flags, the Monument to the People's Heroes and the great halls beside the square
    mbox(modernG, X(0), 12, z + 7.2, 6, 7, 0.3, lambert(0xb08060), { cast: false });
    for (const sx of [-1, 1]) mcyl(modernG, X(sx * 46), 0, 40, 0.15, 18, C.white);
    mcyl(modernG, X(0), 0, 40, 0.18, 30, C.white); mbox(modernG, X(2.4), 26, 40, 4.5, 3, 0.1, lambert(0xd02020), { cast: false });
    mbox(modernG, X(0), 0, 125, 18, 1.2, 28, C.stone, { solid: true, era: "modern" }); mbox(modernG, X(0), 1.2, 125, 11, 1.2, 20, C.stone, { solid: true, era: "modern" });
    mbox(modernG, X(0), 2.4, 125, 5, 34, 5, C.concrete, { solid: true, era: "modern" });
    mbox(modernG, X(-150), 0, 90, 70, 26, 160, C.concrete, { solid: true, era: "modern", map: "#9a9890" }); mbox(modernG, X(150), 0, 90, 70, 26, 160, C.concrete, { solid: true, era: "modern", map: "#9a9890" });
    for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) mcyl(modernG, X(sx * 150 - sx * 33), 0, 20 + k * 15, 1.1, 22, C.white);
  }

  // ---------- the Forbidden City ----------

  const HW = 120, ZN = -560, ZS = -140;
  function buildForbidden() {
    const g = root, midz = (ZN + ZS) / 2, len = ZS - ZN;
    // the red walls, with a gold-tiled cap, and the moat outside
    for (const sx of [-1, 1]) {
      mbox(g, X(sx * HW), 0, midz, 4, 9, len, C.red, { solid: true, map: "#a8281f" }); mbox(g, X(sx * HW), 9, midz, 5.4, 1.4, len + 1, C.gold);
      plane(10, len + 30, C.water, X(sx * (HW + 9)), 0.02, midz);
    }
    for (const sx of [-1, 1]) {                                                                      // the north wall, with the Gate of Divine Might in the middle (passage 12 wide)
      mbox(g, X(sx * (HW + 8) / 2 + sx * 3), 0, ZN, HW - 6 + 4, 9, 4, C.red, { solid: true }); mbox(g, X(sx * (HW + 8) / 2 + sx * 3), 9, ZN, HW - 5, 1.4, 5.4, C.gold);
      mbox(g, X(sx * (HW + 8) / 2 + sx * 3), 0, ZS, HW - 16, 9, 4, C.red, { solid: true }); mbox(g, X(sx * (HW + 8) / 2 + sx * 3), 9, ZS, HW - 15, 1.4, 5.4, C.gold);
    }
    plane(240, 10, C.water, X(0), 0.02, ZN - 9);
    for (const sx of [-1, 1]) for (const zz of [ZN, ZS]) {                                           // the four corner towers
      mbox(g, X(sx * (HW + 1)), 0, zz, 14, 11, 14, C.red, { solid: true }); roof(g, X(sx * (HW + 1)), 11, zz, 14, 14, 6, C.gold); roof(g, X(sx * (HW + 1)), 18, zz, 8, 8, 4, C.gold);
    }
    // the Gate of Divine Might (north) and the Meridian Gate (south), each with a passage through it
    for (const [zz, big] of [[ZN, false], [ZS - 12, true]]) {
      const w = big ? 70 : 30, pw = big ? 12 : 10;
      for (const sx of [-1, 1]) mbox(g, X(sx * (pw / 2 + (w - pw) / 4)), 0, zz, (w - pw) / 2, 13, 26, C.red, { solid: true });
      mbox(g, X(0), 8, zz, pw + 2, 5, 26, C.redDark);
      mbox(g, X(0), 13, zz, w - 6, 8, 18, C.red, { solid: true });
      roof(g, X(0), 21, zz, w - 6, 18, 5, C.gold); if (big) roof(g, X(0), 27, zz, w - 22, 12, 4, C.gold);
    }
    for (const sx of [-1, 1]) {                                                                      // the two wings of the Meridian Gate, reaching forward
      mbox(g, X(sx * 62), 0, ZS + 20, 12, 12, 56, C.red, { solid: true }); roof(g, X(sx * 62), 12, ZS + 38, 12, 12, 5, C.gold); roof(g, X(sx * 62), 12, ZS + 4, 12, 12, 5, C.gold);
    }
    sign(g, X(0), 31, ZS - 24.2, 16, 3, "午门", "the Meridian Gate", Math.PI);
    // the Golden Water Stream and its marble bridges
    plane(220, 7, C.water, X(0), 0.05, -215);
    for (let k = -2; k <= 2; k++) mbox(g, X(k * 14), 0, -215, 9, 0.55, 8, C.marble, { walk: true });
    // the three great halls on their three-tier marble terrace
    const hz = -300;
    mbox(g, X(0), 0, hz, 100, 2.4, 92, C.marble, { walk: true, map: "#e9e7df" });
    mbox(g, X(0), 2.4, hz, 84, 2.4, 76, C.marble, { walk: true });
    mbox(g, X(0), 4.8, hz, 68, 2.4, 60, C.marble, { walk: true });
    stairs(g, X(0), hz + 46, "+z", 16, 0, 4, 0.6, 0.9); stairs(g, X(0), hz + 38, "+z", 14, 2.4, 4, 0.6, 0.9); stairs(g, X(0), hz + 30, "+z", 12, 4.8, 4, 0.6, 0.9);
    for (let k = 0; k < 12; k++) for (const sx of [-1, 1]) mbox(g, X(sx * (6 + k * 2.6) + (sx > 0 ? 0 : 0)), 7.2, hz + 30.2, 0.4, 1.0, 0.4, C.marble, { cast: false });
    const hall = (zz, w, d, h, roofH, double) => {
      mbox(g, X(0), 7.2, zz, w, h, d, C.red, { solid: true, map: "#a8281f" });
      for (let k = 0; k < Math.floor(w / 5); k++) mbox(g, X(-w / 2 + 2.5 + k * 5), 7.2, zz + d / 2 + 0.3, 1.2, h, 1.2, C.redDark);   // the columns across its front
      roof(g, X(0), 7.2 + h, zz, w, d, roofH, C.gold);
      if (double) roof(g, X(0), 7.2 + h + roofH + 0.6, zz, w * 0.7, d * 0.7, roofH * 0.8, C.gold);
    };
    hall(hz, 46, 22, 9, 6, true);                                                                    // the Hall of Supreme Harmony
    mbox(g, X(0), 0, -375, 40, 1.4, 40, C.marble, { walk: true });
    mbox(g, X(0), 1.4, -375, 32, 1.4, 32, C.marble, { walk: true });
    hall(-375, 18, 18, 8, 7, false);                                                                 // the Hall of Central Harmony
    hall(-408, 34, 18, 8, 6, true);                                                                  // the Hall of Preserving Harmony
    for (const [zz, w] of [[-455, 40], [-478, 18], [-502, 38]]) {                                    // the Inner Court: Heavenly Purity, Union, Earthly Tranquility
      mbox(g, X(0), 0, zz, w + 8, 1.6, 20, C.marble, { walk: true }); mbox(g, X(0), 1.6, zz, w, 8, 14, C.red, { solid: true }); roof(g, X(0), 9.6, zz, w, 14, 5.5, C.gold);
    }
    // the long halls along both sides of the courtyards
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) {
      const zz = -190 - k * 36;
      mbox(g, X(sx * 98), 0, zz, 16, 7, 28, C.red, { solid: true }); roof(g, X(sx * 98), 7, zz, 16, 28, 4.5, C.gold);
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const zz = -440 - k * 38;
      mbox(g, X(sx * 85), 0, zz, 22, 6, 26, C.red, { solid: true }); roof(g, X(sx * 85), 6, zz, 22, 26, 4, C.gold);
    }
    // the Imperial Garden at the back
    mbox(g, X(0), 0, -535, 18, 3, 14, C.stone, { solid: true }); roof(g, X(0), 3, -535, 14, 10, 5, C.gold);
    trees(0, -535, 200, 40, 26, "ball");
    mbox(g, X(0), 0, -535, 0.1, 0.1, 0.1, C.stone, { cast: false });
    // each little pavilion on a terrace in the garden
    for (const sx of [-1, 1]) { mbox(g, X(sx * 48), 0, -538, 10, 4.5, 10, C.red, { solid: true }); roof(g, X(sx * 48), 4.5, -538, 10, 10, 4.5, C.blue); }
  }

  // ---------- Jingshan Hill ----------

  function buildJingshan() {
    const cz = -660;
    hill(0, cz, 95, 35, 32, lambert(0x4c7a3a));
    for (let k = 0; k < 5; k++) {                                                                  // five pavilions on the ridge
      const a = Math.PI + (k - 2) * 0.4, rr = k === 2 ? 0 : 24, x = Math.cos(a) * rr * (k === 2 ? 0 : 1), z = cz + Math.sin(a) * rr * 0.5;
      const bx = X(x), y = heightAt(bx, z);
      const big = k === 2;
      const w = big ? 10 : 6, h = big ? 6.5 : 4.5;
      mbox(root, bx, y, z, w, 0.8, w, C.marble, { cast: false }); mbox(root, bx, y + 0.8, z, w - 2, h, w - 2, C.red, { solid: true }); roof(root, bx, y + 0.8 + h, z, w - 2, w - 2, big ? 7 : 4.5, k % 2 ? C.blue : C.gold);
    }
    trees(0, cz, 190, 190, 70, "cypress");
  }

  // ---------- the Temple of Heaven ----------

  function buildTemple() {
    const g = root, cz = 560;
    plane(320, 300, lambert(0x5d7d45), X(0), 0.0, cz);
    flat(-150, 150, 410, 710, "#78a05a");
    // three round marble terraces, each 0.7 m above the last (so you can walk up)
    for (const [r, top] of [[40, 0.7], [33, 1.4], [26, 2.1]]) { addPlatformCircle(X(0), cz, r, top); const m = new T.Mesh(CYL, C.marble); m.scale.set(r, top, r); m.position.set(X(0), top / 2, cz); m.receiveShadow = true; g.add(m); }
    mcyl(g, X(0), 2.1, cz, 13, 14, C.red, { solid: true, map: "#2d62b5" });                         // the round Hall of Prayer for Good Harvests
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; mcyl(g, X(Math.cos(a) * 13.2), 2.1, cz + Math.sin(a) * 13.2, 0.55, 12, C.redDark); }
    for (const [y, r, h] of [[16.1, 17, 5], [20.6, 13.5, 4.5], [24.6, 10, 4.2]]) { const c = new T.Mesh(new T.ConeGeometry(1, 1, 24), C.blue); c.scale.set(r, h, r); c.position.set(X(0), y + h / 2, cz); c.castShadow = true; g.add(c); mcyl(g, X(0), y - 0.4, cz, r * 0.9, 0.8, C.marble); }
    const fin = new T.Mesh(new T.SphereGeometry(1.3, 10, 8), C.gold); fin.position.set(X(0), 30, cz); g.add(fin);
    // the stairway south, the Imperial Vault and the approach
    stairs(g, X(0), cz + 41, "+z", 14, 0, 1, 0.7, 1.4);
    mcyl(g, X(0), 0, cz - 70, 7, 5, C.red, { solid: true }); { const c = new T.Mesh(new T.ConeGeometry(1, 1, 16), C.blue); c.scale.set(9, 4.5, 9); c.position.set(X(0), 7.2, cz - 70); g.add(c); }
    mbox(g, X(0), 0, cz - 120, 12, 6, 10, C.red, { solid: true }); roof(g, X(0), 6, cz - 120, 12, 10, 5, C.blue);
    mbox(g, X(0), 0, cz + 150, 90, 0.2, 90, C.marble, { cast: false });
    trees(0, cz, 300, 280, 90, "cypress");
  }

  // ---------- the Drum Tower and the Bell Tower ----------

  function buildTowers() {
    const g = root;
    mbox(g, X(0), 0, -800, 44, 15, 30, C.red, { solid: true, map: "#a8281f" });                       // the Drum Tower
    for (let k = -2; k <= 2; k++) mbox(g, X(k * 8), 0, -784.8, 5, 8, 0.5, C.dark, { cast: false });
    mbox(g, X(0), 15, -800, 38, 7, 24, C.red, { solid: true }); roof(g, X(0), 22, -800, 38, 24, 5, C.tile); roof(g, X(0), 27.6, -800, 24, 14, 4, C.tile);
    stairs(g, X(0), -785, "+z", 8, 0, 26, 0.56, 0.9, C.stone);
    mbox(g, X(0), 0, -865, 26, 22, 26, C.stone, { solid: true, map: "#8a8880" });                    // the Bell Tower
    mbox(g, X(0), 22, -865, 22, 6, 22, C.red, { solid: true }); roof(g, X(0), 28, -865, 22, 22, 6, C.tile); roof(g, X(0), 34.6, -865, 12, 12, 4, C.tile);
    const bell = new T.Mesh(new T.CylinderGeometry(2.2, 3, 4.5, 14), lambert(0x6a4a1a)); bell.position.set(X(0), 25, -865); g.add(bell);
    sign(g, X(0), 11, -784, 9, 2.2, "鼓楼", "Drum Tower", 0);
  }

  // ---------- the hutongs and your courtyard house ----------

  let halls = 0;
  function courtyard(cx, cz, w, d, gateSide, big) {
    const g = root, hh = big ? 3.8 : 3.4;
    const wall = (x, z, ww, dd) => mbox(g, x, 0, z, ww, hh, dd, C.brick, { solid: true });
    wall(cx, cz - d / 2, w, 0.7); wall(cx - w / 2, cz, 0.7, d); wall(cx + w / 2, cz, 0.7, d);
    const gapW = 3.4;
    wall(cx - (w + gapW) / 4 - gapW / 4 - 0.01, cz + d / 2, (w - gapW) / 2, 0.7); wall(cx + (w + gapW) / 4 + gapW / 4 + 0.01, cz + d / 2, (w - gapW) / 2, 0.7);
    mbox(g, cx, hh - 0.6, cz + d / 2, gapW + 1.2, 0.6, 0.9, C.redDark); roof(g, cx, hh, cz + d / 2, gapW + 1, 0.8, 1.2, C.tile);
    // the rooms round the yard
    const hall = mbox(g, cx, 0, cz - d / 2 + 4, w - 7, 3.4, 5.5, C.redDark, { solid: true }); roof(g, cx, 3.4, cz - d / 2 + 4, w - 7, 5.5, 2.2, C.tile);
    if (typeof Interiors !== "undefined" && halls++ % 3 === 1) Interiors.register({ x: cx, z: cz - d / 2 + 4, w: w - 7, d: 5.5, h: 3.4, kinds: "beijingHall", side: "S", signY: 3.05, parent: g, blk: hall.userData.blk, tint: () => 0x7a1c16, hide: () => { hall.visible = false; } });                // the north hall of some courtyards is a shop you can walk into (interiors.js)
    for (const sx of [-1, 1]) { mbox(g, cx + sx * (w / 2 - 3), 0, cz, 4.5, 3, d - 14, C.redDark, { solid: true }); roof(g, cx + sx * (w / 2 - 3), 3, cz, 4.5, d - 14, 1.8, C.tile); }
    trees(cx - X(0), cz, 3, 3, 1, "ball");
  }
  const HOME = { x: -250, z: 85, hw: 6.2, hd: 5 };
  function buildHutong() {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) courtyard(X(-340 + i * 54 + 20), -400 + j * 44 + 20, 38, 30);
    for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) courtyard(X(-250 + sx * 50), 220 + j * 0 + 40 + j * 40, 34, 28);
    MAP_SHAPES.push({ k: "r", x0: X(-345), x1: X(-170), z0: -410, z1: -215, c: "#8a8780" }, { k: "r", x0: X(-310), x1: X(-190), z0: 255, z1: 380, c: "#8a8780" });
    // your house: one main room round a little yard, in a lane west of the square
    const g = root, x = HOME.x, z = HOME.z;
    mbox(g, X(x), 0, z, HOME.hw * 2 + 6, 0.15, HOME.hd * 2 + 8, C.stone, { walk: true });
    mbox(g, X(x - HOME.hw), 0, z, 0.6, 3.4, HOME.hd * 2, C.redDark, { solid: true });
    mbox(g, X(x + HOME.hw), 0, z, 0.6, 3.4, HOME.hd * 2, C.redDark, { solid: true });
    mbox(g, X(x), 0, z - HOME.hd, HOME.hw * 2, 3.4, 0.6, C.redDark, { solid: true });
    for (const sx of [-1, 1]) mbox(g, X(x + sx * (HOME.hw * 0.62)), 0, z + HOME.hd, HOME.hw * 0.76, 3.4, 0.6, C.redDark, { solid: true });   // the front, with a door gap in the middle
    mbox(g, X(x), 2.4, z + HOME.hd, HOME.hw * 0.5, 1, 0.6, C.redDark);
    Doors.add(g, X(x), z + HOME.hd, "x", HOME.hw * 0.48, 2.4, 1, null);
    roof(g, X(x), 3.4, z, HOME.hw * 2, HOME.hd * 2, 2.6, C.tile);
    mbox(g, X(x - 3.6), 0, z - HOME.hd + 1.6, 1.8, 0.7, 3, C.wood, { cast: false }); mbox(g, X(x - 3.6), 0.7, z - HOME.hd + 1.6, 1.8, 0.35, 3, lambert(0xb3262b), { cast: false });   // your bed
    for (const sx of [-1, 1]) mbox(g, X(x + sx * 11), 0, z + 9, 0.6, 3.4, 18, C.brick, { solid: true });                                           // the little yard's walls
    mbox(g, X(x - 11), 0, z + 18, 11, 3.4, 0.6, C.brick, { solid: true }); mbox(g, X(x + 11), 0, z + 18, 11, 3.4, 0.6, C.brick, { solid: true });
    sign(g, X(x), 4.5, z + HOME.hd + 0.4, 3.2, 0.9, "我家", "your home", Math.PI);
    if (typeof Souvenirs !== "undefined") Souvenirs.addShelf(g, { x: X(-244.3), z: 85.5, face: "w", floor: 0.15 });     // the souvenir shelf, on the east wall
    if (typeof Shopkeep !== "undefined") Shopkeep.addShelf(g, { x: X(-244.3), z: 82.4, face: "w", floor: 0.15 });          // the shelf for the goods you buy in the shops, beside it
  }

  // ---------- Kunming Lake and the Summer Palace ----------

  const LAKE = { x: -700, z: -740, a: 190, b: 130 }, ISLAND = { x: -640, z: -760, r: 22 };
  const inEllipse = (x, z) => ((x - X(LAKE.x)) / LAKE.a) ** 2 + ((z - LAKE.z) / LAKE.b) ** 2 < 1;
  let boating = false;                                           // in a dragon boat: afloat, not swimming
  const inWater = (x, z) => inEllipse(x, z) && groundAt(x, z) < 0.2;
  const DOCK = { x: -878, z: -680 };                              // the pier where the dragon boat races start (west shore)
  const COURSE = { x0: -830, x1: -580, lanes: [-695, -685, -675, -665] };   // 250 m east across the lake, four lanes
  function buildLake() {
    const g = root;
    const water = new T.Mesh(new T.CircleGeometry(1, 56), C.water); water.rotation.x = -Math.PI / 2; water.scale.set(LAKE.a, LAKE.b, 1); water.position.set(X(LAKE.x), 0.06, LAKE.z); g.add(water);
    MAP_SHAPES.push({ k: "e", cx: X(LAKE.x), cz: LAKE.z, ax: LAKE.a, az: LAKE.b, c: "#4aa9b4" });
    // the island with the Dragon King Temple, and the Seventeen-Arch Bridge to it
    addPlatformCircle(X(ISLAND.x), ISLAND.z, ISLAND.r, 0.5);
    const isl = new T.Mesh(CYL, C.stone); isl.scale.set(ISLAND.r, 0.5, ISLAND.r); isl.position.set(X(ISLAND.x), 0.25, ISLAND.z); g.add(isl);
    mbox(g, X(ISLAND.x), 0.5, ISLAND.z, 9, 4.5, 9, C.red, { solid: true }); roof(g, X(ISLAND.x), 5, ISLAND.z, 9, 9, 4, C.gold); roof(g, X(ISLAND.x), 9.4, ISLAND.z, 5, 5, 3, C.gold);
    mbox(g, X(-566), 0, ISLAND.z, 110, 0.7, 7, C.marble, { walk: true, map: "#e9e7df" });                // the bridge deck, level with the island
    for (let k = 0; k < 17; k++) for (const sz of [-3.55, 3.55]) mbox(g, X(-616 + k * 6.4), 0, ISLAND.z + sz, 3.6, 0.8, 0.12, C.dark, { cast: false });   // the seventeen arches
    for (let k = 0; k <= 34; k++) for (const sz of [-3.3, 3.3]) mbox(g, X(-620 + k * 3.2), 0.7, ISLAND.z + sz, 0.5, 1.1, 0.5, C.marble, { cast: false });
    mbox(g, X(DOCK.x + 6), 0, DOCK.z, 24, 0.4, 7, C.wood, { walk: true, cast: false });                    // the pier for the dragon boat races
    for (let k = 0; k < 4; k++) for (const sz of [-3.3, 3.3]) mbox(g, X(DOCK.x - 4 + k * 7), 0.4, DOCK.z + sz, 0.3, 1.2, 0.3, C.wood, { cast: false });
    for (const sz of [-1, 1]) { mcyl(g, X(DOCK.x - 8), 0, DOCK.z + sz * 5, 0.25, 7, C.red); mbox(g, X(DOCK.x - 8), 6, DOCK.z + sz * 5, 1.6, 0.4, 1.6, C.gold, { cast: false }); }
    sign(g, X(DOCK.x - 8), 4.2, DOCK.z, 5.6, 1.5, "龙舟", "dragon boats", -Math.PI / 2);
    // the shore: the Long Corridor along the north bank, the Marble Boat, willows
    hill(-700, -985, 140, 55, 46, lambert(0x4c7a3a));
    const post = new T.InstancedMesh(BOX, C.red, 140), o = new T.Object3D();
    for (let k = 0; k < 70; k++) for (const sz of [0, 1]) { o.position.set(X(-870 + k * 4.6), 2, -862 + sz * 5); o.scale.set(0.5, 4, 0.5); o.updateMatrix(); post.setMatrixAt(k * 2 + sz, o.matrix); }
    post.frustumCulled = false; g.add(post);
    mbox(g, X(-705), 4, -859.5, 324, 0.8, 8, C.blue, { cast: true }); mbox(g, X(-705), 0, -859.5, 324, 0.25, 8, C.stone, { walk: true, cast: false });
    const by = heightAt(X(-700), -960);                                                                // the Tower of Buddhist Incense, on Longevity Hill
    for (let t = 0; t < 4; t++) { mcyl(g, X(-700), by + t * 5.5, -960, 9 - t * 1.6, 5.5, t % 2 ? C.red : C.redDark, { solid: t === 0 }); roof(g, X(-700), by + t * 5.5 + 5.5, -960, 14 - t * 3, 14 - t * 3, 2, C.gold); }
    for (const [px, pz] of [[-770, -905], [-630, -905], [-700, -925]]) { const y = heightAt(X(px), pz); mbox(g, X(px), y, pz, 9, 5, 9, C.red, { solid: true }); roof(g, X(px), y + 5, pz, 9, 9, 4, C.gold); }
    mbox(g, X(-840), 0, -792, 22, 2.4, 7, C.marble, { solid: true }); mbox(g, X(-840), 2.4, -792, 12, 5, 5, C.white, { solid: true }); roof(g, X(-840), 7.4, -792, 12, 5, 3, C.gold);   // the Marble Boat
    trees(-700, -800, 440, 160, 40, "ball"); trees(-700, -940, 300, 150, 30, "cypress");
  }

  // ---------- the Great Wall on the ridge ----------

  function buildWall() {
    const g = root, wz = -1150;
    for (const [hx, h, r] of [[-330, 36, 420], [120, 46, 420], [560, 38, 420]]) hill(hx, -1190, r, 150, h, lambert(0x6c7a4a));
    const seg = 2, n = 450, x0 = -380;
    const m = new T.InstancedMesh(BOX, lambert(0x8a8478, { map: tileTex("#9a9486", "#4a463c", 1, 1) }), n), o = new T.Object3D();
    for (let k = 0; k < n; k++) {
      const x = x0 + k * seg, wx = X(x), gy = heightAt(wx, wz), top = gy + 5.5;
      o.position.set(wx, (top + gy - 2) / 2, wz); o.scale.set(seg + 0.05, top - gy + 2, 6.5); o.updateMatrix(); m.setMatrixAt(k, o.matrix);
      addPlatformBox(wx - seg / 2, wx + seg / 2, wz - 3.25, wz + 3.25, top);
      if (k % 36 === 18) { mbox(g, wx, top, wz, 9, 9, 9, C.brick, { solid: true }); roof(g, wx, top + 9, wz, 9, 9, 3.5, C.tile); }   // a watchtower
    }
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m);
    const sx = X(80), base = heightAt(sx, wz + 14);                                                    // steps up to the wall, in front of the viewing point
    stairs(g, sx, wz + 3.25, "+z", 8, base, Math.ceil((heightAt(sx, wz) + 5.5 - base) / 0.56), 0.56, 0.9, C.stone);
    MAP_SHAPES.push({ k: "r", x0: X(x0), x1: X(x0 + n * seg), z0: wz - 4, z1: wz + 4, c: "#7a756a" });
    trees(80, -1100, 700, 120, 60, "cypress");
  }

  // ---------- today: the CBD ----------

  function buildCBD() {
    const g = modernG;
    let towers = 0;
    plane(1800, 22, C.road, X(-100), 0.05, -24, g); plane(22, 760, C.road, X(300), 0.05, 150, g); plane(22, 600, C.road, X(-420), 0.05, 150, g);          // roads
    for (const [x, z, w, d, h] of [[470, 130, 40, 40, 110], [470, 240, 38, 38, 140], [470, 340, 44, 40, 90], [545, 90, 38, 36, 170], [640, 130, 40, 40, 120], [640, 330, 42, 40, 100], [700, 230, 36, 36, 150], [545, 320, 40, 40, 80]]) {
      const tower = mbox(g, X(x), 0, z, w, h, d, k2(x), { solid: true, era: "modern", map: "#6fa8c9" });
      if (typeof Interiors !== "undefined" && [0, 2, 3, 4, 6, 7].includes(towers++)) Interiors.register({ x: X(x), z, w, d, h, kinds: "beijingCbd", side: "S", parent: g, era: "modern", blk: tower.userData.blk, tint: () => (x % 2 ? 0x8fbad4 : 0x6f8fae), upper: k2(x), hide: () => { tower.visible = false; } });   // the foot of some towers is a shop you can walk into (interiors.js)
    }
    mbox(g, X(560), 0, 215, 34, 255, 34, C.glass, { solid: true, era: "modern", map: "#6fa8c9" }); mbox(g, X(560), 255, 215, 24, 20, 24, C.glassDark);        // China Zun
    for (let k = 0; k < 14; k++) mbox(g, X(-440 - (k % 2) * 8), 0, 420 + k * 20, 10, 14 + (k % 3) * 6, 14, C.concrete, { solid: true, era: "modern" });
    function k2(x) { return x % 2 ? C.glass : C.glassDark; }
  }


  // ---------- the courtyard house grows: six upgrades from the builder in the market, each added on top of the last (see market.js: HOUSES_B). The first brings a garden and a garage. ----------
  const hT = [null];
  let hTier = 0, hPending = 0;
  function buildHouseTiers() {
    const x0 = HOME.x, z0 = HOME.z;
    for (let t = 1; t <= 6; t++) { const g = new T.Group(); g.visible = false; root.add(g); hT[t] = { g, blockers: [] }; }
    const tb = (t, cx, y0, cz, w, h, d, m, solid = true) => { const me = mbox(hT[t].g, X(cx), y0, cz, w, h, d, m); if (solid) hT[t].blockers.push(addBlockerBox(X(cx) - w / 2, X(cx) + w / 2, cz - d / 2, cz + d / 2, y0, y0 + h)); return me; };
    const tc = (t, cx, y0, cz, r, h, m, solid = true) => { const me = mcyl(hT[t].g, X(cx), y0, cz, r, h, m); if (solid) hT[t].blockers.push(addBlockerCircle(X(cx), cz, r, y0, y0 + h)); return me; };
    const tcone = (t, cx, y0, cz, r, h, m) => { const me = new T.Mesh(treeCone, m); me.scale.set(r, h, r); me.position.set(X(cx), y0 + h / 2, cz); me.castShadow = true; hT[t].g.add(me); return me; };
    const tball = (t, cx, y, cz, r, m) => { const me = new T.Mesh(treeBall, m); me.scale.set(r, r, r); me.position.set(X(cx), y, cz); me.castShadow = true; hT[t].g.add(me); return me; };
    const troof = (t, cx, y, cz, w, d, h, m) => roof(hT[t].g, X(cx), y, cz, w, d, h, m);
    const pine = (t, cx, cz, h = 5) => { tc(t, cx, 0, cz, 0.25, h * 0.45, C.wood, false); tcone(t, cx, h * 0.3, cz, 1.1, h, C.leaf); };
    const pond = (t, cx, cz, w, d) => { tb(t, cx, -0.02, cz, w + 1.2, 0.3, d + 1.2, C.stone, false); tb(t, cx, 0.26, cz, w, 0.05, d, C.water, false); };
    const fountain = (t, cx, cz) => { tc(t, cx, 0, cz, 1.7, 0.55, C.stone); tc(t, cx, 0.5, cz, 1.35, 0.1, C.water, false); tc(t, cx, 0.5, cz, 0.25, 1.3, C.stone, false); tball(t, cx, 1.9, cz, 0.35, C.water); };
    const gate = (t, cx, cz, w, h, roofCol) => { for (const sx of [-1, 1]) tb(t, cx + sx * (w / 2 - 0.4), 0, cz, 0.8, h, 1.2, C.red); tb(t, cx, h - 0.4, cz, w, 0.8, 1.4, C.redDark, false); troof(t, cx, h + 0.4, cz, w, 1.4, 1.6, roofCol); };
    // 1: a walled garden in front of the house with a moon gate, pines and a fountain, and a garage to the east (open to the west: stand at its front and press F)
    for (const [cx, cz, w, d] of [[x0 - 13, z0 + 14, 0.5, 24], [x0 + 13, z0 + 14, 0.5, 24]]) tb(1, cx, 0, cz, w, 1.2, d, C.brick, false);
    tb(1, x0 - 7.5, 0, z0 + 26, 11, 1.4, 0.5, C.brick, false); tb(1, x0 + 7.5, 0, z0 + 26, 11, 1.4, 0.5, C.brick, false);
    tb(1, x0, 0, z0 + 26, 4, 0.12, 0.5, C.stone, false);
    for (const [px, pz] of [[x0 - 10, z0 + 8], [x0 + 10, z0 + 8], [x0 - 10, z0 + 22], [x0 + 10, z0 + 22]]) pine(1, px, pz);
    fountain(1, x0, z0 + 15);
    const gm = { wall: C.brick, roof: C.redDark, dark: C.dark, door: C.wood };
    for (const p of Garage.parts(x0 + 22, z0, "w")) tb(1, p.x, p.y0, p.z, p.w, p.h, p.d, gm[p.mat], !!p.solid);
    Garage.register("beijing", hT[1].g, X(x0 + 22), z0, "w", () => hTier);
    // 2: a second courtyard to the west: a gate tower and rooms round a yard
    tb(2, x0 - 27, 0, z0 - 6, 22, 0.15, 20, C.stone, false);
    tb(2, x0 - 27, 0, z0 - 14, 20, 3.3, 5, C.redDark); troof(2, x0 - 27, 3.3, z0 - 14, 20, 5, 2.4, C.tile);
    for (const sx of [-1, 1]) { tb(2, x0 - 27 + sx * 9, 0, z0 - 4, 4, 3, 14, C.redDark); troof(2, x0 - 27 + sx * 9, 3, z0 - 4, 4, 14, 1.8, C.tile); }
    gate(2, x0 - 27, z0 + 5, 7, 4.2, C.gold); tb(2, x0 - 34, 0, z0 + 5, 5, 3.2, 0.8, C.brick); tb(2, x0 - 20, 0, z0 + 5, 5, 3.2, 0.8, C.brick);
    pine(2, x0 - 27, z0 - 4, 6);
    // 3: a pavilion by a pond with a stone bridge, a rockery and a screen wall behind
    pond(3, x0 - 27, z0 + 20, 14, 9);
    tb(3, x0 - 27, 0, z0 + 20, 3, 0.5, 11, C.marble, false);
    tb(3, x0 - 36, 0, z0 + 20, 3.4, 3.2, 3.4, C.red); troof(3, x0 - 36, 3.2, z0 + 20, 3.4, 3.4, 2.4, C.blue);
    for (let k = 0; k < 4; k++) tball(3, x0 - 19 + (k % 2) * 1.4, 0.9 + k * 0.5, z0 + 24 - k * 1.6, 1.3 - k * 0.15, C.stone);
    tb(3, x0, 0, z0 - 12, 30, 2.6, 0.6, C.brick); tb(3, x0, 2.6, z0 - 12, 31, 0.4, 1, C.tile, false);
    // 4: the scholar's garden: a pavilion on the water, a zigzag bridge, bamboo and a long covered walk
    pond(4, x0 + 28, z0 + 16, 18, 14);
    tb(4, x0 + 28, 0, z0 + 16, 4.4, 0.7, 4.4, C.stone, false); tb(4, x0 + 28, 0.7, z0 + 16, 3, 3, 3, C.red); troof(4, x0 + 28, 3.7, z0 + 16, 3.2, 3.2, 2.6, C.blue);
    for (let k = 0; k < 4; k++) tb(4, x0 + 21 + k * 1.8, 0.05, z0 + 12 + (k % 2) * 3, 2.4, 0.3, 2, C.marble, false);
    for (let k = 0; k < 8; k++) tc(4, x0 + 24 + k * 1.1, 0, z0 + 28 + (k % 3) * 0.6, 0.12, 4.6 + (k % 2), C.leaf, false);
    for (let k = 0; k < 6; k++) tc(4, x0 + 18 + k * 4, 0, z0 - 2, 0.25, 3.2, C.red, false);
    tb(4, x0 + 28, 3.2, z0 - 2, 22, 0.5, 3, C.tile, false);
    // 5: red walls and gold roofs, stone lions at a great gate, and a hall on a marble terrace behind the house
    tb(5, x0, 0, z0 - 12, 30, 4.4, 0.8, C.red, false);
    tb(5, x0, 0, z0 + 29, 3, 0.1, 6, C.marble, false);
    gate(5, x0, z0 + 29, 12, 5.6, C.gold);
    for (const sx of [-1, 1]) { tb(5, x0 + sx * 8, 0, z0 + 31, 2.2, 2, 3, C.stone); tball(5, x0 + sx * 8, 2.4, z0 + 31, 0.9, C.stone); }
    tb(5, x0, 0, z0 - 26, 26, 1.2, 14, C.marble, false); tb(5, x0, 1.2, z0 - 26, 18, 6, 9, C.red); troof(5, x0, 7.2, z0 - 26, 18, 9, 5, C.gold);
    for (let k = 0; k < 6; k++) tc(5, x0 - 7 + k * 2.8, 1.2, z0 - 21, 0.4, 6, C.redDark, false);
    // 6: the imperial palace: a double golden roof on a three-tier terrace, a dragon screen wall, a marble bridge and lanterns
    tb(6, x0, 1.2, z0 - 26, 30, 0.5, 18, C.marble, false); tb(6, x0, 1.7, z0 - 26, 24, 0.5, 14, C.marble, false);
    troof(6, x0, 12.4, z0 - 26, 11, 6, 3.2, C.gold);
    tb(6, x0 - 9, 0, z0 + 14, 0.8, 4.2, 8, C.red); tb(6, x0 - 9, 4.2, z0 + 14, 1.2, 0.4, 9, C.gold, false);
    for (let k = 0; k < 4; k++) tb(6, x0 - 9.5, 0.8 + (k % 2) * 1.4, z0 + 11 + k * 2, 0.15, 0.7, 1.4, k % 2 ? C.gold : C.blue, false);                                         // the dragon on the screen wall
    for (let k = 0; k < 8; k++) { tc(6, x0 - 11 + k * 3.1, 0, z0 + 8, 0.07, 2.6, C.wood, false); tball(6, x0 - 11 + k * 3.1, 2.7, z0 + 8, 0.35, C.redDark); }                  // lanterns
    tb(6, x0 - 36, 0, z0 + 4, 6, 0.45, 2.6, C.marble, false);
    hT.forEach((t) => { if (t) t.g.visible = false; });
    setHouseTier(hPending);
  }
  function setHouseTier(t) {
    hPending = t; hTier = t;
    for (let i = 1; i <= 6; i++) if (hT[i]) { hT[i].g.visible = t >= i; hT[i].blockers.forEach((b) => { b.off = t < i; }); }
  }

  // ---------- the wushu courtyard: a round tiled floor with a ring of red posts, for martial-arts bouts (see online.js) ----------
  const WUSHU = { x: 330, z: -250 };
  function buildWushu() {
    const g = root, wx = X(WUSHU.x), wz = WUSHU.z;
    const disc = new T.Mesh(new T.CircleGeometry(24, 40), new T.MeshLambertMaterial({ map: tileTex("#b8504a", "#6a2a26", 4, 4) })); disc.rotation.x = -Math.PI / 2; disc.position.set(wx, 0.05, wz); disc.receiveShadow = true; g.add(disc);
    const inner = new T.Mesh(new T.CircleGeometry(21, 40), new T.MeshLambertMaterial({ map: tileTex("#d9c9a0", "#8a7a50", 4, 4) })); inner.rotation.x = -Math.PI / 2; inner.position.set(wx, 0.07, wz); inner.receiveShadow = true; g.add(inner);
    MAP_SHAPES.push({ k: "e", cx: wx, cz: wz, ax: 24, az: 24, c: "#c9a060" });
    for (let k = 0; k < 20; k++) {                                                                              // a ring of red posts with gold caps and lanterns, with the entrance gap to the west
      const a = (k / 20) * Math.PI * 2;
      if (Math.abs(((a - Math.PI + Math.PI * 2) % (Math.PI * 2)) - Math.PI) < 0.32) continue;
      const px = wx + Math.cos(a) * 25.5, pz = wz + Math.sin(a) * 25.5;
      mcyl(g, px, 0, pz, 0.35, 3.4, C.red, { solid: true }); mcyl(g, px, 3.4, pz, 0.45, 0.3, C.gold); mcyl(g, px, 3.9, pz, 0.28, 0.5, C.redDark, {});
    }
    for (const sz of [-1, 1]) { mbox(g, wx + 30, 0, wz + sz * 7, 0.6, 1.8, 6, C.wood, { solid: true }); for (let k = 0; k < 4; k++) mbox(g, wx + 29.6, 0.7 + (k % 2) * 0.4, wz + sz * 7 + (k - 1.5) * 1.4, 0.2, 0.15, 1.2, C.dark, { cast: false }); }   // weapon racks beside it
    mbox(g, wx - 31, 0, wz, 0.4, 0.2, 0.4, C.stone, { cast: false });
    for (const sz of [-1, 1]) mcyl(g, wx - 28, 0, wz + sz * 5.5, 0.3, 5.2, C.red, { solid: true });
    mbox(g, wx - 28, 5.2, wz, 0.5, 0.5, 12, C.gold); sign(g, wx - 28, 4.2, wz, 8, 1.6, "武术", "wushu courtyard", Math.PI / 2);
  }
  // ---------- the xiangqi pavilion: a stone table with a board, two stools and a little blue roof, west of the great square ----------
  const XQP = { x: -170, z: 215 };
  function buildXiangqiPavilion() {
    const g = root, px = X(XQP.x), pz = XQP.z;
    mbox(g, px, 0, pz, 12, 0.5, 10, C.stone, { cast: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mcyl(g, px + sx * 5, 0.5, pz + sz * 4, 0.3, 4.2, C.red, { solid: true });
    roof(g, px, 4.7, pz, 11, 9, 2.8, C.blue);
    mbox(g, px, 0.5, pz, 3, 1.1, 3, C.stone, { solid: true });
    const board = canvasTex(128, 128, (c, w, h) => { c.fillStyle = "#c9a265"; c.fillRect(0, 0, w, h); c.strokeStyle = "#4a3418"; c.lineWidth = 2; for (let k = 0; k < 9; k++) { c.beginPath(); c.moveTo(14 + k * 12, 10); c.lineTo(14 + k * 12, 118); c.stroke(); } for (let k = 0; k < 10; k++) { c.beginPath(); c.moveTo(14, 10 + k * 12); c.lineTo(110, 10 + k * 12); c.stroke(); } });
    const top = new T.Mesh(new T.PlaneGeometry(2.6, 2.6), new T.MeshLambertMaterial({ map: board })); top.rotation.x = -Math.PI / 2; top.position.set(px, 1.62, pz); g.add(top);
    for (const sz of [-1, 1]) mcyl(g, px, 0.5, pz + sz * 3.4, 0.45, 0.6, C.wood, { cast: false });
    sign(g, px, 3.6, pz + 5.2, 5, 1.3, "象棋", "xiangqi", 0);
    MAP_SHAPES.push({ k: "r", x0: px - 6, x1: px + 6, z0: pz - 5, z1: pz + 5, c: "#4a7ab0" });
  }
  const atXiangqi = () => Math.abs(player.x - X(XQP.x)) < 8 && Math.abs(player.z - (XQP.z + 5.5)) < 5;
  const atWushu = () => Math.abs(player.x - X(WUSHU.x - 29)) < 7 && Math.abs(player.z - WUSHU.z) < 8;

  // ---------- the people ----------

  const people = { list: [], body: null, head: null, hat: null };
  const WEAR_MING = [0xb3262b, 0x2f6b8f, 0xd9a73a, 0x2f7a4a, 0x7a2d8a, 0x555555, 0xe8e0cc, 0x8a5a2a].map((c) => new T.Color(c));
  const WEAR_MODERN_B = [0x2b3a55, 0x454545, 0xb23b3b, 0x3f6b4a, 0xd9d9d9, 0xe0b040, 0x2e2e2e, 0x5577aa].map((c) => new T.Color(c));
  const HAT_MING = [0x222222, 0x3a2a1a, 0x7a1c16, 0x2d4a7a, 0x333333].map((c) => new T.Color(c));      // black caps
  const HAT_MODERN_B = [0xe6cf8a, 0xd02020, 0xf1ead8, 0x2c7fe0, 0x333333].map((c) => new T.Color(c));
  function buildPeople(count = 80) {
    const bodyGeo = new T.CylinderGeometry(0.3, 0.42, 1.35, 8); bodyGeo.translate(0, 0.68, 0);
    const headGeo = new T.SphereGeometry(0.19, 8, 6); headGeo.translate(0, 1.58, 0);
    const hatGeo = new T.SphereGeometry(0.24, 8, 6); hatGeo.scale(1, 0.5, 1); hatGeo.translate(0, 1.76, 0);
    const body = new T.InstancedMesh(bodyGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const head = new T.InstancedMesh(headGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const hat = new T.InstancedMesh(hatGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const skins = [0xe8c39a, 0xd9a77a, 0xf0d0aa, 0xcf9a6a].map((c) => new T.Color(c));
    const hubs = [[0, 80, 90, 80], [250, 110, 40, 20], [-250, 90, 30, 25], [0, -230, 90, 60], [0, -400, 60, 100], [-270, -310, 70, 80], [0, 560, 60, 80], [-480, -780, 60, 60], [0, -700, 40, 30]];
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 40; t++) {
        const [hx, hz, hw, hd] = hubs[Math.floor(rnd() * hubs.length)];
        x = hx + (rnd() - 0.5) * 2 * hw; z = hz + (rnd() - 0.5) * 2 * hd;
        if (canMove(X(x), z, X(x) + 0.1, z) && !blockedAt(X(x), z, groundAt(X(x), z))) break;
      }
      people.list.push({ x: X(x), z, a: rnd() * 6.28, v: 0.8 + rnd() * 0.8, t: rnd() * 5, phase: rnd() * 6, ci: Math.floor(rnd() * 8), ti: Math.floor(rnd() * 5), hatOn: rnd() < 0.5 });
      head.setColorAt(i, skins[Math.floor(rnd() * skins.length)]);
      body.setColorAt(i, WEAR_MING[0]); hat.setColorAt(i, HAT_MING[0]);
    }
    for (const m of [body, head, hat]) { m.instanceColor.needsUpdate = true; m.frustumCulled = false; root.add(m); }
    body.castShadow = true;
    people.body = body; people.head = head; people.hat = hat;
  }
  const _o = new T.Object3D();
  function updatePeople(dt) {
    const { list, body, head, hat } = people;
    if (!body) return;
    for (let i = 0; i < list.length; i++) {
      const c = list[i], down = (c.down || 0) > 0;
      if (down) c.down -= dt;
      else {
        c.t -= dt;
        if (c.t <= 0) { c.a += (rnd() - 0.5) * 1.6; c.t = 2 + rnd() * 5; }
        const nx = c.x + Math.sin(c.a) * c.v * dt, nz = c.z + Math.cos(c.a) * c.v * dt;
        if (canMove(c.x, c.z, nx, nz) && !inWater(nx, nz)) { c.x = nx; c.z = nz; } else { c.a += Math.PI * (0.5 + rnd() * 0.8); c.t = 1.5; }
      }
      const bob = down ? 0 : Math.abs(Math.sin(clock * 5 + c.phase)) * 0.06, tilt = down ? 1.35 * Math.min(1, c.down / 0.35) : 0;
      _o.position.set(c.x, groundAt(c.x, c.z) + bob + tilt * 0.3, c.z); _o.rotation.set(-tilt, c.a, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      body.setMatrixAt(i, _o.matrix); head.setMatrixAt(i, _o.matrix);
      if (!c.hatOn) { _o.scale.set(0, 0, 0); _o.updateMatrix(); }
      hat.setMatrixAt(i, _o.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hat.instanceMatrix.needsUpdate = true;
  }

  // ---------- put it together ----------

  function build(sc) {
    if (built) return;
    built = true; root = new T.Group(); sc.add(root);
    root.add(ancientG, modernG);
    buildGround();
    buildTiananmen();
    buildForbidden();
    buildJingshan();
    buildTemple();
    buildTowers();
    buildHutong();
    buildHouseTiers();
    buildLake();
    buildWushu();
    buildXiangqiPavilion();
    buildWall();
    buildCBD();
    buildPeople();
    Stalls.build(root, X(250), 110, "beijing");
    setEra(false);
  }
  function setEra(modern) {
    ancientG.visible = !modern; modernG.visible = modern;
    const { list, body, hat } = people;
    if (body) {
      list.forEach((c, i) => { body.setColorAt(i, (modern ? WEAR_MODERN_B : WEAR_MING)[c.ci]); hat.setColorAt(i, (modern ? HAT_MODERN_B : HAT_MING)[c.ti]); });
      body.instanceColor.needsUpdate = hat.instanceColor.needsUpdate = true;
    }
  }
  const show = (v) => { if (root) root.visible = v; };
  const homeInside = (x, z) => Math.abs(x - X(HOME.x)) < HOME.hw - 0.3 && Math.abs(z - HOME.z) < HOME.hd - 0.3;
  const homeSpot = () => ({ x: X(HOME.x), z: HOME.z + 1.4 });
  function update(dt, px, pz) {
    if (!built) return;
    clock += dt;
    if (Math.abs(px - BX) > 1400) return;
    updatePeople(dt);
  }
  const swimMul = () => (!boating && inWater(player.x, player.z) ? 0.8 : 1);
  const avatarDrop = () => (!boating && inWater(player.x, player.z) ? -0.9 : 0);
  const camDrop = () => (!boating && inWater(player.x, player.z) ? -0.9 : 0);
  const atDock = () => Math.abs(player.x - X(DOCK.x - 4)) < 8 && Math.abs(player.z - DOCK.z) < 6;

  return {
    build, show, setEra, update, homeInside, setTier: setHouseTier, get tier() { return hTier; }, homeSpot, SPAWN, BOUNDS: BOUNDS_B, MAP: MAP_B,
    inWater, swimMul, avatarDrop, camDrop, X, LAKE, DOCK, COURSE, atDock, WUSHU, atWushu, atXiangqi, setBoating: (v) => { boating = !!v; }, hits: () => null, people: () => people.list, peopleMesh: () => people.body,
    get built() { return built; },
    inHome: (x, z) => Math.abs(x - X(HOME.x)) < 16 && Math.abs(z - HOME.z) < 16,
  };
})();
