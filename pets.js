"use strict";
// Companions bought in the Market: a hound, a cat, a monkey, a lion cub or a peacock that follow you, or an eagle, an owl or a parrot that circle above you.
// They are only for show: they never block you and other players do not see them. Hidden during fights, races and duels.

const Pets = (() => {
  let kind = null, pet = null, t = 0;

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };

  // Facing -z, like the people.
  function buildHound() {
    const g = new THREE.Group(), fur = lam(0x8a5a2b), light = lam(0xc99a62), dark = lam(0x2b1d12);
    g.add(box(0.42, 0.36, 0.85, fur, 0, 0.56, 0));
    g.add(box(0.3, 0.3, 0.32, fur, 0, 0.82, -0.52));
    g.add(box(0.16, 0.14, 0.2, light, 0, 0.76, -0.74));
    g.add(box(0.05, 0.05, 0.05, dark, 0, 0.8, -0.85));
    for (const x of [-0.12, 0.12]) { g.add(box(0.08, 0.2, 0.05, dark, x * 1.5, 1.0, -0.5)); g.add(box(0.04, 0.04, 0.04, dark, x * 0.9, 0.88, -0.66)); }
    const tail = new THREE.Group(); tail.position.set(0, 0.7, 0.42); tail.add(box(0.07, 0.07, 0.4, fur, 0, 0.05, 0.18)); g.add(tail);
    const legs = [];
    for (const [x, z] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, 0.3], [0.14, 0.3]]) {
      const p = new THREE.Group(); p.position.set(x, 0.4, z); p.add(box(0.09, 0.4, 0.09, light, 0, -0.2, 0)); g.add(p); legs.push(p);
    }
    return { g, legs, tail };
  }

  function buildEagle() {
    const g = new THREE.Group(), brown = lam(0x4a3320), white = lam(0xf1ead8), gold = lam(0xd9a23a);
    g.add(box(0.28, 0.24, 0.6, brown, 0, 0, 0));
    g.add(box(0.2, 0.2, 0.2, white, 0, 0.1, -0.36));
    g.add(box(0.07, 0.07, 0.14, gold, 0, 0.06, -0.52));
    g.add(box(0.2, 0.04, 0.3, brown, 0, 0, 0.42));
    const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.14, 0.05, -0.05); w.add(box(0.7, 0.04, 0.34, brown, s * 0.35, 0, 0)); g.add(w); return w; });
    return { g, wings };
  }

  // a four-legged companion built from colours and a size (the cat, the lion cub and the monkey are small versions of the hound's pattern)
  function buildQuad(o) {
    const k = o.s || 1, g = new THREE.Group(), fur = lam(o.fur), light = lam(o.light), dark = lam(o.dark || 0x2b1d12);
    g.add(box(0.42 * k, 0.36 * k, 0.85 * k, fur, 0, 0.56 * k, 0));
    g.add(box(0.3 * k, 0.3 * k, 0.32 * k, fur, 0, 0.82 * k, -0.52 * k));
    g.add(box(0.16 * k, 0.14 * k, 0.2 * k, light, 0, 0.76 * k, -0.74 * k));
    g.add(box(0.05 * k, 0.05 * k, 0.05 * k, dark, 0, 0.8 * k, -0.85 * k));
    for (const x of [-0.12, 0.12]) g.add(box(0.07 * k, o.ears === "tall" ? 0.22 * k : 0.12 * k, 0.05 * k, o.ears === "round" ? light : dark, x * 1.5 * k, (o.ears === "tall" ? 1.05 : 1.0) * k, -0.5 * k));
    if (o.mane) g.add(box(0.46 * k, 0.4 * k, 0.28 * k, lam(o.mane), 0, 0.78 * k, -0.34 * k));
    const tail = new THREE.Group(); tail.position.set(0, 0.7 * k, 0.42 * k); tail.add(box(0.07 * k, o.tailUp ? 0.5 * k : 0.07 * k, o.tailUp ? 0.07 * k : (o.tailLen || 0.4) * k, fur, 0, o.tailUp ? 0.25 * k : 0.05 * k, o.tailUp ? 0.05 * k : 0.18 * k)); g.add(tail);
    const legs = [];
    for (const [x, z] of [[-0.14, -0.3], [0.14, -0.3], [-0.14, 0.3], [0.14, 0.3]]) { const p = new THREE.Group(); p.position.set(x * k, 0.4 * k, z * k); p.add(box(0.09 * k, 0.4 * k, 0.09 * k, o.longLegs ? fur : light, 0, -0.2 * k, 0)); g.add(p); legs.push(p); }
    return { g, legs, tail };
  }
  // a peacock: a blue-green bird on two legs, with a long fan of a tail trailing behind it
  function buildPeacock() {
    const g = new THREE.Group(), blue = lam(0x1d6a8a), green = lam(0x2a8a5a), dark = lam(0x2a2a2a);
    g.add(box(0.3, 0.3, 0.5, blue, 0, 0.5, 0)); g.add(box(0.12, 0.45, 0.12, blue, 0, 0.8, -0.28)); g.add(box(0.14, 0.14, 0.2, green, 0, 1.05, -0.32)); g.add(box(0.04, 0.12, 0.04, dark, 0, 1.2, -0.3));
    const tail = new THREE.Group(); tail.position.set(0, 0.55, 0.26);
    for (let i = -3; i <= 3; i++) { const f = box(0.09, 0.06, 0.9, i % 2 ? green : blue, i * 0.1, 0.02 * Math.abs(i), 0.45); f.rotation.y = i * 0.09; tail.add(f); const eye = box(0.06, 0.07, 0.06, lam(0xf2c21b), i * 0.18, 0.04, 0.88); tail.add(eye); }
    g.add(tail);
    const legs = [];
    for (const x of [-0.07, 0.07]) { const p = new THREE.Group(); p.position.set(x, 0.38, 0); p.add(box(0.04, 0.38, 0.04, dark, 0, -0.19, 0)); g.add(p); legs.push(p); }
    return { g, legs, tail };
  }
  // a flying companion: it circles above you (r: how wide, h: how high)
  function buildFlyer(o) {
    const k = o.s || 1, g = new THREE.Group(), body = lam(o.body), face = lam(o.face), beak = lam(o.beak || 0xd9a23a), wingM = lam(o.wing || o.body);
    g.add(box(0.28 * k, 0.24 * k, 0.6 * k, body, 0, 0, 0)); g.add(box(0.2 * k, 0.2 * k, 0.2 * k, face, 0, 0.1 * k, -0.36 * k)); g.add(box(0.07 * k, 0.07 * k, 0.14 * k, beak, 0, 0.06 * k, -0.52 * k));
    g.add(box(0.2 * k, 0.04 * k, 0.3 * k, o.tail ? lam(o.tail) : body, 0, 0, 0.42 * k));
    if (o.ears) for (const x of [-0.06, 0.06]) g.add(box(0.05 * k, 0.1 * k, 0.05 * k, body, x * k, 0.24 * k, -0.36 * k));
    const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.14 * k, 0.05 * k, -0.05 * k); w.add(box(0.7 * k, 0.04 * k, 0.34 * k, wingM, s * 0.35 * k, 0, 0)); g.add(w); return w; });
    return { g, wings, fly: { r: o.r || 2.4, h: o.h || 3.8, rate: o.rate || 0.7, flap: o.flap || 7 } };
  }
  const BUILD = {
    hound: buildHound,
    eagle: () => buildFlyer({ body: 0x4a3320, face: 0xf1ead8, r: 2.4, h: 3.8, rate: 0.7, flap: 7 }),
    owl: () => buildFlyer({ body: 0x8a6a42, face: 0xe8d9b0, beak: 0x3a3a3a, tail: 0x6a4c2a, ears: true, s: 0.9, r: 1.8, h: 3.0, rate: 0.5, flap: 5 }),
    parrot: () => buildFlyer({ body: 0x2fa04a, face: 0xd9341f, beak: 0xf2c21b, wing: 0x1e7ac0, tail: 0xd9341f, s: 0.55, r: 1.0, h: 2.1, rate: 1.3, flap: 11 }),
    cat: () => buildQuad({ fur: 0xc9884a, light: 0xf0d8b0, s: 0.62, ears: "tall", tailUp: true }),
    cub: () => buildQuad({ fur: 0xd9a54a, light: 0xeacb8a, s: 0.85, ears: "round", tailLen: 0.5 }),
    monkey: () => buildQuad({ fur: 0x7a5a3a, light: 0xd8b080, s: 0.7, ears: "round", tailUp: true, longLegs: true }),
    peacock: buildPeacock,
  };
  const flies = (id) => id === "eagle" || id === "owl" || id === "parrot";

  function set(id) {
    if (pet) { scene.remove(pet.g); pet = null; }
    kind = id || null;
    if (!kind) return;
    pet = (BUILD[kind] || buildHound)();
    pet.x = player.x - 2; pet.z = player.z; pet.yaw = player.yaw; pet.stuck = 0; pet.a = 0;
    pet.g.visible = false;
    scene.add(pet.g);
  }

  const free = (x, z) => canMove(x, z, x + 0.01, z) && !blockedAt(x, z, groundAt(x, z));

  function update(dt) {
    if (!pet) return;
    const show = (mode === "walk" || mode === "watch") && started;
    pet.g.visible = show;
    if (!show) return;
    t += dt;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;

    if (pet.fly) {
      pet.a += dt * pet.fly.rate;
      const px = player.x + Math.cos(pet.a) * pet.fly.r, pz = player.z + Math.sin(pet.a) * pet.fly.r;
      pet.g.position.set(px, player.feet + pet.fly.h + Math.sin(t * 1.6) * 0.3, pz);
      pet.g.rotation.y = -pet.a + Math.PI; // along the circle
      const flap = Math.sin(t * pet.fly.flap) * 0.55;
      pet.wings[0].rotation.z = flap; pet.wings[1].rotation.z = -flap;
      return;
    }

    // the hound: trots to a spot behind you and to the right, never through a wall
    const tx = player.x - fx * 2.0 + rx * 1.1, tz = player.z - fz * 2.0 + rz * 1.1;
    const dx = tx - pet.x, dz = tz - pet.z, d = Math.hypot(dx, dz);
    let moved = 0;
    if (d > 0.25) {
      const step = Math.min(d, Math.min(9, d * 3.2) * dt), nx = pet.x + (dx / d) * step, nz = pet.z + (dz / d) * step;
      if (canMove(pet.x, pet.z, nx, nz)) { pet.x = nx; pet.z = nz; moved = step; }
      else if (canMove(pet.x, pet.z, nx, pet.z)) { pet.x = nx; moved = step * 0.7; }
      else if (canMove(pet.x, pet.z, pet.x, nz)) { pet.z = nz; moved = step * 0.5; }
      else pet.stuck += dt;
      if (moved > 0) pet.stuck = Math.max(0, pet.stuck - dt);
    }
    if (d > 28 || pet.stuck > 1.6) { // lost or stuck: catch up
      for (const [ox, oz] of [[-2, 1], [-1.5, 0], [0, 0], [1.5, 1.5], [-3, -1]]) {
        const cx = player.x + fx * ox + rx * oz, cz = player.z + fz * ox + rz * oz;
        if (free(cx, cz)) { pet.x = cx; pet.z = cz; break; }
      }
      pet.stuck = 0;
    }
    const speed = moved / Math.max(dt, 0.001);
    const want = speed > 0.6 ? Math.atan2(-dx, -dz) : player.yaw;
    let dy = want - pet.yaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    pet.yaw += dy * Math.min(1, dt * 8);
    const gy = groundAt(pet.x, pet.z);
    pet.g.position.set(pet.x, gy + Math.abs(Math.sin(t * Math.min(speed, 8) * 1.6)) * 0.05 * Math.min(1, speed / 3), pet.z);
    pet.g.rotation.y = pet.yaw;
    const sw = Math.sin(t * Math.min(speed, 9) * 1.9) * 0.8 * Math.min(1, speed / 2.5);
    pet.legs.forEach((l, i) => { l.rotation.x = i === 0 || i === 3 ? sw : -sw; });
    pet.tail.rotation.y = Math.sin(t * 9) * (speed < 0.6 ? 0.6 : 0.25);
  }

  // A fresh pet for another player to show beside them (online.js moves it).
  const make = (id) => (BUILD[id] ? BUILD[id]() : null);

  return { set, update, make, flies, KINDS: Object.keys(BUILD) };
})();
