"use strict";
// Old Delhi (Shahjahanabad): the Red Fort, Chandni Chowk and the Jama Masjid, in Shah Jahan's day (c. 1650) or as the
// city stands today. Built the first time you travel there, far to the east of Rome in the same world. Coordinates in
// this file are metres around the Lahori Gate (x east, z south); world x is DX + x. Depends on world.js (frame, lambert,
// canvasTex), physics.js and delhi-data.js. Not to scale between districts.

const Delhi = (() => {
  const DX = DELHI_X;
  const BOUNDS_D = { minX: DX - 705, maxX: DX + 315, minZ: -335, maxZ: 385 };
  const MAP_D = { x0: DX - 720, x1: DX + 440, z0: -345, z1: 395 };
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
    if (o.walk) addPlatformBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0 + h);
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
  function archWallGeo(w, h, thick, ow, oh) {
    const s = new T.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
    s.holes.push(archShape(ow, oh));
    const g = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -thick / 2);
    return g;
  }

  // A gate with a pointed archway. `alongZ`: the wall runs north-south and you walk through it east-west.
  function gate(parent, cx, cz, alongZ, w, h, thick, ow, oh, m, y0 = 0) {
    const mesh = new T.Mesh(archWallGeo(w, h, thick, ow, oh), m);
    mesh.position.set(cx, y0, cz);
    if (alongZ) mesh.rotation.y = Math.PI / 2;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    const hw = (w - ow) / 2;
    if (alongZ) {
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz - w / 2, cz - ow / 2, y0, y0 + h);
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz + ow / 2, cz + w / 2, y0, y0 + h);
      addBlockerBox(cx - thick / 2, cx + thick / 2, cz - ow / 2, cz + ow / 2, y0 + oh, y0 + h);
    } else {
      addBlockerBox(cx - w / 2, cx - ow / 2, cz - thick / 2, cz + thick / 2, y0, y0 + h);
      addBlockerBox(cx + ow / 2, cx + w / 2, cz - thick / 2, cz + thick / 2, y0, y0 + h);
      addBlockerBox(cx - ow / 2, cx + ow / 2, cz - thick / 2, cz + thick / 2, y0 + oh, y0 + h);
    }
    return mesh;
  }

  // Steps rising to `top` along one side of a platform. dir: +x, -x, +z or -z is the way you climb up (towards the platform).
  function steps(x0, z0, dir, width, n, rise, tread) {
    for (let k = 1; k <= n; k++) {
      const run = (n - k + 1) * tread, top = k * rise;
      let a, b, c, d;
      if (dir === "-x") { a = x0 - run; b = x0; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "+x") { a = x0; b = x0 + run; c = z0 - width / 2; d = z0 + width / 2; }
      else if (dir === "-z") { a = x0 - width / 2; b = x0 + width / 2; c = z0 - run; d = z0; }
      else { a = x0 - width / 2; b = x0 + width / 2; c = z0; d = z0 + run; }
      addPlatformBox(a, b, c, d, top);
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
    [-340, -132, 195, 352], [-159, -141, 18, 352], [-292, -188, -112, -18], [-136, -64, -96, -18],
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
    const spots = [];
    for (let x = -590; x < -100; x += 28) for (const s of [-1, 1]) spots.push([x + (rnd() - 0.5) * 6, s * 15.2]);
    const tr = new T.InstancedMesh(trunk, lambert(0x5a4630), spots.length), cr = new T.InstancedMesh(crown, lambert(0x4a7a36), spots.length), o = new T.Object3D();
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

    // your haveli: a courtyard house with a gate to the street, a fountain and a bedroom
    const hx = -100, hz0 = -90, hz1 = -18;
    mbox(scene, X(hx - 17), 0, (hz0 + hz1) / 2, 2, 7.5, hz1 - hz0, D.cream, { solid: true, map: "#d8c79a" });
    mbox(scene, X(hx + 33), 0, (hz0 + hz1) / 2, 2, 7.5, hz1 - hz0, D.cream, { solid: true });
    mbox(scene, X(hx + 8), 0, hz0 + 1, 52, 7.5, 2, D.cream, { solid: true });
    mbox(scene, X(hx - 10), 0, hz1 - 1, 14, 7.5, 2, D.cream, { solid: true }); mbox(scene, X(hx + 22), 0, hz1 - 1, 22, 7.5, 2, D.cream, { solid: true });
    mbox(scene, X(-96), 5.5, hz1 - 1, 14, 2.5, 2, D.cream, { solid: false });
    mbox(scene, X(hx + 8), 0.04, (hz0 + hz1) / 2, 48, 0.06, 68, lambert(0xc9b58a), { cast: false });
    mcyl(scene, X(hx + 8), 0, -54, 3.2, 0.7, D.marble, { solid: true }); mcyl(scene, X(hx + 8), 0.6, -54, 2.6, 0.1, D.water);
    // the bedroom: walls on three sides and a roof, open to the courtyard
    const bx = hx - 8, bz = -82;
    mbox(scene, X(bx - 6), 0, bz, 1, 6, 12, D.cream, { solid: true }); mbox(scene, X(bx), 0, bz - 6, 12, 6, 1, D.cream, { solid: true }); mbox(scene, X(bx), 0, bz + 6, 12, 6, 1, D.cream, { solid: true });
    mbox(scene, X(bx), 6, bz, 13, 0.5, 13, D.redDark);
    mbox(scene, X(bx - 3), 0, bz - 2, 2.4, 0.8, 5, lambert(0x9a2f2f)); mbox(scene, X(bx - 3), 0.8, bz - 2, 2.4, 0.3, 5, D.white);
    mbox(scene, X(bx + 3), 0, bz - 4, 1.4, 0.9, 1.4, D.wood);
    MAP_SHAPES.push({ k: "r", x0: X(-118), x1: X(-67), z0: -90, z1: -18, c: "#e0cfa4" });
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
    const hubs = [[-300, 0, 160, 14], [-100, 0, 40, 40], [100, 0, 60, 90], [-230, 270, 40, 40], [-640, 0, 40, 30], [200, -200, 50, 40]];
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
    buildPeople();
    buildRides();
    buildElephants();
    elephant(scene, X(141), 262, Math.PI); elephant(scene, X(159), 262, Math.PI); // the stone elephants at the Delhi Gate
    setEra(false);
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
  const homeInside = (x, z) => Math.abs(x - X(-108)) < 5.6 && Math.abs(z + 82) < 5.6;
  const homeSpot = () => ({ x: X(-100), z: -60 });

  const show = (v) => { if (root) root.visible = v; };

  return { build, show, setEra, update, hits, homeInside, homeSpot, BOUNDS: BOUNDS_D, MAP: MAP_D, SPAWN, get built() { return built; }, people: () => people.list, debug: () => ({ people: people.list, rides: rides.list, jumbos }) };
})();
