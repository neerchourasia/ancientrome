"use strict";
// Citizens with daily lives. Every citizen walking about has a name, a job at one of the shops near where they live, and a day: at home in the early morning and at night, walking to work, at work,
// at lunch, and in the evening at an inn or a food stall (or a sight, where there is none). Walk up and press F to talk: it shows who they are and what they are doing now. The first chat of a game
// day with a citizen makes you better friends (stranger, acquaintance, friend, close friend), and each new step brings a small gift. Friends are kept in the browser (rome-friends) and the saved game.
// Weather changes the day: in rain, snow, hail or a storm the citizens go to shelter (at work, at the inn or at home), the ones still out hold umbrellas in the rain, the ground fills with puddles that dry up
// in the hours after the rain, and the shops shut in a storm (interiors.js). Depends on city.js and the other cities (peopleHere), interiors.js (the shops), home.js (Time), payroll.js (the day), weather.js, and the globals of game.js (player, LANDMARKS, worldScene, groundAt, canMove).

const Lives = (() => {
  const REACH = 3.2, KEY = "rome-friends", LEVELS = [0, 2, 5, 9], LEVEL_NAMES = ["Stranger", "Acquaintance", "Friend", "Close friend"], GIFTS = [0, 10, 25, 50];
  const NAMES = {
    rome: ["Marcus", "Lucia", "Gaius", "Julia", "Titus", "Cornelia", "Quintus", "Livia", "Decimus", "Flavia"], delhi: ["Aarav", "Priya", "Rohan", "Meera", "Kabir", "Anaya", "Vikram", "Sana", "Arjun", "Zoya"],
    cancun: ["Mateo", "Sofía", "Diego", "Valentina", "Santiago", "Camila", "Emilio", "Lucía", "Andrés", "Ximena"], beijing: ["Wei", "Mei", "Jun", "Lan", "Hao", "Ying", "Tao", "Xiu", "Bo", "Fang"],
  };
  // what a person does for a living, by the shop they work at
  const JOBS = {
    Bakery: "baker", Tavern: "tavern cook", Workshop: "smith's helper", "Cloth shop": "weaver", "Oil seller": "oil seller", Potter: "potter",
    "Spice shop": "spice seller", "Sweet shop": "sweet maker", "Silk emporium": "weaver", Jeweller: "goldsmith", "Attar seller": "perfume maker", "Chai stall": "tea seller",
    "Visitor centre": "guide", "Cacao seller": "cacao trader", "Obsidian trader": "stone cutter", "Maya weaver": "weaver", "Hotel lobby": "hotel porter", "Beach shop": "beach vendor", "Dive shop": "diver", "Taco bar": "cook",
    "Tea house": "tea server", "Dumpling shop": "dumpling maker", "Silk shop": "silk seller", "Brush shop": "scribe", "Café": "barista", "Noodle bar": "noodle cook", "Tea shop": "tea seller", "Convenience store": "shop clerk",
  };
  // a few things each one says over a chat (the job picks the first one)
  const SAYS = {
    baker: "The best bread is the one you buy at dawn.", "tavern cook": "A full pot and a warm fire: that is all a tavern is.", "smith's helper": "Iron is patient. So must you be.", weaver: "A good cloth takes a week. A bad one takes a day.",
    "oil seller": "Light, food and medicine: oil is all three.", potter: "Every pot is different. Mine break less than most.", "spice seller": "A pinch of the right thing changes a whole dish.", "sweet maker": "Sugar is the shortest way to a friend.",
    goldsmith: "Gold is honest: it weighs what it weighs.", "perfume maker": "One drop, and the whole street knows you passed.", "tea seller": "Tea is not drunk, it is shared.", guide: "Every stone here has a story. Ask me.",
    "cacao trader": "A cup of cacao is worth a good day's thinking.", "stone cutter": "Black glass cuts sharper than any bronze.", "hotel porter": "Everyone arrives tired. Everyone leaves sorry.", "beach vendor": "Sun, sand, and everybody needs a hat.",
    diver: "The reef is quiet. That is why I like it.", cook: "Salt, fire and patience.", "tea server": "Sit a while. The water is just right.", "dumpling maker": "Fold twelve times, never eleven.", "silk seller": "Soft as a cloud, strong as a promise.",
    scribe: "Ink is only a way of keeping a thought from leaving.", barista: "Flat white, as it should be.", "noodle cook": "Pulled by hand: you can hear them being born.", "shop clerk": "Open all night, because somebody always needs something.",
    "": "Another day, another road.",
  };
  const COMMON = ["Have you heard? Something is going on in the city today.", "I walk this way every day. I know every stone of it.", "The weather has been strange lately, has it not?", "You look like you are not from here. Welcome.", "If you want to know the city, talk to the people who work in it."];

  const people = new WeakMap();                           // person -> { i, name, job, home, work, eat, v0, skip, lx, lz, lt }
  let friends = {}, shopsAt = [], shopsKey = "", cur = null, steerT = 0, clock = 0, wet = 0, brolly = null, puddles = null, tmp = null;
  const wx = () => (typeof Weather !== "undefined" ? Weather : { kind: "clear", rain: 0, snow: 0 });
  const bad = () => { const w = wx(); return w.rain > 0.35 || w.snow > 0.5 || ["storm", "hail", "blizzard", "tornado", "cyclone"].includes(w.kind); };
  const badWord = () => { const k = wx().kind; return k === "storm" || k === "tornado" || k === "cyclone" ? "the storm" : k === "hail" ? "the hail" : k === "snow" || k === "blizzard" ? "the snow" : "the rain"; };
  try { const r = JSON.parse(localStorage.getItem(KEY) || "{}"); if (r && typeof r === "object" && !Array.isArray(r)) for (const k of Object.keys(r).slice(0, 2000)) if (r[k] && Number.isFinite(+r[k].n)) friends[k] = { n: Math.min(999, Math.max(0, Math.floor(+r[k].n))), day: Number.isFinite(+r[k].day) ? +r[k].day : -1, lv: Math.min(3, Math.max(0, Math.floor(+r[k].lv || 0))) }; } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(friends)); } catch (e) { /* ignore */ } };
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const hash = (a, b) => { let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
  const $z = (id) => document.getElementById(id);
  const cityNow = () => (typeof city !== "undefined" ? city : "rome");
  const eraNow = () => (typeof era !== "undefined" ? era : "ancient");

  // the shops of this city in this era (their places are in the world; the city is told apart by distance from where people live)
  function shops() {
    const k = `${eraNow()}-${typeof Interiors !== "undefined" ? Interiors.count : 0}`;
    if (k !== shopsKey) { shopsKey = k; shopsAt = Interiors.shops().filter((s) => !s.era || s.era === eraNow()).map((s) => ({ x: s.x, z: s.z, name: s.name, late: !!s.late, food: s.trade === "food" })); }
    return shopsAt;
  }
  const near = (list, x, z, max) => list.map((s) => ({ s, d: Math.hypot(s.x - x, s.z - z) })).filter((o) => o.d < max).sort((a, b) => a.d - b.d);
  function identity(p, i) {
    let o = people.get(p);
    if (o) return o;
    const c = cityNow(), list = NAMES[c] || NAMES.rome, all = shops();
    const works = near(all, p.x, p.z, 260).slice(0, 4), w = works.length ? works[Math.floor(hash(i, 3) * works.length)].s : null;
    const evenings = near(all.filter((s) => s.late || s.food), p.x, p.z, 420), e = evenings.length ? evenings[Math.floor(hash(i, 5) * Math.min(3, evenings.length))].s : null;
    let lm = null;
    if (!e && typeof LANDMARKS !== "undefined") { const l = near(LANDMARKS.filter((x) => !x.home && !x.game), p.x, p.z, 600); lm = l.length ? l[0].s : null; }
    o = { i, name: list[i % list.length], job: w ? (JOBS[w.name] || "worker") : "", workName: w ? w.name : "", home: { x: p.x, z: p.z }, work: w, eat: e || lm || w, eatName: e ? e.name : lm ? lm.name.replace(/^The /, "") : "", v0: p.v, skip: 0, lx: p.x, lz: p.z, lt: 0, jit: (hash(i, 9) - 0.5) * 1.2 };
    people.set(p, o); return o;
  }

  // what a citizen is doing at an hour of the day
  function plan(o, hour) {
    const h = (hour + o.jit + 24) % 24;
    if (bad() && h >= 5.5 && h < 21) { const at = o.work || o.eat || o.home; return { key: "shelter", at, text: `sheltering from ${badWord()}` }; }
    if (h < 5.5 || h >= 21) return { key: "sleep", at: o.home, text: "at home for the night" };
    if (h < 7.5) return { key: "home", at: o.home, text: "having breakfast at home" };
    if (h < 8.5) return o.work ? { key: "commute", at: o.work, text: `walking to work at the ${o.workName}` } : { key: "stroll", at: null, text: "out for a walk" };
    if (h < 12) return o.work ? { key: "work", at: o.work, text: `working at the ${o.workName}` } : { key: "stroll", at: null, text: "out for a walk" };
    if (h < 13.5) return o.eat ? { key: "lunch", at: o.eat, text: o.eatName ? `having lunch at the ${o.eatName}` : "having lunch" } : { key: "stroll", at: null, text: "out for a walk" };
    if (h < 17.5) return o.work ? { key: "work", at: o.work, text: `working at the ${o.workName}` } : { key: "stroll", at: null, text: "out for a walk" };
    return o.eat ? { key: "evening", at: o.eat, text: o.eatName ? `spending the evening at the ${o.eatName}` : "spending the evening out" } : { key: "stroll", at: null, text: "out for a walk" };
  }

  // umbrellas over the heads of the people near you in the rain, and puddles on the ground that stay a while after it stops
  function weatherLook(dt, list) {
    const w = wx(), raining = w.rain > 0.25 && w.snow < 0.3;
    wet = raining ? Math.min(1, wet + dt * 0.08) : Math.max(0, wet - dt * 0.012);          // (a wet day: puddles come in a few seconds of rain and last about a game hour afterwards)
    if (typeof worldScene === "undefined" || !worldScene) return;
    if (!brolly) {
      brolly = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 0.34, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), 80);
      brolly.frustumCulled = false; brolly.instanceMatrix.setUsage(THREE.DynamicDrawUsage); worldScene.add(brolly);
      const cols = [0x2a4a8a, 0xb03030, 0x2a7a4a, 0x7a2a7a, 0xc8a030, 0x303030]; for (let i = 0; i < 80; i++) brolly.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      brolly.instanceColor.needsUpdate = true;
      puddles = new THREE.Group(); const pm = new THREE.MeshBasicMaterial({ color: 0x3f5666, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      for (let i = 0; i < 60; i++) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 14), pm); m.rotation.x = -Math.PI / 2; m.visible = false; puddles.add(m); }
      puddles.userData.mat = pm; worldScene.add(puddles);
    }
    if (!tmp) tmp = { m4: new THREE.Matrix4(), v: new THREE.Vector3(), q: new THREE.Quaternion(), sc: new THREE.Vector3(), zero: new THREE.Matrix4().makeScale(0, 0, 0) };
    const { m4, v, q, sc, zero } = tmp;
    let n = 0;
    if (raining && !(typeof Interiors !== "undefined" && Interiors.inside())) {
      for (let i = 0; i < list.length && n < 80; i++) { const p = list[i]; if (Math.abs(p.x - player.x) > 70 || Math.abs(p.z - player.z) > 70 || (p.down || 0) > 0) continue; v.set(p.x, groundAt(p.x, p.z) + 1.95, p.z); sc.set(1.35, 1.35, 1.35); m4.compose(v, q, sc); brolly.setMatrixAt(n++, m4); }
    }
    for (let i = n; i < 80; i++) brolly.setMatrixAt(i, zero);
    brolly.instanceMatrix.needsUpdate = true;
    // puddles: a ring of cells round you, each with its own place and size
    const cell = 14, ci = Math.floor(player.x / cell), cj = Math.floor(player.z / cell); let k = 0;
    puddles.userData.mat.opacity = 0.55 * Math.min(1, wet * 1.6);
    if (wet > 0.05 && !(typeof Interiors !== "undefined" && Interiors.inside())) {
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3 && k < 60; b++) {
        const i = ci + a, j = cj + b, hh = hash(i * 7919 + 13, j * 104729 + 7); if (hh > 0.55 + 0.4 * (1 - wet) * 0) continue;
        const x = (i + hash(i, j)) * cell, z = (j + hash(j + 5, i + 11)) * cell, r = 1.0 + hash(i + 3, j + 9) * 1.8;
        if (!canMove(x, z, x + 0.1, z) || hh > 0.25 + 0.3 * wet) continue;
        const mm = puddles.children[k++]; mm.visible = true; mm.position.set(x, groundAt(x, z) + 0.04, z); mm.scale.set(r * (0.6 + 0.4 * wet), r * (0.6 + 0.4 * wet), 1);
      }
    }
    for (; k < 60; k++) puddles.children[k].visible = false;
  }

  // the people near you steer to where the day takes them (and walk a little faster to get there); when they are stuck at a wall they wander for a moment
  function update(dt) {
    if (typeof started === "undefined" || !started || typeof Time === "undefined") return;
    clock += dt; try { weatherLook(dt, peopleHere()); } catch (e) { /* weather look is only decoration */ }
    steerT -= dt; if (steerT > 0) return;
    const step = 0.25; steerT = step;
    const list = peopleHere(), hour = Time.hour, now = clock;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (Math.abs(p.x - player.x) > 320 || Math.abs(p.z - player.z) > 320) continue;
      const o = identity(p, i), pl = plan(o, hour);
      if ((p.down || 0) > 0) continue;
      if (now - o.lt > 1.5) { const moved = Math.hypot(p.x - o.lx, p.z - o.lz); if (o.steering && moved < 0.5) { o.detour = now + 2.5; o.side = o.side === 1 ? -1 : 1; } o.lx = p.x; o.lz = p.z; o.lt = now; }
      o.steering = false; p.v = o.v0;
      if (!pl.at) continue;
      const dx = pl.at.x - p.x, dz = pl.at.z - p.z, d = Math.hypot(dx, dz);
      if (d < 9) continue;
      p.a = Math.atan2(dx, dz) + (o.detour > now ? (o.side || 1) * Math.PI * 0.5 : 0); p.t = Math.max(p.t, 1); o.steering = true;       // (stuck at a wall: a few steps along it, then try again)
      if (d > 20) p.v = o.v0 * 2.2;
    }
  }

  // ---------------------------------------------------------------- talking
  function nearest() {
    if (typeof started === "undefined" || !started || mode !== "walk" || panelOpen) return null;
    const list = peopleHere(); let best = null, bd = REACH;
    for (let i = 0; i < list.length; i++) { const d = Math.hypot(list[i].x - player.x, list[i].z - player.z); if (d < bd && !(list[i].down > 0)) { bd = d; best = i; } }
    return best === null ? null : { p: list[best], i: best };
  }
  const levelOf = (n) => LEVELS.reduce((l, v, k) => (n >= v ? k : l), 0);
  const fkey = (i) => `${cityNow()}:${i}`;
  const at = () => !!nearest();
  function promptText() {
    const n = nearest(); if (!n) return "";
    const o = identity(n.p, n.i);
    return `${tr("F: talk to")} ${o.name}${o.job ? `, ${tr(o.job)}` : ""}`;
  }
  function open() {
    const n = nearest(); if (!n) return;
    cur = n; render(); openPanel("#citizen");
  }
  function render() {
    const body = $z("cz-body"); if (!body || !cur) return;
    const o = identity(cur.p, cur.i), pl = plan(o, Time.hour), f = friends[fkey(cur.i)] || { n: 0, day: -1, lv: 0 }, lv = levelOf(f.n), today = typeof Payroll !== "undefined" ? Payroll.epoch() : 0;
    const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
    const rows = [el("h3", `${o.name}${o.job ? `, ${tr(o.job)}` : ""}`)];
    rows.push(el("p", `${tr("Right now:")} ${tr(pl.text.replace(/ at the .*/, "")) + (pl.text.includes(" at the ") ? ` ${tr("at the")} ${tr(pl.text.replace(/^.* at the /, ""))}` : "")}.`, "dnote"));
    rows.push(el("p", `${"♥".repeat(lv + 1)}${"♡".repeat(3 - lv)} ${tr(LEVEL_NAMES[lv])} · ${f.n} ${tr(f.n === 1 ? "chat" : "chats")}`, "dnote"));
    if (cur.line) rows.push(el("p", cur.line, "sk-note"));
    const b = el("button", f.day === today ? tr("💬 Chat (you have chatted today)") : tr("💬 Chat")); b.type = "button"; b.disabled = f.day === today; b.addEventListener("click", chat);
    const bye = el("button", tr("👋 Goodbye")); bye.type = "button"; bye.addEventListener("click", closePanels);
    const bar = el("div", undefined, "sk-menu"); bar.append(b, bye); rows.push(bar);
    body.replaceChildren(...rows);
  }
  function chat() {
    if (!cur) return;
    const o = identity(cur.p, cur.i), k = fkey(cur.i), today = typeof Payroll !== "undefined" ? Payroll.epoch() : 0;
    const f = friends[k] || (friends[k] = { n: 0, day: -1, lv: 0 });
    if (f.day === today) return;
    f.day = today; f.n++;
    const lv = levelOf(f.n);
    cur.line = `${o.name}: ${tr(f.n % 2 ? (SAYS[o.job] || SAYS[""]) : COMMON[(cur.i + f.n) % COMMON.length])}`;
    if (lv > f.lv) { const gift = GIFTS[lv]; f.lv = lv; Vitals.coins += gift; Sfx.play("medal"); toast(`💛 ${o.name}: ${tr("you are now")} ${tr(LEVEL_NAMES[lv]).toLowerCase()}. +${gift} ${tr("denarii")}`); }
    else Sfx.play("chime");
    save(); render();
  }
  function bind() { const p = $z("citizen"); if (p) p.addEventListener("click", (e) => { if (e.target.id === "citizen") closePanels(); }); }
  const snapshot = () => JSON.parse(JSON.stringify(friends));
  function restore(r) { if (!r || typeof r !== "object") return; friends = {}; for (const k of Object.keys(r).slice(0, 2000)) if (r[k] && Number.isFinite(+r[k].n)) friends[k] = { n: Math.min(999, Math.floor(+r[k].n)), day: Number.isFinite(+r[k].day) ? +r[k].day : -1, lv: Math.min(3, Math.max(0, Math.floor(+r[k].lv || 0))) }; save(); }

  return { bind, update, at, open, promptText, snapshot, restore, plan, identity, get friends() { return Object.values(friends).filter((f) => levelOf(f.n) >= 2).length; }, get chats() { return Object.values(friends).reduce((n, f) => n + f.n, 0); } };
})();
