"use strict";
// Festivals, on the real calendar: the city dresses up on the real days of each festival.
//   Rome:    Floralia (28 April to 3 May: flower garlands, flower-sellers' cries) and Saturnalia (17 to 23 December: lanterns along the Via Sacra, "Io Saturnalia!").
//   Delhi:   Diwali (five days around the main night, which moves: 8 November 2026, 29 October 2027...: lamps along Chandni Chowk, rows of diyas, rangoli, fireworks, sweets) and Holi (coloured powder).
//   Cancún:  the Equinox of Kukulcán (around 20 March and 22 September: the serpent of light) and Día de Muertos (31 October to 2 November: marigolds, candles).
//   Beijing: the Mid-Autumn Festival (moon cakes, lanterns) and the Spring Festival (Chinese New Year: red lanterns, fireworks, dumplings).
// The days of the festivals that move with the moon are listed for 2026 to 2030 (`moving`); the others are the same every year (`fixed`). A link with ?feast=diwali (or any festival's name) holds
// that festival in its city whatever the date, for trying it out. While a festival lasts, food costs a quarter less, jobs pay a quarter more, there are festival dishes at the food stall, people shout
// greetings and the music is brighter. When a festival is on in a city you are not in, the game tells you so. Depends on game.js (scene, Time, city), tax.js (Speech) and music.js.

const Festival = (() => {
  const T = THREE;
  // fixed: [month, day, month, day] windows that come every year; moving: { year: [month, day, month, day] }
  const FEASTS = {
    floralia: { city: "rome", name: "Floralia", icon: "🌸", fixed: [[4, 28, 5, 3]], note: "flower garlands, cheaper food, better pay", say: ["Io Floralia!", "Flowers for the goddess!", "Happy Floralia!"] },
    saturnalia: { city: "rome", name: "Saturnalia", icon: "🕯", fixed: [[12, 17, 12, 23]], note: "lanterns, cheaper food, better pay", say: ["Io Saturnalia!", "Happy Saturnalia!", "Masters serve the slaves today!", "Let the feast begin!"] },
    diwali: { city: "delhi", name: "Diwali", icon: "🪔", moving: { 2026: [11, 6, 11, 10], 2027: [10, 27, 10, 31], 2028: [10, 15, 10, 19], 2029: [11, 3, 11, 7], 2030: [10, 24, 10, 28] }, peak: { 2026: [11, 8], 2027: [10, 29], 2028: [10, 17], 2029: [11, 5], 2030: [10, 26] },
      note: "lamps, rangoli, fireworks at night, sweets, cheaper food, better pay", say: ["Shubh Deepavali!", "Happy Diwali!", "Light the diyas!", "Have some mithai!", "Lakshmi ji ki jai!"] },
    holi: { city: "delhi", name: "Holi", icon: "🎨", moving: { 2026: [3, 3, 3, 4], 2027: [3, 21, 3, 22], 2028: [3, 10, 3, 11], 2029: [2, 28, 3, 1], 2030: [3, 19, 3, 20] }, note: "coloured powder, cheaper food, better pay", say: ["Holi hai!", "Bura na mano, Holi hai!", "Happy Holi!", "Come, play with colours!"] },
    equinox: { city: "cancun", name: "Equinox of Kukulcán", icon: "🐍", fixed: [[3, 19, 3, 22], [9, 20, 9, 23]], note: "the serpent of light slides down El Castillo, flags, cheaper food, better pay", say: ["Kukulcán descends!", "¡Feliz equinoccio!", "Look at the serpent of light!", "Come to the pyramid!"] },
    muertos: { city: "cancun", name: "Día de Muertos", icon: "💀", fixed: [[10, 31, 11, 2]], note: "marigolds, candles, sugar skulls, cheaper food, better pay", say: ["¡Feliz Día de Muertos!", "Pan de muerto, ¡pruébalo!", "For our ancestors!", "Marigolds light the way home!"] },
    midautumn: { city: "beijing", name: "Mid-Autumn Festival", icon: "🥮", moving: { 2026: [9, 24, 9, 26], 2027: [9, 14, 9, 16], 2028: [10, 2, 10, 4], 2029: [9, 21, 9, 23], 2030: [9, 11, 9, 13] }, note: "lanterns, moon cakes, the full moon, cheaper food, better pay", say: ["Happy Mid-Autumn!", "Look at the moon!", "Have a moon cake!", "中秋快乐!"] },
    springfest: { city: "beijing", name: "Spring Festival", icon: "🧧", moving: { 2026: [2, 16, 2, 23], 2027: [2, 5, 2, 12], 2028: [1, 25, 2, 1], 2029: [2, 12, 2, 19], 2030: [2, 2, 2, 9] }, note: "red lanterns, fireworks at night, dumplings, cheaper food, better pay", say: ["Happy New Year!", "新年快乐!", "Gong xi fa cai!", "Have a dumpling!"] },
  };
  const COLORS = { diwali: [0xffb347, 0xffd36b, 0xff7a3a, 0xff5a8a], saturnalia: [0xc0262b, 0x2f8f4a, 0xe2b955, 0xf1ead8], floralia: [0xf28fb0, 0xf5d547, 0xffffff, 0xb08be0], holi: [0xe23b8a, 0xf2c21b, 0x2c7fe0, 0x27a35a, 0xf26a1b], equinox: [0x2f8f4a, 0x27a3c2, 0xf2c21b, 0xffffff], muertos: [0xff9a1f, 0xffb800, 0xb04fd0, 0xffffff, 0xe84a8a], midautumn: [0xffd36b, 0xfff3d0, 0xff9a4a, 0xffe9a8], springfest: [0xd8262b, 0xe2b955, 0xd8262b, 0xff7a3a] };
  let clock = 0, lanterns = [], diyas = [], rdiyas = [], tinted = [], shotCd = 0, hits = 0, lastKey = "", scene = null, deco = {}, parts = [], cur = null, curKey = null, sayT = 8, boomT = 3, dustT = 0, curDay = { n: 0, of: 0, peak: false }, told = new Set(), newsT = 6, lastCity = "", glowTex = null, lastBadge = "";
  const mats = {};

  // the real calendar (the date on this computer). ?feast=<name> holds that festival on whatever the date, in its city (for trying a festival out).
  let forced = ""; try { forced = new URLSearchParams(location.search).get("feast") || ""; } catch (e) { /* ignore */ }
  const windows = (f, y) => (f.fixed ? f.fixed : f.moving && f.moving[y] ? [f.moving[y]] : []);
  function inWindow(f, now) {
    const md = (now.getMonth() + 1) * 100 + now.getDate();
    return windows(f, now.getFullYear()).some(([m1, d1, m2, d2]) => { const a = m1 * 100 + d1, b = m2 * 100 + d2; return a <= b ? md >= a && md <= b : md >= a || md <= b; });
  }
  function find(c, now = new Date()) {
    if (FEASTS[forced] && FEASTS[forced].city === c) return forced;
    for (const [k, f] of Object.entries(FEASTS)) if (f.city === c && inWindow(f, now)) return k;
    return null;
  }
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // "6 to 10 November": when the festival is on this year (the window that is on now, or the next one)
  function dates(f, now = new Date()) {
    const w = windows(f, now.getFullYear())[0];
    if (!w) return "";
    return w[0] === w[2] ? `${w[1]} to ${w[3]} ${MONTHS[w[2] - 1]}` : `${w[1]} ${MONTHS[w[0] - 1]} to ${w[3]} ${MONTHS[w[2] - 1]}`;
  }
  // how many days until a festival begins (0 when it is on today, null when it has no window this year)
  function startsIn(f, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let best = null;
    for (const [m1, d1, m2, d2] of windows(f, now.getFullYear())) {
      const a = new Date(now.getFullYear(), m1 - 1, d1), b = new Date(now.getFullYear(), m2 - 1, d2), n = Math.round((a - today) / 86400000);
      if (today >= a && today <= b) return 0;
      if (n > 0 && (best === null || n < best)) best = n;
    }
    return best;
  }
  // which day of a festival it is (1 to n) and whether it is the main day: Diwali's main night is the middle of its five days
  function dayOf(key, now = new Date()) {
    const f = FEASTS[key]; if (!f) return { n: 0, of: 0, peak: false };
    const y = now.getFullYear(), w = windows(f, y).find(([m1, d1, m2, d2]) => { const md = (now.getMonth() + 1) * 100 + now.getDate(); return md >= m1 * 100 + d1 && md <= m2 * 100 + d2; }) || windows(f, y)[0];
    if (!w) return { n: 0, of: 0, peak: false };
    const t0 = new Date(y, w[0] - 1, w[1]), t1 = new Date(y, w[2] - 1, w[3]), of = Math.round((t1 - t0) / 86400000) + 1, n = Math.min(of, Math.max(1, Math.round((new Date(y, now.getMonth(), now.getDate()) - t0) / 86400000) + 1));
    const pk = f.peak && f.peak[y];
    return { n, of, peak: pk ? now.getMonth() + 1 === pk[0] && now.getDate() === pk[1] : false };
  }

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

  // Diwali: two rows of little clay lamps (diyas) all along Chandni Chowk, and rangoli (patterns of coloured powder) on the ground
  function diwaliExtras(g, DX) {
    const spots = [];
    for (let x = -560; x <= -60; x += 4) for (const z of [-12.5, 12.5]) spots.push([DX + x + (z > 0 ? 2 : 0), z]);
    const bowls = new T.InstancedMesh(new T.CylinderGeometry(0.2, 0.13, 0.11, 8), new T.MeshLambertMaterial({ color: 0xb5593a }), spots.length), o = new T.Object3D();
    const pos = new Float32Array(spots.length * 3);
    spots.forEach(([x, z], i) => { o.position.set(x, 0.06, z); o.updateMatrix(); bowls.setMatrixAt(i, o.matrix); pos.set([x, 0.4, z], i * 3); });
    bowls.instanceMatrix.needsUpdate = true; bowls.frustumCulled = false; g.add(bowls);
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    const flames = new T.PointsMaterial({ map: glowTex, color: 0xffb347, size: 1.5, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false, opacity: 0.9 });
    const pts = new T.Points(geo, flames); pts.frustumCulled = false; g.add(pts); g.userData.flames = flames;
    // rangoli: rings of petals in the colours of the festival, drawn once on a canvas
    const c = document.createElement("canvas"); c.width = c.height = 256; const cx = c.getContext("2d"), pal = ["#e23b8a", "#ffb347", "#ffffff", "#27a35a", "#2c7fe0", "#ff7a3a"];
    cx.clearRect(0, 0, 256, 256);
    for (let ring = 5; ring >= 0; ring--) {
      const r = 18 + ring * 20, n = 8 + ring * 4;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + ring * 0.2; cx.fillStyle = pal[(i + ring) % pal.length]; cx.beginPath(); cx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 8 + (5 - ring) * 0.6, 0, 7); cx.fill(); }
    }
    cx.fillStyle = "#ffd36b"; cx.beginPath(); cx.arc(128, 128, 14, 0, 7); cx.fill();
    const tex = new T.CanvasTexture(c), mat = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide });
    [[-500, 7.5], [-420, -7.5], [-340, 7.5], [-260, -7.5], [-180, 7.5], [-110, -7.5], [-60, 7.5]].forEach(([x, z]) => { const m = new T.Mesh(new T.CircleGeometry(3.2, 40), mat); m.rotation.x = -Math.PI / 2; m.position.set(DX + x, 0.07, z); g.add(m); });        // (on the paving beside the canal)
  }

  function build(key) {
    if (deco[key]) return deco[key];
    const DX = typeof DELHI_X !== "undefined" ? DELHI_X : 6000;
    let g;
    if (key === "equinox" || key === "muertos") {                    // Cancún: flags and marigold garlands across the plaza and the market
      const CX = typeof CANCUN_X !== "undefined" ? CANCUN_X : 12000, lines = [[CX - 110, -45, CX + 110, -45], [CX - 110, 45, CX + 110, 45], [CX - 70, 128, CX + 70, 128], [CX - 70, 172, CX + 70, 172]];
      for (let x = -100; x <= 100; x += 50) lines.push([CX + x, -45, CX + x, 45]);
      g = strings(key, lines, 6.0, 2.8);
    } else if (key === "midautumn" || key === "springfest") {         // Beijing: strings of lanterns across the great avenue, along the square and over the market
      const BX = typeof BEIJING_X !== "undefined" ? BEIJING_X : 18000, lines = [[BX - 170, -40, BX + 170, -40], [BX - 170, 20, BX + 170, 20], [BX - 120, 110, BX + 130, 110], [BX + 190, 92, BX + 310, 92], [BX + 190, 128, BX + 310, 128]];
      for (let x = -150; x <= 150; x += 75) lines.push([BX + x, -40, BX + x, 20]);
      g = strings(key, lines, 6.4, 2.6);
    } else if (key === "diwali" || key === "holi") {
      const lines = [];
      for (let x = -560; x <= -60; x += 100) lines.push([DX + x, -11, DX + x, 11]);               // across the avenue
      lines.push([DX - 560, -11, DX - 40, -11], [DX - 560, 11, DX - 40, 11], [DX - 100, 56, DX - 20, 56], [DX - 90, 74, DX - 10, 74]);   // along both sides, and over the market square
      g = strings(key, lines, 6.2, key === "holi" ? 3.4 : 2.6);
      if (key === "diwali") diwaliExtras(g, DX);
    } else {
      const lines = [[40, -9, 255, -9], [40, 9, 255, 9], [150, 54, 190, 54], [150, 74, 190, 74], [185, -62, 315, -62], [185, -18, 315, -18]];   // the Via Sacra, the market and the Via Domorum
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

  // ---------------------------------------------------------------- things to do: lanterns (Diwali, Saturnalia), colours (Holi, Floralia)

  const LANT_COLORS = [0xff7a3a, 0xffd36b, 0xe23b8a, 0x5ac8ff, 0xa6ff7a, 0xffffff];
  const LANTERN_FEASTS = ["diwali", "saturnalia", "muertos", "midautumn", "springfest"];             // (the festivals with lanterns to light: L)
  const isLantern = () => LANTERN_FEASTS.includes(curKey);
  const can = (k) => cur && ((k === "KeyL" && isLantern()) || (k === "KeyU" && (curKey === "holi" || curKey === "floralia")));

  function lanternMesh(col) {
    const g = new T.Group(), paper = new T.MeshBasicMaterial({ color: col });
    const body = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.8, 8, 1, true), paper); body.material.side = T.DoubleSide; g.add(body);
    const cap = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 0.05, 8), new T.MeshBasicMaterial({ color: 0x3a2a1a })); cap.position.y = 0.42; g.add(cap);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffb347, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })); glow.scale.set(2.6, 2.6, 1); glow.position.y = 0.1; g.add(glow);
    return g;
  }

  // release a sky lantern in front of you (it drifts up and away, with your wish said above it)
  // `at` is given when somebody else's lantern comes in from the game server: { x, y, z }
  function release(col, wish, at) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), g = lanternMesh(col);
    const lx = at ? at.x : player.x + fx * 1.4, ly = at ? at.y : player.feet + 1.3, lz = at ? at.z : player.z + fz * 1.4;
    g.position.set(lx, ly, lz); scene.add(g);
    if (!at) Online.navalSend({ t: "fest", k: "lantern", c: city, x: +lx.toFixed(1), y: +ly.toFixed(1), z: +lz.toFixed(1), col: Math.max(0, LANT_COLORS.indexOf(col)), w: wish || "" });
    lanterns.push({ g, vy: 1.4 + Math.random() * 0.6, ph: Math.random() * 6, t: 0, dx: (Math.random() - 0.3) * 0.6, dz: (Math.random() - 0.5) * 0.6 });
    while (lanterns.length > 36) { const o = lanterns.shift(); scene.remove(o.g); }
    if (wish) Speech.say({ x: lx, z: lz }, wish, 4);
    if (!at) Sfx.play("coin");
  }
  // set a little clay lamp (a diya) down where you stand; it burns until the festival is over
  function makeDiya(x, z) {
    const g = new T.Group(), bowl = new T.Mesh(new T.CylinderGeometry(0.22, 0.14, 0.12, 10), new T.MeshLambertMaterial({ color: 0xb5593a })); bowl.position.y = 0.06; g.add(bowl);
    const flame = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: 0xffc860, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })); flame.scale.set(1.1, 1.1, 1); flame.position.y = 0.25; g.add(flame);
    g.position.set(x, groundAt(x, z), z); scene.add(g);
    return g;
  }
  function placeDiya() {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), x = player.x + fx * 1.1, z = player.z + fz * 1.1;
    diyas.push(makeDiya(x, z));
    while (diyas.length > 16) scene.remove(diyas.shift());
    Online.navalSend({ t: "fest", k: "diya", c: city, x: +x.toFixed(1), z: +z.toFixed(1) });   // everybody else in the city sees it too
    Sfx.play("coin");
  }

  // lamps and lanterns put down by other players (from the game server): only while the festival is on in this city
  function remote(m) {
    if (m.k === "burst" && scene && m.c === city && (m.f === "floralia" || m.f === "holi")) { spray(m.x, typeof groundAt === "function" ? groundAt(m.x, m.z) : 0, m.z, m.yaw, m.f); return; }      // another player threw flowers or powder nearby
    if (m.k === "hit" && scene) {                                                                                            // ... and it hit you
      const flowers = m.f === "floralia", pal = COLORS[m.f] || COLORS.holi;
      burst(player.x, 1.2, player.z, pal, 14, 4, 1.4, 1.6, false, 3);
      toast(`${flowers ? "🌸" : "🎨"} ${m.n} threw ${flowers ? "flowers" : "colour"} at you!`); Chat.add({ sys: 1, text: `${flowers ? "🌸" : "🎨"} ${m.n} threw ${flowers ? "flowers" : "colour"} at you!` }); Sfx.play("splash");
      return;
    }
    if (!cur || m.c !== city || !isLantern()) return;
    const add = (x, z) => {
      if (rdiyas.some((d) => Math.abs(d.position.x - x) < 0.05 && Math.abs(d.position.z - z) < 0.05)) return;
      rdiyas.push(makeDiya(x, z));
      while (rdiyas.length > 40) scene.remove(rdiyas.shift());
    };
    if (m.t === "diyas") { for (const d of m.list || []) add(d.x, d.z); }
    else if (m.k === "diya") { add(m.x, m.z); toast(`🪔 ${m.n} lit a diya`); }
    else if (m.k === "lantern") release(LANT_COLORS[m.col] || LANT_COLORS[0], m.w, { x: m.x, y: m.y, z: m.z });
  }
  function sync() { if (cur) Online.navalSend({ t: "fest", k: "sync", c: city }); }

  // shoot a burst of coloured powder (Holi) or throw flowers (Floralia) in front of you; people it hits are splashed with colour
  // the burst of flowers or powder itself, from (x, z) facing `yaw` (yours, or another player's that the server tells you about)
  function spray(x, feet, z, yaw, key) {
    const pal = COLORS[key] || COLORS.holi, fx = -Math.sin(yaw), fz = -Math.cos(yaw), flowers = key === "floralia";
    for (let i = 0; i < 28; i++) {
      const sp = 11 + Math.random() * 6, a = (Math.random() - 0.5) * 0.45, c = Math.cos(a), s = Math.sin(a), dx = fx * c - fz * s, dz = fx * s + fz * c;
      const sprite_ = sprite(pal[Math.floor(Math.random() * pal.length)], 0.7 + Math.random() * 0.9, false);
      sprite_.position.set(x + fx * 0.9, feet + 1.5, z + fz * 0.9);
      parts.push({ s: sprite_, vx: dx * sp, vy: 1.5 + Math.random() * 2, vz: dz * sp, life: 1.1, max: 1.1, g: flowers ? 3 : 4.5, op: 0.85 });
    }
    return { pal, fx, fz, flowers };
  }
  function shoot() {
    if (shotCd > 0) return; shotCd = 0.35;
    const { pal, fx, fz, flowers } = spray(player.x, player.feet, player.z, player.yaw, curKey);
    Online.navalSend({ t: "fest", k: "throw", c: city, x: +player.x.toFixed(1), z: +player.z.toFixed(1), yaw: +player.yaw.toFixed(2), f: curKey });   // other players in front of you are hit too, and everyone nearby sees it
    // anyone in front of you within about 14 m is splashed
    const list = typeof city !== "undefined" && city === "delhi" ? (Delhi.built ? Delhi.people() : []) : CITIZENS.list, mesh = city === "delhi" ? Delhi.peopleMesh() : CITIZENS.body;
    list.forEach((p, i) => {
      const dx = p.x - player.x, dz = p.z - player.z, d = Math.hypot(dx, dz);
      if (d > 14 || d < 0.5 || (dx * fx + dz * fz) / d < 0.86) return;
      if (mesh) { mesh.setColorAt(i, new T.Color(pal[Math.floor(Math.random() * pal.length)])); mesh.instanceColor.needsUpdate = true; if (!tinted.includes(i)) tinted.push(i); }
      burst(p.x, 1.2, p.z, pal, 8, 4, 1.2, 1.6, false, 3);
      if (Math.random() < 0.6) Speech.say(p, cur.say[Math.floor(Math.random() * cur.say.length)], 2.6);
      hits++;
    });
    if (hits && hits % 8 === 0) toast(`${cur.icon} ${hits} people splashed with ${flowers ? "flowers" : "colour"}!`);
    Sfx.play("splash");
  }

  function restoreTints() {
    if (!tinted.length) return;
    tinted = []; hits = 0;
    try { if (city === "delhi") { Delhi.setEra(era === "modern"); } else applyCitizensEra(era === "modern", skin); } catch (e) { /* ignore */ }
  }

  function openLantern() {
    openPanel("#lantern");
    const row = document.getElementById("ln-colors"); row.replaceChildren();
    LANT_COLORS.forEach((c, i) => { const b = document.createElement("button"); b.type = "button"; b.className = "sy-sw" + (i === (openLantern.sel || 0) ? " on" : ""); b.style.background = "#" + c.toString(16).padStart(6, "0"); b.setAttribute("aria-label", `colour ${i + 1}`); b.addEventListener("click", () => { openLantern.sel = i; for (const x of row.children) x.classList.remove("on"); b.classList.add("on"); }); row.append(b); });
    document.getElementById("ln-title").textContent = { diwali: "🪔 Make a lantern for Diwali", muertos: "🕯 Light a candle for the Day of the Dead", midautumn: "🏮 Release a lantern for the Mid-Autumn Festival", springfest: "🏮 Release a lantern for the Spring Festival" }[curKey] || "🕯 Light a lantern for Saturnalia";
  }
  function key(k) {
    if (!can(k)) return false;
    if (k === "KeyL") { openLantern(); return true; }
    shoot(); return true;
  }

  function init(sc) {
    scene = sc;
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 1, 32, 32, 30); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.4, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new T.CanvasTexture(c);
    document.getElementById("ln-release").addEventListener("click", () => { const w = document.getElementById("ln-wish").value.replace(/[<>]/g, "").slice(0, 60).trim(); closePanels(); release(LANT_COLORS[openLantern.sel || 0], w); document.getElementById("ln-wish").value = ""; });
    document.getElementById("ln-diya").addEventListener("click", () => { closePanels(); placeDiya(); });
    document.getElementById("fest-act").addEventListener("click", () => { if (curKey === "equinox") { toast("🐍 Walk to El Castillo, the big pyramid, and look at its north stairway: the serpent of light is coming down."); return; } if (mode === "walk" && !panelOpen) key(cur && isLantern() ? "KeyL" : "KeyU"); });
  }

  // ---------------------------------------------------------------- each frame

  function badge() {
    const el = document.getElementById("fest-badge");
    if (!el) return;
    const text = cur ? `${cur.icon} ${cur.name}${curDay.of > 1 ? ` (day ${curDay.n} of ${curDay.of})` : ""}: ${cur.note}` : "";
    if (text !== lastBadge) { lastBadge = text; el.textContent = text; el.title = cur ? `${cur.name}: ${dates(cur)}` : ""; }
  }

  // a festival that is on in another city: you are told once (a few seconds after you arrive somewhere), with a hint on how to get there
  const CITY_NAMES = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún", beijing: "Beijing" };
  function news(dt, c) {
    if (c !== lastCity) { lastCity = c; newsT = 6; }
    newsT -= dt; if (newsT > 0 || mode !== "walk" || typeof started === "undefined" || !started) return;
    newsT = 1e9;
    for (const oc of Object.keys(CITY_NAMES)) {
      if (oc === c) continue;
      const k = find(oc); if (!k || told.has(k)) continue;
      told.add(k); const f = FEASTS[k];
      toast(`${f.icon} ${f.name} is on in ${CITY_NAMES[oc]} (${dates(f)}). Press the city button (Travel) to go there.`);
      return;
    }
    for (const [k, f] of Object.entries(FEASTS)) {                                     // one that starts in the next three days (this city's too)
      const n = startsIn(f); if (!n || n > 3 || told.has(k + "-soon")) continue;
      told.add(k + "-soon");
      toast(`${f.icon} ${f.name} starts ${n === 1 ? "tomorrow" : `in ${n} days`} in ${CITY_NAMES[f.city]} (${dates(f)}).`);
      return;
    }
  }

  function update(dt) {
    if (!scene) return;
    const c = typeof city !== "undefined" ? city : "rome", key = find(c);
    if (key !== curKey) {
      curKey = key; cur = key ? FEASTS[key] : null; curDay = key ? dayOf(key) : { n: 0, of: 0, peak: false };
      for (const [k, g] of Object.entries(deco)) g.visible = k === key;
      for (const l of lanterns.splice(0)) scene.remove(l.g); for (const d of diyas.splice(0)) scene.remove(d); for (const d of rdiyas.splice(0)) scene.remove(d); restoreTints();
      if (typeof Cancun !== "undefined") Cancun.setEquinox(key === "equinox");     // the serpent of light on El Castillo
      if (key) { sync(); build(key).visible = true; toast(`${cur.icon} ${cur.name}${curDay.of > 1 ? `, day ${curDay.n} of ${curDay.of}` : ""}! ${curDay.peak ? "Tonight is the main night. " : ""}${cur.note[0].toUpperCase()}${cur.note.slice(1)}.`); Narrator.say(`${cur.name} is being held today.`, { interrupt: false }); }
      badge();
      const fa = document.getElementById("fest-act"); if (fa) { fa.hidden = !cur; if (cur) fa.textContent = isLantern() ? (curKey === "diwali" ? "🪔 Make a lantern (L)" : curKey === "muertos" ? "🕯 Light a candle (L)" : (curKey === "midautumn" || curKey === "springfest") ? "🏮 Release a lantern (L)" : "🕯 Light a lantern (L)") : curKey === "equinox" ? "🐍 Watch the serpent" : (curKey === "holi" ? "🎨 Shoot colours (U)" : "🌸 Throw flowers (U)"); }
    }
    news(dt, c);
    if (!cur) { for (const p of parts.splice(0)) { scene.remove(p.s); p.s.material.dispose(); } return; }
    shotCd = Math.max(0, shotCd - dt);
    for (let i = lanterns.length - 1; i >= 0; i--) {   // sky lanterns drift up and away
      const l = lanterns[i]; l.t += dt; l.vy = Math.min(3.4, l.vy + dt * 0.04);
      l.g.position.x += (l.dx + Math.sin(l.t * 0.6 + l.ph) * 0.4) * dt; l.g.position.z += (l.dz + Math.cos(l.t * 0.5 + l.ph) * 0.4) * dt; l.g.position.y += l.vy * dt;
      l.g.children[2].material.opacity = Math.max(0, Math.min(1, (190 - l.g.position.y) / 60));
      if (l.g.position.y > 200) { scene.remove(l.g); lanterns.splice(i, 1); }
    }
    for (const d of diyas.concat(rdiyas)) d.children[1].scale.setScalar(1.0 + Math.sin(clock * 9 + d.position.x) * 0.12);
    if (curKey === "diwali" && deco.diwali && deco.diwali.userData.flames) deco.diwali.userData.flames.opacity = 0.78 + Math.sin(clock * 7) * 0.14;        // (the rows of lamps flicker)
    clock += dt;
    // people wish you well
    sayT -= dt;
    if (sayT <= 0 && typeof Speech !== "undefined" && (mode === "walk" || mode === "drive")) {
      sayT = 7 + Math.random() * 7;
      const list = c === "delhi" ? (Delhi.built ? Delhi.people() : []) : (typeof CITIZENS !== "undefined" ? CITIZENS.list : []);
      let best = null, bd = 22;
      for (const p of list) { const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < bd && Math.random() < 0.4) { best = p; bd = d; } }
      if (best) Speech.say(best, cur.say[Math.floor(Math.random() * cur.say.length)], 3);
    }
    // fireworks at night on Diwali (more of them on its main night) and the Spring Festival; clouds of powder all day on Holi
    if ((curKey === "diwali" || curKey === "springfest") && (Time.isNight || Time.hour > 18)) {
      boomT -= dt;
      if (boomT <= 0) {
        boomT = (curDay.peak ? 0.8 : 2.2) + Math.random() * (curDay.peak ? 1.4 : 3);
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
    init, update, FEASTS, key, release, shoot, remote, sync, find, dates, dayOf, startsIn,
    get day() { return curDay; },
    get active() { return !!cur; },
    get id() { return curKey; },
    get name() { return cur ? cur.name : ""; },
    get foodMul() { return cur ? 0.75 : 1; },       // food costs a quarter less
    get payMul() { return cur ? 1.25 : 1; },        // jobs pay a quarter more
    line: () => (cur ? cur.say[Math.floor(Math.random() * cur.say.length)] : null),
  };
})();
