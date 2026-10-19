"use strict";
// Old Delhi (Shahjahanabad): the Red Fort, Chandni Chowk and the Jama Masjid, in Shah Jahan's day (c. 1650) or as the
// city stands today. Built the first time you travel there, far to the east of Rome in the same world. Coordinates in
// this file are metres around the Lahori Gate (x east, z south); world x is DX + x. Depends on world.js (frame, lambert,
// canvasTex), physics.js and delhi-data.js. Not to scale between districts.

const Delhi = (() => {
  const DX = DELHI_X;
  const BOUNDS_D = { minX: DX - 705, maxX: DX + 315, minZ: -335, maxZ: 1250 };   // Old Delhi, and New Delhi's India Gate far to the south
  const MAP_D = { x0: DX - 720, x1: DX + 440, z0: -345, z1: 1260 };
  const SPAWN = { x: DX - 40, z: 0, yaw: -Math.PI / 2 };

  let built = false, scene = null, root = null, modernNow = false, clock = 0;
  const mughal = new T.Group(), modernG = new T.Group(); // things that exist in only one era
  const palettes = []; // instanced meshes that change colour with the era: { mesh, list, mughal, modern }

  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rnd = mulberry(1650);
  const X = (x) => DX + x;

  // ---------- materials ----------
  const D = {
    red: lambert(0xb84a30, { map: stoneTex("#ffffff") }),
    redDark: lambert(0x7a2c1d),
    marble: lambert(0xf3eee1, { map: stoneTex("#ffffff") }),
    cream: lambert(0xe2d2a8),
    gold: lambert(0xd9a928, { emissive: 0x3d2f05 }),
    dark: lambert(0x1c1612),
    green: lambert(0x4d7b38),
    lawn: lambert(0x6e9446),
    water: lambert(0x4f91b8, { emissive: 0x0b2534 }),
    stone: lambert(0xb9ad94),
    grey: lambert(0x8d8a82),
    wood: lambert(0x6b4a2b),
    glass: lambert(0x6fa8c9, { emissive: 0x10283a }),
    yellow: lambert(0xf2c21b, { emissive: 0x3a2e00 }),
    white: lambert(0xf1f1ec),
  };
  const cyl8 = new T.CylinderGeometry(1, 1, 1, 8);

  // ---------- small building helpers (world coordinates) ----------

  function mbox(parent, cx, y0, cz, w, h, d, m, o = {}) {
    const mesh = new T.Mesh(BOX, m);
    mesh.scale.set(w, h, d); mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
    parent.add(mesh);
    const ex = o.era ? { era: o.era } : undefined;
    if (o.solid) addBlockerBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0, y0 + h, ex);
    if (o.walk) addPlatformBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0 + h, ex);
    if (o.map) MAP_SHAPES.push({ k: "r", x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, c: o.map });
    return mesh;
  }

  function mcyl(parent, cx, y0, cz, r, h, m, o = {}) {
    const mesh = new T.Mesh(o.sides === 8 ? cyl8 : CYL, m);
    mesh.scale.set(r, h, r); mesh.position.set(cx, y0 + h / 2, cz);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    if (o.solid) addBlockerCircle(cx, cz, r, y0, y0 + h, o.era ? { era: o.era } : undefined);
    if (o.map) MAP_SHAPES.push({ k: "e", cx, cz, ax: r, az: r, c: o.map });
    return mesh;
  }

  const onion = [[0.78, 0], [0.95, 0.1], [1.0, 0.25], [0.9, 0.45], [0.6, 0.68], [0.28, 0.86], [0.07, 0.96], [0, 1]];
  const onionGeo = new T.LatheGeometry(onion.map(([a, b]) => new T.Vector2(a, b)), 24);

  // A bulb-shaped Mughal dome on a short drum, with a gilded finial.
  function dome(parent, cx, y0, cz, r, h, m, drum = 0) {
    if (drum > 0) mcyl(parent, cx, y0, cz, r * 0.92, drum, m);
    const mesh = new T.Mesh(onionGeo, m);
    mesh.scale.set(r, h, r); mesh.position.set(cx, y0 + drum, cz);
    mesh.castShadow = true;
    parent.add(mesh);
    mcyl(parent, cx, y0 + drum + h - 0.1, cz, Math.max(0.06, r * 0.04), h * 0.28, D.gold);
    const ball = new T.Mesh(new T.SphereGeometry(Math.max(0.12, r * 0.07), 8, 6), D.gold);
    ball.position.set(cx, y0 + drum + h + h * 0.12, cz);
    parent.add(ball);
  }

  // A small domed kiosk on four slim pillars.
  function chhatri(parent, cx, y0, cz, s, m = D.marble) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mbox(parent, cx + dx * 1.2 * s, y0, cz + dz * 1.2 * s, 0.4 * s, 2.6 * s, 0.4 * s, m);
    mbox(parent, cx, y0 + 2.6 * s, cz, 3.4 * s, 0.35 * s, 3.4 * s, m);
    dome(parent, cx, y0 + 2.95 * s, cz, 1.5 * s, 1.9 * s, m);
  }

  // A pointed arch cut out of a rectangular wall (the wall's thickness runs along z, then it is turned if needed).
  function archShape(w, h) {
    const sp = Math.max(0.2, h - w * 0.62);
    const p = new T.Path();
    p.moveTo(-w / 2, 0); p.lineTo(-w / 2, sp);
    p.quadraticCurveTo(-w / 2, sp + (h - sp) * 0.85, 0, h);
    p.quadraticCurveTo(w / 2, sp + (h - sp) * 0.85, w / 2, sp);
    p.lineTo(w / 2, 0); p.lineTo(-w / 2, 0);
    return p;
  }
  function roundArchShape(w, h) { // a round (Roman) arch, as on India Gate
    const p = new T.Path();
    p.moveTo(-w / 2, 0); p.lineTo(-w / 2, h - w / 2); p.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); p.lineTo(w / 2, 0); p.lineTo(-w / 2, 0);
    return p;
  }
  function archWallGeo(w, h, thick, ow, oh, round) {
    const s = new T.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    s.holes.push(round ? roundArchShape(ow, oh) : archShape(ow, oh));
    const g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -thick / 2);
    return g;
  }

  // A gate with a pointed archway. `alongZ`: the wall runs north-south and you walk through it east-west.
  function gate(parent, cx, cz, alongZ, w, h, thick, ow, oh, m, y0 = 0, o = {}) {
    const ex = o.era ? { era: o.era } : undefined;
    const mesh = new T.Mesh(archWallGeo(w, h, thick, ow, oh, o.round), m);
    mesh.position.set(cx, y0, cz);
    if (alongZ) mesh.rotation.y = Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    const hw = (w - ow) / 2;
    if (alongZ) {
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz - w / 2, cz - ow / 2, y0, y0 + h, ex);
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz + ow / 2, cz + w / 2, y0, y0 + h, ex);
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz - ow / 2, cz + ow / 2, y0 + oh, y0 + h, ex);
    } else {
      addBlockerBox(cx - w / 2, cx - ow / 2, cz - thick / 2, cz + thick / 2, y0, y0 + h, ex);
      addBlockerBox(cx + ow / 2, cx + w / 2, cz - thick / 2, cz + thick / 2, y0, y0 + h, ex);
      addBlockerBox(cx - ow / 2, cx + ow / 2, cz - thick / 2, cz + thick / 2, y0 + oh, y0 + h, ex);
    }
    return mesh;
  }

  // Steps rising to `top` along one side of a platform. dir: +x, -x, +z or -z is the way you climb up (towards the platform).
  function steps(x0, z0, dir, width, n, rise, tread, era) {
    for (let k = 1; k <= n; k++) {
      const run = (n - k + 1) * tread, top = k * rise;
      let a, b, c, d;
      if (dir === "-x") { a = x0 - run; b = x0; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "+x") { a = x0; b = x0 + run; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "-z") { a = x0 - width / 2; b = x0 + width / 2; c = z0 - run; d = z0; }
      else { a = x0 - width / 2; b = x0 + width / 2; c = z0; d = z0 + run; }
      addPlatformBox(a, b, c, d, top, era ? { era } : undefined);
      const m = new T.Mesh(BOX, D.stone);
      m.scale.set(b - a, top, d - c); m.position.set((a + b) / 2, top / 2, (c + d) / 2);
      m.receiveShadow = true; m.castShadow = true;
      scene.add(m);
    }
  }

  const signTex = (text, sub, bg, fg) => canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 28px sans-serif"; g.fillText(text, w / 2, 22);
    g.font = "bold 17px sans-serif"; g.fillText(sub, w / 2, 48);
  });

  // ---------- ground and paving ----------

  function buildGround() {
    const g = new T.Mesh(new T.PlaneGeometry(1500, 1000), lambert(0xb89d73));
    g.rotation.x = -Math.PI / 2; g.position.set(DX - 190, -0.02, 25); g.receiveShadow = true;
    scene.add(g);
    const paving = pavingTex("#c9b58f", "rgba(110,80,50,.28)", 32, 60, 3);
    const street = new T.Mesh(new T.PlaneGeometry(640, 36), new T.MeshLambertMaterial({ map: paving }));
    street.rotation.x = -Math.PI / 2; street.position.set(X(-310), 0.03, 0); street.receiveShadow = true;
    scene.add(street);
    const plaza = new T.Mesh(new T.PlaneGeometry(90, 120), new T.MeshLambertMaterial({ map: pavingTex("#cdbb96", "rgba(110,80,50,.28)", 32, 9, 12) }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(X(-45), 0.04, 0); plaza.receiveShadow = true;
    scene.add(plaza);
    const lane = new T.Mesh(new T.PlaneGeometry(14, 250), new T.MeshLambertMaterial({ map: pavingTex("#c4b08a", "rgba(110,80,50,.28)", 32, 2, 18) }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(X(-150), 0.03, 150); lane.receiveShadow = true;
    scene.add(lane);
    const fortFloor = new T.Mesh(new T.PlaneGeometry(292, 540), new T.MeshLambertMaterial({ map: pavingTex("#c4b08a", "rgba(110,80,50,.22)", 32, 22, 40) }));
    fortFloor.rotation.x = -Math.PI / 2; fortFloor.position.set(X(154), 0.03, 0); fortFloor.receiveShadow = true;
    scene.add(fortFloor);
    MAP_SHAPES.push({ k: "r", x0: X(-625), x1: X(-2), z0: -18, z1: 18, c: "#c8b99a" }, { k: "r", x0: X(-90), x1: X(0), z0: -60, z1: 60, c: "#d6c8a8" },
      { k: "r", x0: X(-157), x1: X(-143), z0: 18, z1: 270, c: "#c8b99a" }, { k: "r", x0: X(8), x1: X(300), z0: -270, z1: 270, c: "#e0d3b0" });
    // the Yamuna beyond the fort's east wall
    const river = new T.Mesh(new T.PlaneGeometry(260, 700), new T.MeshLambertMaterial({ color: 0x4f91b8, emissive: 0x0b2534 }));
    river.rotation.x = -Math.PI / 2; river.position.set(X(450), -0.3, 20); scene.add(river);
    MAP_SHAPES.push({ k: "r", x0: X(322), x1: X(440), z0: -345, z1: 395, c: "#9cc4d9" });
  }

  // ---------- the Red Fort ----------

  function buildFortWallsProper() {
    const H = 24;
    const blocks = [
      [0, 8, -278, -9], [0, 8, 9, 278],
      [0, 308, -278, -270],
      [300, 308, -270, -37], [300, 308, -23, 270],
      [8, 143, 270, 278], [157, 308, 270, 278],      // south wall either side of the Delhi Gate
    ];
    const merlons = [];
    for (const [x0, x1, z0, z1] of blocks) {
      mbox(scene, X((x0 + x1) / 2), 0, (z0 + z1) / 2, x1 - x0, H, z1 - z0, D.red, { solid: true, map: "#9a3b27" });
      mbox(scene, X((x0 + x1) / 2), H, (z0 + z1) / 2, x1 - x0 + 0.6, 0.8, z1 - z0 + 0.6, D.redDark, { cast: false });
      const long = x1 - x0 > z1 - z0;
      const n = Math.floor((long ? x1 - x0 : z1 - z0) / 3.2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (long) { merlons.push([X(x0 + (x1 - x0) * t), (z0 + z1) / 2 - (z1 - z0) / 2 + 0.3, 1.6, 1.3, 0.7], [X(x0 + (x1 - x0) * t), (z0 + z1) / 2 + (z1 - z0) / 2 - 0.3, 1.6, 1.3, 0.7]); }
        else { merlons.push([X((x0 + x1) / 2) - (x1 - x0) / 2 + 0.3, z0 + (z1 - z0) * t, 0.7, 1.3, 1.6], [X((x0 + x1) / 2) + (x1 - x0) / 2 - 0.3, z0 + (z1 - z0) * t, 0.7, 1.3, 1.6]); }
      }
    }
    const mer = new T.InstancedMesh(BOX, D.redDark, merlons.length), o = new T.Object3D();
    merlons.forEach(([x, z, w, h, d], i) => { o.position.set(x, 24.8 + h / 2, z); o.scale.set(w, h, d); o.rotation.set(0, 0, 0); o.updateMatrix(); mer.setMatrixAt(i, o.matrix); });
    mer.instanceMatrix.needsUpdate = true; mer.frustumCulled = false; scene.add(mer);
    // octagonal bastions at the corners and along the walls, each with a little domed kiosk on top
    const towers = [[4, -274], [304, -274], [4, 274], [304, 274], [4, -140], [4, 140], [304, -140], [304, 140], [150, -274], [75, 274], [230, 274], [150, -274]];
    for (const [tx, tz] of towers) {
      mcyl(scene, X(tx), 0, tz, 7, 28, D.red, { sides: 8, solid: true });
      chhatri(scene, X(tx), 28, tz, 1.1, D.marble);
    }
  }

  function buildLahoriGate() {
    // the great gate in the west wall: an arched wall between two big octagonal towers
    gate(scene, X(4), 0, true, 26, 24, 8, 12, 15, D.red);
    for (const sz of [-1, 1]) {
      mcyl(scene, X(4), 0, sz * 18, 8.5, 30, D.red, { sides: 8, solid: true });
      chhatri(scene, X(4), 30, sz * 18, 1.4, D.marble);
    }
    // the row of small domed kiosks above the gate
    for (let i = -2; i <= 2; i++) chhatri(scene, X(4), 24.8, i * 4.4, 0.8, D.marble);
    mbox(scene, X(4), 24, 0, 8.8, 0.8, 26, D.redDark, { cast: false });
    // the Delhi Gate in the south wall
    gate(scene, X(150), 274, false, 30, 22, 8, 12, 14, D.red);
    for (const sx of [-1, 1]) chhatri(scene, X(150 + sx * 10), 22, 274, 1, D.marble);
  }

  function elephant(parent, cx, cz, rot) {
    const g = new T.Group(), gr = lambert(0x9c9a95);
    const part = (w, h, d, x, y, z, m = gr) => { const b = new T.Mesh(BOX, m); b.scale.set(w, h, d); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    part(2.6, 2.2, 4.6, 0, 2.6, 0); part(1.7, 1.6, 1.7, 0, 3.0, 2.8); // body, head
    part(0.55, 2.0, 0.6, 0, 1.8, 3.9); part(0.5, 0.6, 0.7, 0, 0.75, 4.2); // trunk
    for (const [lx, lz] of [[-0.9, -1.6], [0.9, -1.6], [-0.9, 1.5], [0.9, 1.5]]) part(0.75, 1.9, 0.8, lx, 0.95, lz);
    part(0.15, 1.1, 0.9, 0.95, 3.1, 2.5); part(0.15, 1.1, 0.9, -0.95, 3.1, 2.5); // ears
    part(0.18, 0.18, 1.4, 0.45, 2.5, 3.9, lambert(0xf1ead8)); part(0.18, 0.18, 1.4, -0.45, 2.5, 3.9, lambert(0xf1ead8)); // tusks
    g.position.set(cx, 0, cz); g.rotation.y = rot;
    parent.add(g);
    return g;
  }

  function buildChhattaChowk() {
    // the vaulted arcade of shops inside the gate (x 8 to 78)
    const len = 70, cx = X(43);
    for (const sz of [-1, 1]) {
      mbox(scene, cx, 0, sz * 8, len, 8, 2, D.red, { solid: true });
      for (let i = 0; i < 11; i++) mbox(scene, X(8 + 3 + i * 6.2), 0.1, sz * 6.9, 3.2, 3.8, 0.3, D.dark, { cast: false });
    }
    mbox(scene, cx, 8, 0, len, 1.2, 18, D.redDark);
    for (let i = 0; i < 6; i++) dome(scene, X(8 + 6 + i * 12), 9.2, 0, 3.2, 3, D.red);
    // the Naubat Khana, the drum house
    gate(scene, X(85), 0, true, 52, 18, 14, 10, 11.5, D.red);
    for (const sz of [-1, 1]) { chhatri(scene, X(85), 18, sz * 20, 1.2, D.marble); chhatri(scene, X(85), 18, sz * 8, 0.9, D.marble); }
    MAP_SHAPES.push({ k: "r", x0: X(78), x1: X(92), z0: -26, z1: 26, c: "#b55a40" });
  }

  function buildDiwanAam() {
    const cx = 158, cz = 0;
    mbox(scene, X(cx), 0, cz, 38, 1.5, 62, D.stone, { walk: true, map: "#c5ad8a" });
    steps(X(cx - 19), cz, "-x", 14, 3, 0.5, 0.9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) {
      const px = X(cx - 13 + r * 13), pz = cz - 24 + c * 6;
      mcyl(scene, px, 1.5, pz, 0.7, 7, D.red, { solid: true });
      mbox(scene, px, 8.5, pz, 1.8, 0.4, 1.8, D.redDark, { cast: false });
    }
    mbox(scene, X(cx), 8.9, cz, 38, 1.1, 62, D.redDark);
    mbox(scene, X(cx), 10, cz, 38.6, 0.5, 62.6, D.red);
    // the back wall with the marble throne alcove the emperor sat in
    mbox(scene, X(cx + 19.5), 1.5, cz, 1.2, 9.4, 62, D.red, { solid: true });
    mbox(scene, X(cx + 21.2), 1.5, cz, 3, 5.4, 8, D.marble, { solid: true });
    mbox(scene, X(cx + 21.2), 6.9, cz, 3.4, 0.6, 8.6, D.marble);
    chhatri(scene, X(cx + 21.2), 7.5, cz, 1.3, D.marble);
    for (const sz of [-26, 26]) chhatri(scene, X(cx), 10.5, sz, 1.1, D.marble);
    MAP_SHAPES.push({ k: "r", x0: X(cx - 19), x1: X(cx + 19), z0: -31, z1: 31, c: "#b55a40" });
  }

  // Open marble pavilions on a low plinth, like the palaces along the river wall.
  function pavilion(cx, cz, w, d, cols, rows, h, o = {}) {
    const m = o.mat || D.marble;
    mbox(scene, X(cx), 0, cz, w + 5, 0.6, d + 5, D.stone, { walk: true });
    mbox(scene, X(cx), 0.6, cz, w + 2, 0.6, d + 2, m, { walk: true, map: "#e8e0cc" });
    const y0 = 1.2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const px = X(cx - w / 2 + 0.7 + (i * (w - 1.4)) / (cols - 1)), pz = cz - d / 2 + 0.7 + (j * (d - 1.4)) / (rows - 1);
      mbox(scene, px, y0, pz, 1.2, h, 1.2, m, { solid: true });
    }
    mbox(scene, X(cx), y0 + h, cz, w + 1.6, 0.8, d + 1.6, m);
    mbox(scene, X(cx), y0 + h + 0.8, cz, w + 3, 0.5, d + 3, m, { cast: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) chhatri(scene, X(cx + sx * (w / 2 - 1)), y0 + h + 1.3, cz + sz * (d / 2 - 1), 1, m);
    if (o.dome) dome(scene, X(cx), y0 + h + 1.3, cz, o.dome, o.dome * 1.2, D.gold, 0.8);
    MAP_SHAPES.push({ k: "r", x0: X(cx - w / 2 - 2.5), x1: X(cx + w / 2 + 2.5), z0: cz - d / 2 - 2.5, z1: cz + d / 2 + 2.5, c: "#eee6d0" });
  }

  function buildPalaces() {
    pavilion(280, -88, 26, 20, 4, 3, 5.6);                          // Diwan-i-Khas
    pavilion(280, -30, 18, 14, 3, 2, 5.2, { dome: 3.2 });            // Khas Mahal
    pavilion(280, 28, 28, 16, 5, 3, 5.4);                            // Rang Mahal
    mbox(scene, X(280), 1.2, 28, 5, 0.3, 5, D.marble); mbox(scene, X(280), 1.5, 28, 3.6, 0.1, 3.6, D.water);   // the lotus basin
    pavilion(280, 82, 18, 12, 3, 2, 5);                              // Mumtaz Mahal
    // the Muthamman Burj: an octagonal tower on the river wall, with a gilded dome
    mcyl(scene, X(300), 0, -30, 7.5, 12, D.marble, { sides: 8, solid: true });
    mcyl(scene, X(300), 12, -30, 8.2, 0.6, D.marble, { sides: 8 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; chhatri(scene, X(300) + Math.cos(a) * 6.2, 12.6, -30 + Math.sin(a) * 6.2, 0.7, D.marble); }
    dome(scene, X(300), 12.6, -30, 3.6, 4.4, D.gold, 0.6);
    // the Stream of Paradise: a narrow marble channel running along the front of the palaces
    mbox(mughal, X(262.5), 0.02, 25, 3, 0.05, 220, D.water, { cast: false });
    mbox(mughal, X(260.8), 0.02, 25, 0.5, 0.25, 220, D.marble, { cast: false }); mbox(mughal, X(264.2), 0.02, 25, 0.5, 0.25, 220, D.marble, { cast: false });
    // Moti Masjid: the small white pearl mosque
    mbox(scene, X(232), 0, -128, 16, 1.2, 12, D.marble, { walk: true });
    mbox(scene, X(232), 1.2, -134, 14, 5.2, 1.4, D.marble, { solid: true });
    for (const dx of [-4.5, 0, 4.5]) dome(scene, X(232) + dx, 6.4, -134, 2, 2.8, D.marble, 0.6);
    for (const dx of [-6, 6]) chhatri(scene, X(232) + dx, 6.4, -134, 0.7, D.marble);
    MAP_SHAPES.push({ k: "r", x0: X(224), x1: X(240), z0: -134, z1: -122, c: "#f0e6d0" });
  }

  function buildFortGardens() {
    // Hayat Bakhsh Bagh, the "life-giving garden": a chahar bagh with a great pool and paths
    const gx = 190, gz = -205;
    mbox(mughal, X(gx + 30), 0.03, gz, 64, 0.06, 90, D.lawn, { cast: false });
    mbox(mughal, X(gx + 30), 0.05, gz, 3.4, 0.05, 90, D.stone, { cast: false }); mbox(mughal, X(gx + 30), 0.05, gz, 64, 0.05, 3.4, D.stone, { cast: false });
    mbox(mughal, X(gx + 30), 0.08, gz, 20, 0.4, 20, D.marble, { walk: false, cast: false });
    mbox(mughal, X(gx + 30), 0.3, gz, 18, 0.2, 18, D.water, { cast: false });
    mbox(mughal, X(gx + 30), 0, gz - 38, 10, 4, 6, D.red, { solid: true, era: "ancient" });
    chhatri(mughal, X(gx + 30), 4, gz - 38, 1, D.marble);
    // the same ground today: a plain lawn crossed by paths
    mbox(modernG, X(gx + 30), 0.03, gz, 64, 0.06, 90, D.lawn, { cast: false });
    mbox(modernG, X(gx + 30), 0.05, gz, 3.4, 0.05, 90, D.stone, { cast: false });
    // a garden court in the south (Mughal); British barracks and a parade ground (modern)
    mbox(mughal, X(205), 0.03, 175, 90, 0.06, 100, D.lawn, { cast: false });
    mbox(mughal, X(205), 0.05, 175, 6, 0.06, 100, D.stone, { cast: false });
    mbox(mughal, X(205), 0.05, 175, 90, 0.06, 6, D.stone, { cast: false });
    mbox(mughal, X(205), 0, 175, 14, 0.5, 14, D.marble, { cast: false });
    mbox(mughal, X(205), 0.45, 175, 12, 0.1, 12, D.water, { cast: false });
    for (let i = 0; i < 4; i++) {
      mbox(modernG, X(170 + i * 22), 0, 160, 16, 8, 42, lambert(0xcfc8b4), { solid: true, era: "modern", map: "#cfc8b4" });
      mbox(modernG, X(170 + i * 22), 8, 160, 17.5, 0.6, 43.5, D.grey);
    }
    // the national flag over the Lahori Gate (today)
    mcyl(modernG, X(4), 24, 0, 0.25, 20, D.white);
    mbox(modernG, X(4) + 0.1, 40, -2.6, 0.12, 1.2, 5.2, lambert(0xf2832a)); mbox(modernG, X(4) + 0.1, 38.8, -2.6, 0.12, 1.2, 5.2, D.white); mbox(modernG, X(4) + 0.1, 37.6, -2.6, 0.12, 1.2, 5.2, lambert(0x1a8a3a));
  }

  // ---------- Chandni Chowk and the old city ----------

  const MUGHAL_WALLS = [0xdcb27c, 0xcf8f6a, 0xe3c796, 0xc9785c, 0xe8d3a6, 0xb8855c, 0xd9a58a].map((c) => new T.Color(c));
  const MODERN_WALLS = [0xbfc3c6, 0x9fb1b9, 0xd6cfc1, 0x7e8a85, 0xdedfd8, 0xb08a64, 0xa9b6a0].map((c) => new T.Color(c));
  const MUGHAL_AWN = [0xb3262b, 0xd9a13a, 0x2f6b8f, 0x4a7a3a, 0xd9791f, 0x7a3a8f].map((c) => new T.Color(c));
  const MODERN_AWN = [0xe23b3b, 0x2c7fe0, 0xf2c21b, 0x27a35a, 0xf26a1b, 0xd9d9d9].map((c) => new T.Color(c));

  const EXCL = [ // [x0, x1, z0, z1] in local coordinates: where the town is not built
    [-640, 12, -19, 19], [-92, 12, -72, 72], [-4, 314, -282, 282],
    [-340, -132, 195, 352], [-159, -141, 18, 400], [-292, -188, -112, -18], [-136, -64, -96, -18],
    [-708, -610, -76, 76], [-424, -416, -340, -18], [-232, -192, 18, 46],
  ];
  const excluded = (x, z, m = 0) => EXCL.some(([x0, x1, z0, z1]) => x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m);

  function buildTown() {
    const bodies = [], shops = [];
    // shops lining both sides of Chandni Chowk: two storeys, a shopfront, an awning and a balcony
    for (const side of [-1, 1]) {
      for (let x = -606; x < -88; x += 9.4) {
        if (excluded(x, side * 24, -1)) continue;
        bodies.push({ x, z: side * 23.5, w: 9, d: 10, h: 8.5 + rnd() * 3, ci: Math.floor(rnd() * MUGHAL_WALLS.length), shop: side, ai: Math.floor(rnd() * MUGHAL_AWN.length) });
        shops.push(bodies[bodies.length - 1]);
      }
    }
    // the dense blocks and lanes behind them
    for (let x = -700; x < 320; x += 26) for (let z = -330; z < 390; z += 22) {
      const px = x + (rnd() - 0.5) * 3, pz = z + (rnd() - 0.5) * 3;
      if (excluded(px, pz, 8) || (Math.abs(pz) < 30)) continue;
      if (rnd() < 0.14) continue;
      bodies.push({ x: px, z: pz, w: 20 + rnd() * 3, d: 16 + rnd() * 3, h: 6 + Math.floor(rnd() * 4) * 2.4, ci: Math.floor(rnd() * MUGHAL_WALLS.length) });
    }
    const n = bodies.length, o = new T.Object3D();
    const bodyGeo = BOX.clone(); bodyGeo.translate(0, 0.5, 0);
    const body = new T.InstancedMesh(bodyGeo, new T.MeshLambertMaterial({ color: 0xffffff }), n);
    const roofs = new T.InstancedMesh(bodyGeo, lambert(0xa0452c), n);
    bodies.forEach((b, i) => {
      o.rotation.set(0, 0, 0);
      o.position.set(X(b.x), 0, b.z); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
      o.position.set(X(b.x), b.h, b.z); o.scale.set(b.w + 0.8, 0.9, b.d + 0.8); o.updateMatrix(); roofs.setMatrixAt(i, o.matrix);
      body.setColorAt(i, MUGHAL_WALLS[b.ci]);
      addBlockerBox(X(b.x) - b.w / 2, X(b.x) + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, 0, b.h + 1);
      MAP_SHAPES.push({ k: "r", x0: X(b.x) - b.w / 2, x1: X(b.x) + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, c: "#d6a67f" });
    });
    body.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true; body.instanceColor.needsUpdate = true;
    body.frustumCulled = roofs.frustumCulled = false; body.castShadow = false; roofs.castShadow = false;
    scene.add(body, roofs);
    palettes.push({ mesh: body, list: bodies, mughal: MUGHAL_WALLS, modern: MODERN_WALLS, key: "ci" });
    DELHI_MATS.body = body; DELHI_MATS.roofs = roofs;

    // shopfronts: dark doorways, awnings and balconies on the street side
    const ns = shops.length;
    const doors = new T.InstancedMesh(BOX, D.dark, ns), awn = new T.InstancedMesh(BOX, new T.MeshLambertMaterial({ color: 0xffffff }), ns), bal = new T.InstancedMesh(BOX, lambert(0x7a4a2a), ns);
    shops.forEach((b, i) => {
      const fz = b.z - b.shop * (b.d / 2 + 0.05);  // the face looking at the street
      o.rotation.set(0, 0, 0);
      o.position.set(X(b.x), 1.6, fz); o.scale.set(b.w - 1.6, 3.2, 0.2); o.updateMatrix(); doors.setMatrixAt(i, o.matrix);
      o.position.set(X(b.x), 3.5, fz - b.shop * 0.9); o.rotation.set(b.shop * 0.35, 0, 0); o.scale.set(b.w - 0.8, 0.12, 2.1); o.updateMatrix(); awn.setMatrixAt(i, o.matrix); awn.setColorAt(i, MUGHAL_AWN[b.ai]);
      o.rotation.set(0, 0, 0);
      o.position.set(X(b.x), 5.6, fz - b.shop * 0.5); o.scale.set(3, 1.5, 1.1); o.updateMatrix(); bal.setMatrixAt(i, o.matrix);
    });
    for (const m of [doors, awn, bal]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; scene.add(m); }
    awn.instanceColor.needsUpdate = true;
    palettes.push({ mesh: awn, list: shops, mughal: MUGHAL_AWN, modern: MODERN_AWN, key: "ai" });
  }
  const DELHI_MATS = {};

  function buildChandniChowk() {
    // the canal down the middle, widening into the moonlit pool; stone kerbs on both sides
    mbox(mughal, X(-340), 0.02, 0, 520, 0.05, 3, D.water, { cast: false });
    mbox(mughal, X(-340), 0.02, -1.9, 520, 0.28, 0.5, D.marble, { cast: false }); mbox(mughal, X(-340), 0.02, 1.9, 520, 0.28, 0.5, D.marble, { cast: false });
    mcyl(mughal, X(-310), 0.0, 0, 11.5, 0.3, D.marble); mcyl(mughal, X(-310), 0.28, 0, 10.4, 0.06, D.water);
    // trees along the avenue's edges
    const trunk = new T.CylinderGeometry(0.25, 0.35, 1, 6); trunk.translate(0, 0.5, 0);
    const crown = new T.SphereGeometry(1, 9, 7); crown.translate(0, 0.9, 0);
    D.lawn.userData.leaf = 0x6e9446; // lawns and leaves change colour with the seasons (weather.js)
    const spots = [];
    for (let x = -590; x < -100; x += 28) for (const s of [-1, 1]) spots.push([x + (rnd() - 0.5) * 6, s * 15.2]);
    const tr = new T.InstancedMesh(trunk, lambert(0x5a4630), spots.length), cr = new T.InstancedMesh(crown, Object.assign(lambert(0x4a7a36), { userData: { leaf: 0x4a7a36 } }), spots.length), o = new T.Object3D();
    spots.forEach(([x, z], i) => {
      o.rotation.set(0, 0, 0); o.position.set(X(x), 0, z); o.scale.set(1, 4, 1); o.updateMatrix(); tr.setMatrixAt(i, o.matrix);
      o.position.set(X(x), 4, z); o.scale.set(3, 3, 3); o.updateMatrix(); cr.setMatrixAt(i, o.matrix);
      addBlockerCircle(X(x), z, 0.4, 0, 4);
    });
    for (const m of [tr, cr]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = true; scene.add(m); }

    // Begum ki Serai (Mughal): a two-storey inn around a courtyard. Today the Town Hall stands here.
    const sx = -240, sz = -62;
    const ranges = [ // [cx, cz, w, d] ranges of rooms around the courtyard; the south range has the gate
      [sx, -92, 66, 8], [sx - 29, sz, 8, 64], [sx + 29, sz, 8, 64], [sx - 20, -32, 26, 8], [sx + 20, -32, 26, 8],
    ];
    for (const [cx, cz, w, d] of ranges) {
      mbox(mughal, X(cx), 0, cz, w, 8.5, d, D.red, { solid: true, era: "ancient", map: "#b55a40" });
      mbox(mughal, X(cx), 8.5, cz, w + 0.8, 0.8, d + 0.8, D.redDark);
    }
    for (const dz of [-27, 0, 27]) for (const sd of [-1, 1]) mbox(mughal, X(sx + sd * 24.9), 0.1, sz + dz, 0.3, 4, 3.6, D.dark, { cast: false });
    gate(mughal, X(sx), -32, false, 12, 11, 8, 6, 8.5, D.red);
    chhatri(mughal, X(sx - 6.5), 11, -32, 0.9, D.marble); chhatri(mughal, X(sx + 6.5), 11, -32, 0.9, D.marble);
    mbox(mughal, X(sx), 0.05, sz, 44, 0.06, 56, D.stone, { cast: false });
    MAP_SHAPES.push({ k: "r", x0: X(-275), x1: X(-205), z0: -97, z1: -27, c: "#b55a40" });
    // the Town Hall, put up by the British in the 1860s (today)
    const th = lambert(0xe3d9c2);
    mbox(modernG, X(sx), 0, -62, 60, 14, 26, th, { solid: true, era: "modern", map: "#cfc6ae" });
    mbox(modernG, X(sx), 14, -62, 62, 1, 28, D.grey);
    for (let i = 0; i < 9; i++) mbox(modernG, X(sx - 24 + i * 6), 0, -48, 1.2, 10, 1.2, D.white);
    mbox(modernG, X(sx), 10, -48, 56, 1, 3, D.white);
    mbox(modernG, X(sx), 14, -50, 8, 5, 8, th, { solid: true, era: "modern" }); mbox(modernG, X(sx), 19, -50, 9, 1, 9, D.grey);
    dome(modernG, X(sx), 20, -50, 3, 3.4, lambert(0x6f7f6a));

    // Katra Neel: an archway into the indigo dyers' lane
    gate(scene, X(-420), -23, false, 15, 14, 10, 6, 8.5, D.red);
    mbox(scene, X(-420), 14, -23, 13, 1, 10.8, D.redDark);
    chhatri(scene, X(-424), 15, -23, 0.8, D.marble); chhatri(scene, X(-416), 15, -23, 0.8, D.marble);
    MAP_SHAPES.push({ k: "r", x0: X(-423), x1: X(-417), z0: -340, z1: -28, c: "#d6c8a8" });

    buildHouses();
  }


  // ---------- your house: a plot off Chandni Chowk that grows as you buy (Market) ----------

  const houses = [0, 1, 2, 3].map(() => ({ g: new T.Group(), blockers: [] }));
  let houseTier = 0;
  // the bedroom of each size of house, where Z puts you to sleep: centre and half-sizes
  const ROOMS = [{ x: -100, z: -34, hw: 4, hd: 3.6 }, { x: -100, z: -44, hw: 7, hd: 5 }, { x: -82, z: -72, hw: 5.6, hd: 5.6 }, { x: -82, z: -72, hw: 5.6, hd: 5.6 }];
  const PLOT = { x0: -118, x1: -66, z0: -90, z1: -18 };

  function hb(t, cx, y0, cz, w, h, d, m, solid = true) { // a box in house `t`
    const mesh = mbox(houses[t].g, X(cx), y0, cz, w, h, d, m);
    if (solid) houses[t].blockers.push(addBlockerBox(X(cx) - w / 2, X(cx) + w / 2, cz - d / 2, cz + d / 2, y0, y0 + h));
    return mesh;
  }
  function hc(t, cx, y0, cz, r, h, m, solid = true, sides = 16) {
    const mesh = mcyl(houses[t].g, X(cx), y0, cz, r, h, m, { sides: sides === 8 ? 8 : undefined });
    if (solid) houses[t].blockers.push(addBlockerCircle(X(cx), cz, r, y0, y0 + h));
    return mesh;
  }
  function hdome(t, cx, y0, cz, r, h, m, drum = 0) { dome(houses[t].g, X(cx), y0, cz, r, h, m, drum); }
  const leafMat = Object.assign(lambert(0x4a7a36), { userData: { leaf: 0x4a7a36 } });
  function htree(t, cx, cz, s = 1) { hc(t, cx, 0, cz, 0.3 * s, 3.2 * s, lambert(0x5a4630), true); const c = new T.Mesh(new T.SphereGeometry(1.8 * s, 9, 7), leafMat); c.position.set(X(cx), 4.2 * s, cz); c.castShadow = true; houses[t].g.add(c); }
  function hlawn(t, cx, cz, w, d) { mbox(houses[t].g, X(cx), 0.04, cz, w, 0.06, d, D.lawn, { cast: false }); }
  function hfountain(t, cx, cz, r = 2.6) { hc(t, cx, 0, cz, r, 0.7, D.marble, true); hc(t, cx, 0.6, cz, r * 0.82, 0.1, D.water, false); hc(t, cx, 0.7, cz, 0.35, 1.6, D.marble, false); }

  // a room with the door on its south side: four walls, a roof and a bed
  function hroom(t, cx, cz, w, d, h, doorX, doorW) {
    const k = 0.6;
    hb(t, cx, 0, cz - d / 2 + k / 2, w, h, k, D.cream);
    hb(t, cx - w / 2 + k / 2, 0, cz, k, h, d, D.cream); hb(t, cx + w / 2 - k / 2, 0, cz, k, h, d, D.cream);
    const left = (doorX - doorW / 2) - (cx - w / 2), right = (cx + w / 2) - (doorX + doorW / 2);
    hb(t, cx - w / 2 + left / 2, 0, cz + d / 2 - k / 2, left, h, k, D.cream);
    hb(t, cx + w / 2 - right / 2, 0, cz + d / 2 - k / 2, right, h, k, D.cream);
    hb(t, doorX, h - 1.4, cz + d / 2 - k / 2, doorW, 1.4, k, D.cream, false);
    hb(t, cx, h, cz, w + 1, 0.45, d + 1, D.redDark, false);
    hb(t, cx - w / 2 + 2.2, 0, cz - d / 2 + 2.6, 1.3, 0.55, 2.6, lambert(0x9a2f2f), false);
    hb(t, cx - w / 2 + 2.2, 0.55, cz - d / 2 + 2.6, 1.3, 0.2, 2.6, D.white, false);
  }

  function grandHouse(t) { // a haveli built round a courtyard, with ranges of rooms on three sides
    for (const [cx, cz, w, d] of [[-92, -85, 48, 8], [-112, -63, 8, 36], [-72, -63, 8, 36]]) {
      hb(t, cx, 0, cz, w, 8, d, D.cream);
      hb(t, cx, 8, cz, w + 0.8, 0.8, d + 0.8, D.redDark, false);
      for (let k = -1; k <= 1; k++) hb(t, w > d ? cx + k * 14 : cx + (cx < -92 ? 4.1 : -4.1), 0.1, w > d ? cz + 4.1 : cz + k * 10, w > d ? 3.4 : 0.3, 4, w > d ? 0.3 : 3.4, D.dark, false);
    }
    hlawn(t, -92, -48, 30, 54);
    hfountain(t, -92, -62, 3);
    for (const [cx, cz] of [[-110, -85], [-74, -85], [-114, -44], [-70, -44]]) chhatri(houses[t].g, X(cx), 8.8, cz, 0.9, D.marble);
    // the bedroom: three walls, a roof and a bed, open to the courtyard
    const bx = -82, bz = -72;
    hb(t, bx + 5.8, 0, bz, 0.6, 5, 11.6, D.cream); hb(t, bx, 0, bz - 5.8, 11.6, 5, 0.6, D.cream); hb(t, bx, 0, bz + 5.8, 11.6, 5, 0.6, D.cream);
    hb(t, bx, 5, bz, 12.4, 0.45, 12.4, D.redDark, false);
    hb(t, bx + 3, 0, bz - 2, 2.4, 0.55, 5, lambert(0x9a2f2f), false); hb(t, bx + 3, 0.55, bz - 2, 2.4, 0.2, 5, D.white, false);
    hb(t, bx - 1, 0, bz + 3.5, 1.4, 0.9, 1.4, D.wood, false);
  }

  function buildHouses() {
    // the plot's own wall, always there: low and plain, with a gate on the street
    const wall = new T.Group(); scene.add(wall);
    const w = (cx, cz, ww, dd) => mbox(wall, X(cx), 0, cz, ww, 3.5, dd, D.stone, { solid: true });
    w(-92, -89.5, 52, 1); w(-117.5, -54, 1, 72); w(-66.5, -54, 1, 72); w(-110.5, -18.5, 14, 1); w(-83, -18.5, 33, 1);
    mbox(wall, X(-100), 3.5, -18.5, 6.4, 0.8, 1.2, D.redDark, { cast: false });
    mbox(wall, X(-92), 0.03, -54, 50, 0.04, 70, lambert(0xc9b58a), { cast: false });
    MAP_SHAPES.push({ k: "r", x0: X(PLOT.x0), x1: X(PLOT.x1), z0: PLOT.z0, z1: PLOT.z1, c: "#e0cfa4" });

    // 0: a small one-room house, a well and a tree
    hroom(0, -100, -34, 9, 8, 4.2, -100, 3);
    hc(0, -88, 0, -26, 1, 1.1, D.stone); htree(0, -110, -24, 1);
    // 1: a bigger house with a veranda, and a garden with a fountain
    hroom(1, -100, -44, 16, 12, 5.5, -100, 4);
    for (const sx of [-1, 1]) hb(1, -100 + sx * 5, 0, -37.6, 0.5, 4.4, 0.5, D.wood, false);
    hb(1, -100, 4.4, -36.3, 13, 0.4, 3.4, D.redDark, false);
    hlawn(1, -100, -26, 36, 14); hfountain(1, -100, -24, 2.2);
    for (const [cx, cz] of [[-112, -28], [-88, -28], [-112, -70], [-88, -70], [-100, -75]]) htree(1, cx, cz, 1.1);
    // 2: the grand haveli; 3: the same, with a tower, a pavilion in a pool and a gate
    grandHouse(2);
    grandHouse(3);
    // a dresser in every house: against the east wall of the small house and the bigger one, and the north wall of the bedroom in the haveli and mahal
    const dm2 = { wood: D.wood, top: lambert(0x8a6a3a), drawer: lambert(0x5a3e22), mirror: new T.MeshBasicMaterial({ color: 0xb8d0dc }), frame: D.gold };
    [[0, -96.6, -36.4, "w"], [1, -93.4, -48.4, "w"], [2, -85, -76.6, "s"], [3, -85, -76.6, "s"]].forEach(([t, dx, dz, f]) => {
      for (const p of Dresser.parts(dx, dz, f)) hb(t, p.x, p.y0, p.z, p.w, p.h, p.d, dm2[p.mat], p.solid);
      Dresser.register("delhi", X(dx), dz, f, () => houseTier === t);
    });
    // a garage for every upgrade (not the small house), by the east wall of the plot, open to the west
    const gm = { wall: D.cream, roof: D.redDark, dark: lambert(0x6a625a), door: D.wood };
    for (let t = 1; t <= 3; t++) for (const p of Garage.parts(-72, -28, "w")) hb(t, p.x, p.y0, p.z, p.w, p.h, p.d, gm[p.mat], p.solid);
    Garage.register("delhi", scene, X(-72), -28, "w", () => houseTier);
    hc(3, -72, 0, -85, 5.5, 24, D.cream, true, 8);
    hc(3, -72, 24, -85, 6.4, 0.6, D.marble, false, 8);
    hdome(3, -72, 24.6, -85, 4, 5, D.gold, 0.8);
    hc(3, -92, 0, -62, 8.5, 0.6, D.marble, false); hc(3, -92, 0.55, -62, 7.8, 0.08, D.water, false);
    for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) hb(3, -92 + dx, 0.6, -62 + dz, 0.5, 4, 0.5, D.marble, false);
    hb(3, -92, 4.6, -62, 6, 0.4, 6, D.marble, false);
    hdome(3, -92, 5, -62, 2.4, 3, D.gold, 0.4);
    for (const sx of [-1, 1]) hb(3, -100 + sx * 4.2, 0, -19, 1.2, 8, 1.2, D.marble, false);
    for (const h of houses) scene.add(h.g);
    setTier(pendingTier);
  }
  let pendingTier = 0;
  function setTier(t) {
    pendingTier = t; houseTier = t;
    houses.forEach((h, i) => { h.g.visible = i === t; h.blockers.forEach((b) => { b.off = i !== t; }); });
  }

  // ---------- the mosques ----------

  function minaret(cx, cz, h, base = 2.4) {
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const bh = h / bands, r0 = base * (1 - (i / bands) * 0.3);
      mcyl(scene, cx, i * bh, cz, r0, bh, i % 2 ? D.marble : D.red, { sides: 8, solid: i === 0 });
      if (i && i % 2 === 0) mcyl(scene, cx, i * bh - 0.15, cz, r0 + 0.7, 0.4, D.marble, { sides: 8 });
    }
    mcyl(scene, cx, h, cz, base * 0.8, 0.4, D.marble, { sides: 8 });
    chhatri(scene, cx, h + 0.4, cz, 1.1, D.marble);
  }

  function buildJamaMasjid() {
    // a rocky rise 6 m high, with steps up on the east, north and south sides
    const px0 = -310, px1 = -170, pz0 = 215, pz1 = 325, top = 6;
    mbox(scene, X((px0 + px1) / 2), 0, (pz0 + pz1) / 2, px1 - px0, top, pz1 - pz0, D.stone, { walk: true, map: "#c9b58f" });
    steps(X(px1), 270, "+x", 26, 12, 0.5, 1.0);
    steps(X(-240), pz0, "-z", 12, 12, 0.5, 1.0);
    steps(X(-240), pz1, "+z", 12, 12, 0.5, 1.0);
    const fl = new T.Mesh(new T.PlaneGeometry(px1 - px0 - 12, pz1 - pz0 - 12), new T.MeshLambertMaterial({ map: pavingTex("#d8cba8", "rgba(110,80,50,.3)", 32, 12, 10) }));
    fl.rotation.x = -Math.PI / 2; fl.position.set(X((px0 + px1) / 2), top + 0.03, 270); fl.receiveShadow = true; scene.add(fl);
    // the walls and cloisters around the courtyard, each with a gateway
    const wallH = 7, y0 = top;
    mbox(scene, X(px1 - 1), y0, 232.5, 2, wallH, 35, D.red, { solid: true }); mbox(scene, X(px1 - 1), y0, 307.5, 2, wallH, 35, D.red, { solid: true });
    mbox(scene, X(-277), y0, pz0 + 1, 62, wallH, 2, D.red, { solid: true }); mbox(scene, X(-202), y0, pz0 + 1, 64, wallH, 2, D.red, { solid: true });
    mbox(scene, X(-277), y0, pz1 - 1, 62, wallH, 2, D.red, { solid: true }); mbox(scene, X(-202), y0, pz1 - 1, 64, wallH, 2, D.red, { solid: true });
    for (let i = 0; i < 18; i++) { mbox(scene, X(-296 + i * 6.8), y0 + 0.1, pz0 + 2.1, 3.2, 3.6, 0.3, D.dark, { cast: false }); mbox(scene, X(-296 + i * 6.8), y0 + 0.1, pz1 - 2.1, 3.2, 3.6, 0.3, D.dark, { cast: false }); }
    // the great east gateway
    gate(scene, X(px1 - 1), 270, true, 40, 20, 4, 12, 13.5, D.red, y0);
    for (const sz of [-1, 1]) chhatri(scene, X(px1 - 1), y0 + 20, 270 + sz * 16, 1.3, D.marble);
    chhatri(scene, X(px1 - 1), y0 + 20, 270, 1.5, D.marble);
    // the prayer hall on the west: a tall central arch, three domes and the two minarets
    const hx = -296;
    mbox(scene, X(hx), y0, 270, 27, 13, 61, D.red, { solid: true, map: "#b55a40" });
    for (let i = 0; i < 11; i++) mbox(scene, X(hx + 13.7), y0 + 0.1, 242 + i * 5.2, 2.6, 6, 0.3, D.dark, { cast: false });
    mbox(scene, X(hx + 13.5), y0, 270, 3, 18, 14, D.red, { solid: true });
    mbox(scene, X(hx + 15.2), y0 + 0.1, 270, 0.4, 11, 8, D.dark, { cast: false });
    mbox(scene, X(hx + 13.5), y0 + 18, 270, 3.4, 1, 14.6, D.marble);
    mbox(scene, X(hx), y0 + 13, 270, 28, 1, 62, D.marble);
    const stripe = lambert(0xe8e4da);
    dome(scene, X(hx), y0 + 14, 270, 6.2, 8.5, stripe, 1.2); dome(scene, X(hx), y0 + 14, 247, 4.6, 6.5, stripe, 1.0); dome(scene, X(hx), y0 + 14, 293, 4.6, 6.5, stripe, 1.0);
    minaret(X(hx + 14), 240, 40); minaret(X(hx + 14), 300, 40);
    // the washing pool in the middle of the court
    mbox(scene, X(-232), y0, 270, 16, 0.5, 16, D.marble, { walk: true }); mbox(scene, X(-232), y0 + 0.45, 270, 13.6, 0.08, 13.6, D.water, { cast: false });
    MAP_SHAPES.push({ k: "r", x0: X(px0), x1: X(px1), z0: pz0, z1: pz1, c: "#cdbb94" }, { k: "r", x0: X(hx - 13), x1: X(hx + 13), z0: 239, z1: 301, c: "#b55a40" });
  }

  function buildFatehpuri() {
    // a red sandstone mosque closing the west end of the avenue
    const wx = -690;
    mbox(scene, X(wx), 0, 0, 24, 11, 60, D.red, { solid: true, map: "#b55a40" });
    mbox(scene, X(wx + 13), 0, 0, 3, 15, 12, D.red, { solid: true });
    for (let i = 0; i < 7; i++) mbox(scene, X(wx + 12.4), 0.1, -24 + i * 8, 2.4, 6, 0.3, D.dark, { cast: false });
    mbox(scene, X(wx), 11, 0, 25, 0.9, 61, D.marble);
    dome(scene, X(wx), 11.9, 0, 9, 13, D.marble, 2);
    for (const sz of [-1, 1]) { dome(scene, X(wx), 11.9, sz * 20, 3.6, 5, D.marble, 1); minaret(X(wx + 13), sz * 29, 24, 1.7); }
    // courtyard wall and the gateway onto Chandni Chowk
    mbox(scene, X(-650), 0, -38, 62, 6, 2, D.red, { solid: true }); mbox(scene, X(-650), 0, 38, 62, 6, 2, D.red, { solid: true });
    mbox(scene, X(-645), 0, -23, 3, 6, 30, D.red, { solid: true }); mbox(scene, X(-645), 0, 23, 3, 6, 30, D.red, { solid: true });
    mbox(scene, X(-645), 6, 0, 3.4, 0.7, 16, D.redDark);
    for (const sz of [-1, 1]) chhatri(scene, X(-645), 6.7, sz * 8, 0.9, D.marble);
    MAP_SHAPES.push({ k: "r", x0: X(-702), x1: X(-620), z0: -40, z1: 40, c: "#cdbb94" }, { k: "r", x0: X(wx - 12), x1: X(wx + 12), z0: -30, z1: 30, c: "#b55a40" });
  }


  // ---------- the places for the games ----------

  const VENUES = [
    { id: "kushti", x: -45, z: 35, r: 11, text: "F: wrestle in the akhara (kushti)" },
    { id: "race", x: -572, z: 0, r: 18, text: "F: race down Chandni Chowk" },
    { id: "defend", x: 4, z: 45, r: 10, top: true, text: "F: man the cannon and defend the Red Fort" },
    { id: "kites", x: -18, z: -42, r: 8, text: "F: fly kites at the kite stall" },
    { id: "pachisi", x: 112, z: -45, r: 9, text: "F: play pachisi" },
    { id: "bazaar", x: -352, z: -12, r: 8, text: "F: trade at the bazaar stall" },
    { id: "run", x: -215, z: 13, r: 7, text: "F: take a tray of chaat and deliver it" },
  ];
  let cannonG = null;
  const venueAt = (x, z, feet) => VENUES.find((v) => Math.hypot(x - X(v.x), z - v.z) < v.r && (v.top ? feet > 18 : feet < 6)) || null;

  function boardSign(parent, cx, y, cz, w, h, text, sub, rotY = 0, bg = "#3a2a1a", fg = "#f2d98a") {
    const tex = canvasTex(256, 64, (g, ww, hh) => {
      g.fillStyle = bg; g.fillRect(0, 0, ww, hh); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(3, 3, ww - 6, hh - 6);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = `bold ${sub ? 28 : 34}px sans-serif`; g.fillText(text, ww / 2, sub ? 25 : 34);
      if (sub) { g.font = "bold 16px sans-serif"; g.fillText(sub, ww / 2, 49); }
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide, emissive: 0x201808 }));
    m.position.set(cx, y, cz); m.rotation.y = rotY; parent.add(m);
    return m;
  }
  const stripeTex = (a, b) => canvasTex(64, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 8, 0, 8, h); } });
  const checkTex = () => canvasTex(64, 64, (g, w, h) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? "#161616" : "#f4f4f4"; g.fillRect(i * 8, j * 8, 8, 8); } });

  function buildVenues() {
    const vg = new T.Group(); scene.add(vg);
    const flagCols = [0xe23b3b, 0xf2c21b, 0x2c7fe0, 0x27a35a, 0xf26a1b];

    // the akhara: a mud pit with a stone rim, bunting on poles, clubs and a sign
    const pitC = { x: X(-45), z: 35 }, R = 7.5;
    const pit = new T.Mesh(new T.CircleGeometry(R, 40), lambert(0xb08a5a)); pit.rotation.x = -Math.PI / 2; pit.position.set(pitC.x, 0.07, pitC.z); pit.receiveShadow = true; vg.add(pit);
    const rim = new T.Mesh(new T.TorusGeometry(R, 0.28, 8, 48), lambert(0x8a7a62)); rim.rotation.x = -Math.PI / 2; rim.position.set(pitC.x, 0.2, pitC.z); vg.add(rim);
    MAP_SHAPES.push({ k: "e", cx: pitC.x, cz: pitC.z, ax: R + 1, az: R + 1, c: "#c9a46a" });
    const polePos = [[-9.5, -9.5], [9.5, -9.5], [9.5, 9.5], [-9.5, 9.5]];
    polePos.forEach(([px, pz], i) => {
      mcyl(vg, pitC.x + px, 0, pitC.z + pz, 0.15, 5.4, lambert(0x8a6a3a), { solid: true });
      const [qx, qz] = polePos[(i + 1) % 4];
      for (let k = 1; k < 7; k++) { // little flags along the string between two poles
        const t = k / 7, fx = pitC.x + px + (qx - px) * t, fz = pitC.z + pz + (qz - pz) * t;
        mbox(vg, fx, 4.3 + Math.sin(t * Math.PI) * -0.6, fz, 0.9, 0.9, 0.05, lambert(flagCols[(i + k) % 5]), { cast: false });
      }
    });
    boardSign(vg, pitC.x, 3.3, pitC.z - 11.2, 5.5, 1.4, "AKHARA", "kushti wrestling");
    mcyl(vg, pitC.x + 10.5, 0, pitC.z + 4, 0.5, 1.4, lambert(0x7a5a32), { solid: true }); mcyl(vg, pitC.x + 10.5, 0, pitC.z - 4, 0.5, 1.4, lambert(0x7a5a32), { solid: true }); // the heavy clubs (mugdar)

    // the race: an arch of banners at the start line and another at the finish, with chequered lines
    function raceArch(rx, label, sub) {
      const wx = X(rx);
      for (const sz of [-1, 1]) mbox(vg, wx, 0, sz * 15.5, 0.7, 8, 0.7, lambert(0x6b4a2b), { solid: true });
      mbox(vg, wx, 8, 0, 0.6, 1.6, 32.4, lambert(0x6b4a2b));
      boardSign(vg, wx - 0.35, 8.8, 0, 12, 1.6, label, sub, -Math.PI / 2, "#a8282b", "#fff3c4");
      boardSign(vg, wx + 0.35, 8.8, 0, 12, 1.6, label, sub, Math.PI / 2, "#a8282b", "#fff3c4");
      for (let k = -3; k <= 3; k++) mbox(vg, wx, 9.6, k * 4.6, 0.1, 1.1, 1.4, lambert(flagCols[(k + 3) % 5]), { cast: false });
      const line = new T.Mesh(new T.PlaneGeometry(2.4, 28), new T.MeshLambertMaterial({ map: checkTex() })); line.material.map.repeat.set(2, 8);
      line.rotation.x = -Math.PI / 2; line.position.set(wx, 0.06, 0); vg.add(line);
    }
    raceArch(-583, "START", "Chandni Chowk race"); raceArch(-30, "FINISH", "the Lahori Gate");

    // the cannon on the rampart: a long ramp up the inside of the west wall, a walkway on top and a cannon facing the street
    const steps_ = 48, RISE = 24.8 / 48, stepGeo = new T.BoxGeometry(12, 1, 1.5);
    const ramp = new T.InstancedMesh(stepGeo, D.stone, steps_), side = new T.InstancedMesh(BOX, D.red, steps_), o = new T.Object3D();
    for (let k = 1; k <= steps_; k++) {
      const top = k * RISE, z1 = 100 - 1.5 * (k - 1), z0 = 100 - 1.5 * k;
      addPlatformBox(X(8), X(20), 27, z1, top);                       // each step's surface reaches back to the top of the ramp, so the highest one under you counts
      o.rotation.set(0, 0, 0); o.position.set(X(14), top / 2, (z0 + z1) / 2); o.scale.set(1, top, 1); o.updateMatrix(); ramp.setMatrixAt(k - 1, o.matrix);
      o.position.set(X(20.3), (top + 1.2) / 2, (z0 + z1) / 2); o.scale.set(0.6, top + 1.2, 1.5); o.updateMatrix(); side.setMatrixAt(k - 1, o.matrix);
      addBlockerBox(X(20), X(20.6), z0, z1, 0, top + 1.2);
    }
    for (const m of [ramp, side]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = m.receiveShadow = true; vg.add(m); }
    addPlatformBox(X(0), X(8), 27, 270, 24.8);                         // the walkway along the top of the wall
    addBlockerBox(X(0), X(1.2), 27, 270, 24.8, 27.2); addBlockerBox(X(6.8), X(8), 31, 270, 24.8, 27.2); // (the inner edge is open where the ramp comes up)
    addBlockerBox(X(0), X(8), 26, 27, 24.8, 27.2);
    mbox(vg, X(4), 24.8, 148.5, 7, 0.05, 243, lambert(0xb9ad94), { cast: false });
    cannonG = new T.Group(); cannonG.position.set(X(2.6), 24.85, 45); vg.add(cannonG);
    const iron = lambert(0x2e2e30);
    const cb = new T.Mesh(new T.CylinderGeometry(0.55, 0.8, 4.4, 12), iron); cb.rotation.z = Math.PI / 2 + 0.06; cb.position.set(-1.2, 1.5, 0); cb.castShadow = true; cannonG.add(cb);
    const carriage = new T.Mesh(BOX, D.wood); carriage.scale.set(3.2, 0.8, 1.6); carriage.position.set(-0.2, 0.9, 0); cannonG.add(carriage);
    for (const sz of [-1, 1]) { const w = new T.Mesh(new T.CylinderGeometry(0.8, 0.8, 0.25, 12), D.wood); w.rotation.x = Math.PI / 2; w.position.set(-0.2, 0.8, sz * 1.0); cannonG.add(w); }
    for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.SphereGeometry(0.35, 8, 6), iron); b.position.set(2.2 + (i % 3) * 0.7, 0.35, -2 + Math.floor(i / 3) * 0.7); cannonG.add(b); }
    addBlockerCircle(X(2.6), 45, 1.2, 24.8, 27);
    boardSign(vg, X(6.9), 27.4, 37, 4.2, 1.1, "CANNON", "defend the gate", -Math.PI / 2);
    MAP_SHAPES.push({ k: "r", x0: X(8), x1: X(20), z0: 28, z1: 100, c: "#9a9080" });

    // the kite stall: a counter, a canopy and kites on a rack
    const kx = X(-18), kz = -42;
    mbox(vg, kx, 0, kz, 6, 1.1, 1.6, D.wood, { solid: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mbox(vg, kx + sx * 3, 0, kz + sz * 1.3, 0.25, 3.4, 0.25, D.wood);
    mbox(vg, kx, 3.4, kz, 6.8, 0.2, 3.4, lambert(0xe8c13a), { cast: false });
    const kshape = new T.Shape(); kshape.moveTo(0, 0.9); kshape.lineTo(0.65, 0.1); kshape.lineTo(0, -0.8); kshape.lineTo(-0.65, 0.1); kshape.closePath();
    const kgeo = new T.ShapeGeometry(kshape);
    for (let i = 0; i < 7; i++) { const m = new T.Mesh(kgeo, new T.MeshLambertMaterial({ color: flagCols[i % 5], side: T.DoubleSide })); m.position.set(kx - 2.7 + i * 0.9, 2.4 - (i % 2) * 0.5, kz - 1.15); vg.add(m); }
    boardSign(vg, kx, 4.3, kz - 1.8, 5, 1.1, "PATANG", "kites for sale");
    MAP_SHAPES.push({ k: "r", x0: kx - 3.4, x1: kx + 3.4, z0: kz - 1.8, z1: kz + 1.8, c: "#e8c13a" });

    // the pachisi pavilion: a low platform with the painted cloth, cushions and a canopy
    const px = X(112), pz = -45;
    mbox(vg, px, 0, pz, 13, 0.4, 13, D.stone, { walk: true });
    const cloth = lambert(0xb3262b);
    mbox(vg, px, 0.41, pz, 4, 0.04, 4, lambert(0xe8c13a), { cast: false }); for (const [dx, dz, w, d] of [[0, -4.5, 4, 5], [0, 4.5, 4, 5], [-4.5, 0, 5, 4], [4.5, 0, 5, 4]]) mbox(vg, px + dx, 0.41, pz + dz, w, 0.04, d, cloth, { cast: false });
    for (let i = 0; i < 4; i++) mbox(vg, px + (i < 2 ? -1 : 1) * 5.4, 0.4, pz + (i % 2 ? -1 : 1) * 5.4, 1.2, 0.4, 1.2, lambert(flagCols[i]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mbox(vg, px + sx * 6.2, 0.4, pz + sz * 6.2, 0.3, 4.2, 0.3, D.wood);
    mbox(vg, px, 4.6, pz, 14, 0.25, 14, lambert(0xa8282b), { cast: false });
    boardSign(vg, px, 3.4, pz - 6.6, 5, 1.2, "PACHISI", "the game of kings");
    MAP_SHAPES.push({ k: "r", x0: px - 6.5, x1: px + 6.5, z0: pz - 6.5, z1: pz + 6.5, c: "#c0504d" });

    // the bazaar stall: a counter piled with sacks and goods, a scale and a striped awning
    const bx = X(-352), bz = -12.5;
    mbox(vg, bx, 0, bz, 6, 1.0, 1.6, D.wood, { solid: true });
    const goods = [0xd9791f, 0x2f6b8f, 0xb3262b, 0x4f7a3a, 0xe8d3a6];
    for (let i = 0; i < 5; i++) mbox(vg, bx - 2.4 + i * 1.2, 1.0, bz, 0.9, 0.5 + (i % 2) * 0.2, 0.9, lambert(goods[i]));
    for (const sx of [-1, 1]) mbox(vg, bx + sx * 3, 0, bz - 1.3, 0.25, 3.2, 0.25, D.wood);
    const awn = new T.Mesh(BOX, new T.MeshLambertMaterial({ map: stripeTex("#b3262b", "#f1ead8") })); awn.scale.set(6.8, 0.15, 3.4); awn.position.set(bx, 3.3, bz - 0.4); awn.rotation.x = -0.18; vg.add(awn);
    mbox(vg, bx + 1.4, 1.6, bz + 0.3, 0.08, 0.7, 0.08, D.dark); mbox(vg, bx + 1.4, 2.2, bz + 0.3, 0.9, 0.06, 0.06, D.dark);
    boardSign(vg, bx, 4.1, bz - 1.4, 5, 1.1, "BAZAAR", "spices · silk · jewels");
    MAP_SHAPES.push({ k: "r", x0: bx - 3.4, x1: bx + 3.4, z0: bz - 1.7, z1: bz + 1.7, c: "#d9791f" });

    // the chaat stall: a counter with big pots, a striped awning and a sign
    const cx = X(-215), cz = 13.5;
    mbox(vg, cx, 0, cz, 5, 1.0, 1.6, D.wood, { solid: true });
    for (const sx of [-1, 1]) mcyl(vg, cx + sx * 1.2, 1.0, cz, 0.7, 0.7, D.dark);
    mcyl(vg, cx, 1.0, cz, 0.45, 0.35, lambert(0xd9a928));
    for (const sx of [-1, 1]) mbox(vg, cx + sx * 2.5, 0, cz - 1.3, 0.25, 3.1, 0.25, D.wood);
    const awn2 = new T.Mesh(BOX, new T.MeshLambertMaterial({ map: stripeTex("#2f8f4a", "#f1ead8") })); awn2.scale.set(5.8, 0.15, 3.2); awn2.position.set(cx, 3.2, cz - 0.4); awn2.rotation.x = 0.18; vg.add(awn2);
    boardSign(vg, cx, 3.95, cz + 1.4, 4, 1.0, "CHAAT", "hot street food");
    MAP_SHAPES.push({ k: "r", x0: cx - 2.8, x1: cx + 2.8, z0: cz - 1.8, z1: cz + 1.8, c: "#2f8f4a" });

    // the market square on the open ground before the Lahori Gate
    Stalls.build(vg, X(-50), 60, "delhi");
    Guards.buildDelhi(scene);
    Jail.buildDelhi(scene);
    Stalls.street(vg, "delhi", [["Lahori Gate", X(-30), -22], ["Red Fort", X(70), 22], ["Chandni Chowk", X(-300), 24], ["Fatehpuri Masjid", X(-615), 36], ["Jama Masjid", X(-140), 205], ["Kite square", X(-18), -62], ["Your plot", X(-60), -10], ["Town hall", X(-420), 30]]);
  }


  // ---------- New Delhi: the road south, India Gate and Kartavya Path (they only exist today) ----------

  const GATE = { x: -100, z: 900 };
  const leafTrees = (parent, spots, color, scale = 1) => { // a batch of round trees (instanced)
    const trunk = new T.CylinderGeometry(0.25, 0.35, 1, 6); trunk.translate(0, 0.5, 0);
    const crown = new T.SphereGeometry(1, 9, 7); crown.translate(0, 0.9, 0);
    const tr = new T.InstancedMesh(trunk, lambert(0x5a4630), spots.length);
    const cr = new T.InstancedMesh(crown, Object.assign(lambert(color), { userData: { leaf: color } }), spots.length), o = new T.Object3D();
    spots.forEach(([x, z, k = 1], i) => {
      o.rotation.set(0, 0, 0); o.position.set(X(x), 0, z); o.scale.set(1, 4 * scale * k, 1); o.updateMatrix(); tr.setMatrixAt(i, o.matrix);
      o.position.set(X(x), 4 * scale * k, z); o.scale.set(3 * scale * k, 3 * scale * k, 3 * scale * k); o.updateMatrix(); cr.setMatrixAt(i, o.matrix);
    });
    for (const m of [tr, cr]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.castShadow = true; parent.add(m); }
  };

  function buildNewDelhi() {
    const gx = X(GATE.x), gz = GATE.z, sand = lambert(0xb98a5e, { map: stoneTex("#ffffff") }), granite = lambert(0x7d7d7a);
    // more ground to the south
    const g2 = new T.Mesh(new T.PlaneGeometry(1500, 900), lambert(0xa9a06f)); g2.rotation.x = -Math.PI / 2; g2.position.set(X(-190), -0.03, 820); g2.receiveShadow = true; scene.add(g2);
    // the road from the Jama Masjid lane south to the avenue: a dirt track in Shah Jahan's day, tarmac today
    const road = new T.Mesh(new T.PlaneGeometry(14, 540), new T.MeshLambertMaterial({ map: pavingTex("#c4b08a", "rgba(110,80,50,.28)", 32, 2, 38) }));
    road.rotation.x = -Math.PI / 2; road.position.set(X(-150), 0.03, 620); road.receiveShadow = true; scene.add(road);
    MAP_SHAPES.push({ k: "r", x0: X(-157), x1: X(-143), z0: 350, z1: 892, c: "#c8b99a" });
    const roadTrees = []; for (let z = 375; z < 880; z += 26) roadTrees.push([-162, z], [-138, z + 13]);
    leafTrees(scene, roadTrees, 0x4a7a36);

    // Shah Jahan's day: open scrubland with a few trees where New Delhi will one day stand
    const field = []; for (let i = 0; i < 26; i++) field.push([-420 + Math.random() * 520, 790 + Math.random() * 220, 0.8 + Math.random() * 0.7]);
    leafTrees(mughal, field, 0x5a7a3a);
    mbox(mughal, X(-190), 0.02, 900, 520, 0.04, 260, lambert(0xb5a56a), { cast: false });

    // Kartavya Path (once Rajpath): a paved avenue between two long canals and wide lawns
    const AV0 = -450, AV1 = -112, len = AV1 - AV0, cx = X((AV0 + AV1) / 2);
    const paveTex = pavingTex("#c9b58f", "rgba(110,80,50,.25)", 32, 40, 3);
    const av = new T.Mesh(new T.PlaneGeometry(len, 30), new T.MeshLambertMaterial({ map: paveTex })); av.rotation.x = -Math.PI / 2; av.position.set(cx, 0.03, gz); modernG.add(av);
    for (const sz of [-1, 1]) {
      mbox(modernG, cx, 0.02, gz + sz * 24, len, 0.05, 8, D.water, { cast: false });
      mbox(modernG, cx, 0, gz + sz * 28.5, len, 0.35, 0.7, D.marble, { cast: false }); mbox(modernG, cx, 0, gz + sz * 19.5, len, 0.35, 0.7, D.marble, { cast: false });
      mbox(modernG, cx, 0.03, gz + sz * 45, len, 0.06, 32, D.lawn, { cast: false });
    }
    // the lane crosses the canal on a bridge
    mbox(modernG, X(-150), 0.05, gz - 24, 14, 0.12, 9, lambert(0xc4b08a), { cast: false });
    const lawnTrees = []; for (let x = AV0 + 10; x < AV1 - 20; x += 24) lawnTrees.push([x, gz - 58], [x + 12, gz + 58]);
    leafTrees(modernG, lawnTrees, 0x4a7a36, 1.2);
    // street lamps down both edges
    const pole = new T.CylinderGeometry(0.1, 0.14, 1, 6); pole.translate(0, 0.5, 0);
    const lamps = []; for (let x = AV0 + 6; x < AV1; x += 30) lamps.push([x, gz - 16], [x, gz + 16]);
    const poles = new T.InstancedMesh(pole, D.grey, lamps.length), heads = new T.InstancedMesh(BOX, D.yellow, lamps.length), o = new T.Object3D();
    lamps.forEach(([x, z], i) => { o.rotation.set(0, 0, 0); o.position.set(X(x), 0, z); o.scale.set(1, 7, 1); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); o.position.set(X(x), 7, z); o.scale.set(1.2, 0.3, 0.6); o.updateMatrix(); heads.setMatrixAt(i, o.matrix); });
    for (const m of [poles, heads]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; modernG.add(m); }
    // the plaza round the gate
    const plaza = new T.Mesh(new T.PlaneGeometry(160, 120), new T.MeshLambertMaterial({ map: pavingTex("#cdbb96", "rgba(110,80,50,.28)", 32, 14, 10) })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(X(-50), 0.04, gz); modernG.add(plaza);

    // India Gate: a 42 m round arch of sandstone on a granite base, three low steps all round
    const E = "modern";
    mbox(modernG, gx, 0, gz, 46, 0.4, 42, granite, { walk: true, era: E });
    mbox(modernG, gx, 0.4, gz, 38, 0.4, 34, granite, { walk: true, era: E });
    mbox(modernG, gx, 0.8, gz, 32, 0.4, 28, granite, { walk: true, era: E });
    const base = 1.2;
    gate(modernG, gx, gz, true, 24, 38, 12, 11, 25, sand, base, { era: E, round: true });
    mbox(modernG, gx, base + 38, gz, 14, 1.2, 26, sand, { cast: true });                 // the cornice
    mbox(modernG, gx, base + 39.2, gz, 11, 1.0, 22, sand);
    mcyl(modernG, gx, base + 40.2, gz, 4.2, 0.9, D.dark);                                   // the shallow bowl on top
    mcyl(modernG, gx, base + 41.0, gz, 5.0, 0.3, sand);
    mbox(modernG, gx, base + 35.5, gz, 12.5, 2.6, 24, lambert(0xa57a52), { cast: false });   // the frieze
    for (const side of [-1, 1]) {
      boardSign(modernG, gx + side * 6.1, base + 36.8, gz, 14, 2.6, "INDIA", null, side * Math.PI / 2, "#a57a52", "#3a2a1a");
      const names = canvasTex(64, 128, (g, w, h) => { g.fillStyle = "#b98a5e"; g.fillRect(0, 0, w, h); g.fillStyle = "rgba(60,40,25,.55)"; for (let r = 4; r < h; r += 5) { let x = 3; while (x < w - 4) { const l = 3 + Math.random() * 9; g.fillRect(x, r, l, 1.6); x += l + 3; } } }, 1, 1);
      for (const sz of [-1, 1]) { const pl = new T.Mesh(new T.PlaneGeometry(4.6, 22), new T.MeshLambertMaterial({ map: names })); pl.position.set(gx + side * 6.05, base + 14, gz + sz * 8.3); pl.rotation.y = side * Math.PI / 2; modernG.add(pl); }
    }
    MAP_SHAPES.push({ k: "r", x0: gx - 23, x1: gx + 23, z0: gz - 21, z1: gz + 21, c: "#b98a5e" }, { k: "r", x0: X(AV0), x1: X(AV1), z0: gz - 15, z1: gz + 15, c: "#c8b99a" }, { k: "r", x0: X(AV0), x1: X(AV1), z0: gz - 28, z1: gz - 20, c: "#8fc0d9" }, { k: "r", x0: X(AV0), x1: X(AV1), z0: gz + 20, z1: gz + 28, c: "#8fc0d9" });

    // the canopy behind the gate, with a granite statue of Subhas Chandra Bose under it (put there in 2022)
    const kx = gx + 78;
    mbox(modernG, kx, 0, gz, 26, 0.5, 26, granite, { walk: true, era: E }); mbox(modernG, kx, 0.5, gz, 22, 0.5, 22, granite, { walk: true, era: E });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mbox(modernG, kx + sx * 8, 1, gz + sz * 8, 2.2, 10, 2.2, sand, { solid: true, era: E });
    mbox(modernG, kx, 11, gz, 21, 1.6, 21, sand);
    const roof = new T.Mesh(new T.ConeGeometry(15.5, 5, 4), sand); roof.position.set(kx, 13.4, gz); roof.rotation.y = Math.PI / 4; modernG.add(roof);
    mbox(modernG, kx, 1, gz, 4, 1.4, 4, granite, { solid: true, era: E }); mcyl(modernG, kx, 2.4, gz, 0.9, 5.6, D.dark); mcyl(modernG, kx, 2.4, gz, 1.1, 1.2, D.dark);
    const head = new T.Mesh(new T.SphereGeometry(0.62, 10, 8), D.dark); head.position.set(kx, 8.5, gz); modernG.add(head);
    MAP_SHAPES.push({ k: "r", x0: kx - 13, x1: kx + 13, z0: gz - 13, z1: gz + 13, c: "#b98a5e" });
  }

  // ---------- modern Delhi: the Metro, street lights, rickshaws ----------

  function buildModernBits() {
    // the entrance to Chandni Chowk Metro station: a glass canopy over a stairway, with a lit sign
    const mx = -212, mz = 30;
    mbox(modernG, X(mx - 7), 0, mz, 0.6, 4, 14, D.glass, { solid: true, era: "modern" }); mbox(modernG, X(mx + 7), 0, mz, 0.6, 4, 14, D.glass, { solid: true, era: "modern" });
    mbox(modernG, X(mx), 0, mz + 7, 14, 4, 0.6, D.glass, { solid: true, era: "modern" });
    mbox(modernG, X(mx), 4, mz, 15.6, 0.5, 14.6, D.white);
    mbox(modernG, X(mx), 0.05, mz - 1, 8, 0.06, 9, D.dark, { cast: false });
    const face = new T.MeshLambertMaterial({ map: signTex("CHANDNI CHOWK", "METRO · YELLOW LINE", "#f2c21b", "#1a1a1a"), emissive: 0x332a00 });
    const sign = new T.Mesh(new T.BoxGeometry(11, 2.4, 0.4), [D.yellow, D.yellow, D.yellow, D.yellow, face, face]);
    sign.position.set(X(mx), 6.4, mz - 6.6); modernG.add(sign);
    MAP_SHAPES.push({ k: "r", x0: X(mx - 8), x1: X(mx + 8), z0: mz - 7, z1: mz + 7, c: "#e8c860" });
    // street lamps down both edges of the avenue
    const pole = new T.CylinderGeometry(0.1, 0.14, 1, 6); pole.translate(0, 0.5, 0);
    const spots = []; for (let x = -600; x < -90; x += 36) for (const s of [-1, 1]) spots.push([x, s * 17.2]);
    const poles = new T.InstancedMesh(pole, D.grey, spots.length), heads = new T.InstancedMesh(BOX, D.yellow, spots.length), o = new T.Object3D();
    spots.forEach(([x, z], i) => {
      o.rotation.set(0, 0, 0); o.position.set(X(x), 0, z); o.scale.set(1, 7, 1); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
      o.position.set(X(x), 7, z - Math.sign(z) * 0.5); o.scale.set(0.6, 0.3, 1.4); o.updateMatrix(); heads.setMatrixAt(i, o.matrix);
    });
    for (const m of [poles, heads]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; modernG.add(m); }
  }

  // ---------- moving things: people, cycle rickshaws and bullock carts, elephants ----------

  const people = { list: [], body: null, head: null, hat: null };
  const WEAR_MUGHAL = [0xf1ead8, 0xf1ead8, 0xd8a23a, 0x9a2f2f, 0x4f7a4a, 0x3a5a8f, 0xe8d3a6, 0x6a4a8a].map((c) => new T.Color(c));
  const WEAR_MODERN = [0x2b3a55, 0x454545, 0xb23b3b, 0x3f6b4a, 0xd9d9d9, 0x8a6d3f, 0x2e2e2e, 0x5577aa].map((c) => new T.Color(c));
  const TURBAN = [0xf1ead8, 0xb3262b, 0xd9791f, 0x2f6b8f, 0xe8d3a6].map((c) => new T.Color(c));

  function buildPeople(count = 90) {
    const bodyGeo = new T.CylinderGeometry(0.3, 0.42, 1.35, 8); bodyGeo.translate(0, 0.68, 0);
    const headGeo = new T.SphereGeometry(0.19, 8, 6); headGeo.translate(0, 1.58, 0);
    const hatGeo = new T.SphereGeometry(0.24, 8, 6); hatGeo.scale(1, 0.7, 1); hatGeo.translate(0, 1.75, 0);
    const body = new T.InstancedMesh(bodyGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const head = new T.InstancedMesh(headGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const hat = new T.InstancedMesh(hatGeo, new T.MeshLambertMaterial({ color: 0xffffff }), count);
    const skins = [0xc9956b, 0xa8724c, 0x8d5a38, 0xd9a77a].map((c) => new T.Color(c));
    const hubs = [[-300, 0, 160, 14], [-100, 0, 40, 40], [100, 0, 60, 90], [-230, 270, 40, 40], [-640, 0, 40, 30], [200, -200, 50, 40], [-100, 900, 70, 40]];
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0;
      for (let t = 0; t < 40; t++) {
        const [hx, hz, hw, hd] = hubs[Math.floor(rnd() * hubs.length)];
        x = hx + (rnd() - 0.5) * 2 * hw; z = hz + (rnd() - 0.5) * 2 * hd;
        if (canMove(X(x), z, X(x) + 0.1, z) && !blockedAt(X(x), z, groundAt(X(x), z))) break;
      }
      people.list.push({ x: X(x), z, a: rnd() * 6.28, v: 0.8 + rnd() * 0.9, t: rnd() * 5, phase: rnd() * 6, ci: Math.floor(rnd() * 8), ti: Math.floor(rnd() * 5), turban: rnd() < 0.55 });
      head.setColorAt(i, skins[Math.floor(rnd() * skins.length)]);
      body.setColorAt(i, WEAR_MUGHAL[0]); hat.setColorAt(i, TURBAN[0]);
    }
    for (const m of [body, head, hat]) { m.instanceColor.needsUpdate = true; m.frustumCulled = false; scene.add(m); }
    body.castShadow = true;
    people.body = body; people.head = head; people.hat = hat;
  }

  const _o = new T.Object3D();
  function updatePeople(dt) {
    const { list, body, head, hat } = people;
    if (!body) return;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const down = (c.down || 0) > 0; // knocked over: lies on the ground for a moment, then gets up
      if (down) c.down -= dt;
      else {
        c.t -= dt;
        if (c.t <= 0) { c.a += (rnd() - 0.5) * 1.6; c.t = 2 + rnd() * 5; }
        const nx = c.x + Math.sin(c.a) * c.v * dt, nz = c.z + Math.cos(c.a) * c.v * dt;
        if (canMove(c.x, c.z, nx, nz)) { c.x = nx; c.z = nz; } else { c.a += Math.PI * (0.5 + rnd() * 0.8); c.t = 1.5; }
      }
      const bob = down ? 0 : Math.abs(Math.sin(clock * 5 + c.phase)) * 0.06;
      const tilt = down ? 1.35 * Math.min(1, c.down / 0.35) : 0;
      _o.position.set(c.x, groundAt(c.x, c.z) + bob + tilt * 0.3, c.z); _o.rotation.set(-tilt, c.a, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
      body.setMatrixAt(i, _o.matrix); head.setMatrixAt(i, _o.matrix);
      if (modernNow || !c.turban) { _o.scale.set(0, 0, 0); _o.updateMatrix(); }
      hat.setMatrixAt(i, _o.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hat.instanceMatrix.needsUpdate = true;
  }

  const rides = { list: [], a: null, b: null, c: null };
  function buildRides() {
    const n = 14;
    const A = new T.InstancedMesh(BOX, new T.MeshLambertMaterial({ color: 0xffffff }), n);
    const B = new T.InstancedMesh(BOX, new T.MeshLambertMaterial({ color: 0xffffff }), n);
    const C = new T.InstancedMesh(BOX, D.dark, n);
    for (const m of [A, B, C]) { m.frustumCulled = false; m.castShadow = true; scene.add(m); }
    for (let i = 0; i < n; i++) {
      const dir = i % 2 ? 1 : -1;
      rides.list.push({ x: X(-590 + rnd() * 480), z: dir * (6.2 + (i % 3) * 1.7), dir, v: 0, vmax: 1.5 + rnd() * 1.2, ci: i });
      A.setColorAt(i, new T.Color(0xffffff)); B.setColorAt(i, new T.Color(0xffffff));
    }
    A.instanceColor.needsUpdate = B.instanceColor.needsUpdate = true;
    rides.a = A; rides.b = B; rides.c = C;
  }
  const RIDE_COLORS = [0xe8c13a, 0x2f8f4a, 0xd9411f, 0x2f6bd9, 0xd9a13a, 0x8a3fd0];
  function updateRides(dt, px, pz) {
    const { list, a, b, c } = rides;
    if (!a) return;
    const col = new T.Color();
    list.forEach((r, i) => {
      const L0 = X(-600), L1 = X(-100);
      let brake = false;
      const ax = (px - r.x) * r.dir, az = Math.abs(pz - r.z);
      if (ax > 0 && ax < 8 && az < 2) brake = true;
      r.v += Math.max(-8 * dt, Math.min(2 * dt, (brake ? 0 : r.vmax) - r.v));
      r.x += r.dir * r.v * dt;
      if (r.x > L1) r.x = L0; else if (r.x < L0) r.x = L1;
      _o.rotation.set(0, r.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0); _o.scale.set(1.3, 0.8, 2.2);
      _o.position.set(r.x, 0.9, r.z); _o.updateMatrix(); a.setMatrixAt(i, _o.matrix);
      if (modernNow) { // a cycle rickshaw: a coloured canopy over the seat, a bicycle in front
        _o.scale.set(1.5, 0.15, 1.6); _o.position.set(r.x - r.dir * 0.2, 2.1, r.z); _o.updateMatrix(); b.setMatrixAt(i, _o.matrix);
        _o.scale.set(0.15, 0.9, 1.0); _o.position.set(r.x + r.dir * 1.6, 0.8, r.z); _o.updateMatrix(); c.setMatrixAt(i, _o.matrix);
        col.setHex(RIDE_COLORS[r.ci % RIDE_COLORS.length]); a.setColorAt(i, col); b.setColorAt(i, col);
      } else { // a bullock cart: a wooden bed on big wheels, and the ox pulling it
        _o.scale.set(0.9, 0.7, 1.6); _o.position.set(r.x + r.dir * 2.6, 0.9, r.z); _o.updateMatrix(); b.setMatrixAt(i, _o.matrix);
        _o.scale.set(0.15, 1.6, 1.6); _o.position.set(r.x, 0.8, r.z + 0.75); _o.updateMatrix(); c.setMatrixAt(i, _o.matrix);
        col.setHex(0x6b4a2b); a.setColorAt(i, col); col.setHex(0xe8e0d0); b.setColorAt(i, col);
      }
    });
    a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = c.instanceMatrix.needsUpdate = true;
    a.instanceColor.needsUpdate = b.instanceColor.needsUpdate = true;
  }

  const jumbos = [];
  function buildElephants() {
    for (let i = 0; i < 2; i++) {
      const dir = i ? -1 : 1, g = elephant(mughal, 0, 0, 0);
      jumbos.push({ g, x: X(-520 + i * 220), z: dir * 4.5, dir, t: 0 });
    }
  }
  function updateElephants(dt, px, pz) {
    for (const e of jumbos) {
      const ahead = (px - e.x) * e.dir, near = ahead > 0 && ahead < 9 && Math.abs(pz - e.z) < 3;
      if (!near) e.x += e.dir * 1.4 * dt;
      if (e.x > X(-100)) e.x = X(-600); else if (e.x < X(-600)) e.x = X(-100);
      e.t += dt * (near ? 0 : 1);
      e.g.position.set(e.x, Math.abs(Math.sin(e.t * 2.4)) * 0.05, e.z);
      e.g.rotation.y = e.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  }

  // ---------- public ----------

  function build(sc) {
    if (built) return;
    built = true; root = new T.Group(); sc.add(root); scene = root;
    scene.add(mughal, modernG);
    buildGround();
    buildFortWallsProper();
    buildLahoriGate();
    buildChhattaChowk();
    buildDiwanAam();
    buildPalaces();
    buildFortGardens();
    buildChandniChowk();
    buildTown();
    buildJamaMasjid();
    buildFatehpuri();
    buildModernBits();
    buildVenues();
    buildNewDelhi();
    buildPeople();
    buildRides();
    buildElephants();
    elephant(scene, X(141), 262, Math.PI); elephant(scene, X(159), 262, Math.PI); // the stone elephants at the Delhi Gate
    setEra(false);
    if (typeof Weather !== "undefined") Weather.refreshFoliage(); // Delhi's trees and lawns take the colour of the season
  }

  function setEra(modern) {
    modernNow = modern;
    mughal.visible = !modern; modernG.visible = modern;
    for (const p of palettes) {
      const pal = modern ? p.modern : p.mughal;
      p.list.forEach((b, i) => p.mesh.setColorAt(i, pal[b[p.key]]));
      p.mesh.instanceColor.needsUpdate = true;
    }
    if (DELHI_MATS.roofs) DELHI_MATS.roofs.material.color.setHex(modern ? 0x5a5e5e : 0xa0452c);
    if (DELHI_MATS.body) {
      DELHI_MATS.body.material.map = modern ? windowTexD() : null;
      DELHI_MATS.body.material.needsUpdate = true;
    }
    if (people.body) {
      people.list.forEach((c, i) => { people.body.setColorAt(i, (modern ? WEAR_MODERN : WEAR_MUGHAL)[c.ci]); people.hat.setColorAt(i, TURBAN[c.ti]); });
      people.body.instanceColor.needsUpdate = people.hat.instanceColor.needsUpdate = true;
    }
  }

  let winTex = null;
  function windowTexD() {
    if (!winTex) winTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
      g.fillStyle = "rgba(40,60,80,.55)";
      for (let y = 6; y < h; y += 16) for (let x = 6; x < w; x += 16) g.fillRect(x, y, 8, 9);
    }, 3, 2);
    return winTex;
  }

  function update(dt, px, pz) {
    if (!built) return;
    clock += dt;
    if (Math.abs(px - DX) > 800) return; // too far away to matter
    updatePeople(dt);
    updateRides(dt, px, pz);
    if (!modernNow) updateElephants(dt, px, pz);
  }

  // Something moving that is touching you, if any: { v, rx, rz, side, what } (side: which way it throws you), like the cars in Rome.
  function hits(px, pz) {
    if (!built || Math.abs(px - DX) > 800) return null;
    for (const r of rides.list) {
      if (r.v < 0.5 || Math.abs(px - r.x) > 2.4 || Math.abs(pz - r.z) > 1.3) continue;
      return { v: r.v + 1.5, rx: 0, rz: r.dir, side: pz - r.z >= 0 ? 1 : -1, what: modernNow ? "a cycle rickshaw" : "a bullock cart" };
    }
    if (!modernNow) for (const e of jumbos) {
      if (Math.abs(px - e.x) > 3.6 || Math.abs(pz - e.z) > 2) continue;
      return { v: 4.5, rx: 0, rz: e.dir, side: pz - e.z >= 0 ? 1 : -1, what: "an elephant" };
    }
    return null;
  }

  // the haveli's bedroom, for sleeping
  const homeInside = (x, z) => { const r = ROOMS[houseTier]; return Math.abs(x - X(r.x)) < r.hw && Math.abs(z - r.z) < r.hd; };
  const inPlot = (x, z) => x > X(PLOT.x0) && x < X(PLOT.x1) && z > PLOT.z0 && z < PLOT.z1;
  const homeSpot = () => ({ x: X(-100), z: -22 });

  const show = (v) => { if (root) root.visible = v; };

  return { build, show, setEra, setTier, get tier() { return houseTier; }, update, hits, homeInside, inPlot, homeSpot, venueAt, VENUES, cannonShow: (v) => { if (cannonG) cannonG.visible = v; }, BOUNDS: BOUNDS_D, MAP: MAP_D, SPAWN, get built() { return built; }, people: () => people.list, debug: () => ({ people: people.list, rides: rides.list, jumbos }) };
})();
