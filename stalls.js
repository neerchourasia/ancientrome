"use strict";
// The market square: a paved square with five stalls (food, clothes, animals and rides, builder, healer) in Rome, south of
// the Forum, and in Old Delhi, on the open square before the Lahori Gate. Walk up to a stall and press F to shop (the shop
// itself is in market.js). Each stall has a vendor who calls out as you come near. Depends on world.js (canvasTex, MAP_SHAPES),
// physics.js, tax.js (Speech) and market.js at run time.

const Stalls = (() => {
  const T = THREE;
  const BOXG = new T.BoxGeometry(1, 1, 1), CYLG = new T.CylinderGeometry(1, 1, 1, 14);
  const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  const SPACING = 10, SPOTS = [];     // one entry per stall: { id, name, city, x, z, vendor, said }

  const SITES = {
    rome: { x: 170, z: 62 },
    delhi: { x: 6000 - 50, z: 60 },
    cancun: { x: 12000, z: 150 },
  };

  // what each stall is called, what the vendor shouts, the colour of its awning, and the goods on its counter
  const DEFS = [
    { id: "food", sign: "FOOD", sub: "hot and fresh", color: ["#b3262b", "#f1ead8"], robe: 0xb3262b, goods: [0xd9a05b, 0xe8c27a, 0x8a5a2b, 0xc9743a],
      say: { rome: ["Fresh bread! Hot from the oven!", "Honey cakes, three for a denarius!"], delhi: ["Garam garam! Come and taste!", "Fresh jalebi, hot hot!"], cancun: ["¡Tacos, tamales, ceviche!", "Fresh from the fire! ¡Pruébalo!"] } },
    { id: "clothes", sign: "CLOTHES", sub: "to wear", color: ["#2f6b8f", "#f1ead8"], robe: 0x2f6b8f, goods: [0xb3262b, 0x6a2c8a, 0xd9b640, 0x2f8f4a],
      say: { rome: ["Cloaks and crowns fit for a senator!", "Look at this purple, friend!"], delhi: ["Silk and gold, come and see!", "Best cloth in Chandni Chowk!"], cancun: ["Embroidered huipiles, fine cotton!", "Hats for the sun, amigo!"] } },
    { id: "pets", sign: "ANIMALS", sub: "and rides", color: ["#2f8f4a", "#f1ead8"], robe: 0x2f8f4a, goods: [0x8a6a3a, 0xa88858, 0x6a4c2a],
      say: { rome: ["Hounds, eagles and carts for sale!", "A loyal friend for the road!"], delhi: ["Elephants and carts, finest in Delhi!", "Come, look at my animals!"], cancun: ["Parrots, monkeys and good dogs!", "A friend for the jungle road!"] } },
    { id: "builder", sign: "BUILDER", sub: "houses and decor", color: ["#d9791f", "#f1ead8"], robe: 0xd9791f, goods: [0xb86a4a, 0xa0a0a0, 0xc9b27a, 0x8a5a2b],
      say: { rome: ["A finer house? I can build it!", "Mosaics and banners for your door!"], delhi: ["A grand haveli? I will build it!", "Carved doors and fine floors!"], cancun: ["Lime plaster for your walls!", "Hammocks and carved doors!"] } },
    { id: "healer", sign: "HEALER", sub: "and trainer", color: ["#7a2d8a", "#f1ead8"], robe: 0x7a2d8a, goods: [0x3aa557, 0xc0392b, 0xe2b955, 0x2c7fe0],
      say: { rome: ["Salves for every wound!", "Train with me and hit harder!"], delhi: ["Herbs and balms for every ache!", "Strong horses, strong warriors!"], cancun: ["Herbs and balms from the jungle!", "The healer will cure you!"] } },
  ];
  const NAMES = { weapons: "armourer's stall", food: "food stall", clothes: "clothier", pets: "animals and rides stall", builder: "builder's stall", healer: "healer's stall" };

  const tex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 4; return t; };
  const stripes = (a, b) => tex(64, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 8, 0, 8, h); } });
  function sign(parent, x, y, z, w, h, text, sub) {
    const t = tex(256, 80, (g, ww, hh) => {
      g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, ww, hh); g.strokeStyle = "#f2d98a"; g.lineWidth = 4; g.strokeRect(4, 4, ww - 8, hh - 8);
      g.fillStyle = "#f2d98a"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "bold 34px sans-serif"; g.fillText(text, ww / 2, 30); g.font = "bold 19px sans-serif"; g.fillText(sub, ww / 2, 58);
    });
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshLambertMaterial({ map: t, side: T.DoubleSide, emissive: 0x201808 }));
    m.position.set(x, y, z); m.rotation.y = Math.PI; parent.add(m); // faces north, towards the customers
  }
  function box(parent, x, y0, z, w, h, d, mat, solid) {
    const m = new T.Mesh(BOXG, mat); m.scale.set(w, h, d); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (solid) addBlockerBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, y0 + h);
    return m;
  }
  function cyl(parent, x, y0, z, r, h, mat, solid) {
    const m = new T.Mesh(CYLG, mat); m.scale.set(r, h, r); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; parent.add(m);
    if (solid) addBlockerCircle(x, z, r, y0, y0 + h);
    return m;
  }

  // a vendor behind the counter: a robe, a head and a hat, turning a little to look about
  function vendor(parent, x, z, robe, hat) {
    const g = new T.Group(); g.position.set(x, 0, z); parent.add(g);
    cyl(g, 0, 0, 0, 0.36, 1.2, lam(robe));
    cyl(g, 0, 1.2, 0, 0.3, 0.45, lam(robe));
    const head = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), lam(0xd8a77a)); head.position.set(0, 2.0, 0); head.castShadow = true; g.add(head);
    const cap = new T.Mesh(new T.CylinderGeometry(0.2, 0.26, 0.16, 12), lam(hat)); cap.position.set(0, 2.2, 0); g.add(cap);
    for (const sx of [-1, 1]) { const arm = new T.Mesh(CYLG, lam(robe)); arm.scale.set(0.09, 0.6, 0.09); arm.position.set(sx * 0.4, 1.3, -0.15); arm.rotation.x = -0.9; g.add(arm); }
    return g;
  }

  function goodsFor(g, def, x, z) {
    const a = def.goods;
    if (def.id === "food") {
      for (let i = 0; i < 4; i++) cyl(g, x - 2.4 + i * 1.6, 1.05, z, 0.5, 0.35, lam(a[i % a.length]));
      cyl(g, x + 3.0, 1.05, z + 0.3, 0.3, 0.5, lam(0x444444));
    } else if (def.id === "clothes") {
      for (let i = 0; i < 4; i++) box(g, x - 2.4 + i * 1.6, 1.05, z, 1.1, 0.25 + 0.12 * (i % 2), 0.9, lam(a[i % a.length]));
      for (let i = 0; i < 3; i++) box(g, x - 2 + i * 2, 1.9, z - 1.1, 0.7, 1.4, 0.06, lam(a[(i + 1) % a.length]), false);
    } else if (def.id === "pets") {
      box(g, x - 1.8, 1.05, z, 1.4, 0.9, 1.0, lam(a[0])); box(g, x + 0.4, 1.05, z, 1.0, 0.5, 1.0, lam(a[1]));
      box(g, x + 2.2, 0, z + 1.6, 1.8, 0.7, 1.0, lam(a[2]));
    } else if (def.id === "builder") {
      for (let i = 0; i < 4; i++) box(g, x - 2.4 + i * 1.6, 1.05, z, 1.2, 0.4, 0.7, lam(a[i % a.length]));
      box(g, x + 0.2, 1.45, z, 1.6, 0.3, 0.6, lam(a[1]));
    } else {
      for (let i = 0; i < 5; i++) cyl(g, x - 2.4 + i * 1.2, 1.05, z, 0.22, 0.55 + 0.1 * (i % 2), lam(a[i % a.length]));
    }
  }

  // Build the square at world (cx, cz): the paving, a well in the middle and the five stalls along the south side
  function build(parent, cx, cz, where) {
    const g = new T.Group(); parent.add(g);
    const delhi = where === "delhi", cancun = where === "cancun";
    const paving = new T.Mesh(new T.PlaneGeometry(62, 26), lam(delhi ? 0xc2a77a : cancun ? 0xe4dcc3 : 0xb7a98b));
    paving.rotation.x = -Math.PI / 2; paving.position.set(cx, 0.06, cz); paving.receiveShadow = true; g.add(paving);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: cx - 31, x1: cx + 31, z0: cz - 13, z1: cz + 13, c: "#d9b46a" });
    // the well, with a little roof on two posts
    cyl(g, cx, 0, cz - 1, 1.7, 0.9, lam(0x8a8478), true);
    cyl(g, cx, 0.9, cz - 1, 1.3, 0.05, lam(0x1a3a52));
    for (const sx of [-1, 1]) box(g, cx + sx * 1.5, 0, cz - 1, 0.18, 2.8, 0.18, lam(0x6a4c2a));
    box(g, cx, 2.8, cz - 1, 3.8, 0.18, 1.6, lam(delhi ? 0xa8282b : 0x9a4a2a));
    // a bench each side of the well
    for (const sx of [-1, 1]) box(g, cx + sx * 9, 0, cz - 1, 3.2, 0.5, 0.8, lam(0x6a4c2a));

    // the job board, at the east end of the square: notices for the baker, scribe, stable hand and messenger
    {
      const bx = cx + 28, bz = cz + 4.5;
      for (const sx of [-1.6, 1.6]) box(g, bx + sx, 0, bz, 0.22, 3.2, 0.22, lam(0x5a4028), true);
      box(g, bx, 1.1, bz, 3.8, 1.9, 0.18, lam(0x7a5a34), false);
      for (let k = 0; k < 6; k++) box(g, bx - 1.4 + (k % 3) * 1.4, 1.5 + Math.floor(k / 3) * 0.8, bz - 0.12, 0.9, 0.6, 0.03, lam([0xf1ead8, 0xe8d9a8, 0xf3e2c0][k % 3]), false);
      sign(g, bx, 3.6, bz - 0.2, 3.4, 0.9, "WORK", "jobs wanted");
      SPOTS.push({ id: "board", name: "job board", city: where, x: bx, z: bz - 2.6, r: 3.2, vendor: { x: bx, z: bz }, group: new T.Group(), say: [], t: 1e9, ph: 0 });
    }
    DEFS.forEach((def, i) => {
      const x = cx + (i - 2) * SPACING, z = cz + 9; // the counter
      const awnMat = new T.MeshLambertMaterial({ map: stripes(def.color[0], def.color[1]), side: T.DoubleSide });
      box(g, x, 0, z, 7.4, 1.05, 1.6, lam(0x7a5a34), true);
      goodsFor(g, def, x, z);
      box(g, x, 0, z + 1.5, 7.8, 2.6, 0.2, lam(delhi ? 0xcaa57a : 0xcdbb98), true); // the back wall
      for (const sx of [-1, 1]) box(g, x + sx * 3.6, 0, z - 0.95, 0.22, 3.3, 0.22, lam(0x6a4c2a));
      const awn = new T.Mesh(BOXG, awnMat); awn.scale.set(8, 0.15, 3.6); awn.position.set(x, 3.35, z + 0.2); awn.rotation.x = -0.16; awn.castShadow = true; g.add(awn);
      sign(g, x, 4.3, z - 0.9, 4.6, 1.15, def.sign, def.sub);
      const v = vendor(g, x, z + 0.55, def.robe, delhi ? 0xf1ead8 : 0x6a3a1a);
      v.rotation.y = Math.PI; // faces the customers (north)
      SPOTS.push({ id: def.id, name: NAMES[def.id], city: where, x, z: cz + 5.6, r: 3.6, vendor: { x, z: z + 0.55 }, group: v, say: def.say[where] || def.say.rome, t: 0, ph: Math.random() * 6 });
    });
    return g;
  }

  // ---------------------------------------------------------------- food stalls all over the city
  // Single food stalls beside the main sights (the same dishes as the market's food stall). `list` is [name, x, z] in world
  // coordinates; each is moved to the nearest clear spot. The sign and the cries change with the city.
  const STREET = {
    rome: { sign: "TABERNA", sub: "hot food · popina", colors: [["#b3262b", "#f1ead8"], ["#d9791f", "#f1ead8"], ["#2f8f4a", "#f1ead8"]], robe: [0xb3262b, 0xd9791f, 0x6a8a4a], say: ["Hot food here! Come and eat!", "Bread, olives and roast pork!", "A hungry man is a poor soldier!"] },
    delhi: { sign: "KHANA", sub: "chaat · sweets · chai", colors: [["#2f8f4a", "#f1ead8"], ["#d9a928", "#f1ead8"], ["#b3262b", "#f1ead8"]], robe: [0x2f8f4a, 0xd9a928, 0xb3262b], say: ["Garam garam! Come and eat!", "Chaat, jalebi, chai!", "Fresh from the tawa!"] },
  };
  const clearAt = (x, z) => { for (let ix = -5; ix <= 5; ix += 2.5) for (let iz = -3; iz <= 5; iz += 2) if (blockedAt(x + ix, z + iz, 0)) return false; return true; };
  function street(parent, where, list) {
    const th = STREET[where], delhi = where === "delhi";
    list.forEach(([name, ox, oz], n) => {
      let spot = null;
      for (let r = 0; r <= 40 && !spot; r += 4) for (let k = 0; k < (r === 0 ? 1 : 10) && !spot; k++) { const a = (k / 10) * 6.283, x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r; if (clearAt(x, z)) spot = [x, z]; }
      if (!spot) return;
      const [x, z] = spot, i = n % 3, g = new T.Group(); parent.add(g);
      const def = { id: "food", sign: th.sign, sub: name.length > 20 ? th.sub : name.toLowerCase(), color: th.colors[i], robe: th.robe[i], goods: DEFS[0].goods, say: { [where]: th.say } };
      const awnMat = new T.MeshLambertMaterial({ map: stripes(def.color[0], def.color[1]), side: T.DoubleSide });
      box(g, x, 0, z + 2, 4.6, 1.05, 1.5, lam(0x7a5a34), true);
      goodsFor(g, { id: "food", goods: def.goods }, x + 0.4, z + 2);
      for (const sx of [-1, 1]) box(g, x + sx * 2.1, 0, z + 1.2, 0.2, 3.0, 0.2, lam(0x6a4c2a));
      const awn = new T.Mesh(BOXG, awnMat); awn.scale.set(5.2, 0.14, 3.0); awn.position.set(x, 3.05, z + 2.2); awn.rotation.x = -0.15; awn.castShadow = true; g.add(awn);
      sign(g, x, 3.9, z + 1.1, 3.6, 0.95, def.sign, def.sub);
      const v = vendor(g, x, z + 2.9, def.robe, delhi ? 0xf1ead8 : 0x6a3a1a); v.rotation.y = Math.PI;
      if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: x - 2.6, x1: x + 2.6, z0: z + 1, z1: z + 3.6, c: "#d9791f" });
      SPOTS.push({ id: "food", name: "food stall", city: where, x, z: z - 1, r: 3.2, vendor: { x, z: z + 2.9 }, group: v, say: def.say[where], t: 8 + n * 3, ph: Math.random() * 6 });
    });
  }

  // The armourer: a stall at the edge of the gladiator arena that sells weapons to fight with (see weapons.js). `x, z` is where its counter stands;
  // customers come from the north (the middle of the arena).
  function armoury(parent, x, z) {
    const g = new T.Group(); parent.add(g);
    const awnMat = new T.MeshLambertMaterial({ map: stripes("#7a1f1f", "#d9b44a"), side: T.DoubleSide });
    box(g, x, 0, z + 2, 6.4, 1.05, 1.5, lam(0x5a3a22), true);
    box(g, x, 0, z + 3.3, 6.8, 3.0, 0.2, lam(0x8a7a5a), true);                       // the back wall, with the weapons hung on it
    for (const sx of [-1, 1]) box(g, x + sx * 3.1, 0, z + 1.2, 0.22, 3.1, 0.22, lam(0x6a4c2a));
    const ids = ["gladius", ...Weapons.IDS];
    ids.forEach((id, i) => {
      const m = Weapons.model(id); m.scale.setScalar(0.95);
      m.position.set(x - 2.5 + i, id === "spear" || id === "trident" ? 0.5 : 1.3, z + 3.15); m.rotation.z = (i % 2 ? 1 : -1) * 0.12;
      g.add(m);
    });
    box(g, x, 1.05, z + 2, 2.6, 0.12, 0.9, lam(0x3a2a1a), false);                    // a cloth on the counter with a shield on it
    cyl(g, x, 1.2, z + 1.9, 0.5, 0.08, lam(0xa8342c), false);
    const awn = new T.Mesh(BOXG, awnMat); awn.scale.set(7, 0.14, 3.0); awn.position.set(x, 3.2, z + 2.2); awn.rotation.x = -0.15; awn.castShadow = true; g.add(awn);
    sign(g, x, 4.0, z + 1.1, 4.0, 1.0, "ARMOURER", "weapons for the arena");
    const v = vendor(g, x, z + 2.9, 0x6a2a1a, 0x888a90); v.rotation.y = Math.PI;
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: x - 3.4, x1: x + 3.4, z0: z + 1, z1: z + 3.6, c: "#a8342c" });
    SPOTS.push({ id: "weapons", name: "armourer's stall", city: "rome", x, z: z - 1, r: 3.4, vendor: { x, z: z + 2.9 }, group: v, say: ["Swords, spears and axes! Fight like a champion!", "A sharp blade wins the crowd!", "The arena rewards the well-armed!"], t: 6, ph: Math.random() * 6 });
    return g;
  }

  // the stall you are standing at, if any
  const at = (x, z, feet = 0) => {
    if (feet > 3) return null;
    const c = typeof city !== "undefined" ? city : "rome";
    return SPOTS.find((s) => s.city === c && Math.hypot(x - s.x, z - s.z) < s.r) || null;
  };

  function open() {
    const s = at(player.x, player.z, player.feet);
    if (!s) return false;
    if (s.id === "board") { Jobs.openBoard(); return true; }
    Market.open(s.id);
    return true;
  }

  // vendors turn their heads and call out when you come near
  function update(dt) {
    const c = typeof city !== "undefined" ? city : "rome";
    for (const s of SPOTS) {
      if (s.city !== c) continue;
      s.ph += dt;
      s.group.rotation.y = Math.PI + Math.sin(s.ph * 0.6) * 0.25;
      s.t -= dt;
      if (s.t <= 0 && Math.hypot(player.x - s.x, player.z - s.z) < 9 && typeof Speech !== "undefined") {
        s.t = 22 + Math.random() * 10;
        const fl = typeof Festival !== "undefined" ? Festival.line() : null;
        Speech.say(s.vendor, fl && Math.random() < 0.6 ? fl : s.say[Math.floor(Math.random() * s.say.length)], 3.2);
      }
    }
  }

  return { build, street, armoury, at, open, update, SITES, SPOTS };
})();
