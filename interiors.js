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
    { name: "Bakery", trade: "food", keeper: "The baker", line: "Fresh bread, friend! Come back when you are hungry.", counter: 0xb5835a, goods: [0xe0b26a, 0xc98b46, 0xf0d9a0], sign: "#8c5a2b" },
    { name: "Tavern", trade: "food", late: true, keeper: "The innkeeper", line: "Wine from the hills and a warm seat. Sit as long as you like.", counter: 0x6b4a2b, goods: [0x7a2d3a, 0x5b2230, 0xb0884a], sign: "#6a2630" },
    { name: "Workshop", trade: "goods", keeper: "The smith", line: "Mind the tools. Everything here is made by hand.", counter: 0x7a6a58, goods: [0x8a8a8a, 0x5d5d5d, 0xa0a0a0], sign: "#444a50" },
    { name: "Cloth shop", trade: "clothes", keeper: "The clothier", line: "Wool, linen and the best dyes in the district.", counter: 0x9a7a5a, goods: [0x9c3a2e, 0x2f5f8f, 0xd9b44a], sign: "#7a3b6a" },
    { name: "Oil seller", trade: "goods", keeper: "The merchant", line: "Olive oil by the jar. Taste it: you will not find better.", counter: 0xa08050, goods: [0xb7a23a, 0x8a7a2a, 0xcfc060], sign: "#6a6a2a" },
    { name: "Potter", trade: "goods", keeper: "The potter", line: "Jars, lamps and cups. Every one is different.", counter: 0x8a6a4a, goods: [0xc4673c, 0xa94f2c, 0xd98b5a], sign: "#9a4a2a" },
  ];
  const LISTS = {
    rome: KINDS,
    delhi: [
      { name: "Spice shop", trade: "goods", keeper: "The spice seller", line: "Cardamom, cumin, saffron. Smell this one, friend!", counter: 0x8a5a2a, goods: [0xc4562a, 0xe0a52a, 0x7a3a1a], sign: "#7a2a1a" },
      { name: "Sweet shop", trade: "food", keeper: "The halwai", line: "Jalebi, hot from the pan! Take a bag of laddoos for the road.", counter: 0xb08a5a, goods: [0xe8902a, 0xf0c04a, 0xd9a05a], sign: "#a8501a" },
      { name: "Silk emporium", trade: "clothes", keeper: "The weaver", line: "Silk and cotton from every corner of India. Feel the cloth.", counter: 0x9a7a5a, goods: [0xb3262b, 0x2f6b8f, 0xd9a13a], sign: "#6a2a6a" },
      { name: "Jeweller", trade: "goods", keeper: "The jeweller", line: "Silver and gold, sold by weight. Honest weight.", counter: 0x6b4a2b, goods: [0xd9c070, 0xc0c0c8, 0xe0b040], sign: "#3a3a5a" },
      { name: "Attar seller", trade: "goods", keeper: "The perfumer", line: "One drop of rose attar lasts the whole day.", counter: 0x7a5a3a, goods: [0xb04a6a, 0x4a8a6a, 0xc0a060], sign: "#5a2a4a" },
      { name: "Chai stall", trade: "food", late: true, keeper: "The chaiwala", line: "Masala chai? Sit, sit, it is almost ready.", counter: 0x8a6a4a, goods: [0xc98b46, 0xe0d0a0, 0x8a4a2a], sign: "#2a5a4a" },
    ],
    cancunCentre: [{ name: "Visitor centre", trade: "goods", keeper: "The guide", line: "Welcome to Chichén Itzá! Ask me anything about the Maya.", counter: 0xb5835a, goods: [0xc4673c, 0x3f8a6a, 0xe0c060], sign: "#2a5a6a" }],
    cancunMaya: [
      { name: "Cacao seller", trade: "goods", keeper: "The cacao trader", line: "Cacao beans are money here. Taste a cup: thick, bitter and sweet.", counter: 0x8a5a3a, goods: [0x5a3a22, 0xe0c080, 0x8a4a2a], sign: "#5a3a22" },
      { name: "Obsidian trader", trade: "goods", keeper: "The stone trader", line: "Black glass from the volcano. It cuts sharper than any bronze.", counter: 0x5a5a5a, goods: [0x1a1a22, 0x3a3a44, 0x8a8a8a], sign: "#2a2a3a" },
      { name: "Maya weaver", trade: "clothes", keeper: "The weaver", line: "Cotton dyed red with cochineal and blue with indigo.", counter: 0x9a7a5a, goods: [0xb3262b, 0x2d62b5, 0xe0c060], sign: "#7a2a2a" },
    ],
    cancun: [
      { name: "Hotel lobby", trade: "goods", late: true, keeper: "The concierge", line: "Welcome to Cancún! Your room has an ocean view.", counter: 0x9a8a7a, goods: [0x2fbfd0, 0xf2c21b, 0xe8e0d0], sign: "#1a5a7a" },
      { name: "Beach shop", trade: "goods", keeper: "The shopkeeper", line: "Sunscreen, sandals and snorkels. The reef is just offshore.", counter: 0xa08a5a, goods: [0xe23b3b, 0x2f8fe0, 0xf2c21b], sign: "#c0501a" },
      { name: "Dive shop", trade: "goods", keeper: "The diver", line: "Masks, fins and tanks. They say there are chests down by the reef.", counter: 0x5a6a7a, goods: [0x2f8fe0, 0x1a1a2a, 0xe0a52a], sign: "#1a3a6a" },
      { name: "Taco bar", trade: "food", late: true, keeper: "The cook", line: "Tacos al pastor with lime and a little fire. Sit anywhere.", counter: 0x8a5a3a, goods: [0xe0b26a, 0x5a8a3a, 0xc4562a], sign: "#7a3a1a" },
    ],
    beijingHall: [
      { name: "Tea house", trade: "food", keeper: "The tea master", line: "Jasmine or oolong? Sit down, the water is just right.", counter: 0x6b4a2b, goods: [0x5a7a3a, 0xc9a050, 0x8a4a2a], sign: "#2a5a3a" },
      { name: "Dumpling shop", trade: "food", keeper: "The cook", line: "Hot jiaozi! Pork and chive, straight from the steamer.", counter: 0x9a7a5a, goods: [0xf0e0c0, 0xe0c080, 0xb0402a], sign: "#8a2a1a" },
      { name: "Silk shop", trade: "clothes", keeper: "The silk merchant", line: "Silk from Hangzhou, soft as a cloud.", counter: 0x8a6a4a, goods: [0xb3262b, 0xe2b52a, 0x2d62b5], sign: "#7a1c16" },
      { name: "Brush shop", trade: "goods", keeper: "The scholar", line: "Ink, brush and paper. A good brush lasts a lifetime.", counter: 0x5a3f2c, goods: [0x1c1612, 0xe9e7df, 0x8a2a1a], sign: "#3a2a1a" },
    ],
    beijingCbd: [
      { name: "Café", trade: "food", keeper: "The barista", line: "Flat white or milk tea? The Wi-Fi is free.", counter: 0x8a7a6a, goods: [0xe9e7df, 0x8a5a3a, 0x4a7a5a], sign: "#2a4a3a" },
      { name: "Noodle bar", trade: "food", late: true, keeper: "The cook", line: "Hand-pulled noodles, one bowl at a time.", counter: 0x9a7a5a, goods: [0xe0c880, 0xb0402a, 0x5a8a3a], sign: "#8a2a1a" },
      { name: "Tea shop", trade: "goods", keeper: "The tea seller", line: "Try the Longjing. It is this spring's.", counter: 0x6b4a2b, goods: [0x5a7a3a, 0xc9a050, 0xe0e0d0], sign: "#2a5a3a" },
      { name: "Convenience store", trade: "goods", late: true, keeper: "The clerk", line: "Open all night. Snacks, drinks, phone cards.", counter: 0x7a8a9a, goods: [0xe23b3b, 0x2c7fe0, 0xf2c21b], sign: "#1a4a8a" },
    ],
  };
  const made = { rome: 0 };                                                      // how many shops each list has given out
  let romeDone = false, curEx;
  const picked = [];                                                    // { i (the block), b, kind, built, inside, g (the building), keeper }
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x8a6a43, emissive: 0x4a3620, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), ceilMat = new THREE.MeshLambertMaterial({ color: 0xcbb68c, emissive: 0x5a4a30 });
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

  // Which blocks get a shop: every third one within 350 m of the Colosseum and the Forum, and every ninth one elsewhere.
  function setup() {
    if (romeDone || !INSULAE.list.length) return;
    romeDone = true;
    INSULAE.list.forEach((b, i) => {
      const near = Math.hypot(b.x - 100, b.z - 60) < 350;
      if (near ? i % 3 === 0 : i % 9 === 0) picked.push({ i, b, kind: KINDS[made.rome++ % KINDS.length], built: false, inside: false, g: null, keeper: null });
    });
    setEra(typeof era !== "undefined" && era === "modern");
    // three more near the sights: a tavern by the Forum, a potter by the Pantheon and a baker by the Circus Maximus (small buildings of their own, in both eras)
    for (const [x, z, kind, c] of [[51, 6, "Tavern", 0xe0cfa8], [-480, -346, "Potter", 0xd8c6a0], [-208, 430, "Bakery", 0xe4d4b0]]) addHouse({ x, z, w: 12, d: 9, h: 3.8, kinds: "rome", kind, idKind: "romex", parent: worldScene, color: c, roof: "hip", roofColor: 0xa0452c });
  }

  // A building of another city becomes a shop (built the first time you come within 110 m).
  function register(s) {
    const list = LISTS[s.kinds] || KINDS, n = made[s.kinds] || 0;
    made[s.kinds] = n + 1;
    const b = { x: s.x, z: s.z, w: s.w, d: s.d, h: s.h, blk: s.blk || null, ci: 0 };
    const named = s.kind ? list.find((k) => k.name === s.kind) : null;
    const p = { i: n + 7, idk: s.idKind || s.kinds, b, kind: named || list[n % list.length], built: false, inside: false, g: null, keeper: null, ext: s };
    p.wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x2a2014 });
    p.wallMat.color.set(s.tint ? s.tint(modern) : 0xcccccc);
    picked.push(p);
  }

  // A new little building for a shop: a solid block with a roof, and the shop inside it. spec: { x, z, w, d, h, kinds, side, parent, era, color, roof ("hip", "chinese" or "flat"), roofColor }
  function addHouse(s) {
    const g = s.parent, color = s.color || 0xe4dcc3, mat = new THREE.MeshLambertMaterial({ color }), hh = s.h || 3.6;
    const mesh = new THREE.Mesh(BOX, mat); mesh.scale.set(s.w, hh, s.d); mesh.position.set(s.x, hh / 2, s.z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    const blk = addBlockerBox(s.x - s.w / 2, s.x + s.w / 2, s.z - s.d / 2, s.z + s.d / 2, 0, hh, s.era ? { era: s.era } : undefined);
    const rm = new THREE.MeshLambertMaterial({ color: s.roofColor || 0x8a5a2b });
    if (s.roof === "flat") { const r = new THREE.Mesh(BOX, rm); r.scale.set(s.w + 0.8, 0.5, s.d + 0.8); r.position.set(s.x, hh + 0.25, s.z); g.add(r); }
    else {
      const slab = new THREE.Mesh(BOX, rm); slab.scale.set(s.w + 2, 0.5, s.d + 2); slab.position.set(s.x, hh + 0.2, s.z); slab.castShadow = true; g.add(slab);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), rm), k = s.roof === "chinese" ? 1.5 : 1.2; cone.scale.set(s.w * 0.78 + 1.6, s.roof === "chinese" ? 3.4 : 2.8, s.d * 0.78 + 1.6); cone.rotation.y = Math.PI / 4;
      cone.position.set(s.x, hh + 0.45 + cone.scale.y / 2, s.z); cone.castShadow = true; g.add(cone); void k;
    }
    register({ x: s.x, z: s.z, w: s.w, d: s.d, h: hh, kinds: s.kinds, kind: s.kind, idKind: s.idKind, side: s.side, signY: s.signY, parent: g, era: s.era, blk, tint: () => color, hide: () => { mesh.visible = false; } });
    return mesh;
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
    p.door = Doors.add(g, dx, dz, side === "N" || side === "S" ? "x" : "z", DOOR_W, DOOR_H, side === "S" || side === "W" ? 1 : -1, blockers, 0, ext && ext.era);
    p.doorPos = [dx, dz];
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
    const rugMat = new THREE.MeshLambertMaterial({ color: 0x8a2f2a, emissive: 0x2a0c0a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), woodMat = new THREE.MeshLambertMaterial({ color: 0x7a5530, emissive: 0x201408 });
    const axis = horiz ? [1, 0] : [0, 1], yawTo = (dx, dz) => Math.atan2(-dx, -dz);                     // (a figure or the player faces local -z)
    p.seats = []; p.stands = []; p.at = at; p.roomD = roomD; p.axisV = axis;
    if (!compact) {
      rect(0, roomD - 6.2, Math.min(roomW * 0.35, 9), 2.6, 0.06, 0.1, rugMat, false);
      for (const side2 of [-1, 1]) {
        const along = side2 * Math.min(roomW * 0.27, 7), depth = roomD * 0.38;
        rect(along, depth, 1.9, 1.1, 0.7, 0.82, woodMat, 0.85);
        rect(along, depth, 0.35, 0.35, 0, 0.7, woodMat, false);
        for (const k of [-1, 1]) {                                                                          // the stools: you can sit on them (F), and so do the customers
          rect(along + k * 1.5, depth, 0.55, 0.55, 0, 0.45, woodMat, false);
          const [sx, sz] = at(along + k * 1.5, depth);
          p.seats.push({ x: sx, z: sz, yaw: yawTo(-k * axis[0], -k * axis[1]), along: along + k * 1.5, depth, by: null });
        }
      }
      for (const side2 of [-1, 1]) {
        const [bx, bz] = at(side2 * (Math.min(roomW, 24) / 2 - 1.3), roomD - 1.3);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.1, 12), woodMat); barrel.position.set(bx, 0.61, bz); g.add(barrel);
        addBlockerBox(bx - 0.5, bx + 0.5, bz - 0.5, bz + 0.5, 0, 1.1, curEx);
      }
    } else rect(0, 1.2, Math.min(roomW * 0.3, 8), 1.4, 0.06, 0.1, rugMat, false);
    const [lx, lz] = at(0, roomD * 0.5);
    p.lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), p.lampMat); lamp.position.set(lx, rh - 0.5, lz); g.add(lamp);
    const cord = new THREE.Mesh(BOX, bandMat); cord.scale.set(0.04, 0.5, 0.04); cord.position.set(lx, rh - 0.2, lz); g.add(cord);
    const [kx, kz] = at(0, compact ? roomD - 1.7 : roomD - 2.6);
    const fig = createFigure(); paintFigure(fig.mats, { skin: p.i % 5, hair: p.i % 4, toga: (p.i * 3) % 6, sash: p.i % 5 }); fig.sword.visible = false;
    fig.g.position.set(kx, 0.06, kz); fig.g.rotation.y = Math.atan2(horiz ? 0 : -inw, horiz ? -inw : 0); g.add(fig.g);
    p.keeper = fig; p.keeperW = [kx, kz];
    // customers: a few figures sit at the tables and stand at the counter, and come and go (they walk in at the door, cross to their place, and later walk out again)
    const faceKeeper = yawTo(horiz ? 0 : inw, horiz ? inw : 0), place = compact ? [[-2.2, counterD - 1.2], [2.2, counterD - 1.2]] : [[-1.9, counterD - 1.3]];
    const spots = (p.seats.length ? [{ seat: 0 }, { seat: p.seats.length - 1 }] : []).concat(place.map(([along, depth]) => ({ along, depth, yaw: faceKeeper })));
    p.customers = spots.map((sp, ci) => {
      const f = createFigure(); paintFigure(f.mats, { skin: (p.i + ci * 2) % 5, hair: (p.i * 2 + ci) % 4, toga: (p.i * 5 + ci * 3) % 6, sash: (p.i + ci * 4) % 5 }); f.sword.visible = false; f.g.visible = false; g.add(f.g);
      if (sp.seat !== undefined) { const st = p.seats[sp.seat]; return { fig: f, seat: sp.seat, sit: true, along: st.along, depth: st.depth, yaw: st.yaw, state: "away", path: [], pi: 0, x: 0, z: 0, ph: ci * 2 }; }
      return { fig: f, seat: -1, sit: false, along: sp.along, depth: sp.depth, yaw: sp.yaw, state: "away", path: [], pi: 0, x: 0, z: 0, ph: ci * 2 };
    });
    // the sign over the door, outside
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.72), new THREE.MeshBasicMaterial({ map: signTexture((typeof Latin !== "undefined" && Latin.sign(kind.name)) || tr(kind.name), kind.sign) }));
    sg.position.set(side === "E" ? x1 + 0.03 : side === "W" ? x0 - 0.03 : b.x, ext && ext.signY ? ext.signY : Math.min(3.55, top - 0.4), side === "S" ? z1 + 0.03 : side === "N" ? z0 - 0.03 : b.z);
    sg.rotation.y = side === "S" ? 0 : side === "N" ? Math.PI : side === "E" ? Math.PI / 2 : -Math.PI / 2;
    g.add(sg); p.sg = sg;
    p.winMat = new THREE.MeshBasicMaterial({ color: 0x2a2418 });                                         // two windows beside the door: dark by day, lit at night when the shop is open
    const wallLen = side === "N" || side === "S" ? b.w : b.d;
    if (wallLen >= DOOR_W + 4.6) for (const k of [-1, 1]) {
      const off = k * (DOOR_W / 2 + 1.3), win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), p.winMat);
      win.position.set(side === "E" ? x1 + 0.03 : side === "W" ? x0 - 0.03 : b.x + off, 1.7, side === "S" ? z1 + 0.03 : side === "N" ? z0 - 0.03 : b.z + off); win.rotation.y = sg.rotation.y; g.add(win);
    }
    (ext && ext.parent ? ext.parent : worldScene).add(g);
    p.g = g;
  }

  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);                            // the shop's words in the language of the game
  const hash = (a, b) => { let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
  const stormy = () => typeof Weather !== "undefined" && ["storm", "blizzard", "tornado", "cyclone", "hail"].includes(Weather.kind);   // (in a storm the shops shut, except the inns and food stalls that stay open at night, and any shop you are standing in)
  const shopOpen = (p, night) => (!night || !!p.kind.late) && (!stormy() || !!p.kind.late || !!p.inside);                                                // most shops shut at night (20:30 to 5:30); taverns, food stalls, hotels and corner shops stay open

  // what changes when a shop opens or shuts: the keeper (home for the night), the lamp, the windows, the customers
  function setOpen(p, open, night) {
    p.open = open; p.night = night;
    if (p.keeper) p.keeper.g.visible = open;
    if (p.lampMat) p.lampMat.color.setHex(open ? 0xffd27a : 0x3a3020);
    if (p.winMat) p.winMat.color.setHex(open && night ? 0xffd27a : 0x2a2418);
    if (!open) for (const c of p.customers) { c.state = "away"; c.fig.g.visible = false; if (c.seat >= 0) p.seats[c.seat].by = null; }
  }

  // the customers: each one is in the shop for a while (a new time slot every 25 to 50 s decides), walks in at the door and across to their place, and walks out again
  function customers(p, dt, t, night) {
    const per = p.kind.late && night ? 0.55 : p.customers.length > 2 ? 0.7 : 0.55;
    p.customers.forEach((c, ci) => {
      const slot = Math.floor(t / (25 + ci * 9)), seatTaken = c.seat >= 0 && p.seats[c.seat].by === "player";
      const want = p.open && !seatTaken && (c.force || hash(p.i * 17 + ci, slot) < per);
      const f = c.fig, P = (a, d) => { const [x, z] = p.at(a, d); return { x, z }; };
      if (c.state === "away" && want) {
        c.path = [P(0, 0.3), P(0, 1.4), P(c.along, 1.4), P(c.along, c.depth)]; c.pi = 0; c.state = "in";
        c.x = c.path[0].x; c.z = c.path[0].z; f.g.visible = true; f.g.position.set(c.x, 0.06, c.z);
        if (c.seat >= 0) p.seats[c.seat].by = "npc";
      } else if (c.state === "here" && !want) {
        c.path = [P(c.along, c.depth), P(c.along, 1.4), P(0, 1.4), P(0, 0.3)]; c.pi = 1; c.state = "out";
        f.g.position.y = 0.06; f.parts.legL.rotation.x = f.parts.legR.rotation.x = 0;
      }
      if (c.state === "in" || c.state === "out") {
        const to = c.path[c.pi], dx = to.x - c.x, dz = to.z - c.z, d = Math.hypot(dx, dz), step = 1.5 * dt;
        if (d <= step) { c.x = to.x; c.z = to.z; c.pi++; } else { c.x += (dx / d) * step; c.z += (dz / d) * step; f.g.rotation.y = Math.atan2(-dx, -dz); }
        c.ph += dt * 7;
        f.parts.legL.rotation.x = Math.sin(c.ph) * 0.6; f.parts.legR.rotation.x = -Math.sin(c.ph) * 0.6;
        f.parts.armL.rotation.x = -Math.sin(c.ph) * 0.4; f.parts.armR.rotation.x = Math.sin(c.ph) * 0.4;
        f.g.position.x = c.x; f.g.position.z = c.z;
        if (c.pi >= c.path.length) {
          if (c.state === "in") {
            c.state = "here"; f.g.rotation.y = c.yaw;
            if (c.sit) { f.g.position.y = -0.04; f.parts.legL.rotation.x = f.parts.legR.rotation.x = 1.45; f.parts.armL.rotation.x = f.parts.armR.rotation.x = -0.5; }
            else f.parts.legL.rotation.x = f.parts.legR.rotation.x = f.parts.armL.rotation.x = f.parts.armR.rotation.x = 0;
          } else { c.state = "away"; f.g.visible = false; if (c.seat >= 0 && p.seats[c.seat].by === "npc") p.seats[c.seat].by = null; }
        }
      } else if (c.state === "here" && !c.sit) { f.parts.armR.rotation.x = Math.sin(t * 0.9 + ci) > 0.93 ? -1.2 : 0; }       // (a customer at the counter now and then points at something)
    });
  }

  function update(dt) {
    if (!picked.length || typeof player === "undefined" || typeof started === "undefined" || !started) return;
    timer -= dt;
    const slow = timer <= 0;
    if (slow) { timer = 0.5; const m = typeof era !== "undefined" && era === "modern"; if (m !== modern) setEra(m); }
    const night = typeof Time !== "undefined" && Time.isNight, now = performance.now() / 1000;
    for (const p of picked) {
      const b = p.b, dist = Math.hypot(player.x - b.x, player.z - b.z);
      if (p.ext && p.ext.era && (p.ext.era === "modern") !== modern) { p.inside = false; continue; }                  // a shop that only exists in the other era
      if (!p.built) { if (slow && dist < 110 && (mode === "walk" || mode === "drive")) build(p); continue; }
      const open = shopOpen(p, night);
      if (p.open !== open || p.night !== night) setOpen(p, open, night);                                     // (a shop you can see from the street is lit or dark as it should be)
      if (dist > 40) continue;
      const inside = Math.abs(player.x - b.x) < b.w / 2 - T && Math.abs(player.z - b.z) < b.d / 2 - T && player.feet < 2;
      if (inside && !p.inside) {
        p.inside = true;
        if (typeof Shopkeep !== "undefined") Shopkeep.visit(info(p).id);
        if (typeof ClassReport !== "undefined") ClassReport.note(`walked into a ${p.kind.name.toLowerCase()}`);
        if (typeof Journal !== "undefined") Journal.shop(p.kind.name);
        if (mode === "walk" && open) {
          Sfx.play("bell");
          const hi = typeof Shopkeep !== "undefined" ? Shopkeep.greet(info(p).id, p.kind) : null;
          const sal = typeof Latin !== "undefined" && Latin.active ? "Salve! " : "";                            // (a Roman greeting, with the Latin names on)
          toast(sal + (hi || `${tr(p.kind.name)}: "${tr(p.kind.line)}" (${tr(p.kind.keeper)})`));
        }
      } else if (!inside && p.inside) p.inside = false;
      if (p.inside && open && p.customers) {                                                                 // a murmur of talk while there are customers
        p.murmur = (p.murmur || 0) - dt;
        if (p.murmur <= 0) { p.murmur = 3.5 + Math.random() * 3; if (p.customers.some((c) => c.state === "here")) Sfx.play("murmur"); }
      }
      if (p.door) p.door.locked = !open && !p.inside;                                                        // a shut shop stays shut (unless you are still inside: then you can leave)
      if (slow && !open && !p.inside && p.doorPos && mode === "walk" && Math.hypot(player.x - p.doorPos[0], player.z - p.doorPos[1]) < 3.6 && now - (p.told || -99) > 45) {
        p.told = now; toast(tr("The {0} is shut for the night. Come back in the morning.").replace("{0}", tr(p.kind.name).toLowerCase()));
      }
      if (open && p.keeper && dist < 25) {                                                                   // the keeper sways a little and waves a hand now and then
        const t = now + p.i;
        p.keeper.parts.armR.rotation.x = Math.sin(t * 1.3) > 0.9 ? -2.2 : Math.sin(t * 0.8) * 0.12;
        p.keeper.parts.armL.rotation.x = Math.sin(t * 0.8 + 1) * 0.1;
      }
      if (p.customers && dist < 30) customers(p, dt, now, night);
    }
  }

  // The shop whose keeper you are standing near (in an open shop), for the F key and the prompt: { p, name, keeper, line, trade, city, id }
  const CITY_OF = { rome: "rome", delhi: "delhi", cancunCentre: "cancun", cancun: "cancun", cancunMaya: "cancun", beijingHall: "beijing", beijingCbd: "beijing" };
  function keeperNear(x, z, feet = 0) {
    if (feet > 2) return null;
    for (const p of picked) {
      if (!p.built || !p.open || !p.keeperW || (p.ext && p.ext.era && (p.ext.era === "modern") !== modern)) continue;
      if (Math.hypot(x - p.keeperW[0], z - p.keeperW[1]) < 3.8 && p.inside) return info(p);
    }
    return null;
  }
  // (the signs are drawn when a shop is built: after Latin names are switched on or off they are drawn again)
  function refreshSigns() {
    for (const p of picked) if (p.built && p.sg) { const old = p.sg.material.map; p.sg.material.map = signTexture((typeof Latin !== "undefined" && Latin.sign(p.kind.name)) || tr(p.kind.name), p.kind.sign); p.sg.material.needsUpdate = true; if (old) old.dispose(); }
  }
  const insideShop = () => { const p = picked.find((q) => q.built && q.inside && q.open); return p ? info(p) : null; };       // the open shop you are in, if any
  const info = (p) => ({ p, id: (p.ext ? p.idk : "rome") + "#" + p.i, name: p.kind.name, keeper: p.kind.keeper, line: p.kind.line, trade: p.kind.trade, city: CITY_OF[p.ext ? p.ext.kinds : "rome"] });
  // the kinds of shop there are in a city in the era you are in (for the errands the keepers ask of you)
  const kindsHere = (c) => picked.filter((p) => CITY_OF[p.ext ? p.ext.kinds : "rome"] === c && !(p.ext && p.ext.era && (p.ext.era === "modern") !== modern)).map((p) => p.kind.name);
  // the free stool nearest to you, if one is within reach
  // the regulars at the tables: a seated customer has a name, and you can ask one to join you at your table (shopkeep.js: dice and xiangqi with a bot)
  const REGULARS = {
    rome: ["Gaius", "Lucia", "Marcus", "Julia", "Titus", "Livia", "Quintus", "Cornelia"], delhi: ["Arjun", "Meera", "Rohan", "Priya", "Kabir", "Anita", "Vikram", "Sana"],
    cancun: ["Mateo", "Lucía", "Diego", "Camila", "Santiago", "Ximena", "Emiliano", "Valeria"], beijing: ["Wei", "Mei", "Jun", "Lan", "Hao", "Xiu", "Bo", "Yan"],
  };
  const nameOf = (p, c) => { const list = REGULARS[CITY_OF[p.ext ? p.ext.kinds : "rome"]] || REGULARS.rome; return list[Math.floor(hash(p.i * 31 + p.customers.indexOf(c), 7) * list.length)]; };
  // who sits at the other stool of the table where seat i is: [{ name, bot: true }]
  function tableMates(p, i) {
    const mate = i ^ 1;
    return p.customers.filter((c) => c.sit && c.seat === mate && c.state === "here").map((c) => ({ name: nameOf(p, c), bot: true, seat: mate }));
  }
  // ask a regular to sit at the other stool of your table (one who is away walks in; the shop's two seated regulars are taken from other tables if need be); release() lets them go again
  function invite(p, i) {
    const mate = i ^ 1;
    if (!p.open || !p.customers || p.seats.length < 4) return;
    let c = p.customers.find((x) => x.sit && x.seat === mate);
    if (!c) {
      c = p.customers.find((x) => x.sit && x.state === "away") || p.customers.find((x) => x.sit && x.seat !== i);
      if (!c) return;
      if (c.state !== "away") { c.fig.g.visible = false; c.state = "away"; if (p.seats[c.seat].by === "npc") p.seats[c.seat].by = null; }
      const st = p.seats[mate]; c.seat = mate; c.along = st.along; c.depth = st.depth; c.yaw = st.yaw;
    }
    c.force = true;
  }
  function release(p) { if (p && p.customers) for (const c of p.customers) c.force = false; }
  function seatNear(x, z, feet = 0) {
    if (feet > 2) return null;
    let best = null, bd = 1.7;
    for (const p of picked) {
      if (!p.built || !p.open || !p.inside || !p.seats) continue;
      p.seats.forEach((s, i) => { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = { p, i, seat: s }; } });
    }
    return best;
  }

  return { setup, register, addHouse, refreshSigns, update, setEra, picked: () => picked, keeperNear, seatNear, tableMates, invite, release, kindsHere, inside: insideShop, infoOf: (p) => info(p), doorOf: (p) => (p.at ? p.at(0, 1.4) : null), kinds: LISTS, get count() { return picked.length; }, get built() { return picked.filter((p) => p.built).length; }, shops: () => picked.map((p) => ({ x: p.b.x, z: p.b.z, name: p.kind.name, late: !!p.kind.late, trade: p.kind.trade, era: (p.ext && p.ext.era) || "", built: p.built, door: p.doorPos || null, keeper: p.keeperW || null, open: p.open, seats: p.seats ? p.seats.length : 0 })) };
})();
