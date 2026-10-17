"use strict";
// Naval battle: the Colosseum arena floods and you command a galley armed with cannons against enemy ships.

const Naval = (() => {
  const CX = ARENA.cx, CZ = ARENA.cz, RX = 29, RZ = 23.5; // sailable area (ellipse half-axes)
  const WAVES = [
    [{ hp: 45, scale: 0.8, max: 5.2, sail: 0xb3262b }, { hp: 45, scale: 0.8, max: 5.4, sail: 0x6b3fa0 }],
    [{ hp: 45, scale: 0.8, max: 5.6, sail: 0x6b3fa0 }, { hp: 45, scale: 0.8, max: 5.4, sail: 0x2f6b8f }, { hp: 85, scale: 1.0, max: 4.6, sail: 0x1f1f1f }],
  ];
  const GRAVITY = 14;
  const NAVAL_PURSE = 120; // denarii for winning the naval battle

  let lastDesign = null;
  let scene, active = false, phase = "idle", phaseT = 0, wave = 0, flood = 0, floodTarget = 0, clock = 0, msgTimer, camYaw = 0;
  let water, rippleTex, me = null, foes = [], balls = [], fx = [], queue = [];
  let online = null; // a live battle against real people (free-for-all): { ships, balls, sendT, n, humans, over }
  const el = (id) => document.getElementById(id);
  const TEX = {};

  const level = () => -0.5 + flood * 1.4;

  // ---------- setup ----------

  function radial(inner, outer) {
    return canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  function init(sc) {
    scene = sc;
    TEX.fire = radial("rgba(255,240,180,1)", "rgba(255,110,20,0)");
    TEX.smoke = radial("rgba(95,95,95,.9)", "rgba(95,95,95,0)");
    TEX.splash = radial("rgba(255,255,255,.95)", "rgba(200,225,255,0)");
    rippleTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) {
        g.fillStyle = `rgba(150,190,220,${0.15 + Math.random() * 0.3})`;
        g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 1 + Math.random() * 2.5, Math.random() * 3, 0, 6.3); g.fill();
      }
    }, 5, 4);
    water = new THREE.Mesh(new THREE.CircleGeometry(28, 56), new THREE.MeshPhongMaterial({ color: 0x3a86b0, map: rippleTex, transparent: true, opacity: 0.86, shininess: 90, specular: 0xaaccee }));
    water.rotation.x = -Math.PI / 2;
    water.scale.set(94 / 78, 1, 1);
    water.position.set(CX, -0.5, CZ);
    water.visible = false;
    scene.add(water);
  }

  // A galley with a ram at the bow, masts and sails, and cannons where the design puts them (the default has three a side).
  // def.ports / def.stars say which of the seven positions along each side hold a cannon (bow first); def.masts is [z, height] pairs.
  const SLOT_Z = [3.6, 2.4, 1.2, 0, -1.2, -2.4, -3.6];
  // A pointed bow: a flat triangle of the hull's width, `len` long and `h` high, base at z = 0 and tip at z = len
  function wedge(halfW, len, h) {
    const sh = new THREE.Shape(); sh.moveTo(-halfW, 0); sh.lineTo(halfW, 0); sh.lineTo(0, len); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    g.rotateX(Math.PI / 2);                                   // lay it flat: the shape's y points along +z, and the thickness goes down...
    g.translate(0, h, 0);                                     // ...so lift it to sit on y = 0 and rise to y = h
    return g;
  }

  function makeGalley(def) {
    const g = new THREE.Group();
    const sh = def.shape || "galley", K = def.lenK || 1, hw = def.hw || 1.5;
    const hullC = def.hull || 0x7a5230;
    const wood = lambert(hullC), dark = lambert(0x2a1f16), bronze = lambert(0x9a6a2c), iron = lambert(0x2e2e30), sailM = lambert(0xd9cfb8), band = lambert(def.sail), skin = lambert(0xd8a77a);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const L = 9 * K;                                                // the hull's length
    let hull;
    if (sh === "galley") {
      hull = part(new THREE.BoxGeometry(3, 1.1, 9), wood, 0, 0.4, 0);
      part(new THREE.BoxGeometry(3.3, 0.25, 8.6), dark, 0, 1.0, 0);
      part(wedge(1.5, 2.8, 1.1), wood, 0, -0.15, 4.5);                                          // the pointed bow
      const ram = part(new THREE.ConeGeometry(0.4, 1.7, 8), bronze, 0, 0.1, 7.5); ram.rotation.x = Math.PI / 2;
      part(new THREE.BoxGeometry(2.4, def.castle ? 3.4 : 2.4, 0.5), wood, 0, def.castle ? 2.2 : 1.7, -4.6);
      if (def.castle) part(new THREE.BoxGeometry(2.8, 0.3, 2.2), dark, 0, 3.9, -4.0);
    } else if (sh === "kayak" || sh === "canoe") {
      const w = hw * 2;
      hull = part(new THREE.BoxGeometry(w, sh === "kayak" ? 0.45 : 0.6, L), wood, 0, 0.3, 0);
      part(wedge(w / 2, 1.8, sh === "kayak" ? 0.45 : 0.6), wood, 0, 0.075, L / 2);                // the pointed bow and a flat stern
      part(new THREE.CylinderGeometry(0.2, 0.26, 0.9, 8), lambert(0x3a5a8a), 0, 0.95, -0.4);       // the paddler
      part(new THREE.SphereGeometry(0.2, 8, 6), skin, 0, 1.55, -0.4);
      const pad = part(new THREE.CylinderGeometry(0.04, 0.04, sh === "kayak" ? 2.6 : 1.8, 6), dark, 0, 1.0, -0.4); pad.rotation.z = sh === "kayak" ? Math.PI / 2 : 0.7;
      part(new THREE.BoxGeometry(w * 0.9, 0.08, 0.5), band, 0, sh === "kayak" ? 0.55 : 0.62, L / 4);   // a stripe in the boat's colour
    } else if (sh === "fishing") {
      hull = part(new THREE.BoxGeometry(hw * 2, 1.0, L), wood, 0, 0.35, 0);
      part(new THREE.BoxGeometry(hw * 2 + 0.2, 0.2, L - 0.4), dark, 0, 0.92, 0);
      part(wedge(hw, 2.0, 1.0), wood, 0, -0.15, L / 2);
      part(new THREE.BoxGeometry(hw * 1.4, 1.4, 1.8), lambert(0xd9cfb8), 0, 1.6, -L / 4);             // the wheelhouse
      part(new THREE.BoxGeometry(hw * 1.5, 0.15, 2.0), band, 0, 2.35, -L / 4);
      part(new THREE.BoxGeometry(0.9, 0.4, 0.9), lambert(0x6a8a9a), -hw * 0.5, 1.2, L / 4);          // a crate of fish
      part(new THREE.BoxGeometry(1.4, 0.05, 1.0), lambert(0x8a7a5a), hw * 0.5, 1.05, L / 5);          // nets
    } else { // battleship
      hull = part(new THREE.BoxGeometry(hw * 2, 1.5, L), wood, 0, 0.5, 0);
      part(wedge(hw, 3.6, 1.5), wood, 0, -0.25, L / 2);
      part(new THREE.BoxGeometry(hw * 2 - 0.4, 0.3, L - 0.6), lambert(0x4a4f56), 0, 1.35, 0);
      part(new THREE.BoxGeometry(hw * 1.2, 1.6, 4.2), lambert(0x8a9098), 0, 2.2, -L / 6);             // the bridge
      part(new THREE.BoxGeometry(hw * 0.8, 0.9, 2.0), lambert(0xa0a6ae), 0, 3.5, -L / 6);
      for (const z of [-L / 3.2, -L / 8]) part(new THREE.CylinderGeometry(0.5, 0.65, 2.4, 10), lambert(0x2a2d32), 0, 3.4, z - 1);   // the funnels
      for (const z of [L / 3, L / 6 + 1]) { part(new THREE.CylinderGeometry(0.9, 1.0, 0.7, 12), lambert(0x4a4f56), 0, 1.7, z); const b = part(new THREE.CylinderGeometry(0.16, 0.2, 2.2, 8), iron, 0, 1.95, z + 1.1); b.rotation.x = Math.PI / 2; } // the big turrets
      for (const sx of [-1, 1]) part(new THREE.BoxGeometry(0.14, 0.45, L * 0.92), band, sx * (hw + 0.03), 0.95, 0);   // a stripe along each side in the ship's colour
      for (const z of [-L / 3.2, -L / 8]) part(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10), band, 0, 4.1, z - 1);        // a band round each funnel
      part(new THREE.BoxGeometry(hw * 1.25, 0.18, 4.4), band, 0, 3.0, -L / 6);                          // and a stripe round the bridge
      part(new THREE.BoxGeometry(0.12, 0.4, 0.12), lambert(def.sail), 0, 5.2, -L / 6);                // a flag in the ship's colour
      part(new THREE.BoxGeometry(0.8, 0.5, 0.05), band, 0.4, 5.4, -L / 6);
    }
    for (const [mz, mh] of def.masts || [[0.4, 6.5]]) {
      const k = mh / 6.5;
      part(new THREE.CylinderGeometry(0.13, 0.17, mh, 8), dark, 0, 1 + mh / 2, mz);
      const sw = Math.max(1.2, hw * 2 * 0.82 * Math.max(0.8, k));                                  // as wide as the picture shows: a little under the hull
      part(new THREE.BoxGeometry(sw, 2.8 * k, 0.08), band, 0, 1 + mh * 0.55, mz);                  // the sail, in the colour you chose
      part(new THREE.BoxGeometry(sw, 0.25 * k, 0.1), sailM, 0, 1 + mh * 0.83, mz + 0.03);          // a cream trim along the top
    }
    const cannons = [];
    const layout = def.ports ? [[1, def.ports, def.paims || []], [-1, def.stars, def.saims || []]] : [[1, [1, 0, 1, 0, 1, 0, 0], []], [-1, [1, 0, 1, 0, 1, 0, 0], []]];
    const sideX = hw + 0.1, cy = sh === "kayak" ? 0.7 : sh === "canoe" ? 0.85 : sh === "battleship" ? 1.7 : 1.3;
    for (const [side, slots, aims] of layout) slots.forEach((on, i) => {
      if (!on) return;
      const cz = SLOT_Z[i] * K, aim = Number.isInteger(aims[i]) ? aims[i] : 2, th = aim * Math.PI / 4;
      const c = part(new THREE.CylinderGeometry(sh === "battleship" ? 0.26 : 0.22, sh === "battleship" ? 0.34 : 0.3, sh === "kayak" ? 0.7 : 1.2, 10), iron, side * sideX, cy, cz);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(side * Math.sin(th), 0, Math.cos(th))); // the barrel points the way it is aimed
      cannons.push({ side, z: cz, aim });
    });
    g.traverse((c) => { c.frustumCulled = false; });
    g.scale.setScalar(def.scale);
    return { g, cannons, hull };
  }

  function makeShip(def, x, z, yaw, isPlayer) {
    const model = makeGalley(def);
    scene.add(model.g);
    const c0 = isPlayer ? 0.3 : 2.5;
    return { model, def, sc: def.scale, turnK: def.turn || 1, x, z, yaw, v: 0, hp: def.hp, max: def.hp, maxSpeed: def.max, player: isPlayer, cd: { 1: c0, "-1": c0 }, ram: 0, flash: 0, dead: false, sink: 0 };
  }

  // ---------- effects ----------

  function puff(kind, x, y, z, o = {}) {
    const mat = new THREE.SpriteMaterial({ map: TEX[kind], transparent: true, depthWrite: false, blending: kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.opacity ?? 1 });
    const s = new THREE.Sprite(mat);
    s.position.set(x, y, z);
    const size = o.size ?? 1.5;
    s.scale.set(size, size, 1);
    scene.add(s);
    fx.push({ s, life: o.life ?? 0.8, max: o.life ?? 0.8, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, grow: o.grow ?? 2, op: o.opacity ?? 1 });
  }

  function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); fx.splice(i, 1); continue; }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      const k = 1 - p.life / p.max;
      p.s.scale.x = p.s.scale.y += p.grow * dt;
      p.s.material.opacity = p.op * (1 - k);
    }
  }

  function splash(x, z) {
    Sfx.play("splash", { x, z, range: 120 });
    const y = level() + 0.1;
    puff("splash", x, y + 0.4, z, { size: 1.2, life: 0.7, vy: 2.5, grow: 4 });
    puff("splash", x, y, z, { size: 2.5, life: 0.9, grow: 5, opacity: 0.7 });
  }

  // ---------- combat ----------

  const forward = (s) => [Math.sin(s.yaw), Math.cos(s.yaw)];
  const sideNormal = (s, side) => (side > 0 ? [Math.cos(s.yaw), -Math.sin(s.yaw)] : [-Math.cos(s.yaw), Math.sin(s.yaw)]); // +1 = port (left)

  function fireSide(s, side) {
    if (s.dead || s.cd[side] > 0 || phase !== "battle") return false;
    s.cd[side] = s.player ? 1.6 + 0.2 * s.model.cannons.filter((c) => c.side === side).length : 4.5 + Math.random() * 2; // a bigger broadside reloads slower (three a side: 2.2 s)
    s.model.cannons.filter((c) => c.side === side).forEach((c, i) => queue.push({ t: i * 0.13 + Math.random() * 0.05, s, side, c }));
    return true;
  }

  function shoot(q) {
    const { s, side, c } = q;
    if (s.dead) return;
    const [fx_, fz_] = forward(s), [nx, nz] = sideNormal(s, side);
    const th = (c.aim === undefined ? 2 : c.aim) * Math.PI / 4, dx = fx_ * Math.cos(th) + nx * Math.sin(th), dz = fz_ * Math.cos(th) + nz * Math.sin(th); // the way this cannon is aimed
    const x = s.x + fx_ * c.z * s.sc + nx * 1.9 * s.sc + dx * 0.6, z = s.z + fz_ * c.z * s.sc + nz * 1.9 * s.sc + dz * 0.6, y = level() + 1.3 * s.sc;
    const spread = s.player ? 1.5 : 4.2;
    const wander = (Math.random() - 0.5) * spread, sp = 24 * (0.95 + Math.random() * 0.1);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lambert(0x1a1a1c));
    m.position.set(x, y, z);
    scene.add(m);
    balls.push({ mesh: m, x, y, z, vx: dx * sp - dz * wander + fx_ * s.v, vz: dz * sp + dx * wander + fz_ * s.v, vy: 5.5 + Math.random(), owner: s });
    puff("fire", x + dx * 0.8, y, z + dz * 0.8, { size: 1.6, life: 0.25, grow: 6 });
    Sfx.play("cannon", { x, z });
    for (let k = 0; k < 2; k++) puff("smoke", x + dx * 1.2, y + 0.2, z + dz * 1.2, { size: 1.2, life: 1.6, vx: dx * 1.5 + (Math.random() - 0.5), vy: 0.8, vz: dz * 1.5 + (Math.random() - 0.5), grow: 1.8, opacity: 0.7 });
  }

  function hitShip(t, dmg, x, y, z) {
    Sfx.play("crash", { x, z, range: 160 });
    t.hp -= dmg;
    t.flash = 0.18;
    for (let k = 0; k < 3; k++) puff("fire", x, y, z, { size: 1.4, life: 0.35, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, grow: 4 });
    puff("smoke", x, y, z, { size: 1.6, life: 1.6, vy: 1.5, grow: 2.5, opacity: 0.8 });
    if (t.player) el("flash").style.opacity = 0.5;
    if (t.hp <= 0 && !t.dead) {
      t.hp = 0; t.dead = true;
      for (let k = 0; k < 5; k++) puff("fire", t.x + (Math.random() - 0.5) * 4, level() + 1.5, t.z + (Math.random() - 0.5) * 4, { size: 2.4, life: 0.6, vy: 3, grow: 5 });
      if (t.player) { phase = "sinking"; phaseT = 3; msg("Your ship is sinking!", 2400); }
      else msg(foes.some((f) => !f.dead) ? "Enemy ship sunk!" : "Enemy fleet destroyed!", 1600);
    }
  }

  function updateBalls(dt) {
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
      let done = false;
      for (const t of [me, ...foes]) {
        if (!t || t === b.owner || t.dead) continue;
        const dx = b.x - t.x, dz = b.z - t.z, sn = Math.sin(t.yaw), cs = Math.cos(t.yaw);
        const along = dx * sn + dz * cs, lateral = dx * cs - dz * sn;
        if (Math.abs(lateral) < 1.9 * t.sc && Math.abs(along) < 5 * t.sc && b.y < level() + 3 * t.sc && b.y > level() - 0.3) {
          hitShip(t, t.player ? 6 : 15, b.x, b.y, b.z);
          done = true; break;
        }
      }
      if (!done && b.y <= level() + 0.05) { splash(b.x, b.z); done = true; }
      if (done) { scene.remove(b.mesh); b.mesh.material.dispose(); b.mesh.geometry.dispose(); balls.splice(i, 1); }
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      queue[i].t -= dt;
      if (queue[i].t <= 0) { shoot(queue[i]); queue.splice(i, 1); }
    }
  }

  // ---------- ships ----------

  function stepShip(s, dt, throttle, turn) {
    const target = throttle > 0 ? s.maxSpeed * throttle : throttle < 0 ? -2.2 : 0;
    s.v += Math.max(-5 * dt, Math.min(3.2 * dt, target - s.v));
    s.yaw += turn * (s.turnK || 1) * (0.35 + Math.min(1, Math.abs(s.v) / s.maxSpeed) * 0.65) * dt * (s.v < -0.1 ? -1 : 1);
    s.x += Math.sin(s.yaw) * s.v * dt; s.z += Math.cos(s.yaw) * s.v * dt;
    const e = ((s.x - CX) / RX) ** 2 + ((s.z - CZ) / RZ) ** 2;
    if (e > 1) { const k = 1 / Math.sqrt(e); s.x = CX + (s.x - CX) * k; s.z = CZ + (s.z - CZ) * k; s.v *= 0.7; }
    s.cd[1] = Math.max(0, s.cd[1] - dt); s.cd[-1] = Math.max(0, s.cd[-1] - dt);
    s.ram = Math.max(0, s.ram - dt); s.flash -= dt;
  }

  function aiShip(e, dt) {
    const dx = me.x - e.x, dz = me.z - e.z, dist = Math.hypot(dx, dz) || 1, bearing = Math.atan2(dx, dz);
    let desired;
    if (dist > 17) desired = bearing;
    else if (dist < 8) desired = bearing + Math.PI;
    else {
      const a1 = bearing + Math.PI / 2, a2 = bearing - Math.PI / 2;
      desired = Math.abs(angDiff(e.yaw, a1)) < Math.abs(angDiff(e.yaw, a2)) ? a1 : a2;
    }
    const turn = Math.max(-1, Math.min(1, angDiff(e.yaw, desired) * 2));
    stepShip(e, dt, dist > 17 ? 1 : dist < 8 ? 0.8 : 0.45, turn);
    if (phase === "battle" && !me.dead && dist < 22) {
      const [fx_, fz_] = forward(e), fwdDot = (dx * fx_ + dz * fz_) / dist;
      if (Math.abs(fwdDot) < 0.5) {
        const [lx, lz] = sideNormal(e, 1);
        fireSide(e, dx * lx + dz * lz > 0 ? 1 : -1);
      }
    }
  }

  // Ships are three overlapping circles along their length; push apart and ram.
  function collide(a, b) {
    const pts = (s) => [-2.6, 0, 2.6].map((z) => ({ x: s.x + Math.sin(s.yaw) * z * s.sc, z: s.z + Math.cos(s.yaw) * z * s.sc }));
    const r = 1.9 * Math.max(a.sc, b.sc) * 0.9;
    for (const p of pts(a)) for (const q of pts(b)) {
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < r * 2 && d > 0.001) {
        const push = (r * 2 - d) * 0.5;
        a.x -= (dx / d) * push * 0.5; a.z -= (dz / d) * push * 0.5;
        b.x += (dx / d) * push * 0.5; b.z += (dz / d) * push * 0.5;
        for (const [rammer, target] of [[a, b], [b, a]]) {
          const sgn = rammer === a ? 1 : -1, [fx_, fz_] = forward(rammer);
          if (rammer.v > 3.5 && rammer.ram <= 0 && sgn * (dx * fx_ + dz * fz_) > 0) {
            rammer.ram = 1.2; rammer.v *= 0.4;
            hitShip(target, 12, (a.x + b.x) / 2, level() + 0.8, (a.z + b.z) / 2);
            msg(rammer.player ? "Ram!" : "You have been rammed!", 900);
          }
        }
      }
    }
  }

  // ---------- flow ----------

  function msg(text, ms = 1600) {
    const m = el("center-msg");
    m.textContent = text;
    m.classList.add("show");
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => m.classList.remove("show"), ms);
  }

  function start(design) {
    if (active) return;
    if (!Vitals.canFight()) {
      toast(`You are too wounded to command a ship (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`);
      return;
    }
    active = true; mode = "naval"; phase = "flooding"; phaseT = 4.5; wave = 0; flood = 0; floodTarget = 1;
    fx = []; balls = []; queue = [];
    me = makeShip(design || (typeof Shipyard !== "undefined" ? Shipyard.selectedDef() : { hp: 100, scale: 0.8, max: 6.6, sail: 0x2f8f4a }), CX - 18, CZ, Math.PI / 2, true);
    if (design) lastDesign = design;
    me.model.g.visible = false;
    camYaw = me.yaw;
    el("naval-hud").classList.add("show");
    Crowd.setCheer(true);
    closePanels();
    msg("Naumachia! The arena floods...", 3200);
    Sfx.play("horn");
  }

  function spawnWave() {
    for (const f of foes) scene.remove(f.model.g);
    foes = WAVES[wave].map((def, i, arr) => makeShip(def, CX + 18, CZ + (i - (arr.length - 1) / 2) * 11, -Math.PI / 2, false));
    msg(`Wave ${wave + 1} of ${WAVES.length}: ${foes.length} enemy ships!`, 2400);
    phase = "battle";
  }

  function clear() {
    for (const s of [me, ...foes]) if (s) scene.remove(s.model.g);
    for (const b of balls) scene.remove(b.mesh);
    for (const p of fx) scene.remove(p.s);
    me = null; foes = []; balls = []; fx = []; queue = [];
  }

  function stop(win, title, text, buttons) {
    if (!active) return;
    const live = online;                     // leaving a live battle tells the server (it sinks your ship)
    if (live) {
      online = null;
      if (!live.over) Online.leaveGame();
      for (const b of live.balls.values()) { scene.remove(b.mesh); b.mesh.material.dispose(); b.mesh.geometry.dispose(); }
    }
    // Damage to your ship costs you: the crew (you) are hurt in proportion, and a lost battle costs money.
    const hullLost = me ? 100 * (1 - me.hp / me.max) : 0, defeat = !!title && !win;
    if (!live) Vitals.hp = defeat ? 0 : Math.max(5, Vitals.hp - hullLost * 0.35);
    if (live) { /* no fines or wounds against real people: only the prize (added by the caller) */ }
    else if (defeat) {
      deathPending = "You went down with your ship.";
      text += " You did not survive the sinking.";
    } else if (win) {
      Vitals.coins += NAVAL_PURSE;
      text += ` Purse earned: ${NAVAL_PURSE} denarii. Health: ${Math.round(Vitals.hp)}/100.`;
    }
    active = false; mode = "walk"; phase = "idle";
    clear();
    flood = 0; floodTarget = 0; water.visible = false;
    el("naval-hud").classList.remove("show");
    el("flash").style.opacity = 0;
    Crowd.setCheer(false);
    placeAt(CX, CZ, -Math.PI / 2);
    camera.fov = 70; camera.updateProjectionMatrix();
    if (title) showResult(title, text, buttons || (defeat && !live ? [{ label: "Continue", fn: closePanels }] : [
      { label: win ? "Sail again" : "Try again", fn: () => { closePanels(); start(); } },
      { label: "Leave the arena", fn: closePanels },
    ]));
    else msg("You leave the naval battle.", 1400);
  }

  // Q = port, E = starboard, Space/click = the side facing the nearest enemy.
  function fire(k) {
    if (!active || !me || me.dead || phase !== "battle") return;
    if (online) return fireOnline(k);
    if (k === "KeyQ") fireSide(me, 1);
    else if (k === "KeyE") fireSide(me, -1);
    else {
      let best = null, bd = Infinity;
      for (const f of foes) { const d = Math.hypot(f.x - me.x, f.z - me.z); if (!f.dead && d < bd) { best = f; bd = d; } }
      if (!best) return;
      fireSide(me, bestSide(me, best));
    }
  }

  // the side whose cannons bear best on a target (counts the cannons aimed within 50 degrees of it; the facing side if none)
  function bestSide(s, target) {
    const dx = target.x - s.x, dz = target.z - s.z, d = Math.hypot(dx, dz) || 1, [lx, lz] = sideNormal(s, 1), facing = dx * lx + dz * lz > 0 ? 1 : -1, [fx_, fz_] = forward(s);
    let best = facing, bn = 0;
    for (const side of [1, -1]) {
      const [nx, nz] = sideNormal(s, side);
      let n = 0;
      for (const c of s.model.cannons) {
        if (c.side !== side) continue;
        const th = (c.aim === undefined ? 2 : c.aim) * Math.PI / 4, ax = fx_ * Math.cos(th) + nx * Math.sin(th), az = fz_ * Math.cos(th) + nz * Math.sin(th);
        if ((ax * dx + az * dz) / d > 0.64) n++;      // within about 50 degrees of the target
      }
      if (n > bn) { bn = n; best = side; }
    }
    return best;
  }


  // ---------- online: every ship for itself against real people (the server decides hits, rams and the winner) ----------

  const SAILS = [0x2f8f4a, 0xb3262b, 0x6b3fa0, 0x2f6b8f, 0xc7a21a];

  function nameTag(text) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 64;
    const g = c.getContext("2d");
    g.font = "bold 28px sans-serif"; g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, 8, 256, 48);
    g.fillStyle = "#fff"; g.fillText(text.replace(" (practice ship)", " (bot)").slice(0, 20), 128, 44);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    sp.scale.set(7, 1.75, 1); sp.position.set(0, 8.5, 0); sp.renderOrder = 10;
    return sp;
  }

  function startOnline(m) {
    if (active) return;
    active = true; mode = "naval"; phase = "flooding"; phaseT = m.countdown || 5; wave = 0; flood = 0; floodTarget = 1;
    fx = []; balls = []; queue = [];
    const ships = {};
    for (const p of m.players) {
      const sdef = p.ship && typeof Shipyard !== "undefined" ? Shipyard.def(p.ship) : { hp: 100, scale: 0.8, max: 6.6, sail: SAILS[p.i % SAILS.length] };
      const s = makeShip(sdef, CX + p.x, CZ + p.z, p.yaw, p.i === m.you);
      s.idx = p.i; s.name = p.name; s.bot = !!p.bot; s.tx = s.x; s.tz = s.z; s.tyaw = s.yaw;
      s.cd = { 1: 0, "-1": 0 };
      s.model.g.visible = false;
      if (p.i !== m.you) s.model.g.add(nameTag(p.name));
      ships[p.i] = s;
    }
    online = { you: m.you, ships, balls: new Map(), sendT: 0, n: m.players.length, humans: m.players.filter((p) => !p.bot).length, over: false, notice: false };
    me = ships[m.you];
    foes = m.players.filter((p) => p.i !== m.you).map((p) => ships[p.i]);
    camYaw = me.yaw;
    el("naval-hud").classList.add("show");
    Crowd.setCheer(true);
    closePanels();
    msg("Naumachia! The arena floods... every ship for itself!", 3600);
    Sfx.play("horn");
  }

  // The nearest ship that is still afloat (the camera follows it once yours has sunk).
  function focus() {
    if (!online || !me || !me.dead) return me;
    let best = me, bd = Infinity;
    for (const f of foes) { const d = Math.hypot(f.x - me.x, f.z - me.z); if (!f.dead && d < bd) { best = f; bd = d; } }
    return best;
  }

  function fireOnline(k) {
    let side = k === "KeyQ" ? 1 : k === "KeyE" ? -1 : 0;
    if (!side) {
      let best = null, bd = Infinity;
      for (const f of foes) { const d = Math.hypot(f.x - me.x, f.z - me.z); if (!f.dead && d < bd) { best = f; bd = d; } }
      if (!best) return;
      side = bestSide(me, best);
    }
    Online.navalSend({ t: "naval", fire: side });
  }

  function onlineState(m) {
    if (!online || online.over) return;
    if (m.l && phase === "flooding") { phase = "battle"; for (const s of Object.values(online.ships)) s.model.g.visible = true; msg("Fire!", 900); } // the server says when the battle starts
    for (const [i, x, z, yaw, v, hp, c1, c2, dead] of m.s) {
      const s = online.ships[i];
      if (!s) continue;
      if (s === me) { me.hp = hp; me.cd = { 1: c1, "-1": c2 }; }
      else { s.tx = CX + x; s.tz = CZ + z; s.tyaw = yaw; s.v = v; s.hp = hp; }
      if (dead && !s.dead) sinkShip(s);
    }
    const seen = new Set();
    for (const [id, x, y, z, vx, vy, vz] of m.b) {
      seen.add(id);
      let b = online.balls.get(id);
      if (!b) {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lambert(0x1a1a1c));
        scene.add(mesh);
        b = { mesh }; online.balls.set(id, b);
      }
      b.x = CX + x; b.y = y; b.z = CZ + z; b.vx = vx; b.vy = vy; b.vz = vz;
    }
    for (const [id, b] of online.balls) if (!seen.has(id)) { scene.remove(b.mesh); b.mesh.material.dispose(); b.mesh.geometry.dispose(); online.balls.delete(id); }
    for (const e of m.e || []) {
      if (e[0] === "f") {
        const x = CX + e[1], y = e[2], z = CZ + e[3], nx = e[4], nz = e[5];
        puff("fire", x + nx * 0.8, y, z + nz * 0.8, { size: 1.6, life: 0.25, grow: 6 });
        Sfx.play("cannon", { x, z });
        for (let k = 0; k < 2; k++) puff("smoke", x + nx * 1.2, y + 0.2, z + nz * 1.2, { size: 1.2, life: 1.6, vx: nx * 1.5 + (Math.random() - 0.5), vy: 0.8, vz: nz * 1.5 + (Math.random() - 0.5), grow: 1.8, opacity: 0.7 });
      } else if (e[0] === "h") {
        const t = online.ships[e[1]], x = CX + e[2], y = e[3], z = CZ + e[4];
        Sfx.play("crash", { x, z, range: 160 });
        if (t) t.flash = 0.18;
        for (let k = 0; k < 3; k++) puff("fire", x, y, z, { size: 1.4, life: 0.35, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, grow: 4 });
        puff("smoke", x, y, z, { size: 1.6, life: 1.6, vy: 1.5, grow: 2.5, opacity: 0.8 });
        if (t === me) el("flash").style.opacity = 0.5;
      } else if (e[0] === "w") splash(CX + e[1], CZ + e[2]);
      else if (e[0] === "r") {
        if (e[1] === online.you) { me.v *= 0.4; msg("Ram!", 900); }
        else if (e[2] === online.you) msg("You have been rammed!", 900);
      }
    }
  }

  function sinkShip(s) {
    s.dead = true; s.hp = 0;
    for (let k = 0; k < 5; k++) puff("fire", s.x + (Math.random() - 0.5) * 4, level() + 1.5, s.z + (Math.random() - 0.5) * 4, { size: 2.4, life: 0.6, vy: 3, grow: 5 });
    Sfx.play("crash", { x: s.x, z: s.z, range: 160 });
    if (s === me) msg("Your ship is sinking! Watch the rest of the battle.", 3200);
    else msg(`${s.name} is sunk!`, 1600);
  }

  function updateOnline(dt, keys) {
    clock += dt;
    flood += Math.max(-dt * 0.6, Math.min(dt * 0.3, floodTarget - flood));
    water.visible = flood > 0.02;
    water.position.y = level();
    rippleTex.offset.x = (clock * 0.02) % 1; rippleTex.offset.y = (clock * 0.013) % 1;
    phaseT -= dt;
    if (phase === "flooding") {
      if (flood > 0.7) for (const s of Object.values(online.ships)) s.model.g.visible = true;
    }
    if (phase === "battle" && !me.dead) {
      const gas = keys.has("KeyW") || keys.has("ArrowUp"), back = keys.has("KeyS") || keys.has("ArrowDown");
      const turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
      stepShip(me, dt, gas ? 1 : back ? -1 : 0, turn);
      for (const f of foes) if (!f.dead) shove(me, f);
      online.sendT -= dt;
      if (online.sendT <= 0) { online.sendT = 0.05; Online.navalSend({ t: "naval", x: +(me.x - CX).toFixed(2), z: +(me.z - CZ).toFixed(2), yaw: +me.yaw.toFixed(3) }); }
    } else {
      me.cd[1] = Math.max(0, me.cd[1] - dt); me.cd[-1] = Math.max(0, me.cd[-1] - dt);
    }
    me.flash -= dt;
    const k = Math.min(1, dt * 12);
    for (const f of foes) {
      f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k;
      f.yaw += angDiff(f.yaw, f.tyaw) * k;
      f.flash -= dt;
    }
    for (const b of online.balls.values()) {
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.mesh.position.set(b.x, b.y, b.z);
    }
    updateFx(dt);
    animateShips(dt);
    player.x = me.x; player.z = me.z; player.feet = 0;
    const afloat = Object.values(online.ships).filter((s) => !s.dead).length;
    el("nv-wave").textContent = "Free-for-all";
    el("nv-enemies").textContent = `Ships afloat: ${afloat} of ${online.n}`;
    el("nv-hull").style.width = `${me.hp}%`;
    el("nv-port").classList.toggle("ready", !me.dead && me.cd[1] <= 0);
    el("nv-star").classList.toggle("ready", !me.dead && me.cd[-1] <= 0);
    const fl = el("flash");
    fl.style.opacity = Math.max(0, parseFloat(fl.style.opacity || 0) - dt * 1.5);
  }

  // Your ship cannot sail through another one: you are pushed out (the server decides about rams).
  function shove(a, b) {
    const pts = (s) => [-2.6, 0, 2.6].map((z) => ({ x: s.x + Math.sin(s.yaw) * z * s.sc, z: s.z + Math.cos(s.yaw) * z * s.sc }));
    const r = 1.9 * 0.8 * 0.9;
    for (const p of pts(a)) for (const q of pts(b)) {
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d < r * 2 && d > 0.001) { const push = (r * 2 - d) * 0.5; a.x -= (dx / d) * push; a.z -= (dz / d) * push; }
    }
  }

  function onlineEnd(m) {
    if (!active || !online) return;
    online.over = true;
    const rank = m.order.findIndex((o) => o.i === online.you) + 1, ords = ["", "1st", "2nd", "3rd", "4th", "5th"];
    const alone = online.humans < 2, prize = rank === 1 ? (alone ? 40 : 80) : rank === 2 && online.n > 2 && !alone ? 30 : 0;
    Vitals.coins += prize;
    const table = m.order.map((o, k) => `${k + 1}. ${o.name}`).join("  ·  ");
    const why = { last: rank === 1 ? "Yours is the last ship afloat!" : "Another ship is the last one afloat.", time: "Time ran out: the ship with the most hull left wins.", empty: "Everyone else left." }[m.reason] || "";
    stop(rank === 1, rank === 1 ? "Victory in the naumachia!" : `You finished ${ords[rank] || "last"}`, `${why} ${table}.${prize ? ` Prize: +${prize} denarii.` : ""}`, [
      { label: "Sail again", fn: () => { closePanels(); Online.openLobby(); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
  }

  // ---------- per-frame ----------

  // Ship visuals: float, roll gently, sink when dead.
  function animateShips(dt) {
    for (const s of [me, ...foes]) {
      if (!s) continue;
      const g = s.model.g;
      let y = level() + 0.05 + Math.sin(clock * 1.4 + s.x * 0.1) * 0.08;
      if (s.dead) { s.sink += dt; y -= s.sink * 0.9; g.rotation.z = Math.min(0.5, s.sink * 0.25); }
      else g.rotation.z = Math.sin(clock * 1.1 + s.z * 0.1) * 0.03;
      g.position.set(s.x, y, s.z);
      g.rotation.y = s.yaw;
      s.model.hull.material.emissive.setHex(s.flash > 0 ? 0x661111 : 0);
      if (s.dead && s.sink > 4) g.visible = false;
    }
  }

  function update(dt, keys) {
    if (!active) return;
    if (online) return updateOnline(dt, keys);
    clock += dt;
    flood += Math.max(-dt * 0.6, Math.min(dt * 0.3, floodTarget - flood));
    water.visible = flood > 0.02;
    water.position.y = level();
    rippleTex.offset.x = (clock * 0.02) % 1; rippleTex.offset.y = (clock * 0.013) % 1;
    phaseT -= dt;

    if (phase === "flooding") {
      if (flood > 0.7) me.model.g.visible = true;
      if (phaseT <= 0) { spawnWave(); msg("Fire!", 900); }
    }

    if (phase === "battle" || phase === "sinking" || phase === "wavewon") {
      if (!me.dead) {
        const gas = keys.has("KeyW") || keys.has("ArrowUp"), back = keys.has("KeyS") || keys.has("ArrowDown");
        const turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
        stepShip(me, dt, gas ? 1 : back ? -1 : 0, turn);
      }
      for (const f of foes) if (!f.dead) aiShip(f, dt);
      const ships = [me, ...foes].filter((s) => !s.dead);
      for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) collide(ships[i], ships[j]);
    }

    updateBalls(dt);
    updateFx(dt);

    animateShips(dt);

    // wave and end conditions
    if (phase === "battle" && foes.every((f) => f.dead)) { phase = "wavewon"; phaseT = 3; }
    if (phase === "wavewon" && phaseT <= 0) {
      wave++;
      if (wave >= WAVES.length) {
        stop(true, "Victory in the naumachia!", "The enemy fleet is at the bottom of the arena and the crowd is on its feet. Staged sea battles (naumachiae) really were held for Rome's games, though with rams, boarding parties and catapults. Gunpowder cannon are a game invention, since they arrived a thousand years after the Western Empire fell.");
        return;
      }
      spawnWave();
    }
    if (phase === "sinking" && phaseT <= 0) {
      stop(false, "Your ship goes down", "Rams, boarding and catapults decided real naval battles. Keep your broadside facing the enemy and stay out of their line of fire. Will you try again?");
      return;
    }

    // HUD and player marker
    if (me) { player.x = me.x; player.z = me.z; player.feet = 0; }
    el("nv-wave").textContent = `Wave ${Math.min(wave + 1, WAVES.length)} / ${WAVES.length}`;
    el("nv-enemies").textContent = `Enemy ships: ${foes.filter((f) => !f.dead).length}`;
    el("nv-hull").style.width = `${me ? (me.hp / me.max) * 100 : 0}%`;
    el("nv-port").classList.toggle("ready", !!me && me.cd[1] <= 0);
    el("nv-star").classList.toggle("ready", !!me && me.cd[-1] <= 0);
    const f = el("flash");
    f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.5);
  }

  function camera_(cam, dt) {
    if (!active || !me) return;
    const f = focus();
    camYaw += angDiff(camYaw, f.yaw) * Math.min(1, dt * 3);
    const fx_ = Math.sin(camYaw), fz_ = Math.cos(camYaw), L = level();
    const k = Math.max(0.85, (f.sc || 0.8) / 0.8 * 0.85); // a bigger ship needs the camera further back
    cam.position.set(f.x - fx_ * 12 * k, L + 7.5 * k, f.z - fz_ * 12 * k);
    cam.lookAt(f.x + fx_ * 6 * k, L + 1.2, f.z + fz_ * 6 * k);
  }

  return { init, start, startOnline, onlineState, onlineEnd, isOnline: () => !!online, stop: () => stop(false), update, fire, camera: camera_, get active() { return active; }, debug: () => ({ phase, wave, me, foes, balls: balls.length, shots: balls.map((b) => ({ vx: b.vx, vz: b.vz })) }) };
})();
