"use strict";
// The festival hunt. While a festival is on in the city you are in (Floralia, Saturnalia, Diwali, Holi, the Equinox of Kukulcán, Día de Muertos) eight festival tokens (glowing lanterns in the
// colours of the feast, each with a tall beam of light) are hidden round the city, near the sights. Walk over one to take it: 15 denarii each, and 100 more for all eight. A new set is hidden every
// twenty minutes of real time while the festival lasts. Kept in the browser. Depends on festival.js (Festival.active, Festival.id, Festival.name), home.js (Time) and the globals of game.js.

const FestHunt = (() => {
  const T = THREE;
  const KEY = "rome-festhunt", COUNT = 8, EACH = 15, BONUS = 100, REACH = 2.4;
  const TINT = { floralia: 0xf28fb0, saturnalia: 0xc0262b, diwali: 0xffb347, holi: 0xe23b8a, equinox: 0x2f8f4a, muertos: 0xf29a1b, midautumn: 0xffd36b, springfest: 0xd8262b };
  const group = new T.Group();
  let set = [], builtKey = "", got = {}, added = false;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") got = v; } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(got)); } catch (e) { /* ignore */ } };
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const keyNow = () => (Festival.active ? `${city}-${Festival.id}-${Payroll.epoch()}` : "");

  function build(key) {
    group.clear(); set = []; builtKey = key; if (!key) return;
    const col = TINT[Festival.id] || 0xffd45a, rnd = seeded(key), mat = new T.MeshBasicMaterial({ color: col }), beam = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25, depthWrite: false });
    const lms = LANDMARKS.filter((l) => !l.home && !l.game && l.stand);
    for (let n = 0, tries = 0; n < COUNT && tries < 200 && lms.length; tries++) {
      const l = lms[Math.floor(rnd() * lms.length)], a = rnd() * Math.PI * 2, d = 8 + rnd() * 22, x = l.stand[0] + Math.cos(a) * d, z = l.stand[1] + Math.sin(a) * d;
      if (x < BOUNDS.minX + 8 || x > BOUNDS.maxX - 8 || z < BOUNDS.minZ + 8 || z > BOUNDS.maxZ - 8 || blockedAt(x, z, groundAt(x, z)) || set.some((s) => Math.hypot(s.x - x, s.z - z) < 20)) continue;
      const g = new T.Group(), body = new T.Mesh(new T.OctahedronGeometry(0.5), mat), b = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 16, 8, 1, true), beam);
      body.position.y = 1.2; b.position.y = 8; g.add(body, b); g.position.set(x, groundAt(x, z), z); group.add(g);
      set.push({ x, z, g, body, i: n }); n++;
    }
  }
  const taken = (key) => (Array.isArray(got[key]) ? got[key] : []);

  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    if (!added) { scene.add(group); added = true; }
    const key = keyNow();
    if (key !== builtKey) build(key);
    group.visible = !!key;
    if (!key) return;
    const have = taken(key), t = performance.now() / 1000;
    for (const s of set) {
      const done = have.includes(s.i); s.g.visible = !done;
      if (done) continue;
      s.body.rotation.y += dt * 1.6; s.body.position.y = 1.2 + Math.sin(t * 2 + s.i) * 0.2;
      if ((mode === "walk" || mode === "drive") && Math.hypot(player.x - s.x, player.z - s.z) < REACH) {
        have.push(s.i); got[key] = have; save(); Vitals.coins += EACH; Sfx.play("coin");
        if (have.length >= COUNT) { Vitals.coins += BONUS; Sfx.play("medal"); toast(`🎊 All ${COUNT} festival tokens found! +${EACH + BONUS} denarii. Happy ${Festival.name}!`); }
        else toast(`🎊 A festival token: ${have.length} of ${COUNT} (+${EACH} denarii)`);
        for (const k of Object.keys(got)) if (k !== key && Object.keys(got).length > 12) delete got[k];      // (keep the saved list short)
        break;
      }
    }
  }
  return { update, get found() { return Object.values(got).filter((a) => Array.isArray(a) && a.length >= COUNT).length; }, _set: () => set, _key: keyNow };
})();
