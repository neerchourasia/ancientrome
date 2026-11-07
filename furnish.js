"use strict";
// Furnish your house: the menu group "Home and furniture" (🛋️ Place furniture, 🛒 Buy furniture, ✋ Move, ↻ Turn and 🧺 Pick up the nearest piece, 🏪 stall, 🎉 party, 📖 guestbook, 🏆 contest and scores). PLACING: press Place beside a piece
// you own and the box closes: a see-through copy of the piece follows your mouse over the floor of your house (green where it can go, red where it cannot); click to put it down, R to turn it, Esc (or Done)
// to finish; if you have more of the same piece the next one follows at once. ✋ Move picks the nearest piece up the same way. (Older text:) 🛋️ Furnish house in the menu. Buy rugs, tables, chests, lamps, plants and more with your denarii, then stand where you want a piece inside your own house (in Rome, Old Delhi,
// Cancún or Beijing) and press Place. The piece stands in front of you; Turn it, or Pick it up again (the nearest piece, within three steps). Each city's house has its own furniture, in the colours of
// that city. Pieces can be walked through (a rug is a rug) and are kept in the browser (rome-furn) and in the saved game (account.js). Depends on world.js (worldScene), market.js (Vitals) and the houses.
// Friends can visit: 🏠 Visit beside a friend in the Friends box takes you to your own house in the city where they have the most furniture and shows THEIR furniture there (yours is hidden) until you walk
// out. The server keeps each player's layout (server.py, "furnished houses") and gives it only to mutual friends. Furniture can also be sold to other players in the player market (playermarket.js).
// A guest can leave a NOTE in the host's guestbook (📖 in the furniture box) or one GIFT (a good or a piece of furniture, by mail); the host can throw a PARTY for 50 denarii: the online friends are asked, and
// each of up to five who come is paid 10 denarii and the host 20.
// COOKING: at your table, besides the plain meal, cook dishes from the goods you carry (a dish uses up its ingredients and heals and fills you more); on a festival day there is also that festival's dish,
// which heals half as much again and can be cooked only that day.
// MY STALL (🏪 in the furniture box): put goods from your pack on a stall at prices of your own; your friends see it when they visit and buy (also while you are away: the money and the goods go by mail; the
// stall holds 8 kinds, 40 of each). The festival COOKING CONTEST (🏆, on feast days): cook the festival dish, enter it, and everybody with an account may vote once; after 20 minutes the dish with the most votes (2
// or more) wins 200 denarii, and each who voted for it 5. 🏆 Friends' scores (menu) compares you with your friends: cases solved, season sets, dishes cooked, harvests, close friendships.
// Some pieces do something when you press F beside them in your house: the BED lets you sleep at night (or rest by day), the TABLE sets a meal (15 denarii, twice a day), the CHEST keeps goods for
// you (60 at most), a STOOL or CUSHIONS let you sit and rest, and a PLANT grows a little for every day you water it. Every different kind of piece in the house also makes you heal 5% faster at home.

const Furnish = (() => {
  const KEY = "rome-furn", MAX = 30, OWN_MAX = 40;
  // id: [name, price, what it looks like]
  const PIECES = {
    rug: ["Rug", 40], table: ["Low table", 60], stool: ["Stool", 15], chest: ["Storage chest", 70], lamp: ["Lamp stand", 35],
    bed: ["Bed", 90], plot: ["Garden bed", 50], plant: ["Potted plant", 20], vase: ["Tall vase", 45], statue: ["Small statue", 120], cushions: ["Floor cushions", 25], screen: ["Folding screen", 80],
  };
  const IDS = Object.keys(PIECES);
  const ACTIONS = { bed: "F: lie down on your bed", table: "F: cook or eat at your table", chest: "F: open your chest", stool: "F: sit down", cushions: "F: sit on the cushions", plant: "F: water the plant", plot: "F: tend your garden bed" };
  const MEAL = 15, MEALS_A_DAY = 2, CHEST_MAX = 60;
  // the GARDEN BED (at most four): sow a seed (cost), water it once on each game day, and when it has had its days of water the harvest is 2 of that good for your cooking.
  // crop: [days of water it needs, seed price, the colour of the ripe plant]
  const CROPS = { cumin: [2, 5, 0x9a7a3a], cacao: [2, 4, 0x7a4a2a], pepper: [2, 8, 0x2f6a2f], jasmine: [3, 8, 0xf2f2e6], vanilla: [3, 9, 0xb8c46a], saffron: [4, 15, 0x8a4aa8] }, HARVEST = 2, PLOTS_MAX = 4;
  const stageOf = (cr) => (cr && CROPS[cr.k] ? Math.min(3, Math.max(1, Math.ceil((3 * cr.g) / CROPS[cr.k][0]))) : 0);
  // dishes: [name, {ingredient good: how many}, heal, fill]; and the dishes of festival days (festival key -> dish), cooked only on that feast
  const RECIPES = [
    ["Olive oil flatbread", { oliveoil: 1, pepper: 1 }, 22, 55], ["Spiced lentils", { cumin: 1, pepper: 1 }, 25, 60], ["Saffron rice", { saffron: 1, cumin: 1 }, 35, 70], ["Hot chocolate", { cacao: 1, honey: 1 }, 28, 50],
    ["Vanilla pudding", { vanilla: 1, honey: 1 }, 30, 55], ["Jasmine tea and snacks", { jasmine: 1, snacks: 1 }, 18, 35], ["Tea-smoked supper", { longjing: 1, oliveoil: 1 }, 30, 60],
  ];
  const FEAST_DISHES = {
    diwali: ["Kheer for Diwali", { saffron: 1, honey: 1 }, 55, 85], holi: ["Gujiya for Holi", { saffron: 1, honey: 1 }, 55, 85], saturnalia: ["Saturnalia honey cake", { honey: 1, oliveoil: 1 }, 50, 80], floralia: ["Floralia flower bread", { honey: 1, oliveoil: 1 }, 50, 80],
    muertos: ["Pan de muerto", { cacao: 1, vanilla: 1, honey: 1 }, 60, 90], equinox: ["Equinox maize cake", { cacao: 1, honey: 1 }, 55, 85], midautumn: ["Mooncake", { honey: 1, jasmine: 1 }, 55, 85], springfest: ["New Year jiaozi", { snacks: 1, jasmine: 1 }, 55, 85],
  };
  const dishes = () => { const f = typeof Festival !== "undefined" && Festival.active && FEAST_DISHES[Festival.id]; return f ? RECIPES.concat([[...f, true]]) : RECIPES; };
  const canCook = (r) => Object.entries(r[1]).every(([id, n]) => Shopkeep.owns(id) >= n);
  // the colours of each city's furniture: main, accent, wood
  const PAL = {
    rome: { main: 0x8a2f2a, accent: 0xd9b44a, wood: 0x6b4a2b }, delhi: { main: 0xd9831f, accent: 0x8a1f4a, wood: 0x5a3a1f },
    cancun: { main: 0x1f9aa8, accent: 0xf2c21b, wood: 0x8a6a3a }, beijing: { main: 0xa51e1e, accent: 0xe2b52a, wood: 0x3a2418 },
  };
  const FLOOR = { rome: 0.15, delhi: 0.02, cancun: 0.15, beijing: 0.15 };
  let st = { own: {}, placed: { rome: [], delhi: [], cancun: [], beijing: [] }, chest: {}, meals: { day: -1, n: 0 }, water: { day: -1, n: 0 }, gifts: {}, cooked: 0, harv: 0, fday: { id: "", day: -1 } };
  const groups = {}, shown = {};
  let note = "";

  const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0);
  function clean(r) {
    const o = { own: {}, placed: { rome: [], delhi: [], cancun: [], beijing: [] }, chest: {}, meals: { day: -1, n: 0 }, water: { day: -1, n: 0 }, gifts: {}, cooked: 0, harv: 0, fday: { id: "", day: -1 } };
    if (r) { o.cooked = Math.min(99999, Math.max(0, Math.floor(+r.cooked) || 0)); o.harv = Math.min(99999, Math.max(0, Math.floor(+r.harv) || 0)); if (r.fday && typeof r.fday.id === "string") o.fday = { id: r.fday.id.slice(0, 16), day: Number.isFinite(+r.fday.day) ? +r.fday.day : -1 }; }
    if (r && r.gifts && typeof r.gifts === "object") for (const id of IDS) if (Array.isArray(r.gifts[id])) { const a = r.gifts[id].filter((x) => typeof x === "string" && x).map((x) => x.slice(0, 18)).slice(0, OWN_MAX); if (a.length) o.gifts[id] = a; }
    if (r && r.chest && typeof r.chest === "object" && typeof Shopkeep !== "undefined") { let room = CHEST_MAX; for (const id of Shopkeep.IDS) { const n = Math.min(room, Math.max(0, Math.floor(+r.chest[id]) || 0)); if (n) { o.chest[id] = n; room -= n; } } }
    if (r && r.meals) o.meals = { day: Number.isFinite(+r.meals.day) ? +r.meals.day : -1, n: Math.min(9, Math.max(0, Math.floor(+r.meals.n) || 0)) };
    if (r && r.water) o.water = { day: Number.isFinite(+r.water.day) ? +r.water.day : -1, n: Math.min(999, Math.max(0, Math.floor(+r.water.n) || 0)) };
    if (r && r.own && typeof r.own === "object") for (const id of IDS) if (Number.isInteger(r.own[id]) && r.own[id] > 0) o.own[id] = Math.min(OWN_MAX, r.own[id]);
    if (r && r.placed && typeof r.placed === "object") for (const c of Object.keys(o.placed)) {
      if (!Array.isArray(r.placed[c])) continue;
      for (const p of r.placed[c].slice(0, MAX)) if (p && PIECES[p.id] && Number.isFinite(+p.x) && Number.isFinite(+p.z)) o.placed[c].push({ id: p.id, x: num(p.x, -1e5, 1e5), z: num(p.z, -1e5, 1e5), yaw: num(p.yaw, -7, 7), ...(typeof p.from === "string" && p.from ? { from: p.from.slice(0, 18) } : {}),
        ...(p.id === "plot" && p.crop && CROPS[p.crop.k] ? { crop: { k: p.crop.k, g: Math.min(9, Math.max(0, Math.floor(+p.crop.g) || 0)), w: Number.isFinite(+p.crop.w) ? +p.crop.w : -1 } } : {}),
        ...(p.id === "plot" && CROPS[p.ck] ? { ck: p.ck, gs: Math.min(3, Math.max(0, Math.floor(+p.gs) || 0)) } : {}) });
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
  const inHouse = () => insideAt(player.x, player.z);
  function insideAt(x, z) {
    const c = here();
    if (c === "rome") return typeof Home !== "undefined" && Home.inside(x, z);
    if (c === "delhi") return typeof Delhi !== "undefined" && Delhi.built && Delhi.homeInside(x, z);
    if (c === "cancun") return typeof Cancun !== "undefined" && Cancun.built && Cancun.homeInside(x, z);
    if (c === "beijing") return typeof Beijing !== "undefined" && Beijing.built && Beijing.homeInside(x, z);
    return false;
  }

  // ---------------------------------------------------------------- the pieces (simple shapes, in the colours of the city)
  function make(id, c, from, crop) {
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
      case "plot": {
        box(1.3, 0.2, 0.8, 0, 0.1, 0, pal.wood); box(1.15, 0.05, 0.65, 0, 0.21, 0, 0x4a3320);
        const stg = crop ? crop.stage : 0, col = crop && CROPS[crop.k] ? CROPS[crop.k][2] : 0x3f8a3f;
        for (let i = 0; i < (stg ? 6 : 0); i++) { const px = -0.45 + (i % 3) * 0.45, pz = i < 3 ? -0.17 : 0.17, h = 0.1 + stg * 0.13; cyl(0.02 + stg * 0.012, 0.05 + stg * 0.025, h, px, 0.23 + h / 2, pz, stg === 3 ? col : 0x4a9a3f, 7); if (stg === 3) ball(0.07, px, 0.25 + h, pz, col); }
      } break;
      case "bed": box(1.05, 0.3, 2.0, 0, 0.15, 0, pal.wood); box(0.95, 0.16, 1.9, 0, 0.38, 0, 0xe9e4d8); box(0.97, 0.1, 1.1, 0, 0.45, 0.4, pal.main); box(0.6, 0.14, 0.3, 0, 0.52, -0.75, 0xf3efe6); break;
      case "vase": cyl(0.13, 0.2, 0.2, 0, 0.1, 0, pal.main); cyl(0.26, 0.13, 0.45, 0, 0.42, 0, pal.main); cyl(0.12, 0.26, 0.3, 0, 0.78, 0, pal.main); cyl(0.14, 0.1, 0.1, 0, 1.0, 0, pal.accent); cyl(0.275, 0.275, 0.05, 0, 0.5, 0, pal.accent); break;
      case "statue": box(0.5, 0.7, 0.5, 0, 0.35, 0, 0xcfc8b8); box(0.55, 0.06, 0.55, 0, 0.73, 0, 0xb8b0a0); cyl(0.16, 0.2, 0.55, 0, 1.05, 0, 0xe9e4d8); ball(0.13, 0, 1.46, 0, 0xe9e4d8); break;
      case "cushions": { const a = cyl(0.36, 0.36, 0.12, -0.4, 0.07, 0, pal.main, 16), b = cyl(0.32, 0.32, 0.11, 0.35, 0.065, 0.1, pal.accent, 16); a.scale.y = b.scale.y = 1; } break;
      case "screen": for (const [x, r] of [[-0.55, 0.45], [0, -0.45], [0.55, 0.45]]) { const p = box(0.55, 1.5, 0.04, x, 0.78, 0, pal.main); p.rotation.y = r; box(0.5, 1.4, 0.045, x, 0.78, 0, pal.accent, { transparent: true, opacity: 0.35 }).rotation.y = r; } break;
      default: box(0.4, 0.4, 0.4, 0, 0.2, 0, pal.wood);
    }
    if (from) {                                                                                  // a gift stays a gift: a little card in front of it with the giver's name
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const x = cv.getContext("2d");
      x.fillStyle = "#f6eed8"; x.fillRect(0, 0, 256, 64); x.strokeStyle = "#a07a2a"; x.lineWidth = 4; x.strokeRect(2, 2, 252, 60);
      x.fillStyle = "#4a3b26"; x.font = "italic 20px Georgia, serif"; x.textAlign = "center"; x.fillText(tr("A gift from"), 128, 25); x.font = "bold 26px Georgia, serif"; x.fillText(from, 128, 53, 236);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) }));
      card.position.set(0, 0.11, id === "rug" ? 0.95 : 0.62); card.rotation.x = -0.9; g.add(card);
    }
    return g;
  }

  const cropView = (p) => (p.id !== "plot" ? null : p.crop ? { k: p.crop.k, stage: stageOf(p.crop) } : p.ck ? { k: p.ck, stage: p.gs } : null);
  // the pieces stand in a group in the world (the position is in world coordinates, so the same group works in every city)
  function refresh() {
    if (typeof worldScene === "undefined" || !worldScene) return;
    for (const c of Object.keys(st.placed)) {
      const sig = JSON.stringify(st.placed[c]) + st.water.n;
      if (shown[c] === sig) continue;
      shown[c] = sig;
      if (groups[c]) { worldScene.remove(groups[c]); groups[c].traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
      const grp = new THREE.Group();
      for (const p of st.placed[c]) { const m = make(p.id, c, p.from, cropView(p)); m.position.set(p.x, FLOOR[c], p.z); m.rotation.y = p.yaw; grp.add(m); }
      worldScene.add(grp); groups[c] = grp;
    }
  }

  // ---------------------------------------------------------------- visiting a friend's house
  function applyVisibility() { for (const c of Object.keys(groups)) groups[c].visible = !(guest && guest.city === c); }
  function endGuest() {
    if (!guest) return;
    if (guestGroup && worldScene) { worldScene.remove(guestGroup); guestGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    guestGroup = null; guest = null; away = 0; applyVisibility(); toast(tr("You are home again."));
  }
  function visit(fid, name) {
    if (typeof Online === "undefined" || !Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast(tr("Visiting needs an account and the game server: log in and wait to be connected.")); return; }
    if (mode !== "walk") { toast(tr("Stop what you are doing first.")); return; }
    Online.navalSend({ t: "social", a: "f_get", fid }); toast(`${tr("Asking to visit")} ${name || ""}...`);
  }
  function onServer(m) {
    if (m.a === "party") { Sfx.play("chime"); Dialog.confirm(`${m.name} ${tr("invites you to a party at their house. Go?")}`).then((yes) => { if (yes) visit(m.fid, m.name); }); return; }
    if (m.a === "party_on") { partyLeft = m.secs; Sfx.play("pop"); Sfx.play("cheer"); toast(tr("🎉 Your party has begun! Your friends have been asked.")); return; }
    if (m.a === "guest") { Sfx.play("pop"); Sfx.play("cheer"); toast(`🎉 ${m.name} ${tr("came to your party: +20 denarii.")}`); return; }
    if (m.a === "note") { Sfx.play("page"); toast(`📝 ${m.name} ${tr("left a note in your guestbook:")} ${m.text}`); return; }
    if (m.a === "note_ok") { Sfx.play("page"); note = tr("Your note is in the guestbook."); render(); return; }
    if (m.a === "gift_ok") { if (m.ik === "good") Shopkeep.take(m.item, m.n); else Furnish.take(m.item, m.n); toast(tr("Your gift is on its way.")); render(); return; }
    if (m.a === "stall") { if (m.fid === "me") stallMe = m.stall || []; else if (guest && guest.fid === m.fid) { guest.stall = m.stall || []; note = ""; } render(); return; }
    if (m.a === "stall_ok") { if (m.dir === "put") Shopkeep.take(m.item, m.n); else Shopkeep.give(m.item, m.n); Sfx.play("thud"); render(); return; }
    if (m.a === "board") { board = m.rows || []; if (view === "board") render(); return; }
    if (m.a === "contest") { contest = m; if (view === "contest") render(); return; }
    if (m.a === "contest_end") { Sfx.play(m.last ? "medal" : "chime"); toast(m.last ? `🏆 ${tr("The cooking contest is over. The winner:")} ${m.last.name} (${tr(m.last.dish)})` : tr("The cooking contest is over: nobody had enough votes.")); contest = null; if (view === "contest") render(); return; }
    if (m.a === "no") { note = tr(m.text); render(); toast(tr(m.text)); return; }
    if (m.a === "layout" && m.book !== undefined) { book = m.book; view = "book"; render(); openPanel("#furnish"); return; }
    if (m.a !== "layout") { toast(tr("You cannot visit that house: only friends can.")); return; }
    const placed = {}, counts = Object.keys(PAL).map((c) => [c, (m.placed[c] || []).length]).sort((a, b) => b[1] - a[1]);
    if (!counts[0][1]) { toast(`${m.name}${tr(" has not furnished a house yet.")}`); return; }
    const c = (m.placed[here()] || []).length ? here() : counts[0][0];
    endGuest();
    if (c !== here()) arriveIn(c);
    if (c === "delhi") { const h = Delhi.homeSpot(); placeAt(h.x, h.z, 0); } else if (c === "cancun") { const h = Cancun.homeSpot(); placeAt(h.x, h.z, 0); } else if (c === "beijing") { const h = Beijing.homeSpot(); placeAt(h.x, h.z, 0); } else placeAt(Home.X, Home.Z - 2.5, 0);
    guest = { name: m.name, city: c, water: +m.water || 0, fid: m.fid, stall: m.stall || [] };
    make.water = guest.water;
    guestGroup = new THREE.Group();
    for (const p of clean({ placed: m.placed }).placed[c]) { const o = make(p.id, c, p.from, cropView(p)); o.position.set(p.x, FLOOR[c], p.z); o.rotation.y = p.yaw; guestGroup.add(o); }
    make.water = undefined;
    worldScene.add(guestGroup); applyVisibility(); away = 0;
    toast(`🏠 ${tr("You are visiting")} ${m.name}${tr("'s house. Walk out of the door to go home.")} ${tr("Open 🛋️ Furnish house to leave a note or a gift.")}${m.party ? ` 🎉 ${tr("A party!")}` : ""}`);
  }

  // where a pet settles in your house (pets.js): a walking pet on cushions, the bed or a rug, a bird on a lamp stand, vase, statue or plant; the nearest of the best kind within nine steps
  function petSpot(flies) {
    if (guest || !inHouse()) return null;
    const want = flies ? { lamp: 1.7, statue: 1.7, vase: 1.2, plant: 1.1 } : { cushions: 0.3, bed: 0.62, rug: 0.1 }, order = Object.keys(want);
    let best = null, bs = 1e9;
    for (const p of st.placed[here()] || []) {
      const k = order.indexOf(p.id); if (k < 0) continue;
      const score = Math.hypot(p.x - player.x, p.z - player.z) + k * 3; if (score < bs && score < 12) { bs = score; best = p; }
    }
    return best ? { x: best.x, z: best.z, y: want[best.id], yaw: best.yaw, name: PIECES[best.id][0].toLowerCase(), label: PIECES[best.id][0] } : null;
  }

  // ---------------------------------------------------------------- what the pieces do
  let sat = null, view = "mine", tab = "mine", book = [], partyLeft = 0, garden = null, stallMe = [], contest = null, board = [], boardKey = "mys", pollN = 0;
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
  // where you lie when you rest or sleep on a bed: the middle of it, on the mattress, head at the pillow end (the bed piece's -z end); game.js draws the avatar flat there
  const lieOn = (p) => ({ x: p.x, z: p.z, y: FLOOR[here()] + 0.5, yaw: p.yaw + Math.PI });
  function sitAt(p, text) {
    player.x = p.x; player.z = p.z; player.vx = player.vz = 0; Vitals.startRest(); sat = { x: p.x, z: p.z, lie: p.id === "bed" ? lieOn(p) : null }; Sfx.play("creak"); toast(text);
  }
  function act() {
    const p = actNear(); if (!p) return;
    if (p.id === "bed") {
      if (typeof Time !== "undefined" && Time.bedtime && typeof startSleep === "function") { player.x = p.x; player.z = p.z; Sfx.play("creak"); startSleep(false); }
      else sitAt(p, tr("It is not bedtime yet: you rest a while. Move to get up."));
    } else if (p.id === "stool" || p.id === "cushions") sitAt(p, tr("You sit down. Move to stand up."));
    else if (p.id === "table") { view = "cook"; note = ""; render(); openPanel("#furnish"); }
    else if (p.id === "chest") { view = "chest"; note = ""; render(); openPanel("#furnish"); }
    else if (p.id === "plot") { garden = p; view = "garden"; note = ""; render(); openPanel("#furnish"); }
    else if (p.id === "plant") {
      if (st.water.day === today()) { toast(tr("The plant has been watered today.")); return; }
      st.water = { day: today(), n: st.water.n + 1 }; save(); refresh(); Sfx.play("splash"); toast(tr("You water the plant. It grows a little."));
    }
  }
  function sow(k) {
    if (!garden || garden.crop || !CROPS[k] || Vitals.coins < CROPS[k][1]) return;
    Vitals.coins -= CROPS[k][1]; garden.crop = { k, g: 0, w: -1 }; save(); refresh(); Sfx.play("thud"); note = `${tr(Shopkeep.GOODS[k][0])}: ${tr("sown. Water it once a day.")}`; render();
  }
  function waterBed() {
    const cr = garden && garden.crop; if (!cr || cr.w === today() || cr.g >= CROPS[cr.k][0]) return;
    cr.w = today(); cr.g++; save(); refresh(); Sfx.play("splash"); note = cr.g >= CROPS[cr.k][0] ? tr("It is ripe! Harvest it.") : tr("You water the bed. It grows a little."); render();
  }
  function harvest() {
    const cr = garden && garden.crop; if (!cr || cr.g < CROPS[cr.k][0]) return;
    if (typeof Guilds !== "undefined") Guilds.score("harvest"); st.harv++; Shopkeep.give(cr.k, HARVEST); delete garden.crop; save(); refresh(); Sfx.play("pop"); Sfx.play("discover"); note = `+${HARVEST} ${tr(Shopkeep.GOODS[cr.k][0])}`; render();
  }
  function plainMeal() {
    if (st.meals.day !== today()) st.meals = { day: today(), n: 0 };
    if (st.meals.n >= MEALS_A_DAY) { note = tr("You have eaten enough for today."); render(); return; }
    if (Vitals.coins < MEAL) { note = tr("A meal costs 15 denarii."); render(); return; }
    Vitals.coins -= MEAL; Vitals.eat(20, 50); st.meals.n++; save(); Sfx.play("coin"); note = tr("You eat a good meal at your table."); render();
  }
  function cook(r) {
    if (!canCook(r)) return;
    for (const [id, n] of Object.entries(r[1])) Shopkeep.take(id, n);
    if (typeof Guilds !== "undefined") Guilds.score("dish"); st.cooked++; if (r[4] && typeof Festival !== "undefined") st.fday = { id: Festival.id, day: today() }; save(); Vitals.eat(r[2], r[3]); Sfx.play("sizzle"); setTimeout(() => Sfx.play("clink"), 900); note = `${tr(r[0])}: ${tr("delicious!")} (+${r[2]})`; render();
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
    if (id === "plot" && totalPlaced("plot") >= PLOTS_MAX) { note = tr("You can keep four garden beds at most."); render(); return; }
    if (st.placed[c].length >= MAX) { note = tr("The house is full: pick something up first."); render(); return; }
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), x = player.x + fx * 1.4, z = player.z + fz * 1.4;
    const piece = { id, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +(player.yaw + Math.PI).toFixed(2) };
    if (st.gifts[id] && st.gifts[id].length) { piece.from = st.gifts[id].shift(); if (!st.gifts[id].length) delete st.gifts[id]; }                  // (a gift in your pack goes down first: its card goes with it)
    st.placed[c].push(piece);
    save(); refresh(); Sfx.play("thud"); note = `${tr(PIECES[id][0])}: ${tr("placed in front of you.")}`; render();
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
    const arr = st.placed[here()]; arr.splice(arr.indexOf(p), 1); if (p.from) (st.gifts[p.id] || (st.gifts[p.id] = [])).push(p.from); save(); refresh(); note = `${tr(PIECES[p.id][0])}: ${tr("back in your pack.")}`; render();
  }
  // the player market (playermarket.js): a piece you do not have placed goes into a listing, and comes back (or arrives from a buyer) by mail
  const trimGifts = (id) => { if (st.gifts[id]) { st.gifts[id].length = Math.min(st.gifts[id].length, Math.max(0, free(id))); if (!st.gifts[id].length) delete st.gifts[id]; } };       // (a piece that goes away goes without its card if you have a plain one: gifts are kept last)
  const take = (id, n = 1) => { if (!PIECES[id] || free(id) < n) return false; st.own[id] = owned(id) - n; if (!st.own[id]) delete st.own[id]; trimGifts(id); save(); if ($p("furnish") && $p("furnish").classList.contains("show")) render(); return true; };
  const give = (id, n = 1, from) => { if (!PIECES[id]) return false; st.own[id] = Math.min(OWN_MAX, owned(id) + n); if (from) { const a = st.gifts[id] || (st.gifts[id] = []); for (let i = 0; i < n && a.length < OWN_MAX; i++) a.push(String(from).slice(0, 18)); } save(); return true; };
  function sell(id) {
    if (free(id) < 1) return;
    st.own[id] = owned(id) - 1; if (!st.own[id]) delete st.own[id]; trimGifts(id);
    Vitals.coins += Math.round(PIECES[id][1] * 0.5); save(); note = `${tr(PIECES[id][0])}: ${tr("sold for half.")}`; render();
  }

  // ---------------------------------------------------------------- the panel
  function render() {
    const body = $p("fn-body"); if (!body) return;
    const rows = [], c = here();
    if (guest) {                                                                                  // a guest: leave a note or a gift
      const mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      rows.push(el("h3", `${tr("You are visiting")} ${guest.name}`));
      if (note) rows.push(el("p", note, "sk-note"));
      rows.push(el("h3", tr("Leave a note")));
      const t = el("input"); t.type = "text"; t.maxLength = 80; t.placeholder = tr("Write a few words..."); rows.push(t, mk(tr("Leave the note"), () => { if (t.value.trim()) Online.navalSend({ t: "social", a: "f_note", fid: guest.fid, text: t.value.trim() }); }));
      rows.push(el("h3", `🏪 ${guest.name}${tr("'s stall")}`));
      if (guest.stall && guest.stall.length) for (const it of guest.stall) { const nm = Shopkeep.GOODS[it.item] ? Shopkeep.GOODS[it.item][0] : it.item, row = el("p", `${tr(nm)} × ${it.n} · ${it.price} ${tr("denarii")} `); row.append(mk(tr("Buy 1"), () => Online.navalSend({ t: "social", a: "f_sbuy", fid: guest.fid, item: it.item, n: 1 }), Vitals.coins < it.price)); rows.push(row); }
      else rows.push(el("p", tr("Nothing is on the stall."), "dnote"));
      rows.push(el("h3", tr("Leave a gift")));
      const sel = el("select"), opts = [];
      for (const id of Shopkeep.IDS) if (Shopkeep.owns(id) > 0) opts.push(["good", id, Shopkeep.GOODS[id][0]]);
      for (const id of IDS) if (free(id) > 0) opts.push(["furn", id, PIECES[id][0]]);
      for (const [ik, id, name] of opts) { const o = el("option", tr(name)); o.value = `${ik}:${id}`; sel.append(o); }
      if (opts.length) rows.push(sel, mk(tr("Leave 1 as a gift"), () => { const [ik, id] = sel.value.split(":"); Online.navalSend({ t: "social", a: "f_gift", fid: guest.fid, item: id, ik, n: 1, label: tr(ik === "good" ? Shopkeep.GOODS[id][0] : PIECES[id][0]) }); }));
      else rows.push(el("p", tr("You have nothing to give: buy goods in the shops, or furniture here."), "dnote"));
      body.replaceChildren(...rows); return;
    }
    if (view === "stall") {
      const mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      rows.push(el("h3", tr("🏪 My stall")), el("p", tr("Put goods out at your own prices. Your friends see the stall when they visit your house and can buy while you are away: the money comes to you by mail."), "dnote"));
      if (note) rows.push(el("p", note, "sk-note"));
      rows.push(el("h3", tr("On your stall")));
      if (!stallMe.length) rows.push(el("p", tr("Nothing is on the stall."), "dnote"));
      for (const it of stallMe) { const nm = Shopkeep.GOODS[it.item] ? Shopkeep.GOODS[it.item][0] : it.item, row = el("p", `${tr(nm)} × ${it.n} · ${it.price} ${tr("denarii")} `); row.append(mk(tr("Take 1 back"), () => Online.navalSend({ t: "social", a: "f_stake", item: it.item, n: 1 })), mk(tr("Take all back"), () => Online.navalSend({ t: "social", a: "f_stake", item: it.item, n: 99 }))); rows.push(row); }
      rows.push(el("h3", tr("Put out")));
      const sel = el("select"), qty = el("input"), price = el("input"); qty.type = price.type = "number"; qty.min = price.min = "1"; qty.value = "1"; qty.style.width = price.style.width = "5em";
      for (const id of Shopkeep.IDS) if (Shopkeep.owns(id) > 0) { const o = el("option", `${tr(Shopkeep.GOODS[id][0])} (${Shopkeep.owns(id)})`); o.value = id; sel.append(o); }
      const sug = () => { price.value = sel.value && Shopkeep.GOODS[sel.value] ? Math.max(1, Math.round(Shopkeep.GOODS[sel.value][1] * 1.2)) : ""; }; sel.addEventListener("change", sug); sug();
      if (sel.options.length) { const row = el("p"); row.append(sel, " ", qty, " × ", price, " ", mk(tr("Put out"), () => { const n = Math.floor(+qty.value), p = Math.floor(+price.value); if (n >= 1 && p >= 1 && n <= Shopkeep.owns(sel.value)) Online.navalSend({ t: "social", a: "f_sput", item: sel.value, n, price: p }); else { note = tr("Check the amount and the price."); render(); } })); rows.push(row); }
      else rows.push(el("p", tr("You carry no goods."), "dnote"));
      rows.push(mk(tr("← Back"), () => { view = tab; note = ""; render(); }));
      body.replaceChildren(...rows); return;
    }
    if (view === "contest") {
      const mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      const fest = typeof Festival !== "undefined" && Festival.active ? Festival.id : "", dishName = FEAST_DISHES[fest] ? FEAST_DISHES[fest][0] : "";
      rows.push(el("h3", `🏆 ${tr("Cooking contest")}${fest ? `: ${tr(Festival.name)}` : ""}`));
      if (!fest || !dishName) { rows.push(el("p", tr("The contest runs on festival days: cook the festival dish at your table and enter it."), "dnote")); }
      else {
        const cooked = st.fday.id === fest && st.fday.day === today(), c = contest && contest.fest === fest ? contest : null;
        rows.push(el("p", `${tr("Cook")} ${tr(dishName)} ${tr("at your table, then enter it. Everybody may vote once; after 20 minutes the dish with the most votes (2 or more) wins 200 denarii.")}`, "dnote"));
        if (c && c.last) rows.push(el("p", `${tr("Last winner:")} ${c.last.name} (${tr(c.last.dish)}, ${c.last.votes} ${tr("votes")})`, "dnote"));
        rows.push(mk(tr("🏆 Enter my festival dish"), () => Online.navalSend({ t: "social", a: "c_enter", fest, dish: dishName }), !cooked || !(typeof Account !== "undefined" && Account.loggedIn)));
        if (!cooked) rows.push(el("p", tr("You have not cooked today's festival dish yet."), "dnote"));
        if (c && c.rows.length) {
          rows.push(el("p", `${Math.floor(c.left / 60)}:${String(c.left % 60).padStart(2, "0")} ${tr("left")}`, "dnote"));
          const ul = el("ul", undefined, "mk-items");
          for (const r of c.rows) { const li = el("li"), tx = el("span"); tx.append(el("strong", `${r.name}${r.me ? ` (${tr("you")})` : ""}`), el("small", `${tr(r.dish)} · ${r.votes} ${tr("votes")}`)); li.append(tx, mk(tr(r.mine ? "Your vote" : "Vote"), () => Online.navalSend({ t: "social", a: "c_vote", fest, fid: r.fid }), r.me || c.voted)); ul.append(li); }
          rows.push(ul);
        } else rows.push(el("p", tr("Nobody has entered yet."), "dnote"));
      }
      rows.push(mk(tr("← Back"), () => { view = tab; note = ""; render(); }));
      body.replaceChildren(...rows); return;
    }
    if (view === "board") {
      const cats = [["mys", "🔎 Cases"], ["sets", "🍂 Sets"], ["dishes", "🍲 Dishes"], ["harv", "🌱 Harvests"], ["fr", "💛 Friends"]];
      rows.push(el("h3", tr("🏆 Friends' scores")));
      const bar = el("div", undefined, "sk-menu");
      for (const [k, label] of cats) { const b = el("button", tr(label)); b.type = "button"; if (k === boardKey) b.className = "on"; b.addEventListener("click", () => { boardKey = k; render(); }); bar.append(b); }
      rows.push(bar);
      const ul = el("ul", undefined, "mk-items");
      board.slice().sort((a, b) => (b[boardKey] - a[boardKey]) || a.name.localeCompare(b.name)).forEach((r, i) => { const li = el("li"), tx = el("span"); tx.append(el("strong", `${i + 1}. ${r.name}${r.me ? ` (${tr("you")})` : ""}`), el("small", cats.map(([k, l]) => `${l.split(" ")[0]} ${r[k]}`).join("  "))); li.append(tx); ul.append(li); });
      rows.push(ul.children.length ? ul : el("p", tr("Add friends to compare yourself with them."), "dnote"));
      rows.push(el("p", tr("Scores are sent when you play: friends who have not played lately may show old numbers."), "dnote"));
      body.replaceChildren(...rows); return;
    }
    if (view === "garden" && garden) {
      const mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      rows.push(el("h3", tr("Your garden bed")), el("p", tr("You have {0} denarii.").replace("{0}", Math.round(Vitals.coins)), "dnote"));
      if (note) rows.push(el("p", note, "sk-note"));
      const cr = garden.crop;
      if (!cr) {
        rows.push(el("p", tr("The bed is empty. Sow a seed: water it once on each game day, and the harvest is 2 of the good, for your cooking."), "dnote"));
        const ul = el("ul", undefined, "mk-items");
        for (const k of Object.keys(CROPS)) { const li = el("li"), tx = el("span"); tx.append(el("strong", tr(Shopkeep.GOODS[k][0])), el("small", `${CROPS[k][0]} ${tr("days of water")}`)); li.append(tx, mk(`${tr("Sow")} · ${CROPS[k][1]}`, () => sow(k), Vitals.coins < CROPS[k][1])); ul.append(li); }
        rows.push(ul);
      } else {
        const need = CROPS[cr.k][0], ripe = cr.g >= need;
        rows.push(el("p", `${tr(Shopkeep.GOODS[cr.k][0])}: ${"🌱".repeat(Math.max(1, cr.g))}${"·".repeat(Math.max(0, need - Math.max(1, cr.g)))} (${cr.g} / ${need} ${tr("days of water")})`, "dnote"));
        rows.push(mk(tr(ripe ? "Watered enough" : cr.w === today() ? "Watered today" : "💧 Water"), waterBed, ripe || cr.w === today()), mk(tr("🧺 Harvest"), harvest, !ripe));
      }
      rows.push(mk(tr("← Back"), () => { view = tab; note = ""; render(); }));
      body.replaceChildren(...rows); return;
    }
    if (view === "cook") {
      const mk = (label, f, dis) => { const b = el("button", label); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", f); return b; };
      rows.push(el("h3", tr("Your table")), el("p", tr("You have {0} denarii.").replace("{0}", Math.round(Vitals.coins)), "dnote"));
      if (note) rows.push(el("p", note, "sk-note"));
      const ul = el("ul", undefined, "mk-items");
      const plain = el("li"), pt = el("span"); pt.append(el("strong", tr("A plain meal")), el("small", `${MEAL} ${tr("denarii")} · ${tr("twice a day")}`)); plain.append(pt, mk(tr("Eat"), plainMeal)); ul.append(plain);
      for (const r of dishes()) {
        const li = el("li"), tx = el("span"), need = Object.entries(r[1]).map(([id, n]) => `${n} × ${tr(Shopkeep.GOODS[id][0])} (${Shopkeep.owns(id)})`).join(" + ");
        tx.append(el("strong", `${r[4] ? "🎉 " : ""}${tr(r[0])}`), el("small", `${need} → +${r[2]} ${tr("health")}${r[4] ? ` · ${tr("today only")}` : ""}`)); li.append(tx, mk(tr("Cook"), () => cook(r), !canCook(r))); ul.append(li);
      }
      rows.push(ul, el("p", tr("Dishes use up the goods you carry: buy them in the shops of the cities. On a festival day there is a festival dish."), "dnote"));
      body.replaceChildren(...rows); return;
    }
    if (view === "book") {
      rows.push(el("h3", tr("📖 Your guestbook")));
      const ul = el("ul", undefined, "mk-items");
      for (const b of book.slice().reverse()) { const li = el("li"), txt = el("span"); txt.append(el("strong", b.name), el("small", b.text)); li.append(txt); ul.append(li); }
      rows.push(ul.children.length ? ul : el("p", tr("Nobody has written in your guestbook yet. Friends who visit your house can leave a note."), "dnote"));
      const back = el("button", tr("← Back")); back.type = "button"; back.addEventListener("click", () => { view = tab; render(); }); rows.push(back);
      body.replaceChildren(...rows); return;
    }
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
      rows.push(mk(tr("← Back"), () => { view = tab; note = ""; render(); }));
      body.replaceChildren(...rows); return;
    }
    rows.push(el("p", tr("You have {0} denarii.").replace("{0}", Math.round(Vitals.coins)), "dnote"));
    if (note) rows.push(el("p", note, "sk-note"));
    const tabs = el("div", undefined, "pm-tabs");
    for (const [k, label] of [["mine", "🛋️ My furniture"], ["buy", "🛒 Buy"], ["house", "🏠 House"]]) { const b = el("button", tr(label)); b.type = "button"; if (k === view) b.className = "on"; b.addEventListener("click", () => { view = tab = k; note = ""; render(); }); tabs.append(b); }
    rows.splice(0, 0, tabs);
    if (view === "buy") {
      rows.push(el("h3", tr("Furniture for sale")));
      const shop = el("ul", undefined, "mk-items");
      for (const id of IDS) {
        const li = el("li"), txt = el("span"), b = el("button", `${tr("Buy")} · ${PIECES[id][1]}`);
        txt.append(el("strong", tr(PIECES[id][0])));
        b.type = "button"; b.disabled = Vitals.coins < PIECES[id][1] || owned(id) >= OWN_MAX; b.addEventListener("click", () => buy(id));
        li.append(txt, b); shop.append(li);
      }
      rows.push(shop); body.replaceChildren(...rows); return;
    }
    const extra = el("div", undefined, "sk-menu");
    const gb = el("button", tr("📖 Guestbook")); gb.type = "button"; gb.addEventListener("click", () => Online.navalSend({ t: "social", a: "f_get", fid: "me" }));
    const pb = el("button", tr("🎉 Throw a party (50 denarii)")); pb.type = "button"; pb.disabled = Vitals.coins < 50 || partyLeft > 0; pb.addEventListener("click", () => { if (guest) return; Online.navalSend({ t: "social", a: "f_party" }); });
    const sb = el("button", tr("🏪 My stall")); sb.type = "button"; sb.addEventListener("click", () => { view = "stall"; note = ""; Online.navalSend({ t: "social", a: "f_sget" }); render(); });
    const cb = el("button", tr("🏆 Cooking contest")); cb.type = "button"; cb.hidden = !(typeof Festival !== "undefined" && Festival.active); cb.addEventListener("click", () => { view = "contest"; note = ""; contest = null; Online.navalSend({ t: "social", a: "c_list", fest: Festival.id }); render(); });
    const inside = inHouse();
    if (view === "house") {
      rows.push(el("p", inside ? tr("You are in your house.") : tr("Go inside your own house to place furniture (the house you own in this city)."), "dnote"));
      if (inside) {
        const bar = el("div", undefined, "sk-menu");
        for (const [label, f] of [["✋ Move nearest", () => { closePanels(); movePiece(); }], ["↻ Turn nearest", turn], ["🧺 Pick up nearest", pickUp]]) { const b = el("button", tr(label)); b.type = "button"; b.addEventListener("click", f); bar.append(b); }
        rows.push(bar);
      }
      if (typeof Account !== "undefined" && Account.loggedIn) { extra.append(gb, pb, sb, cb); rows.push(extra); }
      else rows.push(el("p", tr("Log in to throw parties, keep a stall and use the guestbook."), "dnote"));
      body.replaceChildren(...rows); return;
    }
    rows.push(el("p", inside ? tr("You are in your house: drag a piece from the list onto the floor, or press Place and click where it goes.") : tr("Go inside your own house to place furniture (the house you own in this city)."), "dnote"));
    rows.push(el("h3", tr("Your furniture")));
    const mine = el("ul", undefined, "mk-items");
    for (const id of IDS) {
      if (!owned(id)) continue;
      const li = el("li"), txt = el("span"), place1 = el("button", tr("Place")), sell1 = el("button", tr("Sell"));
      txt.append(el("strong", `${tr(PIECES[id][0])} × ${owned(id)}`), el("small", `${free(id)} ${tr("in your pack")} · ${placedCount(id, c)} ${tr("in this house")}`));
      place1.type = "button"; place1.disabled = free(id) < 1; place1.addEventListener("click", () => startPlace(id));
      sell1.type = "button"; sell1.disabled = free(id) < 1; sell1.addEventListener("click", () => sell(id));
      const handle = el("span", "⠿", "drag-handle"); handle.style.cssText = "cursor:grab;touch-action:none;padding:0 8px 0 2px;font-size:1.3rem;opacity:.7;align-self:center";
      li.style.cursor = "grab"; li.title = tr("Drag it onto the floor of your house, or press Place"); li.addEventListener("pointerdown", (ev) => beginListDrag(ev, id));
      li.append(handle, txt, place1, sell1); mine.append(li);
    }
    rows.push(mine.children.length ? mine : el("p", tr("You have no furniture yet: open the Buy tab."), "dnote"));
    body.replaceChildren(...rows);
  }
  function open(t) { note = ""; tab = view = typeof t === "string" ? t : (Object.keys(st.own).length ? "mine" : "buy"); render(); openPanel("#furnish"); }
  const quick = (f) => () => { note = ""; f(); if (note) toast(note); };                          // (the menu's one-step buttons: the answer comes as a toast, not in the box)
  function openStall() { view = "stall"; note = ""; Online.navalSend({ t: "social", a: "f_sget" }); render(); openPanel("#furnish"); }
  function openContest() { view = "contest"; note = ""; contest = null; if (typeof Festival !== "undefined" && Festival.active) Online.navalSend({ t: "social", a: "c_list", fest: Festival.id }); render(); openPanel("#furnish"); }
  const needAccount = () => { if (typeof Online === "undefined" || !Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast(tr("This needs your account and the game server: log in and wait to be connected.")); return false; } return true; };

  // ---------------------------------------------------------------- placing: a see-through copy of the piece follows the mouse over the floor of your house
  let placing = null, lastPtr = null, downAt2 = null, hintEl = null;
  const ray = typeof THREE !== "undefined" ? new THREE.Raycaster() : null, ndc = typeof THREE !== "undefined" ? new THREE.Vector2() : null;
  function floorPoint(ev) {
    if (!ev || typeof renderer === "undefined" || typeof camera === "undefined") return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction; if (d.y > -0.02) return null;
    const t = (FLOOR[here()] - o.y) / d.y; return t > 0 ? { x: o.x + d.x * t, z: o.z + d.z * t } : null;
  }
  function tint(g, ok) { g.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = 0.6; o.material.depthWrite = false; if (o.material.emissive) o.material.emissive.setHex(ok ? 0x1f6a2a : 0x7a1f1f); } }); }
  function ghostAt(x, z) {
    if (!placing) return;
    const dx = x - player.x, dz = z - player.z, d = Math.hypot(dx, dz); if (d > 9) { x = player.x + (dx / d) * 9; z = player.z + (dz / d) * 9; }          // (within nine steps of you)
    placing.x = x; placing.z = z; placing.ok = insideAt(x, z);
    placing.ghost.position.set(x, FLOOR[here()] + 0.02, z); placing.ghost.rotation.y = placing.yaw; tint(placing.ghost, placing.ok);
  }
  function buildGhost() {
    if (placing.ghost) { worldScene.remove(placing.ghost); placing.ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    placing.ghost = make(placing.id, here(), placing.piece && placing.piece.from, placing.piece ? cropView(placing.piece) : null); worldScene.add(placing.ghost); ghostAt(placing.x, placing.z);
  }
  function showHint(mode) {
    if (!hintEl) {
      hintEl = document.createElement("div"); hintEl.id = "place-hint";
      hintEl.style.cssText = "position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:60;background:rgba(30,22,12,.94);color:#f4ead6;border:1px solid #e2b955;border-radius:10px;padding:8px 12px;font:600 .85rem system-ui,sans-serif;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:94vw";
      document.body.append(hintEl);
    }
    const t = document.createElement("span"), bs = [];
    if (mode === "arrange") { t.textContent = tr("Arrange: drag a piece to move it, drop it where it goes"); bs.push(["✕ Done (Esc)", () => setArrange(false)]); }
    else { t.textContent = `${tr(PIECES[placing.id][0])}: ${tr(placing.drag ? "drop it on the floor" : "click where it goes")}`; bs.push(["↻ Turn (R)", () => turnGhost()], ["✓ Place here (Enter)", () => confirmPlace()], ["✕ Done (Esc)", () => endPlace(true)]); }
    hintEl.replaceChildren(t);
    for (const [label, f] of bs) { const b = document.createElement("button"); b.type = "button"; b.textContent = tr(label); b.style.cssText = "font:inherit;cursor:pointer;padding:5px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.3);background:#ffd24a;color:#2a2118"; b.addEventListener("click", f); hintEl.append(b); }
    hintEl.style.display = "flex";
  }
  function onMove(ev) { lastPtr = ev; const p = floorPoint(ev); if (p) ghostAt(p.x, p.z); }
  function onDown(ev) { downAt2 = { x: ev.clientX, y: ev.clientY }; }
  function onClick(ev) {
    if (!placing || (hintEl && hintEl.contains(ev.target)) || !downAt2 || Math.hypot(ev.clientX - downAt2.x, ev.clientY - downAt2.y) > 6) return;
    const p = floorPoint(ev); if (p) ghostAt(p.x, p.z);
    confirmPlace();
  }
  function onKey(ev) {
    if (!placing) return;
    if (ev.code === "KeyR") { ev.preventDefault(); ev.stopImmediatePropagation(); turnGhost(); }
    else if (ev.code === "Enter") { ev.preventDefault(); ev.stopImmediatePropagation(); confirmPlace(); }
    else if (ev.code === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); endPlace(true); }
  }
  function turnGhost() { if (placing) { placing.yaw = +(((placing.yaw + Math.PI / 4 + 3.1416) % (Math.PI * 2)) - 3.1416).toFixed(2); ghostAt(placing.x, placing.z); Sfx.play("creak"); } }
  function startPlace(id, piece, opts) {
    if (guest) { note = tr("You are a guest: you cannot move the furniture here."); render(); return; }
    if (!inHouse()) { note = tr("Go inside your own house to put furniture down."); render(); return; }
    if (!piece) {
      if (free(id) < 1) return;
      if (id === "plot" && totalPlaced("plot") >= PLOTS_MAX) { note = tr("You can keep four garden beds at most."); render(); return; }
      if (st.placed[here()].length >= MAX) { note = tr("The house is full: pick something up first."); render(); return; }
    }
    endPlace(false);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    placing = { id, piece: piece || null, orig: piece ? { x: piece.x, z: piece.z, yaw: piece.yaw } : null, x: piece ? piece.x : player.x + fx * 2, z: piece ? piece.z : player.z + fz * 2, yaw: piece ? piece.yaw : +(player.yaw + Math.PI).toFixed(2), ghost: null, ok: true };
    placing.drag = !!(opts && opts.drag); placing.arrange = !!(opts && opts.arrange); downAt2 = null;
    if (piece) { const arr = st.placed[here()]; arr.splice(arr.indexOf(piece), 1); refresh(); }                  // (lifted while you choose a new place: it goes back if you give up)
    buildGhost(); closePanels(); if (!placing.arrange) showHint("place");
    window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerdown", onDown, true); window.addEventListener("click", onClick, true); window.addEventListener("keydown", onKey, true); window.addEventListener("pointerup", onUp, true);
  }
  function endPlace(cancelled) {
    if (!placing) return;
    const p = placing; placing = null;
    if (p.ghost) { worldScene.remove(p.ghost); p.ghost.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    if (p.piece && !p.done) { p.piece.x = p.orig.x; p.piece.z = p.orig.z; p.piece.yaw = p.orig.yaw; st.placed[here()].push(p.piece); refresh(); }
    window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerdown", onDown, true); window.removeEventListener("click", onClick, true); window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerup", onUp, true);
    if (arrange) showHint("arrange"); else if (hintEl) hintEl.style.display = "none";
    if (cancelled && !p.piece && !p.drag) toast(tr("Done."));
  }
  function confirmPlace() {
    if (!placing) return;
    if (!placing.ok) { Sfx.play("oof"); if (placing.arrange) { endPlace(false); toast(tr("That is not a place for it: it went back.")); return; } toast(tr("Put it down inside your house.")); return; }
    const p = placing, c = here(), x = +p.x.toFixed(2), z = +p.z.toFixed(2);
    if (p.piece) { p.piece.x = x; p.piece.z = z; p.piece.yaw = p.yaw; st.placed[c].push(p.piece); p.done = true; save(); refresh(); Sfx.play("thud"); endPlace(false); toast(`${tr(PIECES[p.id][0])}: ${tr("moved.")}`); return; }
    if (free(p.id) < 1 || st.placed[c].length >= MAX) { endPlace(false); return; }
    const piece = { id: p.id, x, z, yaw: p.yaw };
    if (st.gifts[p.id] && st.gifts[p.id].length) { piece.from = st.gifts[p.id].shift(); if (!st.gifts[p.id].length) delete st.gifts[p.id]; }
    st.placed[c].push(piece); save(); refresh(); Sfx.play("thud");
    if (!p.drag && free(p.id) > 0 && st.placed[c].length < MAX && !(p.id === "plot" && totalPlaced("plot") >= PLOTS_MAX)) { toast(`${tr(PIECES[p.id][0])}: ${tr("placed. Click for the next one, Esc to finish.")}`); buildGhost(); }
    else { endPlace(false); toast(`${tr(PIECES[p.id][0])}: ${tr("placed.")}`); }
  }
  // dropping: the mouse button is let go over the floor (a piece dragged out of the list, or lifted in arrange mode); a drop that cannot be (outside the house) goes back, or in the list case stays as a click-to-place
  function onUp(ev) { if (!placing || !placing.drag) return; const q = placing, p = floorPoint(ev); if (p) ghostAt(p.x, p.z); confirmPlace(); if (placing === q) { q.drag = false; showHint("place"); } }
  function beginListDrag(ev, id) {
    if (ev.button > 0 || (ev.target.closest && ev.target.closest("button")) || guest || free(id) < 1 || !inHouse()) return;
    if (ev.pointerType === "touch" && !(ev.target.closest && ev.target.closest(".drag-handle"))) return;                  // (a finger on the list scrolls it: only the handle drags)
    const x0 = ev.clientX, y0 = ev.clientY;
    const cleanup = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", cleanup, true); };
    const move = (e) => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) { cleanup(); startPlace(id, null, { drag: true }); if (placing) onMove(e); } };
    window.addEventListener("pointermove", move, true); window.addEventListener("pointerup", cleanup, true);
  }
  // arrange mode: drag any piece in your house with the mouse (the camera does not turn while you hold a piece)
  let arrange = false, armed = null;
  function pieceAt(ev) {
    const g = groups[here()]; if (!g || typeof renderer === "undefined" || !ray) return null;
    const r = renderer.domElement.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(g.children, true)[0]; if (!hit) return null;
    let o = hit.object; while (o.parent && o.parent !== g) o = o.parent;
    const i = g.children.indexOf(o); return i >= 0 ? (st.placed[here()][i] || null) : null;
  }
  function disarm() { armed = null; window.removeEventListener("pointermove", armMove, true); window.removeEventListener("pointerup", disarm, true); }
  function armMove(ev) { if (armed && Math.hypot(ev.clientX - armed.x, ev.clientY - armed.y) > 5) { const p = armed.piece; disarm(); startPlace(p.id, p, { drag: true, arrange: true }); if (placing) onMove(ev); } }
  function onArrangeDown(ev) {
    if (!arrange || placing || ev.button > 0 || typeof renderer === "undefined" || ev.target !== renderer.domElement) return;
    const p = pieceAt(ev); if (!p) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    armed = { piece: p, x: ev.clientX, y: ev.clientY };
    window.addEventListener("pointermove", armMove, true); window.addEventListener("pointerup", disarm, true);
  }
  function onArrangeKey(ev) { if (arrange && !placing && ev.code === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); setArrange(false); } }
  function setArrange(on) {
    if (on === arrange) return;
    if (on && (guest || !inHouse())) { toast(tr("Go inside your own house first.")); return; }
    arrange = on;
    const b = $p("btn-farrange"); if (b) b.classList.toggle("active", on);
    if (on) { window.addEventListener("pointerdown", onArrangeDown, true); window.addEventListener("keydown", onArrangeKey, true); showHint("arrange"); }
    else { disarm(); window.removeEventListener("pointerdown", onArrangeDown, true); window.removeEventListener("keydown", onArrangeKey, true); if (placing) endPlace(false); else if (hintEl) hintEl.style.display = "none"; }
  }
  function movePiece() {
    if (guest || !inHouse()) { toast(tr("Go inside your own house first.")); return; }
    const p = nearest(); if (!p) { toast(tr("Stand beside a piece of furniture.")); return; }
    startPlace(p.id, p);
  }
  function openBoard() {
    if (typeof Online === "undefined" || !Online.connected || typeof Account === "undefined" || !Account.loggedIn) { toast(tr("Friends' scores need an account and the game server: log in and wait to be connected.")); return; }
    view = "board"; note = ""; sendStats(); Online.navalSend({ t: "social", a: "f_board" }); render(); openPanel("#furnish");
  }
  let lastStats = "";
  function sendStats() {                                                                           // (what friends see of you: counts only)
    if (typeof Online === "undefined" || !Online.connected || typeof Account === "undefined" || !Account.loggedIn) return;
    const s = { mys: typeof Mystery !== "undefined" ? Mystery.solved : 0, sets: typeof Seasons !== "undefined" ? Seasons.sets : 0, dishes: st.cooked, harv: st.harv, fr: typeof Lives !== "undefined" ? Lives.friends : 0 }, k = JSON.stringify(s);
    if (k !== lastStats) { lastStats = k; Online.navalSend({ t: "social", a: "f_stats", ...s }); }
  }
  function bind() {
    const b = $p("btn-furn"); if (b) b.addEventListener("click", () => open("mine"));
    const on = (id, f) => { const e = $p(id); if (e) e.addEventListener("click", f); };
    on("btn-farrange", () => setArrange(!arrange)); on("btn-fbuy", () => open("buy")); on("btn-fmove", movePiece); on("btn-fturn", quick(turn)); on("btn-fpick", quick(pickUp));
    on("btn-fstall", () => { if (needAccount()) openStall(); }); on("btn-fcontest", () => { if (needAccount()) openContest(); });
    on("btn-fparty", () => { if (!needAccount()) return; if (guest) return; if (Vitals.coins < 50) { toast(tr("A party costs 50 denarii.")); return; } if (partyLeft > 0) { toast(tr("Your party is still going.")); return; } Online.navalSend({ t: "social", a: "f_party" }); });
    on("btn-fbook", () => { if (needAccount()) Online.navalSend({ t: "social", a: "f_get", fid: "me" }); });
    const fb = $p("btn-fboard"); if (fb) fb.addEventListener("click", openBoard);
    setInterval(() => { sendStats(); const p = $p("furnish"); if (p && p.classList.contains("show") && Online.connected) { pollN++; if (view === "contest" && pollN % 3 === 0 && typeof Festival !== "undefined" && Festival.active) Online.navalSend({ t: "social", a: "c_list", fest: Festival.id }); if (view === "board" && pollN % 5 === 0) Online.navalSend({ t: "social", a: "f_board" }); } }, 2000);
    setInterval(() => { refresh(); if (sat && !Vitals.resting) sat = null; const p = $p("furnish"); if (p && p.classList.contains("show")) render(); }, 2000);
    setInterval(() => { if (partyLeft > 0) partyLeft -= 1; }, 1000);
    setInterval(() => {                                                                           // (your layout goes to the server for your friends; a guest goes home when they walk out)
      if (dirty && typeof Online !== "undefined" && Online.connected && typeof Account !== "undefined" && Account.loggedIn) { dirty = false; Online.navalSend({ t: "social", a: "f_set", placed: serial(), water: st.water.n }); }
      if (arrange && (guest || !inHouse())) setArrange(false);
      if (guest) { away = inHouse() && here() === guest.city ? 0 : away + 0.5; if (away > 3) endGuest(); }
    }, 500);
    refresh();
  }
  const serial = () => { const o = {}; for (const c of Object.keys(st.placed)) o[c] = st.placed[c].map((p) => (p.crop ? { ...p, ck: p.crop.k, gs: stageOf(p.crop) } : p)); return o; };      // (friends see the stage of what grows)
  const snapshot = () => JSON.parse(JSON.stringify(st));
  function restore(r) { st = clean(r); save(); refresh(); }

  return { lying: () => (sat && sat.lie && Vitals.resting && !guest ? sat.lie : null), bedNear: (x, z) => { if (guest) return null; let best = null, bd = 3.2; for (const p of st.placed[here()] || []) { if (p.id !== "bed") continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best ? lieOn(best) : null; }, openBoard, startPlace, movePiece, arranging: () => arrange, pieceAt: (ev) => { const p = pieceAt(ev); return p ? { id: p.id, x: p.x, z: p.z } : null; }, placingInfo: () => (placing ? { id: placing.id, x: placing.x, z: placing.z, yaw: placing.yaw, ok: placing.ok, move: !!placing.piece } : null), petSpot, guestInfo: () => (guest ? { name: guest.name, city: guest.city, n: guestGroup ? guestGroup.children.length : 0, hiddenOwn: !!(groups[guest.city] && !groups[guest.city].visible) } : null), bind, open, visit, onServer, endGuest, act, take, give, free, at, inside: inHouse, promptText, comfort, get seated() { return !!sat && Vitals.resting; }, snapshot, restore, refresh, PIECES, get count() { return Object.values(st.placed).reduce((n, a) => n + a.length, 0); }, place, buy, nearest };
})();
