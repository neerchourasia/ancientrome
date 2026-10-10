"use strict";
// The passing of time, and your house. A day lasts a few minutes, and when night falls you go home to sleep.
// Depends on world.js (frame, materials) and physics.js. Saved in the browser between visits.

const Time = (() => {
  const KEY = "rome-time";
  const DAY_SECONDS = 1200; // one full day, in real seconds (20 minutes, so one hour is 50 seconds)
  const s = { hour: 9, day: 1 };
  let saveT = 0;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && Number.isFinite(v.hour) && Number.isFinite(v.day)) { s.hour = ((v.hour % 24) + 24) % 24; s.day = Math.max(1, Math.floor(v.day)); }
  } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } };
  const PRESETS = [8, 12, 18, 22]; // the T key jumps to the next of these

  return {
    get hour() { return s.hour; },
    get day() { return s.day; },
    get isNight() { return s.hour >= 20.5 || s.hour < 5.5; },
    get bedtime() { return s.hour >= 20 || s.hour < 5; }, // late enough to sleep
    get late() { return s.hour >= 22.5 || s.hour < 4; }, // you should really be in bed
    get exhausted() { return s.hour >= 4 && s.hour < 6.5; }, // you collapse from tiredness (from 4 am until the usual dawn wake-up time)
    DAY_SECONDS,
    advance(dt) {
      s.hour += (dt * 24) / DAY_SECONDS;
      if (s.hour >= 24) { s.hour -= 24; s.day++; }
      saveT += dt;
      if (saveT > 3) { saveT = 0; save(); }
    },
    setClock(h, d) { s.hour = ((h % 24) + 24) % 24; s.day = Math.max(1, Math.floor(d)); save(); },
    set(h) { s.hour = ((h % 24) + 24) % 24; save(); },
    nextPreset() {
      const h = s.hour;
      let n = PRESETS.find((p) => p > h + 0.05);
      const wraps = n === undefined; // past the last preset: on to the next morning
      if (wraps) n = PRESETS[0];
      // Skipping through the night without sleeping: you stay up until 4 am, then collapse.
      if (h < 4 || (wraps && h >= 4)) { if (wraps) s.day++; s.hour = 4; save(); return 4; }
      s.hour = n; save(); return n;
    },
    // Sleeping through the night: wake at dawn on the next morning.
    wake() { if (s.hour >= 12) s.day++; s.hour = 6.5; save(); },
    label() {
      const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60 / 5) * 5;
      return `Day ${s.day} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} · ${phaseName(s.hour)}`;
    },
  };
})();

// Your house (a small domus): a room with a bed, a table and a lamp, just south of the Via Sacra beside the Colosseum road.
const Home = (() => {
  const X = 255, Z = 50, W = 12, D = 10; // centre and size, in metres
  let glass = null, lamp = null, lit = false;

  const inside = (x, z) => Math.abs(x - X) < W / 2 - 0.4 && Math.abs(z - Z) < D / 2 - 0.4;

  function build() {
    const F = frame(X, Z, 2); // front (with the door) faces north, toward the road
    const wall = M.travertine, wood = lambert(0x6b4a2b), linen = lambert(0xf0e8d6), red = lambert(0x9c3a2e);
    const H = 4, t = 0.5;

    // floor, walls with a doorway, lintel, roof
    F.box(0, 0, 0, W, 0.15, D, lambert(0xb9a17c, { map: stoneTex("#ffffff") }), { walk: true, map: "#c9a878" });
    F.box(-W / 2 + t / 2, 0, 0, t, H, D, wall, { solid: true });
    F.box(W / 2 - t / 2, 0, 0, t, H, D, wall, { solid: true });
    F.box(0, 0, -D / 2 + t / 2, W, H, t, wall, { solid: true });
    const seg = (W - 2.4) / 2;
    for (const sx of [-1, 1]) F.box(sx * (1.2 + seg / 2), 0, D / 2 - t / 2, seg, H, t, wall, { solid: true });
    F.box(0, 2.8, D / 2 - t / 2, 2.4, H - 2.8, t, wall);
    F.box(0, H, 0, W + 1.2, 0.45, D + 1.2, M.roof);
    F.box(0, H + 0.45, 0, W + 0.4, 0.5, D + 0.4, M.roof);
    F.stairs(0, D / 2, 2.4, 1, 0.15, 0.7, M.marble2); // a doorstep

    // a sign over the door
    const plaque = canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = "#3a2a1a"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#d9b44a"; g.lineWidth = 4; g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = "#f3d98a"; g.font = "bold 34px serif"; g.textAlign = "center"; g.fillText("DOMUS MEA", w / 2, 44);
    });
    const sign = new T.Mesh(new T.PlaneGeometry(2.4, 0.6), new T.MeshBasicMaterial({ map: plaque }));
    sign.position.set(0, 3.4, D / 2 + 0.02); F.add(sign);

    // windows that glow at night
    glass = new T.MeshBasicMaterial({ color: 0x5a4a30 });
    for (const [wx, wz, ry] of [[-3.6, D / 2 + 0.02, 0], [3.6, D / 2 + 0.02, 0], [-3, -D / 2 - 0.02, Math.PI], [3, -D / 2 - 0.02, Math.PI]]) {
      const w = new T.Mesh(new T.PlaneGeometry(1.1, 1.2), glass);
      w.position.set(wx, 2.1, wz); w.rotation.y = ry; F.add(w);
    }

    // furniture, all inside the walls
    F.box(-3.6, 0.15, -3.1, 2.2, 0.5, 3.2, wood, { walk: true });           // bed frame
    F.box(-3.6, 0.65, -3.0, 2.0, 0.25, 3.0, linen);                          // mattress
    F.box(-3.6, 0.9, -2.2, 2.0, 0.08, 1.7, red);                             // blanket
    F.box(-3.6, 0.9, -4.3, 1.4, 0.18, 0.6, linen);                           // pillow
    F.box(3.6, 0.15, -3.4, 2.4, 0.9, 1.2, wood, { walk: true });             // chest
    F.box(2.2, 0.15, 1.2, 1.6, 0.9, 1.0, wood, { walk: true });              // table
    F.cyl(2.2, 1.05, 1.2, 0.12, 0.28, M.bronze);                             // oil lamp on the table
    const flame = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), new T.MeshBasicMaterial({ color: 0xffd27a }));
    flame.position.set(2.2, 1.45, 1.2); F.add(flame);
    F.cyl(-4.9, 0.15, 3.7, 0.3, 0.8, lambert(0xa5552f));                      // amphora
    F.box(0, 0.16, -0.5, 3.2, 0.03, 2.4, red, { cast: false });              // rug

    const [lx, lz] = F.toW(2.2, 1.2);
    lamp = new T.PointLight(0xffc477, 0.3, 17);
    lamp.position.set(lx, F.y + 3, lz);
    worldScene.add(lamp);
  }

  // Brighten the windows and the room after dark.
  function update(night) {
    if (!glass) return;
    const on = night > 0.4;
    if (on !== lit) { lit = on; glass.color.setHex(on ? 0xffd27a : 0x5a4a30); }
    lamp.intensity = 0.25 + night * 1.0;
  }

  return { X, Z, W, D, inside, build, update };
})();
