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

  let scene, active = false, phase = "idle", phaseT = 0, wave = 0, flood = 0, floodTarget = 0, clock = 0, msgTimer, camYaw = 0;
  let water, rippleTex, me = null, foes = [], balls = [], fx = [], queue = [];
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

  // A small galley with a ram at the bow (+z), a sail and three cannons per side.
  function makeGalley(def) {
    const g = new THREE.Group();
    const wood = lambert(0x7a5230), dark = lambert(0x2a1f16), bronze = lambert(0x9a6a2c), iron = lambert(0x2e2e30), sailM = lambert(0xd9cfb8), band = lambert(def.sail);
    const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
    const hull = part(new THREE.BoxGeometry(3, 1.1, 9), wood, 0, 0.4, 0);
    part(new THREE.BoxGeometry(3.3, 0.25, 8.6), dark, 0, 1.0, 0);
    part(new THREE.BoxGeometry(2.0, 1.1, 2.2), wood, 0, 0.45, 5.4);
    const ram = part(new THREE.ConeGeometry(0.4, 1.7, 8), bronze, 0, 0.1, 7.0); ram.rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(2.4, 2.4, 0.5), wood, 0, 1.7, -4.6);
    part(new THREE.CylinderGeometry(0.13, 0.17, 6.5, 8), dark, 0, 4.3, 0.4);
    part(new THREE.BoxGeometry(4.2, 2.8, 0.08), sailM, 0, 4.6, 0.4);
    part(new THREE.BoxGeometry(4.2, 0.7, 0.1), band, 0, 5.4, 0.43);
    const cannons = [];
    for (const side of [1, -1]) for (const cz of [-2.4, 0, 2.4]) {
      const c = part(new THREE.CylinderGeometry(0.22, 0.3, 1.2, 10), iron, side * 1.6, 1.3, cz);
      c.rotation.z = -side * Math.PI / 2;
      cannons.push({ side, z: cz });
    }
    g.traverse((c) => { c.frustumCulled = false; });
    g.scale.setScalar(def.scale);
    return { g, cannons, hull };
  }

  function makeShip(def, x, z, yaw, isPlayer) {
    const model = makeGalley(def);
    scene.add(model.g);
    const c0 = isPlayer ? 0.3 : 2.5;
    return { model, def, sc: def.scale, x, z, yaw, v: 0, hp: def.hp, max: def.hp, maxSpeed: def.max, player: isPlayer, cd: { 1: c0, "-1": c0 }, ram: 0, flash: 0, dead: false, sink: 0 };
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
    s.cd[side] = s.player ? 2.2 : 4.5 + Math.random() * 2;
    s.model.cannons.filter((c) => c.side === side).forEach((c, i) => queue.push({ t: i * 0.13 + Math.random() * 0.05, s, side, c }));
    return true;
  }

  function shoot(q) {
    const { s, side, c } = q;
    if (s.dead) return;
    const [fx_, fz_] = forward(s), [nx, nz] = sideNormal(s, side);
    const x = s.x + fx_ * c.z * s.sc + nx * 1.9 * s.sc, z = s.z + fz_ * c.z * s.sc + nz * 1.9 * s.sc, y = level() + 1.3 * s.sc;
    const spread = s.player ? 1.5 : 4.2;
    const along = (Math.random() - 0.5) * spread, sp = 24 * (0.95 + Math.random() * 0.1);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), lambert(0x1a1a1c));
    m.position.set(x, y, z);
    scene.add(m);
    balls.push({ mesh: m, x, y, z, vx: nx * sp + fx_ * (s.v + along), vz: nz * sp + fz_ * (s.v + along), vy: 5.5 + Math.random(), owner: s });
    puff("fire", x + nx * 0.8, y, z + nz * 0.8, { size: 1.6, life: 0.25, grow: 6 });
    Sfx.play("cannon", { x, z });
    for (let k = 0; k < 2; k++) puff("smoke", x + nx * 1.2, y + 0.2, z + nz * 1.2, { size: 1.2, life: 1.6, vx: nx * 1.5 + (Math.random() - 0.5), vy: 0.8, vz: nz * 1.5 + (Math.random() - 0.5), grow: 1.8, opacity: 0.7 });
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
    s.yaw += turn * 1.0 * (0.35 + Math.min(1, Math.abs(s.v) / s.maxSpeed) * 0.65) * dt * (s.v < -0.1 ? -1 : 1);
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

  function start() {
    if (active) return;
    if (!Vitals.canFight()) {
      toast(`You are too wounded to command a ship (health ${Math.round(Vitals.hp)}/100). Press Z to rest and heal.`);
      return;
    }
    active = true; mode = "naval"; phase = "flooding"; phaseT = 4.5; wave = 0; flood = 0; floodTarget = 1;
    fx = []; balls = []; queue = [];
    me = makeShip({ hp: 100, scale: 0.8, max: 6.6, sail: 0x2f8f4a }, CX - 18, CZ, Math.PI / 2, true);
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

  function stop(win, title, text) {
    if (!active) return;
    // Damage to your ship costs you: the crew (you) are hurt in proportion, and a lost battle costs money.
    const hullLost = me ? 100 - me.hp : 0, defeat = !!title && !win;
    Vitals.hp = defeat ? 15 : Math.max(5, Vitals.hp - hullLost * 0.35);
    if (defeat) {
      const fine = Math.min(40, Vitals.coins);
      Vitals.coins -= fine;
      text += ` You lose ${fine} denarii for the wrecked ship and are left badly wounded. Rest with Z before sailing again.`;
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
    if (title) showResult(title, text, [
      { label: win ? "Sail again" : "Try again", fn: () => { closePanels(); start(); } },
      { label: "Leave the arena", fn: closePanels },
    ]);
    else msg("You leave the naval battle.", 1400);
  }

  // Q = port, E = starboard, Space/click = the side facing the nearest enemy.
  function fire(k) {
    if (!active || !me || me.dead || phase !== "battle") return;
    if (k === "KeyQ") fireSide(me, 1);
    else if (k === "KeyE") fireSide(me, -1);
    else {
      let best = null, bd = Infinity;
      for (const f of foes) { const d = Math.hypot(f.x - me.x, f.z - me.z); if (!f.dead && d < bd) { best = f; bd = d; } }
      if (!best) return;
      const [lx, lz] = sideNormal(me, 1);
      fireSide(me, (best.x - me.x) * lx + (best.z - me.z) * lz > 0 ? 1 : -1);
    }
  }

  // ---------- per-frame ----------

  function update(dt, keys) {
    if (!active) return;
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

    // ship visuals: float, roll gently, sink when dead
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
    el("nv-hull").style.width = `${me ? me.hp : 0}%`;
    el("nv-port").classList.toggle("ready", !!me && me.cd[1] <= 0);
    el("nv-star").classList.toggle("ready", !!me && me.cd[-1] <= 0);
    const f = el("flash");
    f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.5);
  }

  function camera_(cam, dt) {
    if (!active || !me) return;
    camYaw += angDiff(camYaw, me.yaw) * Math.min(1, dt * 3);
    const fx_ = Math.sin(camYaw), fz_ = Math.cos(camYaw), L = level();
    cam.position.set(me.x - fx_ * 12, L + 7.5, me.z - fz_ * 12);
    cam.lookAt(me.x + fx_ * 6, L + 1.2, me.z + fz_ * 6);
  }

  return { init, start, stop: () => stop(false), update, fire, camera: camera_, get active() { return active; }, debug: () => ({ phase, wave, me, foes, balls: balls.length }) };
})();
