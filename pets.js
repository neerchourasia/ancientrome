"use strict";
// Companions bought in the Market: a hound that trots after you, or an eagle that circles above you.
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

  function set(id) {
    if (pet) { scene.remove(pet.g); pet = null; }
    kind = id || null;
    if (!kind) return;
    pet = kind === "eagle" ? buildEagle() : buildHound();
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

    if (kind === "eagle") {
      pet.a += dt * 0.7;
      const px = player.x + Math.cos(pet.a) * 2.4, pz = player.z + Math.sin(pet.a) * 2.4;
      pet.g.position.set(px, player.feet + 3.8 + Math.sin(t * 1.6) * 0.3, pz);
      pet.g.rotation.y = -pet.a + Math.PI; // along the circle
      const flap = Math.sin(t * 7) * 0.55;
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

  return { set, update };
})();
