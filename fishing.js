"use strict";
// Fishing and cooking. Each city has fishing spots by the water (a post with a sign and a red float): the harbour quay at Portus in Rome, the Yamuna bank in Delhi and the beach and
// the cenote in Cancún. Stand at one and press F to cast. Wait for the float to dip ("A bite!"), then press F again at once to reel it in: sardines, perch, eels, bass, and now and then a golden carp.
// 🎣 Fishing in the menu shows your catch. At a fishing spot you can cook fish over the camp fire (it heals you and fills your stomach) or sell them to the fishers' buyer (cooked fish
// sells for more). A spot is fished out after ten fish and fills up again in a few minutes. Your catch is kept in the browser and with your account.
// Depends on vitals.js and the globals of game.js (player, scene, city, mode, panelOpen, groundAt, toast).

const Fishing = (() => {
  const T = THREE;
  const KEY = "rome-fish", BITE = [6, 15], WINDOW = 1.8, STOCK = 10, REFILL = 180, REACH = 3.2, COOK_BOOST = 1.6;
  const FISH = [   // id, name, value in denarii, chance (of 100)
    ["sardine", "Sardine", 5, 40], ["perch", "Perch", 8, 26], ["eel", "Eel", 14, 16], ["bass", "Sea bass", 22, 11], ["carp", "Golden carp", 60, 5], ["boot", "Old boot", 1, 2],
  ];
  const info = (id) => FISH.find((f) => f[0] === id);
  const SPOTS = () => [
    { id: "portus", city: "rome", name: "the quay at Portus", x: 50, z: 196, wx: 0, wz: -1 },
    { id: "yamuna", city: "delhi", name: "the Yamuna bank", x: DELHI_X + 314, z: -30, wx: 1, wz: 0 },
    { id: "beach", city: "cancun", name: "the beach", x: CANCUN_X + 904, z: 40, wx: 1, wz: 0 },
    { id: "cenote", city: "cancun", name: "Cenote Azul", x: CANCUN_X - 330 + 18, z: 215, wx: -1, wz: 0 },
  ];
  let spots = null, inv = { raw: {}, cooked: {}, caught: 0 }, cast = { phase: "idle", t: 0, spot: null }, built = false;
  const clean = (raw) => {
    const o = { raw: {}, cooked: {}, caught: 0 };
    if (raw && typeof raw === "object") {
      for (const k of ["raw", "cooked"]) if (raw[k] && typeof raw[k] === "object") for (const [id, n] of Object.entries(raw[k])) if (info(id)) { const v = Math.max(0, Math.min(9999, Math.floor(Number(n)) || 0)); if (v) o[k][id] = v; }
      o.caught = Math.max(0, Math.floor(Number(raw.caught)) || 0);
    }
    return o;
  };
  try { inv = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(inv)); } catch (e) { /* ignore */ } };
  const $f = (id) => document.getElementById(id);
  const total = (k) => Object.values(inv[k]).reduce((a, b) => a + b, 0);

  function build() {
    if (built || typeof scene === "undefined") return;
    built = true; spots = SPOTS();
    const wood = new T.MeshLambertMaterial({ color: 0x6b4a2b }), fire = new T.MeshBasicMaterial({ color: 0xff7a1a });
    for (const s of spots) {
      s.stock = STOCK; s.refill = 0;
      const g = new T.Group(); g.position.set(s.x, groundAt(s.x, s.z), s.z); g.visible = false;
      const post = new T.Mesh(new T.BoxGeometry(0.2, 2.2, 0.2), wood); post.position.set(1.4, 1.1, 0); g.add(post);
      const c = document.createElement("canvas"); c.width = 256; c.height = 80; const x = c.getContext("2d");
      x.fillStyle = "#3a2a1a"; x.fillRect(0, 0, 256, 80); x.strokeStyle = "#f2d98a"; x.lineWidth = 4; x.strokeRect(4, 4, 248, 72); x.fillStyle = "#f2d98a"; x.textAlign = "center"; x.textBaseline = "middle";
      x.font = "bold 24px Georgia, serif"; x.fillText("FISHING SPOT", 128, 30); x.font = "16px Georgia, serif"; x.fillText("F: cast · camp fire here", 128, 58);
      const sign = new T.Mesh(new T.PlaneGeometry(2.2, 0.7), new T.MeshLambertMaterial({ map: new T.CanvasTexture(c), side: T.DoubleSide, emissive: 0x201808 })); sign.position.set(1.4, 2.4, 0); sign.rotation.y = Math.atan2(s.wx, s.wz) + Math.PI / 2; g.add(sign);
      for (let k = 0; k < 4; k++) { const st = new T.Mesh(new T.BoxGeometry(0.5, 0.15, 0.15), wood); st.position.set(-1.4 + Math.cos(k * 1.6) * 0.3, 0.1, Math.sin(k * 1.6) * 0.3); st.rotation.y = k * 1.6; g.add(st); }
      const flame = new T.Mesh(new T.ConeGeometry(0.28, 0.7, 6), fire); flame.position.set(-1.4, 0.45, 0); g.add(flame); s.flame = flame;
      const bob = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), new T.MeshLambertMaterial({ color: 0xd9341f, emissive: 0x400800 })); bob.position.set(s.wx * 5, 0.05, s.wz * 5); g.add(bob); s.bob = bob;
      scene.add(g); s.g = g;
    }
  }

  const nearSpot = () => {
    if (!built || typeof started === "undefined" || !started || mode !== "walk" || panelOpen) return null;
    for (const s of spots) if (s.city === city && Math.hypot(player.x - s.x, player.z - s.z) < REACH + 1.2) return s;
    return null;
  };
  const at = () => !!nearSpot();
  function promptText() {
    const s = nearSpot(); if (!s) return "";
    if (cast.phase === "wait") return "Waiting for a bite... (F: reel in early)";
    if (cast.phase === "bite") return "A BITE! Press F now!";
    if (s.stock <= 0) return "This spot is fished out for now. Come back in a few minutes.";
    return `F: cast your line (${s.stock} fish left here)`;
  }
  function act() {
    const s = nearSpot(); if (!s) return;
    if (cast.phase === "idle") {
      if (s.stock <= 0) { toast("The fish have all gone. Try another spot, or come back in a few minutes."); return; }
      cast = { phase: "wait", t: BITE[0] + Math.random() * (BITE[1] - BITE[0]), spot: s }; Sfx.play("splash");
      toast("You cast your line. Wait for the float to dip.");
    } else if (cast.phase === "wait") { cast.phase = "idle"; toast("Too early: you reel in an empty hook."); }
    else if (cast.phase === "bite") land(s);
  }
  function land(s) {
    cast = { phase: "idle", t: 0, spot: null };
    let r = Math.random() * 100, pick = FISH[0];
    for (const f of FISH) { r -= f[3]; if (r <= 0) { pick = f; break; } }
    inv.raw[pick[0]] = (inv.raw[pick[0]] || 0) + 1; inv.caught++; s.stock--; save();
    Sfx.play(pick[0] === "carp" ? "medal" : "coin");
    toast(pick[0] === "boot" ? "You hooked... an old boot." : pick[0] === "carp" ? "🐟 A GOLDEN CARP! What a catch!" : `You caught a ${pick[1].toLowerCase()}!`);
  }

  function update(dt) {
    if (!built) { if (typeof scene !== "undefined" && typeof started !== "undefined" && started) build(); return; }
    const t = performance.now() / 1000;
    for (const s of spots) {
      s.g.visible = s.city === city;
      if (s.stock < STOCK) { s.refill += dt; if (s.refill >= REFILL) { s.refill = 0; s.stock = STOCK; } }
      if (s.g.visible) {
        const live = cast.spot === s && cast.phase !== "idle";
        s.bob.position.y = 0.05 + Math.sin(t * 2 + s.x) * 0.04 - (cast.spot === s && cast.phase === "bite" ? 0.18 + Math.abs(Math.sin(t * 14)) * 0.1 : 0);
        s.flame.scale.set(1, 0.8 + Math.sin(t * 9 + s.z) * 0.25, 1);
        s.bob.visible = true; if (!live) s.bob.position.y = 0.05 + Math.sin(t * 2) * 0.04;
      }
    }
    if (cast.phase === "idle") return;
    if (mode !== "walk" || !cast.spot || Math.hypot(player.x - cast.spot.x, player.z - cast.spot.z) > REACH + 3) { cast = { phase: "idle", t: 0, spot: null }; toast("You wind in your line."); return; }
    cast.t -= dt;
    if (cast.t > 0) return;
    if (cast.phase === "wait") { cast.phase = "bite"; cast.t = WINDOW; Sfx.play("splash"); toast("🎣 A bite! Press F now!"); }
    else { cast = { phase: "idle", t: 0, spot: null }; toast("It got away."); }
  }

  // ---------------------------------------------------------------- the catch: cook, eat, sell
  const healOf = (id) => Math.round(8 + info(id)[2] * 0.6);
  function render() {
    const camp = !!nearSpot() || (built && spots.some((s) => s.city === city && Math.hypot(player.x - s.x, player.z - s.z) < 8));
    const ul = $f("fish-list"); ul.replaceChildren();
    $f("fish-head").textContent = `${total("raw")} raw · ${total("cooked")} cooked · ${inv.caught} caught in all${camp ? "" : " · cooking and selling are done at a fishing spot"}`;
    const ids = FISH.map((f) => f[0]).filter((id) => inv.raw[id] || inv.cooked[id]);
    if (!ids.length) { const li = document.createElement("li"); li.className = "dim"; li.textContent = "Nothing yet. Find a fishing spot (a post with a sign by the water) and press F."; ul.append(li); }
    for (const id of ids) {
      const f = info(id), li = document.createElement("li"), txt = document.createElement("span");
      txt.textContent = `${f[1]}: ${inv.raw[id] || 0} raw, ${inv.cooked[id] || 0} cooked`;
      li.append(txt);
      const btn = (label, fn, on) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.disabled = !on; b.addEventListener("click", fn); li.append(" ", b); };
      btn("Cook", () => cook(id), camp && inv.raw[id] > 0);
      btn(`Eat (+${healOf(id)})`, () => eat(id), inv.cooked[id] > 0);
      btn(`Sell raw ${f[2]}`, () => sell(id, "raw"), camp && inv.raw[id] > 0);
      btn(`Sell cooked ${Math.round(f[2] * COOK_BOOST)}`, () => sell(id, "cooked"), camp && inv.cooked[id] > 0);
      ul.append(li);
    }
  }
  function cook(id) { if (!(inv.raw[id] > 0)) return; inv.raw[id]--; inv.cooked[id] = (inv.cooked[id] || 0) + 1; Sfx.play("discover"); save(); render(); }
  function eat(id) { if (!(inv.cooked[id] > 0)) return; inv.cooked[id]--; const h = healOf(id); Vitals.eat(h, h * 2.5); Sfx.play("coin"); toast(`You eat the cooked ${info(id)[1].toLowerCase()}: +${h} health.`); save(); render(); }
  function sell(id, kind) {
    if (!(inv[kind][id] > 0)) return;
    inv[kind][id]--; const v = Math.round(info(id)[2] * (kind === "cooked" ? COOK_BOOST : 1)); Vitals.coins += v; Sfx.play("coin"); toast(`Sold for ${v} denarii.`); save(); render();
  }
  function open() { render(); openPanel("#fish"); }
  function bind() { const b = $f("btn-fish"); if (b) b.addEventListener("click", open); }

  return {
    bind, update, at, act, promptText, open,
    snapshot: () => JSON.parse(JSON.stringify(inv)),
    restore(raw) { inv = clean(raw); save(); },
    merge(raw) { const o = clean(raw); for (const k of ["raw", "cooked"]) for (const [id, n] of Object.entries(o[k])) inv[k][id] = Math.max(inv[k][id] || 0, n); inv.caught = Math.max(inv.caught, o.caught); save(); },
    get caught() { return inv.caught; }, _spots: () => spots, _cast: () => cast,
  };
})();
