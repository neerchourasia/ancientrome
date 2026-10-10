"use strict";
// Cars for Modern Rome: buy one in the Market, take it out, get in (X) and drive anywhere the streets and squares allow.
// The car follows the same obstacle rules as you do (walls, parked cars, lamp posts, trees), crashes cost you health,
// pedestrians you hit are knocked over, and the moving traffic brakes for you. Only exists in Modern Rome.
// Depends on game.js, physics.js, modern.js and audio.js at run time.

const Car = (() => {
  // max: top speed (m/s); accel: how quickly it gets there; turn: how sharply it steers
  const MODELS = {
    scooter: { name: "Vespa scooter", max: 15, accel: 9, turn: 2.7, color: 0xd9c24a, len: 1.9, wid: 0.7 },
    citycar: { name: "City car", max: 24, accel: 10, turn: 2.1, color: 0x3a6fb5, len: 3.8, wid: 1.8 },
    sportscar: { name: "Sports car", max: 36, accel: 16, turn: 1.9, color: 0xc0262b, len: 4.4, wid: 1.9 },
  };

  let car = null, driving = false, camYaw = 0, bumpCd = 0, runCd = 0, stuckT = 0;
  const circles = [0, 1, 2].map(() => ({ x: 0, z: 0, r: 1.0, y1: 1.6, t: 1, mine: true, era: "modern", on: false }));
  for (const c of circles) dynBlockers.push(c);

  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const wheel = (r, w, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 12), lam(0x1a1a1a)); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; };

  // Faces -z (like the people), so its yaw works like yours.
  function build(id) {
    const M = MODELS[id], g = new THREE.Group(), body = lam(M.color), glass = lam(0x1d2a33), wheels = [];
    const lamp = new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), tail = new THREE.MeshBasicMaterial({ color: 0xc01818 });
    if (id === "scooter") {
      g.add(box(0.34, 0.4, 1.3, body, 0, 0.55, 0.1), box(0.3, 0.1, 0.55, lam(0x2b2b2b), 0, 0.82, 0.3), box(0.9, 0.06, 0.06, lam(0x2b2b2b), 0, 1.1, -0.55), box(0.06, 0.55, 0.06, lam(0x2b2b2b), 0, 0.82, -0.55));
      g.add(box(0.1, 0.1, 0.06, lamp, 0, 0.95, -0.7));
      for (const z of [-0.65, 0.7]) { const w = wheel(0.3, 0.12, 0, 0.3, z); g.add(w); wheels.push(w); }
    } else {
      const L = M.len, W = M.wid, low = id === "sportscar";
      g.add(box(W, low ? 0.5 : 0.65, L, body, 0, low ? 0.5 : 0.6, 0));
      g.add(box(W * 0.84, low ? 0.4 : 0.55, L * (low ? 0.42 : 0.5), glass, 0, low ? 0.92 : 1.12, L * 0.05));
      g.add(box(W * 0.9, 0.1, 0.1, lamp, 0, 0.6, -L / 2 - 0.02), box(W * 0.9, 0.1, 0.1, tail, 0, 0.6, L / 2 + 0.02));
      if (low) g.add(box(W * 0.9, 0.06, 0.4, body, 0, 0.95, L / 2 - 0.2), box(0.08, 0.2, 0.08, body, W * 0.3, 0.8, L / 2 - 0.2), box(0.08, 0.2, 0.08, body, -W * 0.3, 0.8, L / 2 - 0.2)); // spoiler
      for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.32]) { const w = wheel(0.34, 0.2, sx * (W / 2), 0.34, z); g.add(w); wheels.push(w); }
    }
    return { g, wheels };
  }

  function placeCircles(on) {
    if (!car) { for (const c of circles) c.on = false; return; }
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), h = car.M.len * 0.3;
    circles.forEach((c, i) => { const k = i - 1; c.x = car.x + fx * k * h; c.z = car.z + fz * k * h; c.r = Math.max(0.6, car.M.wid * 0.55); c.on = on; });
  }

  const freeSpot = (x, z) => !blockedAt(x, z, groundAt(x, z)) && canMove(x, z, x + 0.01, z);

  // Take the car out of the garage and park it in front of you
  function deploy(id) {
    if (era !== "modern") { toast("Cars only exist in Modern Rome. Press K to go there."); return; }
    if (!MODELS[id]) return;
    stow();
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;
    let spot = null;
    for (const [f, r] of [[4, 2.6], [4, -2.6], [5.5, 0], [3, 3.6], [3, -3.6], [-4, 3], [7, 3], [0, 5]]) {
      const x = player.x + fx * f + rx * r, z = player.z + fz * f + rz * r;
      if (freeSpot(x, z) && freeSpot(x + fx * 2, z + fz * 2) && freeSpot(x - fx * 2, z - fz * 2)) { spot = [x, z]; break; }
    }
    if (!spot) { toast("There is no room to park here. Find an open street."); return; }
    const m = build(id);
    car = { id, M: MODELS[id], x: spot[0], z: spot[1], yaw: player.yaw, v: 0, ...m, y: groundAt(spot[0], spot[1]) };
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.y = car.yaw;
    scene.add(car.g);
    placeCircles(true);
    toast(`${car.M.name}: walk up to it and press X to get in.`);
    Sfx.play("coin");
  }

  function stow() {
    if (driving) exit(true);
    if (car) { scene.remove(car.g); car = null; }
    placeCircles(false);
  }

  const nearby = () => !!car && !driving && mode === "walk" && Math.hypot(player.x - car.x, player.z - car.z) < 7;

  function enter() {
    if (!nearby() || era !== "modern") return;
    driving = true; mode = "drive";
    placeCircles(false);
    camYaw = car.yaw;
    player.vx = player.vz = 0; Vitals.stopRest();
    $("#drive-hud").classList.add("show");
    toast("W gas · S brake and reverse · A D steer · Space handbrake · Esc to get out");
  }

  function exit(silent) {
    if (!driving) return;
    driving = false; car.v = 0;
    mode = "walk";
    $("#drive-hud").classList.remove("show");
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx;
    let spot = [car.x, car.z];
    for (const side of [2.6, -2.6, 3.4, -3.4]) {
      const x = car.x + rx * side, z = car.z + rz * side;
      if (freeSpot(x, z)) { spot = [x, z]; break; }
    }
    player.x = spot[0]; player.z = spot[1]; player.feet = groundAt(spot[0], spot[1]); player.vx = player.vz = 0;
    player.yaw = car.yaw; player.pitch = -0.05;
    placeCircles(true);
    if (!silent) toast("You got out. Your car stays parked here.");
  }

  function toggleEnter() { if (driving) exit(); else if (nearby()) enter(); else if (car && era === "modern") toast("Walk up to your car to get in."); }

  // The five contact points of the car (centre and four corners) at a position and heading
  function points(x, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx, h = car.M.len / 2 - 0.15, w = car.M.wid / 2 - 0.1;
    return [[0, 0], [h, w], [h, -w], [-h, w], [-h, -w]].map(([a, b]) => [x + fx * a + rx * b, z + fz * a + rz * b]);
  }
  const clearAt = (x, z, yaw) => points(x, z, yaw).every(([px, pz]) => !blockedAt(px, pz, groundAt(px, pz)));

  // A car wedged against something (or spawned in a tight spot) is moved to the nearest clear place
  function rescue() {
    for (let r = 1; r <= 9; r += 1) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, x = car.x + Math.cos(a) * r, z = car.z + Math.sin(a) * r;
        if (clearAt(x, z, car.yaw)) { car.x = x; car.z = z; car.v = 0; return true; }
      }
    }
    return false;
  }

  // Move by (dx, dz) if the whole car fits there (four corners and the centre); otherwise slide along the obstacle.
  function fits(dx, dz) {
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), rx = -fz, rz = fx, h = car.M.len / 2 - 0.15, w = car.M.wid / 2 - 0.1;
    for (const [a, b] of [[0, 0], [h, w], [h, -w], [-h, w], [-h, -w]]) {
      const x = car.x + fx * a + rx * b, z = car.z + fz * a + rz * b;
      if (!canMove(x, z, x + dx, z + dz)) return false;
    }
    return true;
  }

  function update(dt, keys) {
    if (!car || !driving) return;
    const M = car.M;
    bumpCd = Math.max(0, bumpCd - dt); runCd = Math.max(0, runCd - dt);
    const gas = keys.has("KeyW") || keys.has("ArrowUp"), brake = keys.has("KeyS") || keys.has("ArrowDown");
    const steer = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    if (gas) car.v += M.accel * (1 - Math.max(0, car.v) / M.max * 0.85) * dt;
    if (brake) car.v -= (car.v > 0.3 ? 26 : 9) * dt;
    if (!gas && !brake) car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), (1.8 + Math.abs(car.v) * 0.12) * dt); // coasting
    if (keys.has("Space")) car.v *= Math.max(0, 1 - 3.2 * dt);
    car.v = Math.max(-7, Math.min(M.max, car.v));

    const grip = Math.min(1, Math.abs(car.v) / 4) * (1 - 0.45 * Math.abs(car.v) / M.max);
    car.yaw += steer * M.turn * grip * Math.sign(car.v || 1) * dt;
    const dx = -Math.sin(car.yaw) * car.v * dt, dz = -Math.cos(car.yaw) * car.v * dt;
    let hit = false;
    if (fits(dx, dz)) { car.x += dx; car.z += dz; }
    else if (Math.abs(dx) > Math.abs(dz) * 0.2 && Math.abs(dx) > 1e-4 && fits(dx, 0)) { car.x += dx; car.v *= 1 - 1.6 * dt; }   // scrape along a wall
    else if (Math.abs(dz) > Math.abs(dx) * 0.2 && Math.abs(dz) > 1e-4 && fits(0, dz)) { car.z += dz; car.v *= 1 - 1.6 * dt; }
    else hit = true;
    // pressing the pedals but going nowhere for a moment: move the car to the nearest clear spot
    stuckT = hit && (gas || brake) && Math.abs(car.v) < 1.5 ? stuckT + dt : 0;
    if (stuckT > 0.8) { stuckT = 0; if (rescue()) toast("Your car was wedged in, so it was moved to a clear spot."); }
    if (hit && Math.abs(car.v) > 1) {
      const impact = Math.abs(car.v);
      if (bumpCd <= 0) {
        bumpCd = 0.9;
        if (impact > 5) {
          const dmg = Math.min(30, (impact - 3) * 1.2);
          Vitals.hp = Math.max(5, Vitals.hp - dmg);
          player.shake = Math.min(1, impact / 20); $("#flash").style.opacity = 0.45;
          Sfx.play("crash"); toast(`Crash! (-${Math.round(dmg)} health)`);
        } else Sfx.play("bump");
      }
      car.v = -car.v * 0.25;
    } else if (hit) car.v = 0;

    // other cars on the road
    const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw);
    for (const k of [0, M.len * 0.4, -M.len * 0.4]) {
      const h2 = Modern.hits(car.x + fx * k, car.z + fz * k);
      if (h2 && bumpCd <= 0) { bumpCd = 0.9; car.v *= 0.2; player.shake = 0.6; Sfx.play("crash"); toast("You hit another car!"); break; }
    }
    // pedestrians
    if (Math.abs(car.v) > 2.5) {
      for (const c of CITIZENS.list) {
        if ((c.down || 0) > 0) continue;
        if (Math.hypot(c.x - (car.x + fx * M.len * 0.3), c.z - (car.z + fz * M.len * 0.3)) < 1.7) {
          c.down = Math.abs(car.v) > 10 ? 2.6 : 1.6;
          const d = Math.hypot(c.x - car.x, c.z - car.z) || 1;
          if (canMove(c.x, c.z, c.x + ((c.x - car.x) / d) * 1.6, c.z + ((c.z - car.z) / d) * 1.6)) { c.x += ((c.x - car.x) / d) * 1.6; c.z += ((c.z - car.z) / d) * 1.6; }
          Sfx.play("oof");
          if (runCd <= 0) { runCd = 2; toast("Watch out! You knocked over a citizen."); }
        }
      }
    }

    // the car, the camera target and you all move together
    car.y += (groundAt(car.x, car.z) - car.y) * Math.min(1, dt * 10);
    car.g.position.set(car.x, car.y, car.z); car.g.rotation.y = car.yaw;
    for (const w of car.wheels) w.rotation.x += (car.v * dt) / 0.34;
    player.x = car.x; player.z = car.z; player.yaw = car.yaw; player.feet = car.y; player.vx = player.vz = 0;
    $("#drive-kmh").textContent = Math.round(Math.abs(car.v) * 3.6);
  }

  // The chase camera sits behind and above the car and swings round after it.
  function camera(cam, dt) {
    if (!car) return;
    let dy = car.yaw - camYaw; dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
    camYaw += dy * Math.min(1, dt * 4);
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let d = 7.5 + Math.abs(car.v) * 0.09;
    for (; d > 2.5; d -= 0.5) if (!blockedAt(car.x - fx * d, car.z - fz * d, car.y + 2.5)) break;
    cam.position.set(car.x - fx * d, car.y + 2.6 + Math.abs(car.v) * 0.02, car.z - fz * d);
    cam.lookAt(car.x + fx * 2, car.y + 1.1, car.z + fz * 2);
    if (player.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * player.shake * 0.4; cam.position.y += (Math.random() - 0.5) * player.shake * 0.3;
      player.shake = Math.max(0, player.shake - dt * 2.4);
    }
    const f = $("#flash"); f.style.opacity = Math.max(0, parseFloat(f.style.opacity || 0) - dt * 1.6);
  }

  return {
    MODELS, deploy, stow, enter, exit, toggleEnter, update, camera, nearby,
    get current() { return car ? car.id : null; },
    get driving() { return driving; },
    debug: () => (car ? { x: car.x, z: car.z, yaw: car.yaw, v: car.v, stuckT, bumpCd, driving, fitsAhead: fits(-Math.sin(car.yaw) * 0.05, -Math.cos(car.yaw) * 0.05), fitsBack: fits(Math.sin(car.yaw) * 0.05, Math.cos(car.yaw) * 0.05) } : null),
    probe: () => (car ? points(car.x, car.z, car.yaw).map(([x, z]) => blockedAt(x, z, groundAt(x, z))) : null),
    speed01: () => (car && driving ? Math.min(1, Math.abs(car.v) / car.M.max) : 0),
  };
})();
