"use strict";
// Houses to buy and rent out. About ten houses stand in the open all over each city (Rome, Delhi and Cancún), each with a sign: FOR SALE with its price,
// or YOURS once you own it. Walk up to one and press F: a panel shows the house, who lives there (a family of computer characters, "bots"), and buttons:
//   Buy      the house is yours (the family moves out)
//   Rent     lets tenants move in, and they pay you rent every game morning (4% of the price per day); press again to stop renting
//   Sell     you get back 70% of what you paid (press twice to be sure)
// Rent is paid on its own when a new game day starts (for up to 14 days you were away). What you own is saved in the browser and with your account.
// Depends on physics.js, world.js, home.js (Time), vitals.js and the globals of game.js.

const Estate = (() => {
  const T = THREE;
  const KEY = "rome-estate", PER_CITY = 10, SELL_BACK = 0.7, RENT_RATE = 0.04, MAX_DAYS = 14;
  let state = { owned: {}, paidDay: 1 };                  // owned: house id -> { rented: true or false }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") state = sanitize(raw);
  } catch (e) { /* storage unavailable */ }

  function sanitize(raw) {
    const out = { owned: {}, paidDay: Number.isFinite(raw && raw.paidDay) ? Math.max(1, Math.floor(raw.paidDay)) : 1 };
    const o = raw && typeof raw.owned === "object" && raw.owned ? raw.owned : {};
    for (const [id, v] of Object.entries(o)) if (/^(rome|delhi|cancun)-\d{1,2}$/.test(id) && Number(id.split("-")[1]) < PER_CITY) out.owned[id] = { rented: !!(v && v.rented) };
    return out;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- the houses (the same list every time, so a saved game always means the same houses)
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const STREETS = { rome: ["Via Sacra", "Via Appia", "Via Lata", "Via Nova", "Vicus Tuscus", "Via Flaminia"], delhi: ["Chandni Chowk", "Kinari Bazaar", "Dariba Kalan", "Nai Sarak", "Khari Baoli", "Ballimaran"], cancun: ["Avenida Tulum", "Calle Gladiolas", "Avenida Bonampak", "Calle Tulipanes", "Avenida Kukulcán", "Calle Orquídeas"] };
  const KINDS = ["Corner house", "Garden house", "Courtyard house", "Little house", "Terrace house", "Family house"];
  const FAMILIES = {
    rome: ["Marcus", "Lucia", "Gaius", "Julia", "Titus", "Cornelia", "Quintus", "Livia"], delhi: ["Aarav", "Priya", "Rohan", "Meera", "Kabir", "Anaya", "Vikram", "Sana"],
    cancun: ["Mateo", "Sofía", "Diego", "Valentina", "Santiago", "Camila", "Emilio", "Lucía"],
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
  const find = (id) => { const c = String(id).split("-")[0]; return (LINESET.includes(c) ? catalog(c) : []).find((h) => h.id === id) || null; };
  const LINESET = ["rome", "delhi", "cancun"];
  const rentTotal = () => LINESET.reduce((sum, c) => sum + catalog(c).reduce((s, h) => s + (state.owned[h.id] && state.owned[h.id].rented ? h.rent : 0), 0), 0);

  // ---------------------------------------------------------------- building them in the world
  const built = {};                                       // city -> { group }
  const WALLS = [0xe8d5b0, 0xd9b98c, 0xcfa77a, 0xe3c9a0, 0xc9b79a];
  const signTex = {};
  function drawSign(h) {
    const own = state.owned[h.id];
    const c = (h.canvas = h.canvas || document.createElement("canvas")); c.width = 256; c.height = 144;
    const g = c.getContext("2d");
    const [bg, fg, l1, l2] = own ? (own.rented ? ["#1f6a3a", "#ffffff", "YOURS", `RENTED +${h.rent}/day`] : ["#1d4fa0", "#ffffff", "YOURS", "not rented"]) : ["#a8342c", "#ffffff", "FOR SALE", `${h.price} denarii`];
    g.fillStyle = bg; g.fillRect(0, 0, 256, 144);
    g.strokeStyle = "#f2d98a"; g.lineWidth = 6; g.strokeRect(6, 6, 244, 132);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "bold 46px sans-serif"; g.fillText(l1, 128, 56);
    g.font = "bold 28px sans-serif"; g.fillText(l2, 128, 104);
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
    const g = new T.Group(), w = h.w, d = h.d, ht = 4.6;
    const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
    const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    add(new T.BoxGeometry(w, ht, d), lam(WALLS[h.col]), 0, ht / 2, 0);
    const roof = add(new T.ConeGeometry(0.5, 2.4, 4), lam(0xb5532f), 0, ht + 1.2, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(w * 1.5, 1, d * 1.5);
    add(new T.BoxGeometry(1.4, 2.5, 0.25), lam(0x5a3a22), 0, 1.25, d / 2 + 0.05);                                  // the door, on the south side
    for (const sx of [-1, 1]) add(new T.BoxGeometry(1.0, 1.0, 0.2), lam(0x2b3a46), sx * (w / 2 - 1.7), 2.8, d / 2 + 0.05);   // two windows
    add(new T.BoxGeometry(0.12, 2.4, 0.12), lam(0x5a3a22), -w / 2 - 1.2, 1.2, d / 2 + 1.6);                         // the sign post
    h.tex = new T.CanvasTexture((drawSign(h), h.canvas));
    const board = new T.Mesh(new T.PlaneGeometry(1.9, 1.07), new T.MeshBasicMaterial({ map: h.tex, side: T.DoubleSide }));
    board.position.set(-w / 2 - 1.2, 2.5, d / 2 + 1.7); g.add(board);
    return g;
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
    }
  }

  // ---------------------------------------------------------------- walking up to one
  const dist = (h) => Math.hypot(Math.max(Math.abs(player.x - h.x) - h.w / 2, 0), Math.max(Math.abs(player.z - h.z) - h.d / 2, 0));
  function at() {
    if (!started || mode !== "walk" || panelOpen || !built[city]) return null;
    let best = null, bd = 6;
    for (const h of catalog(city)) { if (h.x === null) continue; const d = dist(h); if (d < bd && Math.abs(player.feet - groundAt(player.x, player.z)) < 2) { bd = d; best = h; } }
    return best;
  }
  const promptText = () => { const h = at(); if (!h) return ""; const own = state.owned[h.id]; return own ? `F: your house (${own.rented ? "rented, +" + h.rent + "/day" : "not rented"})` : `F: house for sale: ${h.price} denarii`; };

  // ---------------------------------------------------------------- the panel
  let cur = null, armed = 0;
  const $e = (id) => document.getElementById(id);
  function render() {
    const h = cur; if (!h) return;
    const own = state.owned[h.id];
    $e("es-name").textContent = h.name;
    $e("es-text").textContent = own
      ? (own.rented ? `Your tenants, ${h.tenants}, pay you ${h.rent} denarii every morning.` : `Your house is empty. Press Rent to let tenants move in: they pay you ${h.rent} denarii every morning.`)
      : `${h.family} live here. Buy the house and they move out; then you can rent it to tenants for ${h.rent} denarii a day.`;
    $e("es-buy").hidden = !!own; $e("es-rent").hidden = !own; $e("es-sell").hidden = !own;
    $e("es-buy").textContent = `Buy · ${h.price}`; $e("es-buy").disabled = Vitals.coins < h.price;
    $e("es-rent").textContent = own && own.rented ? "Rented: stop renting" : "Rent"; $e("es-rent").classList.toggle("on", !!(own && own.rented));
    $e("es-sell").textContent = `Sell · ${Math.round(h.price * SELL_BACK)}`;
    $e("es-total").textContent = `You own ${Object.keys(state.owned).length} house${Object.keys(state.owned).length === 1 ? "" : "s"}. All your rent: ${rentTotal()} denarii a morning.`;
  }
  function open() {
    const h = at(); if (!h) return;
    cur = h; armed = 0; render(); openPanel("#estate");
  }
  function buy() {
    const h = cur; if (!h || state.owned[h.id]) return;
    if (Vitals.coins < h.price) { toast(`You need ${h.price} denarii (you have ${Vitals.coins}).`); return; }
    Vitals.coins -= h.price; state.owned[h.id] = { rented: false }; save(); drawSign(h); Sfx.play("coin"); render();
    toast(`You bought the ${h.name.toLowerCase()}. ${h.family} moved out.`);
  }
  function rent() {
    const h = cur, own = h && state.owned[h.id]; if (!own) return;
    own.rented = !own.rented; save(); drawSign(h); render();
    toast(own.rented ? `Tenants moved into the ${h.name.toLowerCase()}: +${h.rent} denarii every morning.` : "You stopped renting the house.");
  }
  function sell() {
    const h = cur; if (!h || !state.owned[h.id]) return;
    const back = Math.round(h.price * SELL_BACK);
    if (!armed || performance.now() - armed > 4000) { armed = performance.now(); $e("es-sell").textContent = `Sure? Sell for ${back}`; return; }
    delete state.owned[h.id]; save(); drawSign(h); Vitals.coins += back; Sfx.play("coin"); armed = 0; render();
    toast(`You sold the ${h.name.toLowerCase()} for ${back} denarii.`);
  }

  // rent is paid when a new game day starts (for up to 14 days of being away)
  let tick = 0;
  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    ensure();
    tick += dt; if (tick < 1) return; tick = 0;
    if (Time.day > state.paidDay) {
      const days = Math.min(MAX_DAYS, Time.day - state.paidDay), pay = rentTotal() * days;
      state.paidDay = Time.day; save();
      if (pay > 0) { Vitals.coins += pay; Sfx.play("coin"); toast(`Your tenants paid you ${pay} denarii${days > 1 ? ` for ${days} days` : ""}.`); }
    } else if (Time.day < state.paidDay) { state.paidDay = Time.day; save(); }          // (a new game, or an older saved game)
  }

  function bind() {
    if (!$e("estate")) return;
    $e("es-buy").addEventListener("click", buy); $e("es-rent").addEventListener("click", rent); $e("es-sell").addEventListener("click", sell);
  }

  return {
    bind, update, at, open, promptText,
    snapshot: () => ({ owned: JSON.parse(JSON.stringify(state.owned)), paidDay: state.paidDay }),
    restore(raw) { state = sanitize(raw); save(); for (const c of LINESET) for (const h of catalog(c)) if (h.canvas) drawSign(h); },
    merge(raw) {                                          // take in houses bought on another device (a saved game that is older than this device's)
      const o = sanitize(raw);
      for (const [id, v] of Object.entries(o.owned)) state.owned[id] = { rented: !!(state.owned[id] && state.owned[id].rented) || v.rented };
      save(); for (const c of LINESET) for (const h of catalog(c)) if (h.canvas) drawSign(h);
    },
    get count() { return Object.keys(state.owned).length; },
    placed: () => catalog(city).filter((h) => h.x !== null).map((h) => ({ id: h.id, name: h.name, x: Math.round(h.x), z: Math.round(h.z), price: h.price, rent: h.rent })),   // the houses that found a place in this city
  };
})();
