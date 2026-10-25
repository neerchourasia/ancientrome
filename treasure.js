"use strict";
// The day's gold coins: every morning ten gold coins glint around the city you are in (each with a tall golden light, so you can see it from far away),
// some close to the sights and some a little off the beaten path. Walk (or drive) over one to pick it up. Find all ten for a bonus. The coins are
// different in each city and each era, and new ones appear every day of the game. Saved in the browser. Depends on physics.js, home.js (Time) and vitals.js.

const Treasure = (() => {
  const T = THREE;
  const KEY = "rome-treasure", COUNT = 10, BONUS = 100;
  const root = new T.Group();
  const goldMat = new T.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x6b4a00 }), beamMat = new T.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.22, depthWrite: false });
  const coinGeo = new T.CylinderGeometry(0.55, 0.55, 0.1, 18), beamGeo = new T.CylinderGeometry(0.25, 0.25, 14, 8, 1, true);
  let coins = [], builtKey = "", got = {}, added = false, told = "";
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && typeof v === "object") got = v; } catch (e) { /* storage unavailable */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(got)); } catch (e) { /* ignore */ } };
  const keyNow = () => `${city}-${era}-${Math.floor(Time.day)}`;
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function build(key) {
    for (const c of coins) root.remove(c.g);
    coins = []; builtKey = key;
    const rnd = seeded(key), lms = (typeof LANDMARKS !== "undefined" ? LANDMARKS : []).filter((l) => !l.home);
    const done = got[key] || [];
    for (let tries = 0; tries < 400 && coins.length < COUNT; tries++) {
      const l = lms.length && rnd() < 0.7 ? lms[Math.floor(rnd() * lms.length)] : null, a = rnd() * Math.PI * 2, d = 12 + rnd() * 90;
      const x = l ? l.x + Math.cos(a) * d : BOUNDS.minX + 60 + rnd() * (BOUNDS.maxX - BOUNDS.minX - 120), z = l ? l.z + Math.sin(a) * d : BOUNDS.minZ + 60 + rnd() * (BOUNDS.maxZ - BOUNDS.minZ - 120);
      const value = 15 + Math.floor(rnd() * 26);
      if (x < BOUNDS.minX + 30 || x > BOUNDS.maxX - 30 || z < BOUNDS.minZ + 30 || z > BOUNDS.maxZ - 30) continue;
      const y = groundAt(x, z);
      if (y < -0.2 || y > 4 || blockedAt(x, z, y) || blockedAt(x, z, y + 1)) continue;
      if (coins.some((c) => Math.hypot(c.x - x, c.z - z) < 40)) continue;
      const g = new T.Group(), coin = new T.Mesh(coinGeo, goldMat), beam = new T.Mesh(beamGeo, beamMat);
      coin.rotation.x = Math.PI / 2; coin.position.y = 1.1; beam.position.y = 7; g.add(coin, beam); g.position.set(x, y, z);
      g.visible = !done.includes(coins.length);
      root.add(g);
      coins.push({ g, coin, x, z, y, value, taken: done.includes(coins.length) });
    }
  }
  const left = () => coins.filter((c) => !c.taken).length;

  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    if (!added && typeof scene !== "undefined") { scene.add(root); added = true; }
    const key = keyNow();
    if (key !== builtKey) {
      for (const k of Object.keys(got)) if (k !== key) delete got[k];                                // only today's coins are remembered
      build(key);
      if (told !== key && coins.length && left()) { told = key; toast(`Gold coins glint around the city today: find all ${coins.length} for a bonus!`); }
    }
    const t = performance.now() / 1000, walking = mode === "walk" || (mode === "drive" && !(typeof Car !== "undefined" && Car.airborne));
    for (const c of coins) {
      if (c.taken) continue;
      c.coin.position.y = 1.1 + Math.sin(t * 2 + c.x) * 0.15; c.coin.rotation.z += dt * 2;
      if (!walking || Math.hypot(player.x - c.x, player.z - c.z) > 2.2 || Math.abs(player.feet - c.y) > 3) continue;
      c.taken = true; c.g.visible = false;
      (got[key] = got[key] || []).push(coins.indexOf(c)); save();
      Vitals.coins += c.value; Sfx.play("coin");
      if (!left()) { Vitals.coins += BONUS; toast(`The last gold coin! +${c.value}, and a bonus of ${BONUS} denarii for finding all ${coins.length} today.`); }
      else toast(`A gold coin! +${c.value} denarii (${left()} more today).`);
    }
  }

  return { update, get left() { return left(); }, debug: () => coins.map((c) => ({ x: c.x, z: c.z, taken: c.taken, value: c.value })) };
})();
