"use strict";
// Archaeology dig: ⛏ Archaeology dig in the menu (Play and compete). Every city has three dig sites (a roped-off trench with a spoil heap and a sieve, near some of its sights). Stand by one and open the
// menu to dig: a grid of sand covers three buried finds, and you have 40 strokes. The BRUSH takes one layer off one square (and you can drag it); it never harms anything. The TROWEL takes two layers off one
// square and one off its four neighbours for two strokes, which is quicker, but a trowel that lands on a find cracks it (a cracked find is worth less). A speck of colour shows through the sand when something
// lies just under it, so brush first, and trowel where there is only sand. Find all three and every one is taken out and written up: it pays its worth (less for cracks, 25% more if none cracked) and is kept in
// 📜 My finds, with what it tells us about the city. A whole city's finds earn a bonus. A site rests for three minutes after a dig. Finds are kept in this browser (in class mode: this tab) and only on your own
// screen. Depends on game.js (city, era, skin, player, scene, started, mode, openPanel, closePanels, toast, startDirections), vitals.js, physics.js (blockedAt, groundAt, dynBlockers) and landmarks.

const Dig = (() => {
  const T = THREE, COLS = 8, ROWS = 6, CELL = 60, STROKES = 40, REST = 3 * 60000, REACH = 28, BONUS = 400, KEY = "rome-dig";
  const CITIES = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
  const SITE_NEAR = {                                                       // the sights each city's three sites stand near
    rome: ["forum", "palatine", "hercules"], delhi: ["d-haveli", "d-serai", "d-katra"], cancun: ["c-castillo", "c-warriors", "c-cenote"], beijing: ["b-heaven", "b-drum", "b-hutong"],
  };
  // what can be found: id, city, picture, name, worth in denarii and what it tells us
  const ARTS = [
    ["amphora", "rome", "🏺", "Olive-oil amphora", 40, "Amphorae carried oil, wine and fish sauce. The broken ones were piled up into a hill in Rome, Monte Testaccio, still about 35 metres high and made of tens of millions of jars."],
    ["denarius", "rome", "🪙", "Silver denarius of Hadrian", 60, "Hadrian's coins show him with a beard, a new fashion: the emperors before him were clean-shaven. A denarius was roughly a day's pay for a soldier."],
    ["lamp", "rome", "🕯️", "Clay oil lamp", 30, "Romans lit their homes with lamps that burned olive oil, made in moulds by the thousand. The light was small and flickering."],
    ["gladius", "rome", "🗡️", "Legionary's gladius", 80, "The short sword of the legions, about half a metre long, made for stabbing in a tight line of shields."],
    ["ring", "rome", "💍", "Signet ring", 70, "Romans pressed their rings into wax to seal letters and contracts, the way we sign our names."],
    ["tablet", "rome", "📜", "Wax writing tablet", 50, "Children and clerks wrote on wax with a pointed stylus, then smoothed the wax flat to write again."],
    ["rupee", "delhi", "🪙", "Silver rupee of the Mughals", 60, "Sher Shah Suri made the silver rupee, and the Mughals kept it. The word rupee still names the money of India."],
    ["jar", "delhi", "🏺", "Glazed water jar", 35, "Clay jars kept water cool. The Red Fort had its own canal, the Nahr-i-Bihisht, the Stream of Paradise."],
    ["katar", "delhi", "🗡️", "Katar push-dagger", 80, "A katar is an Indian dagger held like a punch, with the blade pointing forward from the fist."],
    ["beads", "delhi", "📿", "Prayer beads", 40, "Strings of 33 or 99 beads help count prayers and the names of God in Islam."],
    ["diya", "delhi", "🪔", "Brass diya lamp", 30, "A diya is a small oil lamp. Thousands of them are lit at Diwali, the festival of lights."],
    ["miniature", "delhi", "🖼️", "Mughal miniature painting", 90, "Mughal painters worked with brushes so fine that some were made from a few hairs of a squirrel's tail."],
    ["jade", "cancun", "🟢", "Jade bead", 70, "The Maya valued jade above gold. It came from the mountains of Guatemala, a long way from the coast."],
    ["obsidian", "cancun", "🔪", "Obsidian blade", 55, "Obsidian is volcanic glass and its edge is sharper than steel. The Maya traded it from far away."],
    ["cacao", "cancun", "🍫", "Cacao beans", 35, "Cacao beans were used as money and made into a bitter chocolate drink, drunk by the rich."],
    ["shell", "cancun", "🐚", "Shell pendant", 30, "Shells from the Caribbean coast were worn as jewellery and traded to cities inland."],
    ["chacmool", "cancun", "🗿", "Chac Mool figure", 90, "A reclining figure holding a bowl for offerings, like the one on top of the Temple of the Warriors."],
    ["ball", "cancun", "🏀", "Rubber ball", 60, "The Maya made rubber from the sap of a tree. Their ball for the ball game was solid and very heavy."],
    ["cash", "beijing", "🪙", "Copper cash coin", 30, "Chinese coins had a square hole so that hundreds of them could be strung together."],
    ["bowl", "beijing", "🍵", "Blue-and-white porcelain bowl", 90, "Ming potters in Jingdezhen painted cobalt blue under a clear glaze. It was sold across the whole world."],
    ["bell", "beijing", "🔔", "Bronze bell", 60, "Bells and drums marked the hours: the Bell Tower and Drum Tower told the time to the whole city."],
    ["brush", "beijing", "🖌️", "Ink brush and inkstone", 45, "Scholars ground an ink stick on an inkstone with a little water and wrote with a brush."],
    ["chopsticks", "beijing", "🥢", "Chopsticks", 25, "People in China have eaten with chopsticks for more than three thousand years."],
    ["seal", "beijing", "🐉", "Dragon seal", 80, "Officials pressed carved seals, with dragons or lions on top, into red ink to sign documents."],
  ].map(([id, c, pic, name, worth, text]) => ({ id, city: c, pic, name, worth, text }));
  const BY_ID = Object.fromEntries(ARTS.map((a) => [a.id + "@" + a.city, a]));
  const $d = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });

  let store = { finds: {}, last: {}, bonus: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "{}"); if (s && typeof s === "object") store = { finds: s.finds || {}, last: s.last || {}, bonus: s.bonus || {} }; } catch (e) { /* no saved finds */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage full or unavailable: the finds last until the page closes */ } };
  const found = (a) => store.finds[a.id + "@" + a.city];

  let scene = null, shown = [], key = "", sites = {}, siteT = 1.5, noted = new Set(), tab = "dig", cur = null, noteT = 0;
  const period = () => (era === "modern" ? "modern" : skin ? "mid" : "ancient");

  // ---- where the sites are: the first clear patch near each sight (the same for everybody)
  function pickSites() {
    const saved = dynBlockers.map((d) => d.on); dynBlockers.forEach((d) => { d.on = false; });
    const out = [], hs = typeof MountHire !== "undefined" ? MountHire.site : null;                       // (not on top of the mount hire stand)
    try {
      for (const id of SITE_NEAR[city]) {
        const lm = ALL_LANDMARKS.find((l) => l.id === id); if (!lm) continue;
        const [bx, bz] = lm.stand || [lm.x, lm.z], g0 = groundAt(bx, bz);
        let pick = null;
        for (const rad of [14, 22, 32, 44, 58, 74]) { for (let a = 0; a < 16 && !pick; a++) {
          const cx = bx + Math.cos(a * Math.PI / 8) * rad, cz = bz + Math.sin(a * Math.PI / 8) * rad;
          if (out.some((o) => Math.hypot(o.x - cx, o.z - cz) < 30) || (hs && Math.hypot(hs[0] - cx, hs[1] - cz) < 24)) continue;
          if ([[0, 0], [-5, 0], [5, 0], [0, 4], [0, -4], [-5, 4], [5, 4], [-5, -4], [5, -4]].every(([dx, dz]) => { const x = cx + dx, z = cz + dz, y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 1.5 && !blockedAt(x, z, y); })) pick = { x: cx, z: cz, yaw: Math.atan2(lm.x - cx, lm.z - cz) };
        } if (pick) break; }
        if (pick) out.push({ ...pick, id: `${city}:${out.length}`, near: id });
      }
    } finally { dynBlockers.forEach((d, i) => { d.on = saved[i]; }); }
    return out;
  }
  // ---- a site: the trench with rope, stakes, the spoil heap, a sieve and a sunshade
  function make() {
    const g = new T.Group(), soil = lam(0x5a4630), wood = lam(0x8a6a3e), sand = lam(0xb99a62);
    const add = (geo, m, x, y, z, rx = 0, ry = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, 0); o.castShadow = true; g.add(o); return o; };
    add(new T.BoxGeometry(6, 0.05, 4), soil, 0, 0.06, 0);
    for (const [x, z] of [[-3.3, -2.3], [3.3, -2.3], [-3.3, 2.3], [3.3, 2.3]]) add(new T.CylinderGeometry(0.06, 0.06, 1.1, 6), wood, x, 0.55, z);
    const tape = lam(0xc0262b);
    add(new T.BoxGeometry(6.6, 0.04, 0.04), tape, 0, 1.0, -2.3); add(new T.BoxGeometry(6.6, 0.04, 0.04), tape, 0, 1.0, 2.3);
    add(new T.BoxGeometry(0.04, 0.04, 4.6), tape, -3.3, 1.0, 0); add(new T.BoxGeometry(0.04, 0.04, 4.6), tape, 3.3, 1.0, 0);
    add(new T.ConeGeometry(1.8, 1.3, 9), sand, 4.9, 0.65, 0.6);
    const sieve = add(new T.BoxGeometry(1.2, 0.08, 0.9), lam(0x4a4a4a), -4.4, 0.8, 1.2); sieve.rotation.x = -0.25;
    for (const [x, z] of [[-4.9, 0.9], [-3.9, 0.9], [-4.9, 1.5], [-3.9, 1.5]]) add(new T.CylinderGeometry(0.04, 0.04, 0.8, 5), wood, x, 0.4, z);
    add(new T.CylinderGeometry(0.05, 0.05, 2.6, 6), wood, 4.2, 1.3, -3.4); const shade = add(new T.ConeGeometry(2.0, 0.6, 12), lam(0xe8dcc0), 4.2, 2.7, -3.4);
    add(new T.BoxGeometry(0.7, 0.45, 0.5), wood, -1.6, 0.22, 3.1);
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "rgba(34,26,16,.9)"; x.strokeStyle = "#e2b955"; x.lineWidth = 6; x.beginPath(); x.roundRect(6, 14, 500, 100, 18); x.fill(); x.stroke();
    x.fillStyle = "#f1ead8"; x.font = "bold 40px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("⛏ " + tr("Dig site"), 256, 50, 470);
    x.font = "26px sans-serif"; x.fillStyle = "#e2b955"; x.fillText(tr("open the menu to dig"), 256, 88, 470);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false })); sp.scale.set(8, 2, 1); sp.position.set(0, 4.2, 0); sp.userData.label = true; g.add(sp);
    g.userData.shade = shade; return g;
  }
  function rebuild() {
    for (const s of shown) scene.remove(s.g); shown = [];
    key = `${city}|${period()}`;
    for (const s of sites[key] || []) { const g = make(); g.position.set(s.x, groundAt(s.x, s.z), s.z); g.rotation.y = s.yaw; g.children.forEach((o) => { if (o.userData.label) o.visible = false; }); scene.add(g); shown.push({ g, s }); }
  }
  const here = () => sites[`${city}|${period()}`] || [];
  const nearest = () => { let best = null, bd = 1e9; for (const s of here()) { const d = Math.hypot(player.x - s.x, player.z - s.z); if (d < bd) { bd = d; best = s; } } return best ? { s: best, d: bd } : null; };

  // ---- the dig
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function newDig(site) {
    const pool = shuffle(ARTS.filter((a) => a.city === city)).sort((a, b) => (found(a) ? 1 : 0) - (found(b) ? 1 : 0)).slice(0, 3);       // finds you do not have come first
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(2)), occ = Array.from({ length: ROWS }, () => Array(COLS).fill(-1)), items = [];
    pool.forEach((a, i) => {
      const [w, h] = a.worth >= 80 ? [3, 2] : a.worth >= 50 ? [2, 2] : [2, 1];
      for (let tries = 0; tries < 80; tries++) {
        const x = Math.floor(Math.random() * (COLS - w + 1)), y = Math.floor(Math.random() * (ROWS - h + 1));
        let ok = true; for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (occ[yy][xx] >= 0) ok = false;
        if (!ok) continue;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) occ[yy][xx] = i;
        items.push({ a, x, y, w, h, cracks: 0, out: false }); break;
      }
    });
    cur = { site, grid, occ, items, left: STROKES, tool: "brush", done: false, sum: null };
  }
  const itemDone = (it) => { for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) if (cur.grid[y][x] > 0) return false; return true; };
  function remove(x, y, n) {                                                                       // takes n layers off a square; true if there was anything to take
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || cur.grid[y][x] <= 0) return false;
    cur.grid[y][x] = Math.max(0, cur.grid[y][x] - n); return true;
  }
  function brush(x, y) { if (cur.done || cur.left <= 0 || !remove(x, y, 1)) return; cur.left--; after(); }
  function trowel(x, y) {
    if (cur.done || cur.left <= 0 || x < 0 || y < 0 || x >= COLS || y >= ROWS || cur.grid[y][x] <= 0) return;
    cur.left = Math.max(0, cur.left - 2);
    const hit = new Set();
    for (const [dx, dy, n] of [[0, 0, 2], [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1]]) { const xx = x + dx, yy = y + dy; if (remove(xx, yy, n) && cur.occ[yy] && cur.occ[yy][xx] >= 0) hit.add(cur.occ[yy][xx]); }
    for (const i of hit) { cur.items[i].cracks++; if (typeof Sfx !== "undefined") Sfx.play("hit"); toast(`💥 ${tr("The trowel cracked")} ${tr(cur.items[i].a.name)}!`); }
    after();
  }
  function after() {
    for (const it of cur.items) if (!it.out && itemDone(it)) { it.out = true; if (typeof Sfx !== "undefined") Sfx.play("discover"); toast(`${it.a.pic} ${tr("Found")}: ${tr(it.a.name)}`); }
    if (cur.items.every((it) => it.out) || cur.left <= 0) finish();
    draw();
  }
  function finish() {
    cur.done = true;
    const got = cur.items.filter((it) => it.out), clean = got.length === cur.items.length && got.every((it) => !it.cracks);
    let coins = 0; const lines = [];
    for (const it of got) {
      const cond = Math.max(0.3, 1 - 0.25 * it.cracks), pay = Math.round(it.a.worth * cond * (clean ? 1.25 : 1)), k = it.a.id + "@" + it.a.city, old = store.finds[k];
      store.finds[k] = { n: (old ? old.n : 0) + 1, best: Math.max(old ? old.best : 0, Math.round(cond * 100)), t: Date.now() };
      coins += pay; lines.push({ it, pay, cond, isNew: !old });
    }
    let bonus = 0;
    if (!store.bonus[city] && ARTS.filter((a) => a.city === city).every((a) => found(a))) { store.bonus[city] = 1; bonus = BONUS; }
    store.last[cur.site.id] = Date.now(); save();
    if (coins + bonus) Vitals.coins += coins + bonus;
    cur.sum = { lines, coins, bonus, clean, missed: cur.items.length - got.length };
    if (bonus) setTimeout(() => toast(`🏆 ${tr("Every find of this city is in your collection!")} (+${bonus})`), 2500);
  }

  // ---- drawing the grid
  let cv = null, g2 = null, lastCell = null;
  function draw() {
    if (!cv || !cur) return;
    g2.clearRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g2.fillStyle = (x + y) % 2 ? "#6b5236" : "#634c32"; g2.fillRect(x * CELL, y * CELL, CELL, CELL); }
    for (const it of cur.items) {                                                                  // the buried finds (the sand hides them)
      g2.save(); g2.beginPath(); g2.rect(it.x * CELL, it.y * CELL, it.w * CELL, it.h * CELL); g2.clip();
      g2.fillStyle = "rgba(255,240,200,.14)"; g2.fillRect(it.x * CELL, it.y * CELL, it.w * CELL, it.h * CELL);
      g2.font = `${Math.min(it.w, it.h * 1.4) * CELL * 0.78}px serif`; g2.textAlign = "center"; g2.textBaseline = "middle"; g2.fillText(it.a.pic, (it.x + it.w / 2) * CELL, (it.y + it.h / 2) * CELL + 3);
      if (it.cracks) { g2.strokeStyle = "#c0262b"; g2.lineWidth = 3; g2.beginPath(); g2.moveTo(it.x * CELL + 8, it.y * CELL + 8); g2.lineTo((it.x + it.w / 2) * CELL, (it.y + it.h / 2) * CELL - 6); g2.lineTo((it.x + it.w) * CELL - 10, (it.y + it.h) * CELL - 8); g2.stroke(); }
      g2.restore();
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const d = cur.grid[y][x]; if (d <= 0) continue;
      g2.fillStyle = d === 2 ? "#c9a36a" : "#dcc08e"; g2.fillRect(x * CELL, y * CELL, CELL, CELL);
      g2.fillStyle = "rgba(0,0,0,.07)"; for (let k = 0; k < 6; k++) g2.fillRect(x * CELL + ((k * 17 + x * 7) % (CELL - 6)), y * CELL + ((k * 11 + y * 13) % (CELL - 6)), 3, 3);
      if (d === 1 && cur.occ[y][x] >= 0) { g2.fillStyle = "rgba(90,60,30,.65)"; g2.beginPath(); g2.arc(x * CELL + 20 + ((x * 13 + y * 7) % 20), y * CELL + 20 + ((x * 5 + y * 11) % 20), 4, 0, 7); g2.fill(); }   // a speck: something lies just under it
    }
    g2.strokeStyle = "rgba(0,0,0,.25)"; g2.lineWidth = 1; for (let i = 0; i <= COLS; i++) { g2.beginPath(); g2.moveTo(i * CELL, 0); g2.lineTo(i * CELL, ROWS * CELL); g2.stroke(); } for (let i = 0; i <= ROWS; i++) { g2.beginPath(); g2.moveTo(0, i * CELL); g2.lineTo(COLS * CELL, i * CELL); g2.stroke(); }
    const info = $d("dig-info"); if (info) info.textContent = `${tr("Strokes left")}: ${cur.left} · ${tr("Found")}: ${cur.items.filter((i) => i.out).length} / ${cur.items.length}`;
    if (cur.done && cur.sum) summary();
  }
  function cellAt(e) { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * COLS), Math.floor((e.clientY - r.top) / r.height * ROWS)]; }

  // ---- the panel
  const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
  const btn = (text, fn, cls = "tour-go") => { const b = el("button", text, cls); b.type = "button"; b.addEventListener("click", fn); return b; };
  function tabs() { const row = el("div", undefined, "dg-tabs"); for (const [k, n] of [["dig", "⛏ " + tr("Dig")], ["finds", "📜 " + tr("My finds")]]) { const b = btn(n, () => { tab = k; render(); }); if (tab === k) b.classList.add("on"); row.append(b); } return row; }
  function render() {
    const body = $d("dig-body"); if (!body) return;
    const parts = [tabs()];
    if (tab === "finds") parts.push(...findsView());
    else parts.push(...digView());
    body.replaceChildren(...parts);
    if (tab === "dig" && cur && cv) draw();
  }
  function digView() {
    const n = nearest();
    if (!here().length) return [el("p", tr("There are no dig sites here."), "hire-intro")];
    if (cur && !cur.done) return gameView();
    if (cur && cur.done && cur.sum) { cv = null; return summaryView(); }
    if (!n || n.d > REACH) {
      const p = [el("p", tr("A dig site is not near you. Walk to one of the roped-off trenches near the sights of this city."), "hire-intro")];
      if (n) p.push(btn(tr("Directions"), () => { closePanels(); startDirections({ name: tr("Dig site"), stand: [n.s.x + 6, n.s.z + 6] }); }));
      return p;
    }
    const wait = REST - (Date.now() - (store.last[n.s.id] || 0));
    const p = [el("p", tr("Three finds lie buried under the sand. Brush away the sand layer by layer. The trowel is quicker, but it cracks what it hits. A speck of colour means something lies just under that square."), "hire-intro")];
    if (wait > 0) p.push(el("p", `${tr("This site is resting")}: ${Math.floor(wait / 60000)}:${String(Math.ceil(wait / 1000) % 60).padStart(2, "0")}`, "hire-far"));
    else p.push(btn(`⛏ ${tr("Start digging")}`, () => { newDig(n.s); render(); }));
    return p;
  }
  function gameView() {
    const wrap = el("div", undefined, "dg-game");
    cv = el("canvas"); cv.id = "dig-canvas"; cv.width = COLS * CELL; cv.height = ROWS * CELL; g2 = cv.getContext("2d");
    const tools = el("div", undefined, "dg-tools");
    for (const [k, n] of [["brush", "🖌 " + tr("Brush")], ["trowel", "🔨 " + tr("Trowel")]]) { const b = btn(n, () => { cur.tool = k; tools.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x.dataset.k === cur.tool)); }); b.dataset.k = k; if (cur.tool === k) b.classList.add("on"); tools.append(b); }
    const info = el("span", undefined, "dg-info"); info.id = "dig-info"; tools.append(info);
    cv.addEventListener("pointerdown", (e) => { const [x, y] = cellAt(e); lastCell = x + "," + y; if (cur.tool === "trowel") trowel(x, y); else brush(x, y); e.preventDefault(); });
    cv.addEventListener("pointermove", (e) => { if (e.buttons !== 1 || cur.tool !== "brush") return; const [x, y] = cellAt(e); if (lastCell !== x + "," + y) { lastCell = x + "," + y; brush(x, y); } });
    wrap.append(tools, cv, el("small", tr("Brush: one layer, harmless, you can drag. Trowel: two layers and the neighbours, but it cracks finds."), "dg-hint"));
    return [wrap];
  }
  function summaryView() {
    const s = cur.sum, p = [el("h3", s.lines.length ? tr("Dig finished") : tr("Nothing found this time"))];
    for (const l of s.lines) { const row = el("div", undefined, "hire-row"), txt = el("span"); txt.append(el("strong", `${l.it.a.pic} ${tr(l.it.a.name)}${l.isNew ? " · " + tr("new!") : ""}`), el("small", `${Math.round(l.cond * 100)}% · ${tr(l.it.a.text)}`)); row.append(txt, el("strong", `+${l.pay}`)); p.push(row); }
    if (s.missed) p.push(el("p", `${s.missed} ${tr("find(s) stayed in the ground: you ran out of strokes.")}`, "hire-far"));
    if (s.clean) p.push(el("p", `✨ ${tr("Clean dig: nothing cracked, 25% bonus")}`, "hire-intro"));
    if (s.bonus) p.push(el("p", `🏆 ${tr("Complete collection bonus")}: +${s.bonus}`, "hire-intro"));
    p.push(btn(tr("OK"), () => { cur = null; cv = null; render(); }));
    return p;
  }
  function summary() { render(); }
  function findsView() {
    const p = [];
    for (const [c, name] of Object.entries(CITIES)) {
      const list = ARTS.filter((a) => a.city === c), n = list.filter((a) => found(a)).length;
      p.push(el("h3", `${tr(name)} · ${n} / ${list.length}${store.bonus[c] ? " 🏆" : ""}`));
      const grid = el("div", undefined, "pm-grid");
      for (const a of list) {
        const f = found(a), card = el("div", undefined, "pm-card" + (f ? " done" : ""));
        card.append(el("div", f ? a.pic : "❔", "pm-ph"), el("strong", f ? tr(a.name) : "???"));
        card.append(el("small", f ? `${tr("found")} ×${f.n} · ${tr("best")} ${f.best}%` : tr("not found yet")));
        if (f) card.append(el("small", tr(a.text)));
        grid.append(card);
      }
      p.push(grid);
    }
    return p;
  }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    tab = cur && !cur.done ? "dig" : tab; render(); openPanel("#digpanel");
  }
  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    const k = `${city}|${period()}`;
    if (!sites[k] && mode === "walk" && SITE_NEAR[city]) { siteT -= dt; if (siteT <= 0) { sites[k] = pickSites(); siteT = 1.5; } }
    if (k !== key || (sites[k] && shown.length !== sites[k].length)) rebuild();
    noteT -= dt; if (noteT > 0) return; noteT = 0.5;
    for (const s of shown) {
      const d = Math.hypot(player.x - s.s.x, player.z - s.s.z);
      s.g.children.forEach((o) => { if (o.userData.label) o.visible = d < 45; });
      if (d < 12 && !noted.has(s.s.id)) { noted.add(s.s.id); toast(`⛏ ${tr("A dig site: open the menu (Play and compete) and choose Archaeology dig.")}`); }
    }
  }
  function bind() { const b = $d("btn-dig"); if (b) b.addEventListener("click", open); const p = $d("digpanel"); if (p) p.addEventListener("click", (e) => { if (e.target.classList.contains("dclose")) { cv = null; } }); }
  function build(sc) { scene = sc; }
  return { build, bind, open, update, ARTS, get store() { return store; }, get sites() { return here(); }, get cur() { return cur; }, newDig, brush, trowel, nearest };
})();
