"use strict";
// The streets of Modern Rome: asphalt roads in the gaps between the apartment blocks, parked cars, street lamps and
// window grids on the buildings. All of it is hidden in Ancient Rome. The cars and lamps are solid (you can crash
// into them) only in Modern Rome: their obstacles carry era: "modern", so the physics ignores them otherwise.
// Depends on city.js (INSULAE, excluded, mulberry32), physics.js and world.js.

const Modern = (() => {
  let group = null, windowTex = null, lampMat = null, built = false;
  let traffic = [], trafficBody = null, trafficCabin = null;
  const _o = new THREE.Object3D();

  const LAMP_DAY = new THREE.Color(0x8a8a80), LAMP_NIGHT = new THREE.Color(0xffe3a0);
  const CAR_COLORS = [0xb3b6ba, 0x2d3036, 0xe9e9e6, 0x8d1f24, 0x1f4f8a, 0x3a6b4a, 0xd4b34a, 0x6d737a].map((c) => new THREE.Color(c));

  // Rows of windows, so the apartment blocks read as modern buildings (stretched a little by each building's size).
  function makeWindowTex() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
    const cols = 4, rows = 3, cw = 128 / cols, rh = 128 / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = (i * 7 + j * 3) % 5 === 0;
        g.fillStyle = lit ? "#c9b27a" : "#56697a";
        g.fillRect(i * cw + cw * 0.2, j * rh + rh * 0.22, cw * 0.6, rh * 0.5);
        g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(i * cw + cw * 0.2, j * rh + rh * 0.72, cw * 0.6, rh * 0.06);
      }
    }
    g.fillStyle = "rgba(0,0,0,.12)";
    for (let j = 0; j < rows; j++) g.fillRect(0, j * rh, 128, 3);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function build(scene) {
    if (built) return;
    built = true;
    const rand = mulberry32(777), cell = 44;
    const roadPieces = []; // { x, z, alongX }
    // Between the lattice of apartment blocks run two sets of streets, each cut into 44 m pieces.
    for (let x = -760; x <= 660; x += cell) {
      for (let z = -660; z <= 800; z += cell) {
        for (const alongX of [true, false]) {
          const cx = alongX ? x : x + 22, cz = alongX ? z + 22 : z;
          let ok = cx > BOUNDS.minX + 25 && cx < BOUNDS.maxX - 25 && cz > BOUNDS.minZ + 25 && cz < BOUNDS.maxZ - 25;
          for (const d of [-20, -10, 0, 10, 20]) {
            if (!ok) break;
            const px = alongX ? cx + d : cx, pz = alongX ? cz : cz + d;
            if (excluded(px, pz, 4) || heightAt(px, pz) > 0.02 || blockedAt(px, pz, 0)) ok = false;
          }
          if (ok) roadPieces.push({ x: cx, z: cz, alongX });
        }
      }
    }

    group = new THREE.Group();
    group.visible = false;
    const o = new THREE.Object3D();
    const geo = new THREE.BoxGeometry(1, 1, 1);

    // asphalt, with the lane markings painted on (one texture, so the roads are a single cheap draw)
    const rc = document.createElement("canvas");
    rc.width = 256; rc.height = 32;
    const rg = rc.getContext("2d");
    rg.fillStyle = "#2f3134"; rg.fillRect(0, 0, 256, 32);
    rg.fillStyle = "#cfc9a6";
    for (const d of [-14, 0, 14]) rg.fillRect(256 * (0.5 + d / 44.4) - 17, 15, 34, 2);
    const roadTex = new THREE.CanvasTexture(rc);
    roadTex.anisotropy = 4;
    const road = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: roadTex }), roadPieces.length);
    roadPieces.forEach((p, i) => {
      o.rotation.set(0, p.alongX ? 0 : Math.PI / 2, 0); // the texture runs along the box's length
      o.position.set(p.x, 0.05, p.z); o.scale.set(44.4, 0.1, 7.6); o.updateMatrix(); road.setMatrixAt(i, o.matrix);
    });
    group.add(road);

    // parked cars at the kerb of about one street piece in four
    const cars = [];
    for (const p of roadPieces) {
      if (rand() > 0.24) continue;
      const side = rand() < 0.5 ? -1 : 1, along = (rand() - 0.5) * 24;
      const cx = p.alongX ? p.x + along : p.x + side * 2.7, cz = p.alongX ? p.z + side * 2.7 : p.z + along;
      const hx = p.alongX ? 2.1 : 0.9, hz = p.alongX ? 0.9 : 2.1;
      if (blockedAt(cx, cz, 0) || blockedAt(cx + (p.alongX ? 2.2 : 0), cz + (p.alongX ? 0 : 2.2), 0) || blockedAt(cx - (p.alongX ? 2.2 : 0), cz - (p.alongX ? 0 : 2.2), 0)) continue;
      cars.push({ x: cx, z: cz, alongX: p.alongX, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
      addBlockerBox(cx - hx, cx + hx, cz - hz, cz + hz, 0, 1.5, { era: "modern" });
    }
    const body = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), cars.length);
    const cabin = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x1d2a33 }), cars.length);
    cars.forEach((c, i) => {
      o.rotation.set(0, c.alongX ? 0 : Math.PI / 2, 0);
      o.position.set(c.x, 0.55, c.z); o.scale.set(4.2, 0.75, 1.8); o.updateMatrix(); body.setMatrixAt(i, o.matrix); body.setColorAt(i, c.color);
      const off = c.alongX ? [-0.2, 0] : [0, -0.2];
      o.position.set(c.x + off[0], 1.22, c.z + off[1]); o.scale.set(2.3, 0.62, 1.6); o.updateMatrix(); cabin.setMatrixAt(i, o.matrix);
    });
    if (cars.length) body.instanceColor.needsUpdate = true;
    body.castShadow = cabin.castShadow = true;
    group.add(body, cabin);

    // street lamps at some corners (they light up at night)
    const spots = [];
    for (let x = -760; x <= 660; x += cell) {
      for (let z = -660; z <= 800; z += cell) {
        const px = x + 22 + 3.4, pz = z + 22 + 3.4;
        if (rand() > 0.45 || px > BOUNDS.maxX - 20 || pz > BOUNDS.maxZ - 20) continue;
        if (excluded(px, pz, 4) || heightAt(px, pz) > 0.02 || blockedAt(px, pz, 0) || blockedAt(px - 3.4, pz - 3.4, 0)) continue;
        spots.push({ x: px, z: pz });
        addBlockerCircle(px, pz, 0.15, 0, 6.4, { era: "modern" });
      }
    }
    lampMat = new THREE.MeshBasicMaterial({ color: 0x8a8a80 });
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 1, 6), new THREE.MeshLambertMaterial({ color: 0x3b3f44 }), spots.length);
    const heads = new THREE.InstancedMesh(geo, lampMat, spots.length);
    spots.forEach((s, i) => {
      o.rotation.set(0, 0, 0);
      o.position.set(s.x, 3.1, s.z); o.scale.set(1, 6.2, 1); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
      o.position.set(s.x - 0.7, 6.3, s.z - 0.7); o.scale.set(1.5, 0.18, 0.5); o.rotation.set(0, Math.PI / 4, 0); o.updateMatrix(); heads.setMatrixAt(i, o.matrix);
    });
    group.add(poles, heads);


    // moving traffic: cars drive from crossing to crossing along the streets, on the right-hand side
    const nodes = new Map();
    const node = (x, z) => { const k = x + "," + z; if (!nodes.has(k)) nodes.set(k, { x, z, next: [] }); return nodes.get(k); };
    for (const p of roadPieces) {
      const a = p.alongX ? node(p.x - 22, p.z) : node(p.x, p.z - 22), b = p.alongX ? node(p.x + 22, p.z) : node(p.x, p.z + 22);
      a.next.push(b); b.next.push(a);
    }
    const starts = [...nodes.values()].filter((n) => n.next.length);
    const TRAFFIC = Math.min(110, starts.length);
    for (let i = 0; i < TRAFFIC; i++) {
      const A = starts[Math.floor(rand() * starts.length)], B = A.next[Math.floor(rand() * A.next.length)];
      traffic.push({ id: i, A, B, s: rand() * 44, v: 0, vmax: 6 + rand() * 5, yaw: 0, ox: 0, oz: 0, x: A.x, z: A.z, dx: 1, dz: 0, honkT: 0, color: CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)] });
    }
    trafficBody = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), traffic.length);
    trafficCabin = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x1d2a33 }), traffic.length);
    traffic.forEach((c, i) => trafficBody.setColorAt(i, c.color));
    if (traffic.length) trafficBody.instanceColor.needsUpdate = true;
    trafficBody.castShadow = trafficCabin.castShadow = true;
    group.add(trafficBody, trafficCabin);

    windowTex = makeWindowTex();
    scene.add(group);
  }

  // `night` is 0 by day and 1 at night: the lamps glow after dark. Also drives the traffic (px, pz: where you are).
  function update(night, dt, px, pz) {
    if (!lampMat || !group || !group.visible) return;
    lampMat.color.copy(LAMP_DAY).lerp(LAMP_NIGHT, Math.min(1, Math.max(0, (night - 0.3) * 2)));
    if (dt) drive(Math.min(dt, 0.05), px, pz);
  }

  function drive(dt, px, pz) {
    for (const c of traffic) {
      const L = Math.hypot(c.B.x - c.A.x, c.B.z - c.A.z);
      c.dx = (c.B.x - c.A.x) / L; c.dz = (c.B.z - c.A.z) / L;
      const rx = -c.dz, rz = c.dx; // right-hand side
      // slow down for you and for other cars ahead in the same lane (or, at a crossing, for the lower-numbered car)
      let brake = false;
      const pxr = px - c.x, pzr = pz - c.z, pa = pxr * c.dx + pzr * c.dz, pl = pxr * rx + pzr * rz;
      if (pa > 0 && pa < 9 && Math.abs(pl) < 1.5) {
        brake = true;
        if (pa < 7 && c.honkT <= 0) { c.honkT = 4; Sfx.play("honk", { x: c.x, z: c.z, range: 90 }); }
      }
      c.honkT -= dt;
      if (!brake) {
        for (const o of traffic) {
          if (o === c) continue;
          const ex = o.x - c.x, ez = o.z - c.z;
          if (ex > 10 || ex < -10 || ez > 10 || ez < -10) continue;
          const a = ex * c.dx + ez * c.dz, l = ex * rx + ez * rz;
          if (a > 0 && a < 7 && Math.abs(l) < 1.3 && (o.dx * c.dx + o.dz * c.dz > 0.5 || o.id < c.id)) { brake = true; break; }
        }
      }
      c.v += Math.max(-12 * dt, Math.min(4 * dt, (brake ? 0 : c.vmax) - c.v));
      c.s += c.v * dt;
      if (c.s >= L) { // reached the crossing: carry on, turn, or (at a dead end) turn round
        const options = c.B.next.filter((n) => n !== c.A), next = options.length ? options[Math.floor(Math.random() * options.length)] : c.A;
        c.s -= L; c.A = c.B; c.B = next;
      }
      const k = Math.min(1, dt * 4);
      c.ox += (rx * 1.0 - c.ox) * k; c.oz += (rz * 1.0 - c.oz) * k; // keep to the right, easing across when the direction changes
      c.x = c.A.x + c.dx * c.s + c.ox; c.z = c.A.z + c.dz * c.s + c.oz;
      let dy = Math.atan2(-c.dz, c.dx) - c.yaw;
      dy -= Math.round(dy / (2 * Math.PI)) * 2 * Math.PI;
      c.yaw += dy * Math.min(1, dt * 6);
    }
    traffic.forEach((c, i) => {
      _o.rotation.set(0, c.yaw, 0);
      _o.position.set(c.x, 0.55, c.z); _o.scale.set(4.2, 0.75, 1.8); _o.updateMatrix(); trafficBody.setMatrixAt(i, _o.matrix);
      _o.position.set(c.x - 0.2 * Math.cos(c.yaw), 1.22, c.z + 0.2 * Math.sin(c.yaw)); _o.scale.set(2.3, 0.62, 1.6); _o.updateMatrix(); trafficCabin.setMatrixAt(i, _o.matrix);
    });
    trafficBody.instanceMatrix.needsUpdate = trafficCabin.instanceMatrix.needsUpdate = true;
  }

  // A moving car that is touching you, if any: { v, rx, rz, side } (side: which way it should throw you).
  function hits(px, pz) {
    if (!group || !group.visible) return null;
    for (const c of traffic) {
      if (c.v < 0.8) continue;
      const ex = px - c.x, ez = pz - c.z;
      if (ex > 4 || ex < -4 || ez > 4 || ez < -4) continue;
      const a = ex * c.dx + ez * c.dz, rx = -c.dz, rz = c.dx, l = ex * rx + ez * rz;
      if (Math.abs(a) < 2.5 && Math.abs(l) < 1.3) return { v: c.v, rx, rz, side: l >= 0 ? 1 : -1 };
    }
    return null;
  }

  function apply(modern) {
    if (group) group.visible = modern;
    if (INSULAE.body) {
      INSULAE.body.material.map = modern ? windowTex : null;
      INSULAE.body.material.needsUpdate = true;
    }
  }

  return { build, update, apply, hits };
})();
