"use strict";
// Shops you can walk into. Most of Rome's apartment blocks are solid boxes (city.js); a few dozen of them, most of them around the Colosseum and the Forum, are swapped for a real building the first
// time you come near: a hollow shell of the same size and colour, a door in the wall that faces the street, a floor, a ceiling, a counter, shelves with goods and a shopkeeper who greets you.
// The block's roof stays (and aircraft can still land on it: the old blocker is kept as the solid part above the ceiling). Depends on city.js (INSULAE), doors.js, physics.js (addBlockerBox, blockedAt,
// groundAt), world.js (BOX) and game.js (createFigure, paintFigure, worldScene, player, toast).

const Interiors = (() => {
  const T = 0.5, ROOM_H = 3.9, BAND_H = 3.2, DOOR_W = 2.4, DOOR_H = 2.8;
  const KINDS = [
    { name: "Bakery", keeper: "The baker", line: "Fresh bread, friend! Come back when you are hungry.", counter: 0xb5835a, goods: [0xe0b26a, 0xc98b46, 0xf0d9a0], sign: "#8c5a2b" },
    { name: "Tavern", keeper: "The innkeeper", line: "Wine from the hills and a warm seat. Sit as long as you like.", counter: 0x6b4a2b, goods: [0x7a2d3a, 0x5b2230, 0xb0884a], sign: "#6a2630" },
    { name: "Workshop", keeper: "The smith", line: "Mind the tools. Everything here is made by hand.", counter: 0x7a6a58, goods: [0x8a8a8a, 0x5d5d5d, 0xa0a0a0], sign: "#444a50" },
    { name: "Cloth shop", keeper: "The weaver", line: "Wool, linen and the best dyes in the district.", counter: 0x9a7a5a, goods: [0x9c3a2e, 0x2f5f8f, 0xd9b44a], sign: "#7a3b6a" },
    { name: "Oil seller", keeper: "The merchant", line: "Olive oil by the jar. Taste it: you will not find better.", counter: 0xa08050, goods: [0xb7a23a, 0x8a7a2a, 0xcfc060], sign: "#6a6a2a" },
    { name: "Potter", keeper: "The potter", line: "Jars, lamps and cups. Every one is different.", counter: 0x8a6a4a, goods: [0xc4673c, 0xa94f2c, 0xd98b5a], sign: "#9a4a2a" },
  ];
  const picked = [];                                                    // { i (the block), b, kind, built, inside, g (the building), keeper }
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x8a6a43, emissive: 0x4a3620 }), ceilMat = new THREE.MeshLambertMaterial({ color: 0xcbb68c, emissive: 0x5a4a30 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x5a3f2c, emissive: 0x3a2818 });
  const plaster = Array.from({ length: 6 }, () => new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2014 }));
  const O = new THREE.Object3D();
  let timer = 0, modern = false;

  const rnd = (() => { let a = 0x51ed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();

  function setEra(m) {
    modern = !!m;
    const pal = modern ? PLASTER_MODERN : PLASTER_ANCIENT;
    plaster.forEach((mat, i) => mat.color.copy(pal[i % pal.length]));
    bandMat.color.setHex(modern ? 0x24313a : 0x5a3f2c);
  }

  // Which blocks get a shop: every third one within 350 m of the Colosseum and the Forum, and every fourteenth one elsewhere.
  function setup() {
    if (picked.length || !INSULAE.list.length) return;
    INSULAE.list.forEach((b, i) => {
      const near = Math.hypot(b.x - 100, b.z - 60) < 350;
      if (near ? i % 3 === 0 : i % 14 === 0) picked.push({ i, b, kind: KINDS[picked.length % KINDS.length], built: false, inside: false, g: null, keeper: null });
    });
    setEra(typeof era !== "undefined" && era === "modern");
  }

  const box = (g, x0, x1, y0, y1, z0, z1, mat, solid) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(m);
    if (solid) addBlockerBox(x0, x1, z0, z1, y0, solid === true ? y1 : solid);
    return m;
  };

  function signTexture(text, bg) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 72; const x = c.getContext("2d");
    x.fillStyle = bg; x.fillRect(0, 0, 256, 72); x.strokeStyle = "#e6c36a"; x.lineWidth = 5; x.strokeRect(5, 5, 246, 62);
    x.fillStyle = "#fff3cf"; x.font = "bold 34px Georgia, serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text.toUpperCase(), 128, 38);
    return new THREE.CanvasTexture(c);
  }

  // Which side has the door: the first of south, north, east, west with open ground in front of it.
  function doorSide(b) {
    for (const s of ["S", "N", "E", "W"]) {
      const ox = s === "E" ? b.w / 2 + 2 : s === "W" ? -b.w / 2 - 2 : 0, oz = s === "S" ? b.d / 2 + 2 : s === "N" ? -b.d / 2 - 2 : 0;
      let free = true;
      for (const k of [-1.5, 0, 1.5]) {
        const x = b.x + ox + (oz ? k : 0), z = b.z + oz + (ox ? k : 0);
        if (blockedAt(x, z, groundAt(x, z))) { free = false; break; }
      }
      if (free) return s;
    }
    return "S";
  }

  function build(p) {
    const b = p.b, kind = p.kind, g = new THREE.Group(), pm = plaster[b.ci % plaster.length], h = b.h;
    p.built = true;
    // the solid block goes away (its roof and the shop band stay as pictures only because the shell below is the same size)
    for (const m of [INSULAE.body, INSULAE.shops]) { O.position.set(0, 0, 0); O.scale.set(0, 0, 0); O.rotation.set(0, 0, 0); O.updateMatrix(); m.setMatrixAt(p.i, O.matrix); m.instanceMatrix.needsUpdate = true; }
    if (b.blk) { b.blk.y0 = ROOM_H + 0.35; b.blk.roof = true; }                                        // what is left of the block is the part above the ceiling (a roof aircraft can land on)
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, side = doorSide(b);
    const blockers = [];
    // walls: a dark band to 3.2 m and plaster above, 0.5 m thick; the door wall has a gap
    const wall = (ax0, ax1, az0, az1, y0, y1, solid) => {
      const lo = Math.max(y0, 0), mid = Math.min(Math.max(BAND_H, y0), y1);
      if (y0 < BAND_H) box(g, ax0, ax1, lo, Math.min(BAND_H, y1), az0, az1, bandMat, false);
      if (y1 > BAND_H) box(g, ax0, ax1, mid, y1, az0, az1, pm, false);
      if (solid) addBlockerBox(ax0, ax1, az0, az1, y0, h + 1);
    };
    const sides = {
      N: (gap) => gap ? [[x0, b.x - DOOR_W / 2, z0, z0 + T, 0], [b.x + DOOR_W / 2, x1, z0, z0 + T, 0], [b.x - DOOR_W / 2, b.x + DOOR_W / 2, z0, z0 + T, DOOR_H]] : [[x0, x1, z0, z0 + T, 0]],
      S: (gap) => gap ? [[x0, b.x - DOOR_W / 2, z1 - T, z1, 0], [b.x + DOOR_W / 2, x1, z1 - T, z1, 0], [b.x - DOOR_W / 2, b.x + DOOR_W / 2, z1 - T, z1, DOOR_H]] : [[x0, x1, z1 - T, z1, 0]],
      W: (gap) => gap ? [[x0, x0 + T, z0, b.z - DOOR_W / 2, 0], [x0, x0 + T, b.z + DOOR_W / 2, z1, 0], [x0, x0 + T, b.z - DOOR_W / 2, b.z + DOOR_W / 2, DOOR_H]] : [[x0, x0 + T, z0, z1, 0]],
      E: (gap) => gap ? [[x1 - T, x1, z0, b.z - DOOR_W / 2, 0], [x1 - T, x1, b.z + DOOR_W / 2, z1, 0], [x1 - T, x1, b.z - DOOR_W / 2, b.z + DOOR_W / 2, DOOR_H]] : [[x1 - T, x1, z0, z1, 0]],
    };
    for (const s of ["N", "S", "W", "E"]) for (const [ax0, ax1, az0, az1, y0] of sides[s](s === side)) wall(ax0, ax1, az0, az1, y0, h, true);
    // the door
    const dx = side === "E" ? x1 - T / 2 : side === "W" ? x0 + T / 2 : b.x, dz = side === "S" ? z1 - T / 2 : side === "N" ? z0 + T / 2 : b.z;
    Doors.add(g, dx, dz, side === "N" || side === "S" ? "x" : "z", DOOR_W, DOOR_H, side === "S" || side === "W" ? 1 : -1, blockers);
    // floor and ceiling
    box(g, x0 + T, x1 - T, 0, 0.06, z0 + T, z1 - T, floorMat, false);
    box(g, x0 + T, x1 - T, ROOM_H, ROOM_H + 0.3, z0 + T, z1 - T, ceilMat, false);
    // inside: the counter, the shelves behind it, the goods and the keeper (the room is laid out along the line from the door to the back wall)
    const horiz = side === "N" || side === "S", inw = side === "S" || side === "E" ? -1 : 1, roomD = horiz ? b.d : b.w, roomW = horiz ? b.w : b.d;
    const at = (along, depth) => horiz ? [b.x + along, b.z + inw * (-roomD / 2 + depth)] : [b.x + inw * (-roomD / 2 + depth), b.z + along];           // depth 0 is the door wall
    const rect = (alongC, depthC, alongL, depthL, y0, y1, mat, solid) => {
      const [cx, cz] = at(alongC, depthC), sx = horiz ? alongL : depthL, sz = horiz ? depthL : alongL;
      return box(g, cx - sx / 2, cx + sx / 2, y0, y1, cz - sz / 2, cz + sz / 2, mat, solid);
    };
    const counterMat = new THREE.MeshLambertMaterial({ color: kind.counter, emissive: 0x2a1c10 });
    rect(0, roomD - 4.2, roomW * 0.55, 1.1, 0, 1.05, counterMat, true);
    rect(0, roomD - T - 0.45, roomW * 0.8, 0.8, 0, 2.6, counterMat, true);                              // the shelves
    for (let k = 0; k < 8; k++) {                                                                       // goods on the counter and the shelves
      const gm = new THREE.MeshLambertMaterial({ color: kind.goods[k % kind.goods.length], emissive: 0x201810 });
      const along = (rnd() - 0.5) * roomW * 0.5, onShelf = k % 2;
      rect(along, onShelf ? roomD - T - 0.45 : roomD - 4.2, 0.45, 0.45, onShelf ? 0.8 + (k % 3) * 0.6 : 1.05, onShelf ? 1.25 + (k % 3) * 0.6 : 1.45, gm, false);
    }
    // a rug in front of the counter, two tables with stools in the middle of the room, barrels in the back corners and a lamp hanging from the ceiling
    const rugMat = new THREE.MeshLambertMaterial({ color: 0x8a2f2a, emissive: 0x2a0c0a }), woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5530, emissive: 0x201408 });
    rect(0, roomD - 6.2, roomW * 0.35, 2.6, 0.06, 0.1, rugMat, false);
    for (const side2 of [-1, 1]) {
      const along = side2 * roomW * 0.27, depth = roomD * 0.38;
      rect(along, depth, 1.9, 1.1, 0.7, 0.82, woodMat, 0.85);
      rect(along, depth, 0.35, 0.35, 0, 0.7, woodMat, false);
      for (const k of [-1, 1]) rect(along + k * 1.5, depth, 0.55, 0.55, 0, 0.45, woodMat, 0.45);
    }
    for (const side2 of [-1, 1]) {
      const [bx, bz] = at(side2 * (roomW / 2 - 1.3), roomD - 1.3);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 12), woodMat); barrel.position.set(bx, 0.61, bz); g.add(barrel);
      addBlockerBox(bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, 0, 1.1);
    }
    const [lx, lz] = at(0, roomD * 0.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a })); lamp.position.set(lx, ROOM_H - 0.5, lz); g.add(lamp);
    const cord = new THREE.Mesh(BOX, bandMat); cord.scale.set(0.04, 0.5, 0.04); cord.position.set(lx, ROOM_H - 0.2, lz); g.add(cord);
    const [kx, kz] = at(0, roomD - 2.6);
    const fig = createFigure(); paintFigure(fig.mats, { skin: p.i % 5, hair: p.i % 4, toga: (p.i * 3) % 6, sash: p.i % 5 }); fig.sword.visible = false;
    fig.g.position.set(kx, 0.06, kz); fig.g.rotation.y = Math.atan2(horiz ? 0 : -inw, horiz ? -inw : 0); g.add(fig.g);
    p.keeper = fig;
    // the sign over the door, outside
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.72), new THREE.MeshBasicMaterial({ map: signTexture(kind.name, kind.sign) }));
    sg.position.set(side === "E" ? x1 + 0.03 : side === "W" ? x0 - 0.03 : b.x, 3.55, side === "S" ? z1 + 0.03 : side === "N" ? z0 - 0.03 : b.z);
    sg.rotation.y = side === "S" ? 0 : side === "N" ? Math.PI : side === "E" ? Math.PI / 2 : -Math.PI / 2;
    g.add(sg);
    worldScene.add(g);
    p.g = g;
  }

  function update(dt) {
    if (!picked.length || typeof player === "undefined" || typeof started === "undefined" || !started) return;
    timer -= dt;
    const slow = timer <= 0;
    if (slow) timer = 0.5;
    for (const p of picked) {
      const b = p.b, dist = Math.hypot(player.x - b.x, player.z - b.z);
      if (!p.built) { if (slow && dist < 110 && (mode === "walk" || mode === "drive")) build(p); continue; }
      if (dist > 40) continue;
      const inside = Math.abs(player.x - b.x) < b.w / 2 - T && Math.abs(player.z - b.z) < b.d / 2 - T && player.feet < 2;
      if (inside && !p.inside) { p.inside = true; if (mode === "walk") toast(`${p.kind.name}: "${p.kind.line}" (${p.kind.keeper})`); }
      else if (!inside && p.inside) p.inside = false;
      if (p.keeper && dist < 25) {                                                                           // the keeper sways a little and waves a hand now and then
        const t = performance.now() / 1000 + p.i;
        p.keeper.parts.armR.rotation.x = Math.sin(t * 1.3) > 0.9 ? -2.2 : Math.sin(t * 0.8) * 0.12;
        p.keeper.parts.armL.rotation.x = Math.sin(t * 0.8 + 1) * 0.1;
      }
    }
  }

  return { setup, update, setEra, get count() { return picked.length; }, get built() { return picked.filter((p) => p.built).length; }, shops: () => picked.map((p) => ({ x: p.b.x, z: p.b.z, name: p.kind.name, built: p.built })) };
})();
