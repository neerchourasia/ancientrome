"use strict";
// Rare treasure carried by the bots. Each game day a very few citizens (three in each city) have found a relic and carry it: you can tell by the golden sparkle
// above their heads. Walk up to one and press F: they will trade the relic for denarii (you can haggle once: it may work, or it may annoy them).
// Relics cannot be found any other way, and a citizen who trades theirs stops sparkling. Keep them as a collection (💎 Treasure in the menu), or sell them
// back for their full value, which is more than the bots ask. Owned relics are kept with the rest of what you own (so they are saved with your account).
// Depends on market.js (Market), vitals.js, home.js (Time) and the globals of game.js (peopleHere, player, scene, camera).

const Relics = (() => {
  const T = THREE;
  const FEW = 3, REACH = 3.4;
  let RELICS = [];                                       // set when the game starts (market.js loads after this file)                          // [id, name, value in denarii, what it is] (kept in market.js, so owned relics are known when a saved game loads)
  let ID = new Set();
  const info = (id) => RELICS.find((r) => r[0] === id);
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const owned = () => Market.snapshot().items.filter((id) => ID.has(id));

  // ---------------------------------------------------------------- who carries one today
  let key = "", carriers = [];                              // carriers: { p (the citizen), id (the relic), ask, haggled, taken, spark }
  const sparkles = [];                                      // a few reusable sparkles (a star and three tiny lights that circle it)
  function makeSpark() {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,230,1)"); gr.addColorStop(0.25, "rgba(255,214,90,0.85)"); gr.addColorStop(1, "rgba(255,200,60,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,245,200,0.95)"; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32); g.stroke();   // the four points of the star
    const tex = new T.CanvasTexture(c), mat = () => new T.SpriteMaterial({ map: tex, blending: T.AdditiveBlending, depthWrite: false, transparent: true });
    const grp = new T.Group(), star = new T.Sprite(mat()); star.scale.set(1.5, 1.5, 1);
    grp.add(star);
    const lights = [0, 1, 2].map(() => { const s = new T.Sprite(mat()); s.scale.set(0.45, 0.45, 1); grp.add(s); return s; });
    grp.visible = false; scene.add(grp);
    return { grp, star, lights };
  }

  function choose() {
    const list = peopleHere(), k = `${city}-${Payroll.epoch()}-${list.length}-${owned().length}`;
    if (k === key) return;
    key = k; carriers = [];
    if (!list.length) return;
    const rnd = seeded(`relics-${city}-${Payroll.epoch()}`), free = RELICS.map((r) => r[0]).filter((id) => !owned().includes(id));
    const used = new Set();
    for (let n = 0; n < FEW && free.length; n++) {
      const i = Math.floor(rnd() * list.length); if (used.has(i)) continue; used.add(i);
      const id = free.splice(Math.floor(rnd() * free.length), 1)[0], v = info(id)[2];
      carriers.push({ p: list[i], id, ask: Math.round((v * (0.55 + rnd() * 0.3)) / 5) * 5, haggled: false, taken: false });
    }
  }

  // every frame: put the sparkle above each citizen who carries something
  let t0 = 0;
  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    t0 += dt; choose();
    const t = performance.now() / 1000;
    for (let i = 0; i < FEW; i++) {
      if (!sparkles[i]) sparkles[i] = makeSpark();
      const sp = sparkles[i], c = carriers[i];
      if (!c || c.taken) { sp.grp.visible = false; continue; }
      sp.grp.visible = true;
      const y = groundAt(c.p.x, c.p.z) + ((c.p.down || 0) > 0 ? 0.6 : 2.5);
      sp.grp.position.set(c.p.x, y, c.p.z);
      const pulse = 1.2 + Math.sin(t * 5 + i) * 0.35; sp.star.scale.set(pulse, pulse, 1); sp.star.material.rotation = t * 0.8;
      sp.lights.forEach((l, k) => { const a = t * 2.2 + k * 2.1; l.position.set(Math.cos(a) * 0.6, Math.sin(a * 1.3) * 0.3 - 0.1, Math.sin(a) * 0.6); const s = 0.25 + 0.2 * Math.abs(Math.sin(t * 6 + k * 2)); l.scale.set(s, s, 1); });
    }
  }

  // ---------------------------------------------------------------- trading with a carrier
  function at() {
    if (!started || mode !== "walk" || panelOpen) return null;
    let best = null, bd = REACH;
    for (const c of carriers) { if (c.taken) continue; const d = Math.hypot(c.p.x - player.x, c.p.z - player.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  const promptText = () => (at() ? "F: this citizen is sparkling. Trade?" : "");
  let cur = null;
  const $r = (id) => document.getElementById(id);
  function renderTrade() {
    const c = cur; if (!c) return;
    const r = info(c.id);
    $r("rl-name").textContent = r[1];
    $r("rl-text").textContent = `${r[3]} The citizen asks ${c.ask} denarii for it. (It is worth about ${r[2]}.)`;
    $r("rl-buy").textContent = `Trade · ${c.ask}`; $r("rl-buy").disabled = Vitals.coins < c.ask;
    $r("rl-haggle").disabled = c.haggled;
  }
  function open() { const c = at(); if (!c) return; cur = c; renderTrade(); openPanel("#relic"); }
  function haggle() {
    const c = cur; if (!c || c.haggled) return;
    c.haggled = true;
    if (Math.random() < 0.5) { c.ask = Math.round((c.ask * 0.75) / 5) * 5; toast(`They agree to ${c.ask} denarii.`); }
    else { c.ask = Math.round((c.ask * 1.2) / 5) * 5; toast(`That annoyed them: now they want ${c.ask}.`); }
    renderTrade();
  }
  function trade() {
    const c = cur; if (!c || c.taken) return;
    if (Vitals.coins < c.ask) { toast(`You need ${c.ask} denarii.`); return; }
    Vitals.coins -= c.ask; Market.grant(c.id); c.taken = true; Sfx.play("discover");
    toast(`You traded for the ${info(c.id)[1].toLowerCase()}! The citizen stops sparkling.`);
    closePanels(); cur = null; key = "";
  }

  // ---------------------------------------------------------------- your collection
  function renderBox() {
    const list = $r("rb-list"), mine = owned();
    list.replaceChildren();
    $r("rb-count").textContent = `${mine.length} of ${RELICS.length} treasures`;
    for (const r of RELICS) {
      const li = document.createElement("li"), has = mine.includes(r[0]);
      const txt = document.createElement("span"), nm = document.createElement("strong"), sm = document.createElement("small");
      nm.textContent = has ? r[1] : "???"; sm.textContent = has ? `${r[3]} Worth ${r[2]}.` : "Not found yet. Look for a sparkling citizen.";
      txt.append(nm, sm); li.append(txt);
      if (has) {
        const b = document.createElement("button"); b.type = "button"; b.textContent = `Sell · ${r[2]}`;
        let armed = 0;
        b.addEventListener("click", () => {
          if (!armed || performance.now() - armed > 4000) { armed = performance.now(); b.textContent = `Sure? Sell for ${r[2]}`; return; }
          if (Market.take(r[0])) { Vitals.coins += r[2]; Sfx.play("coin"); toast(`You sold the ${r[1].toLowerCase()} for ${r[2]} denarii.`); key = ""; renderBox(); }
        });
        li.append(b);
      } else li.classList.add("lock");
      list.append(li);
    }
  }
  const openBox = () => { renderBox(); openPanel("#relics"); };

  function bind() {
    RELICS = Market.relics; ID = new Set(RELICS.map((r) => r[0]));
    if ($r("rl-buy")) { $r("rl-buy").addEventListener("click", trade); $r("rl-haggle").addEventListener("click", haggle); $r("rl-no").addEventListener("click", () => closePanels()); }
    const b = $r("btn-relics"); if (b) b.addEventListener("click", openBox);
  }

  return { bind, update, at, open, promptText, get RELICS() { return RELICS; }, get owned() { return owned(); }, _carriers: () => carriers };
})();
