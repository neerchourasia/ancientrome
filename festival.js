"use strict";
// Festivals. The year has 28 days; on certain days a festival is held and the city dresses up for it:
//   Rome:  Floralia (days 4-6, spring: flower garlands and flower-sellers' cries) and Saturnalia (days 25-28, midwinter:
//          red, green and gold lanterns along the Via Sacra, "Io Saturnalia!" everywhere).
//   Delhi: Diwali (days 9-12: strings of lamps along Chandni Chowk, fireworks over the sky at night, sweets) and Holi
//          (days 17-18: clouds of coloured powder, flags and "Holi hai!").
// While a festival lasts, food costs a quarter less, jobs pay a quarter more, there are festival dishes at the food stall,
// people shout greetings and the music is brighter. Depends on game.js (scene, Time, city), tax.js (Speech) and music.js.

const Festival = (() => {
  const T = THREE;
  const FEASTS = {
    floralia: { city: "rome", name: "Floralia", icon: "🌸", from: 4, to: 6, note: "flower garlands, cheaper food, better pay", say: ["Io Floralia!", "Flowers for the goddess!", "Happy Floralia!"] },
    saturnalia: { city: "rome", name: "Saturnalia", icon: "🕯", from: 25, to: 28, note: "lanterns, cheaper food, better pay", say: ["Io Saturnalia!", "Happy Saturnalia!", "Masters serve the slaves today!", "Let the feast begin!"] },
    diwali: { city: "delhi", name: "Diwali", icon: "🪔", from: 9, to: 12, note: "lamps, fireworks at night, sweets, cheaper food, better pay", say: ["Shubh Deepavali!", "Happy Diwali!", "Light the diyas!", "Have some mithai!"] },
    holi: { city: "delhi", name: "Holi", icon: "🎨", from: 17, to: 18, note: "coloured powder, cheaper food, better pay", say: ["Holi hai!", "Bura na mano, Holi hai!", "Happy Holi!", "Come, play with colours!"] },
  };
  const COLORS = { diwali: [0xffb347, 0xffd36b, 0xff7a3a, 0xff5a8a], saturnalia: [0xc0262b, 0x2f8f4a, 0xe2b955, 0xf1ead8], floralia: [0xf28fb0, 0xf5d547, 0xffffff, 0xb08be0], holi: [0xe23b8a, 0xf2c21b, 0x2c7fe0, 0x27a35a, 0xf26a1b] };
  let scene = null, deco = {}, parts = [], cur = null, curKey = null, sayT = 8, boomT = 3, dustT = 0, glowTex = null, lastBadge = "";
  const mats = {};

  const dayOfYear = () => ((Math.floor(Time.day) - 1) % 28 + 28) % 28 + 1;
  function find(c) { const d = dayOfYear(); for (const [k, f] of Object.entries(FEASTS)) if (f.city === c && d >= f.from && d <= f.to) return k; return null; }

  // ---------------------------------------------------------------- the decorations

  // strings of lights (or flags or flowers) in lines: [x0, z0, x1, z1] in world coordinates
  function strings(key, lines, y, spacing) {
    const spots = [];
    for (const [x0, z0, x1, z1] of lines) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.floor(len / spacing));
      for (let i = 0; i <= n; i++) { const u = i / n; spots.push([x0 + (x1 - x0) * u, y + (i % 2 ? -0.35 : 0.1) + Math.sin(u * len * 0.35) * 0.15, z0 + (z1 - z0) * u]); }
    }
    const geo = key === "holi" ? new T.BoxGeometry(0.9, 0.7, 0.05) : new T.SphereGeometry(key === "floralia" ? 0.38 : 0.3, 8, 6);
    const mesh = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: 0xffffff }), spots.length), o = new T.Object3D(), col = new T.Color(), pal = COLORS[key];
    spots.forEach((p, i) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(0, Math.random() * 3, 0); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); mesh.setColorAt(i, col.setHex(pal[i % pal.length])); });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.frustumCulled = false;
    // a thin cord for each line, so the lights hang from something
    const g = new T.Group(); g.add(mesh);
    for (const [x0, z0, x1, z1] of lines) {
      const len = Math.hypot(x1 - x0, z1 - z0), cord = new T.Mesh(new T.BoxGeometry(len, 0.04, 0.04), new T.MeshBasicMaterial({ color: 0x3a2a1a }));
      cord.position.set((x0 + x1) / 2, y - 0.05, (z0 + z1) / 2); cord.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(cord);
    }
    return g;
  }

  function build(key) {
    if (deco[key]) return deco[key];
    const DX = typeof DELHI_X !== "undefined" ? DELHI_X : 6000;
    let g;
    if (key === "diwali" || key === "holi") {
      const lines = [];
      for (let x = -560; x <= -60; x += 100) lines.push([DX + x, -11, DX + x, 11]);               // across the avenue
      lines.push([DX - 560, -11, DX - 40, -11], [DX - 560, 11, DX - 40, 11], [DX - 100, 56, DX - 20, 56], [DX - 90, 74, DX - 10, 74]);   // along both sides, and over the market square
      g = strings(key, lines, 6.2, key === "holi" ? 3.4 : 2.6);
    } else {
      const lines = [[40, -9, 255, -9], [40, 9, 255, 9], [150, 54, 190, 54], [150, 74, 190, 74], [185, -62, 315, -62], [185, -18, 315, -18]];   // the Via Sacra, the market and the Via Domus
      for (let x = 60; x <= 240; x += 60) lines.push([x, -9, x, 9]);
      g = strings(key, lines, 5.6, 2.8);
    }
    g.visible = false; scene.add(g); deco[key] = g;
    return g;
  }

  // ---------------------------------------------------------------- particles: fireworks (Diwali), powder (Holi)

  function sprite(color, size, add) {
    const k = color + (add ? "a" : "n");
    if (!mats[k]) mats[k] = new T.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, fog: false, blending: add ? T.AdditiveBlending : T.NormalBlending });
    const s = new T.Sprite(mats[k].clone()); s.scale.set(size, size, 1); scene.add(s); return s;
  }
  function burst(x, y, z, pal, n, speed, life, size, add, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, b = Math.acos(2 * Math.random() - 1), v = speed * (0.6 + Math.random() * 0.5);
      const s = sprite(pal[Math.floor(Math.random() * pal.length)], size * (0.7 + Math.random() * 0.6), add); s.position.set(x, y, z);
      parts.push({ s, vx: Math.sin(b) * Math.cos(a) * v, vy: Math.cos(b) * v, vz: Math.sin(b) * Math.sin(a) * v, life, max: life, g: grav, op: add ? 1 : 0.7 });
    }
  }

  function init(sc) {
    scene = sc;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 1, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new T.CanvasTexture(c);
  }

  // ---------------------------------------------------------------- each frame

  function badge() {
    const el = document.getElementById("fest-badge");
    if (!el) return;
    const text = cur ? `${cur.icon} ${cur.name}: ${cur.note}` : "";
    if (text !== lastBadge) { lastBadge = text; el.textContent = text; el.title = cur ? `${cur.name} (days ${cur.from}-${cur.to} of the year)` : ""; }
  }

  function update(dt) {
    if (!scene) return;
    const c = typeof city !== "undefined" ? city : "rome", key = find(c);
    if (key !== curKey) {
      curKey = key; cur = key ? FEASTS[key] : null;
      for (const [k, g] of Object.entries(deco)) g.visible = k === key;
      if (key) { build(key).visible = true; toast(`${cur.icon} ${cur.name}! ${cur.note[0].toUpperCase()}${cur.note.slice(1)}.`); Narrator.say(`${cur.name} is being held today.`, { interrupt: false }); }
      badge();
    }
    if (!cur) { for (const p of parts.splice(0)) { scene.remove(p.s); p.s.material.dispose(); } return; }
    // people wish you well
    sayT -= dt;
    if (sayT <= 0 && typeof Speech !== "undefined" && (mode === "walk" || mode === "drive")) {
      sayT = 7 + Math.random() * 7;
      const list = c === "delhi" ? (Delhi.built ? Delhi.people() : []) : (typeof CITIZENS !== "undefined" ? CITIZENS.list : []);
      let best = null, bd = 22;
      for (const p of list) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd && Math.random() < 0.4) { best = p; bd = d; } }
      if (best) Speech.say(best, cur.say[Math.floor(Math.random() * cur.say.length)], 3);
    }
    // fireworks at night on Diwali; clouds of powder all day on Holi
    if (curKey === "diwali" && (Time.isNight || Time.hour > 18) ) {
      boomT -= dt;
      if (boomT <= 0) {
        boomT = 2.2 + Math.random() * 3;
        const a = Math.random() * 6.28, r = 80 + Math.random() * 90, pal = [[0xff5a5a, 0xffd36b], [0x5ac8ff, 0xffffff], [0xa6ff7a, 0xffe14a], [0xff8ae0, 0xffd36b]][Math.floor(Math.random() * 4)];
        burst(player.x + Math.cos(a) * r, 70 + Math.random() * 50, player.z + Math.sin(a) * r, pal, 46, 22, 2.4, 6, true, 7);
        if (typeof Sfx !== "undefined") setTimeout(() => Sfx.play("firework"), 350);
      }
    }
    if (curKey === "holi" && (mode === "walk" || mode === "drive")) {
      dustT -= dt;
      if (dustT <= 0) { dustT = 0.9; const a = Math.random() * 6.28, r = 3 + Math.random() * 9; burst(player.x + Math.cos(a) * r, 1 + Math.random(), player.z + Math.sin(a) * r, COLORS.holi, 7, 3, 2.2, 5, false, -0.4); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); parts.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= 1 - dt * 0.5; p.vz *= 1 - dt * 0.5;
      p.s.material.opacity = p.op * Math.min(1, p.life / p.max * 1.6);
    }
    badge();
  }

  return {
    init, update, FEASTS,
    get active() { return !!cur; },
    get id() { return curKey; },
    get name() { return cur ? cur.name : ""; },
    get foodMul() { return cur ? 0.75 : 1; },       // food costs a quarter less
    get payMul() { return cur ? 1.25 : 1; },        // jobs pay a quarter more
    line: () => (cur ? cur.say[Math.floor(Math.random() * cur.say.length)] : null),
    debugDay: dayOfYear,
  };
})();
