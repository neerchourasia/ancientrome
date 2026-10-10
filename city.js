"use strict";
// Terrain mesh, sky and light, apartment blocks, trees and wandering citizens.

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- ground ----------

function buildGround(scene) {
  const size = 2800, seg = 240, ox = -50, oz = 80;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const earth = new THREE.Color(0xc2ab7c), grass = new THREE.Color(0x7c9a52), far = new THREE.Color(0x87a15a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + ox, wz = pos.getZ(i) + oz;
    const h = heightAt(wx, wz);
    pos.setY(i, h);
    const d = Math.hypot(wx, wz);
    c.copy(earth).lerp(grass, Math.min(1, h / 12));
    c.lerp(far, Math.min(1, Math.max(0, (d - 650) / 500)));
    const n = 0.94 + rnd() * 0.12;
    col[i * 3] = c.r * n; col[i * 3 + 1] = c.g * n; col[i * 3 + 2] = c.b * n;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.position.set(ox, 0, oz);
  ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- sky, fog and sun ----------

// A day is a loop of keyframes (hour of the day, 0-24). Colours and light levels blend between neighbours.
const NIGHT = { top: 0x050914, mid: 0x0f1a33, bottom: 0x22284a, fog: 0x141b30, sun: 0xffffff, sunI: 0, hemiSky: 0x3b4a78, hemiGround: 0x1c1a24, hemiI: 0.46, fogFar: 760, night: 1 };
const SKY_KEYS = [
  { h: 0, ...NIGHT },
  { h: 5, ...NIGHT },
  { h: 6.5, top: 0x2c3a70, mid: 0xd9a08a, bottom: 0xf2b784, fog: 0xc9a58a, sun: 0xffb27a, sunI: 0.32, hemiSky: 0x9aa8cf, hemiGround: 0x6a5a50, hemiI: 0.56, fogFar: 1100, night: 0.3 },
  { h: 8, top: 0x7fa9e0, mid: 0xcfe0ee, bottom: 0xf6dcb0, fog: 0xe6dcc6, sun: 0xffd6a0, sunI: 0.68, hemiSky: 0xbdd3ee, hemiGround: 0x9b8462, hemiI: 0.72, fogFar: 1250, night: 0 },
  { h: 12, top: 0x4c8ada, mid: 0xa9cdf0, bottom: 0xe4f0f8, fog: 0xd4e3ee, sun: 0xfff6dc, sunI: 0.68, hemiSky: 0xcfe2f5, hemiGround: 0xa89a78, hemiI: 0.74, fogFar: 1250, night: 0 },
  { h: 16, top: 0x5a8fd6, mid: 0xb9d3ec, bottom: 0xefe2c4, fog: 0xdcd8c8, sun: 0xffe9c0, sunI: 0.68, hemiSky: 0xc6d8ee, hemiGround: 0xa08e6c, hemiI: 0.72, fogFar: 1250, night: 0 },
  { h: 18, top: 0x38477f, mid: 0xd98a6a, bottom: 0xf7b56a, fog: 0xe3a577, sun: 0xff9a55, sunI: 0.62, hemiSky: 0xd9a288, hemiGround: 0x6a5240, hemiI: 0.62, fogFar: 1150, night: 0.1 },
  { h: 19.5, top: 0x1b2050, mid: 0x7a4e7a, bottom: 0xd9805a, fog: 0x7a5a6a, sun: 0xff7a4a, sunI: 0.12, hemiSky: 0x66608e, hemiGround: 0x3a3038, hemiI: 0.5, fogFar: 950, night: 0.65 },
  { h: 21, ...NIGHT },
  { h: 24, ...NIGHT },
];
const SKY_PHASES = [ // for the T key and the clock label
  { from: 0, name: "Night" }, { from: 5, name: "Dawn" }, { from: 8, name: "Morning" }, { from: 11, name: "Midday" },
  { from: 15, name: "Afternoon" }, { from: 18, name: "Sunset" }, { from: 19.5, name: "Dusk" }, { from: 21, name: "Night" },
];
const phaseName = (h) => SKY_PHASES.filter((p) => h >= p.from).pop().name;

function buildSky(scene) {
  const cvs = document.createElement("canvas");
  cvs.width = 4; cvs.height = 256;
  const tex = new THREE.CanvasTexture(cvs);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(dome);

  // stars, a sun disc and a moon that ride the sky
  const starPos = new Float32Array(700 * 3);
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.asin(0.04 + Math.random() * 0.96);
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * 1400; starPos[i * 3 + 1] = Math.sin(e) * 1400; starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 1400;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(48, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff1c0, fog: false }));
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
  scene.add(stars, sunDisc, moonDisc);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x9db4ff, 0); // no shadows, just cool light at night
  scene.add(moon);
  const lamp = new THREE.PointLight(0xffc37a, 0, 26); // the small oil lamp you carry after dark
  scene.add(lamp);
  scene.fog = new THREE.Fog(0xd4e3ee, 220, 1250);

  const ca = new THREE.Color(), cb = new THREE.Color(), tmp = new THREE.Color();
  const mix = (k, i0, i1, f) => tmp.copy(ca.setHex(i0[k])).lerp(cb.setHex(i1[k]), f);
  const g = cvs.getContext("2d");
  const state = { hour: -1, night: 0, dir: new THREE.Vector3(0, 1, 0), sunDir: new THREE.Vector3(0, 1, 0), moonDir: new THREE.Vector3(0, 1, 0) };
  state.setHour = (h, force) => {
    h = ((h % 24) + 24) % 24;
    if (!force && Math.abs(h - state.hour) < 0.004) return;
    state.hour = h;
    let i = 0;
    while (i < SKY_KEYS.length - 2 && h >= SKY_KEYS[i + 1].h) i++;
    const k0 = SKY_KEYS[i], k1 = SKY_KEYS[i + 1];
    let f = (h - k0.h) / (k1.h - k0.h); f = f * f * (3 - 2 * f);
    const num = (k) => k0[k] + (k1[k] - k0[k]) * f;

    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#" + mix("top", k0, k1, f).getHexString());
    grad.addColorStop(0.5, "#" + mix("mid", k0, k1, f).getHexString());
    grad.addColorStop(1, "#" + mix("bottom", k0, k1, f).getHexString());
    g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
    tex.needsUpdate = true;
    scene.fog.color.copy(mix("fog", k0, k1, f)); scene.fog.far = num("fogFar");
    hemi.color.copy(mix("hemiSky", k0, k1, f)); hemi.groundColor.copy(mix("hemiGround", k0, k1, f)); hemi.intensity = num("hemiI");
    sun.color.copy(mix("sun", k0, k1, f)); sun.intensity = num("sunI");
    state.night = num("night");
    moon.intensity = Math.max(0, state.night - 0.35) * 0.5;
    lamp.intensity = Math.max(0, state.night - 0.3) * 1.1;
    starMat.opacity = Math.max(0, Math.min(1, (state.night - 0.55) * 2.5));

    const a = ((h - 6) / 12) * Math.PI; // the sun rises in the east (-x), peaks at noon and sets in the west
    state.sunDir.set(-Math.cos(a) * 0.9, Math.sin(a), 0.3).normalize();
    const hm = h < 12 ? h + 24 : h, b = ((hm - 18) / 12) * Math.PI;
    state.moonDir.set(-Math.cos(b) * 0.9, Math.sin(b), -0.3).normalize();
    state.dir.copy(state.sunDir); state.dir.y = Math.max(state.dir.y, 0.25); state.dir.normalize(); // keep shadows from stretching to infinity
    sunDisc.visible = state.sunDir.y > -0.05;
    moonDisc.visible = state.moonDir.y > -0.05 && state.night > 0.2;
  };
  state.follow = (p) => {
    dome.position.copy(p); stars.position.copy(p);
    sunDisc.position.set(p.x + state.sunDir.x * 1300, state.sunDir.y * 1300, p.z + state.sunDir.z * 1300);
    moonDisc.position.set(p.x + state.moonDir.x * 1300, state.moonDir.y * 1300, p.z + state.moonDir.z * 1300);
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + state.dir.x * 220, state.dir.y * 220, p.z + state.dir.z * 220);
    moon.position.set(p.x + state.moonDir.x * 200, Math.max(60, state.moonDir.y * 200), p.z + state.moonDir.z * 200);
    lamp.position.set(p.x, p.y + 0.4, p.z);
  };
  state.setHour(12, true);
  return state;
}

// ---------- apartment blocks (insulae) ----------

const EXCLUDE = [ // [x0, x1, z0, z1]
  [-140, 225, -95, 100],   // forum and its surroundings
  [200, 550, -16, 16],     // Via Sacra to the Colosseum
  [320, 550, -100, 160],   // Colosseum
  [262, 320, -64, 12],     // Colossus of the Sun
  [-240, -60, -395, -170], // Trajan's Forum
  [-548, -405, -510, -335],// Pantheon and its plaza
  [-312, -148, 100, 780],  // Circus Maximus
  [-360, -110, -175, 75],  // Capitoline approaches
  [-40, 120, 60, 130],     // Palatine approach
  [-422, 422, -472, -458], // Servian Wall, east-west stretch
  [412, 428, -472, -140],  // Servian Wall, north-south stretch
  [222, 290, 24, 78],      // your house
];

function excluded(x, z, m) {
  for (const [x0, x1, z0, z1] of EXCLUDE) if (x > x0 - m && x < x1 + m && z > z0 - m && z < z1 + m) return true;
  return false;
}

// Two palettes for the apartment blocks: ancient plaster, or modern render/brick/glass. Same length, so a
// building keeps the same "slot" (and so a consistent look) whichever era it's shown in.
const PLASTER_ANCIENT = [0xd9b98a, 0xe0c9a0, 0xc99a6a, 0xd6a877, 0xe4d2ae, 0xbf8b62].map((c) => new THREE.Color(c));
const PLASTER_MODERN = [0xb9bcc0, 0x8fa3ad, 0xcdc6b8, 0x707a72, 0xd8d8d0, 0xa6774f].map((c) => new THREE.Color(c));
const INSULAE = { list: [], body: null, shops: null, roofs: null };

function buildInsulae(scene) {
  const cell = 44, list = INSULAE.list;
  for (let x = -760; x <= 660; x += cell) {
    for (let z = -660; z <= 800; z += cell) {
      const px = x + (rnd() - 0.5) * 8, pz = z + (rnd() - 0.5) * 8;
      if (rnd() < 0.16 || excluded(px, pz, 22) || heightAt(px, pz) > 0.6) continue;
      const w = 18 + rnd() * 12, d = 18 + rnd() * 12, h = 9 + Math.floor(rnd() * 4) * 3.4;
      const ci = Math.floor(rnd() * PLASTER_ANCIENT.length);
      list.push({ x: px, z: pz, w, d, h, ci });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const body = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
  const shops = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x5a3f2c }), list.length);
  const roofs = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xa04a2c }), list.length);
  const o = new THREE.Object3D();
  list.forEach((b, i) => {
    o.rotation.set(0, 0, 0);
    o.position.set(b.x, 0, b.z); o.scale.set(b.w, b.h, b.d); o.updateMatrix(); body.setMatrixAt(i, o.matrix);
    o.position.set(b.x, 0, b.z); o.scale.set(b.w + 0.5, 3.2, b.d + 0.5); o.updateMatrix(); shops.setMatrixAt(i, o.matrix);
    o.position.set(b.x, b.h, b.z); o.scale.set(b.w + 1.4, 1.1, b.d + 1.4); o.updateMatrix(); roofs.setMatrixAt(i, o.matrix);
    body.setColorAt(i, PLASTER_ANCIENT[b.ci]);
    addBlockerBox(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, 0, b.h + 1);
    MAP_SHAPES.push({ k: "r", x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2, c: "#d29b72" });
  });
  for (const m of [body, shops, roofs]) { m.instanceMatrix.needsUpdate = true; scene.add(m); }
  body.instanceColor.needsUpdate = true;
  body.castShadow = false; roofs.castShadow = false;
  INSULAE.body = body; INSULAE.shops = shops; INSULAE.roofs = roofs;
}

// Switches the apartment blocks between ancient plaster and a modern city palette.
function applyInsulaeEra(modern) {
  const { list, body, shops, roofs } = INSULAE;
  if (!body) return;
  const palette = modern ? PLASTER_MODERN : PLASTER_ANCIENT;
  list.forEach((b, i) => body.setColorAt(i, palette[b.ci]));
  body.instanceColor.needsUpdate = true;
  shops.material.color.setHex(modern ? 0x24313a : 0x5a3f2c);
  roofs.material.color.setHex(modern ? 0x3a3a3a : 0xa04a2c);
}

// ---------- trees ----------

function buildTrees(scene) {
  const pos = [];
  let tries = 0;
  while (pos.length < 260 && tries++ < 4000) {
    const x = BOUNDS.minX + rnd() * (BOUNDS.maxX - BOUNDS.minX), z = BOUNDS.minZ + rnd() * (BOUNDS.maxZ - BOUNDS.minZ);
    if (excluded(x, z, 8)) continue;
    const h = heightAt(x, z);
    if (h < 0.5 && Math.hypot(x, z) < 520) continue; // keep the city core free of trees
    if (blockedAt(x, z, h) || blockedAt(x + 4, z + 4, h) || blockedAt(x - 4, z - 4, h)) continue;
    pos.push({ x, z, h, s: 0.8 + rnd() * 0.7, pine: rnd() < 0.55 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const pineGeo = new THREE.SphereGeometry(1, 10, 6); pineGeo.scale(1, 0.42, 1);
  const cypGeo = new THREE.ConeGeometry(1, 1, 8); cypGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5c4630 }), pos.length);
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ color: 0x4f7a3a }), pos.length);
  const cyps = new THREE.InstancedMesh(cypGeo, new THREE.MeshLambertMaterial({ color: 0x2f5a35 }), pos.length);
  const o = new THREE.Object3D(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  pos.forEach((p, i) => {
    o.rotation.set(0, rnd() * 6, 0);
    if (p.pine) {
      o.position.set(p.x, p.h, p.z); o.scale.set(1, 9 * p.s, 1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      o.position.set(p.x, p.h + 9.5 * p.s, p.z); o.scale.set(5.5 * p.s, 5.5 * p.s, 5.5 * p.s); o.updateMatrix(); pines.setMatrixAt(i, o.matrix);
      cyps.setMatrixAt(i, hide);
    } else {
      o.position.set(p.x, p.h, p.z); o.scale.set(1, 3 * p.s, 1); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
      o.position.set(p.x, p.h + 1.5 * p.s, p.z); o.scale.set(2.2 * p.s, 15 * p.s, 2.2 * p.s); o.updateMatrix(); cyps.setMatrixAt(i, o.matrix);
      pines.setMatrixAt(i, hide);
    }
    addBlockerCircle(p.x, p.z, 0.6, p.h, p.h + 12);
  });
  for (const m of [trunks, pines, cyps]) { m.castShadow = true; scene.add(m); }
}

// ---------- citizens ----------

const CITIZENS = { list: [], body: null, head: null };
// Ancient togas and tunics, or modern street clothes. Same length, so a citizen keeps the same "slot".
const ROBES_ANCIENT = [0xf1ead8, 0xf1ead8, 0xf1ead8, 0xd8c39a, 0xb0473a, 0x4f6f8f, 0xd6a13a, 0x7d8f5b].map((c) => new THREE.Color(c));
const ROBES_MODERN = [0x2b3a55, 0x454545, 0xb23b3b, 0x3f6b4a, 0xd9d9d9, 0x8a6d3f, 0x2e2e2e, 0x5577aa].map((c) => new THREE.Color(c));

function buildCitizens(scene, count = 90) {
  const bodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.35, 8); bodyGeo.translate(0, 0.68, 0);
  const headGeo = new THREE.SphereGeometry(0.19, 8, 6); headGeo.translate(0, 1.58, 0);
  const body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const head = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), count);
  const skins = [0xe0b38a, 0xc9956b, 0xa8724c, 0xefc9a3].map((c) => new THREE.Color(c));
  const hubs = [[30, 0, 90], [-150, -240, 45], [300, 20, 60], [-230, 430, 60], [-480, -430, 40], [40, 250, 40]];
  for (let i = 0; i < count; i++) {
    let x = 0, z = 0;
    for (let t = 0; t < 40; t++) {
      if (rnd() < 0.75) { const [hx, hz, hr] = pick(hubs); x = hx + (rnd() - 0.5) * 2 * hr; z = hz + (rnd() - 0.5) * 2 * hr * 0.7; }
      else { x = BOUNDS.minX + rnd() * (BOUNDS.maxX - BOUNDS.minX); z = BOUNDS.minZ + rnd() * (BOUNDS.maxZ - BOUNDS.minZ); }
      if (canMove(x, z, x + 0.1, z)) break;
    }
    const ci = Math.floor(rnd() * ROBES_ANCIENT.length);
    CITIZENS.list.push({ x, z, a: rnd() * Math.PI * 2, v: 0.8 + rnd() * 0.9, t: rnd() * 5, phase: rnd() * 6, ci });
    body.setColorAt(i, ROBES_ANCIENT[ci]);
    head.setColorAt(i, pick(skins));
  }
  body.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true;
  body.castShadow = true;
  scene.add(body, head);
  CITIZENS.body = body; CITIZENS.head = head;
}

// Switches citizens between togas and modern clothes.
function applyCitizensEra(modern) {
  const { list, body } = CITIZENS;
  if (!body) return;
  const palette = modern ? ROBES_MODERN : ROBES_ANCIENT;
  list.forEach((c, i) => body.setColorAt(i, palette[c.ci]));
  body.instanceColor.needsUpdate = true;
}

const _o = new THREE.Object3D();
function updateCitizens(dt, time) {
  const { list, body, head } = CITIZENS;
  if (!body) return;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const down = (c.down || 0) > 0; // knocked over: lies on the ground for a moment, then gets up
    if (down) c.down -= dt;
    else {
      c.t -= dt;
      if (c.t <= 0) { c.a += (rnd() - 0.5) * 1.6; c.t = 2 + rnd() * 5; }
      const nx = c.x + Math.sin(c.a) * c.v * dt, nz = c.z + Math.cos(c.a) * c.v * dt;
      if (canMove(c.x, c.z, nx, nz)) { c.x = nx; c.z = nz; }
      else { c.a += Math.PI * (0.5 + rnd() * 0.8); c.t = 1.5; }
    }
    const bob = down ? 0 : Math.abs(Math.sin(time * 5 + c.phase)) * 0.06;
    const tilt = down ? 1.35 * Math.min(1, c.down / 0.35) : 0;
    _o.position.set(c.x, groundAt(c.x, c.z) + bob + tilt * 0.3, c.z);
    _o.rotation.set(-tilt, c.a, 0);
    _o.scale.set(1, 1, 1);
    _o.updateMatrix();
    body.setMatrixAt(i, _o.matrix);
    head.setMatrixAt(i, _o.matrix);
  }
  body.instanceMatrix.needsUpdate = true;
  head.instanceMatrix.needsUpdate = true;
}
