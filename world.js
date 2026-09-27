"use strict";
// Builds the landmarks. Depends on THREE and physics.js.

const T = THREE;
let worldScene; // set by buildLandmarks

// ---------- textures & materials ----------

function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, base, amount, n, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * amount})`;
    g.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

const lambert = (color, o = {}) => new T.MeshLambertMaterial({ color, ...o });
const stoneTex = (base) => canvasTex(128, 128, (g, w, h) => speckle(g, w, h, base, 0.12, 900));

const M = {
  marble: lambert(0xf1ebdd, { map: stoneTex("#ffffff") }),
  marble2: lambert(0xd9d0bc, { map: stoneTex("#ffffff") }),
  travertine: lambert(0xd9c8a0, { map: stoneTex("#ffffff") }),
  brick: lambert(0xb0623f, { map: stoneTex("#ffffff") }),
  roof: lambert(0xa24d2f),
  gold: lambert(0xdcb444, { emissive: 0x3d2f05 }),
  bronze: lambert(0x9a6a2c),
  granite: lambert(0x8e8e8a),
  dark: lambert(0x241d16),
  water: lambert(0x4f91b8, { emissive: 0x0b2534 }),
  lead: lambert(0x8d8b84),
  sand: lambert(0xd9c793),
};

const BOX = new T.BoxGeometry(1, 1, 1);
const CYL = new T.CylinderGeometry(1, 1, 1, 16);

function shadowed(m, cast = true) { m.castShadow = cast; m.receiveShadow = true; return m; }

// ---------- building frame ----------
// A frame places local coordinates (front of the building = local +z) into the world at a
// 90° rotation, and registers collision volumes in world space.

function frame(x, z, rot = 0, y = heightAt(x, z)) {
  const g = new T.Group();
  g.position.set(x, y, z);
  g.rotation.y = (rot * Math.PI) / 2;
  worldScene.add(g);
  const odd = rot & 1;

  const toW = (lx, lz) => {
    switch (rot & 3) {
      case 0: return [x + lx, z + lz];
      case 1: return [x + lz, z - lx];
      case 2: return [x - lx, z - lz];
      default: return [x - lz, z + lx];
    }
  };
  const aabb = (lx, lz, w, d) => {
    const [cx, cz] = toW(lx, lz);
    const ww = odd ? d : w, dd = odd ? w : d;
    return { x0: cx - ww / 2, x1: cx + ww / 2, z0: cz - dd / 2, z1: cz + dd / 2 };
  };

  const F = {
    group: g, y, toW,
    add(mesh) { g.add(mesh); return mesh; },

    box(lx, ly, lz, w, h, d, mat, o = {}) {
      const m = shadowed(new T.Mesh(BOX, mat), o.cast !== false);
      m.scale.set(w, h, d);
      m.position.set(lx, ly + h / 2, lz);
      g.add(m);
      if (o.solid || o.walk || o.map) {
        const a = aabb(lx, lz, w, d);
        if (o.solid) addBlockerBox(a.x0, a.x1, a.z0, a.z1, y + ly, y + ly + h);
        if (o.walk) addPlatformBox(a.x0, a.x1, a.z0, a.z1, y + ly + h);
        if (o.map) MAP_SHAPES.push({ k: "r", ...a, c: o.map });
      }
      return m;
    },

    cyl(lx, ly, lz, r, h, mat, o = {}) {
      const m = shadowed(new T.Mesh(CYL, mat));
      m.scale.set(r, h, r);
      m.position.set(lx, ly + h / 2, lz);
      g.add(m);
      const [cx, cz] = toW(lx, lz);
      if (o.solid) addBlockerCircle(cx, cz, r, y + ly, y + ly + h);
      if (o.walk) addPlatformCircle(cx, cz, r, y + ly + h);
      if (o.map) MAP_SHAPES.push({ k: "e", cx, cz, ax: r, az: r, c: o.map });
      return m;
    },

    column(lx, lz, r, h, ly = 0, mat = M.marble) {
      const geo = new T.CylinderGeometry(r * 0.88, r, h, 14);
      const m = shadowed(new T.Mesh(geo, mat));
      m.position.set(lx, ly + h / 2, lz);
      g.add(m);
      const cap = shadowed(new T.Mesh(BOX, mat));
      cap.scale.set(r * 2.6, r * 0.55, r * 2.6);
      cap.position.set(lx, ly + h + r * 0.27, lz);
      g.add(cap);
      const base = shadowed(new T.Mesh(BOX, mat));
      base.scale.set(r * 2.4, r * 0.4, r * 2.4);
      base.position.set(lx, ly + r * 0.2, lz);
      g.add(base);
      const [cx, cz] = toW(lx, lz);
      addBlockerCircle(cx, cz, r, y + ly, y + ly + h);
      return m;
    },

    // Steps rising away from the podium face at local z = lz, going toward +z.
    stairs(lx, lz, w, n, rise, tread, mat = M.marble2) {
      for (let k = 1; k <= n; k++) {
        const run = (n - k + 1) * tread;
        F.box(lx, 0, lz + run / 2, w, k * rise, run, mat, { walk: true });
      }
    },

    // Triangular prism roof / pediment, gable along local x, running `len` along z.
    gable(lx, ly, lz, w, h, len, mat) {
      const s = new T.Shape();
      s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath();
      const geo = new T.ExtrudeGeometry(s, { depth: len, bevelEnabled: false });
      geo.translate(0, 0, -len / 2);
      const m = shadowed(new T.Mesh(geo, mat));
      m.position.set(lx, ly, lz);
      g.add(m);
      return m;
    },
  };
  return F;
}

// ---------- generic pieces ----------

function statue(x, z, s = 1, y = heightAt(x, z)) {
  const F = frame(x, z, 0, y);
  F.box(0, 0, 0, 1.6 * s, 2.2 * s, 1.6 * s, M.marble2, { solid: true });
  F.cyl(0, 2.2 * s, 0, 0.45 * s, 1.5 * s, M.bronze);
  const head = shadowed(new T.Mesh(new T.SphereGeometry(0.3 * s, 10, 8), M.bronze));
  head.position.set(0, 3.9 * s, 0);
  F.add(head);
}

function temple(x, z, rot, o) {
  const { w, d, podH = 4, colH = 12, cols = 6, roof = M.roof, y } = o;
  const F = frame(x, z, rot, y);
  F.box(0, 0, 0, w, podH, d, M.travertine, { walk: true, map: "#c9b98f" });
  const n = Math.max(2, Math.round(podH / 0.5));
  F.stairs(0, d / 2, Math.min(w, cols * 5 + 2), n, podH / n, 0.75);

  const fz = d / 2 - 1.6, bz = -d / 2 + 1.6, span = w - 3.2;
  for (let i = 0; i < cols; i++) {
    const lx = -w / 2 + 1.6 + (i * span) / (cols - 1);
    F.column(lx, fz, 0.9, colH, podH);
    F.column(lx, bz, 0.9, colH, podH);
  }
  const sides = Math.max(2, Math.round((d - 3.2) / 6));
  for (let j = 1; j < sides; j++) {
    const lz = fz - (j * (fz - bz)) / sides;
    F.column(-w / 2 + 1.6, lz, 0.9, colH, podH);
    F.column(w / 2 - 1.6, lz, 0.9, colH, podH);
  }
  const cellaD = d - 13;
  F.box(0, podH, bz + 1.6 + cellaD / 2, w - 7, colH + 0.6, cellaD, M.marble, { solid: true });
  F.box(0, podH, bz + 1.6 + cellaD + 0.05, 3.4, 6.8, 0.2, M.dark);
  F.box(0, podH + colH, 0, w - 0.4, 1.6, d - 0.4, M.marble2);
  const gh = w * 0.15;
  F.gable(0, podH + colH + 1.6, 0, w - 0.4, gh, d - 0.4, roof);
  F.gable(0, podH + colH + 1.6, (d - 0.4) / 2, w - 0.4, gh, 0.5, M.marble);
  return F;
}

// A large public building with a colonnade along its front (local +z).
function arcadeBuilding(x, z, rot, w, d, h, mat, wallMap = "#b9a27a") {
  const F = frame(x, z, rot);
  F.box(0, 0, 0, w, h, d, mat, { solid: true, map: wallMap });
  const n = Math.floor(w / 6);
  for (let i = 0; i < n; i++) F.column(-w / 2 + 3 + (i * (w - 6)) / (n - 1), d / 2 + 2.4, 0.7, h * 0.72, 0);
  F.box(0, h * 0.72, d / 2 + 2.4, w, 1.2, 5, M.marble2);
  F.box(0, h, 0, w + 1, 1.2, d + 1, M.marble2);
  F.box(0, h + 1.2, 0, w - 2, 2.2, d - 2, M.roof);
  return F;
}

function planeAt(x, z, w, d, tex, y = 0.05) {
  const m = new T.Mesh(new T.PlaneGeometry(w, d), new T.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  worldScene.add(m);
  return m;
}

const pavingTex = (base, line, tile, rx, ry) =>
  canvasTex(128, 128, (g, w, h) => {
    speckle(g, w, h, base, 0.15, 1200);
    g.strokeStyle = line; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += tile) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke();
    }
  }, rx, ry);

// ---------- Forum ----------

function buildForum() {
  planeAt(30, 0, 300, 70, pavingTex("#bfb49b", "rgba(90,70,40,.35)", 32, 40, 9));
  planeAt(160, 0, 520, 9, pavingTex("#4a4540", "rgba(0,0,0,.4)", 42, 60, 1), 0.07); // Via Sacra (to the Colosseum)

  // Temple of Saturn (south-facing, west end of the Forum)
  temple(-105, -52, 0, { w: 22, d: 36, podH: 4.5, colH: 11, cols: 6 });

  // Curia Julia (Senate House)
  const curia = frame(-10, -52, 0);
  curia.box(0, 0, 0, 26, 21, 34, M.brick, { solid: true, map: "#a9603f" });
  curia.box(0, 0, 17.05, 5, 8, 0.2, M.dark);
  curia.box(0, 21, 0, 27.5, 1.4, 35.5, M.marble2);
  curia.gable(0, 22.4, 0, 27, 4, 35, M.roof);

  // Basilicas either side of the plaza
  arcadeBuilding(-40, 55, 2, 100, 30, 16, M.travertine);
  arcadeBuilding(70, -50, 0, 80, 25, 15, M.travertine);

  // Temple of Castor and Pollux
  temple(30, 56, 2, { w: 20, d: 32, podH: 6.5, colH: 13, cols: 6 });

  // Rostra
  const rostra = frame(-72, -16, 0);
  rostra.box(0, 0, 0, 24, 3.2, 12, M.travertine, { walk: true, map: "#c9b98f" });
  rostra.stairs(0, 6, 8, 5, 0.64, 0.8);
  for (let i = 0; i < 5; i++) {
    const cone = shadowed(new T.Mesh(new T.ConeGeometry(0.4, 2.4, 8), M.bronze));
    cone.rotation.x = Math.PI / 2;
    cone.position.set(-8 + i * 4, 2.4, 7.4);
    rostra.add(cone);
  }

  // Temple of Vesta (round)
  const vesta = frame(78, 52, 0);
  vesta.cyl(0, 0, 0, 9.8, 0.6, M.travertine, { walk: true });
  vesta.cyl(0, 0, 0, 8.8, 1.2, M.marble2, { walk: true });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    vesta.column(Math.sin(a) * 7.3, Math.cos(a) * 7.3, 0.5, 6.2, 1.2);
  }
  vesta.cyl(0, 1.2, 0, 5.4, 7, M.marble, { solid: true, map: "#efe8d8" });
  const cone = shadowed(new T.Mesh(new T.ConeGeometry(8.4, 3.4, 24), M.roof));
  cone.position.set(0, 1.2 + 7.6 + 1.7, 0);
  vesta.add(cone);

  // Golden Milestone
  const ms = frame(-58, 6, 0);
  ms.box(0, 0, 0, 2.2, 0.8, 2.2, M.marble2);
  ms.cyl(0, 0.8, 0, 0.55, 4.6, M.gold, { solid: true });

  // Statues and honorary columns along the Via Sacra
  [[-90, 26], [-20, 27], [10, -26], [45, 28], [100, -27], [120, 26], [140, -26], [-30, -25], [55, -24]].forEach(([sx, sz]) => statue(sx, sz, 1));
  for (const cx of [15, 90]) {
    const col = frame(cx, 4, 0);
    col.box(0, 0, 0, 3.6, 2.2, 3.6, M.marble2, { solid: true });
    col.cyl(0, 2.2, 0, 1, 12, M.marble);
    col.cyl(0, 14.2, 0, 1.3, 0.6, M.marble2);
  }
}

// ---------- Arch of Titus ----------

function buildArch() {
  const F = frame(200, 0, 1); // the passage runs along world x
  F.box(-5, 0, 0, 4, 11, 13, M.marble, { solid: true, map: "#efe8d8" });
  F.box(5, 0, 0, 4, 11, 13, M.marble, { solid: true, map: "#efe8d8" });
  F.box(0, 11, 0, 14.5, 5.2, 13.6, M.marble);
  F.box(0, 16.2, 0, 15.6, 0.8, 14.6, M.marble2);
  F.box(0, 12.6, 6.85, 8, 2.2, 0.2, M.gold);
  F.box(0, 11, 0, 6, 0.4, 13.2, M.marble2);
  for (const lx of [-5, 5]) F.cyl(lx, 0, 6.9, 0.7, 9.5, M.marble2);
}

// ---------- Capitoline temple ----------

function buildCapitolium() {
  temple(-235, -50, 0, { w: 60, d: 54, podH: 5, colH: 17, cols: 8, y: heightAt(-235, -50) });
}

// ---------- Trajan's Forum & Column ----------

function spiralTex() {
  return canvasTex(64, 256, (g, w, h) => {
    speckle(g, w, h, "#ece5d5", 0.1, 500);
    g.strokeStyle = "#cfc4a8"; g.lineWidth = 34;
    g.beginPath(); g.moveTo(-w, h + 40); g.lineTo(2 * w, -40); g.stroke();
    g.strokeStyle = "rgba(90,70,40,.55)"; g.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      const t = Math.random(), px = t * w, py = h - t * h + (Math.random() - 0.5) * 10;
      g.strokeRect(px, py, 2, 5);
    }
  }, 1, 22);
}

function buildTrajan() {
  const pav = pavingTex("#bdb29a", "rgba(90,70,40,.3)", 32, 30, 22);
  planeAt(-150, -240, 120, 90, pav);
  planeAt(-150, -360, 130, 60, pav);

  for (const sx of [-208, -92]) { // colonnades along the plaza sides
    const F = frame(sx, -240, sx < -150 ? 1 : 3);
    F.box(0, 0, 0, 90, 14, 3, M.travertine, { solid: true });
    F.box(0, 11.5, 3.8, 90, 1.2, 7, M.marble2);
    F.box(0, 12.7, 3.8, 92, 1.8, 8, M.roof);
    for (let i = 0; i < 12; i++) F.column(-41 + i * 7.45, 6.5, 0.7, 11.5);
  }

  arcadeBuilding(-150, -312, 0, 120, 30, 24, M.marble2, "#cfc3a5"); // Basilica Ulpia
  for (const lx of [-196, -104]) {
    const lib = frame(lx, -362, 0);
    lib.box(0, 0, 0, 24, 15, 24, M.travertine, { solid: true, map: "#b9a27a" });
    lib.box(0, 15, 0, 25.5, 1.2, 25.5, M.marble2);
    lib.box(0, 16.2, 0, 22, 2.4, 22, M.roof);
  }

  const col = frame(-150, -362, 0);
  col.box(0, 0, 0, 6, 6, 6, M.marble, { solid: true, map: "#efe8d8" });
  const shaftMat = lambert(0xffffff, { map: spiralTex() });
  const shaft = shadowed(new T.Mesh(new T.CylinderGeometry(1.7, 1.95, 30, 20), shaftMat));
  shaft.position.set(0, 6 + 15, 0);
  col.add(shaft);
  col.cyl(0, 36, 0, 2.4, 0.9, M.marble2);
  col.cyl(0, 36.9, 0, 0.5, 1.6, M.bronze);
  const head = shadowed(new T.Mesh(new T.SphereGeometry(0.4, 10, 8), M.bronze));
  head.position.set(0, 39.1, 0);
  col.add(head);
  for (const [sx, sz] of [[-120, -230], [-180, -230], [-150, -250]]) statue(sx, sz, 1.1);
}

// ---------- Palatine palace ----------

function buildPalatine() {
  const y = 22;
  const P = frame(0, 0, 0, y);
  const wallH = 12, t = 2;
  const x0 = -15, x1 = 95, z0 = 220, z1 = 300;
  const gapL = 34, gapR = 46;
  const seg = (a, b, z) => P.box((a + b) / 2, 0, z, b - a, wallH, t, M.brick, { solid: true, map: "#a9603f" });
  seg(x0, gapL, z0); seg(gapR, x1, z0);
  seg(x0, gapL, z1); seg(gapR, x1, z1);
  P.box(x0, 0, (z0 + z1) / 2, t, wallH, z1 - z0, M.brick, { solid: true, map: "#a9603f" });
  P.box(x1, 0, (z0 + z1) / 2, t, wallH, z1 - z0, M.brick, { solid: true, map: "#a9603f" });

  // Peristyle courtyard
  const cx = 40, cz = 260, hw = 30, hd = 17;
  for (let i = 0; i <= 12; i++) {
    const lx = cx - hw + (i * 2 * hw) / 12;
    P.column(lx, cz - hd, 0.55, 8); P.column(lx, cz + hd, 0.55, 8);
  }
  for (let j = 1; j < 7; j++) {
    const lz = cz - hd + (j * 2 * hd) / 7;
    P.column(cx - hw, lz, 0.55, 8); P.column(cx + hw, lz, 0.55, 8);
  }
  P.box(cx, 8.4, cz - hd, 2 * hw + 2, 1, 2, M.marble2);
  P.box(cx, 8.4, cz + hd, 2 * hw + 2, 1, 2, M.marble2);
  P.box(cx - hw, 8.4, cz, 2, 1, 2 * hd + 2, M.marble2);
  P.box(cx + hw, 8.4, cz, 2, 1, 2 * hd + 2, M.marble2);
  P.cyl(cx, 0, cz, 4.2, 0.7, M.travertine, { solid: true });
  P.cyl(cx, 0.6, cz, 3.6, 0.15, M.water);

  // Halls
  for (const hx of [-3, 78]) {
    P.box(hx, 0, 260, 22, 11, 60, M.travertine, { solid: true, map: "#c9b98f" });
    P.box(hx, 11, 260, 23, 3, 61, M.roof);
  }
}

// ---------- Colosseum ----------

function arcadeWallTex() {
  return canvasTex(128, 768, (g, w, h) => {
    speckle(g, w, h, "#d6c49a", 0.14, 1400);
    const atticH = h * 0.14;
    g.fillStyle = "#c4ae82"; g.fillRect(0, 0, w, atticH);
    g.fillStyle = "#2b241a";
    g.fillRect(w * 0.42, atticH * 0.3, w * 0.16, atticH * 0.4);
    const storyH = (h - atticH) / 3;
    for (let s = 0; s < 3; s++) {
      const top = atticH + s * storyH;
      const rad = w * 0.28;
      g.fillStyle = "#2b241a";
      g.beginPath();
      g.moveTo(w * 0.22, top + storyH * 0.95);
      g.lineTo(w * 0.22, top + storyH * 0.18 + rad);
      g.arc(w * 0.5, top + storyH * 0.18 + rad, rad, Math.PI, 0);
      g.lineTo(w * 0.78, top + storyH * 0.95);
      g.fill();
      g.fillStyle = "rgba(255,245,220,.35)";
      g.fillRect(0, top + storyH * 0.96, w, storyH * 0.04);
      g.fillStyle = "rgba(90,70,40,.25)";
      g.fillRect(0, top, w * 0.05, storyH);
      g.fillRect(w * 0.95, top, w * 0.05, storyH);
    }
  }, 36, 1);
}

function seatingTex() {
  return canvasTex(64, 64, (g, w, h) => speckle(g, w, h, "#d1bd94", 0.18, 400));
}

function buildColosseum() {
  const cx = 430, cz = 30, ax = 94, az = 78, sx = ax / az;
  const gap = 0.06, arc = Math.PI - 2 * gap;
  const g = new T.Group();
  g.position.set(cx, 0, cz);
  worldScene.add(g);

  const wallMat = new T.MeshLambertMaterial({ map: arcadeWallTex(), side: T.DoubleSide });
  const seatMat = new T.MeshStandardMaterial({ color: 0xd8c59b, roughness: 1, flatShading: true, side: T.DoubleSide, map: seatingTex() });

  // Outer wall, split so the two gates (east and west) stay open.
  for (const start of [Math.PI / 2 + gap, -Math.PI / 2 + gap]) {
    const wall = shadowed(new T.Mesh(new T.CylinderGeometry(az, az, 48, 72, 1, true, start, arc), wallMat));
    wall.scale.x = sx;
    wall.position.y = 24;
    g.add(wall);
  }

  // Tiered seating (lathe profile, stepped)
  const rows = 20, rise = 0.7, r0 = 26, r1 = 77, tread = (r1 - r0) / rows;
  const profile = [new T.Vector2(r0, 0)];
  for (let k = 1; k <= rows; k++) {
    profile.push(new T.Vector2(r0 + (k - 1) * tread, k * rise));
    profile.push(new T.Vector2(r0 + k * tread, k * rise));
  }
  profile.push(new T.Vector2(r1, 0));
  for (const start of [Math.PI / 2 + gap, -Math.PI / 2 + gap]) {
    const seats = shadowed(new T.Mesh(new T.LatheGeometry(profile, 72, start, arc), seatMat));
    seats.scale.x = sx;
    g.add(seats);
  }

  // Arena floor
  const arena = new T.Mesh(new T.CircleGeometry(r0, 48), new T.MeshLambertMaterial({ map: canvasTex(64, 64, (c, w, h) => speckle(c, w, h, "#d9c48e", 0.2, 500)) }));
  arena.rotation.x = -Math.PI / 2;
  arena.scale.set(sx, 1, 1);
  arena.position.y = 0.05;
  arena.receiveShadow = true;
  g.add(arena);

  // Collision: seating rows are walkable steps, the wall is solid, gates are open.
  for (let k = 1; k <= rows; k++) {
    addPlatformRing({ cx, cz, ax, az, u0: (r0 + (k - 1) * tread) / az, u1: (r0 + k * tread) / az, gap: 2.8, axis: "x", side: 0, top: k * rise });
  }
  addBlockerRing({ cx, cz, ax, az, u0: r1 / az, u1: 1.0, gap: 2.8, axis: "x", side: 0, y0: 0, y1: 48 });
  MAP_SHAPES.push({ k: "e", cx, cz, ax, az, c: "#c9b58c" });
}

// ---------- Circus Maximus ----------

function buildCircus() {
  const cx = -230, zA = 120, zB = 740, w = 100, rows = 12, rise = 0.6, tread = 1.9;
  const len = zB - zA, midZ = (zA + zB) / 2;
  const F = frame(0, 0, 0, 0);
  const track = new T.Mesh(new T.PlaneGeometry(w, len), new T.MeshLambertMaterial({ map: canvasTex(64, 64, (g, ww, hh) => speckle(g, ww, hh, "#dbc998", 0.2, 500), 6, 60) }));
  track.rotation.x = -Math.PI / 2;
  track.position.set(cx, 0.05, midZ);
  track.receiveShadow = true;
  worldScene.add(track);
  MAP_SHAPES.push({ k: "r", x0: cx - w / 2, x1: cx + w / 2, z0: zA, z1: zB, c: "#dfcd9d" });

  const gaps = [[300, 312], [560, 572]];
  const segs = [[zA, gaps[0][0]], [gaps[0][1], gaps[1][0]], [gaps[1][1], zB]];
  for (const side of [-1, 1]) {
    for (const [a, b] of segs) {
      for (let k = 1; k <= rows; k++) {
        const off = w / 2 + (k - 1) * tread + tread / 2;
        F.box(cx + side * off, 0, (a + b) / 2, tread, k * rise, b - a, M.travertine, { walk: true });
      }
      MAP_SHAPES.push({ k: "r", x0: cx + side * (w / 2) - (side < 0 ? rows * tread : 0), x1: cx + side * (w / 2) + (side > 0 ? rows * tread : 0), z0: a, z1: b, c: "#b9a27a" });
    }
  }
  for (let k = 1; k <= rows; k++) { // curved end approximated as a straight bank
    const off = (k - 1) * tread + tread / 2;
    F.box(cx, 0, zB + off, w + 2 * rows * tread, k * rise, tread, M.travertine, { walk: true });
  }
  // starting gates
  F.box(cx, 0, zA - 5, w + 2, 9, 8, M.brick, { solid: true, map: "#a9603f" });
  for (let i = 0; i < 12; i++) F.box(cx - w / 2 + 6 + i * ((w - 12) / 11), 0, zA - 0.9, 4.4, 5.5, 0.3, M.dark);

// Walls, so running into the Circus hurts: a low podium wall between the track and the seats (with two stair
// entrances per side so you can still climb up), and a tall wall behind the stands. The wide gaps stay open as
// the entrances onto the track.
const stairGaps = [[396, 406], [654, 664]];
const back = rows * tread + 1.2;
const cut = (z0, z1, holes) => { // split [z0, z1] around the holes
  const out = []; let a = z0;
  for (const [g0, g1] of [...holes].sort((p, q) => p[0] - q[0])) { if (g0 > a) out.push([a, g0]); a = g1; }
  if (z1 > a) out.push([a, z1]);
  return out;
};
for (const side of [-1, 1]) {
  for (const [a, b] of cut(zA, zB, [...gaps, ...stairGaps])) F.box(cx + side * (w / 2 + 0.3), 0, (a + b) / 2, 0.6, 3.2, b - a, M.marble2, { solid: true });
  for (const [a, b] of cut(zA, zB + back + 0.5, gaps)) F.box(cx + side * (w / 2 + back), 0, (a + b) / 2, 1, 11, b - a, M.travertine, { solid: true, map: "#c9b98f" });
}
F.box(cx, 0, zB + 0.3, w + 1, 3.2, 0.6, M.marble2, { solid: true });                                // podium wall, south end
F.box(cx, 0, zB + back + 0.5, w + 2 * back + 1, 11, 1, M.travertine, { solid: true });               // wall behind the south stands

  // spina with obelisk and turning posts
  F.box(cx, 0, midZ, 3, 1.4, 340, M.marble2, { solid: true, map: "#d9d0bc" });
  const ob = F.box(cx, 1.4, midZ, 1.6, 22, 1.6, M.granite, { solid: true });
  ob.scale.set(1.6, 22, 1.6);
  const tip = shadowed(new T.Mesh(new T.ConeGeometry(1.1, 2.4, 4), M.gold));
  tip.position.set(cx, 1.4 + 22 + 1.2, midZ);
  tip.rotation.y = Math.PI / 4;
  F.add(tip);
  for (const dz of [-176, 176]) for (const dx of [-1.6, 0, 1.6]) F.cyl(cx + dx, 0, midZ + dz, 0.9, 5, M.gold);
}

// ---------- Pantheon ----------

function cofferTex() {
  return canvasTex(256, 128, (g, w, h) => {
    speckle(g, w, h, "#d9cdb2", 0.12, 800);
    g.strokeStyle = "rgba(70,55,35,.55)"; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = "rgba(70,55,35,.25)";
    for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) g.fillRect(x + 4, y + 4, 8, 8);
  }, 3, 1);
}

function floorTex() {
  return canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? "#cfc4ab" : "#8f7f66";
      g.fillRect(i * 32, j * 32, 32, 32);
    }
  }, 6, 6);
}

function buildPantheon() {
  const cx = -480, cz = -380;
  const F = frame(cx, cz, 2, 0); // portico faces north (-z)
  const R = 24, Ri = 21.7, drumH = 21.7, doorGap = 0.17, arc = Math.PI * 2 - 2 * doorGap;

  planeAt(cx, cz - 48, 100, 70, pavingTex("#bcb198", "rgba(90,70,40,.3)", 32, 28, 20));
  MAP_SHAPES.push({ k: "e", cx, cz, ax: R, az: R, c: "#b7a482" });
  MAP_SHAPES.push({ k: "r", x0: cx - 17, x1: cx + 17, z0: cz - 39, z1: cz - 20, c: "#e2d9c4" });

  const outer = shadowed(new T.Mesh(new T.CylinderGeometry(R, R, drumH, 64, 1, true, doorGap, arc), new T.MeshLambertMaterial({ map: stoneTex("#ffffff"), color: 0xb0623f })));
  outer.position.y = drumH / 2;
  F.add(outer);
  const inner = shadowed(new T.Mesh(new T.CylinderGeometry(Ri, Ri, drumH, 64, 1, true, doorGap, arc), new T.MeshLambertMaterial({ map: cofferTex(), color: 0xe6dcc4, side: T.BackSide })), false);
  inner.position.y = drumH / 2;
  F.add(inner);
  for (const s of [-1, 1]) F.box(s * 4.2, 0, (R + Ri) / 2, 0.6, drumH, R - Ri + 0.1, M.marble2);

  const oc = Math.asin(4.2 / Ri);
  const domeIn = new T.Mesh(new T.SphereGeometry(Ri, 64, 32, 0, Math.PI * 2, oc, Math.PI / 2 - oc), new T.MeshLambertMaterial({ map: cofferTex(), color: 0xf0e6cc, side: T.BackSide }));
  domeIn.position.y = drumH;
  F.add(domeIn);
  const oco = Math.asin(4.2 / R);
  const domeOut = shadowed(new T.Mesh(new T.SphereGeometry(R, 64, 32, 0, Math.PI * 2, oco, Math.PI / 2 - oco), M.lead));
  domeOut.position.y = drumH;
  F.add(domeOut);
  const rim = new T.Mesh(new T.TorusGeometry(4.3, 0.3, 8, 32), M.bronze);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = drumH + Ri - Math.cos(oc) * Ri + 0.1 + (R - Ri) * 0.0;
  rim.position.y = drumH + Ri * Math.cos(oc);
  F.add(rim);

  // Interior floor, light shaft and warm lamp
  const floor = new T.Mesh(new T.CircleGeometry(Ri, 48), new T.MeshLambertMaterial({ map: floorTex() }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  F.add(floor);
  const beam = new T.Mesh(new T.CylinderGeometry(4.2, 4.6, 40, 24, 1, true), new T.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.13, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
  beam.position.set(4, drumH + Ri * Math.cos(oc) - 20, 2);
  beam.rotation.z = -0.22;
  F.add(beam);
  const lamp = new T.PointLight(0xffe2b0, 0.9, 60, 1.5);
  lamp.position.set(0, 8, 0);
  F.add(lamp);

  // Portico: 16 granite columns
  const pz0 = 21, pz1 = 37, colH = 11.8;
  F.box(0, 0, (pz0 + pz1) / 2, 34, 0.6, pz1 - pz0 + 2, M.travertine, { walk: true });
  for (let i = 0; i < 8; i++) F.column(-14.9 + i * (29.8 / 7), pz1 - 1, 0.75, colH, 0.6, M.granite);
  for (const rz of [29, 24.5]) for (const lx of [-14.9, -10.6, 10.6, 14.9]) {
    if (rz === 24.5 && Math.abs(lx) > 12) continue;
    F.column(lx, rz, 0.75, colH, 0.6, M.granite);
  }
  F.box(0, colH + 0.6, (pz0 + pz1) / 2, 35, 1.6, pz1 - pz0 + 2, M.marble2);
  F.gable(0, colH + 2.2, (pz0 + pz1) / 2 + 0.6, 35, 5.2, pz1 - pz0 + 1.2, M.marble);

  // Collision
  addBlockerRing({ cx, cz, ax: R + 0.5, az: R + 0.5, u0: Ri / (R + 0.5), u1: 1.0, gap: 3.6, axis: "z", side: -1, y0: 0, y1: drumH });
}


// ---------- Colossus of the Sun ----------
// Nero's giant bronze statue, re-dedicated to Sol and moved beside the Colosseum by Hadrian c. 128 AD.

function buildColossus() {
  const F = frame(288, -36, 0); // stands north of the Via Sacra, facing south toward the road
  const gold = lambert(0xcf9f34, { emissive: 0x4a3608 });
  const bronze = lambert(0x9a6c2c, { emissive: 0x2a1c06 });
  const baseTop = 3.5;
  const add = (geo, mat, x, y, z) => { const m = shadowed(new T.Mesh(geo, mat)); m.position.set(x, y, z); F.add(m); return m; };

  // Stepped marble base
  F.box(0, 0, 0, 22, baseTop, 22, M.marble, { walk: true, map: "#d9d0bc" });
  F.stairs(0, 11, 12, 7, baseTop / 7, 0.8);

  // Legs, hips and torso
  for (const sx of [-2.2, 2.2]) {
    F.cyl(sx, baseTop, 0, 1.5, 13, bronze, { solid: true });
    F.box(sx, baseTop, 1.2, 2.4, 0.9, 4, M.marble2); // feet
  }
  F.box(0, baseTop + 13, 0, 7, 2.6, 3.6, bronze);
  const cloth = F.box(0, baseTop + 8, -1.9, 6.4, 9, 0.5, gold); // cloak hanging down the back
  cloth.rotation.x = 0.04;
  const torso = add(new T.CylinderGeometry(3.7, 3.0, 9, 14), bronze, 0, baseTop + 13 + 2.6 + 4.5, 0);
  torso.scale.z = 0.55;

  // Neck, head and radiate crown of the sun god
  const headY = baseTop + 13 + 2.6 + 9 + 2.2;
  add(new T.CylinderGeometry(0.9, 1.1, 1.6, 10), bronze, 0, headY - 1.5, 0);
  const head = add(new T.SphereGeometry(1.7, 14, 12), gold, 0, headY + 0.6, 0);
  head.scale.set(0.95, 1.15, 1);
  add(new T.TorusGeometry(1.6, 0.18, 6, 20), gold, 0, headY + 1.6, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) { // rays of the crown
    const a = -1.35 + (i / 6) * 2.7, len = 3.6;
    const ray = add(new T.ConeGeometry(0.28, len, 6), gold, Math.sin(a) * (1.7 + len / 2), headY + 1.7 + Math.cos(a) * (1.4 + len / 2), 0);
    ray.rotation.z = -a;
  }

  // Right arm raised, holding a spear
  const shoulderY = baseTop + 13 + 2.6 + 8;
  const rArm = add(new T.CylinderGeometry(0.85, 0.7, 7, 10), bronze, 5.6, shoulderY + 1.8, 0);
  rArm.rotation.z = -0.65;
  add(new T.CylinderGeometry(0.16, 0.16, 27, 6), bronze, 7.6, baseTop + 13 + 2.6 + 12.5, 0.2);
  add(new T.ConeGeometry(0.4, 1.6, 6), gold, 7.6, baseTop + 13 + 2.6 + 26.8, 0.2);

  // Left arm bent, holding a globe
  const lUp = add(new T.CylinderGeometry(0.85, 0.7, 5, 10), bronze, -4.3, shoulderY - 1.6, 0.4);
  lUp.rotation.z = 0.3;
  const lFore = add(new T.CylinderGeometry(0.7, 0.6, 4.5, 10), bronze, -4.4, shoulderY - 3.9, 2.4);
  lFore.rotation.x = Math.PI / 2.3;
  add(new T.SphereGeometry(1.5, 14, 10), gold, -4.4, shoulderY - 3.5, 4.9);

  // Foundation stones and a low wall around the plaza
  F.box(0, 0, 0, 0.1, 0.05, 0.1, M.marble2);
}


// ---------- Servian Wall ----------
// Rome's old city wall, 4th century BC. By Hadrian's time the city had sprawled far past it, so it now runs
// straight through the built-up city rather than around its edge. One long stretch survives here, with a gate
// (evoking the real Porta Collina, near the Quirinal) you can walk through, and stairs up either side of it so
// you can walk along the top.

function buildServianWall() {
  const F = frame(0, 0, 0, 0); // no rotation: local coordinates are world coordinates
  const T = 3.4, H = 9; // wall thickness and walkway height
  const zA = -465; // the long stretch runs east-west here, north of the Forum and Quirinal
  const xB = 420; // then turns south for a shorter stretch, east of the Trajan/Quirinal district
  const gate0 = 108, gate1 = 132; // the gate opening, flanked by two towers
  const stone = lambert(0x9c9482, { map: stoneTex("#ffffff") });

  const wallRun = (x0, x1, z0, z1, mat = stone) => {
    const horiz = z0 === z1;
    const w = horiz ? x1 - x0 : T, d = horiz ? T : z1 - z0;
    F.box((x0 + x1) / 2, 0, (z0 + z1) / 2, w, H, d, mat, { solid: true, walk: true, map: "#8d8570" });
  };
  const merlons = (x0, x1, z0, z1, horiz) => {
    const n = Math.round(((horiz ? x1 - x0 : z1 - z0)) / 6);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = horiz ? x0 + (x1 - x0) * t : (x0 + x1) / 2 + (horiz ? 0 : 0);
      if (horiz) F.box(x0 + (x1 - x0) * t, H, z0 - T * 0.18, 1.3, 1, T * 0.55, stone);
      else F.box(x0 + T * 0.18, H, z0 + (z1 - z0) * t, T * 0.55, 1, 1.3, stone);
    }
  };

  // the long east-west stretch, split around the gate
  wallRun(-420, gate0 - 10, zA, zA);
  wallRun(gate1 + 10, xB, zA, zA);
  merlons(-420, gate0 - 10, zA, zA, true);
  merlons(gate1 + 10, xB, zA, zA, true);

  // the gate towers, and the passage between them stays open
  for (const [t0, t1] of [[gate0 - 10, gate0], [gate1, gate1 + 10]]) wallRun(t0, t1, zA, zA);
  F.box((gate0 + gate1) / 2, H, zA, gate1 - gate0 + 20, 1.6, T + 1.2, stone); // the lintel over the gate, purely decorative

  // the shorter north-south stretch, turning the corner at xB
  wallRun(xB, xB, zA, -150);
  merlons(xB, xB, zA, -150, false);

  // stairs up either side of the gate, so you can walk along the top
  F.stairs(gate0 - 5, zA + T / 2, 8, 12, H / 12, 0.85, M.marble2);
  F.stairs(gate1 + 5, zA + T / 2, 8, 12, H / 12, 0.85, M.marble2);

  MAP_SHAPES.push({ k: "r", x0: -422, x1: xB + 2, z0: zA - T / 2 - 1.5, z1: zA + T / 2 + 1.5, c: "#8d8570" });
  MAP_SHAPES.push({ k: "r", x0: xB - T / 2 - 1.5, x1: xB + T / 2 + 1.5, z0: -152, z1: zA, c: "#8d8570" });
}

// ---------- entry ----------

function buildLandmarks(sc) {
  worldScene = sc;
  buildForum();
  buildArch();
  buildCapitolium();
  buildTrajan();
  buildPalatine();
  buildColosseum();
  buildCircus();
  buildPantheon();
  buildColossus();
  buildServianWall();
}
