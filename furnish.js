"use strict";
// Furnish your house: 🛋️ Furnish house in the menu. Buy rugs, tables, chests, lamps, plants and more with your denarii, then stand where you want a piece inside your own house (in Rome, Old Delhi,
// Cancún or Beijing) and press Place. The piece stands in front of you; Turn it, or Pick it up again (the nearest piece, within three steps). Each city's house has its own furniture, in the colours of
// that city. Pieces can be walked through (a rug is a rug) and are kept in the browser (rome-furn) and in the saved game (account.js). Depends on world.js (worldScene), market.js (Vitals) and the houses.
// Friends can visit: 🏠 Visit beside a friend in the Friends box takes you to your own house in the city where they have the most furniture and shows THEIR furniture there (yours is hidden) until you walk
// out. The server keeps each player's layout (server.py, "furnished houses") and gives it only to mutual friends. Furniture can also be sold to other players in the player market (playermarket.js).
// Some pieces do something when you press F beside them in your house: the BED lets you sleep at night (or rest by day), the TABLE sets a meal (15 denarii, twice a day), the CHEST keeps goods for
// you (60 at most), a STOOL or CUSHIONS let you sit and rest, and a PLANT grows a little for every day you water it. Every different kind of piece in the house also makes you heal 5% faster at home.

const Furnish = (() => {
  const KEY = "rome-furn", MAX = 30, OWN_MAX = 40;
  // id: [name, price, what it looks like]
  const PIECES = {
    rug: ["Rug", 40], table: ["Low table", 60], stool: ["Stool", 15], chest: ["Storage chest", 70], lamp: ["Lamp stand", 35],
    bed: ["Bed", 90], plant: ["Potted plant", 20], vase: ["Tall vase", 45], statue: ["Small statue", 120], cushions: ["Floor cushions", 25], screen: ["Folding screen", 80],
  };
  const IDS = Object.keys(PIECES);
  const ACTIONS = { bed: "F: lie down on your bed", table: "F: set a meal on the table (15 denarii)", chest: "F: open your chest", stool: "F: sit down", cushions: "F: sit on the cushions", plant: "F: water the plant" };
  const MEAL = 15, MEALS_A_DAY = 2, CHEST_MAX = 60;
  // the colours of each city's furniture: main, accent, wood
  const PAL = {
    rome: { main: 0x8a2f2a, accent: 0xd9b44a, wood: 0x6b4a2b }, delhi: { main: 0xd9831f, accent: 0x8a1f4a, wood: 0x5a3a1f },
    cancun: { main: 0x1f9aa8, accent: 0xf2c21b, wood: 0x8a6a3a }, beijing: { main: 0xa51e1e, accent: 0xe2b52a, wood: 0x3a2418 },
  };
  const FLOOR = { rome: 0.15, delhi: 0.02, cancun: 0.15, beijing: 0.15 };
  let st = { own: {}, placed: { rome: [], delhi: [], cancun: [], beijing: [] }, chest: {}, meals: { day: -1, n: 0 }, water: { day: -1, n: 0 } };
  const groups = {}, shown = {};
  let note = "";

  const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0);
  function clean(r) {
    const o = { own: {}, placed: { rome: [], delhi: [], cancun: [], beijing: [] }, chest: {}, meals: { day: -1, n: 0 }, water: { day: -1, n: 0 } };
    if (r && r.chest && typeof r.chest === "object" && typeof Shopkeep !== "undefined") { let room = CHEST_MAX; for (const id of Shopkeep.IDS) { const n = Math.min(room, Math.max(0, Math.floor(+r.chest[id]) || 0)); if (n) { o.chest[id] = n; room -= n; } } }
    if (r && r.meals) o.meals = { day: Number.isFinite(+r.meals.day) ? +r.meals.day : -1, n: Math.min(9, Math.max(0, Math.floor(+r.meals.n) || 0)) };
    if (r && r.water) o.water = { day: Number.isFinite(+r.water.day) ? +r.water.day : -1, n: Math.min(999, Math.max(0, Math.floor(+r.water.n) || 0)) };
    if (r && r.own && typeof r.own === "object") for (const id of IDS) if (Number.isInteger(r.own[id]) && r.own[id] > 0) o.own[id] = Math.min(OWN_MAX, r.own[id]);
    if (r && r.placed && typeof r.placed === "object") for (const c of Object.keys(o.placed)) {
      if (!Array.isArray(r.placed[c])) continue;
      for (const p of r.placed[c].slice(0, MAX)) if (p && PIECES[p.id] && Number.isFinite(+p.x) && Number.isFinite(+p.z)) o.placed[c].push({ id: p.id, x: num(p.x, -1e5, 1e5), z: num(p.z, -1e5, 1e5), yaw: num(p.yaw, -7, 7) });
    }
    return o;
  }
  try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && r.v === 1) st = clean(r); } catch (e) { /* storage unavailable */ }
  let dirty = true, guest = null, guestGroup = null, away = 0;
  const save = () => { dirty = true; try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ...st })); } catch (e) { /* ignore */ } };

  const $p = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const owned = (id) => st.own[id] || 0;
  const placedCount = (id, c) => (st.placed[c] || []).filter((p) => p.id === id).length;
  const totalPlaced = (id) => Object.keys(st.placed).reduce((n, c) => n + placedCount(id, c), 0);
  const free = (id) => owned(id) - totalPlaced(id);
  const here = () => (typeof city !== "undefined" ? city : "rome");

  // are you inside your own house? (Rome: the room; the other cities: their house rooms)
  function inHouse() {
    const c = here(), x = player.x, z = player.z;
    if (c === "rome") return typeof Home !== "undefined" && Home.inside(x, z);
    if (c === "delhi") return typeof Delhi !== "undefined" && Delhi.built && Delhi.homeInside(x, z);
    if (c === "cancun") return typeof Cancun !== "undefined" && Cancun.built && Cancun.homeInside(x, z);
    if (c === "beijing") return typeof Beijing !== "undefined" && Beijing.built && Beijing.homeInside(x, z);
    return false;
  }

  // ---------------------------------------------------------------- the pieces (simple shapes, in the colours of the city)
  function make(id, c) {
    const pal = PAL[c] || PAL.rome, g = new THREE.Group();
    const mat = (col, extra) => new THREE.MeshLambertMaterial({ color: col, emissive: 0x120c06, ...extra });
    const box = (w, h, d, x, y, z, col, extra) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col, extra)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const cyl = (r0, r1, h, x, y, z, col, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat(col)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const ball = (r, x, y, z, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(col)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const flat = { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 };
    switch (id) {
      case "rug": box(2.4, 0.03, 1.6, 0, 0.015, 0, pal.main, flat); box(2.0, 0.035, 1.2, 0, 0.02, 0, pal.accent, flat); box(1.7, 0.04, 0.9, 0, 0.025, 0, pal.main, flat); break;
      case "table": box(1.3, 0.07, 0.75, 0, 0.42, 0, pal.wood); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(0.07, 0.4, 0.07, sx * 0.55, 0.2, sz * 0.3, pal.wood); box(0.3, 0.12, 0.2, 0.2, 0.52, 0, pal.accent); break;
      case "stool": cyl(0.24, 0.24, 0.06, 0, 0.44, 0, pal.main); for (const a of [0, 2.1, 4.2]) box(0.05, 0.42, 0.05, Math.cos(a) * 0.15, 0.21, Math.sin(a) * 0.15, pal.wood); break;
      case "chest": box(0.95, 0.5, 0.55, 0, 0.25, 0, pal.wood); box(0.97, 0.12, 0.57, 0, 0.56, 0, pal.main); box(0.1, 0.62, 0.58, 0.28, 0.31, 0, pal.accent); box(0.1, 0.62, 0.58, -0.28, 0.31, 0, pal.accent); ball(0.045, 0, 0.5, -0.29, pal.accent); break;
      case "lamp": cyl(0.2, 0.25, 0.06, 0, 0.03, 0, pal.wood); cyl(0.03, 0.03, 1.4, 0, 0.73, 0, pal.wood); { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 9), new THREE.MeshBasicMaterial({ color: 0xffd27a })); b.position.set(0, 1.5, 0); g.add(b); } break;
      case "plant": { cyl(0.22, 0.16, 0.32, 0, 0.16, 0, 0xa95a2c); const gr = 0.7 + Math.min(10, make.water === undefined ? st.water.n : make.water) * 0.06; for (const [x, y, z, r] of [[0, 0.55, 0, 0.26], [0.14, 0.75, 0.06, 0.2], [-0.12, 0.72, -0.08, 0.2], [0.02, 0.92, 0.04, 0.15]]) ball(r * gr, x * gr, 0.32 + (y - 0.32) * gr, z * gr, 0x3f8a3a); } break;
      case "bed": box(1.05, 0.3, 2.0, 0, 0.15, 0, pal.wood); box(0.95, 0.16, 1.9, 0, 0.38, 0, 0xe9e4d8); box(0.97, 0.1, 1.1, 0, 0.45, 0.4, pal.main); box(0.6, 0.14, 0.3, 0, 0.52, -0.75, 0xf3efe6); break;
      case "vase": cyl(0.13, 0.2, 0.2, 0, 0.1, 0, pal.main); cyl(0.26, 0.13, 0.45, 0, 0.42, 0, pal.main); cyl(0.12, 0.26, 0.3, 0, 0.78, 0, pal.main); cyl(0.14, 0.1, 0.1, 0, 1.0, 0, pal.accent); cyl(0.275, 0.275, 0.05, 0, 0.5, 0, pal.accent); break;
      case "statue": box(0.5, 0.7, 0.5, 0, 0.35, 0, 0xcfc8b8); box(0.55, 0.06, 0.55, 0, 0.73, 0, 0xb8b0a0); cyl(0.16, 0.2, 0.55, 0, 1.05, 0, 0xe9e4d8); ball(0.13, 0, 1.46, 0, 0xe9e4d8); break;
      case "cushions": { const a = cyl(0.36, 0.36, 0.12, -0.4, 0.07, 0, pal.main, 16), b = cyl(0.32, 0.32, 0.11, 0.35, 0.065, 0.1, pal.accent, 16); a.scale.y = b.scale.y = 1; } break;
      case "screen": for (const [x, r] of [[-0.55, 0.45], [0, -0.45], [0.55, 0.45]]) { const p = box(0.55, 1.5, 0.04, x, 0.78, 0, pal.main); p.rotation.y = r; box(0.5, 1.4, 0.045, x, 0.78, 0, pal.accent, { transparent: true, opacity: 0.35 }).rotation.y = r; } break;
      default: box(0.4, 0.4, 0.4, 0, 0.2, 0, pal.wood);
    }
    return g;
  }

  // the pieces stand in a group in the world (the position is in world coordinates, so the same group works in every city)
  function refresh() {
    if (typeof worldScene === "undefined" || !worldScene) return;
    for (const c of Object.keys(st.placed)) {
      const sig = JSON.stringify(st.placed[c]) + st.water.n;
      if (shown[c] === sig) continue;
      shown[c] = sig;
      if (groups[c]) { worldScene.remove(groups[c]); groups[c].traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      const grp = new THREE.Group();
      for (const p of st.placed[c]) { const m = make(p.id, c); m.position.set(p.x, FLOOR[c], p.z); m.rotation.y = p.yaw; grp.add(m); }
      worldScene.add(grp); groups[c] = grp;
    }
  }

  // ---------------------------------------------------------------- visiting a friend's house
  function applyVisibility() { for (const c of Object.keys(groups)) groups[c].visible = !(guest && guest.city === c); }
  function endGuest() {
    if (!guest) return;
    if (guestGroup && worldScene) { worldScene.remove(guestGroup); guestGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    guestGroup = null; guest = null; away = 0; applyVisibility(); toast(tr("You are home again."));
  }
  function visit(fid, name) {
    if (typeof Online === "undefined" || !Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast(tr("Visiting needs an account and the game server: log in and wait to be connected.")); return; }
    if (mode !== "walk") { toast(tr("Stop what you are doing first.")); return; }
    Online.navalSend({ t: "social", a: "f_get", fid }); toast(`${tr("Asking to visit")} ${name || ""}...`);
  }
  function onServer(m) {
    if (m.a !== "layout") { toast(tr("You cannot visit that house: only friends can.")); return; }
    const placed = {}, counts = Object.keys(PAL).map((c) => [c, (m.placed[c] || []).length]).sort((a, b) => b[1] - a[1]);
    if (!counts[0][1]) { toast(`${m.name}${tr(" has not furnished a house yet.")}`); return; }
    const c = (m.placed[here()] || []).length ? here() : counts[0][0];
    endGuest();
    if (c !== here()) arriveIn(c);
    if (c === "delhi") { const h = Delhi.homeSpot(); placeAt(h.x, h.z, 0); } else if (c === "cancun") { const h = Cancun.homeSpot(); placeAt(h.x, h.z, 0); } else if (c === "beijing") { const h = Beijing.homeSpot(); placeAt(h.x, h.z, 0); } else placeAt(Home.X, Home.Z - 2.5, 0);
    guest = { name: m.name, city: c, water: +m.water || 0 };
    make.water = guest.water;
    guestGroup = new THREE.Group();
    for (const p of clean({ placed: m.placed }).placed[c]) { const o = make(p.id, c); o.position.set(p.x, FLOOR[c], p.z); o.rotation.y = p.yaw; guestGroup.add(o); }
    make.water = undefined;
    worldScene.add(guestGroup); applyVisibility(); away = 0;
    toast(`🏠 ${tr("You are visiting")} ${m.name}${tr("'s house. Walk out of the door to go home.")}`);
  }

  // ---------------------------------------------------------------- what the pieces do
  let sat = null, view = "shop";
  const today = () => (typeof Payroll !== "undefined" ? Payroll.epoch() : 0);
  const comfort = (c = here()) => 1 + 0.05 * new Set((st.placed[c] || []).map((p) => p.id)).size;       // (heal faster at home for each kind of piece: Vitals restBoost)
  function actNear() {
    if (guest || typeof started === "undefined" || !started || mode !== "walk" || panelOpen || !inHouse()) return null;
    let best = null, bd = 1.9;
    for (const p of st.placed[here()] || []) { if (!ACTIONS[p.id]) continue; const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  const promptText = () => { const p = actNear(); return p ? tr(ACTIONS[p.id]) : ""; };
  const at = () => !!actNear();
  function sitAt(p, text) {
    player.x = p.x; player.z = p.z; player.vx = player.vz = 0; Vitals.startRest(); sat = { x: p.x, z: p.z }; toast(text);
  }
  function act() {
    const p = actNear(); if (!p) return;
    if (p.id === "bed") {
      if (typeof Time !== "undefined" && Time.bedtime && typeof startSleep === "function") { player.x = p.x; player.z = p.z; startSleep(false); }
      else sitAt(p, tr("It is not bedtime yet: you rest a while. Move to get up."));
    } else if (p.id === "stool" || p.id === "cushions") sitAt(p, tr("You sit down. Move to stand up."));
    else if (p.id === "table") {
      if (st.meals.day !== today()) st.meals = { day: today(), n: 0 };
      if (st.meals.n >= MEALS_A_DAY) { toast(tr("You have eaten enough for today.")); return; }
      if (Vitals.coins < MEAL) { toast(tr("A meal costs 15 denarii.")); return; }
      Vitals.coins -= MEAL; Vitals.eat(20, 50); st.meals.n++; save(); Sfx.play("coin"); toast(tr("You eat a good meal at your table."));
    } else if (p.id === "chest") { view = "chest"; note = ""; render(); openPanel("#furnish"); }
    else if (p.id === "plant") {
      if (st.water.day === today()) { toast(tr("The plant has been watered today.")); return; }
      st.water = { day: today(), n: st.water.n + 1 }; save(); refresh(); Sfx.play("splash"); toast(tr("You water the plant. It grows a little."));
    }
  }
  const stash = (id, n) => { const room = CHEST_MAX - Object.values(st.chest).reduce((a, b) => a + b, 0), k = Math.min(n, room, Shopkeep.owns(id)); if (k > 0 && Shopkeep.take(id, k)) { st.chest[id] = (st.chest[id] || 0) + k; save(); } else if (room <= 0) note = tr("The chest is full."); render(); };
  const fetchOut = (id, n) => { const k = Math.min(n, st.chest[id] || 0); if (k > 0) { Shopkeep.give(id, k); st.chest[id] -= k; if (!st.chest[id]) delete st.chest[id]; save(); } render(); };

  // ---------------------------------------------------------------- buying, placing, turning, picking up
  function buy(id) {
    const p = PIECES[id];
    if (!p || Vitals.coins < p[1] || owned(id) >= OWN_MAX) return;
    Vitals.coins -= p[1]; st.own[id] = owned(id) + 1; save(); note = `${tr(p[0])} ✓`; render();
  }
  function place(id) {
    if (free(id) < 1) return;
    if (guest) { note = tr("You are a guest: you cannot move the furniture here."); render(); return; }
    if (!inHouse()) { note = tr("Go inside your own house to put furniture down."); render(); return; }
    const c = here();
    if (st.placed[c].length >= MAX) { note = tr("The house is full: pick something up first."); render(); return; }
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), x = player.x + fx * 1.4, z = player.z + fz * 1.4;
    st.placed[c].push({ id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(player.yaw + Math.PI).toFixed(2) });
    save(); refresh(); note = `${tr(PIECES[id][0])}: ${tr("placed in front of you.")}`; render();
  }
  // the nearest piece in this house, within three steps
  function nearest() {
    const c = here(); let best = null, bd = 3.2;
    for (const p of st.placed[c] || []) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function turn() {
    const p = nearest(); if (!p) { note = tr("Stand beside a piece of furniture."); render(); return; }
    p.yaw = +(((p.yaw + Math.PI / 4 + 3.1416) % (Math.PI * 2)) - 3.1416).toFixed(2); save(); refresh(); note = `${tr(PIECES[p.id][0])}: ${tr("turned.")}`; render();
  }
  function pickUp() {
    const p = nearest(); if (!p) { note = tr("Stand beside a piece of furniture."); render(); return; }
    const arr = st.placed[here()]; arr.splice(arr.indexOf(p), 1); save(); refresh(); note = `${tr(PIECES[p.id][0])}: ${tr("back in your pack.")}`; render();
  }
  // the player market (playermarket.js): a piece you do not have placed goes into a listing, and comes back (or arrives from a buyer) by mail
  const take = (id, n = 1) => { if (!PIECES[id] || free(id) < n) return false; st.own[id] = owned(id) - n; if (!st.own[id]) delete st.own[id]; save(); if ($p("furnish") && $p("furnish").classList.contains("show")) render(); return true; };
  const give = (id, n = 1) => { if (!PIECES[id]) return false; st.own[id] = Math.min(OWN_MAX, owned(id) + n); save(); return true; };
  function sell(id) {
    if (free(id) < 1) return;
    st.own[id] = owned(id) - 1; if (!st.own[id]) delete st.own[id];
    Vitals.coins += Math.round(PIECES[id][1] * 0.5); save(); note = `${tr(PIECES[id][0])}: ${tr("sold for half.")}`; render();
  }

  // ---------------------------------------------------------------- the panel
  function render() {
    const body = $p("fn-body"); if (!body) return;
    const rows = [], c = here();
    if (view === "chest") {
      const total = Object.values(st.chest).reduce((a, b) => a + b, 0), mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      rows.push(el("h3", tr("Your chest")), el("p", `${total} / ${CHEST_MAX} ${tr("goods")}`, "dnote"));
      if (note) rows.push(el("p", note, "sk-note"));
      rows.push(el("h3", tr("In the chest")));
      const inside = el("ul", undefined, "mk-items");
      for (const id of Object.keys(st.chest)) { const li = el("li"), txt = el("span"); txt.append(el("strong", `${tr(Shopkeep.GOODS[id][0])} × ${st.chest[id]}`)); li.append(txt, mk(tr("Take 1"), () => fetchOut(id, 1)), mk(tr("Take all"), () => fetchOut(id, 999))); inside.append(li); }
      rows.push(inside.children.length ? inside : el("p", tr("The chest is empty."), "dnote"));
      rows.push(el("h3", tr("In your pack")));
      const pack = el("ul", undefined, "mk-items");
      for (const id of Shopkeep.IDS) { const n = Shopkeep.owns(id); if (n <= 0) continue; const li = el("li"), txt = el("span"); txt.append(el("strong", `${tr(Shopkeep.GOODS[id][0])} × ${n}`)); li.append(txt, mk(tr("Store 1"), () => stash(id, 1)), mk(tr("Store all"), () => stash(id, 999))); pack.append(li); }
      rows.push(pack.children.length ? pack : el("p", tr("You carry no goods."), "dnote"));
      rows.push(mk(tr("← Back"), () => { view = "shop"; note = ""; render(); }));
      body.replaceChildren(...rows); return;
    }
    rows.push(el("p", tr("You have {0} denarii.").replace("{0}", Math.round(Vitals.coins)), "dnote"));
    if (note) rows.push(el("p", note, "sk-note"));
    const inside = inHouse();
    rows.push(el("p", inside ? tr("You are in your house: stand where you want a piece and press Place.") : tr("Go inside your own house to place furniture (the house you own in this city)."), "dnote"));
    if (inside) {
      const bar = el("div", undefined, "sk-menu");
      for (const [label, f] of [["↻ Turn nearest", turn], ["🧺 Pick up nearest", pickUp]]) { const b = el("button", tr(label)); b.type = "button"; b.addEventListener("click", f); bar.append(b); }
      rows.push(bar);
    }
    rows.push(el("h3", tr("Your furniture")));
    const mine = el("ul", undefined, "mk-items");
    for (const id of IDS) {
      if (!owned(id)) continue;
      const li = el("li"), txt = el("span"), place1 = el("button", tr("Place")), sell1 = el("button", tr("Sell"));
      txt.append(el("strong", `${tr(PIECES[id][0])} × ${owned(id)}`), el("small", `${free(id)} ${tr("in your pack")} · ${placedCount(id, c)} ${tr("in this house")}`));
      place1.type = "button"; place1.disabled = free(id) < 1; place1.addEventListener("click", () => place(id));
      sell1.type = "button"; sell1.disabled = free(id) < 1; sell1.addEventListener("click", () => sell(id));
      li.append(txt, place1, sell1); mine.append(li);
    }
    rows.push(mine.children.length ? mine : el("p", tr("You have no furniture yet. Buy some below."), "dnote"));
    rows.push(el("h3", tr("Furniture for sale")));
    const shop = el("ul", undefined, "mk-items");
    for (const id of IDS) {
      const li = el("li"), txt = el("span"), b = el("button", `${tr("Buy")} · ${PIECES[id][1]}`);
      txt.append(el("strong", tr(PIECES[id][0])));
      b.type = "button"; b.disabled = Vitals.coins < PIECES[id][1] || owned(id) >= OWN_MAX; b.addEventListener("click", () => buy(id));
      li.append(txt, b); shop.append(li);
    }
    rows.push(shop);
    body.replaceChildren(...rows);
  }
  function open() { note = ""; view = "shop"; render(); openPanel("#furnish"); }
  function bind() {
    const b = $p("btn-furn"); if (b) b.addEventListener("click", open);
    setInterval(() => { refresh(); if (sat && !Vitals.resting) sat = null; const p = $p("furnish"); if (p && p.classList.contains("show")) render(); }, 2000);
    setInterval(() => {                                                                           // (your layout goes to the server for your friends; a guest goes home when they walk out)
      if (dirty && typeof Online !== "undefined" && Online.connected && typeof Account !== "undefined" && Account.loggedIn) { dirty = false; Online.navalSend({ t: "social", a: "f_set", placed: st.placed, water: st.water.n }); }
      if (guest) { away = inHouse() && here() === guest.city ? 0 : away + 0.5; if (away > 3) endGuest(); }
    }, 500);
    refresh();
  }
  const snapshot = () => JSON.parse(JSON.stringify(st));
  function restore(r) { st = clean(r); save(); refresh(); }

  return { guestInfo: () => (guest ? { name: guest.name, city: guest.city, n: guestGroup ? guestGroup.children.length : 0, hiddenOwn: !!(groups[guest.city] && !groups[guest.city].visible) } : null), bind, open, visit, onServer, endGuest, act, take, give, free, at, inside: inHouse, promptText, comfort, get seated() { return !!sat && Vitals.resting; }, snapshot, restore, refresh, PIECES, get count() { return Object.values(st.placed).reduce((n, a) => n + a.length, 0); }, place, buy, nearest };
})();
