"use strict";
// Workshops: 🔨 Workshop in the menu (Play and compete). Every city has a workshop stand in its market (a counter under an awning with an anvil, a pot and a loom). Walk up to it and learn three crafts:
// the BLACKSMITH, the POTTER and the WEAVER, each with four things to make. Pay for the materials and the work takes a little while (it goes on while you walk about; one job at a time). The more you
// make in a craft the higher your level and the more you unlock, and the better your things turn out (poor, good, fine or a masterwork: worth 0.7, 1, 1.3 or 1.8 times). Sell what you make at the
// stand; each city's market also puts out an ORDER every day (two of one thing, paid double). What you have made and your levels are kept in this browser (in class mode: this tab).
// Depends on vitals.js, game.js (city, era, skin, player, scene, started, mode, openPanel, closePanels, toast, startDirections), physics.js (blockedAt, groundAt, dynBlockers) and landmarks.

const Workshops = (() => {
  const T = THREE, KEY = "rome-workshop", REACH = 40;
  const TRADES = {
    smith: { name: "Blacksmith", icon: "⚒️", recipes: [["Horseshoes", 15, 15, 35], ["Knife", 30, 25, 70], ["Sword", 60, 40, 150], ["Ceremonial armour", 120, 70, 340]] },
    potter: { name: "Potter", icon: "🏺", recipes: [["Clay pot", 10, 15, 25], ["Oil lamp", 20, 25, 55], ["Fine vase", 45, 40, 120], ["Painted amphora set", 100, 70, 290]] },
    weaver: { name: "Weaver", icon: "🧵", recipes: [["Cloth", 12, 15, 28], ["Rug", 30, 35, 70], ["Fine robe", 55, 45, 140], ["Tapestry", 110, 70, 310]] },
  };                                                                           // recipe: name, materials, seconds, worth
  const LEVEL_AT = [0, 4, 10, 20];                                              // crafts of a trade needed for level 1, 2, 3, 4
  const QUALITY = [["Poor", 0.7], ["Good", 1], ["Fine", 1.3], ["Masterwork", 1.8]];
  const NEAR = { rome: "market", delhi: "d-katra", cancun: "c-columns", beijing: "b-market" };
  const $w = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  let mult = {};                                                                // the craft exchange: what each thing fetches now (1 = the normal price), from the game server
  const m = (t, r) => mult[`${t}:${r}`] || 1;
  const online = () => typeof Online !== "undefined" && Online.connected;
  let st = { crafts: { smith: 0, potter: 0, weaver: 0 }, inv: {}, job: null, order: { day: "", city: "", sold: 0 } };
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.crafts) st = { crafts: { ...st.crafts, ...s.crafts }, inv: s.inv || {}, job: s.job || null, order: s.order || st.order }; } catch (e) { /* nothing made yet */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* storage unavailable: it lasts until the page closes */ } };
  const level = (t) => LEVEL_AT.filter((n) => st.crafts[t] >= n).length;
  const period = () => (era === "modern" ? "modern" : skin ? "mid" : "ancient");
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const day = () => new Date().toISOString().slice(0, 10);

  // today's order in this city: two of one thing, paid double (the same for everybody)
  function order() {
    const h = hash(city + day()), tk = Object.keys(TRADES)[h % 3], ri = (h >> 4) % 4;
    if (st.order.day !== day() || st.order.city !== city) st.order = { day: day(), city, sold: 0 };
    return { trade: tk, rec: ri, left: Math.max(0, 2 - st.order.sold) };
  }

  // ---- the stand
  let scene = null, shown = null, sites = {}, key = "", siteT = 1.5;
  function pickSite() {
    const lm = ALL_LANDMARKS.find((l) => l.id === NEAR[city]); if (!lm) return null;
    const hs = typeof MountHire !== "undefined" ? MountHire.site : null, saved = dynBlockers.map((d) => d.on); dynBlockers.forEach((d) => { d.on = false; });
    try {
      const [bx, bz] = lm.stand || [lm.x, lm.z], g0 = groundAt(bx, bz);
      for (const rad of [10, 16, 24, 34, 46, 60]) for (let a = 0; a < 16; a++) {
        const cx = bx + Math.cos(a * Math.PI / 8) * rad, cz = bz + Math.sin(a * Math.PI / 8) * rad;
        if (hs && Math.hypot(hs[0] - cx, hs[1] - cz) < 22) continue;
        if ([[0, 0], [-4, 0], [4, 0], [0, 3], [0, -3], [-4, 3], [4, 3], [-4, -3], [4, -3]].every(([dx, dz]) => { const x = cx + dx, z = cz + dz, y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 1.5 && !blockedAt(x, z, y); })) return [cx, cz, Math.atan2(lm.x - cx, lm.z - cz)];
      }
    } finally { dynBlockers.forEach((d, i) => { d.on = saved[i]; }); }
    return null;
  }
  function make() {
    const g = new T.Group(), wood = lam(0x7a5a34), red = lam(0xb0262e), cream = lam(0xefe4c8), iron = lam(0x3a3d42);
    const add = (geo, m, x, y, z, ry = 0) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
    for (const [x, z] of [[-3.4, -1.4], [3.4, -1.4], [-3.4, 1.4], [3.4, 1.4]]) add(new T.CylinderGeometry(0.1, 0.1, 3, 6), wood, x, 1.5, z);
    for (let i = -3; i <= 3; i++) add(new T.BoxGeometry(1, 0.12, 3.4), i % 2 ? red : cream, i, 3.05, 0);                 // a striped awning
    add(new T.BoxGeometry(6, 0.9, 1.0), wood, 0, 0.45, 0.9);                                                           // the counter
    add(new T.BoxGeometry(1.0, 0.7, 0.6), iron, -2.0, 1.05, 0.9); add(new T.BoxGeometry(1.5, 0.25, 0.5), iron, -2.0, 1.5, 0.9);   // an anvil
    add(new T.CylinderGeometry(0.4, 0.3, 0.7, 10), lam(0xb8622f), 0, 1.25, 0.9); add(new T.CylinderGeometry(0.2, 0.4, 0.3, 10), lam(0xb8622f), 0, 1.75, 0.9);   // a pot
    add(new T.BoxGeometry(1.3, 1.6, 0.15), wood, 2.1, 1.7, 0.9); add(new T.BoxGeometry(1.1, 1.2, 0.05), lam(0x3a6a9a), 2.1, 1.7, 0.99);   // a loom with cloth
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "rgba(34,26,16,.9)"; x.strokeStyle = "#e2b955"; x.lineWidth = 6; x.beginPath(); x.roundRect(6, 14, 500, 100, 18); x.fill(); x.stroke();
    x.fillStyle = "#f1ead8"; x.font = "bold 40px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("🔨 " + tr("Workshop"), 256, 50, 470);
    x.font = "26px sans-serif"; x.fillStyle = "#e2b955"; x.fillText(tr("smith · potter · weaver"), 256, 88, 470);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false })); sp.scale.set(8, 2, 1); sp.position.set(0, 4.6, 0); sp.userData.label = true; g.add(sp);
    return g;
  }
  const here = () => sites[`${city}|${period()}`] || null;
  const near = () => { const p = here(); return !!p && Math.hypot(player.x - p[0], player.z - p[1]) < REACH; };
  function rebuild() {
    if (shown) { scene.remove(shown); shown = null; }
    key = `${city}|${period()}`; const p = sites[key]; if (!p) return;
    const g = make(); g.position.set(p[0], groundAt(p[0], p[1]), p[1]); g.rotation.y = p[2]; scene.add(g); shown = g;
  }

  // ---- making things
  const qkey = (t, r, q) => `${t}:${r}:${q}`;
  function craft(t, r) {
    if (st.job) { toast(tr("You are already making something.")); return; }
    const [name, mat, secs] = TRADES[t].recipes[r];
    if (r >= level(t)) { toast(tr("Make more things in this craft to unlock that.")); return; }
    if (Vitals.coins < mat) { toast(`${tr("The materials cost")} ${mat} ${tr("denarii")}.`); return; }
    Vitals.coins -= mat;
    const roll = Math.random() + (level(t) - 1) * 0.1, q = roll < 0.25 ? 0 : roll < 0.75 ? 1 : roll < 1.15 ? 2 : 3;
    st.job = { t, r, q, end: Date.now() + secs * 1000 }; save(); Sfx.play("coin"); toast(`${TRADES[t].icon} ${tr(name)}: ${secs} s`); render();
  }
  function finish() {
    const j = st.job; if (!j || j.end > Date.now()) return;
    const k = qkey(j.t, j.r, j.q); st.inv[k] = (st.inv[k] || 0) + 1; st.crafts[j.t]++; st.job = null;
    const before = LEVEL_AT.filter((n) => st.crafts[j.t] - 1 >= n).length, after = level(j.t); save();
    if (typeof Sfx !== "undefined") Sfx.play("discover");
    toast(`${TRADES[j.t].icon} ${tr(QUALITY[j.q][0])} ${tr(TRADES[j.t].recipes[j.r][0])}!`);
    if (after > before) setTimeout(() => toast(`🎓 ${tr(TRADES[j.t].name)} ${tr("level")} ${after}: ${tr("you can make")} ${tr(TRADES[j.t].recipes[after - 1][0])}`), 2200);
  }
  function sell(t, r, q) {
    if (!near()) { toast(tr("Walk up to the workshop stand to sell.")); return; }
    const k = qkey(t, r, q); if (!st.inv[k]) return;
    const o = order(), base = Math.round(TRADES[t].recipes[r][3] * QUALITY[q][1] * m(t, r)), dbl = o.left > 0 && o.trade === t && o.rec === r, pay = base * (dbl ? 2 : 1);
    st.inv[k]--; if (!st.inv[k]) delete st.inv[k]; if (dbl) st.order.sold++; Vitals.coins += pay; save(); Sfx.play("coin"); if (online()) Online.navalSend({ t: "craftsell", id: `${t}:${r}` });
    toast(`+${pay} ${tr("denarii")}${dbl ? " · " + tr("the market's order: double!") : ""}`); render();
  }

  // ---- the panel
  const el = (tg, x, c) => { const e = document.createElement(tg); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
  const btn = (text, fn, dis) => { const b = el("button", text, "tour-go"); b.type = "button"; b.disabled = !!dis; b.addEventListener("click", fn); return b; };
  function render() {
    const body = $w("work-body"); if (!body) return;
    const parts = [], n = near();
    if (!here()) { body.replaceChildren(el("p", tr("There is no workshop in this city yet."), "hire-intro")); return; }
    if (!n) {
      parts.push(el("p", tr("The workshop stand is in the market. Walk up to it to make and sell things."), "hire-far"));
      const p = here(); parts.push(btn(tr("Directions"), () => { closePanels(); startDirections({ name: tr("Workshop"), stand: [p[0] + 4, p[1] + 5] }); }));
    }
    const o = order();
    parts.push(el("p", `📋 ${tr("Today's order")}: ${tr(TRADES[o.trade].recipes[o.rec][0])} × ${o.left} ${tr("(paid double)")}`, "hire-intro"));
    if (st.job) { const w = Math.max(0, Math.ceil((st.job.end - Date.now()) / 1000)); parts.push(el("p", `⏳ ${tr(TRADES[st.job.t].recipes[st.job.r][0])}: ${w} s`, "hire-intro")); }
    for (const [t, T0] of Object.entries(TRADES)) {
      const lv = level(t), sec = el("div", undefined, "st-card");
      sec.append(el("strong", `${T0.icon} ${tr(T0.name)} · ${tr("level")} ${lv} · ${st.crafts[t]} ${tr("made")}`));
      T0.recipes.forEach(([name, mat, secs, worth], r) => {
        const row = el("div", undefined, "hire-row"), txt = el("span");
        txt.append(el("strong", tr(name)), el("small", r < lv ? `${tr("materials")} ${mat} · ${secs} s · ${tr("worth")} ${worth}` : `🔒 ${tr("level")} ${r + 1} (${LEVEL_AT[r]} ${tr("made")})`));
        row.append(txt, btn(`${tr("Make")} · ${mat}`, () => craft(t, r), !n || r >= lv || !!st.job || Vitals.coins < mat)); sec.append(row);
      });
      parts.push(sec);
    }
    const inv = Object.entries(st.inv);
    parts.push(el("h3", `🎒 ${tr("What you have made")}`));
    if (!inv.length) parts.push(el("p", tr("Nothing yet."), "hire-far"));
    for (const [k, c] of inv) {
      const [t, r, q] = k.split(":"), rec = TRADES[t].recipes[+r], pay = Math.round(rec[3] * QUALITY[+q][1] * m(t, +r)), mm = m(t, +r);
      const row = el("div", undefined, "hire-row"), txt = el("span");
      txt.append(el("strong", `${TRADES[t].icon} ${tr(QUALITY[+q][0])} ${tr(rec[0])} × ${c}`), el("small", `${tr("sells for")} ${pay} ${mm > 1.03 ? "▲" : mm < 0.97 ? "▼" : ""}${o.left > 0 && o.trade === t && o.rec === +r ? " ×2" : ""}`));
      row.append(txt, btn(tr("Sell"), () => sell(t, +r, +q), !n)); parts.push(row);
    }
    body.replaceChildren(...parts);
  }
  let timer = 0;
  function priced(msg) { mult = msg.p || {}; if ($w("workpanel") && $w("workpanel").classList.contains("show")) render(); }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    if (online()) Online.navalSend({ t: "craftp" });
    finish(); render(); openPanel("#workpanel");
    clearInterval(timer); let tick = 0; timer = setInterval(() => { if (!$w("workpanel").classList.contains("show")) { clearInterval(timer); return; } if (++tick % 20 === 0 && online()) Online.navalSend({ t: "craftp" }); finish(); render(); }, 1000);
  }
  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    const k = `${city}|${period()}`;
    if (!sites[k] && mode === "walk" && NEAR[city]) { siteT -= dt; if (siteT <= 0) { sites[k] = pickSite(); siteT = 1.5; } }
    if (k !== key || (sites[k] && !shown) ) rebuild();
    if (shown) { const p = sites[key], d = Math.hypot(player.x - p[0], player.z - p[1]); shown.children.forEach((o) => { if (o.userData.label) o.visible = d < 45; }); }
    finish();
  }
  function bind() { const b = $w("btn-work"); if (b) b.addEventListener("click", open); }
  function build(sc) { scene = sc; }
  return { build, bind, open, update, craft, sell, priced, TRADES, get state() { return st; }, get site() { return here(); }, get near() { return near(); } };
})();
