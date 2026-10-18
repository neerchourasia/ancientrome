"use strict";
// The harbour at Portus, south-west of the Forum in Rome: a stone basin you can sail your own ships in (the ones you designed in
// the shipyard). Stand at the gate and press F to board. Out on the water:
//   fishing: slow down over a ring of ripples and press F to cast; when the float dips ("A bite!") press F again;
//   trading:  sail up to a pier and press F: sell your fish and cargo and load more. Grain from Ostia wharf sells for more at
//             Portus quay, and wine from Portus quay sells for more at Ostia wharf;
//   pirates:  they come for ships that carry fish or cargo; sink them for a bounty, or lose everything if they sink you.
// Your cannons work as in the naval battle (Q, E, Space). Esc ties up at the quay. Depends on naval.js, shipyard.js and game.js.

const Harbour = (() => {
  const T = THREE;
  const A = { cx: 50, cz: 140, rx: 78, rz: 50 };                         // the basin (an ellipse): where the ships sail
  const GATE = { x: A.cx, z: A.cz - A.rz - 9, r: 5 };                    // where you stand to board
  const PIERS = [
    { id: "ostia", name: "Ostia wharf", x: A.cx - A.rx + 4, z: A.cz, sell: { wine: 29 }, buy: { item: "grain", price: 14 } },
    { id: "portus", name: "Portus quay", x: A.cx + A.rx - 4, z: A.cz, sell: { grain: 23 }, buy: { item: "wine", price: 18 } },
  ];
  const FISH_PRICE = 14, PIRATE_BOUNTY = 35;
  const $h = (id) => document.getElementById(id);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const BOX = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(1, 1, 1, 10);

  let scene = null, built = false, water = null, spots = [], root = null;
  let hold = { fish: 0, item: null, qty: 0 };      // what you carry (kept until you sell it, or lose it to the pirates)
  let cast = { phase: "idle", t: 0 }, pirateT = 90, me = null, hintT = 0, sailing = false;

  // ---------------------------------------------------------------- the quay and the piers

  function build(sc) {
    if (built) return;
    built = true; scene = sc; root = new T.Group(); scene.add(root);
    const stone = lam(0xb7ad98), dark = lam(0x8d8574), wood = lam(0x7a5a34);
    // the quay: a ring of stone round the basin (with a gap at the north for the gate), as boxes along the curve
    const N = 76, rx = A.rx + 3, rz = A.rz + 3;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      const x0 = A.cx + Math.cos(a0) * rx, z0 = A.cz + Math.sin(a0) * rz, x1 = A.cx + Math.cos(a1) * rx, z1 = A.cz + Math.sin(a1) * rz, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.abs(cx - A.cx) < 7 && cz < A.cz) continue;                                  // the gate
      const len = Math.hypot(x1 - x0, z1 - z0) + 0.8, m = new T.Mesh(BOX, i % 2 ? stone : dark);
      m.scale.set(len, 1.7, 3.2); m.position.set(cx, 0.85, cz); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); m.castShadow = true; m.receiveShadow = true; root.add(m);
      addBlockerCircle(cx, cz, 2.3, 0, 1.7);
      addBlockerCircle((cx + x0) / 2, (cz + z0) / 2, 2.0, 0, 1.7);
    }
    // the gate: two pillars and a sign, and steps down to the quay
    for (const sx of [-1, 1]) { const p = new T.Mesh(CYL, stone); p.scale.set(0.9, 4.2, 0.9); p.position.set(A.cx + sx * 6.5, 2.1, A.cz - rz); root.add(p); addBlockerCircle(A.cx + sx * 6.5, A.cz - rz, 1.0, 0, 4.2); }
    const lintel = new T.Mesh(BOX, stone); lintel.scale.set(14.5, 0.8, 1.6); lintel.position.set(A.cx, 4.6, A.cz - rz); root.add(lintel);
    const sc2 = document.createElement("canvas"); sc2.width = 320; sc2.height = 80; const g = sc2.getContext("2d");
    g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, 320, 80); g.strokeStyle = "#f2d98a"; g.lineWidth = 4; g.strokeRect(4, 4, 312, 72); g.fillStyle = "#f2d98a"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 36px sans-serif"; g.fillText("PORTUS", 160, 28); g.font = "bold 20px sans-serif"; g.fillText("the harbour · sail from here", 160, 58);
    const sign = new T.Mesh(new T.PlaneGeometry(7, 1.75), new T.MeshLambertMaterial({ map: new T.CanvasTexture(sc2), side: T.DoubleSide, emissive: 0x201808 })); sign.position.set(A.cx, 5.8, A.cz - rz - 0.9); sign.rotation.y = Math.PI; root.add(sign);
    // the water in the basin, while you are on the quay (the naval code draws its own while you sail)
    water = new T.Mesh(new T.CircleGeometry(1, 40), new T.MeshPhongMaterial({ color: 0x3a86b0, transparent: true, opacity: 0.86, shininess: 90, specular: 0xaaccee }));
    water.rotation.x = -Math.PI / 2; water.scale.set(A.rx + 2, A.rz + 2, 1); water.position.set(A.cx, 0.9, A.cz); water.scale.set(A.rx + 2, A.rz + 2, 1); root.add(water);
    // the two piers (wooden jetties running into the basin), with a sign and some crates
    for (const p of PIERS) {
      const dir = p.x < A.cx ? -1 : 1;
      const deck = new T.Mesh(BOX, wood); deck.scale.set(9, 0.4, 4); deck.position.set(p.x + dir * 2, 1.05, p.z); deck.castShadow = true; root.add(deck);
      for (const pz of [-1.6, 1.6]) for (const px of [-3.5, 3.5]) { const post = new T.Mesh(CYL, wood); post.scale.set(0.2, 2, 0.2); post.position.set(p.x + dir * 2 + px, 0.4, p.z + pz); root.add(post); }
      for (let k = 0; k < 3; k++) { const c = new T.Mesh(BOX, lam(0x8a6a3a)); c.scale.set(1.2, 1.1, 1.2); c.position.set(p.x + dir * 4.2 + (k % 2) * 0.3, 1.8, p.z - 1 + k * 1.1); root.add(c); }
      const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const gg = cv.getContext("2d"); gg.fillStyle = "#3a2a1a"; gg.fillRect(0, 0, 256, 64); gg.strokeStyle = "#f2d98a"; gg.lineWidth = 3; gg.strokeRect(3, 3, 250, 58); gg.fillStyle = "#f2d98a"; gg.textAlign = "center"; gg.textBaseline = "middle"; gg.font = "bold 28px sans-serif"; gg.fillText(p.name.toUpperCase(), 128, 34);
      const sg = new T.Mesh(new T.PlaneGeometry(4.2, 1.05), new T.MeshLambertMaterial({ map: new T.CanvasTexture(cv), side: T.DoubleSide })); sg.position.set(p.x + dir * 3, 3.3, p.z + 2.2); root.add(sg);
    }
    // shoals of fish: rings of ripples on the water while you sail
    const rc = document.createElement("canvas"); rc.width = rc.height = 64; const rg = rc.getContext("2d"); rg.strokeStyle = "rgba(255,255,255,.9)"; rg.lineWidth = 3; for (const r of [12, 20, 28]) { rg.beginPath(); rg.arc(32, 32, r, 0, 6.3); rg.stroke(); }
    const tex = new T.CanvasTexture(rc);
    for (let i = 0; i < 10; i++) { const s = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 })); s.rotation.x = -Math.PI / 2; s.scale.set(6, 6, 1); s.visible = false; scene.add(s); spots.push(s); placeSpot(s); }
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "e", cx: A.cx, cz: A.cz, ax: A.rx + 5, az: A.rz + 5, c: "#4a86b0" });
  }

  function placeSpot(s) {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.28, r = 0.25 + Math.random() * 0.65, x = A.cx + Math.cos(a) * A.rx * r, z = A.cz + Math.sin(a) * A.rz * r;
      if (PIERS.every((p) => Math.hypot(x - p.x, z - p.z) > 12)) { s.position.set(x, 0.95, z); return; }
    }
  }

  // ---------------------------------------------------------------- on the quay

  const at = (x, z, feet = 0) => (feet <= 3 && typeof city !== "undefined" && city === "rome" && Math.hypot(x - GATE.x, z - GATE.z) < GATE.r ? { text: "F: board your ship and sail the harbour" } : null);

  // at the gate: choose which of your saved ships to sail (you cannot build one here: that is the shipyard in the arena)
  function board() {
    if (!at(player.x, player.z, player.feet)) return false;
    if (mode !== "walk" || panelOpen || !canStart()) { toast("Close what is open and stop the game first"); return true; }
    if (!Vitals.canFight()) { toast(`You are too tired to sail (health ${Math.round(Vitals.hp)}/100). Press Z to rest.`); return true; }
    const ul = $h("hp-list"); ul.replaceChildren();
    for (const s of Shipyard.list()) {
      const f = Shipyard.info(s.i), li = document.createElement("li"), b = document.createElement("button"), t = document.createElement("span"), n = document.createElement("strong"), d = document.createElement("small");
      n.textContent = `${s.i === Shipyard.sel ? "▶ " : ""}${f.name}`; d.textContent = `${f.type} · hull ${f.hp} · ${f.kmh} km/h · ${f.cannons} cannons · holds ${f.hold}`;
      t.append(n, d); b.type = "button"; b.append(Shipyard.miniAt(s.i), t);
      b.addEventListener("click", () => { Shipyard.choose(s.i); closePanels(); sailOut(); });
      li.append(b); ul.append(li);
    }
    openPanel("#harborpick");
    return true;
  }

  function sailOut() {
    water.visible = false; spots.forEach((s) => { s.visible = true; });
    sailing = true; cast = { phase: "idle", t: 0 }; pirateT = 80 + Math.random() * 40;
    Naval.startHarbour(Shipyard.selectedDef(), A, { update, bounty, sunk, left });
    Narrator.say("You cast off. Fish the shoals, trade between the piers, and watch for pirates.", { interrupt: true });
    toast("Harbour: F fishes (slow over the ripples) or trades (at a pier). Q, E and Space fire. Esc ties up.");
    return true;
  }

  function left() {
    sailing = false; water.visible = true; spots.forEach((s) => { s.visible = false; });
    placeAt(GATE.x, GATE.z, Math.PI);
    const bits = [hold.fish ? `${hold.fish} fish` : "", hold.item ? `${hold.qty} ${hold.item}` : ""].filter(Boolean).join(" and ");
    if (bits) toast(`You tie up at the quay. Your hold: ${bits}.`);
  }

  // ---------------------------------------------------------------- out on the water

  const capacity = (m) => 3 + Math.floor(m.max / 35);

  function pierNear(m) { return PIERS.find((p) => Math.hypot(m.x - p.x, m.z - p.z) < 11 && Math.abs(m.v) < 3.2) || null; }
  function spotNear(m) { return spots.find((s) => s.visible && Math.hypot(m.x - s.position.x, m.z - s.position.z) < 7) || null; }

  function say(t, ms = 2200) { const m = $h("center-msg"); m.textContent = t; m.classList.add("show"); clearTimeout(say.t); say.t = setTimeout(() => m.classList.remove("show"), ms); }

  function action() {
    if (!sailing || !me) return;
    if (cast.phase === "bite") {                                    // the float dipped: reel in
      const spot = cast.spot; cast = { phase: "idle", t: 0 };
      const big = Math.random() < 0.15, n = 1 + (Math.random() < 0.3 ? 1 : 0);
      hold.fish += n; placeSpot(spot); Sfx.play("coin");
      say(big ? `A big one! ${n} fish. (${hold.fish} in the hold)` : `You land ${n} fish. (${hold.fish} in the hold)`); return;
    }
    if (cast.phase === "wait") { cast = { phase: "idle", t: 0 }; say("Too early: the fish got away."); return; }
    const pier = pierNear(me);
    if (pier) { trade(pier); return; }
    const spot = spotNear(me);
    if (spot) {
      if (Math.abs(me.v) > 1.8) { say("Slow down to fish."); return; }
      cast = { phase: "wait", t: 2 + Math.random() * 3.5, spot }; say("You cast your line... wait for the float to dip."); return;
    }
    say("Sail slowly onto a ring of ripples to fish, or up to a pier to trade.");
  }

  function trade(pier) {
    const lines = []; let earned = 0;
    if (hold.fish) { const e = hold.fish * FISH_PRICE; earned += e; lines.push(`${hold.fish} fish for ${e}`); hold.fish = 0; }
    if (hold.item && pier.sell[hold.item]) { const e = hold.qty * pier.sell[hold.item]; earned += e; lines.push(`${hold.qty} ${hold.item} for ${e}`); hold = { ...hold, item: null, qty: 0 }; }
    Vitals.coins += earned;
    if (!hold.item) {                                                // load up for the other pier
      const cap = capacity(me), n = Math.min(cap, Math.floor(Vitals.coins / pier.buy.price));
      if (n > 0) { Vitals.coins -= n * pier.buy.price; hold.item = pier.buy.item; hold.qty = n; lines.push(`bought ${n} ${pier.buy.item} at ${pier.buy.price} each`); }
      else lines.push("you cannot afford any cargo");
    } else lines.push(`you already carry ${hold.qty} ${hold.item}`);
    if (earned) Sfx.play("coin");
    say(`${pier.name}: ${lines.join("; ")}.`, 3800);
    Narrator.say(`${pier.name}. ${lines.join(". ")}.`, { interrupt: true });
  }

  function bounty(f) { Vitals.coins += PIRATE_BOUNTY; Sfx.play("coin"); say(`A pirate ship sinks! Bounty: ${PIRATE_BOUNTY} denarii.`); }

  function sunk() {
    const lost = Math.min(Vitals.coins, 40);
    Vitals.coins -= lost; hold = { fish: 0, item: null, qty: 0 }; Vitals.hp = Math.max(20, Vitals.hp * 0.5);
    toast(`Pirates sank your ship! You lose your hold and ${lost} denarii, and you are pulled out half drowned.`);
    Narrator.say("Pirates sank your ship. You lose your cargo.", { interrupt: true });
  }

  function update(dt, m, pirates) {
    me = m;
    for (const s of spots) { s.material.opacity = 0.55 + 0.25 * Math.sin(performance.now() / 400 + s.position.x); s.scale.setScalar(5 + Math.sin(performance.now() / 700 + s.position.z) * 0.7); }
    if (cast.phase === "wait") {
      if (!spotNear(m) || Math.abs(m.v) > 2.5) { cast = { phase: "idle", t: 0 }; say("You drifted off the shoal: the line goes slack."); }
      else { cast.t -= dt; if (cast.t <= 0) { cast.phase = "bite"; cast.t = 1.3; say("A bite! Press F now!", 1400); Sfx.play("splash"); } }
    } else if (cast.phase === "bite") { cast.t -= dt; if (cast.t <= 0) { cast = { phase: "idle", t: 0 }; say("The fish got away."); } }
    // pirates come for ships with something worth taking
    pirateT -= dt;
    if (pirateT <= 0) {
      pirateT = 70 + Math.random() * 50;
      const laden = hold.fish + hold.qty;
      if (!pirates && (laden > 0 || Math.random() < 0.3)) Naval.spawnPirates(laden > 5 ? 2 : 1);
    }
    hintT -= dt;
    if (hintT <= 0) {
      hintT = 0.2;
      const pier = pierNear(m), spot = spotNear(m);
      $h("nv-wave").textContent = `⚓ Portus harbour · Fish ${hold.fish} · Cargo ${hold.item ? `${hold.qty} ${hold.item}` : "none"} (hold: ${capacity(m)})`;
      $h("nv-enemies").textContent = cast.phase === "bite" ? "A BITE! Press F!" : cast.phase === "wait" ? "Waiting for a bite..." : pier ? `F: trade at ${pier.name}` : spot ? "F: cast your line" : pirates ? `Pirates: ${pirates}` : "Sail onto the ripples to fish";
    }
  }

  return { build, at, board, action, A, GATE, get sailing() { return sailing; } };
})();
