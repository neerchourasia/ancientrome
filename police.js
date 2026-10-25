"use strict";
// Police cars in the modern cities. Break the law (knock people over, run people down, rob a house) and your wanted level goes up (see guards.js):
// from two stars... no, from the first star the police send cars. They come from ahead and from behind, with flashing lights, as fast as you
// drive (a little faster), try to box you in, and ram you if you do not stop. If one stays beside you, or two are close while you are slow, you
// are pulled over and arrested, so you cannot just drive away. Only in the modern era (ancient cities have the city guards on foot).
// Depends on guards.js (the wanted level and the arrest), car.js (your car) and game.js (era, mode, player, BOUNDS).

const Police = (() => {
  const T = THREE;
  const cars = [];
  const trail = [];                                                                // where you have been lately: roads a car can really drive on
  let scene = null, spawnT = 2.5, closeT = 0, sirenT = 0, flash = 0, wasChasing = false;
  const BOXG = new T.BoxGeometry(1, 1, 1), CYLG = new T.CylinderGeometry(1, 1, 1, 12);
  const mat = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  const white = mat(0xf2f2f4), blue = mat(0x1f3f8a), dark = mat(0x1a1c20), glass = mat(0x6fa8c9, { emissive: 0x10283a }), tyre = mat(0x111111);

  function model() {
    const g = new T.Group();
    const part = (geo, m, x, y, z, sx, sy, sz) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    part(BOXG, white, 0, 0.75, 0, 1.9, 0.7, 4.4);                    // the body
    part(BOXG, blue, 0, 0.62, 0, 1.94, 0.22, 4.44);                    // a blue stripe along the sides
    part(BOXG, white, 0, 1.3, -0.1, 1.7, 0.55, 2.1);                    // the cabin
    part(BOXG, glass, 0, 1.32, -0.1, 1.74, 0.38, 2.14);
    part(BOXG, dark, 0, 0.45, 0, 1.96, 0.1, 4.2);                      // the bumpers and the underside
    for (const [sx, sz] of [[-1, -1.4], [1, -1.4], [-1, 1.5], [1, 1.5]]) { const w = part(CYLG, tyre, sx * 0.96, 0.36, sz, 0.36, 0.26, 0.36); w.rotation.z = Math.PI / 2; }
    part(BOXG, dark, 0, 1.64, -0.1, 1.5, 0.1, 0.5);                    // the light bar
    g.userData.red = part(BOXG, mat(0xff2020, { emissive: 0x330000 }), -0.35, 1.72, -0.1, 0.55, 0.14, 0.4);
    g.userData.blue = part(BOXG, mat(0x2060ff, { emissive: 0x000833 }), 0.35, 1.72, -0.1, 0.55, 0.14, 0.4);
    g.userData.glow = new T.PointLight(0xff3030, 0, 18, 2); g.userData.glow.position.set(0, 2.2, -0.1); g.add(g.userData.glow);
    return g;
  }

  const modern = () => typeof era !== "undefined" && era === "modern";
  const wanted = () => (typeof Guards !== "undefined" ? Guards.wanted : 0);
  const clearSpot = (x, z) => {
    if (x < BOUNDS.minX + 8 || x > BOUNDS.maxX - 8 || z < BOUNDS.minZ + 8 || z > BOUNDS.maxZ - 8) return false;
    const y = groundAt(x, z);
    for (const [dx, dz] of [[0, 0], [2.4, 0], [-2.4, 0], [0, 2.8], [0, -2.8]]) if (blockedAt(x + dx, z + dz, y) || Math.abs(groundAt(x + dx, z + dz) - y) > 0.6) return false;
    if (typeof Cancun !== "undefined" && city === "cancun" && Cancun.inWater(x, z)) return false;
    return true;
  };

  // a police car appears out of sight, ahead of you (to block the road) or behind (to catch up)
  function spawn(ahead) {
    const st = typeof Car !== "undefined" && Car.driving ? Car.state() : null;
    const yaw = st ? st.yaw : player.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const add = (x, z) => {
      const g = model(); g.position.set(x, groundAt(x, z), z); scene.add(g);
      cars.push({ g, x, z, yaw: Math.atan2(player.x - x, player.z - z) + Math.PI, v: 0, stuck: 0, rev: 0, ahead, turn: 1, flashOff: Math.random() });
      return true;
    };
    if (!ahead) {                                                              // behind you: on the road you came along
      const old = trail.filter((p) => { const d = Math.hypot(p.x - player.x, p.z - player.z); return d > 55 && d < 170; });
      for (let t = 0; t < 12 && old.length; t++) { const p = old[Math.floor(Math.random() * old.length)]; if (clearSpot(p.x, p.z)) return add(p.x, p.z); }
    }
    for (let t = 0; t < 260; t++) {                                            // ahead of you (or anywhere clear, if the road behind is no use)
      const d = 55 + Math.random() * 90, a = (Math.random() - 0.5) * 1.5, dir = ahead ? 1 : -1;
      const x = player.x + (fx * Math.cos(a) - fz * Math.sin(a)) * d * dir, z = player.z + (fx * Math.sin(a) + fz * Math.cos(a)) * d * dir;
      if (clearSpot(x, z)) return add(x, z);
    }
    const any = trail.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) > 30);                      // last resort: somewhere you have been
    if (any.length) { const p = any[Math.floor(Math.random() * any.length)]; return add(p.x, p.z); }
    return false;
  }

  function target(c, st, dt) {
    // where this car is heading: the front car aims in front of you, the others at where you will be in a moment
    const lead = st ? Math.min(1.6, 0.5 + st.v * 0.05) : 0.4;
    let tx = player.x - (st ? Math.sin(st.yaw) * st.v * lead : 0), tz = player.z - (st ? Math.cos(st.yaw) * st.v * lead : 0);
    if (c.ahead && st && Math.abs(st.v) > 6) { tx -= Math.sin(st.yaw) * 22; tz -= Math.cos(st.yaw) * 22; }                 // get in front and brake
    return [tx, tz];
  }

  function step(c, dt, st) {
    const [tx, tz] = target(c, st, dt), dx = tx - c.x, dz = tz - c.z, dist = Math.hypot(dx, dz) || 1;
    const playerV = st ? Math.abs(st.v) : 0, cap = Math.min(40, Math.max(19, playerV * 1.07 + 4 + wanted() / 25));                     // as fast as you, and a bit more
    let want = Math.atan2(-dx, -dz), dy = want - c.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), y = groundAt(c.x, c.z), look = 4 + Math.abs(c.v) * 0.45;
    const ahead = blockedAt(c.x + fx * look, c.z + fz * look, y), aheadL = blockedAt(c.x + (fx + fz * 0.7) * look, c.z + (fz - fx * 0.7) * look, y), aheadR = blockedAt(c.x + (fx - fz * 0.7) * look, c.z + (fz + fx * 0.7) * look, y);
    if (ahead || aheadL || aheadR) { dy = aheadL && !aheadR ? -1 : aheadR && !aheadL ? 1 : c.turn; if (ahead) c.turn = dy > 0 ? 1 : -1; }
    let tv = st && dist < 9 ? Math.max(0, playerV) : cap;                                                                          // alongside you: match your speed
    if (!st && dist < 8) tv = 0;                                                                                                    // you are on foot: stop beside you
    if (ahead) tv = Math.min(tv, 5);
    if (c.rev > 0) { c.rev -= dt; tv = -4; dy = -dy; }
    c.v += Math.max(-24 * dt, Math.min(13 * dt, tv - c.v));
    c.yaw += Math.max(-2.3, Math.min(2.3, dy * 2.2)) * dt * Math.min(1, Math.abs(c.v) / 3);
    const nx = c.x - Math.sin(c.yaw) * c.v * dt, nz = c.z - Math.cos(c.yaw) * c.v * dt;
    if (!blockedAt(nx, nz, y) && !blockedAt(nx - Math.sin(c.yaw) * 2.2 * Math.sign(c.v || 1), nz - Math.cos(c.yaw) * 2.2 * Math.sign(c.v || 1), y)) { c.x = nx; c.z = nz; c.stuck = Math.max(0, c.stuck - dt); }
    else { c.v *= 0.35; c.stuck += dt; if (c.stuck > 1.1) { c.rev = 0.9; c.stuck = 0; c.turn = -c.turn; } }
    c.g.position.set(c.x, groundAt(c.x, c.z), c.z); c.g.rotation.y = c.yaw;
  }

  function init(sc) { scene = sc; }

  function update(dt) {
    if (!scene || typeof started === "undefined" || !started) return;
    const on = modern() && (mode === "drive" || mode === "walk") && wanted() >= 35;
    flash += dt;
    if (modern() && (mode === "drive" || mode === "walk")) { const l = trail[trail.length - 1]; if (!l || Math.hypot(l.x - player.x, l.z - player.z) > 5) { trail.push({ x: player.x, z: player.z }); if (trail.length > 90) trail.shift(); } }
    if (!on) {
      if (cars.length && (!modern() || wanted() < 12)) { for (const c of cars) scene.remove(c.g); if (cars.length && wasChasing) toast("The police cars lose you."); cars.length = 0; }
      wasChasing = cars.length > 0; closeT = 0;
      for (const c of cars) c.g.visible = false;
      return;
    }
    const st = typeof Car !== "undefined" && Car.driving ? Car.state() : null;
    const want = wanted() >= 75 ? 4 : wanted() >= 50 ? 3 : 2;
    spawnT -= dt;
    if (cars.length < want && spawnT <= 0) { spawnT = 3.5; if (spawn(cars.length % 2 === 0)) { if (!wasChasing) toast("🚓 Police cars! Sirens are coming for you."); Sfx.play("horn"); } }
    wasChasing = true;
    let near = 0, nearest = 1e9;
    for (const c of cars) {
      c.g.visible = true;
      step(c, dt, st);
      const d = Math.hypot(c.x - player.x, c.z - player.z);
      nearest = Math.min(nearest, d);
      if (d < 9) near++;
      const on1 = Math.floor((flash + c.flashOff) * 5) % 2 === 0, u = c.g.userData;      // the lights flash red and blue
      u.red.material.emissive.setHex(on1 ? 0xff2020 : 0x220000); u.blue.material.emissive.setHex(on1 ? 0x000a33 : 0x2060ff);
      u.glow.intensity = d < 120 ? 1.4 : 0; u.glow.color.setHex(on1 ? 0xff3030 : 0x3060ff);
      if (d < 3.6 && st && st.alt < 6) {                                                                        // a police car alongside or ahead rams you and slows you down
        Car.drag(0.55); player.shake = Math.max(player.shake || 0, 0.5); c.v *= 0.6;
        if (Math.random() < dt * 2) { Sfx.play("crash"); }
      }
    }
    sirenT -= dt;
    if (cars.length && nearest < 90 && sirenT <= 0) { sirenT = 4.5; Sfx.play("horn"); }
    // pulled over: one stays right beside you for a while, or two are close while you are slow
    const slow = !st || Math.abs(st.v) < 7;
    const flying = !!st && st.alt > 6;                                                              // nobody can pull over a plane in the air
    const caughtNow = !flying && ((nearest < 4.6) || (near >= 2 && slow));
    closeT = caughtNow ? closeT + dt : Math.max(0, closeT - dt * 0.8);
    if (closeT > (nearest < 4.6 ? 2.2 : 1.6) && typeof Guards !== "undefined") {
      closeT = 0; for (const c of cars) scene.remove(c.g); cars.length = 0; wasChasing = false;
      toast("🚓 You are pulled over by the police!"); Guards.caught();
    }
  }

  return { init, update, spawnNow: (ahead) => spawn(ahead), clear: (x, z) => clearSpot(x, z), trailSize: () => trail.length, get chasing() { return cars.length > 0 && modern(); }, get count() { return cars.length; }, debug: () => cars.map((c) => ({ x: c.x, z: c.z, v: c.v })) };
})();
