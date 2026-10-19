"use strict";
// The menagerie: a barred cage in your house (Rome, and each size of house in Delhi) where the animals you own live.
// Every animal you have bought is in there, pacing about or perched, except the one you have brought along with you.
// Depends on pets.js (the animal models) and market.js (what you own) at run time.

const Cage = (() => {
  const T = THREE;
  const W = 3.2, D = 2.2, H = 1.9;           // outside size of the cage, in metres
  const BARG = new T.CylinderGeometry(0.03, 0.03, 1, 6), BOXG = new T.BoxGeometry(1, 1, 1);
  const iron = new T.MeshLambertMaterial({ color: 0x3a3d42 }), straw = new T.MeshLambertMaterial({ color: 0xc9a85a }), wood = new T.MeshLambertMaterial({ color: 0x6b4a2b });
  const cages = [];
  let ids = [], names = "", pollT = 0, t = 0;

  const label = (id) => (Market.itemName ? Market.itemName(id) : id);

  // Build a cage at (x, z) in `parent`. `face` is +1 if the sign should face +z, -1 for -z. `blockers` collects its collision so a house can switch it off.
  function build(parent, x, z, face, blockers) {
    const g = new T.Group(), y = groundAt(x, z);
    g.position.set(x, y, z); parent.add(g);
    const bar = (bx, by, bz, h, rx, rz) => { const m = new T.Mesh(BARG, iron); m.scale.y = h; m.position.set(bx, by, bz); m.rotation.x = rx || 0; m.rotation.z = rz || 0; g.add(m); return m; };
    for (let ix = -W / 2; ix <= W / 2 + 0.01; ix += 0.25) { bar(ix, H / 2, D / 2, H); bar(ix, H / 2, -D / 2, H); }
    for (let iz = -D / 2 + 0.25; iz < D / 2 - 0.01; iz += 0.25) { bar(W / 2, H / 2, iz, H); bar(-W / 2, H / 2, iz, H); }
    for (const by of [0.05, 0.9, H]) {                                    // rails round the sides
      bar(0, by, D / 2, W, 0, Math.PI / 2); bar(0, by, -D / 2, W, 0, Math.PI / 2);
      bar(W / 2, by, 0, D, Math.PI / 2, 0); bar(-W / 2, by, 0, D, Math.PI / 2, 0);
    }
    for (let ix = -W / 2 + 0.4; ix < W / 2; ix += 0.55) bar(ix, H, 0, D, Math.PI / 2, 0);   // the roof
    const floor = new T.Mesh(BOXG, straw); floor.scale.set(W - 0.1, 0.05, D - 0.1); floor.position.y = 0.03; floor.receiveShadow = true; g.add(floor);
    const perch = new T.Mesh(BOXG, wood); perch.scale.set(W - 0.4, 0.06, 0.06); perch.position.set(0, 1.1, -face * (D / 2 - 0.35)); g.add(perch);
    // a sign on the front, listing who lives inside
    const c = document.createElement("canvas"); c.width = 320; c.height = 80;
    const tex = new T.CanvasTexture(c);
    const sign = new T.Mesh(new T.PlaneGeometry(1.8, 0.45), new T.MeshLambertMaterial({ map: tex, emissive: 0x201808 }));
    sign.position.set(0, H + 0.35, face * (D / 2 + 0.03)); if (face < 0) sign.rotation.y = Math.PI; g.add(sign);
    const sb = new T.Mesh(BOXG, wood); sb.scale.set(1.9, 0.5, 0.05); sb.position.set(0, H + 0.35, face * (D / 2 - 0.0)); g.add(sb);
    sb.position.z = face * (D / 2 - 0.01);
    const b = addBlockerBox(x - W / 2, x + W / 2, z - D / 2, z + D / 2, y, y + H);
    if (blockers) blockers.push(b);
    const inst = { g, x, z, face, tex, canvas: c, tenants: new Map(), slotCount: 0 };
    cages.push(inst); drawSign(inst, []);
    return inst;
  }

  function drawSign(inst, list) {
    const k = inst.canvas.getContext("2d");
    k.fillStyle = "#2a1f16"; k.fillRect(0, 0, 320, 80); k.strokeStyle = "#f2d98a"; k.lineWidth = 3; k.strokeRect(3, 3, 314, 74);
    k.fillStyle = "#f2d98a"; k.textAlign = "center"; k.textBaseline = "middle"; k.font = "bold 26px sans-serif"; k.fillText("MENAGERIE", 160, 24);
    const text = list.length ? list.map(label).join(", ") : "empty: buy animals at the market";
    let px = 16; k.font = `${px}px sans-serif`;
    while (k.measureText(text).width > 292 && px > 8) { px--; k.font = `${px}px sans-serif`; }
    k.fillText(text, 160, 55);
    inst.tex.needsUpdate = true;
  }

  function dispose(o) { o.g.parent && o.g.parent.remove(o.g); o.g.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); }

  function sync(inst, list) {
    for (const [id, o] of inst.tenants) if (!list.includes(id)) { dispose(o); inst.tenants.delete(id); }
    let perches = 0;
    for (const o of inst.tenants.values()) if (o.fly) perches++;
    for (const id of list) {
      if (inst.tenants.has(id)) continue;
      const m = Pets.make(id); if (!m) continue;
      const fly = Pets.flies(id), sc = fly ? 0.9 : id === "peacock" ? 0.75 : 0.7;
      m.g.scale.setScalar(sc); inst.g.add(m.g);
      const o = { ...m, fly, id, tx: 0, tz: 0, wait: Math.random() * 2, yaw: Math.random() * 6, flap: 0 };
      o.x = (Math.random() - 0.5) * (W - 0.9); o.z = (Math.random() - 0.5) * (D - 0.9);
      if (fly) { o.x = -W / 2 + 0.5 + (perches++ % 5) * 0.6; o.z = -inst.face * (D / 2 - 0.35); o.y = 1.1 + 0.05; m.wings[0].rotation.z = 1.1; m.wings[1].rotation.z = -1.1; m.g.rotation.y = inst.face > 0 ? 0 : Math.PI; }
      m.g.position.set(o.x, o.y || 0.05, o.z);
      inst.tenants.set(id, o);
    }
    drawSign(inst, list);
  }

  const shown = (g) => { for (let o = g; o; o = o.parent) if (!o.visible) return false; return true; };

  function animate(inst, dt) {
    const hx = W / 2 - 0.45, hz = D / 2 - 0.45;
    for (const o of inst.tenants.values()) {
      if (o.fly) {                                                       // birds sit on the perch and flap now and then
        o.flap = Math.max(0, o.flap - dt);
        if (o.flap <= 0 && Math.random() < dt * 0.15) o.flap = 0.9;
        const f = o.flap > 0 ? Math.sin(t * 16) * 0.8 : 0, rest = o.flap > 0 ? 0.3 : 1.1;
        o.wings[0].rotation.z = rest + f; o.wings[1].rotation.z = -(rest + f);
        o.g.position.y = 1.15 + (o.flap > 0 ? Math.abs(Math.sin(t * 16)) * 0.08 : 0);
        continue;
      }
      o.wait -= dt;
      let moved = 0;
      if (o.wait <= 0) {
        const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz);
        if (d < 0.08) { o.wait = 1 + Math.random() * 3; o.tx = (Math.random() * 2 - 1) * hx; o.tz = (Math.random() * 2 - 1) * hz; }
        else { const step = Math.min(d, 0.55 * dt); o.x += (dx / d) * step; o.z += (dz / d) * step; moved = step; o.yaw = Math.atan2(-dx, -dz); }
      }
      o.g.position.set(o.x, 0.05, o.z); o.g.rotation.y = o.yaw;
      const sw = moved > 0 ? Math.sin(t * 7) * 0.7 : 0;
      o.legs.forEach((l, i) => { l.rotation.x = i === 0 || i === 3 ? sw : -sw; });
      o.tail.rotation.y = Math.sin(t * 6 + o.x) * (moved > 0 ? 0.25 : 0.55);
    }
  }

  function update(dt) {
    if (!cages.length || typeof started === "undefined" || !started) return;
    t += dt; pollT -= dt;
    if (pollT <= 0) {
      pollT = 1;
      const out = Market.pet, list = Market.pets.filter((id) => id !== out), key = list.join();
      if (key !== names) { names = key; ids = list; for (const c of cages) sync(c, ids); }
    }
    for (const c of cages) {
      if (Math.abs(player.x - c.x) > 40 || Math.abs(player.z - c.z) > 40 || !shown(c.g)) continue;
      animate(c, dt);
    }
  }

  // standing in front of the cage (on the side with the sign): press F to choose which animal comes along with you
  function at(x, z, feet = 0) {
    if (feet > 3) return null;
    for (const c of cages) {
      if (Math.abs(x - c.x) > 6 || Math.abs(z - c.z) > 6 || !shown(c.g)) continue;
      if (Math.hypot(x - c.x, z - (c.z + c.face * (D / 2 + 1.0))) < 1.7) return c;
    }
    return null;
  }
  function open() { if (!at(player.x, player.z, player.feet)) return false; Market.open("menagerie"); return true; }

  return { build, update, sync, at, open, get all() { return cages; } };
})();
