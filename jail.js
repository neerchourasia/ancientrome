"use strict";
// The jails. Rome has the Carcer (the Mamertine Prison, at the foot of the Capitoline hill by the Forum) and Old Delhi has the
// Kotwali (the police station and lock-up on Chandni Chowk). If you are caught stealing (a robbery that ends with you caught, or
// the guards catching you while you are badly wanted) you are locked in a cell for a while: the door is barred, you wait out the
// sentence (the clock is on the screen), or you can bribe the guard to let you out early. Depends on game.js, guards.js and robbery.js.

const Jail = (() => {
  const T = THREE;
  const BOXG = new T.BoxGeometry(1, 1, 1), CYLG = new T.CylinderGeometry(1, 1, 1, 10);
  const lam = (c) => new T.MeshLambertMaterial({ color: c });
  const SENTENCE = 60, BRIBE = 150, FINE = 50;
  const sites = {};                       // city -> { x, z, gate: { mesh, blocker }, cell: { x, z } }
  let sentence = null;                    // { left, total, city }
  const $j = (id) => document.getElementById(id);

  function box(g, x, y0, z, w, h, d, mat, solid) {
    const m = new T.Mesh(BOXG, mat); m.scale.set(w, h, d); m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m);
    if (solid) addBlockerBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y0, y0 + h);
    return m;
  }

  // A stone lock-up, 16 m by 12 m: a cell inside with a barred door on the south side, a sign over it, benches and straw.
  function build(parent, city, x, z, name, sub, stoneColor) {
    const g = new T.Group(); parent.add(g);
    const stone = lam(stoneColor), dark = lam(0x2a241d), iron = lam(0x3a3d42);
    const W = 16, D = 12, H = 5, t = 1.5;
    box(g, x, 0, z - D / 2 + t / 2, W, H, t, stone, true);                         // back wall
    for (const sx of [-1, 1]) box(g, x + sx * (W / 2 - t / 2), 0, z, t, H, D, stone, true);   // side walls
    const dw = 2.8, seg = (W - dw) / 2;                                            // the front wall with the doorway
    for (const sx of [-1, 1]) box(g, x + sx * (dw / 2 + seg / 2), 0, z + D / 2 - t / 2, seg, H, t, stone, true);
    box(g, x, 3.4, z + D / 2 - t / 2, dw, H - 3.4, t, stone, false);
    box(g, x, H, z, W + 0.8, 0.6, D + 0.8, dark, false);                           // the flat roof
    // the barred gate in the doorway (closed while you serve your time)
    const gate = new T.Group(); gate.position.set(x, 0, z + D / 2 - t / 2); g.add(gate);
    for (let i = -4; i <= 4; i++) { const bar = new T.Mesh(CYLG, iron); bar.scale.set(0.07, 3.4, 0.07); bar.position.set(i * 0.31, 1.7, 0); gate.add(bar); }
    const rail = new T.Mesh(BOXG, iron); rail.scale.set(2.8, 0.1, 0.12); rail.position.set(0, 2.6, 0); gate.add(rail);
    const gb = addBlockerBox(x - dw / 2, x + dw / 2, z + D / 2 - t / 2 - 0.4, z + D / 2 - t / 2 + 0.4, 0, 3.4, { off: true });
    // inside: a dim torch, a bench, straw on the floor and a chain on the back wall
    box(g, x - 3.6, 0, z - 1.5, 0.8, 0.5, 4.2, lam(0x6a4c2a), false); box(g, x + 3.4, 0.02, z - 1.6, 2.4, 0.12, 2.6, lam(0xb89a5a), false);
    box(g, x, 1.6, z - D / 2 + t + 0.1, 0.12, 1.4, 0.06, iron, false);
    const flame = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), new T.MeshBasicMaterial({ color: 0xffb347 })); flame.position.set(x + 4.2, 2.8, z - D / 2 + t + 0.3); g.add(flame);
    const lamp = new T.PointLight(0xffa550, 0.9, 16, 1.6); lamp.position.set(x + 4.2, 2.8, z - 3.5); g.add(lamp);
    // the sign over the door
    const c = document.createElement("canvas"); c.width = 320; c.height = 90; const k = c.getContext("2d");
    k.fillStyle = "#2a1f16"; k.fillRect(0, 0, 320, 90); k.strokeStyle = "#f2d98a"; k.lineWidth = 4; k.strokeRect(4, 4, 312, 82); k.fillStyle = "#f2d98a"; k.textAlign = "center"; k.textBaseline = "middle"; k.font = "bold 36px sans-serif"; k.fillText(name, 160, 32); k.font = "bold 19px sans-serif"; k.fillText(sub, 160, 63);
    const sign = new T.Mesh(new T.PlaneGeometry(5.4, 1.5), new T.MeshLambertMaterial({ map: new T.CanvasTexture(c), side: T.DoubleSide, emissive: 0x201808 })); sign.position.set(x, 4.4, z + D / 2 + 0.05); g.add(sign);
    if (typeof MAP_SHAPES !== "undefined") MAP_SHAPES.push({ k: "r", x0: x - W / 2, x1: x + W / 2, z0: z - D / 2, z1: z + D / 2, c: "#6a6a70" });
    gate.visible = false;
    sites[city] = { x, z, gate, gb, cell: { x, z: z - 1 }, door: { x, z: z + D / 2 + 3 }, group: g };
    return g;
  }

  // a clear spot near (ox, oz) for a building of this size
  function clearNear(ox, oz, w, d) {
    for (let r = 0; r <= 60; r += 4) for (let k = 0; k < (r ? 12 : 1); k++) {
      const a = (k / 12) * 6.283, x = ox + Math.cos(a) * r, z = oz + Math.sin(a) * r; let ok = true;
      for (let ix = -w / 2 - 3; ix <= w / 2 + 3 && ok; ix += 3) for (let iz = -d / 2 - 3; iz <= d / 2 + 6 && ok; iz += 3) if (blockedAt(x + ix, z + iz, 0)) ok = false;
      if (ok) return [x, z];
    }
    return [ox, oz];
  }
  function buildRome(scene) { const [x, z] = clearNear(-112, -30, 16, 12); build(scene, "rome", x, z, "CARCER", "the Mamertine Prison", 0x8a8d92); return { x, z }; }
  function buildDelhi(parent) { const X = typeof DELHI_X !== "undefined" ? DELHI_X : 6000; const [x, z] = clearNear(X - 28, -62, 16, 12); build(parent, "delhi", x, z, "KOTWALI", "the lock-up", 0xa8552f); return { x, z }; }

  // ---------------------------------------------------------------- being locked up

  function arrest(why) {
    const c = typeof city !== "undefined" ? city : "rome", s = sites[c];
    if (!s || sentence) return false;
    if (mode === "drive") Car.exit(true);
    Vitals.stopRest(); Nav.clear();
    const fine = Math.min(FINE, Vitals.coins); Vitals.coins -= fine;
    sentence = { left: SENTENCE, total: SENTENCE, city: c };
    $j("sleep").classList.add("on");
    toast(`You are locked in the ${c === "delhi" ? "Kotwali" : "Carcer"} for ${why || "stealing"}. Fine: ${fine} denarii. Wait out ${SENTENCE} seconds, or bribe the guard.`);
    Narrator.say(`You are thrown in jail for ${why || "stealing"}. You must serve a sentence of ${SENTENCE} seconds, or bribe the guard.`, { interrupt: true });
    setTimeout(() => { placeAt(s.cell.x, s.cell.z, Math.PI); $j("sleep").classList.remove("on"); s.gb.off = false; s.gate.visible = true; render(); }, 1500);
    return true;
  }

  function release(bribed) {
    if (!sentence) return;
    const s = sites[sentence.city]; sentence = null;
    if (s) { s.gb.off = true; s.gate.visible = false; }
    toast(bribed ? "The guard takes your money and unlocks the door." : "Your sentence is over. The door is unlocked: you are free to go. Keep your hands to yourself!");
    Narrator.say(bribed ? "The guard unlocks the door." : "You are released.", { interrupt: true });
    render();
  }

  function render() {
    const el = $j("jail-hud");
    if (!sentence) { el.classList.remove("show"); return; }
    el.classList.add("show");
    $j("jail-time").textContent = `🔒 In jail: ${Math.ceil(sentence.left)} s left`;
    $j("jail-bribe").disabled = Vitals.coins < BRIBE;
    $j("jail-bribe").textContent = `Bribe the guard (${BRIBE} denarii)`;
  }

  function update(dt) {
    for (const k of Object.keys(sites)) sites[k].gate.visible = sites[k].gb.off === false;
    if (!sentence || typeof started === "undefined" || !started) return;
    sentence.left -= dt;
    if (sentence.left <= 0) { release(false); return; }
    hudT -= dt; if (hudT <= 0) { hudT = 0.4; render(); }
  }
  let hudT = 0;

  function bind() { $j("jail-bribe").addEventListener("click", () => { if (sentence && Vitals.coins >= BRIBE) { Vitals.coins -= BRIBE; release(true); } }); }

  return { buildRome, buildDelhi, arrest, release, update, bind, sites, get active() { return !!sentence; } };
})();
