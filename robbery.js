"use strict";
// The Via Domus and house robberies (online). Every player who is online has a house on this street in Rome, so you can walk
// along it and see their names. Walk up to someone else's door and press F to break in and take 100 denarii. You then pick a
// getaway vehicle (or run on foot) and must get away before the owner catches you: caught, you lose 100 denarii to them;
// away (230 m, or 80 seconds), you keep 100 of theirs. The owner is told at once and shown where you are. The server decides
// who is caught (server/server.py); the denarii are kept by the browsers. Depends on online.js, car.js, market.js and game.js.

const Robbery = (() => {
  const T = THREE;
  const BOXG = new T.BoxGeometry(1, 1, 1), CYLG = new T.CylinderGeometry(1, 1, 1, 12), CONEG = new T.ConeGeometry(1, 1, 8), PYRG = new T.ConeGeometry(1, 1, 4);
  const PLOTS = 12, PLAYER_PLOTS = 8, X0 = 185, DX = 26, NORTH_Z = -55, SOUTH_Z = -25;   // the same numbers as the server's
  const LOOT = 100;
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const $r = (id) => document.getElementById(id);

  const plotAt = (i) => { const col = i % 6, row = Math.floor(i / 6), x = X0 + col * DX; return row === 0 ? { x, z: NORTH_Z, door: [x, NORTH_Z + 7.5], face: 1 } : { x, z: SOUTH_Z, door: [x, SOUTH_Z - 7.5], face: -1 }; };

  const NPC = [{ plot: 8, name: "Gaius", tier: 1 }, { plot: 9, name: "Livia", tier: 2 }, { plot: 10, name: "Marcus", tier: 2 }, { plot: 11, name: "Julia", tier: 3 }];
  const npcCd = {}, guards = [];
  let lieLow = 0;
  let scene = null;
  const houses = [];           // per plot: { g, tierGroups, blockers, sign, label, id, tier }
  let list = [], mine = null;
  let heist = null;            // { role, other, left, d, x, z, until }
  let panelT = 0;

  // ---------------------------------------------------------------- building the street

  function sign(parent, text, y, z, rotY) {
    const c = document.createElement("canvas"); c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, 256, 64); g.strokeStyle = "#f2d98a"; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58);
    g.fillStyle = "#f2d98a"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 28px sans-serif"; g.fillText(text.slice(0, 16), 128, 34);
    const m = new T.Mesh(new T.PlaneGeometry(4.4, 1.1), new T.MeshLambertMaterial({ map: new T.CanvasTexture(c), side: T.DoubleSide, emissive: 0x201808 }));
    m.position.set(0, y, z); m.rotation.y = rotY; parent.add(m);
    return m;
  }

  function buildHouse(i) {
    const p = plotAt(i), g = new T.Group(), f = p.face;       // f = +1: the door faces south (+z); -1: north
    g.position.set(p.x, 0, p.z); scene.add(g);
    const blockers = [];
    const box = (parent, x, y0, z, w, h, d, mat, solid) => {
      const m = new T.Mesh(BOXG, mat); m.scale.set(w, h, d); m.position.set(x, y0 + h / 2, z * f); m.castShadow = true; m.receiveShadow = true; parent.add(m);
      if (solid) blockers.push(addBlockerBox(p.x + x - w / 2, p.x + x + w / 2, p.z + z * f - d / 2, p.z + z * f + d / 2, y0, y0 + h, { off: true }));
      return m;
    };
    const wall = lam(0xcdb994), roof = lam(0x9a4a2a), dark = lam(0x2a241d), stone = lam(0xb9a98a), green = lam(0x4f7a3a);
    // the base house: walls, a roof, a doorway and windows
    box(g, 0, 0, 0, 14, 4.4, 10, wall, true);
    box(g, 0, 4.4, 0, 15, 0.6, 11, roof, false);
    box(g, 0, 0, 5.05, 2.6, 3.0, 0.2, dark, false);
    for (const sx of [-4.5, 4.5]) box(g, sx, 1.6, 5.05, 1.5, 1.4, 0.2, dark, false);
    // tier groups: garden, wings, tower: each shown according to the owner's house
    const tiers = [new T.Group(), new T.Group(), new T.Group()];
    for (const t of tiers) { t.visible = false; g.add(t); }
    box(tiers[0], 0, 0.02, 9, 22, 0.1, 8, green, false);                                 // garden in front
    for (const sx of [-10.5, 10.5]) box(tiers[0], sx, 0, 9, 1, 1.2, 8, lam(0x3f6b34), true);
    for (const sx of [-8, 8]) { const c = new T.Mesh(CONEG, lam(0x2f5a35)); c.scale.set(1.1, 4.5, 1.1); c.position.set(sx, 2.25, 12.5 * f); tiers[0].add(c); }
    for (const sx of [-11, 11]) { box(tiers[1], sx, 0, 0, 8, 3.6, 9, stone, true); box(tiers[1], sx, 3.6, 0, 9, 0.5, 10, roof, false); } // wings
    box(tiers[2], 0, 5, 0, 6, 5, 5, stone, true);                                        // a tower with a gilded top
    const top = new T.Mesh(PYRG, lam(0xd9b44a)); top.scale.set(4.6, 3, 4.6); top.position.set(0, 12.5, 0); top.rotation.y = Math.PI / 4; tiers[2].add(top);
    // the sign with the owner's name hangs over the door
    const label = sign(g, "", 3.9, 5.2 * f, f > 0 ? 0 : Math.PI);
    const h = { g, tiers, blockers, label, id: null, tier: -1, name: "" };
    g.visible = false;
    houses[i] = h;
    return h;
  }

  function setLabel(h, name) {
    if (h.name === name) return;
    h.name = name;
    h.g.remove(h.label);
    h.label.material.map.dispose(); h.label.material.dispose();
    h.label = sign(h.g, `${name}'s`, 3.9, 5.2 * (plotAt(houses.indexOf(h)).face), plotAt(houses.indexOf(h)).face > 0 ? 0 : Math.PI);
  }

  // the server says which houses are standing (their owners are online)
  function setHouses(rows, mineIdx) {
    if (!scene) return;
    list = rows || []; mine = mineIdx;
    const present = new Set();
    for (const [plot, id, name, tier] of list) {
      if (plot < 0 || plot >= PLOTS) continue;
      const h = houses[plot] || buildHouse(plot);
      present.add(plot);
      h.id = id; h.g.visible = true; setLabel(h, name);
      h.tiers.forEach((t, k) => { t.visible = tier > k; });
      h.blockers.forEach((b) => { b.off = false; });
      h.tier = tier;
    }
    houses.forEach((h, i) => { if (h && !present.has(i) && i < PLOTS - 4) { h.g.visible = false; h.id = null; h.blockers.forEach((b) => { b.off = true; }); } });
  }

  // ---------------------------------------------------------------- the door

  function at(x, z, feet = 0) {
    if (feet > 3 || typeof city === "undefined" || city !== "rome" || heist) return null;
    for (let i = 0; i < houses.length; i++) {
      const h = houses[i];
      if (!h || !h.id) continue;
      const p = plotAt(i);
      if (Math.hypot(x - p.door[0], z - p.door[1]) < 4) return { id: h.id, name: h.name, plot: i };
    }
    return null;
  }

  function act() {
    const t = at(player.x, player.z, player.feet);
    if (!t) return false;
    if (String(t.id).startsWith("npc:")) { beginNpc(t); return true; }
    if (!Online.connected) { toast("You need to be online to rob a house."); return true; }
    Online.navalSend({ t: "rob", target: t.id });
    return true;
  }

  // ---------------------------------------------------------------- the chase

  const dirWord = (dx, dz) => { const a = Math.atan2(dx, -dz), names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]; return names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]; };

  function hud() {
    const el = $r("heist-hud");
    if (!heist) { el.classList.remove("show"); return; }
    el.classList.add("show");
    const left = Math.max(0, Math.round((heist.until - performance.now()) / 1000));
    if (heist.role === "thief") el.innerHTML = `<strong>🏃 Run! ${heist.npc ? "The city guards are" : esc(heist.other) + " is"} after you</strong><span>${heist.d != null ? `${heist.d} m behind you${heist.x !== undefined && heist.d > 0 ? `, to the ${dirWord(heist.x - player.x, heist.z - player.z)}: run ${dirWord(player.x - heist.x, player.z - heist.z)}` : ""}. ` : ""}There is no place to reach: just get away. You are clear in ${left} s, or at 230 m. Cars, carts and elephants are faster than running. If they catch you, you lose ${LOOT} denarii.</span>`;
    else el.innerHTML = `<strong>⚠ ${esc(heist.other)} is robbing your house!</strong><span>${heist.d != null ? `${heist.d} m away, to the ${dirWord(heist.x - player.x, heist.z - player.z)}. ` : ""}Catch them within ${left} s to win back ${LOOT} denarii.</span>`;
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function begin(m) {
    heist = { role: m.role, other: m.other, d: null, x: m.x, z: m.z, until: performance.now() + (m.time || 80) * 1000 };
    if (m.role === "thief") {
      spawnGuards(player.x, player.z, 3);
      toast(`You break into ${m.other}'s house and grab ${m.loot} denarii! The guards and ${m.other} are after you. Pick your getaway.`);
      Narrator.say(`You broke in and grabbed the loot. Run before ${m.other} catches you.`, { interrupt: true });
      Sfx.play("bump");
      openGetaway();
    } else {
      toast(`${m.other} is robbing your house! Catch them!`);
      Narrator.say(`${m.other} is robbing your house. Catch them.`, { interrupt: true });
      Chat.add({ sys: 1, text: `⚠ ${m.other} is robbing your house on the Via Domus!` });
      Sfx.play("horn");
    }
    hud();
  }

  function openGetaway() {
    const ul = $r("gw-list"); ul.replaceChildren();
    const owned = Object.keys(Market.ITEMS).filter((id) => { const it = Market.ITEMS[id], M = Car.MODELS[id]; return (it.type === "car" || it.type === "mount") && M && Market.owns(id) && (M.era || "modern") === era; });
    const add = (label, note, fn) => {
      const li = document.createElement("li"), sp = document.createElement("span"), b = document.createElement("button");
      const s1 = document.createElement("strong"), s2 = document.createElement("small"); s1.textContent = label; s2.textContent = note; sp.append(s1, s2);
      b.type = "button"; b.textContent = "Go!"; b.addEventListener("click", () => { closePanels(); fn(); });
      li.append(sp, b); ul.append(li);
    };
    for (const id of owned) { const M = Car.MODELS[id]; add(M.name, `Top speed ${Math.round(M.max * 3.6)} km/h`, () => { Car.deploy(id); setTimeout(() => Car.enter(), 60); }); }
    add("Run on foot", "Hold Shift to sprint", () => toast("You run for it! Hold Shift to sprint."));
    if (!owned.length) $r("gw-note").textContent = "You do not own a vehicle that works here, so you run. (Buy one at the animals and rides stall in the market square.)"; else $r("gw-note").textContent = "Pick your getaway. The clock is running.";
    openPanel("#getaway");
  }

  function pos(m) {
    if (!heist) return;
    if (m.d !== undefined) heist.d = m.d;
    if (m.x !== undefined) { heist.x = m.x; heist.z = m.z; }
    if (m.left !== undefined) heist.until = performance.now() + m.left * 1000;
    hud();
  }

  function end(m) {
    const role = m.role, other = role === "thief" ? m.victim : m.thief, loot = m.loot || LOOT, byGuards = !!(heist && (heist.reported || heist.npc));
    heist = null; for (const gd of guards) gd.g.visible = false;
    if ($r("getaway").classList.contains("show")) closePanels();
    if (role === "thief") {
      if (m.result === "escaped") { Vitals.coins += loot; toast(`You got away with ${loot} denarii of ${other}'s!`); Narrator.say(`You got away with ${loot} denarii.`, { interrupt: true }); Sfx.play("coin"); }
      else { const lost = Math.min(loot, Vitals.coins); Vitals.coins -= lost; const who = byGuards ? "The city guards" : other; toast(`${who} caught you! You lose ${lost} denarii.`); Narrator.say(`${who} caught you. You lose ${lost} denarii.`, { interrupt: true }); Sfx.play("oof"); }
    } else if (m.result === "escaped") {
      const lost = Math.min(loot, Vitals.coins); Vitals.coins -= lost; toast(`${other} got away with ${lost} denarii of yours.`); Narrator.say(`${other} got away with ${lost} denarii.`, { interrupt: true });
    } else { Vitals.coins += loot; toast(`You caught ${other}! They pay you ${loot} denarii.`); Narrator.say(`You caught ${other}. They pay you ${loot} denarii.`, { interrupt: true }); Sfx.play("coin"); }
    Chat.add({ sys: 1, text: role === "thief" ? (m.result === "escaped" ? `You robbed ${other} and got away.` : `${byGuards ? "The city guards" : other} caught you after the robbery.`) : (m.result === "escaped" ? `${other} robbed you and got away.` : `You caught ${other} robbing your house.`) });
    hud();
  }

  // ---------------------------------------------------------------- robbing the houses of the people who are always at home: the city guards chase you

  function guardModel() {
    const g = new T.Group(), robe = lam(0x9a2a2a), grey = lam(0x8a8d92);
    const body = new T.Mesh(CYLG, robe); body.scale.set(0.38, 1.3, 0.38); body.position.y = 0.65; g.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.23, 10, 8), lam(0xd8a77a)); head.position.y = 1.55; g.add(head);
    const helm = new T.Mesh(new T.CylinderGeometry(0.22, 0.27, 0.22, 10), grey); helm.position.y = 1.78; g.add(helm);
    const spear = new T.Mesh(CYLG, lam(0x6a4c2a)); spear.scale.set(0.03, 2.2, 0.03); spear.position.set(0.4, 1.1, 0); g.add(spear);
    const tip = new T.Mesh(CONEG, grey); tip.scale.set(0.07, 0.3, 0.07); tip.position.set(0.4, 2.3, 0); g.add(tip);
    g.traverse((m) => { m.castShadow = true; });
    g.visible = false; scene.add(g);
    return g;
  }

  function spawnGuards(x, z, spread) {
    while (guards.length < 2) guards.push({ g: guardModel(), x: 0, z: 0, t: 0 });
    guards.forEach((gd, i) => { gd.x = x + (i ? spread : -spread); gd.z = z + spread; gd.t = i * 3; gd.age = 0; gd.g.visible = true; gd.g.position.set(gd.x, groundAt(gd.x, gd.z), gd.z); });
    if (typeof Speech !== "undefined") Speech.say({ x: guards[0].x, z: guards[0].z }, "Stop, thief!", 3);
  }

  function beginNpc(t) {
    const now = performance.now();
    if (heist) return;
    if (typeof city === "undefined" || city !== "rome") return;
    if (now < lieLow) { toast("Lie low for a moment: the guards are still about."); return; }
    if (now < (npcCd[t.plot] || 0)) { toast(`The guards are watching ${t.name}'s house after the last robbery. Try another.`); return; }
    const loot = 60 + Math.floor(Math.random() * 7) * 10, p = plotAt(t.plot);
    npcCd[t.plot] = now + 300000;
    heist = { role: "thief", npc: true, plot: t.plot, other: t.name, d: null, until: now + 60000, loot, owner: t.name };
    spawnGuards(p.door[0], p.door[1] + (p.face > 0 ? 3 : -3), 3);
    toast(`You break into ${t.name}'s house and grab ${loot} denarii! The guards have seen you. Pick your getaway.`);
    Narrator.say("You broke in and grabbed the loot. The guards are after you. Run.", { interrupt: true });
    Sfx.play("horn");
    openGetaway(); hud();
  }

  function guardsEnd(result) {
    for (const gd of guards) gd.g.visible = false;
    const h = heist;
    lieLow = performance.now() + 60000;
    end({ role: "thief", result, loot: h.loot, thief: "You", victim: h.owner });
  }

  // the guards run at you (faster the longer the chase goes on); returns how close the nearest one is
  function guardsStep(dt) {
    let near = Infinity;
    for (const gd of guards) {
      gd.t -= dt;
      if (gd.t > 0) { gd.g.visible = true; near = Math.min(near, Math.hypot(player.x - gd.x, player.z - gd.z)); continue; }          // the second guard sets off a few seconds later
      gd.age += dt;
      const dx = player.x - gd.x, dz = player.z - gd.z, d = Math.hypot(dx, dz) || 1, sp = (5.5 + Math.min(2.5, gd.age * 0.08)) * dt;   // slower: 5.5 m/s at first, up to 8 m/s after half a minute
      let nx = gd.x + (dx / d) * sp, nz = gd.z + (dz / d) * sp;
      if (blockedAt(nx, nz, groundAt(gd.x, gd.z))) { if (!blockedAt(nx, gd.z, groundAt(gd.x, gd.z))) nz = gd.z; else if (!blockedAt(gd.x, nz, groundAt(gd.x, gd.z))) nx = gd.x; else { nx = gd.x; nz = gd.z; } }
      gd.x = nx; gd.z = nz; gd.g.position.set(gd.x, groundAt(gd.x, gd.z), gd.z); gd.g.rotation.y = Math.atan2(dx, dz);
      near = Math.min(near, Math.hypot(player.x - gd.x, player.z - gd.z));
    }
    return near;
  }

  function npcUpdate(dt) {
    const h = heist, near = guardsStep(dt);
    h.d = Math.round(near);
    let nearest = guards[0]; for (const gd of guards) if (Math.hypot(player.x - gd.x, player.z - gd.z) < Math.hypot(player.x - nearest.x, player.z - nearest.z)) nearest = gd;
    h.x = nearest.x; h.z = nearest.z;
    const left = (h.until - performance.now()) / 1000;
    if (near < 2.8 && mode !== "dgame") { guardsEnd("caught"); return; }
    if (near > 150 || left <= 0) guardsEnd("escaped");
  }

  function update(dt) {
    panelT -= dt;
    if (heist && panelT <= 0) { panelT = 0.5; hud(); }
    if (heist && heist.npc) npcUpdate(dt);
    else if (heist && heist.role === "thief" && guards.some((gd) => gd.g.visible)) {      // a real robbery: the guards chase too, and can catch you
      const near = guardsStep(dt);
      if (near < 2.8 && !heist.reported) { heist.reported = true; Online.navalSend({ t: "heist_caught" }); }
    }
  }

  return {
    init(sc) {
      scene = sc;
      NPC.forEach((n) => {                                         // four houses on the street are always occupied, so you can rob on your own
        const h = houses[n.plot] || buildHouse(n.plot);
        h.id = "npc:" + n.plot; h.g.visible = true; setLabel(h, n.name); h.tiers.forEach((t, k) => { t.visible = n.tier > k; }); h.blockers.forEach((b) => { b.off = false; }); h.tier = n.tier;
      });
    },
    setHouses, at, act, begin, pos, end, update,
    get active() { return !!heist; },
    get role() { return heist ? heist.role : null; },
    PLOTS,
  };
})();
