"use strict";
// Bailing out: press Esc (or X) in an aircraft that is high enough, and you jump out and parachute down. You fall freely for a moment, then the canopy opens
// and you drift slowly down: A and D turn, W flies the canopy forward faster and S slows it. You land on whatever is below (a street, a roof, a field).
// The aircraft is lost (it crashes somewhere; it goes back in your garage, so you can take it out again, but any crates it carried are lost).
// Depends on car.js (which calls Chute.bail), physics.js and the globals of game.js (mode, player, camera, scene, keys, toast).

const Chute = (() => {
  const MIN_HEIGHT = 15;                                   // lower than this there is no time for a parachute: land first
  const FREEFALL = 1.6, SINK = 5.5, FALL_MAX = 34;         // seconds of free fall, the sink rate under the canopy and the fastest fall (m/s)
  let active = false, t = 0, open = 0, vy = 0, vx = 0, vz = 0, canopy = null, hud = null;

  function makeCanopy() {
    const g = new THREE.Group(), cols = [0xd8412f, 0xf2f2f4];
    const N = 8;
    for (let i = 0; i < N; i++) {                          // eight stripes of a dome
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.6, 6, 8, (i / N) * Math.PI * 2, (Math.PI * 2) / N, 0, Math.PI * 0.5), new THREE.MeshLambertMaterial({ color: cols[i % 2], side: THREE.DoubleSide }));
      m.scale.y = 0.55; m.castShadow = true; g.add(m);
    }
    const line = new THREE.MeshBasicMaterial({ color: 0x2b2b2b });
    for (let i = 0; i < N; i += 2) {                       // lines from the rim down to your shoulders
      const a = (i / N) * Math.PI * 2, x = Math.cos(a) * 2.5, z = Math.sin(a) * 2.5, len = Math.hypot(x, 2.4, z);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.02), line);
      l.position.set(x / 2, -1.2, z / 2); l.lookAt(new THREE.Vector3(0, 0, 0)); l.rotateX(Math.PI / 2);
      g.add(l);
    }
    return g;
  }

  // called by car.js when you get out of an aircraft in the air: info = { x, z, y (height above sea level), yaw, v, name }
  function bail(info) {
    active = true; t = 0; open = 0; vy = 0;
    mode = "chute";
    player.x = info.x; player.z = info.z; player.feet = info.y; player.yaw = info.yaw; player.airY = 0; player.pitch = -0.1;
    const speed = Math.min(14, (info.v || 0) * 0.4);       // you carry some of the aircraft's speed forward, then it dies away
    vx = -Math.sin(info.yaw) * speed; vz = -Math.cos(info.yaw) * speed;
    player.vx = player.vz = 0;
    if (!canopy) { canopy = makeCanopy(); scene.add(canopy); }
    canopy.visible = false;
    toast(`You bailed out! The ${String(info.name || "aircraft").toLowerCase()} is lost. The parachute opens in a moment: A and D turn, W flies forward, S slows.`);
    if (typeof Sfx !== "undefined") Sfx.play("crash");
  }

  function land() {
    active = false;
    if (canopy) canopy.visible = false;
    if (hud) hud.hidden = true;
    mode = "walk";
    player.vx = player.vz = 0; player.airY = 0;
    const g = groundAt(player.x, player.z);
    player.feet = g;
    toast(g < -0.2 ? "You splashed down." : "You landed safely.");
  }

  function update(dt) {
    if (!active) return;
    t += dt;
    const ground = groundAt(player.x, player.z), h = player.feet - ground;
    if (open < 1 && (t > FREEFALL || h < 60)) open = Math.min(1, open + dt * 2.2);       // the canopy opens (at once if you are already low)
    canopy.visible = open > 0;
    // falling: fast, then slowing sharply as the canopy opens
    const want = FALL_MAX + (SINK - FALL_MAX) * open;
    vy += (want - vy) * Math.min(1, dt * (open > 0 ? 3 : 1.2));
    // steering under the canopy
    const turn = (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) - (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0);
    const fwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    if (open > 0.5) player.yaw += turn * 1.3 * dt;
    const drift = open > 0.5 ? 4.5 + fwd * 4 : 0;                                         // metres per second across the ground
    const wx = -Math.sin(player.yaw) * drift, wz = -Math.cos(player.yaw) * drift, k = Math.min(1, dt * (open > 0.5 ? 2.5 : 0.5));
    vx += (wx - vx) * k; vz += (wz - vz) * k;
    const nx = player.x + vx * dt, nz = player.z + vz * dt;
    const inside = nx > BOUNDS.minX + 5 && nx < BOUNDS.maxX - 5 && nz > BOUNDS.minZ + 5 && nz < BOUNDS.maxZ - 5;
    if (inside && !blockedAt(nx, nz, player.feet)) { player.x = nx; player.z = nz; } else { vx = vz = 0; }   // (a wall or the edge of the city stops you drifting sideways)
    player.feet -= vy * dt;
    const g2 = groundAt(player.x, player.z);
    if (player.feet <= g2) { player.feet = g2; land(); return; }
    // the canopy rides above the avatar
    canopy.position.set(player.x, player.feet + 3.9, player.z); canopy.rotation.y = player.yaw;
    canopy.scale.setScalar(0.25 + 0.75 * Math.min(1, open));
    if (!hud) hud = document.getElementById("ride-hud");
    if (hud) { hud.hidden = false; hud.textContent = `Parachute · ${Math.max(0, Math.round(player.feet - g2))} m up · A D turn · W forward · S slow`; }
  }

  // behind and above you, looking at you
  function camera(cam) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    cam.position.set(player.x - fx * 8, player.feet + 4.5, player.z - fz * 8);
    cam.lookAt(player.x + fx * 4, player.feet + 1.5, player.z + fz * 4);
  }

  return { bail, update, camera, get active() { return active; }, MIN_HEIGHT };
})();
