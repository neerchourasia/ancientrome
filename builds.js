"use strict";
// Guild public builds: 🏗 Guild builds in the menu (People). A guild can pay from its treasury (the leader presses Build) for a fountain, a lighthouse or an aqueduct in a city. It then stands in
// that city for every player, with a banner in the guild's colour and a sign with the guild's name. One of each kind per city, built once; the game server keeps the list and saves it with the
// rest of the world (guilds are for players with an account, but anyone online can see the builds). Every browser works out the same spot for a build near one of the city's sights (the first
// clear patch of ground around it, tried in a fixed order), so everybody sees it in the same place. Depends on online.js, guilds.js, physics.js (blockedAt, groundAt, dynBlockers), game.js
// (scene, city, era, player, startDirections, openPanel, toast), home.js (Time) and dialog.js.

const Builds = (() => {
  const T = THREE;
  const KINDS = { fountain: { icon: "⛲", name: "Fountain" }, lighthouse: { icon: "🗼", name: "Lighthouse" }, aqueduct: { icon: "🌉", name: "Aqueduct" }, statue: { icon: "🗿", name: "Statue" }, garden: { icon: "🌳", name: "Garden" }, arch: { icon: "🏛", name: "Triumphal arch" } };
  const SIGHT = {                                                                  // the sights each build may stand near, per city (the first with a clear patch of ground is used)
    rome: { fountain: ["forum", "castor", "market"], lighthouse: ["harbour"], aqueduct: ["circus", "palatine", "capitolium"], statue: ["capitolium", "forum", "pantheon"], garden: ["palatine", "domus", "hercules"], arch: ["trajan", "forum", "market"] },
    delhi: { fountain: ["d-chandni", "d-serai", "d-haveli"], lighthouse: ["d-jama", "d-diwanaam"], aqueduct: ["d-fatehpuri", "d-katra", "d-chandni", "d-lahori"], statue: ["d-chandni", "d-lahori", "d-jama"], garden: ["d-haveli", "d-rangmahal", "d-diwankhas"], arch: ["d-indiagate", "d-kartavya", "d-chandni"] },
    cancun: { fountain: ["c-casita", "c-castillo", "c-ballcourt"], lighthouse: ["c-beach", "c-reef", "c-azul"], aqueduct: ["c-sacbe", "c-cenote", "c-caracol"], statue: ["c-castillo", "c-ballcourt", "c-warriors"], garden: ["c-cenote", "c-venus", "c-caracol"], arch: ["c-sacbe", "c-tulum", "c-columns"] },
    beijing: { fountain: ["b-market", "b-tiananmen", "b-square"], lighthouse: ["b-lake", "b-jingshan", "b-summer"], aqueduct: ["b-hutong", "b-meridian", "b-heaven", "b-bridge"], statue: ["b-tiananmen", "b-square", "b-meridian"], garden: ["b-summer", "b-heaven", "b-jingshan"], arch: ["b-bridge", "b-tiananmen", "b-drum"] },
  };
  const FOOT = { statue: [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]], garden: [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5]], arch: [[0, 0], [-6, 0], [6, 0], [0, 4], [0, -4]], fountain: [[0, 0], [4.5, 0], [-4.5, 0], [0, 4.5], [0, -4.5]], lighthouse: [[0, 0], [3.5, 0], [-3.5, 0], [0, 3.5], [0, -3.5]], aqueduct: [[0, 0], [-17, 0], [-9, 0], [9, 0], [17, 0], [0, 4], [0, -4], [-17, 4], [17, -4]] };
  const COLORS = [0xb3342d, 0x2d6bb3, 0x2f8a4f, 0xc9a227, 0x7a3fa0, 0xd9731f, 0x2a2a2a, 0x2aa8a0], EMBLEMS = ["🦅", "🐺", "🐉", "🦁", "🌙", "⭐", "🐘", "🦊"];
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const $b = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const sid = (kind, n) => (n > 1 ? `${kind}#${n}` : kind);                       // (the spot of the first of a kind, and of its second, third ...)
  const cost = (kind, n) => Math.round(price[kind] * (1 + 0.5 * (n - 1)));        // a second of a kind costs half as much again, a third twice as much ...
  let max = 4, list = [], price = { fountain: 2000, lighthouse: 5000, aqueduct: 8000 }, scene = null, shown = [], sites = {}, shownKey = "", asked = "", askT = 0, siteT = 1.5, clock = 0;

  // ---- where a build stands: the first clear patch near its sight (the same answer for everybody)
  function pickSites(c) {
    const saved = dynBlockers.map((d) => d.on); dynBlockers.forEach((d) => { d.on = false; });               // (only the buildings and walls of the city count, not cars or people)
    const out = {}, taken = [];
    try {
      for (const [kind, n] of Object.keys(KINDS).flatMap((k) => Array.from({ length: max }, (_, i) => [k, i + 1]))) {
        let pick = null, first = null;
        const cands = SIGHT[c][kind].map((_, i, a) => a[(i + n - 1) % a.length]);                         // (each copy starts from the next sight)
        for (const id of cands) {
          const lm = ALL_LANDMARKS.find((l) => l.id === id); if (!lm) continue;
          const [bx, bz] = lm.stand || [lm.x, lm.z], g0 = groundAt(bx, bz);
          first = first || [bx + 12, bz + 12];
          for (const rad of [8, 14, 20, 28, 38, 50, 64]) {
            for (let a = 0; a < 12 && !pick; a++) {
              const cx = bx + Math.cos(a * Math.PI / 6) * rad, cz = bz + Math.sin(a * Math.PI / 6) * rad;
              if (taken.some((t) => Math.hypot(t[0] - cx, t[1] - cz) < 26)) continue;
              const ok = FOOT[kind].every(([dx, dz]) => { const x = cx + dx, z = cz + dz, y = groundAt(x, z); return y > -0.02 && Math.abs(y - g0) < 2.5 && !blockedAt(x, z, y); });
              if (ok) pick = [cx, cz];
            }
            if (pick) break;
          }
          if (pick) break;
        }
        out[sid(kind, n)] = pick || first || [0, 0]; taken.push(out[sid(kind, n)]);
      }
    } finally { dynBlockers.forEach((d, i) => { d.on = saved[i]; }); }
    return out;
  }

  // ---- the models
  function sign(b, h) {
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
    const g = cv.getContext("2d"), text = `${EMBLEMS[b.emblem % 8] || "🛡"} [${b.tag}] ${b.name}`;
    g.fillStyle = "rgba(28,22,16,.9)"; g.strokeStyle = "#" + COLORS[b.color % 8].toString(16).padStart(6, "0"); g.lineWidth = 8; g.beginPath(); g.roundRect(6, 16, 500, 96, 20); g.fill(); g.stroke();
    g.fillStyle = "#f1ead8"; g.font = "bold 36px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 56, 470);
    g.font = "26px sans-serif"; g.fillStyle = "#e2b955"; g.fillText(tr(KINDS[b.kind].name), 256, 92);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthWrite: false }));
    sp.scale.set(7, 1.75, 1); sp.position.y = h; return sp;
  }
  function banner(b, x, z, h) {
    const g = new T.Group(), col = COLORS[b.color % 8];
    const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, h, 6), lam(0x5a4a38)); pole.position.set(x, h / 2, z); g.add(pole);
    const flag = new T.Mesh(new T.PlaneGeometry(1.6, 1.0), new T.MeshBasicMaterial({ color: col, side: T.DoubleSide })); flag.position.set(x + 0.85, h - 0.6, z); flag.userData.flag = true; g.add(flag);
    return g;
  }
  const stone = lam(0xcfc7b4), dark = lam(0x9e9684);
  function fountain(b) {
    const g = new T.Group();
    const basin = new T.Mesh(new T.CylinderGeometry(3.4, 3.6, 0.9, 20), stone); basin.position.y = 0.45; g.add(basin);
    const water = new T.Mesh(new T.CircleGeometry(3.0, 20), new T.MeshBasicMaterial({ color: 0x4aa3d8, transparent: true, opacity: 0.8 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.92; water.userData.water = true; g.add(water);
    const col = new T.Mesh(new T.CylinderGeometry(0.35, 0.5, 2.4, 10), stone); col.position.y = 1.9; g.add(col);
    const bowl = new T.Mesh(new T.CylinderGeometry(1.5, 0.6, 0.5, 14), stone); bowl.position.y = 3.0; g.add(bowl);
    const jet = new T.Mesh(new T.ConeGeometry(0.55, 2.2, 10, 1, true), new T.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false })); jet.position.y = 4.4; jet.userData.jet = true; g.add(jet);
    g.add(banner(b, 4.6, 0, 5.2)); g.add(sign(b, 6.4));
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function lighthouse(b) {
    const g = new T.Group(), col = COLORS[b.color % 8];
    for (let i = 0; i < 5; i++) {
      const r0 = 2.6 - i * 0.28, r1 = 2.6 - (i + 1) * 0.28, band = new T.Mesh(new T.CylinderGeometry(r1, r0, 3.4, 16), i % 2 ? new T.MeshLambertMaterial({ color: col }) : lam(0xf1ede2)); band.position.y = 1.7 + i * 3.4; g.add(band);
    }
    const gal = new T.Mesh(new T.CylinderGeometry(2.1, 2.1, 0.35, 16), dark); gal.position.y = 17.2; g.add(gal);
    const lamp = new T.Mesh(new T.CylinderGeometry(1.0, 1.0, 1.9, 12), new T.MeshBasicMaterial({ color: 0xfff0b0 })); lamp.position.y = 18.4; lamp.userData.lamp = true; g.add(lamp);
    const roof = new T.Mesh(new T.ConeGeometry(1.5, 1.4, 12), new T.MeshLambertMaterial({ color: col })); roof.position.y = 20.0; g.add(roof);
    const beam = new T.Mesh(new T.ConeGeometry(6, 60, 12, 1, true), new T.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    beam.geometry.translate(0, -30, 0); beam.rotation.z = Math.PI / 2; beam.position.y = 18.4; const pivot = new T.Group(); pivot.position.y = 0; pivot.add(beam); pivot.userData.beam = true; g.add(pivot);
    g.add(banner(b, 3.4, 0, 6)); g.add(sign(b, 8));
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function aqueduct(b) {
    const g = new T.Group(), segW = 8.4, n = 4, depth = 2.6, H = 9;
    const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(segW, 0); sh.lineTo(segW, H); sh.lineTo(0, H); sh.closePath();
    const hole = new T.Path(); hole.moveTo(1.1, 0); hole.lineTo(1.1, 3.6); hole.absarc(segW / 2, 3.6, segW / 2 - 1.1, Math.PI, 0, true); hole.lineTo(segW - 1.1, 0); hole.closePath(); sh.holes.push(hole);
    const geo = new T.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 12 });
    for (let i = 0; i < n; i++) { const m = new T.Mesh(geo, i % 2 ? stone : lam(0xc4bba6)); m.position.set(-n * segW / 2 + i * segW, 0, -depth / 2); m.castShadow = true; g.add(m); }
    const chan = new T.Mesh(new T.BoxGeometry(n * segW, 0.5, 1.6), new T.MeshBasicMaterial({ color: 0x4aa3d8 })); chan.position.set(0, H + 0.15, 0); g.add(chan);
    for (const sz of [-0.95, 0.95]) { const rim = new T.Mesh(new T.BoxGeometry(n * segW, 0.7, 0.3), dark); rim.position.set(0, H + 0.35, sz); g.add(rim); }
    g.add(banner(b, -n * segW / 2 - 1.2, 0, 11)); g.add(sign(b, 13));
    return g;
  }
  function statue(b) {
    const g = new T.Group(), bronze = lam(0x8a6a2e);
    for (let i = 0; i < 3; i++) { const st = new T.Mesh(new T.BoxGeometry(5 - i * 0.9, 0.5, 5 - i * 0.9), i % 2 ? stone : dark); st.position.y = 0.25 + i * 0.5; g.add(st); }
    const ped = new T.Mesh(new T.BoxGeometry(2.2, 3.2, 2.2), stone); ped.position.y = 3.1; g.add(ped);
    const body = new T.Mesh(new T.CylinderGeometry(0.6, 0.85, 3.0, 10), bronze); body.position.y = 6.2; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.5, 12, 10), bronze); head.position.y = 8.2; g.add(head);
    const arm = new T.Mesh(new T.BoxGeometry(0.3, 2.0, 0.3), bronze); arm.position.set(0.9, 8.0, 0); arm.rotation.z = -0.5; g.add(arm);
    const band = new T.Mesh(new T.BoxGeometry(2.3, 0.4, 2.3), new T.MeshLambertMaterial({ color: COLORS[b.color % 8] })); band.position.y = 4.5; g.add(band);
    g.add(banner(b, 3.4, 0, 6)); g.add(sign(b, 10.5));
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function garden(b) {
    const g = new T.Group(), col = COLORS[b.color % 8];
    const lawn = new T.Mesh(new T.CircleGeometry(6, 28), lam(0x4f8f3f)); lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.05; g.add(lawn);
    const path = new T.Mesh(new T.RingGeometry(2.0, 2.7, 28), lam(0xd8c9a0)); path.rotation.x = -Math.PI / 2; path.position.y = 0.08; g.add(path);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (i % 4 === 0) continue; const h = new T.Mesh(new T.BoxGeometry(1.5, 0.9, 0.7), lam(0x2f6f2f)); h.position.set(Math.cos(a) * 5.5, 0.45, Math.sin(a) * 5.5); h.rotation.y = -a + Math.PI / 2; g.add(h); }
    for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.6 + (i % 5) * 0.45, f = new T.Mesh(new T.SphereGeometry(0.22, 6, 5), new T.MeshLambertMaterial({ color: i % 2 ? col : 0xf2e04a })); f.position.set(Math.cos(a) * r, 0.25, Math.sin(a) * r); g.add(f); }
    for (const [x, z] of [[-3.6, -3.4], [3.8, -3.2], [0, 4.2]]) { const tr = new T.Mesh(new T.CylinderGeometry(0.2, 0.28, 2.0, 7), lam(0x6a4a2a)); tr.position.set(x, 1.0, z); g.add(tr); const lf = new T.Mesh(new T.SphereGeometry(1.4, 9, 7), lam(0x2f7a35)); lf.position.set(x, 3.0, z); g.add(lf); }
    const bench = new T.Mesh(new T.BoxGeometry(1.8, 0.25, 0.6), lam(0x8a6a3e)); bench.position.set(1.8, 0.5, 1.2); g.add(bench);
    g.add(banner(b, 6.2, 0, 4.5)); g.add(sign(b, 7));
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  function arch(b) {
    const g = new T.Group(), col = new T.MeshLambertMaterial({ color: COLORS[b.color % 8] });
    for (const sx of [-1, 1]) { const pier = new T.Mesh(new T.BoxGeometry(3.4, 9, 4.2), stone); pier.position.set(sx * 4.6, 4.5, 0); g.add(pier); const cap = new T.Mesh(new T.BoxGeometry(3.8, 0.5, 4.6), dark); cap.position.set(sx * 4.6, 9.2, 0); g.add(cap); }
    const lintel = new T.Mesh(new T.BoxGeometry(12.6, 2.2, 4.2), stone); lintel.position.set(0, 9.3, 0); g.add(lintel);
    const frieze = new T.Mesh(new T.BoxGeometry(12.8, 0.7, 4.3), col); frieze.position.set(0, 9.0, 0); g.add(frieze);
    const attic = new T.Mesh(new T.BoxGeometry(11.2, 2.6, 3.6), stone); attic.position.set(0, 11.7, 0); g.add(attic);
    const top = new T.Mesh(new T.BoxGeometry(11.8, 0.5, 4.0), dark); top.position.set(0, 13.2, 0); g.add(top);
    for (const sx of [-1, 1]) { const f = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 4, 6), lam(0x5a4a38)); f.position.set(sx * 5, 15.2, 0); g.add(f); }
    g.add(sign(b, 17.4));
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return g;
  }
  const MAKE = { fountain, lighthouse, aqueduct, statue, garden, arch };

  // ---- showing them
  function clearShown() { for (const s of shown) { scene.remove(s.g); for (const d of s.dyn) { const i = dynBlockers.indexOf(d); if (i >= 0) dynBlockers.splice(i, 1); } } shown = []; }
  function rebuild() {
    clearShown();
    const here = list.filter((b) => b.city === city && KINDS[b.kind]), at = sites[city];
    shownKey = key(); if (!at) return;
    for (const b of here) {
      const p = at[sid(b.kind, b.n || 1)]; if (!p) continue;
      const g = MAKE[b.kind](b); g.position.set(p[0], groundAt(p[0], p[1]), p[1]); scene.add(g);
      const r = b.kind === "lighthouse" ? 2.6 : b.kind === "fountain" ? 3.6 : b.kind === "statue" ? 2.2 : b.kind === "arch" ? 1.9 : 1.4, dyn = [];
      const circles = b.kind === "aqueduct" ? [-16.8, -8.4, 0, 8.4, 16.8].map((dx) => [p[0] + dx, p[1]]) : b.kind === "garden" ? [] : b.kind === "arch" ? [[p[0] - 4.6, p[1]], [p[0] + 4.6, p[1]]] : [[p[0], p[1]]];      // (the aqueduct's piers; you can walk through its arches)
      for (const [x, z] of circles) { const d = { x, z, r, y1: groundAt(x, z) + 6, t: 1, on: true, era: undefined }; dynBlockers.push(d); dyn.push(d); }
      shown.push({ g, b, dyn });
    }
  }
  const key = () => `${city}|${list.filter((b) => b.city === city).map((b) => `${b.kind}${b.n || 1}${b.name}${b.color}${b.emblem}`).join(",")}|${sites[city] ? 1 : 0}`;

  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    clock += dt;
    if (!sites[city]) { siteT -= dt; if (siteT <= 0 && mode === "walk") { sites[city] = pickSites(city); siteT = 1.5; } }              // (a moment after you arrive, when the city's walls are in place)
    if (key() !== shownKey) rebuild();
    askT -= dt;
    if (typeof Online !== "undefined" && Online.connected && (askT <= 0 && asked !== "ok")) { asked = "ok"; askT = 30; Online.navalSend({ t: "builds" }); }
    if (typeof Online !== "undefined" && !Online.connected) asked = "";
    for (const s of shown) {
      s.g.traverse((o) => {
        if (o.userData.flag) o.rotation.y = Math.sin(clock * 3 + s.b.color) * 0.35;
        else if (o.userData.jet) { o.scale.y = 1 + Math.sin(clock * 9) * 0.12; o.material.opacity = 0.4 + Math.sin(clock * 7) * 0.08; }
        else if (o.userData.beam) { o.rotation.y = clock * 1.4; o.visible = Time.isNight; }
        else if (o.userData.lamp) o.material.color.setHex(Time.isNight ? 0xfff6c8 : 0xe9dca0);
      });
    }
  }

  function heard(m) { list = Array.isArray(m.list) ? m.list.filter((b) => b && KINDS[b.kind] && SIGHT[b.city]) : []; if (m.price) price = m.price; if (m.max) max = m.max; if ($b("buildspanel") && $b("buildspanel").classList.contains("show")) render(); }

  // ---- the panel
  function render() {
    const body = $b("builds-body"); if (!body) return;
    const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
    const mine = typeof Guilds !== "undefined" ? Guilds.mine : null, lead = !!(mine && mine.me && mine.members.some((m) => m.fid === mine.me && m.leader));
    const parts = [el("p", tr("A guild can pay for a landmark in a city from its treasury. It stands there for every player, with the guild's banner and name."), "bd-intro")];
    if (mine) parts.push(el("p", `${tr("Your guild's treasury")}: ${mine.treasury.toLocaleString()} ${tr("denarii")}${lead ? "" : " · " + tr("only the guild leader can build")}`, "bd-intro"));
    else parts.push(el("p", tr("Join or found a guild (🛡 Guild) to build."), "bd-intro"));
    const names = { rome: "Rome", delhi: "Delhi", cancun: "Cancún", beijing: "Beijing" };
    for (const c of [city, ...Object.keys(SIGHT).filter((x) => x !== city)]) {
      const sec = el("div", undefined, "bd-city"); sec.append(el("h3", `${tr(names[c])}${c === city ? " · " + tr("you are here") : ""}`));
      for (const kind of Object.keys(KINDS)) {
        const have = list.filter((x) => x.city === c && x.kind === kind).sort((p, q) => (p.n || 1) - (q.n || 1));
        for (const b of have) {                                                  // the ones already built
          const n = b.n || 1, row = el("div", undefined, "bd-row");
          row.append(el("span", `${KINDS[kind].icon} ${tr(KINDS[kind].name)}${n > 1 ? " #" + n : ""}`, "bd-name"), el("small", `${EMBLEMS[b.emblem % 8] || "🛡"} [${b.tag}] ${b.name}`));
          if (c === city && sites[city] && sites[city][sid(kind, n)]) { const go = el("button", tr("Directions")); go.type = "button"; go.addEventListener("click", () => { const p = sites[city][sid(kind, n)]; closePanels(); startDirections({ name: `${tr(KINDS[kind].name)} [${b.tag}]`, stand: [p[0] + 6, p[1] + 6] }); }); row.append(go); }
          sec.append(row);
        }
        const n = have.length + 1;
        if (n > max) continue;                                                   // (all of them are built)
        const row = el("div", undefined, "bd-row"), pr = cost(kind, n);
        row.append(el("span", `${KINDS[kind].icon} ${tr(KINDS[kind].name)}${n > 1 ? " #" + n : ""}`, "bd-name"));
        if (lead) {
          const can = mine.treasury >= pr, bt = el("button", `${tr(n > 1 ? "Build another" : "Build")} · ${pr.toLocaleString()}`); bt.type = "button"; bt.disabled = !can;
          bt.addEventListener("click", () => Dialog.confirm(`${tr("Build the")} ${tr(KINDS[kind].name).toLowerCase()}${n > 1 ? " #" + n : ""} ${tr("in")} ${tr(names[c])} ${tr("for")} ${pr.toLocaleString()} ${tr("denarii from the treasury")}?`).then((yes) => { if (yes) Online.navalSend({ t: "social", a: "g_build", city: c, kind }); }));
          row.append(el("small", can ? "" : tr("the treasury is too small")), bt);
        } else row.append(el("small", `${tr(n > 1 ? "Room for another" : "Not built yet")} · ${pr.toLocaleString()} ${tr("denarii")}`));
        sec.append(row);
      }
      parts.push(sec);
    }
    body.replaceChildren(...parts);
  }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    if (typeof Online === "undefined" || !Online.connected) { toast(tr("Guild builds need the game server: log in and wait to be connected.")); return; }
    Online.navalSend({ t: "builds" }); if (typeof Account !== "undefined" && Account.loggedIn) Online.navalSend({ t: "social", a: "g_me" });
    render(); openPanel("#buildspanel");
  }
  function build(sc) { scene = sc; }
  function bind() { const b = $b("btn-builds"); if (b) b.addEventListener("click", open); }
  return { build, bind, update, heard, open, render, get list() { return list; }, get sites() { return sites; } };
})();
