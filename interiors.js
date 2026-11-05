"use strict";
// Shops you can walk into. Most of Rome's apartment blocks are solid boxes (city.js); a few dozen of them, most of them around the Colosseum and the Forum, are swapped for a real building the first
// time you come near: a hollow shell of the same size and colour, a door in the wall that faces the street, a floor, a ceiling, a counter, shelves with goods and a shopkeeper who greets you.
// The block's roof stays (and aircraft can still land on it: the old blocker is kept as the solid part above the ceiling). Depends on city.js (INSULAE), doors.js, physics.js (addBlockerBox, blockedAt,
// groundAt), world.js (BOX) and game.js (createFigure, paintFigure, worldScene, player, toast).
// The other cities register their own buildings with Interiors.register(spec): the shops along Chandni Chowk in Old Delhi, the visitor centre and some of the hotels in Cancún, a few courtyard halls and
// towers in Beijing. spec: { x, z, w, d, h (the building), kinds (a list in LISTS), side (door wall: N S E W), signY, parent (the group the shell goes into), era ("ancient"/"modern" if it only exists in one),
// tint(modern) (wall colour), upper (the material of what is above the ceiling), hide() (takes the old solid building away), blk (its blocker) }.

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
  const LISTS = {
    rome: KINDS,
    delhi: [
      { name: "Spice shop", keeper: "The spice seller", line: "Cardamom, cumin, saffron. Smell this one, friend!", counter: 0x8a5a2a, goods: [0xc4562a, 0xe0a52a, 0x7a3a1a], sign: "#7a2a1a" },
      { name: "Sweet shop", keeper: "The halwai", line: "Jalebi, hot from the pan! Take a bag of laddoos for the road.", counter: 0xb08a5a, goods: [0xe8902a, 0xf0c04a, 0xd9a05a], sign: "#a8501a" },
      { name: "Silk emporium", keeper: "The weaver", line: "Silk and cotton from every corner of India. Feel the cloth.", counter: 0x9a7a5a, goods: [0xb3262b, 0x2f6b8f, 0xd9a13a], sign: "#6a2a6a" },
      { name: "Jeweller", keeper: "The jeweller", line: "Silver and gold, sold by weight. Honest weight.", counter: 0x6b4a2b, goods: [0xd9c070, 0xc0c0c8, 0xe0b040], sign: "#3a3a5a" },
      { name: "Attar seller", keeper: "The perfumer", line: "One drop of rose attar lasts the whole day.", counter: 0x7a5a3a, goods: [0xb04a6a, 0x4a8a6a, 0xc0a060], sign: "#5a2a4a" },
      { name: "Chai stall", keeper: "The chaiwala", line: "Masala chai? Sit, sit, it is almost ready.", counter: 0x8a6a4a, goods: [0xc98b46, 0xe0d0a0, 0x8a4a2a], sign: "#2a5a4a" },
    ],
    cancunCentre: [{ name: "Visitor centre", keeper: "The guide", line: "Welcome to Chichén Itzá! Ask me anything about the Maya.", counter: 0xb5835a, goods: [0xc4673c, 0x3f8a6a, 0xe0c060], sign: "#2a5a6a" }],
    cancun: [
      { name: "Hotel lobby", keeper: "The concierge", line: "Welcome to Cancún! Your room has an ocean view.", counter: 0x9a8a7a, goods: [0x2fbfd0, 0xf2c21b, 0xe8e0d0], sign: "#1a5a7a" },
      { name: "Beach shop", keeper: "The shopkeeper", line: "Sunscreen, sandals and snorkels. The reef is just offshore.", counter: 0xa08a5a, goods: [0xe23b3b, 0x2f8fe0, 0xf2c21b], sign: "#c0501a" },
      { name: "Dive shop", keeper: "The diver", line: "Masks, fins and tanks. They say there are chests down by the reef.", counter: 0x5a6a7a, goods: [0x2f8fe0, 0x1a1a2a, 0xe0a52a], sign: "#1a3a6a" },
      { name: "Taco bar", keeper: "The cook", line: "Tacos al pastor with lime and a little fire. Sit anywhere.", counter: 0x8a5a3a, goods: [0xe0b26a, 0x5a8a3a, 0xc4562a], sign: "#7a3a1a" },
    ],
    beijingHall: [
      { name: "Tea house", keeper: "The tea master", line: "Jasmine or oolong? Sit down, the water is just right.", counter: 0x6b4a2b, goods: [0x5a7a3a, 0xc9a050, 0x8a4a2a], sign: "#2a5a3a" },
      { name: "Dumpling shop", keeper: "The cook", line: "Hot jiaozi! Pork and chive, straight from the steamer.", counter: 0x9a7a5a, goods: [0xf0e0c0, 0xe0c080, 0xb0402a], sign: "#8a2a1a" },
      { name: "Silk shop", keeper: "The silk merchant", line: "Silk from Hangzhou, soft as a cloud.", counter: 0x8a6a4a, goods: [0xb3262b, 0xe2b52a, 0x2d62b5], sign: "#7a1c16" },
      { name: "Brush shop", keeper: "The scholar", line: "Ink, brush and paper. A good brush lasts a lifetime.", counter: 0x5a3f2c, goods: [0x1c1612, 0xe9e7df, 0x8a2a1a], sign: "#3a2a1a" },
    ],
    beijingCbd: [
      { name: "Café", keeper: "The barista", line: "Flat white or milk tea? The Wi-Fi is free.", counter: 0x8a7a6a, goods: [0xe9e7df, 0x8a5a3a, 0x4a7a5a], sign: "#2a4a3a" },
      { name: "Noodle bar", keeper: "The cook", line: "Hand-pulled noodles, one bowl at a time.", counter: 0x9a7a5a, goods: [0xe0c880, 0xb0402a, 0x5a8a3a], sign: "#8a2a1a" },
      { name: "Tea shop", keeper: "The tea seller", line: "Try the Longjing. It is this spring's.", counter: 0x6b4a2b, goods: [0x5a7a3a, 0xc9a050, 0xe0e0d0], sign: "#2a5a3a" },
      { name: "Convenience store", keeper: "The clerk", line: "Open all night. Snacks, drinks, phone cards.", counter: 0x7a8a9a, goods: [0xe23b3b, 0x2c7fe0, 0xf2c21b], sign: "#1a4a8a" },
    ],
  };
  const made = { rome: 0 };                                                      // how many shops each list has given out
  let romeDone = false, curEx;
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
    for (const p of picked) if (p.ext && p.ext.tint) p.wallMat.color.set(p.ext.tint(modern));
  }

  // Which blocks get a shop: every third one within 350 m of the Colosseum and the Forum, and every fourteenth one elsewhere.
  function setup() {
    if (romeDone || !INSULAE.list.length) return;
    romeDone = true;
    INSULAE.list.forEach((b, i) => {
      const near = Math.hypot(b.x - 100, b.z - 60) < 350;
      if (near ? i % 3 === 0 : i % 14 === 0) picked.push({ i, b, kind: KINDS[made.rome++ % KINDS.length], built: false, inside: false, g: null, keeper: null });
    });
    setEra(typeof era !== "undefined" && era === "modern");
  }

  // A building of another city becomes a shop (built the first time you come within 110 m).
  function register(s) {
    const list = LISTS[s.kinds] || KINDS, n = made[s.kinds] || 0;
    made[s.kinds] = n + 1;
    const b = { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, blk: s.blk || null, ci: 0 };
    const p = { i: n + 7, b, kind: list[n % list.length], built: false, inside: false, g: null, keeper: null, ext: s };
    p.wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2014 });
    p.wallMat.color.set(s.tint ? s.tint(modern) : 0xcccccc);
    picked.push(p);
  }

  const box = (g, x0, x1, y0, y1, z0, z1, mat, solid) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.add(m);
    if (solid) addBlockerBox(x0, x1, z0, z1, y0, solid === true ? y1 : solid, curEx);
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
    const b = p.b, kind = p.kind, ext = p.ext, g = new THREE.Group(), pm = ext ? p.wallMat : plaster[b.ci % plaster.length], h = b.h;
    const rh = Math.min(ROOM_H, h - 0.3), top = rh + 0.3;                                              // the room is 3.9 m high, or a little lower in a low building
    curEx = ext && ext.era ? { era: ext.era } : undefined;
    p.built = true;
    // the solid block goes away (its roof and the shop band stay as pictures only because the shell below is the same size)
    if (ext) { if (ext.hide) ext.hide(); }
    else for (const m of [INSULAE.body, INSULAE.shops]) { O.position.set(0, 0, 0); O.scale.set(0, 0, 0); O.rotation.set(0, 0, 0); O.updateMatrix(); m.setMatrixAt(p.i, O.matrix); m.instanceMatrix.needsUpdate = true; }
    if (b.blk) { if (h > top + 0.05) { b.blk.y0 = rh + 0.35; b.blk.roof = true; } else b.blk.off = true; }                                        // what is left of the block is the part above the ceiling (a roof aircraft can land on)
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2, side = ext && ext.side ? ext.side : doorSide(b);
    const blockers = [];
    // walls: a dark band to 3.2 m and plaster above, 0.5 m thick; the door wall has a gap
    const wall = (ax0, ax1, az0, az1, y0, y1, solid) => {
      const lo = Math.max(y0, 0), mid = Math.min(Math.max(BAND_H, y0), top), yt = Math.min(y1, top);
      if (y0 < BAND_H) box(g, ax0, ax1, lo, Math.min(BAND_H, yt), az0, az1, bandMat, false);
      if (yt > BAND_H) box(g, ax0, ax1, mid, yt, az0, az1, pm, false);
      if (solid) addBlockerBox(ax0, ax1, az0, az1, y0, h + 1, curEx);
    };
    const sides = {
      N: (gap) => gap ? [[x0, b.x - DOOR_W / 2, z0, z0 + T, 0], [b.x + DOOR_W / 2, x1, z0, z0 + T, 0], [b.x - DOOR_W / 2, b.x + DOOR_W / 2, z0, z0 + T, DOOR_H]] : [[x0, x1, z0, z0 + T, 0]],
      S: (gap) => gap ? [[x0, b.x - DOOR_W / 2, z1 - T, z1, 0], [b.x + DOOR_W / 2, x1, z1 - T, z1, 0], [b.x - DOOR_W / 2, b.x + DOOR_W / 2, z1 - T, z1, DOOR_H]] : [[x0, x1, z1 - T, z1, 0]],
      W: (gap) => gap ? [[x0, x0 + T, z0, b.z - DOOR_W / 2, 0], [x0, x0 + T, b.z + DOOR_W / 2, z1, 0], [x0, x0 + T, b.z - DOOR_W / 2, b.z + DOOR_W / 2, DOOR_H]] : [[x0, x0 + T, z0, z1, 0]],
      E: (gap) => gap ? [[x1 - T, x1, z0, b.z - DOOR_W / 2, 0], [x1 - T, x1, b.z + DOOR_W / 2, z1, 0], [x1 - T, x1, b.z - DOOR_W / 2, b.z + DOOR_W / 2, DOOR_H]] : [[x1 - T, x1, z0, z1, 0]],
    };
    for (const s of ["N", "S", "W", "E"]) for (const [ax0, ax1, az0, az1, y0] of sides[s](s === side)) wall(ax0, ax1, az0, az1, y0, h, true);
    if (h > top + 0.05) box(g, x0, x1, top, h, z0, z1, ext && ext.upper ? ext.upper : pm, false);                                       // the rest of a tall building, above the ceiling
    // the door
    const dx = side === "E" ? x1 - T / 2 : side === "W" ? x0 + T / 2 : b.x, dz = side === "S" ? z1 - T / 2 : side === "N" ? z0 + T / 2 : b.z;
    Doors.add(g, dx, dz, side === "N" || side === "S" ? "x" : "z", DOOR_W, DOOR_H, side === "S" || side === "W" ? 1 : -1, blockers, 0, ext && ext.era);
    // floor and ceiling
    box(g, x0 + T, x1 - T, 0, 0.06, z0 + T, z1 - T, floorMat, false);
    box(g, x0 + T, x1 - T, rh, top, z0 + T, z1 - T, ceilMat, false);
    // inside: the counter, the shelves behind it, the goods and the keeper (the room is laid out along the line from the door to the back wall)
    const horiz = side === "N" || side === "S", inw = side === "S" || side === "E" ? -1 : 1, roomD = horiz ? b.d : b.w, roomW = horiz ? b.w : b.d;
    const at = (along, depth) => horiz ? [b.x + along, b.z + inw * (-roomD / 2 + depth)] : [b.x + inw * (-roomD / 2 + depth), b.z + along];           // depth 0 is the door wall
    const rect = (alongC, depthC, alongL, depthL, y0, y1, mat, solid) => {
      const [cx, cz] = at(alongC, depthC), sx = horiz ? alongL : depthL, sz = horiz ? depthL : alongL;
      return box(g, cx - sx / 2, cx + sx / 2, y0, y1, cz - sz / 2, cz + sz / 2, mat, solid);
    };
    const counterMat = new THREE.MeshLambertMaterial({ color: kind.counter, emissive: 0x2a1c10 });
    const compact = roomD < 8, cw = Math.min(roomW * 0.55, 14), sw = Math.min(roomW * 0.8, 20), spread = Math.min(roomW * 0.5, 12);      // a shallow room has only a counter and the shelves behind it
    const counterD = compact ? roomD - 2.7 : roomD - 4.2, shelfD = roomD - T - (compact ? 0.4 : 0.45);
    rect(0, counterD, cw, compact ? 0.9 : 1.1, 0, 1.05, counterMat, true);
    rect(0, shelfD, sw, compact ? 0.7 : 0.8, 0, Math.min(2.6, rh - 0.5), counterMat, true);            // the shelves
    for (let k = 0; k < 8; k++) {                                                                       // goods on the counter and the shelves
      const gm = new THREE.MeshLambertMaterial({ color: kind.goods[k % kind.goods.length], emissive: 0x201810 });
      const along = (rnd() - 0.5) * spread, onShelf = k % 2;
      rect(along, onShelf ? shelfD : counterD, 0.45, 0.45, onShelf ? 0.8 + (k % 3) * 0.6 : 1.05, onShelf ? 1.25 + (k % 3) * 0.6 : 1.45, gm, false);
    }
    // a rug in front of the counter, two tables with stools in the middle of the room, barrels in the back corners and a lamp hanging from the ceiling
    const rugMat = new THREE.MeshLambertMaterial({ color: 0x8a2f2a, emissive: 0x2a0c0a }), woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5530, emissive: 0x201408 });
    if (!compact) {
      rect(0, roomD - 6.2, Math.min(roomW * 0.35, 9), 2.6, 0.06, 0.1, rugMat, false);
      for (const side2 of [-1, 1]) {
        const along = side2 * Math.min(roomW * 0.27, 7), depth = roomD * 0.38;
        rect(along, depth, 1.9, 1.1, 0.7, 0.82, woodMat, 0.85);
        rect(along, depth, 0.35, 0.35, 0, 0.7, woodMat, false);
        for (const k of [-1, 1]) rect(along + k * 1.5, depth, 0.55, 0.55, 0, 0.45, woodMat, 0.45);
      }
      for (const side2 of [-1, 1]) {
        const [bx, bz] = at(side2 * (Math.min(roomW, 24) / 2 - 1.3), roomD - 1.3);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 12), woodMat); barrel.position.set(bx, 0.61, bz); g.add(barrel);
        addBlockerBox(bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, 0, 1.1, curEx);
      }
    } else rect(0, 1.2, Math.min(roomW * 0.3, 8), 1.4, 0.06, 0.1, rugMat, false);
    const [lx, lz] = at(0, roomD * 0.5);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a })); lamp.position.set(lx, rh - 0.5, lz); g.add(lamp);
    const cord = new THREE.Mesh(BOX, bandMat); cord.scale.set(0.04, 0.5, 0.04); cord.position.set(lx, rh - 0.2, lz); g.add(cord);
    const [kx, kz] = at(0, compact ? roomD - 1.7 : roomD - 2.6);
    const fig = createFigure(); paintFigure(fig.mats, { skin: p.i % 5, hair: p.i % 4, toga: (p.i * 3) % 6, sash: p.i % 5 }); fig.sword.visible = false;
    fig.g.position.set(kx, 0.06, kz); fig.g.rotation.y = Math.atan2(horiz ? 0 : -inw, horiz ? -inw : 0); g.add(fig.g);
    p.keeper = fig;
    // the sign over the door, outside
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.72), new THREE.MeshBasicMaterial({ map: signTexture(kind.name, kind.sign) }));
    sg.position.set(side === "E" ? x1 + 0.03 : side === "W" ? x0 - 0.03 : b.x, ext && ext.signY ? ext.signY : Math.min(3.55, top - 0.4), side === "S" ? z1 + 0.03 : side === "N" ? z0 - 0.03 : b.z);
    sg.rotation.y = side === "S" ? 0 : side === "N" ? Math.PI : side === "E" ? Math.PI / 2 : -Math.PI / 2;
    g.add(sg);
    (ext && ext.parent ? ext.parent : worldScene).add(g);
    p.g = g;
  }

  function update(dt) {
    if (!picked.length || typeof player === "undefined" || typeof started === "undefined" || !started) return;
    timer -= dt;
    const slow = timer <= 0;
    if (slow) { timer = 0.5; const m = typeof era !== "undefined" && era === "modern"; if (m !== modern) setEra(m); }
    for (const p of picked) {
      const b = p.b, dist = Math.hypot(player.x - b.x, player.z - b.z);
      if (p.ext && p.ext.era && (p.ext.era === "modern") !== modern) { p.inside = false; continue; }                  // a shop that only exists in the other era
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

  return { setup, register, update, setEra, get count() { return picked.length; }, get built() { return picked.filter((p) => p.built).length; }, shops: () => picked.map((p) => ({ x: p.b.x, z: p.b.z, name: p.kind.name, built: p.built })) };
})();
