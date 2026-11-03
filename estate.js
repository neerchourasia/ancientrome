"use strict";
// Houses to buy and rent out. About ten houses stand in the open all over each city (Rome, Delhi and Cancún), each with a sign: FOR SALE with its price,
// or YOURS once you own it. Walk up to one and press F: a panel shows the house, who lives there (a family of computer characters, "bots"), and buttons:
//   Buy      the house is yours (the family moves out)
//   Rent     lets tenants move in, and they pay you rent every game morning (4% of the price per day); press again to stop renting
//   Upgrade  three levels (renovated, a second floor, a garden with gold trim): each costs more, raises the rent and changes how the house looks
//   Sell     you get back 70% of what you paid for it and its upgrades (press twice to be sure)
// Rent is paid on its own when a new game day starts (for up to 14 days you were away). What you own is saved in the browser and with your account.
// Depends on physics.js, world.js, home.js (Time), vitals.js and the globals of game.js.

const Estate = (() => {
  const T = THREE;
  const KEY = "rome-estate", PER_CITY = 10, SELL_BACK = 0.7, RENT_RATE = 0.04, MAX_DAYS = 14;
  let state = { owned: {}, paidDay: 1, paidAt: Date.now() - Payroll.DAY_MS };                  // owned: house id -> { rented: true or false, level: 0 to 3 }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") state = sanitize(raw);
  } catch (e) { /* storage unavailable */ }

  function sanitize(raw) {
    const out = { owned: {}, paidDay: Number.isFinite(raw && raw.paidDay) ? Math.max(1, Math.floor(raw.paidDay)) : 1, paidAt: Number.isFinite(raw && raw.paidAt) ? raw.paidAt : Date.now() - Payroll.DAY_MS };
    const o = raw && typeof raw.owned === "object" && raw.owned ? raw.owned : {};
    for (const [id, v] of Object.entries(o)) if (/^(rome|delhi|cancun)-\d{1,2}$/.test(id) && Number(id.split("-")[1]) < PER_CITY) out.owned[id] = { rented: !!(v && v.rented), level: Math.max(0, Math.min(3, Math.floor(Number(v && v.level) || 0))) };
    return out;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- the houses (the same list every time, so a saved game always means the same houses)
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const STREETS = { rome: ["Via Sacra", "Via Appia", "Via Lata", "Via Nova", "Vicus Tuscus", "Via Flaminia"], delhi: ["Chandni Chowk", "Kinari Bazaar", "Dariba Kalan", "Nai Sarak", "Khari Baoli", "Ballimaran"], beijing: ["Chang'an Avenue", "Wangfujing", "Nanluoguxiang", "Dongsi", "Xidan", "Qianmen"], cancun: ["Avenida Tulum", "Calle Gladiolas", "Avenida Bonampak", "Calle Tulipanes", "Avenida Kukulcán", "Calle Orquídeas"] };
  const KINDS = ["Corner house", "Garden house", "Courtyard house", "Little house", "Terrace house", "Family house"];
  const FAMILIES = {
    rome: ["Marcus", "Lucia", "Gaius", "Julia", "Titus", "Cornelia", "Quintus", "Livia"], delhi: ["Aarav", "Priya", "Rohan", "Meera", "Kabir", "Anaya", "Vikram", "Sana"],
    cancun: ["Mateo", "Sofía", "Diego", "Valentina", "Santiago", "Camila", "Emilio", "Lucía"],
    beijing: ["Wei", "Li", "Zhang", "Wang", "Chen", "Liu", "Zhao", "Yang"],
  };
  const specs = {};
  function catalog(c) {
    if (specs[c]) return specs[c];
    const rnd = seeded("estate-" + c), list = [];
    for (let i = 0; i < PER_CITY; i++) {
      const price = 250 + 50 * Math.floor(rnd() * 14);                                      // 250 to 900 denarii
      const fam = FAMILIES[c];
      list.push({ id: `${c}-${i}`, city: c, i, price, rent: Math.round(price * RENT_RATE), name: `${KINDS[Math.floor(rnd() * KINDS.length)]} on ${STREETS[c][Math.floor(rnd() * STREETS[c].length)]}`,
        family: `${fam[Math.floor(rnd() * fam.length)]} and family`, tenants: `${fam[Math.floor(rnd() * fam.length)]} and ${fam[Math.floor(rnd() * fam.length)]}`, w: 8 + Math.floor(rnd() * 4), d: 7 + Math.floor(rnd() * 3), col: Math.floor(rnd() * 5), x: null, z: null });
    }
    return (specs[c] = list);
  }
  // upgrades: the cost is a share of the price, and the rent is multiplied
  const UP = [{ name: "Renovate", cost: 0.4, mult: 1.5, what: "fresh paint, shutters" }, { name: "Add a second floor", cost: 0.8, mult: 2.2, what: "a second floor" }, { name: "Garden and gold trim", cost: 1.4, mult: 3.2, what: "a walled garden and gold trim" }];
  const levelOf = (h) => (state.owned[h.id] ? state.owned[h.id].level || 0 : 0);
  const rentOf = (h) => Math.round(h.price * RENT_RATE * (levelOf(h) ? UP[levelOf(h) - 1].mult : 1));
  const upCost = (h) => (levelOf(h) < 3 ? Math.round(h.price * UP[levelOf(h)].cost) : 0);
  const invested = (h) => h.price + UP.slice(0, levelOf(h)).reduce((t, u) => t + Math.round(h.price * u.cost), 0);
  const find = (id) => { const c = String(id).split("-")[0]; return (LINESET.includes(c) ? catalog(c) : []).find((h) => h.id === id) || null; };
  const LINESET = ["rome", "delhi", "cancun", "beijing"];
  const rentTotal = () => LINESET.reduce((sum, c) => sum + catalog(c).reduce((s, h) => s + (state.owned[h.id] && state.owned[h.id].rented ? rentOf(h) : 0), 0), 0);

  // ---------------------------------------------------------------- building them in the world
  const built = {};                                       // city -> { group }
  const WALLS = [0xe8d5b0, 0xd9b98c, 0xcfa77a, 0xe3c9a0, 0xc9b79a];
  const signTex = {};
  function drawSign(h) {
    const own = state.owned[h.id];
    const c = (h.canvas = h.canvas || document.createElement("canvas")); c.width = 256; c.height = 144;
    const g = c.getContext("2d");
    const lv = own && own.level ? ` · Lv ${own.level}` : "";
    const [bg, fg, l1, l2] = own ? (own.rented ? ["#1f6a3a", "#ffffff", "YOURS" + lv, `RENTED +${rentOf(h)}/day`] : ["#1d4fa0", "#ffffff", "YOURS" + lv, "not rented"]) : ["#a8342c", "#ffffff", "FOR SALE", `${h.price} denarii`];
    g.fillStyle = bg; g.fillRect(0, 0, 256, 144);
    g.strokeStyle = "#f2d98a"; g.lineWidth = 6; g.strokeRect(6, 6, 244, 132);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    const fit = (text, size) => { do { g.font = `bold ${size}px sans-serif`; size -= 2; } while (g.measureText(text).width > 224 && size > 14); };   // (shrink the writing until it fits the board)
    fit(l1, 46); g.fillText(l1, 128, 56);
    fit(l2, 28); g.fillText(l2, 128, 104);
    if (h.tex) h.tex.needsUpdate = true;
  }

  const spotFree = (x, z, w, d, e) => {
    const g0 = groundAt(x, z);
    if (g0 < -0.1 || g0 > 3) return false;
    for (let dx = -w / 2 - 2.5; dx <= w / 2 + 2.5; dx += 3) for (let dz = -d / 2 - 2.5; dz <= d / 2 + 2.5; dz += 3) {
      if (blockedAt(x + dx, z + dz, g0) || Math.abs(groundAt(x + dx, z + dz) - g0) > 0.4) return false;
    }
    return true;
  };
  // free in both eras, and not on top of a landmark
  const freeBoth = (x, z, w, d) => {
    const lm = typeof ALL_LANDMARKS !== "undefined" ? ALL_LANDMARKS : [];
    if (lm.some((l) => !l.home && Math.hypot(l.x - x, l.z - z) < (l.r || 20) + 28)) return false;
    const was = era === "modern";
    setPhysicsEra(false); const a = spotFree(x, z, w, d);
    setPhysicsEra(true); const b = a && spotFree(x, z, w, d);
    setPhysicsEra(was);
    return a && b;
  };

  function houseMesh(h) {
    const g = new T.Group(), w = h.w, d = h.d, lvl = levelOf(h), ht = 4.6, top = lvl >= 2 ? ht + 3.2 : ht;
    const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
    const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const wall = new T.Color(WALLS[h.col]).lerp(new T.Color(0xffffff), lvl >= 1 ? 0.4 : 0);                          // fresh paint once renovated
    add(new T.BoxGeometry(w, ht, d), lam(wall), 0, ht / 2, 0);
    if (lvl >= 2) {                                                                                                  // a second floor, with its own windows
      add(new T.BoxGeometry(w, 3.2, d), lam(wall), 0, ht + 1.6, 0);
      for (const sx of [-1, 1]) add(new T.BoxGeometry(1.0, 1.0, 0.2), lam(0x2b3a46), sx * (w / 2 - 1.7), ht + 1.8, d / 2 + 0.05);
      add(new T.BoxGeometry(w + 0.3, 0.25, d + 0.3), lam(lvl >= 3 ? 0xd9b44a : 0xb5a98a), 0, ht, 0);              // a band between the floors
    }
    const roof = add(new T.ConeGeometry(0.5, 2.4, 4), lam(lvl >= 3 ? 0x8f3b24 : 0xb5532f), 0, top + 1.2, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(w * 1.5, 1, d * 1.5);
    add(new T.BoxGeometry(1.4, 2.5, 0.25), lam(0x5a3a22), 0, 1.25, d / 2 + 0.05);                                  // the door, on the south side
    for (const sx of [-1, 1]) add(new T.BoxGeometry(1.0, 1.0, 0.2), lam(0x2b3a46), sx * (w / 2 - 1.7), 2.8, d / 2 + 0.05);   // two windows
    if (lvl >= 1) for (const sx of [-1, 1]) for (const dx of [-0.62, 0.62]) add(new T.BoxGeometry(0.4, 1.0, 0.1), lam(0x2f6b3a), sx * (w / 2 - 1.7) + dx * 1.6, 2.8, d / 2 + 0.16);   // green shutters
    if (lvl >= 3) {                                                                                                  // a low garden wall along the front and sides, two bushes and gold trim round the door
      const stone = lam(0xd8cfba);
      add(new T.BoxGeometry(w + 3, 0.7, 0.3), stone, 0, 0.35, d / 2 + 3); add(new T.BoxGeometry(0.3, 0.7, 3.2), stone, -(w / 2 + 1.5), 0.35, d / 2 + 1.5); add(new T.BoxGeometry(0.3, 0.7, 3.2), stone, w / 2 + 1.5, 0.35, d / 2 + 1.5);
      for (const sx of [-1, 1]) add(new T.SphereGeometry(0.7, 8, 6), lam(0x3f7a3a), sx * (w / 2 - 0.4), 0.7, d / 2 + 1.5);
      add(new T.BoxGeometry(1.9, 0.18, 0.3), lam(0xd9b44a), 0, 2.65, d / 2 + 0.12);
    }
    add(new T.BoxGeometry(0.12, 2.4, 0.12), lam(0x5a3a22), -w / 2 - 1.2, 1.2, d / 2 + 1.6);                         // the sign post
    h.tex = new T.CanvasTexture((drawSign(h), h.canvas));
    const board = new T.Mesh(new T.PlaneGeometry(1.9, 1.07), new T.MeshBasicMaterial({ map: h.tex, side: T.DoubleSide }));
    board.position.set(-w / 2 - 1.2, 2.5, d / 2 + 1.7); g.add(board);
    return g;
  }

  // each house is also a place in the Places list (teleport there, or walking directions), so you can find them
  function syncPlace(h) {
    if (!h.lm) return;
    const own = state.owned[h.id], lv = levelOf(h);
    h.lm.name = own ? `Your house: ${h.name}` : `House for sale: ${h.name}`;
    h.lm.sub = own ? `Level ${lv} · ${own.rented ? "rented, +" + rentOf(h) + " a day" : "not rented"}` : `${h.price} denarii · press F at the sign`;
  }
  function addPlace(h) {
    const src = city === "delhi" ? DELHI_LANDMARKS : city === "cancun" ? CANCUN_LANDMARKS : city === "beijing" ? BEIJING_LANDMARKS : ROME_LANDMARKS;
    h.lm = { id: "e-" + h.id, game: true, name: "", sub: "", x: h.x, z: h.z, r: 10, stand: [h.x, h.z + h.d / 2 + 4],
      text: "A house you can buy and rent out. Walk up to its sign and press F: Buy it, then press Rent so tenants move in and pay you every morning, and Upgrade it for more rent.",
      fact: "Rent is paid every game morning: 4% of the price a day, more after each upgrade." };
    src.push(h.lm); syncPlace(h);
  }

  function rebuild(h) {                                   // draw the house again (its sign and level may have changed)
    syncPlace(h);
    if (!h.mesh) return;
    built[h.city].group.remove(h.mesh);
    h.mesh = houseMesh(h); h.mesh.position.set(h.x, groundAt(h.x, h.z), h.z); built[h.city].group.add(h.mesh);
  }

  function ensure() {
    if (built[city]) return;
    const list = catalog(city), rnd = seeded("place-" + city), taken = [];
    const group = new T.Group(); scene.add(group); built[city] = { group };
    const x0 = BOUNDS.minX + 70, x1 = BOUNDS.maxX - 70, z0 = BOUNDS.minZ + 70, z1 = BOUNDS.maxZ - 70;
    for (const h of list) {
      let placed = false;
      for (let tries = 0; tries < 160 && !placed; tries++) {
        const cx = x0 + rnd() * (x1 - x0), cz = z0 + rnd() * (z1 - z0);
        if (taken.some((t) => Math.hypot(t[0] - cx, t[1] - cz) < 120)) continue;
        for (let r = 0; r <= 36 && !placed; r += 6) for (let k = 0; k < (r ? 10 : 1) && !placed; k++) {
          const a = (k / 10) * Math.PI * 2, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (freeBoth(x, z, h.w, h.d)) { h.x = x; h.z = z; placed = true; taken.push([x, z]); }
        }
      }
      if (!placed) continue;
      const mesh = houseMesh(h); mesh.position.set(h.x, groundAt(h.x, h.z), h.z); group.add(mesh); h.mesh = mesh;
      addBlockerBox(h.x - h.w / 2, h.x + h.w / 2, h.z - h.d / 2, h.z + h.d / 2, 0, 9);
      if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: h.x - h.w / 2, x1: h.x + h.w / 2, z0: h.z - h.d / 2, z1: h.z + h.d / 2, c: "#f2c230" });
      addPlace(h);
    }
    if (typeof refreshLandmarks === "function") refreshLandmarks();                                                  // (the houses join the Places list)
  }

  // ---------------------------------------------------------------- walking up to one
  const dist = (h) => Math.hypot(Math.max(Math.abs(player.x - h.x) - h.w / 2, 0), Math.max(Math.abs(player.z - h.z) - h.d / 2, 0));
  function at() {
    if (!started || mode !== "walk" || panelOpen || !built[city]) return null;
    let best = null, bd = 6;
    for (const h of catalog(city)) { if (h.x === null) continue; const d = dist(h); if (d < bd && Math.abs(player.feet - groundAt(player.x, player.z)) < 2) { bd = d; best = h; } }
    return best;
  }
  const promptText = () => { const h = at(); if (!h) return ""; const own = state.owned[h.id]; return own ? `F: your house${own.level ? " (level " + own.level + ")" : ""} (${own.rented ? "rented, +" + rentOf(h) + "/day" : "not rented"})` : `F: house for sale: ${h.price} denarii`; };

  // ---------------------------------------------------------------- the panel
  let cur = null, armed = 0;
  const $e = (id) => document.getElementById(id);
  function render() {
    const h = cur; if (!h) return;
    const own = state.owned[h.id];
    $e("es-name").textContent = h.name;
    $e("es-text").textContent = own
      ? (own.rented ? `Your tenants, ${h.tenants}, pay you ${rentOf(h)} denarii every morning.` : `Your house is empty. Press Rent to let tenants move in: they pay you ${rentOf(h)} denarii every morning.`)
      : `${h.family} live here. Buy the house and they move out; then you can rent it to tenants for ${rentOf(h)} denarii a day.`;
    const lv = levelOf(h);
    $e("es-level").textContent = own ? (lv ? `Level ${lv} of 3: ${UP.slice(0, lv).map((u) => u.what).join(", ")}.` : "Level 0 of 3: a plain house.") : "";
    $e("es-buy").hidden = !!own; $e("es-rent").hidden = !own; $e("es-sell").hidden = !own; $e("es-up").hidden = !own || lv >= 3;
    if (own && lv < 3) { const nr = Math.round(h.price * RENT_RATE * UP[lv].mult); $e("es-up").textContent = `Upgrade: ${UP[lv].name.toLowerCase()} · ${upCost(h)} (rent ${rentOf(h)} → ${nr})`; $e("es-up").disabled = Vitals.coins < upCost(h); }
    $e("es-buy").textContent = `Buy · ${h.price}`; $e("es-buy").disabled = Vitals.coins < h.price;
    $e("es-rent").textContent = own && own.rented ? "Rented: stop renting" : "Rent"; $e("es-rent").classList.toggle("on", !!(own && own.rented));
    $e("es-sell").textContent = `Sell · ${Math.round(invested(h) * SELL_BACK)}`;
    $e("es-total").textContent = `You own ${Object.keys(state.owned).length} house${Object.keys(state.owned).length === 1 ? "" : "s"}. All your rent: ${rentTotal()} denarii a morning.`;
  }
  function open() {
    const h = at(); if (!h) return;
    cur = h; armed = 0; render(); openPanel("#estate");
  }
  function buy() {
    const h = cur; if (!h || state.owned[h.id]) return;
    if (Vitals.coins < h.price) { toast(`You need ${h.price} denarii (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= h.price; state.owned[h.id] = { rented: false, level: 0 }; save(); rebuild(h); Sfx.play("coin"); render();
    toast(`You bought the ${h.name.toLowerCase()}. ${h.family} moved out.`);
  }
  function rent() {
    const h = cur, own = h && state.owned[h.id]; if (!own) return;
    own.rented = !own.rented; save(); rebuild(h); render();
    toast(own.rented ? `Tenants moved into the ${h.name.toLowerCase()}: +${rentOf(h)} denarii every morning.` : "You stopped renting the house.");
  }
  function upgrade() {
    const h = cur, own = h && state.owned[h.id]; if (!own || levelOf(h) >= 3) return;
    const cost = upCost(h);
    if (Vitals.coins < cost) { toast(`You need ${cost} denarii (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= cost; own.level = levelOf(h) + 1; save(); rebuild(h); Sfx.play("discover"); render();
    toast(`${h.name}: level ${own.level}. The rent is now ${rentOf(h)} denarii a morning.`);
  }
  function sell() {
    const h = cur; if (!h || !state.owned[h.id]) return;
    const back = Math.round(invested(h) * SELL_BACK);
    if (!armed || performance.now() - armed > 4000) { armed = performance.now(); $e("es-sell").textContent = `Sure? Sell for ${back}`; return; }
    delete state.owned[h.id]; save(); rebuild(h); Vitals.coins += back; Sfx.play("coin"); armed = 0; render();
    toast(`You sold the ${h.name.toLowerCase()} for ${back} denarii.`);
  }

  // rent is paid when a new game day starts (for up to 14 days of being away)
  let tick = 0;
  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    ensure();
    tick += dt; if (tick < 1) return; tick = 0;
    if (Time.day > state.paidDay) {
      const real = Payroll.realDays(state.paidAt), pay = Math.round(rentTotal() * real);         // (the rent for the real time that has passed, not for skipped game days)
      state.paidDay = Time.day; state.paidAt = Date.now(); save();
      if (pay > 0) { Vitals.coins += pay; Sfx.play("coin"); toast(`Your tenants paid you ${pay} denarii${real > 1.5 ? ` for ${Math.round(real)} days` : ""}.`); }
    } else if (Time.day < state.paidDay) { state.paidDay = Time.day; save(); }          // (a new game, or an older saved game)
  }

  function bind() {
    if (!$e("estate")) return;
    $e("es-buy").addEventListener("click", buy); $e("es-rent").addEventListener("click", rent); $e("es-up").addEventListener("click", upgrade); $e("es-sell").addEventListener("click", sell);
  }

  return {
    bind, update, at, open, promptText,
    snapshot: () => ({ owned: JSON.parse(JSON.stringify(state.owned)), paidDay: state.paidDay, paidAt: state.paidAt }),
    restore(raw) { state = sanitize(raw); save(); for (const c of LINESET) for (const h of catalog(c)) rebuild(h); },
    merge(raw) {                                          // take in houses bought on another device (a saved game that is older than this device's)
      const o = sanitize(raw);
      for (const [id, v] of Object.entries(o.owned)) state.owned[id] = { rented: !!(state.owned[id] && state.owned[id].rented) || v.rented, level: Math.max(v.level, state.owned[id] ? state.owned[id].level || 0 : 0) };
      state.paidAt = Math.max(state.paidAt, o.paidAt);
      save(); for (const c of LINESET) for (const h of catalog(c)) rebuild(h);
    },
    get count() { return Object.keys(state.owned).length; },
    placed: () => catalog(city).filter((h) => h.x !== null).map((h) => ({ id: h.id, name: h.name, x: Math.round(h.x), z: Math.round(h.z), price: h.price, rent: rentOf(h), level: levelOf(h) })),   // the houses that found a place in this city
  };
})();
