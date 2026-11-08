"use strict";
// The buildings of the middle time (K, the third time of each city: period.js gives the look, this gives the places). Rome c. 1550: St Peter's Basilica half built under its scaffolding and crane,
// Michelangelo's Piazza del Campidoglio with the statue of Marcus Aurelius, and the cows of the Campo Vaccino. Delhi c. 1911: the Coronation Durbar pavilion, the Town Hall with its clock tower,
// and a tram on Chandni Chowk. Spanish Yucatán c. 1700: a whitewashed chapel with a bell gable and a stone cross, a watchtower on the coast, and cattle. Republican Beijing c. 1930: a tram on
// Chang'an Avenue, the Palace Museum's ticket hall with a flagpole, and a rickshaw stand. They appear only in the middle time (nothing changes in the other two). Each stands in the first clear patch of
// ground near its sight (tried in a fixed order, like the guild builds of builds.js: the same place for everybody); when you come close, a note says what it is. Trams run to and from the ends of their street
// and wait if you stand in front. Depends on game.js (scene, city, era, skin, player, started, mode, toast), physics.js (blockedAt, groundAt, dynBlockers) and car.js (Car.model, for the rickshaws).

const PeriodBuildings = (() => {
  const T = THREE;
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const box = (w, h, d, m, x, y, z) => { const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const cyl = (rt, rb, h, m, x, y, z, seg = 14) => { const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  let scene = null, shown = [], built = "", sites = {}, lanes = {}, siteT = 1.5, noteT = 0, clock = 0;
  const noted = new Set();

  // a label that hangs over a building (it shows when you are within 55 m)
  function label(text, sub, h) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "rgba(34,26,16,.88)"; g.strokeStyle = "#e2b955"; g.lineWidth = 6; g.beginPath(); g.roundRect(6, 14, 500, 100, 18); g.fill(); g.stroke();
    g.fillStyle = "#f1ead8"; g.font = "bold 34px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 52, 470);
    g.font = "24px sans-serif"; g.fillStyle = "#e2b955"; g.fillText(sub, 256, 88, 470);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sp.scale.set(8, 2, 1); sp.position.y = h; sp.userData.label = true; return sp;
  }

  // a four-legged animal (a cow, the horse of the statue): the legs swing from the hip (`legs`)
  function quad(body, spot, k = 1) {
    const g = new T.Group(), legs = [], m = lam(body), s = lam(spot);
    g.add(box(0.8 * k, 0.85 * k, 1.8 * k, m, 0, 1.0 * k, 0), box(0.82 * k, 0.4 * k, 0.7 * k, s, 0, 1.1 * k, 0.2 * k));
    g.add(box(0.5 * k, 0.5 * k, 0.7 * k, m, 0, 1.25 * k, -1.15 * k), box(0.36 * k, 0.26 * k, 0.3 * k, s, 0, 1.12 * k, -1.55 * k));
    g.add(box(0.7 * k, 0.1 * k, 0.1 * k, lam(0x2b2118), 0, 1.45 * k, -1.2 * k));
    for (const [x, z] of [[-0.28, -0.7], [0.28, -0.7], [-0.28, 0.7], [0.28, 0.7]]) {
      const p = new T.Group(); p.position.set(x * k, 0.7 * k, z * k); p.add(box(0.2 * k, 0.7 * k, 0.2 * k, m, 0, -0.35 * k, 0)); g.add(p); legs.push(p);
    }
    g.userData.legs = legs; return g;
  }
  // grazing cattle: wander about a pen centred on the building's spot
  function cattle(n, pen) {
    const g = new T.Group(), herd = [];
    const coats = [[0xf0ead8, 0x6b4a2b], [0x7a4a2a, 0xf0ead8], [0xe8dcc0, 0x3a2a1a], [0x3a2a1a, 0xe8dcc0], [0xb88a5a, 0xf0ead8]];
    for (let i = 0; i < n; i++) {
      const c = coats[i % coats.length], a = quad(c[0], c[1], 1);
      const hx = Math.cos(i * 2.4) * pen * 0.55, hz = Math.sin(i * 2.4) * pen * 0.55;
      a.position.set(hx, 0, hz); a.rotation.y = i * 1.7; g.add(a);
      herd.push({ a, tx: hx, tz: hz, wait: i * 0.9, v: 0.45 + (i % 3) * 0.1 });
    }
    g.userData.herd = herd; g.userData.pen = pen; return g;
  }

  // ---- Rome: St Peter's under construction
  function stPeters() {
    const g = new T.Group(), stone = lam(0xd9caa6), pale = lam(0xeee3c8), wood = lam(0x8a6a3e), iron = lam(0x4a4a4a);
    g.add(box(26, 9, 17, stone, 0, 4.5, 0), box(27, 0.8, 18, pale, 0, 9.4, 0));
    for (let i = -4; i <= 4; i++) g.add(cyl(0.55, 0.62, 8.4, pale, i * 2.9, 4.2, 9.2));
    g.add(box(26.8, 1.2, 1.6, pale, 0, 9.0, 9.4), box(8, 0.4, 0.4, pale, 0, 10.7, 9.4));
    const drum = cyl(6.2, 6.5, 6.5, stone, 0, 12.6, -1.5, 28); g.add(drum);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; g.add(cyl(0.3, 0.3, 6, pale, Math.cos(a) * 6.45, 12.6, -1.5 + Math.sin(a) * 6.45, 8)); }
    g.add(cyl(6.6, 6.6, 0.5, pale, 0, 16.0, -1.5, 28));
    const dome = new T.Mesh(new T.SphereGeometry(6.2, 28, 6, 0, Math.PI * 2, 1.15, Math.PI / 2 - 1.15), lam(0xe2d4b2)); dome.position.set(0, 16.2, -1.5); dome.scale.y = 1.15; g.add(dome);   // the part already built
    for (let i = 0; i < 12; i++) {                                                // the ribs of the part still to come
      const r = new T.Mesh(new T.TorusGeometry(6.0, 0.2, 5, 18, Math.PI / 2), wood); r.scale.y = 1.15; r.rotation.y = i / 12 * Math.PI * 2; r.position.set(0, 16.2, -1.5); g.add(r);
    }
    g.add(cyl(0.35, 0.35, 2.2, wood, 0, 23.6, -1.5, 8));
    const ring = (y, R) => { const o = new T.Mesh(new T.TorusGeometry(R, 0.1, 4, 28), wood); o.rotation.x = Math.PI / 2; o.position.set(0, y, -1.5); g.add(o); };
    for (const y of [11, 14.5, 18]) ring(y, 8);                                    // the scaffolding round the drum
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(cyl(0.12, 0.12, 12, wood, Math.cos(a) * 8, 14, -1.5 + Math.sin(a) * 8, 5)); }
    const crane = new T.Group(); crane.position.set(-14.5, 0, 4);                  // a wooden crane with a block of marble on a rope
    crane.add(box(0.7, 22, 0.7, wood, 0, 11, 0));
    const jib = new T.Group(); jib.position.y = 21; jib.add(box(13, 0.45, 0.45, wood, 4.5, 0, 0), box(0.2, 5, 0.2, iron, 9.5, -2.5, 0), box(1.6, 1.1, 1.1, pale, 9.5, -5.3, 0)); crane.add(jib); g.userData.jib = jib;
    g.add(crane);
    for (const [x, z] of [[-18, 6], [-17, 2.5], [-18.4, -1]]) g.add(box(2.2, 1.3, 1.5, pale, x, 0.65, z));   // blocks waiting to be lifted
    return g;
  }
  // ---- Rome: the Piazza del Campidoglio
  let starTex = null;
  function campidoglio() {
    const g = new T.Group(), pale = lam(0xe6d9ba), bronze = lam(0x8a6a2e);
    if (!starTex) {
      const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d");
      x.fillStyle = "#cfc2a2"; x.fillRect(0, 0, 256, 256);
      x.translate(128, 128); x.strokeStyle = "#8d7e5a"; x.lineWidth = 3;
      for (let r = 120; r > 20; r -= 28) { x.beginPath(); x.ellipse(0, 0, r, r * 0.78, 0, 0, 7); x.stroke(); }
      x.fillStyle = "#a89870"; x.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 40 : 110; x.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.78); }
      x.closePath(); x.fill(); x.stroke();
      starTex = new T.CanvasTexture(c);
    }
    const floor = new T.Mesh(new T.CircleGeometry(13, 40), new T.MeshLambertMaterial({ map: starTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.07; floor.scale.set(1, 0.8, 1); g.add(floor);
    g.add(box(2.6, 1.8, 4.2, pale, 0, 0.9, 0)); const horse = quad(0x8a6a2e, 0x7a5a24, 1.5); horse.position.set(0, 1.8, 0); g.add(horse);
    const rider = new T.Group(); rider.add(box(0.8, 1.3, 0.5, bronze, 0, 3.9, 0), new T.Mesh(new T.SphereGeometry(0.3, 10, 8), bronze)); rider.children[1].position.set(0, 4.8, 0); rider.add(box(0.2, 1.2, 0.2, bronze, 0.75, 4.1, -0.3)); g.add(rider);
    g.add(box(8, 8, 15, pale, -17, 4, 0), box(8, 8, 15, pale, 17, 4, 0), box(9, 1, 15.6, lam(0xb8aa86), -17, 8.3, 0), box(9, 1, 15.6, lam(0xb8aa86), 17, 8.3, 0));      // the two palaces at the sides
    for (const sx of [-1, 1]) for (let i = -3; i <= 3; i++) g.add(box(0.7, 6.4, 0.5, lam(0xf0e7cf), sx * 12.8, 3.4, i * 2.1));
    const steps = []; for (let i = 0; i < 4; i++) steps.push(box(16 - i * 2, 0.35, 9 - i * 1.3, lam(0xd6c9a8), 0, 0.2 + i * 0.35, -15 - i * 0.9)); g.add(...steps);          // the ramp of steps
    return g;
  }
  // ---- Delhi: the Coronation Durbar pavilion
  function durbar() {
    const g = new T.Group(), gold = lam(0xd9a928), red = lam(0xa8202b), cream = lam(0xf0e6c8);
    g.add(box(21, 0.3, 21, lam(0xb0262e), 0, 0.15, 0), box(11, 0.7, 7, lam(0x7a1a22), 0, 0.5, -5.5));
    for (const [x, z] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, -9], [0, 9], [-9, 0], [9, 0]]) g.add(cyl(0.22, 0.28, 8, gold, x, 4, z, 8));
    const roof = new T.Mesh(new T.ConeGeometry(15.5, 5.5, 4, 1), red); roof.rotation.y = Math.PI / 4; roof.position.y = 10.7; roof.castShadow = true; g.add(roof);
    g.add(cyl(0.12, 0.12, 3, gold, 0, 14.6, 0, 6), new T.Mesh(new T.SphereGeometry(0.5, 10, 8), gold)); g.children[g.children.length - 1].position.y = 16.2;
    for (let i = -10; i <= 10; i += 2) for (const [x, z, ry] of [[i, -10.2, 0], [i, 10.2, 0], [-10.2, i, 1.5708], [10.2, i, 1.5708]]) { const v = box(1.7, 1.1, 0.12, i % 4 ? gold : cream, x, 7.4, z); v.rotation.y = ry; g.add(v); }   // the scalloped edge
    const throne = box(1.6, 0.5, 1.2, gold, 0, 1.2, -7.5), back = box(1.7, 2.6, 0.2, gold, 0, 2.8, -8.2), canopy = box(2.6, 0.2, 2.2, red, 0, 4.4, -7.7); g.add(throne, back, canopy);
    for (const [x, z] of [[-1.2, -8.6], [1.2, -8.6], [-1.2, -6.8], [1.2, -6.8]]) g.add(cyl(0.07, 0.07, 3.4, gold, x, 2.8, z, 6));
    for (const sx of [-1, 1]) { g.add(box(5, 3.6, 5, cream, sx * 15.5, 1.8, -3)); const t = new T.Mesh(new T.ConeGeometry(4, 2.4, 4), red); t.rotation.y = Math.PI / 4; t.position.set(sx * 15.5, 4.8, -3); g.add(t); }   // the tents of the nobles
    return g;
  }
  // ---- Delhi: the Town Hall with a clock tower
  function clockTower() {
    const g = new T.Group(), brick = lam(0xa8493a), white = lam(0xeee8d6), slate = lam(0x4a4f5a);
    g.add(box(4.6, 15, 4.6, brick, 0, 7.5, 0));
    for (const y of [4, 9, 13.2]) g.add(box(4.9, 0.4, 4.9, white, 0, y, 0));
    const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "#f4f1e6"; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill(); x.strokeStyle = "#222"; x.lineWidth = 4; x.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.beginPath(); x.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); x.lineTo(64 + Math.cos(a) * 57, 64 + Math.sin(a) * 57); x.stroke(); }
    x.lineWidth = 6; x.beginPath(); x.moveTo(64, 64); x.lineTo(64, 24); x.stroke(); x.lineWidth = 4; x.beginPath(); x.moveTo(64, 64); x.lineTo(92, 78); x.stroke();
    const face = new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv) });
    for (const [px, pz, ry] of [[0, 2.36, 0], [0, -2.36, Math.PI], [2.36, 0, Math.PI / 2], [-2.36, 0, -Math.PI / 2]]) { const f = new T.Mesh(new T.CircleGeometry(1.7, 20), face); f.position.set(px, 11.2, pz); f.rotation.y = ry; g.add(f); }
    const cap = new T.Mesh(new T.ConeGeometry(3.6, 4.2, 4), slate); cap.rotation.y = Math.PI / 4; cap.position.y = 17.1; cap.castShadow = true; g.add(cap); g.add(cyl(0.06, 0.06, 2.2, lam(0x222222), 0, 20.2, 0, 5));
    g.add(box(18, 7, 8, lam(0xf0e3c2), 11.5, 3.5, 1), box(18.6, 0.7, 8.6, white, 11.5, 7.3, 1));
    for (let i = 0; i < 6; i++) { const w = box(1.5, 3.4, 0.2, lam(0x3a2a22), 4.2 + i * 2.9 + 1.4, 2.6, 5.05); g.add(w); const a = new T.Mesh(new T.CircleGeometry(0.75, 10, 0, Math.PI), lam(0x3a2a22)); a.position.set(4.2 + i * 2.9 + 1.4, 4.3, 5.06); g.add(a); }
    return g;
  }
  // ---- Cancún: the chapel and its cross
  function chapel() {
    const g = new T.Group(), white = lam(0xf2ecd9), tile = lam(0xb5532f), dark = lam(0x2a2018), stone = lam(0xb4aa94);
    g.add(box(8, 6, 13, white, 0, 3, 0), box(8.4, 0.4, 13.4, stone, 0, 0.2, 0));
    const rs = new T.Shape(); rs.moveTo(-4.7, 0); rs.lineTo(4.7, 0); rs.lineTo(0, 2.8); rs.closePath();
    const roof = new T.Mesh(new T.ExtrudeGeometry(rs, { depth: 13.8, bevelEnabled: false }), tile); roof.position.set(0, 6, -6.9); roof.castShadow = true; g.add(roof);
    g.add(box(8.2, 3.3, 0.9, white, 0, 7.6, 6.2), box(1.8, 2.2, 1.0, dark, 0, 7.6, 6.25));
    const bell = new T.Mesh(new T.ConeGeometry(0.55, 0.9, 10, 1, true), lam(0xc9a227)); bell.position.set(0, 7.3, 6.25); g.add(bell);
    g.add(box(0.2, 1.6, 0.2, white, 0, 10.0, 6.2), box(1.0, 0.2, 0.2, white, 0, 10.3, 6.2));
    g.add(box(2.2, 3.4, 0.2, dark, 0, 1.9, 6.55)); const arch = new T.Mesh(new T.CircleGeometry(1.1, 12, 0, Math.PI), dark); arch.position.set(0, 3.6, 6.56); g.add(arch);
    for (const sx of [-1, 1]) for (const z of [-5, 0, 5]) g.add(box(0.8, 4.4, 1.0, white, sx * 4.2, 2.2, z));   // buttresses
    for (const sx of [-1, 1]) g.add(box(1.4, 0.9, 0.2, lam(0x1a1a20), sx * 4.05, 4, -2.4));
    const cross = new T.Group(); cross.position.set(0, 0, 14);                          // the stone cross on its steps
    for (let i = 0; i < 3; i++) cross.add(box(3.2 - i, 0.3, 3.2 - i, stone, 0, 0.15 + i * 0.3, 0));
    cross.add(box(0.4, 3.6, 0.4, stone, 0, 2.7, 0), box(1.6, 0.4, 0.4, stone, 0, 3.6, 0)); g.add(cross);
    return g;
  }
  // ---- Cancún: the coastal watchtower
  function watchtower() {
    const g = new T.Group(), stone = lam(0xb8ad94), wood = lam(0x7a5a34);
    g.add(cyl(2.3, 3.2, 11, stone, 0, 5.5, 0, 12), cyl(3.0, 2.4, 0.9, stone, 0, 11.4, 0, 12));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(box(0.8, 0.9, 0.8, stone, Math.cos(a) * 2.6, 12.3, Math.sin(a) * 2.6)); }
    g.add(box(0.9, 1.6, 0.2, lam(0x1a1a1a), 0, 2.3, 3.1));
    g.add(box(0.2, 3, 0.2, wood, 0, 13.9, 0), box(1.6, 0.9, 0.1, lam(0xc9a227), 0.9, 15, 0));
    const fire = new T.Mesh(new T.ConeGeometry(0.7, 1.7, 8), new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9, depthWrite: false })); fire.position.set(-1.3, 13.4, 0); fire.userData.fire = true; g.add(fire);
    return g;
  }
  // ---- Beijing: the Palace Museum's ticket hall and flagpole
  function ticketHall() {
    const g = new T.Group(), brick = lam(0xb9b09c), roof = lam(0x3e5a4a);
    g.add(box(11, 6.4, 7, brick, 0, 3.2, 0), box(11.8, 0.6, 7.8, lam(0x8a7c64), 0, 6.7, 0), box(10, 0.3, 6.5, roof, 0, 7.15, 0));
    for (const x of [-3.5, 0, 3.5]) { g.add(box(1.8, 3, 0.2, lam(0x2a2018), x, 2.1, 3.55)); const a = new T.Mesh(new T.CircleGeometry(0.9, 10, 0, Math.PI), lam(0x2a2018)); a.position.set(x, 3.6, 3.56); g.add(a); }
    for (const x of [-4, 4]) g.add(box(1.4, 1.6, 0.2, lam(0x1a2a3a), x, 4.7, 3.55));
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96; const x = cv.getContext("2d");
    x.fillStyle = "#8f1d1d"; x.fillRect(0, 0, 512, 96); x.fillStyle = "#f1e2a8"; x.font = "bold 52px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("故宫博物院 · Palace Museum", 256, 50, 490);
    const sign = new T.Mesh(new T.PlaneGeometry(9, 1.7), new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv) })); sign.position.set(0, 5.5, 3.58); g.add(sign);
    g.add(cyl(0.12, 0.16, 16, lam(0xe8e8e8), 9, 8, 2, 8));
    const flag = new T.Group(); flag.position.set(9.0, 14.6, 2); flag.add(box(0.05, 2.1, 3.2, lam(0xc0262b), 0, 0, 1.7), box(0.06, 1.0, 1.5, lam(0x1d3f8f), 0, 0.55, 0.95), box(0.07, 0.4, 0.4, lam(0xf4f4f4), 0, 0.55, 0.95)); g.userData.flag = flag; g.add(flag);
    return g;
  }
  // ---- Beijing: the rickshaw stand
  function rickshawStand() {
    const g = new T.Group(), cols = [0x1d1d22, 0x2b4a2b, 0x7a1f1f, 0x1d3a5a];
    for (let i = 0; i < 4; i++) { const r = (typeof Car !== "undefined" && Car.model) ? Car.model("rickshaw", cols[i]) : new T.Group(); r.position.set((i - 1.5) * 2.4, 0, 0); r.rotation.y = 0.12 * (i - 1.5); g.add(r); }
    const post = cyl(0.1, 0.1, 3.2, lam(0x5a3a22), 5.2, 1.6, 0, 6), board = box(2.6, 1.0, 0.1, lam(0xb0262e), 5.2, 3.3, 0); g.add(post, board);
    return g;
  }
  // ---- the trams
  function tramCar(body) {
    const g = new T.Group(), cream = lam(0xeee6cc);
    g.add(box(2.5, 2.4, 9, lam(body), 0, 1.9, 0), box(2.55, 0.5, 9.05, cream, 0, 1.0, 0), box(2.6, 0.25, 9.3, lam(0x2a2a2a), 0, 3.25, 0));
    for (const sx of [-1, 1]) for (let i = -3; i <= 3; i++) g.add(box(0.05, 0.9, 0.9, lam(0x1a2a34), sx * 1.27, 2.4, i * 1.15));
    for (const z of [-3.3, 3.3]) { g.add(box(2.0, 0.3, 1.3, lam(0x1d1d1d), 0, 0.45, z)); for (const sx of [-1, 1]) { const w = cyl(0.38, 0.38, 0.1, lam(0x2a2a2a), sx * 0.95, 0.4, z, 10); w.rotation.z = Math.PI / 2; g.add(w); } }
    g.add(box(0.06, 0.06, 3.4, lam(0x222222), 0, 3.9, 0.9)); g.add(box(0.1, 1.4, 0.1, lam(0x222222), 0, 3.6, 0.2));
    g.add(box(1.4, 0.5, 0.1, lam(0xf4e8a8), 0, 2.9, -4.52));
    return g;
  }
  function tramLine(a, b, z, body) {                                   // rails between x = a and x = b, and a car that runs to and fro
    const g = new T.Group(); g.userData.tram = { a, b, z, x: a + 5, dir: 1, wait: 0, car: tramCar(body) };
    const rail = lam(0x6a6a6a);
    for (const dz of [-0.75, 0.75]) { const r = box(b - a, 0.06, 0.1, rail, 0, 0.06, dz); r.position.x = (a + b) / 2; g.add(r); }
    g.userData.tram.car.rotation.y = -Math.PI / 2; g.add(g.userData.tram.car); return g;
  }

  // what each city has: the sight it stands near, the builder, the ground it needs (feet = [dx, dz] points that must be clear and level), the solid circles ([dx, dz, r]) and the note
  const ITEMS = [
    { id: "peters", lh: 27, city: "rome", near: "pantheon", make: stPeters, feet: [[-14, -9], [14, -9], [-14, 9], [14, 9], [0, 0], [-18, 5]], circ: [[0, -1.5, 6.5], [-8, 0, 5], [8, 0, 5], [-14.5, 4, 1]], rads: [90, 110, 130, 150], label: "St Peter's Basilica", sub: "being built since 1506",
      text: "Michelangelo's dome rises on its drum, and the scaffolding and the crane stand around it. It will take until 1590 to finish." },
    { id: "campidoglio", lh: 13, city: "rome", near: "capitolium", make: campidoglio, feet: [[0, 0], [-10, 0], [10, 0], [0, 8], [0, -8]], circ: [[0, 0, 2.2], [-17, 0, 6], [17, 0, 6]], rads: [8, 16, 26, 40], label: "Piazza del Campidoglio", sub: "Michelangelo, c. 1550",
      text: "Pope Paul III has had the ancient bronze statue of the emperor Marcus Aurelius moved here, and Michelangelo is designing the square around it." },
    { id: "cows", lh: 4, city: "rome", near: "forum", make: () => cattle(6, 18), feet: [[0, 0]], circ: [], rads: [18, 26, 36, 50], label: "Campo Vaccino", sub: "the cow field",
      text: "The Forum is called the Campo Vaccino, the cow field: cattle graze between the broken columns." },
    { id: "durbar", lh: 19, city: "delhi", near: "d-kartavya", make: durbar, feet: [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, 0], [-16, -3], [16, -3]], circ: [[-9, -9, 0.7], [9, -9, 0.7], [-9, 9, 0.7], [9, 9, 0.7], [0, -7.5, 1.6]], rads: [10, 20, 35, 55, 80], label: "The Durbar pavilion", sub: "December 1911",
      text: "The Coronation Durbar of December 1911 was held on a plain outside the city. King George V and Queen Mary sat under a gold and crimson canopy while the princes of India paid their respects, and the king announced that the capital would move to Delhi. New Delhi will be built on this plain." },
    { id: "clock", lh: 22, city: "delhi", near: "d-chandni", make: clockTower, feet: [[0, 0], [2, 0], [-2, 0], [8, 2], [14, 2], [20, 2]], circ: [[0, 0, 3.2], [11.5, 1, 5], [17, 1, 4]], rads: [10, 16, 24, 34, 46], label: "The Town Hall", sub: "built in the 1860s",
      text: "The Town Hall and its clock tower stand on Chandni Chowk. The city's bells and clocks follow British time now." },
    { id: "tram-delhi", city: "delhi", lane: ["d-chandni", 5430, 5920], skip: 8, label: "Chandni Chowk tram", sub: "electric since 1908", body: 0x2f5a3a,
      text: "An electric tram runs along Chandni Chowk, through crowds of people, bullock carts and rickshaws." },
    { id: "chapel", lh: 13, city: "cancun", near: "c-castillo", make: chapel, feet: [[-4, -6], [4, -6], [-4, 6], [4, 6], [0, 14]], circ: [[0, 0, 5], [0, 14, 1.6]], rads: [80, 100, 120, 150], label: "The Spanish chapel", sub: "Franciscan, c. 1700",
      text: "The Franciscan friars built a whitewashed chapel with a bell gable beside the old Maya city, with a stone cross in front. Many Maya families come here on Sundays." },
    { id: "watch", lh: 17, city: "cancun", near: "c-beach", make: watchtower, feet: [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]], circ: [[0, 0, 3.2]], rads: [6, 12, 20, 30, 44], label: "The coastal watchtower", sub: "against pirates",
      text: "Spanish soldiers watch the sea from this tower and light the fire on top to warn the villages when English or Dutch pirate ships come near." },
    { id: "cattle", lh: 4, city: "cancun", near: "c-casita", make: () => cattle(5, 16), feet: [[0, 0]], circ: [], rads: [20, 30, 40, 55], label: "The cattle", sub: "brought from Spain",
      text: "The Spanish brought cows, pigs and horses, animals that did not exist in the Americas before 1492. They graze in the forest clearings." },
    { id: "ticket", lh: 10, city: "beijing", near: "b-meridian", make: ticketHall, feet: [[-5, -3], [5, -3], [-5, 3], [5, 3], [9, 2]], circ: [[0, 0, 5.5], [9, 2, 0.4]], rads: [20, 28, 38, 50, 64], label: "Palace Museum ticket hall", sub: "open to all since 1925",
      text: "Since 1925 the Forbidden City has been the Palace Museum. Anyone may buy a ticket here and walk through the gates, which were closed to ordinary people for five hundred years." },
    { id: "rickshaws", lh: 5, city: "beijing", near: "b-square", make: rickshawStand, feet: [[-3.6, 0], [3.6, 0], [0, 0], [5.2, 0]], circ: [], rads: [24, 32, 44, 58], label: "Rickshaw stand", sub: "a ride for a few coppers",
      text: "Rickshaw pullers wait for passengers in the square. Trams and rickshaws are how people in Beiping get around in 1930." },
    { id: "tram-beijing", city: "beijing", lane: ["b-tiananmen", 17640, 18360], label: "Chang'an Avenue tram", sub: "since 1924", body: 0x7a2323,
      text: "Trams have run along the avenue past the Gate of Heavenly Peace since 1924." },
  ];

  // ---- where each one stands
  const clearAtZ = (x, z, g0) => { const y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 1.2 && !blockedAt(x, z, y); };
  function laneFor(it) {                                            // a straight stretch of street for a tram: the z with the longest clear run near the sight
    const lm = ALL_LANDMARKS.find((l) => l.id === it.lane[0]); if (!lm) return null;
    const [, a, b] = it.lane; let best = null;
    const dzs = []; for (let dz = -30; dz <= 60; dz += 3) if (Math.abs(dz) >= (it.skip || 0)) dzs.push(dz);
    for (const dz of dzs.sort((p, q) => Math.abs(p) - Math.abs(q))) {
      const z = (lm.stand ? lm.stand[1] : lm.z) + dz, g0 = groundAt((a + b) / 2, z);
      let run = 0, start = a, found = [a, a];
      for (let x = a; x <= b; x += 4) {
        const ok = [-2, 0, 2].every((o) => clearAtZ(x, z + o, g0));
        if (ok) { if (!run) start = x; run += 4; if (run > found[1] - found[0]) found = [start, x]; } else run = 0;
      }
      if (!best || found[1] - found[0] > best.len) best = { z, a: found[0], b: found[1], len: found[1] - found[0] };
    }
    return best && best.len >= 60 ? best : null;
  }
  function pickSite(it, taken, ways) {
    const lm = ALL_LANDMARKS.find((l) => l.id === it.near); if (!lm) return null;
    const [bx, bz] = lm.stand || [lm.x, lm.z], g0 = groundAt(bx, bz);
    for (const rad of it.rads) {
      for (let a = 0; a < 16; a++) {
        const cx = bx + Math.cos(a * Math.PI / 8) * rad, cz = bz + Math.sin(a * Math.PI / 8) * rad;
        if (taken.some((t) => Math.hypot(t[0] - cx, t[1] - cz) < 30)) continue;
        if (ways.some((w) => Math.abs(cz - w.z) < 24 && cx > w.a - 24 && cx < w.b + 24)) continue;                // (not on a tram street)
        const yaw = Math.atan2(lm.x - cx, lm.z - cz), s = Math.sin(yaw), c = Math.cos(yaw);       // the front (+z) faces the sight
        if (it.feet.every(([dx, dz]) => { const x = cx + dx * c + dz * s, z = cz - dx * s + dz * c, y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 3 && !blockedAt(x, z, y); })) return [cx, cz, yaw];
      }
    }
    return null;
  }
  function pickSites(c) {
    const saved = dynBlockers.map((d) => d.on); dynBlockers.forEach((d) => { d.on = false; });
    const out = {}, taken = [];
    try {
      const ways = [];
      for (const it of ITEMS.filter((i) => i.city === c && i.lane)) { lanes[it.id] = laneFor(it); if (lanes[it.id]) ways.push(lanes[it.id]); }
      for (const it of ITEMS.filter((i) => i.city === c && !i.lane)) {
        const p = pickSite(it, taken, ways); if (p) { out[it.id] = p; taken.push(p); }
      }
    } finally { dynBlockers.forEach((d, i) => { d.on = saved[i]; }); }
    return out;
  }

  // ---- showing them
  function clearShown() { for (const s of shown) { scene.remove(s.g); for (const d of s.dyn) { const i = dynBlockers.indexOf(d); if (i >= 0) dynBlockers.splice(i, 1); } } shown = []; }
  function rebuild() {
    clearShown(); built = `${city}|${active() ? 1 : 0}|${sites[city] ? 1 : 0}`;
    if (!active() || !sites[city]) return;
    for (const it of ITEMS.filter((i) => i.city === city)) {
      const dyn = [], g = new T.Group();
      if (it.lane) {
        const ln = lanes[it.id]; if (!ln) continue;
        const t = tramLine(ln.a, ln.b, ln.z, it.body); g.add(t); g.position.set(0, 0, ln.z);
        t.children.forEach((o) => { o.position.y += groundAt((ln.a + ln.b) / 2, ln.z); });
        g.userData.tramRef = t.userData.tram; g.userData.anchor = [(ln.a + ln.b) / 2, ln.z];
        scene.add(g); shown.push({ it, g, dyn, at: [(ln.a + ln.b) / 2, ln.z] });
        continue;
      }
      const p = sites[city][it.id]; if (!p) continue;
      const m = it.make(); m.position.y = 0; g.add(m); g.position.set(p[0], groundAt(p[0], p[1]), p[1]); g.rotation.y = p[2];
      const sp = label(tr(it.label), tr(it.sub), (it.lh || 8)); sp.visible = false; g.add(sp);
      const s = Math.sin(p[2]), c = Math.cos(p[2]);
      for (const [dx, dz, r] of it.circ) { const x = p[0] + dx * c + dz * s, z = p[1] - dx * s + dz * c; const d = { x, z, r, y1: groundAt(x, z) + 8, t: 1, on: true, era: undefined }; dynBlockers.push(d); dyn.push(d); }
      scene.add(g); shown.push({ it, g, dyn, at: [p[0], p[1]], m, sp });
    }
  }
  const active = () => typeof started !== "undefined" && started && typeof skin !== "undefined" && skin && era === "ancient";

  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    clock += dt;
    if (!sites[city] && active()) { siteT -= dt; if (siteT <= 0 && mode === "walk") { sites[city] = pickSites(city); siteT = 1.5; } }
    const key = `${city}|${active() ? 1 : 0}|${sites[city] ? 1 : 0}`;
    if (key !== built) rebuild();
    if (!shown.length) return;
    for (const s of shown) {
      const d = Math.hypot(player.x - s.at[0], player.z - s.at[1]);
      if (s.sp) s.sp.visible = d < 55;
      const g = s.m || s.g;
      if (d > 220) continue;                                                           // far away: nothing moves
      if (g.userData.jib) g.userData.jib.rotation.y = Math.sin(clock * 0.2) * 1.1;
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(clock * 2.1) * 0.18;
      g.traverse((o) => { if (o.userData.fire) { o.scale.y = 1 + Math.sin(clock * 13) * 0.18; o.scale.x = 1 + Math.sin(clock * 9) * 0.1; } });
      const herd = g.userData.herd;
      if (herd) for (const h of herd) {
        h.wait -= dt;
        const a = h.a, dx = h.tx - a.position.x, dz = h.tz - a.position.z, dist = Math.hypot(dx, dz);
        if (h.wait <= 0 && dist > 0.4) {
          a.rotation.y = Math.atan2(-dx, -dz); a.position.x += dx / dist * h.v * dt; a.position.z += dz / dist * h.v * dt;
          a.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(clock * 4 + (i % 2 ? Math.PI : 0)) * 0.35; });
        } else {
          a.userData.legs.forEach((l) => { l.rotation.x = 0; });
          if (h.wait <= 0) { const ang = Math.random() * 6.28, rr = Math.random() * g.userData.pen; const tx = Math.cos(ang) * rr, tz = Math.sin(ang) * rr, sy = s.g.rotation.y, wx = s.g.position.x + tx * Math.cos(sy) + tz * Math.sin(sy), wz = s.g.position.z - tx * Math.sin(sy) + tz * Math.cos(sy);
          if (!blockedAt(wx, wz, groundAt(wx, wz)) && groundAt(wx, wz) > -0.02) { h.tx = tx; h.tz = tz; }
          h.wait = 2 + Math.random() * 5; }
        }
        a.position.y = groundAt(s.g.position.x + a.position.x * Math.cos(s.g.rotation.y) + a.position.z * Math.sin(s.g.rotation.y), s.g.position.z - a.position.x * Math.sin(s.g.rotation.y) + a.position.z * Math.cos(s.g.rotation.y)) - s.g.position.y;
      }
      const tm = s.g.userData.tramRef;
      if (tm) {
        const ahead = (player.x - tm.x) * tm.dir;
        if (tm.wait > 0) tm.wait -= dt;
        else if (ahead > 0 && ahead < 11 && Math.abs(player.z - tm.z) < 3) { /* someone stands in front: it waits */ }
        else { tm.x += tm.dir * 6 * dt; if (tm.x > tm.b - 5.5) { tm.x = tm.b - 5.5; tm.dir = -1; tm.wait = 5; } else if (tm.x < tm.a + 5.5) { tm.x = tm.a + 5.5; tm.dir = 1; tm.wait = 5; } }
        tm.car.position.set(tm.x, groundAt(tm.x, tm.z), 0);
        tm.car.rotation.y = tm.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    }
    noteT -= dt;
    if (noteT <= 0) {                                                                  // when you come close to one, a note says what it is (once)
      noteT = 0.6;
      for (const s of shown) {
        if (noted.has(s.it.id) || Math.hypot(player.x - s.at[0], player.z - s.at[1]) > (s.it.lane ? 14 : 22)) continue;
        noted.add(s.it.id); toast(`${s.it.lane ? "🚋" : "🏛"} ${tr(s.it.label)}: ${tr(s.it.text)}`); break;
      }
    }
  }
  function build(sc) { scene = sc; }
  return { build, update, get shown() { return shown; }, get sites() { return sites; }, get lanes() { return lanes; }, ITEMS };
})();
