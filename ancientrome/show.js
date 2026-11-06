"use strict";
// The Colosseum programme for spectators: animal hunt (venatio) and staged myth dramas.
// Also provides the animal models used by the playable hunt.

const Animals = (() => {
  const box = (parent, w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
    parent.add(m);
    return m;
  };
  const leg = (g, mat, x, y, z, w, h) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    box(p, w, h, w, mat, 0, -h / 2, 0);
    g.add(p);
    return p;
  };

  // Every animal faces +z. `legs` are pivots that the show animates while it moves.
  function make(kind, def = {}) {
    const g = new THREE.Group(), legs = [];
    if (kind === "deer") {
      const fur = lambert(0xb98c5a), light = lambert(0xe6d3b0), dark = lambert(0x3a2a1c);
      box(g, 0.4, 0.5, 1.1, fur, 0, 0.95, 0);
      const neck = box(g, 0.16, 0.55, 0.16, fur, 0, 1.4, 0.55); neck.rotation.x = 0.4;
      box(g, 0.17, 0.2, 0.34, fur, 0, 1.7, 0.75);
      box(g, 0.05, 0.3, 0.05, dark, -0.06, 1.95, 0.7); box(g, 0.05, 0.3, 0.05, dark, 0.06, 1.95, 0.7);
      box(g, 0.14, 0.12, 0.1, light, 0, 0.98, -0.6);
      for (const [x, z] of [[-0.13, 0.4], [0.13, 0.4], [-0.13, -0.4], [0.13, -0.4]]) legs.push(leg(g, fur, x, 0.72, z, 0.08, 0.72));
    } else if (kind === "ostrich") {
      const dark = lambert(0x232323), skin = lambert(0xd9b872), white = lambert(0xf0ece0);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), dark); body.scale.set(1, 0.9, 1.35); body.position.set(0, 1.15, 0); body.castShadow = true; g.add(body);
      box(g, 0.1, 0.9, 0.1, skin, 0, 1.75, 0.4);
      box(g, 0.14, 0.14, 0.2, skin, 0, 2.25, 0.46);
      box(g, 0.05, 0.05, 0.14, lambert(0xd07a3a), 0, 2.22, 0.62);
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), white); tail.position.set(0, 1.2, -0.65); g.add(tail);
      for (const x of [-0.13, 0.13]) legs.push(leg(g, skin, x, 1.0, 0.0, 0.07, 1.0));
    } else if (kind === "boar") {
      const fur = lambert(0x4a3d33), tusk = lambert(0xf0ead8);
      box(g, 0.85, 0.75, 1.5, fur, 0, 0.7, 0);
      box(g, 0.5, 0.5, 0.6, fur, 0, 0.75, 1.0);
      box(g, 0.25, 0.22, 0.3, lambert(0x6a5646), 0, 0.65, 1.42);
      box(g, 0.05, 0.05, 0.22, tusk, -0.14, 0.58, 1.5); box(g, 0.05, 0.05, 0.22, tusk, 0.14, 0.58, 1.5);
      box(g, 0.1, 0.16, 1.2, lambert(0x2c231c), 0, 1.15, 0);
      for (const [x, z] of [[-0.3, 0.55], [0.3, 0.55], [-0.3, -0.55], [0.3, -0.55]]) legs.push(leg(g, fur, x, 0.45, z, 0.16, 0.45));
    } else if (kind === "bear") {
      const fur = lambert(0x5b3f2a), snout = lambert(0x8a6a4a);
      box(g, 1.1, 1.0, 1.7, fur, 0, 1.05, 0);
      box(g, 0.9, 0.5, 0.6, fur, 0, 1.6, 0.35);
      box(g, 0.55, 0.5, 0.6, fur, 0, 1.25, 1.2);
      box(g, 0.3, 0.25, 0.3, snout, 0, 1.15, 1.55);
      for (const x of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), fur); e.position.set(x, 1.55, 1.05); g.add(e); }
      for (const [x, z] of [[-0.4, 0.6], [0.4, 0.6], [-0.4, -0.6], [0.4, -0.6]]) legs.push(leg(g, fur, x, 0.7, z, 0.28, 0.7));
    } else { // lion
      return { ...Fight.makeLion({ color: 0xc8963e, plume: 0x6b4a1e, ...def }), legs, kind };
    }
    g.traverse((c) => { c.frustumCulled = false; });
    return { g, arm: new THREE.Group(), shieldG: new THREE.Group(), mats: [g.children[0].material], legs, kind };
  }

  return { make };
})();

const Show = (() => {
  const CX = ARENA.cx, CZ = ARENA.cz, AX = ARENA.ax * 0.88, AZ = ARENA.az * 0.88;
  let scene, group = null, act = null, t = 0, done = false, sub = "", items = [], props = [], state = {}, focusPos = { x: CX, z: CZ };
  const R = (a, b) => a + Math.random() * (b - a);
  const box = (parent, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  function init(sc) { scene = sc; }

  function inside(o, k = 1) {
    const e = ((o.x - CX) / (AX * k)) ** 2 + ((o.z - CZ) / (AZ * k)) ** 2;
    if (e <= 1) return false;
    const s = 1 / Math.sqrt(e);
    o.x = CX + (o.x - CX) * s; o.z = CZ + (o.z - CZ) * s;
    return true;
  }

  // ---------- props ----------

  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    box(g, 0.4 * s, 3 * s, 0.4 * s, lambert(0x5c4630), 0, 1.5 * s, 0);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.5 * s, 8, 6), lambert(0x4f7a3a));
    crown.position.y = 3.6 * s; crown.scale.y = 0.85; crown.castShadow = true;
    g.add(crown);
    group.add(g);
    props.push({ g, sway: Math.random() * 6 });
  }

  function rock(x, z) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(R(0.7, 1.3), 0), lambert(0x8a8478));
    m.position.set(x, 0.5, z); m.rotation.set(R(0, 3), R(0, 3), 0); m.castShadow = true;
    group.add(m);
  }

  function mound(x, z, r, h) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), lambert(0x6f8a4a));
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // ---------- performers ----------

  function actor(look, x, z) {
    const m = Fight.makeFoe(look);
    m.arm.visible = false; m.shieldG.visible = false; // no weapons for the stage
    m.g.position.set(x, 0, z);
    group.add(m.g);
    const a = { m, g: m.g, x, z, y: 0, hd: 0, kind: "actor", phase: Math.random() * 6 };
    items.push(a);
    return a;
  }

  function animal(kind, x, z, o = {}) {
    const a = Animals.make(kind);
    a.g.position.set(x, 0, z);
    group.add(a.g);
    const it = { m: a, g: a.g, x, z, y: 0, hd: R(0, 6.28), sp: 0, kind, phase: Math.random() * 6, fall: 0, lay: 0, ...o };
    items.push(it);
    return it;
  }

  function place(it) {
    it.g.position.set(it.x, it.y || 0, it.z);
    it.g.rotation.y = it.hd;
    if (it.m.legs && it.m.legs.length) {
      const swing = Math.min(1, (it.sp || 0) / 3);
      it.phase += (it.sp || 0) * 0.12;
      it.m.legs.forEach((l, i) => { l.rotation.x = Math.sin(it.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.5 : 0)) * 0.7 * swing; });
    }
  }

  function step(it, dt, speed, hd) {
    if (hd !== undefined) it.hd = hd;
    it.sp = speed;
    it.x += Math.sin(it.hd) * speed * dt;
    it.z += Math.cos(it.hd) * speed * dt;
  }
  const bearing = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
  const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
  const turnTo = (a, target, dt, rate = 6) => { a.hd += angDiff(a.hd, target) * Math.min(1, dt * rate); };

  // Falling over (used when an animal is brought down or lies down to rest).
  function lie(it, dt, amount = 1) {
    it.lay = Math.min(1, it.lay + dt * 1.8);
    it.g.rotation.z = it.lay * amount * (Math.PI / 2);
    it.y = it.lay * amount * 0.35;
  }

  // ---------- acts ----------

  const ACTS = {
    // Animal hunt: venatores chase a boar, a bear and a lion among staged trees, while deer and ostriches scatter.
    hunt: {
      dur: 60,
      setup() {
        for (let i = 0; i < 7; i++) { const a = R(0, 6.28), r = R(0.35, 0.8); tree(CX + Math.cos(a) * AX * r, CZ + Math.sin(a) * AZ * r, R(0.8, 1.2)); }
        for (let i = 0; i < 5; i++) { const a = R(0, 6.28), r = R(0.3, 0.85); rock(CX + Math.cos(a) * AX * r, CZ + Math.sin(a) * AZ * r); }
        for (let i = 0; i < 5; i++) animal("deer", CX + R(-15, 15), CZ + R(-10, 10), { small: true });
        for (let i = 0; i < 2; i++) animal("ostrich", CX + R(-15, 15), CZ + R(-10, 10), { small: true });
        state.big = [animal("boar", CX + 14, CZ - 6), animal("bear", CX + 16, CZ + 4), animal("lion", CX + 8, CZ + 12)];
        state.big.forEach((b) => { b.hd = R(0, 6.28); });
        state.names = ["a wild boar", "a bear", "a lion"];
        state.hunters = [0, 1].map((i) => { const h = actor({ color: 0x6b4a2a, plume: 0x2b5fa8 }, CX - 20, CZ + (i ? 5 : -5)); h.m.arm.visible = true; return h; });
        state.tgt = 0; state.engage = 0; state.finish = 0;
        sub = "The morning begins with a venatio, a staged animal hunt among painted trees and rocks.";
      },
      tick(dt) {
        const hunters = state.hunters;
        // small animals wander and scatter from the hunters
        for (const it of items) {
          if (!it.small) continue;
          const near = hunters.reduce((b, h) => (dist(it, h) < dist(it, b) ? h : b), hunters[0]);
          const d = dist(it, near);
          if (d < 9) { turnTo(it, bearing(it, near) + Math.PI, dt, 5); step(it, dt, 6.5); }
          else { it.hd += (Math.random() - 0.5) * dt * 3; step(it, dt, 1.8); }
          if (inside(it, 0.95)) it.hd += Math.PI * 0.6;
        }
        const B = state.big[state.tgt];
        state.big.forEach((b, i) => {
          if (b.fall) { b.sp = 0; lie(b, dt); return; }
          if (b !== B) { b.hd += (Math.random() - 0.5) * dt * 2; step(b, dt, 0.8); if (inside(b, 0.95)) b.hd += Math.PI * 0.6; }
        });
        if (B && !B.fall) {
          state.engage += dt;
          // the animal charges the nearest hunter in bursts, the hunters circle it with spears
          const h = hunters.reduce((a, c) => (dist(B, c) < dist(B, a) ? c : a), hunters[0]);
          const charge = (state.engage % 3) < 1.0;
          turnTo(B, bearing(B, h), dt, 5);
          if (charge && dist(B, h) > 2.2) step(B, dt, 7); else if (dist(B, h) < 3.5) step(B, dt, 0); else step(B, dt, 1.5);
          hunters.forEach((hu, i) => {
            const ang = bearing(B, hu) + (i ? 0.6 : -0.6) * dt;
            const want = 5 - Math.min(2.5, state.engage * 0.3);
            const target = { x: B.x + Math.sin(bearing(B, hu) + (i ? 0.9 : -0.9)) * -want * -1, z: B.z + Math.cos(bearing(B, hu) + (i ? 0.9 : -0.9)) * -want * -1 };
            if (dist(hu, target) > 0.8) { turnTo(hu, bearing(hu, target), dt, 7); step(hu, dt, 4.2); } else { hu.sp = 0; }
            hu.hd = bearing(hu, B);
            hu.m.arm.rotation.x = -0.9 + Math.sin(state.engage * 5 + i * 2) * 0.5;
          });
          sub = `The venatores face ${state.names[state.tgt]}.`;
          if (state.engage > 9) {
            B.fall = 1; state.tgt++; state.engage = 0;
            sub = state.tgt < 3 ? "The crowd cheers as the hunters bring the beast down." : "The hunt is over. The arena is cleared for the next act.";
          }
        } else if (state.tgt >= 3) { state.finish += dt; hunters.forEach((h) => { h.sp = 0; h.m.arm.rotation.x = 1.8; }); if (state.finish > 4) done = true; }
        for (const hu of hunters) { inside(hu, 0.95); }
        for (const b of state.big) inside(b, 0.95);
        focusPos = B ? { x: B.x, z: B.z } : { x: CX, z: CZ };
      },
    },

    // Drama: Orpheus charms the beasts with his lyre.
    orpheus: {
      dur: 40,
      setup() {
        mound(CX, CZ, 5, 1.6);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + 0.3; tree(CX + Math.cos(a) * AX * 0.8, CZ + Math.sin(a) * AZ * 0.8, 1.1); }
        const o = actor({ color: 0xd9c9a0, plume: 0xd8b03a }, CX, CZ);
        o.y = 1.5; o.kind = "orpheus";
        const lyre = new THREE.Group();
        box(lyre, 0.5, 0.06, 0.06, lambert(0xdcb444), 0, 0.5, 0); box(lyre, 0.05, 0.5, 0.05, lambert(0xdcb444), -0.22, 0.25, 0); box(lyre, 0.05, 0.5, 0.05, lambert(0xdcb444), 0.22, 0.25, 0);
        box(lyre, 0.3, 0.25, 0.08, lambert(0x7a5230), 0, 0.02, 0);
        lyre.position.set(0.3, 1.05, 0.4); lyre.rotation.x = -0.3;
        o.g.add(lyre);
        const kinds = ["lion", "bear", "boar", "deer", "deer", "deer", "ostrich"];
        state.guests = kinds.map((k, i) => {
          const a = (i / kinds.length) * 6.28 + 0.5;
          const g = animal(k, CX + Math.cos(a) * AX * 0.9, CZ + Math.sin(a) * AZ * 0.9);
          g.slot = { x: CX + Math.cos(a) * (6.5 + (i % 2) * 2), z: CZ + Math.sin(a) * (6.5 + (i % 2) * 2) };
          g.seated = false;
          return g;
        });
        state.orpheus = o;
        sub = "A drama from the myths: Orpheus, the legendary singer of Thrace, plays his lyre.";
      },
      tick(dt) {
        const o = state.orpheus;
        o.g.rotation.y = 0.4 * Math.sin(t * 0.5);
        for (const g of state.guests) {
          if (!g.seated) {
            const d = dist(g, g.slot);
            if (d > 0.5) { turnTo(g, bearing(g, g.slot), dt, 4); step(g, dt, Math.min(3.2, 1 + d * 0.3)); } else { g.seated = true; g.sp = 0; }
          } else { g.hd += angDiff(g.hd, bearing(g, o)) * Math.min(1, dt * 3); lie(g, dt, g.kind === "deer" || g.kind === "ostrich" ? 0.5 : 0.6); }
        }
        if (t > 8) sub = "Even wild beasts come to listen, tamed and spellbound by the music.";
        if (t > 24) sub = "Stage machinery, hidden trapdoors and trained animals made such scenes possible.";
        if (t > 34) sub = "The crowd applauds.";
        if (t > 40) done = true;
      },
    },

    // Drama: Daedalus builds wings for Icarus, who flies over the arena on stage machinery.
    icarus: {
      dur: 34,
      setup() {
        for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.8; tree(CX + Math.cos(a) * AX * 0.85, CZ + Math.sin(a) * AZ * 0.85, 1); }
        const d = actor({ color: 0x8a6a2b, plume: 0x5a3a22 }, CX - 16, CZ + 9);
        const ic = actor({ color: 0xe8e0c8, plume: 0xd8b03a }, CX - 10, CZ + 6);
        // wings (feathers and wax)
        const wingMat = lambert(0xf4efe0);
        ic.wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.3, 1.5, -0.2); box(w, 2.2, 0.05, 0.8, wingMat, s * 1.1, 0, 0); ic.g.add(w); return w; });
        // hoist wire
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 12, 4), lambert(0x333333));
        wire.position.y = 7.5; ic.g.add(wire); ic.wire = wire;
        state.d = d; state.ic = ic;
        sub = "Daedalus, the master craftsman of Crete, builds wings of feathers and wax for his son Icarus.";
      },
      tick(dt) {
        const { d, ic } = state;
        d.hd = bearing(d, ic);
        d.m.arm.visible = true; d.m.arm.rotation.x = 2.6 + Math.sin(t * 4) * 0.3;
        const u = Math.max(0, Math.min(1, (t - 6) / 22)); // flight progress
        const s = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        ic.x = CX - 10 + s * 22; ic.z = CZ + 6 - s * 10 + Math.sin(u * 6.28) * 3;
        ic.y = u <= 0 ? 0 : 0.2 + 9 * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.7;
        ic.hd = 1.4; // facing across the arena
        const flap = u > 0 && u < 1 ? Math.sin(t * 7) * 0.5 : 0.15;
        ic.wings[0].rotation.z = flap; ic.wings[1].rotation.z = -flap;
        ic.wire.visible = u > 0 && u < 1;
        if (t > 4 && t < 6.2) sub = "Icarus takes flight over the labyrinth.";
        if (t > 8) sub = "Roman stage machinery, cranes and pulleys, could lift actors high above the arena.";
        if (t > 22) sub = "He glides safely back to the stage to the applause of the crowd.";
        if (t > 32) done = true;
        focusPos = { x: ic.x, z: ic.z };
      },
    },

    // Drama: Hercules wrestles the Nemean Lion.
    hercules: {
      dur: 34,
      setup() {
        rock(CX - 18, CZ - 12); rock(CX + 18, CZ + 12);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.4; tree(CX + Math.cos(a) * AX * 0.85, CZ + Math.sin(a) * AZ * 0.85, 1); }
        const h = actor({ color: 0xb0703a, plume: 0x8a5a2b }, CX - 6, CZ);
        const cape = box(h.g, 0.7, 1.0, 0.08, lambert(0xd8b03a), 0, 1.3, -0.32); cape.rotation.x = 0.15;
        const club = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.3, 8), lambert(0x6b4a2a));
        club.position.set(0.55, 1.3, 0.3); club.rotation.x = -0.5; h.g.add(club);
        const lion = animal("lion", CX + 6, CZ);
        state.h = h; state.lion = lion;
        sub = "Hercules must slay the Nemean Lion, whose hide no weapon can pierce.";
      },
      tick(dt) {
        const { h, lion } = state;
        const cx = CX, cz = CZ;
        if (t < 8) { // circling each other
          const a = t * 0.5;
          h.x = cx + Math.cos(a) * 6; h.z = cz + Math.sin(a) * 5;
          lion.x = cx + Math.cos(a + Math.PI) * 6; lion.z = cz + Math.sin(a + Math.PI) * 5;
          h.hd = bearing(h, lion); lion.hd = bearing(lion, h); lion.sp = 3; h.sp = 0;
        } else if (t < 18) { // grappling
          const jitter = Math.sin(t * 9) * 0.25;
          h.x = cx - 0.9 + jitter; h.z = cz; lion.x = cx + 0.9 - jitter; lion.z = cz + Math.sin(t * 7) * 0.3;
          h.hd = bearing(h, lion); lion.hd = bearing(lion, h); lion.sp = 0;
          h.g.rotation.z = Math.sin(t * 8) * 0.08;
        } else { // the lion yields and Hercules stands victorious
          h.g.rotation.z = 0; h.hd = bearing(h, lion); lie(lion, dt, 0.9);
          h.m.arm.visible = true; h.m.arm.rotation.x = 2.9;
        }
        if (t > 6) sub = "He wrestles the beast bare-handed, and wins.";
        if (t > 20) sub = "Hercules wears the lion's skin as a trophy. Myths like this were staged all over the empire.";
        if (t > 32) done = true;
        focusPos = { x: CX, z: CZ };
      },
    },
  };

  // ---------- control ----------

  function clear() {
    if (group) { scene.remove(group); group = null; }
    items = []; props = []; state = {}; act = null; sub = ""; done = false; t = 0;
  }

  function start(name) {
    clear();
    act = ACTS[name];
    group = new THREE.Group();
    scene.add(group);
    act.setup();
  }

  function update(dt) {
    if (!act) return { done: true };
    t += dt;
    act.tick(dt);
    for (const it of items) {
      if (it.kind === "actor" || it.kind === "orpheus") { it.g.position.y = it.y || 0; }
      if (it.sp === undefined) it.sp = 0;
      place(it);
    }
    for (const p of props) p.g.rotation.z = Math.sin(t * 1.5 + p.sway) * 0.03;
    return { done };
  }

  return { init, start, update, clear, get subtitle() { return sub; }, focus: () => focusPos, get active() { return !!act; } };
})();
