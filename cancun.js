"use strict";
// Cancún and Chichén Itzá, in the Yucatán: the great Maya city of Chichén Itzá (the stepped pyramid El Castillo, the Great Ball Court, the
// Temple of the Warriors with its columns, the round observatory El Caracol, the Sacred Cenote and the white road), and the Caribbean
// coast to its east: Tulum's temple and a fishing village in Maya days (c. 1000 AD), the Hotel Zone of Cancún today. Built the first time you
// travel there, far to the east of Delhi in the same world. Coordinates in this file are metres around El Castillo (x east, z south); world x
// is CX + x. Depends on world.js (lambert, canvasTex), physics.js and cancun-data.js. Not to scale: the coast is really about 200 km away.

const Cancun = (() => {
  const CX = CANCUN_X;
  const BOUNDS_C = { minX: CX - 430, maxX: CX + 1180, minZ: -385, maxZ: 420 };
  const MAP_C = { x0: CX - 450, x1: CX + 1000, z0: -395, z1: 430 };
  const SPAWN = { x: CX, z: 98, yaw: 0 };
  const X = (x) => CX + x;

  let built = false, root = null, modernNow = false, clock = 0, serpent = null;
  const ancientG = new T.Group(), modernG = new T.Group();      // what exists in only one era
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rnd = mulberry(1000);

  const limeTex = (base, speck, rx, ry) => canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = speck; g.globalAlpha = 0.25; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2.5, 1 + Math.random() * 2); }
    g.globalAlpha = 1; g.strokeStyle = "rgba(90,80,60,.25)"; g.strokeRect(0.5, 0.5, w - 1, h - 1);
  }, rx, ry);
  const C = {
    lime: lambert(0xe4dcc3, { map: limeTex("#ffffff", "#8a7f66", 1, 1) }),
    lime2: lambert(0xcfc5a6),
    stone: lambert(0xb8ad92),
    dark: lambert(0x1c1612),
    wood: lambert(0x6b4a2b),
    thatch: lambert(0xb08a4a),
    green: lambert(0x3f6b2f),
    leaf: lambert(0x2f7a3a),
    water: lambert(0x2fbfd0, { emissive: 0x0b3d44 }),
    sand: lambert(0xf1e3b8),
    cenote: lambert(0x1f6f6a, { emissive: 0x06201f }),
    red: lambert(0xb23a2a),
    white: lambert(0xf3f1ea),
    glass: lambert(0x6fa8c9, { emissive: 0x10283a }),
    road: lambert(0x3a3a3c),
    gold: lambert(0xd9a928, { emissive: 0x3d2f05 }),
  };

  // ---------- small building helpers (world coordinates) ----------

  function mbox(parent, cx, y0, cz, w, h, d, m, o = {}) {
    const mesh = new T.Mesh(BOX, m);
    mesh.scale.set(w, h, d); mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    parent.add(mesh);
    const ex = o.era ? { era: o.era } : undefined;      // era: this thing (and its collision) exists only in the Maya days ("ancient") or only today ("modern")
    if (o.solid) addBlockerBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0, y0 + h, ex);
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
  // Steps climbing to a platform whose edge is at (x0, z0): they lie on the `dir` side of it and go down away from it.
  function steps(parent, x0, z0, dir, width, n, rise, tread, mat, era) {
    for (let k = 1; k <= n; k++) {
      const run = (n - k + 1) * tread, top = k * rise;
      let a, b, c, d;
      if (dir === "-x") { a = x0 - run; b = x0; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "+x") { a = x0; b = x0 + run; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "-z") { a = x0 - width / 2; b = x0 + width / 2; c = z0 - run; d = z0; }
      else { a = x0 - width / 2; b = x0 + width / 2; c = z0; d = z0 + run; }
      addPlatformBox(a, b, c, d, top, era ? { era } : undefined);
      const m = new T.Mesh(BOX, mat || C.lime);
      m.scale.set(b - a, top, d - c); m.position.set((a + b) / 2, top / 2, (c + d) / 2);
      m.receiveShadow = true; m.castShadow = k % 6 === 0;
      parent.add(m);
    }
  }
  const sign = (parent, x, y, z, w, h, text, sub, rotY = 0) => {
    const t = canvasTex(256, 80, (g, ww, hh) => { g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, ww, hh); g.strokeStyle = "#f2d98a"; g.lineWidth = 4; g.strokeRect(4, 4, ww - 8, hh - 8); g.fillStyle = "#f2d98a"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 28px sans-serif"; g.fillText(text, ww / 2, 30); g.font = "bold 17px sans-serif"; g.fillText(sub, ww / 2, 58); });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: t, side: T.DoubleSide, emissive: 0x201808 }));
    m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m);
  };
  const plane = (w, d, mat, x, y, z) => { const m = new T.Mesh(new T.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; root.add(m); return m; };

  // ---------- the ground, the white roads and the sea ----------

  function buildGround() {
    plane(1700, 1500, lambert(0x4a6e30), X(-60), -0.03, 10);                                                     // the jungle floor
    plane(300, 250, new T.MeshLambertMaterial({ map: limeTex("#ece4cc", "#9a8f70", 30, 25) }), X(0), 0.03, 10);   // the great plaza
    plane(11, 235, new T.MeshLambertMaterial({ map: limeTex("#f3eedb", "#a89d80", 1, 24) }), X(0), 0.04, -125);   // the sacbé, north to the cenote
    plane(690, 11, new T.MeshLambertMaterial({ map: limeTex("#f3eedb", "#a89d80", 69, 1) }), X(450), 0.04, 78);    // the white road east to the coast
    plane(125, 1500, C.sand, X(852), 0.0, 10);                                                                    // the beach
    MAP_SHAPES.push({ k: "r", x0: X(-150), x1: X(150), z0: -115, z1: 135, c: "#e8dfc4" }, { k: "r", x0: X(-5), x1: X(5), z0: -240, z1: -10, c: "#f3eedb" }, { k: "r", x0: X(0), x1: X(790), z0: 73, z1: 83, c: "#f3eedb" },
      { k: "r", x0: X(790), x1: X(910), z0: -385, z1: 420, c: "#f1e3b8" }, { k: "r", x0: X(910), x1: X(1000), z0: -395, z1: 430, c: "#5ec8d4" });
  }

  // ---------- El Castillo: nine terraces, 91 steps on each side and a temple on top ----------

  function buildCastillo() {
    const g = root, H = 24, TIERS = 9, base = 27.5, topHalf = 9, th = H / TIERS;
    for (let k = 0; k < TIERS; k++) {
      const half = base - ((base - topHalf - 2) / (TIERS - 1)) * k;
      mbox(g, X(0), k * th, 0, half * 2, th, half * 2, k % 2 ? C.lime2 : C.lime, { map: k === 0 ? "#cfc5a6" : undefined });   // the terraces are only to look at: you climb the stairways
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBlockerBox(X(sx > 0 ? 4.6 : -base), X(sx > 0 ? base : -4.6), sz > 0 ? 4.6 : -base, sz > 0 ? base : -4.6, 0, H);   // four solid corners, with the stairways between them
    mbox(g, X(0), H, 0, topHalf * 2 + 1, 0.5, topHalf * 2 + 1, C.lime, { walk: true });                          // the top platform
    const n = 91, rise = H / n, tread = (base - topHalf) / n;
    steps(g, X(0), -topHalf - 0.5, "-z", 9, n, rise, tread);                                                       // north (the serpent stairway)
    steps(g, X(0), topHalf + 0.5, "+z", 9, n, rise, tread);
    steps(g, X(-topHalf - 0.5), 0, "-x", 9, n, rise, tread);
    steps(g, X(topHalf + 0.5), 0, "+x", 9, n, rise, tread);
    // the temple of Kukulcán on top: walls with a doorway on each side, a roof and a roof comb
    const ty = H + 0.5, tw = 6.2;
    for (const [dx, dz] of [[-tw, 0], [tw, 0], [0, -tw], [0, tw]]) mbox(g, X(dx * 0.82), ty, dz * 0.82, dx ? 1.4 : tw * 1.9, 6.5, dz ? 1.4 : tw * 1.9, C.lime, { solid: true });
    mbox(g, X(0), ty + 6.5, 0, tw * 2 + 1.8, 0.9, tw * 2 + 1.8, C.lime2);
    mbox(g, X(0), ty + 7.4, 0, tw * 1.4, 2.6, tw * 1.4, C.lime);
    for (const [dx, dz, w, d] of [[0, -(tw * 0.82 + 0.75), 4.2, 0.1], [0, tw * 0.82 + 0.75, 4.2, 0.1], [-(tw * 0.82 + 0.75), 0, 0.1, 4.2], [tw * 0.82 + 0.75, 0, 0.1, 4.2]]) mbox(g, X(dx), ty, dz, w, 4.2, d, C.dark, { cast: false });   // the doorways
    mbox(g, X(0), ty + 6.4, 0, 6.5, 0.2, 6.5, C.dark, { cast: false });
    // the carved serpent heads at the foot of the north stairway
    for (const sx of [-4.7, 4.7]) {
      mbox(g, X(sx), 0, -base - 1.2, 2.2, 1.6, 3.2, C.stone, { solid: true });
      const eye = new T.Mesh(new T.SphereGeometry(0.28, 8, 6), C.dark); eye.position.set(X(sx), 1.25, -base - 2.7); g.add(eye);
    }
    // the equinox: a zigzag of shadow slides down the north stairway (shown on the festival days, see Festival)
    serpent = new T.Group(); serpent.visible = false; g.add(serpent);
    const run = base - topHalf, dark = new T.MeshBasicMaterial({ color: 0x15110c, transparent: true, opacity: 0.8 });
    for (let k = 0; k < 7; k++) {
      const t = (k + 0.5) / 7, z = -topHalf - 0.5 - t * run * 1.0, y = H - t * H + 0.55;
      const tri = new T.Mesh(new T.ConeGeometry(0.9, 1.7, 3), dark); tri.rotation.z = Math.PI; tri.position.set(X(-4.1), y, z); tri.rotation.x = -0.75; serpent.add(tri);
    }
    const head = new T.Mesh(new T.SphereGeometry(0.9, 10, 8), dark); head.scale.set(1, 0.7, 1.5); head.position.set(X(-4.1), 0.7, -base - 0.6); serpent.add(head);
  }

  // ---------- the Great Ball Court and the skull platform ----------

  function buildBallCourt() {
    const g = root, cx = -150, len = 70, z0 = -35;
    plane(30, len, C.lime2, X(cx), 0.05, z0);
    for (const sx of [-1, 1]) {
      mbox(g, X(cx + sx * 19), 0, z0, 8, 8, len, C.lime, { solid: true, map: "#cfc5a6" });                         // the two long walls
      mbox(g, X(cx + sx * 14.5), 0, z0, 3, 2.2, len, C.lime2, { solid: true });                                     // the sloping benches along their feet
      mbox(g, X(cx + sx * 19), 8, z0, 9, 0.5, len + 1, C.lime2);
      const ring = new T.Mesh(new T.TorusGeometry(1.3, 0.3, 8, 18), C.stone); ring.rotation.y = Math.PI / 2; ring.position.set(X(cx + sx * 15), 6.4, z0); g.add(ring);   // the stone ring high on each wall
      mbox(g, X(cx + sx * 15.3), 5.9, z0 - 4, 0.4, 3.2, 8, C.stone, { cast: false });                              // carved panels
    }
    mbox(g, X(cx), 0, z0 - len / 2 - 4, 26, 7, 7, C.lime, { solid: true, map: "#cfc5a6" });                          // the temple at the north end
    mbox(g, X(cx), 7, z0 - len / 2 - 4, 28, 0.6, 9, C.lime2);
    mbox(g, X(cx), 0, z0 + len / 2 + 7, 14, 4.5, 6, C.lime, { solid: true });                                         // the small temple at the south end
    mbox(g, X(cx), 4.5, z0 + len / 2 + 7, 15, 0.5, 7, C.lime2);
    // the Tzompantli: a low platform covered in rows of skulls
    mbox(g, X(-48), 0, -32, 13, 2.2, 6.5, C.lime, { solid: true, map: "#cfc5a6" });
    const skulls = new T.InstancedMesh(new T.SphereGeometry(0.22, 7, 5), C.white, 66), o = new T.Object3D();
    for (let r = 0; r < 3; r++) for (let i = 0; i < 22; i++) { o.position.set(X(-54 + i * 0.57), 0.5 + r * 0.6, -28.7); o.updateMatrix(); skulls.setMatrixAt(r * 22 + i, o.matrix); }
    g.add(skulls);
  }

  // ---------- the Temple of the Warriors and its columns ----------

  function buildWarriors() {
    const g = root, cx = 105, cz = -45;
    for (let k = 0; k < 4; k++) { const half = 20 - k * 3.4; mbox(g, X(cx), k * 2.2, cz, half * 2, 2.2, half * 2, k % 2 ? C.lime2 : C.lime, { walk: k === 3, map: k === 0 ? "#cfc5a6" : undefined }); }
    steps(g, X(cx - 9.8), cz, "-x", 9, 19, 0.46, 0.55);                                                              // the stairway on the west side
    addBlockerBox(X(cx - 20), X(cx + 20), cz - 20, cz - 4.6, 0, 8.7); addBlockerBox(X(cx - 20), X(cx + 20), cz + 4.6, cz + 20, 0, 8.7);   // the terraces are solid, except along the stairway
    addBlockerBox(X(cx - 9.8), X(cx + 20), cz - 4.6, cz + 4.6, 0, 8.7);
    const ty = 8.8;
    mbox(g, X(cx), ty, cz, 13, 5, 11, C.lime, { solid: true });
    mbox(g, X(cx), ty + 5, cz, 14.4, 0.7, 12.4, C.lime2);
    mbox(g, X(cx - 6.6), ty, cz, 0.3, 3.4, 4, C.dark);                                                                  // the doorway, west
    for (const dz of [-3.2, 0, 3.2]) mcyl(g, X(cx - 8), ty, cz + dz, 0.55, 4.6, C.stone, { solid: true });            // the serpent columns in front of it
    mbox(g, X(cx - 3), ty, cz, 2.4, 0.8, 1.4, C.stone);                                                              // the Chac Mool, reclining with a bowl
    // the Group of the Thousand Columns: rows of columns once holding up a roof
    for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) mcyl(g, X(78 + c * 6.2), 0, 8 + r * 6, 0.55, 3.2, r % 2 ? C.stone : C.lime2, { solid: true });
    mbox(g, X(108), 0, 25, 62, 0.15, 36, C.lime2, { cast: false });
    // the Platform of Venus
    mbox(g, X(50), 0, 62, 16, 2.6, 16, C.lime, { walk: true, map: "#cfc5a6" });
    for (const [dx, dz, dir] of [[0, -8.05, "-z"], [0, 8.05, "+z"], [-8.05, 0, "-x"], [8.05, 0, "+x"]]) steps(g, X(50 + dx), 62 + dz, dir, 4, 6, 0.43, 0.6);
  }

  // ---------- El Caracol, the observatory ----------

  function buildCaracol() {
    const g = root, cx = -75, cz = -135;
    mbox(g, X(cx), 0, cz, 32, 2.4, 22, C.lime, { walk: true, map: "#cfc5a6" });
    mbox(g, X(cx), 2.4, cz, 17, 2.2, 17, C.lime2, { walk: true });
    steps(g, X(cx), cz + 11, "+z", 8, 5, 0.48, 0.7);                                                                 // up the front of the first platform
    steps(g, X(cx), cz + 8.5, "+z", 5, 10, 0.46, 0.6);
    mcyl(g, X(cx), 4.6, cz, 5.6, 6.5, C.lime, { solid: true });
    mcyl(g, X(cx), 11.1, cz, 4, 3.4, C.lime2, { solid: true });
    const dome = new T.Mesh(new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.lime); dome.scale.set(4.2, 2.4, 4.2); dome.position.set(X(cx), 14.5, cz); dome.castShadow = true; g.add(dome);
    for (const a of [0.6, 2.1, 3.7, 5.2]) mbox(g, X(cx + Math.cos(a) * 3.95), 12.2, cz + Math.sin(a) * 3.95, 0.5, 0.9, 0.5, C.dark);   // the observing slits
  }

  // ---------- the Sacred Cenote ----------

  function buildCenote() {
    const g = root, cx = 0, cz = -235, R = 30;
    const pool = new T.Mesh(new T.CircleGeometry(R, 32), C.cenote); pool.rotation.x = -Math.PI / 2; pool.position.set(X(cx), 0.02, cz); g.add(pool);
    addBlockerCircle(X(cx), cz, R - 1, 0, 5);                                                                          // you cannot walk on the water
    const rim = new T.Mesh(new T.RingGeometry(R - 0.5, R + 8, 32), lambert(0x6f6a58)); rim.rotation.x = -Math.PI / 2; rim.position.set(X(cx), 0.05, cz); g.add(rim);
    for (let i = 0; i < 30; i++) {                                                                                      // a rim of broken limestone cliff
      const a = (i / 30) * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.28) continue;   // a gap on the south side, where the causeway arrives
      const h = 3.2 + rnd() * 2.5;
      mbox(g, X(cx + Math.cos(a) * (R + 2)), 0, cz + Math.sin(a) * (R + 2), 7, h, 5, C.stone, { solid: true });
    }
    mbox(g, X(cx), 0, cz + R + 3, 9, 1.2, 8, C.lime, { walk: true });                                                    // the offering platform on the edge
    MAP_SHAPES.push({ k: "e", cx: X(cx), cz, ax: R + 6, az: R + 6, c: "#3f8f88" });
  }

  // ---------- jungle, people, the casita, the market ----------

  function buildJungle() {
    const trunk = new T.InstancedMesh(new T.CylinderGeometry(0.25, 0.4, 7, 6), C.wood, 520), crown = new T.InstancedMesh(new T.SphereGeometry(1, 8, 6), C.leaf, 520), o = new T.Object3D();
    let n = 0;
    for (let t = 0; t < 4000 && n < 520; t++) {
      const x = -430 + rnd() * 1200, z = -385 + rnd() * 800;
      if (x > -290 && x < 210 && z > -290 && z < 200) continue;               // keep the site clear
      if (Math.abs(x) < 8 && z < 0 && z > -250) continue;                       // and the white roads
      if (z > 64 && z < 94 && x > 0) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < 32) continue;                 // and the cenote
      if (x > 770) continue;                                                     // and the beach
      if (x > 600 && Math.abs(z) < 60 && x < 800) continue;
      const s = 0.8 + rnd() * 0.9;
      o.position.set(X(x), 3.5 * s, z); o.scale.set(s, s, s); o.rotation.set(0, 0, 0); o.updateMatrix(); trunk.setMatrixAt(n, o.matrix);
      o.position.set(X(x), 8.4 * s, z); o.scale.set(4 * s, 3 * s, 4 * s); o.updateMatrix(); crown.setMatrixAt(n, o.matrix);
      n++;
    }
    trunk.count = crown.count = n;
    for (const m of [trunk, crown]) { m.frustumCulled = false; m.castShadow = true; root.add(m); }
  }

  const people = { list: [], body: null, head: null, hat: null };
  const WEAR_MAYA = [0xf1ead8, 0xb3262b, 0x2f6b8f, 0xd9a73a, 0x3f8a5a, 0x7a4a2a, 0xe8e0cc, 0x8a3a6a].map((c) => new T.Color(c));
  const WEAR_MODERN = [0xe23b3b, 0x2f8fe0, 0xf2c21b, 0x35b86a, 0xff8c3a, 0xffffff, 0x9a4fd0, 0x1f1f1f].map((c) => new T.Color(c));
  const HAT_MAYA = [0x2f8f4a, 0xd9341f, 0x2c7fe0, 0xf2c21b, 0xffffff].map((c) => new T.Color(c));      // feathered headbands
  const HAT_MODERN = [0xe6cf8a, 0xf1ead8, 0xd9b868, 0xffffff, 0x2c7fe0].map((c) => new T.Color(c));    // straw hats and caps
  function buildPeople(count = 70) {
    const bodyGeo = new T.CylinderGeometry(0.3, 0.42, 1.35, 8); bodyGeo.translate(0, 0.68, 0);
    const headGeo = new T.SphereGeometry(0.19, 8, 6); headGeo.translate(0, 1.58, 0);
    const hatGeo = new T.SphereGeometry(0.26, 8, 6); hatGeo.scale(1, 0.55, 1); hatGeo.translate(0, 1.78, 0);
    const body = new T.InstancedMesh(bodyGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const head = new T.InstancedMesh(headGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const hat = new T.InstancedMesh(hatGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const skins = [0xc9956b, 0xa8724c, 0x8d5a38, 0xd9a77a, 0xf0c9a0].map((c) => new T.Color(c));
    const hubs = [[0, 70, 90, 50], [-150, 20, 25, 30], [100, 20, 50, 40], [0, 150, 30, 14], [-60, -80, 40, 40], [740, 0, 40, 160], [820, 60, 30, 200]];
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 40; t++) {
        const [hx, hz, hw, hd] = hubs[Math.floor(rnd() * hubs.length)];
        x = hx + (rnd() - 0.5) * 2 * hw; z = hz + (rnd() - 0.5) * 2 * hd;
        if (canMove(X(x), z, X(x) + 0.1, z) && !blockedAt(X(x), z, groundAt(X(x), z))) break;
      }
      people.list.push({ x: X(x), z, a: rnd() * 6.28, v: 0.8 + rnd() * 0.9, t: rnd() * 5, phase: rnd() * 6, ci: Math.floor(rnd() * 8), ti: Math.floor(rnd() * 5), hatOn: rnd() < 0.6 });
      head.setColorAt(i, skins[Math.floor(rnd() * skins.length)]);
      body.setColorAt(i, WEAR_MAYA[0]); hat.setColorAt(i, HAT_MAYA[0]);
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
      const c = list[i], down = (c.down || 0) > 0;                              // knocked over: lies on the ground a moment, then gets up
      if (down) c.down -= dt;
      else {
        c.t -= dt;
        if (c.t <= 0) { c.a += (rnd() - 0.5) * 1.6; c.t = 2 + rnd() * 5; }
        const nx = c.x + Math.sin(c.a) * c.v * dt, nz = c.z + Math.cos(c.a) * c.v * dt;
        if (canMove(c.x, c.z, nx, nz)) { c.x = nx; c.z = nz; } else { c.a += Math.PI * (0.5 + rnd() * 0.8); c.t = 1.5; }
      }
      const bob = down ? 0 : Math.abs(Math.sin(clock * 5 + c.phase)) * 0.06, tilt = down ? 1.35 * Math.min(1, c.down / 0.35) : 0;
      _o.position.set(c.x, groundAt(c.x, c.z) + bob + tilt * 0.3, c.z); _o.rotation.set(-tilt, c.a, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      body.setMatrixAt(i, _o.matrix); head.setMatrixAt(i, _o.matrix);
      if (!c.hatOn) { _o.scale.set(0, 0, 0); _o.updateMatrix(); }
      hat.setMatrixAt(i, _o.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hat.instanceMatrix.needsUpdate = true;
  }

  // your casita, west of the plaza: a lime-plastered house, thatched in Maya days and tiled today, with a hammock to sleep in
  const HOME = { x: -70, z: 95, hw: 3.6, hd: 3.1 };
  function buildCasita() {
    const g = root, x = HOME.x, z = HOME.z;
    mbox(g, X(x), 0, z, HOME.hw * 2 + 0.4, 0.15, HOME.hd * 2 + 0.4, C.lime2, { walk: true });
    mbox(g, X(x - HOME.hw), 0, z, 0.5, 3.1, HOME.hd * 2, C.white, { solid: true });
    mbox(g, X(x + HOME.hw), 0, z, 0.5, 3.1, HOME.hd * 2, C.white, { solid: true });
    mbox(g, X(x), 0, z - HOME.hd, HOME.hw * 2, 3.1, 0.5, C.white, { solid: true });
    for (const sx of [-1, 1]) mbox(g, X(x + sx * (HOME.hw * 0.62)), 0, z + HOME.hd, HOME.hw * 0.76, 3.1, 0.5, C.white, { solid: true });   // the front wall, with a door gap in the middle
    mbox(g, X(x), 2.2, z + HOME.hd, HOME.hw * 0.5, 0.9, 0.5, C.white);
    Doors.add(g, X(x), z + HOME.hd, "x", HOME.hw * 0.48, 2.2, 1, null);                                                   // the door
    const thatch = new T.Mesh(new T.ConeGeometry(1, 1, 4), C.thatch); thatch.scale.set(HOME.hw * 1.75, 2.8, HOME.hd * 1.95); thatch.position.set(X(x), 3.1 + 1.4, z); thatch.rotation.y = Math.PI / 4; thatch.castShadow = true; ancientG.add(thatch);
    mbox(modernG, X(x), 3.1, z, HOME.hw * 2 + 1.2, 0.5, HOME.hd * 2 + 1.2, C.red);
    for (const sx of [-1, 1]) mcyl(g, X(x + sx * 1.8), 0, z - HOME.hd + 0.6, 0.14, 1.6, C.wood);                      // the posts of the hammock
    mbox(g, X(x), 0.9, z - HOME.hd + 0.6, 3.4, 0.14, 0.9, C.red, { cast: false });                                        // the hammock
    sign(g, X(x), 3.7, z + HOME.hd + 0.3, 2.6, 0.8, "CASITA", "your home", Math.PI);
  }

  // ---------- the coast: Tulum and a fishing village in Maya days, the Hotel Zone today ----------

  function buildCoast() {
    const palms = new T.InstancedMesh(new T.CylinderGeometry(0.18, 0.3, 7, 6), C.wood, 70), leaves = new T.InstancedMesh(new T.ConeGeometry(2.6, 1.6, 8), C.green, 70), o = new T.Object3D();
    for (let i = 0; i < 70; i++) {
      const x = 786 + rnd() * 70, z = -380 + (i / 70) * 800 + rnd() * 6, s = 0.8 + rnd() * 0.5;
      o.rotation.set(0, 0, (rnd() - 0.5) * 0.18); o.scale.set(s, s, s); o.position.set(X(x), 3.5 * s, z); o.updateMatrix(); palms.setMatrixAt(i, o.matrix);
      o.rotation.set(0, rnd() * 6, 0); o.scale.set(s, s * 1.2, s); o.position.set(X(x), 7.2 * s, z); o.updateMatrix(); leaves.setMatrixAt(i, o.matrix);
    }
    for (const m of [palms, leaves]) { m.frustumCulled = false; m.castShadow = true; root.add(m); }
    // ancient: Tulum's little walled port above the sea, thatched huts and canoes on the sand
    {
      const g = ancientG, cx = 770;
      for (const [x, z, w, d] of [[cx - 38, -26, 3, 38], [cx - 38, 26, 3, 38], [cx + 38, 0, 3, 90], [cx - 21, -45, 34, 3], [cx + 21, -45, 34, 3], [cx - 21, 45, 34, 3], [cx + 21, 45, 34, 3]]) mbox(g, X(x), 0, z, w, 3.6, d, C.lime2, { solid: true, era: "ancient" });   // the city wall, with a gate on the west, north and south sides
      mbox(g, X(cx), 0, 0, 22, 4, 18, C.lime, { walk: true, era: "ancient" }); mbox(g, X(cx), 4, 0, 16, 3, 12, C.lime, { walk: true, era: "ancient" });
      steps(g, X(cx - 8), 0, "-x", 8, 8, 0.5, 0.7, null, "ancient");
      mbox(g, X(cx), 7, 0, 10, 4.4, 8, C.lime, { solid: true, era: "ancient" }); mbox(g, X(cx), 11.4, 0, 11, 0.7, 9, C.lime2);        // El Castillo of Tulum
      for (let i = 0; i < 7; i++) {
        const hx = cx - 28 + (i % 4) * 18, hz = i < 4 ? -30 : 30;
        mbox(g, X(hx), 0, hz, 6, 2.4, 5, C.lime, { solid: true, era: "ancient" });
        const roof = new T.Mesh(new T.ConeGeometry(1, 1, 4), C.thatch); roof.scale.set(5, 2.2, 4.4); roof.position.set(X(hx), 3.5, hz); roof.rotation.y = Math.PI / 4; g.add(roof);
      }
      for (let i = 0; i < 5; i++) {                                                                                       // canoes pulled up on the beach
        const canoe = new T.Mesh(BOX, C.wood); canoe.scale.set(1.0, 0.5, 6); canoe.position.set(X(826), 0.3, -60 + i * 32); canoe.rotation.y = 0.2; g.add(canoe);
        const bow = new T.Mesh(BOX, C.wood); bow.scale.set(0.7, 0.4, 1.6); bow.position.set(X(826.4), 0.4, -57 + i * 32); bow.rotation.y = 0.6; g.add(bow);
      }
    }
    // modern: Kukulcán Boulevard, hotels, beach umbrellas and boats
    {
      const g = modernG, bx = 700;
      const road = new T.Mesh(new T.PlaneGeometry(14, 790), C.road); road.rotation.x = -Math.PI / 2; road.position.set(X(bx), 0.05, 0); g.add(road);
      for (let i = -19; i <= 19; i++) mbox(g, X(bx), 0.05, i * 20, 0.3, 0.02, 7, C.white, { cast: false });
      MAP_SHAPES.push({ k: "r", x0: X(bx - 7), x1: X(bx + 7), z0: -395, z1: 395, c: "#6a6a6e" });
      const win = canvasTex(64, 64, (c, w, h) => { c.fillStyle = "#f6f2ea"; c.fillRect(0, 0, w, h); c.fillStyle = "rgba(40,70,100,.7)"; for (let y = 6; y < h; y += 14) for (let x = 5; x < w; x += 14) c.fillRect(x, y, 8, 8); }, 4, 3);
      const walls = [lambert(0xffffff, { map: win }), lambert(0xffe0c4, { map: win }), lambert(0xcfe8f2, { map: win })];
      const hotelZ = [-300, -200, -90, 20, 130, 240, 330];
      hotelZ.forEach((z, i) => {
        const w = 46, d = 26, h = 22 + (i % 3) * 8, hx = 740;
        if (i === 3) {                                                                                                   // a pyramid-shaped hotel, like the ones the Maya built
          for (let k = 0; k < 7; k++) { const s = 44 - k * 5.5; mbox(g, X(hx), k * 4.2, z, s, 4.2, s, walls[1], { solid: true, era: "modern", map: k === 0 ? "#e8d4b8" : undefined }); }
        } else mbox(g, X(hx), 0, z, d, h, w, walls[i % 3], { solid: true, era: "modern", map: "#d9d9d6" });
        mbox(g, X(hx - 16), 0, z, 0.4, 9, 6, C.glass, { cast: false });
      });
      for (let i = 0; i < 26; i++) {
        const ux = 800 + (i % 2) * 14, uz = -330 + i * 26 + rnd() * 6, col = [0xe23b3b, 0x2f8fe0, 0xf2c21b, 0x35b86a][i % 4];
        mcyl(g, X(ux), 0, uz, 0.06, 2.4, C.white);
        const top = new T.Mesh(new T.ConeGeometry(1.7, 0.7, 10), lambert(col)); top.position.set(X(ux), 2.6, uz); g.add(top);
        mbox(g, X(ux + 1.6), 0, uz, 0.8, 0.35, 2, C.white, { cast: false });
      }
      for (let i = 0; i < 6; i++) {                                                                                      // boats on the water
        const bz = -280 + i * 110, boat = new T.Mesh(BOX, C.white); boat.scale.set(2.4, 0.9, 7); boat.position.set(X(960 + (i % 2) * 40), -0.05, bz); boat.rotation.y = 0.5 * Math.sin(i); g.add(boat);
        const cab = new T.Mesh(BOX, C.glass); cab.scale.set(1.6, 0.9, 2.4); cab.position.set(X(960 + (i % 2) * 40), 0.9, bz); cab.rotation.y = boat.rotation.y; g.add(cab);
      }
      sign(g, X(bx - 9), 4.6, -4, 4.2, 1.3, "KUKULCÁN", "Hotel Zone ->", Math.PI / 2);
      // the visitor centre and a car park by the plaza
      mbox(g, X(180), 0, 110, 36, 7, 16, C.white, { solid: true, era: "modern" });
      mbox(g, X(180), 7, 110, 38, 0.8, 18, C.red);
      sign(g, X(180), 5.2, 101.7, 6, 1.5, "CHICHÉN ITZÁ", "visitor centre", Math.PI);
      for (let i = 0; i < 4; i++) mbox(g, X(150 + i * 10), 0.8, 140, 3, 1.6, 6.5, [C.red, C.white, C.glass, C.dark][i], { solid: true, era: "modern" });
    }
  }


  // ---------- the sea floor, the coral reef and its fish; the cenote swimming pond; snorkelling ----------

  const SEA_SHORE = 920, SEA_FAR = 1185;                          // you can wade and swim from the shore out to here (local x)
  const POND = { x: -330, z: 215, r: 13 };                        // Cenote Azul: an open sinkhole with clear water, for swimming
  const SPECIES = [                                               // what you can see snorkelling: name, colour, size (length), where
    { id: "parrot", name: "parrotfish", col: 0x20c9b8, len: 0.9, hh: 0.28, reef: true },
    { id: "angel", name: "queen angelfish", col: 0xf2c21b, len: 0.7, hh: 0.4, reef: true },
    { id: "clown", name: "clownfish", col: 0xff7a1a, len: 0.4, hh: 0.2, reef: true },
    { id: "tang", name: "blue tang", col: 0x2c5fe0, len: 0.6, hh: 0.34, reef: true },
    { id: "barracuda", name: "barracuda", col: 0xb8c4cc, len: 2.0, hh: 0.16, reef: true },
    { id: "turtle", name: "green sea turtle", col: 0x4a7a3a, len: 1.4, hh: 0.2, wide: 1.1, reef: true },
    { id: "ray", name: "spotted eagle ray", col: 0x3a4a5a, len: 1.6, hh: 0.1, wide: 2.4, reef: true },
    { id: "sergeant", name: "sergeant major", col: 0xe8d24a, len: 0.45, hh: 0.28, reef: true },
    { id: "lionfish", name: "lionfish", col: 0xb5452a, len: 0.6, hh: 0.3, wide: 0.9, reef: true },
    { id: "idol", name: "moorish idol", col: 0xf2e8a0, len: 0.55, hh: 0.45, reef: true },
    { id: "grouper", name: "Nassau grouper", col: 0xb08a5a, len: 1.3, hh: 0.4, reef: true },
    { id: "tetra", name: "cenote tetra", col: 0x9ad0e8, len: 0.3, hh: 0.1, pond: true },
  ];
  const ALL_BONUS = 300;                                         // denarii for seeing every creature, on top of the 20 for each one
  const ROUNDS_KEY = "rome-snorkel-rounds";
  let rounds = 1;
  try { rounds = Math.max(1, parseInt(localStorage.getItem(ROUNDS_KEY) || "1", 10) || 1); } catch (e) { /* ignore */ }
  const SNORKEL_KEY = "rome-snorkel", HIRE = { x: 860, z: 130 }, HIRE_PRICE = 15;
  let snorkeling = false, haveGear = false, seen = new Set(), fish = [], fishBody = null, fishTail = null, overlay = null, hud = null;
  try { const v = JSON.parse(localStorage.getItem(SNORKEL_KEY) || "[]"); if (Array.isArray(v)) seen = new Set(v.filter((id) => SPECIES.some((s) => s.id === id))); } catch (e) { /* ignore */ }
  const saveSeen = () => { try { localStorage.setItem(SNORKEL_KEY, JSON.stringify([...seen])); } catch (e) { /* ignore */ } };
  const inPond = (x, z) => Math.hypot(x - X(POND.x), z - POND.z) < POND.r - 0.6;
  const inWater = (x, z) => x > X(SEA_SHORE) || inPond(x, z);

  function buildSea() {
    // a see-through sea over a sandy floor 6 m down, sloping away from the beach
    const slope = new T.Mesh(new T.PlaneGeometry(52, 800), lambert(0xe8dcb0)); slope.geometry.rotateX(-Math.PI / 2);
    slope.rotation.z = -Math.atan2(6, 52); slope.position.set(X(SEA_SHORE + 26), -3, 10); root.add(slope);
    plane(700, 800, lambert(0xe8dcb0), X(SEA_SHORE + 52 + 350), -6, 10);
    const fl = new T.Mesh(new T.PlaneGeometry(900, 1500), lambert(0x2fbfd0, { emissive: 0x0b3d44, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false })); fl.rotation.x = -Math.PI / 2; fl.position.set(X(1365), -0.05, 10); fl.renderOrder = 2; root.add(fl);
    // the coral reef: clusters of coral, sea fans, grass and rocks on the sea floor
    const coralCols = [0xff7a4a, 0xf24a8a, 0xb04fd0, 0xf2c21b, 0xff4a4a, 0x35c8a0].map((c) => new T.Color(c));
    const cone = new T.InstancedMesh(new T.ConeGeometry(0.5, 1.3, 6), new T.MeshLambertMaterial({ color: 0xffffff }), 260), ball = new T.InstancedMesh(new T.SphereGeometry(0.7, 8, 6), new T.MeshLambertMaterial({ color: 0xffffff }), 90), grass = new T.InstancedMesh(new T.BoxGeometry(0.06, 1.3, 0.06), new T.MeshLambertMaterial({ color: 0x3f9a4a }), 320), o = new T.Object3D();
    const clusters = [];
    for (let i = 0; i < 16; i++) clusters.push([SEA_SHORE + 50 + rnd() * 170, -330 + rnd() * 660]);
    for (let i = 0; i < 260; i++) { const [cx, cz] = clusters[i % clusters.length]; const s = 0.6 + rnd() * 1.4; o.position.set(X(cx + (rnd() - 0.5) * 16), -6 + 0.6 * s, cz + (rnd() - 0.5) * 16); o.scale.set(s, s * (0.7 + rnd()), s); o.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3); o.updateMatrix(); cone.setMatrixAt(i, o.matrix); cone.setColorAt(i, coralCols[Math.floor(rnd() * coralCols.length)]); }
    for (let i = 0; i < 90; i++) { const [cx, cz] = clusters[(i * 3) % clusters.length]; const s = 0.7 + rnd() * 1.1; o.position.set(X(cx + (rnd() - 0.5) * 18), -6 + 0.35 * s, cz + (rnd() - 0.5) * 18); o.scale.set(s, s * 0.6, s); o.rotation.set(0, rnd() * 6, 0); o.updateMatrix(); ball.setMatrixAt(i, o.matrix); ball.setColorAt(i, coralCols[(i + 2) % coralCols.length]); }
    for (let i = 0; i < 320; i++) { const [cx, cz] = clusters[(i * 7) % clusters.length]; const s = 0.6 + rnd() * 1.2; o.position.set(X(cx + (rnd() - 0.5) * 26), -6 + 0.65 * s, cz + (rnd() - 0.5) * 26); o.scale.set(1, s, 1); o.rotation.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3); o.updateMatrix(); grass.setMatrixAt(i, o.matrix); }
    for (const m of [cone, ball, grass]) { m.frustumCulled = false; if (m.instanceColor) m.instanceColor.needsUpdate = true; root.add(m); }
    // a wreck on the sea floor: a canoe in Maya days, a little sunk boat today (and an anchor)
    const wreck = new T.Group(); wreck.position.set(X(1010), -6, -90); wreck.rotation.set(0.12, 0.7, 0.2);
    const hullM = new T.Mesh(BOX, C.wood); hullM.scale.set(2.2, 0.8, 8); wreck.add(hullM); const rib = new T.Mesh(BOX, C.wood); rib.scale.set(0.2, 1.4, 0.2); rib.position.set(0.5, 0.9, -1); wreck.add(rib);
    const anchor = new T.Mesh(new T.TorusGeometry(0.6, 0.1, 6, 12), C.dark); anchor.position.set(3.5, 0.6, 2); anchor.rotation.x = 1.2; wreck.add(anchor); root.add(wreck);
    // the fish: bodies and tails, each in a school that swims slowly in circles over the reef (and a few tetras in the cenote)
    const reefSp = SPECIES.filter((s) => s.reef), pondSp = SPECIES.filter((s) => s.pond);
    const REEF_FISH = 330, total = REEF_FISH + 22;                                                  // lots of fish: schools of every kind over each patch of reef
    fishBody = new T.InstancedMesh(new T.SphereGeometry(0.5, 8, 6), new T.MeshLambertMaterial({ color: 0xffffff }), total);
    fishTail = new T.InstancedMesh(new T.ConeGeometry(0.28, 0.5, 4), new T.MeshLambertMaterial({ color: 0xffffff }), total);
    for (let i = 0; i < total; i++) {
      const inPd = i >= REEF_FISH, sp = inPd ? pondSp[0] : reefSp[i % reefSp.length], c = inPd ? [POND.x, POND.z, 6] : clusters[i % clusters.length].concat([14 + rnd() * 16]);
      const cx = inPd ? POND.x : c[0], cz = inPd ? POND.z : c[1];
      fish.push({ sp, cx: X(cx), cz, r: inPd ? 2 + rnd() * 7 : 4 + rnd() * c[2], a: rnd() * 6.28, w: (0.25 + rnd() * 0.45) * (rnd() < 0.5 ? 1 : -1) * (sp.len > 1 ? 0.5 : 1), y: inPd ? -1.5 - rnd() * 6 : -5 + rnd() * 3.6, ph: rnd() * 6 });
      fishBody.setColorAt(i, new T.Color(sp.col)); fishTail.setColorAt(i, new T.Color(sp.col).multiplyScalar(0.8));
    }
    for (const m of [fishBody, fishTail]) { m.frustumCulled = false; m.instanceColor.needsUpdate = true; root.add(m); }
  }

  function buildPond() {
    const g = root, cx = POND.x, cz = POND.z, R = POND.r;
    const water = new T.Mesh(new T.CircleGeometry(R, 40), lambert(0x2fbfd0, { emissive: 0x0b3d44, transparent: true, opacity: 0.72, side: T.DoubleSide, depthWrite: false })); water.rotation.x = -Math.PI / 2; water.position.set(X(cx), 0.025, cz); water.renderOrder = 2; g.add(water);
    const base = new T.Mesh(new T.CircleGeometry(R, 40), lambert(0x1f8f9a, { emissive: 0x06302f })); base.rotation.x = -Math.PI / 2; base.position.set(X(cx), 0.012, cz); g.add(base);   // so the green of the ground does not show through the water from above
    const bowl = new T.Mesh(new T.CylinderGeometry(R + 0.5, R - 4, 9, 28, 1, true), lambert(0x4a6a66, { side: T.BackSide })); bowl.position.set(X(cx), -4.5, cz); g.add(bowl);           // the walls of the sinkhole under the water
    const bottom = new T.Mesh(new T.CircleGeometry(R - 4, 24), lambert(0x6a8a80)); bottom.rotation.x = -Math.PI / 2; bottom.position.set(X(cx), -9, cz); g.add(bottom);
    const rimGround = new T.Mesh(new T.RingGeometry(R, R + 9, 36), lambert(0x77705c)); rimGround.rotation.x = -Math.PI / 2; rimGround.position.set(X(cx), 0.03, cz); g.add(rimGround);
    for (let i = 0; i < 26; i++) {                                                                                         // a rim of rock, with a gap on the east side for the dock
      const a = (i / 26) * Math.PI * 2; if (Math.min(a, Math.PI * 2 - a) < 0.3) continue;
      const hgt = 3 + rnd() * 3.4, px = cx + Math.cos(a) * (R + 2.3), pz = cz + Math.sin(a) * (R + 2.3);
      mbox(g, X(px), 0, pz, 5.4, hgt, 4.2, C.stone, { solid: true });
      for (let k = 0; k < 2; k++) mbox(g, X(px + (rnd() - 0.5) * 2), hgt, pz + (rnd() - 0.5) * 2, 0.05, 1, 0.05, C.leaf, { cast: false });
      const vine = new T.Mesh(BOX, C.green); vine.scale.set(0.08, 3 + rnd() * 3, 0.08); vine.position.set(X(px - Math.cos(a) * 3), hgt - 1.5 - rnd(), pz - Math.sin(a) * 3); g.add(vine);   // vines hanging into the pit
    }
    mbox(g, X(cx + R + 3), 0, cz, 7, 0.3, 4, C.wood, { walk: true });                                                       // the dock
    sign(g, X(cx + R + 5.5), 2.6, cz - 2.4, 4.6, 1.3, "CENOTE AZUL", "swimming · press F in the water to snorkel", Math.PI / 2);
    const shaft = new T.Mesh(new T.CylinderGeometry(R * 0.7, 3, 9, 20, 1, true), new T.MeshBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.13, side: T.DoubleSide, depthWrite: false })); shaft.position.set(X(cx - 2), -4.5, cz); g.add(shaft);   // a shaft of light into the water
    MAP_SHAPES.push({ k: "e", cx: X(cx), cz, ax: R + 3, az: R + 3, c: "#3fb8c0" });
  }

  function buildHire() {                                                                // a snorkel hire hut on the beach (today)
    const g = modernG, x = HIRE.x, z = HIRE.z;
    mbox(g, X(x), 0, z, 7, 3.2, 5, C.white, { solid: true, era: "modern" });
    mbox(g, X(x), 3.2, z, 8, 0.5, 6, C.red);
    sign(g, X(x), 2.2, z - 2.6, 4.4, 1.3, "SNORKEL HIRE", "masks · snorkels · fins", Math.PI);
    for (let i = 0; i < 3; i++) mbox(g, X(x - 2.5 + i * 2.5), 0.8, z - 3.2, 1.6, 0.25, 0.5, [C.red, C.glass, C.gold][i], { cast: false });
  }

  function placeFish() {
    if (!fishBody) return;
    const dummy = _o;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i], sp = f.sp;
      f.a += f.w * 0.016 * 60 * lastDt * 0.6;
      const px = f.cx + Math.cos(f.a) * f.r, pz = f.cz + Math.sin(f.a) * f.r, py = f.y + Math.sin(clock * 0.8 + f.ph) * 0.25, ang = Math.atan2(-Math.sin(f.a) * Math.sign(f.w), Math.cos(f.a) * Math.sign(f.w));
      dummy.position.set(px, py, pz); dummy.rotation.set(0, -ang + Math.PI / 2 + (f.w < 0 ? Math.PI : 0), 0);
      dummy.scale.set(sp.wide || sp.hh * 1.4 + 0.12, sp.hh, sp.len); dummy.updateMatrix(); fishBody.setMatrixAt(i, dummy.matrix);
      const wag = Math.sin(clock * 7 + f.ph) * 0.4;                                                   // the tail swishes
      dummy.rotation.y += wag * 0.4;
      dummy.position.set(px - Math.sin(dummy.rotation.y - wag * 0.4) * sp.len * 0.55, py, pz - Math.cos(dummy.rotation.y - wag * 0.4) * sp.len * 0.55);
      dummy.rotation.x = Math.PI / 2; dummy.scale.set(sp.len > 1 ? 0.8 : 1.2 * Math.max(0.5, sp.hh * 2), sp.len * 0.6, sp.hh * 1.2 + 0.1); dummy.updateMatrix(); fishTail.setMatrixAt(i, dummy.matrix);
    }
    fishBody.instanceMatrix.needsUpdate = fishTail.instanceMatrix.needsUpdate = true;
  }
  // a fish you swim close to (while snorkelling) is added to your list
  function spot() {
    for (const f of fish) {
      if (seen.has(f.sp.id)) continue;
      const px = f.cx + Math.cos(f.a) * f.r, pz = f.cz + Math.sin(f.a) * f.r;
      if (Math.hypot(px - player.x, pz - player.z) < 7 && Math.abs(f.y - (player.feet - 2)) < 8) {
        seen.add(f.sp.id); saveSeen(); renderCard();
        const left = SPECIES.length - seen.size;
        Vitals.coins += 20; Sfx.play("coin");
        toast(`🐠 You spot ${/^[aeiou]/.test(f.sp.name) ? "an" : "a"} ${f.sp.name}! (+20 denarii) ${seen.size} of ${SPECIES.length} seen${left ? "" : ". You have seen them all!"}`);
        if (!left) {
          Vitals.coins += ALL_BONUS; Sfx.play("cheer"); toast(`🤿 You have seen every creature: +${ALL_BONUS} denarii! Master snorkeller!`);
          setTimeout(() => { seen.clear(); saveSeen(); rounds++; try { localStorage.setItem(ROUNDS_KEY, String(rounds)); } catch (e) { /* ignore */ } renderCard(); toast("🐠 The creature list is wiped clean: every creature is unseen again. Find them all once more!"); }, 6000);   // a new round
        }
        return;
      }
    }
  }

  // the list of creatures, always on the screen in Cancún: the ones you have seen by name, the rest as ???
  let card = null;
  function renderCard() {
    if (!card) { card = document.createElement("div"); card.id = "creature-card"; card.setAttribute("aria-label", "Sea creatures you have seen"); document.body.append(card); }
    card.replaceChildren();
    const h = document.createElement("b"); h.textContent = `🐠 Creatures ${seen.size}/${SPECIES.length}${rounds > 1 ? ` · round ${rounds}` : ""}`; card.append(h);
    const ul = document.createElement("ul");
    for (const s of SPECIES) { const li = document.createElement("li"); li.className = seen.has(s.id) ? "seen" : ""; li.textContent = seen.has(s.id) ? `✓ ${s.name}` : `• ???${s.pond ? " (cenote)" : ""}`; ul.append(li); }
    card.append(ul);
    const note = document.createElement("small"); note.textContent = seen.size === SPECIES.length ? `All found! ${ALL_BONUS} denarii paid` : `20 denarii each, and ${ALL_BONUS} more for all ${SPECIES.length}`; card.append(note);
    card.classList.toggle("done", seen.size === SPECIES.length);
  }
  const showCard = (v) => { if (!card) renderCard(); card.classList.toggle("show", !!v); };
  function setSnorkel(on) {
    snorkeling = !!on;
    if (!overlay) {
      overlay = document.createElement("div"); overlay.id = "underwater"; overlay.setAttribute("aria-hidden", "true"); document.body.append(overlay);
      hud = document.createElement("div"); hud.id = "snorkel-hud"; document.body.append(hud);
    }
    overlay.classList.toggle("show", snorkeling); hud.classList.toggle("show", snorkeling);
    showCard(snorkeling);                                            // the list of creatures is on the screen only while you snorkel
    if (snorkeling) hud.textContent = `🤿 Snorkelling · ${seen.size} of ${SPECIES.length} creatures seen. Swim to the reef out to sea (or around the cenote): fish swim close by. Press Esc or F to come up.`;
  }
  // the one key for water things: hire the gear on the beach, or put your face in the water
  function promptText() {
    if (!built || city !== "cancun") return "";
    const nearHut = modernNow && Math.hypot(player.x - X(HIRE.x), player.z - HIRE.z) < 6;
    if (nearHut && !haveGear) return `F: rent snorkel gear (${HIRE_PRICE} denarii)`;
    if (inWater(player.x, player.z)) return !modernNow || haveGear ? (snorkeling ? "F or Esc: lift your head out of the water" : "F: put your face in the water (snorkel)") : `F: snorkel (a mask, snorkel and fins: ${HIRE_PRICE} denarii)`;
    if (player.x > X(860) && player.x < X(SEA_SHORE) && Math.abs(player.z) < 380) return "Walk east into the sea to swim, then press F to snorkel";
    return "";
  }
  function act() {
    if (!built || city !== "cancun") return false;
    const nearHut = modernNow && Math.hypot(player.x - X(HIRE.x), player.z - HIRE.z) < 6;
    if (nearHut && !haveGear) {
      if (Vitals.coins < HIRE_PRICE) { toast(`Snorkel gear costs ${HIRE_PRICE} denarii.`); return true; }
      Vitals.coins -= HIRE_PRICE; haveGear = true; Sfx.play("coin");
      toast("You have a mask, a snorkel and fins until you leave Cancún. Wade into the sea (or the cenote) and press F to put your face in the water.");
      return true;
    }
    if (inWater(player.x, player.z)) {
      if (modernNow && !haveGear) {                                                   // gear hired on the spot, if you did not hire it at the hut
        if (Vitals.coins < HIRE_PRICE) { toast(`A mask, snorkel and fins cost ${HIRE_PRICE} denarii.`); return true; }
        Vitals.coins -= HIRE_PRICE; haveGear = true; Sfx.play("coin");
      }
      setSnorkel(!snorkeling); return true;
    }
    return false;
  }
  const swimMul = () => (inWater(player.x, player.z) ? (snorkeling ? 0.85 : 1.1) : 1);   // swimming is about as fast as walking, a little faster at the surface
  const avatarDrop = () => (inWater(player.x, player.z) ? -0.95 : 0);
  const camDrop = () => (inWater(player.x, player.z) ? (snorkeling ? -2.4 : -0.95) : 0);
  let lastDt = 0.016;

  // ---------- public ----------

  function build(sc) {
    if (built) return;
    built = true; root = new T.Group(); sc.add(root);
    root.add(ancientG, modernG);
    buildGround();
    buildCastillo();
    buildBallCourt();
    buildWarriors();
    buildCaracol();
    buildCenote();
    buildJungle();
    buildCasita();
    buildCoast();
    buildSea();
    buildPond();
    buildHire();
    buildPeople();
    Stalls.build(root, X(0), 150, "cancun");
    setEra(false);
  }

  function setEra(modern) {
    modernNow = modern;
    ancientG.visible = !modern; modernG.visible = modern;
    const { list, body, hat } = people;
    if (body) {
      list.forEach((c, i) => { body.setColorAt(i, (modern ? WEAR_MODERN : WEAR_MAYA)[c.ci]); hat.setColorAt(i, (modern ? HAT_MODERN : HAT_MAYA)[c.ti]); });
      body.instanceColor.needsUpdate = hat.instanceColor.needsUpdate = true;
    }
  }
  const show = (v) => { if (root) root.visible = v; showCard(false); if (!v) { haveGear = false; if (snorkeling) setSnorkel(false); } };
  const homeInside = (x, z) => Math.abs(x - X(HOME.x)) < HOME.hw - 0.3 && Math.abs(z - HOME.z) < HOME.hd - 0.3;
  const homeSpot = () => ({ x: X(HOME.x), z: HOME.z + 1.4 });
  function update(dt, px, pz) {
    if (!built) return;
    clock += dt;
    if (Math.abs(px - CX) > 1100) return;
    lastDt = dt;
    updatePeople(dt);
    if (px > CX + 700 || Math.hypot(px - X(POND.x), pz - POND.z) < 120) placeFish();
    if (snorkeling) { if (!inWater(px, pz)) setSnorkel(false); else spot(); }
  }
  const setEquinox = (on) => { if (serpent) serpent.visible = !!on; };

  return {
    build, show, setEra, update, homeInside, homeSpot, setEquinox, SPAWN, BOUNDS: BOUNDS_C, MAP: MAP_C,
    fishAt: () => fish.map((f) => [f.sp.id, f.cx + Math.cos(f.a) * f.r, f.y, f.cz + Math.sin(f.a) * f.r]),
    inWater, swimMul, avatarDrop, camDrop, promptText, act, get snorkeling() { return snorkeling; }, stopSnorkel: () => setSnorkel(false),
    snorkelSnapshot: () => [...seen], snorkelRestore: (a) => { if (Array.isArray(a)) for (const id of a) if (SPECIES.some((s) => s.id === id)) seen.add(id); saveSeen(); if (card) renderCard(); },
    get built() { return built; }, hits: () => null, people: () => people.list, peopleMesh: () => people.body, X,
    inHome: (x, z) => Math.abs(x - X(HOME.x)) < 14 && Math.abs(z - HOME.z) < 14,
  };
})();

// The people, the moving things that can hit you and the home of the city you are in (Rome, Old Delhi or Cancún): the other modules ask these.
function peopleHere() { return city === "delhi" ? Delhi.people() : city === "cancun" ? Cancun.people() : CITIZENS.list; }
function hitsHere(x, z) { return city === "delhi" ? Delhi.hits(x, z) : city === "cancun" ? null : Modern.hits(x, z); }
const CITY_NAMES = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún" };

// Are you under a roof? (Rome: your house or the job hall; Delhi: the bedroom; Cancún: the casita.) The weather asks, so no rain, leaves or wind blow in.
function indoorsNow() {
  if (typeof started === "undefined" || !started) return false;
  if (city === "delhi") return Delhi.built && Delhi.homeInside(player.x, player.z);
  if (city === "cancun") return Cancun.built && (Cancun.homeInside(player.x, player.z) || Cancun.snorkeling);   // (with your face in the water you feel no rain or wind either)
  return Home.inside(player.x, player.z) || (typeof Jobs !== "undefined" && Jobs.inHall(player.x, player.z));
}
