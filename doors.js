"use strict";
// Doors for the houses you can go into (your house in Rome, the Delhi house and the casita in Cancún). A door is a wooden leaf on a hinge in a gap in
// the wall: it swings open when you come near (and lets you through), and swings shut again behind you when you walk away. Depends on world.js (BOX)
// and physics.js (addBlockerBox).

const Doors = (() => {
  const doors = [];
  const wood = new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), band = new THREE.MeshLambertMaterial({ color: 0x3a2a1a }), knob = new THREE.MeshLambertMaterial({ color: 0xd9b44a, emissive: 0x3d2f05 });
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

  // A door in a gap of the wall at (x, z), world coordinates. axis "x": the wall runs east-west (you walk through north-south); "z": the wall runs
  // north-south. w, h: the size of the gap. swing: +1 or -1, which way it opens (towards the inside of the house). blockers: where to keep its collision (a house's list).
  function add(parent, x, z, axis, w, h, swing, blockers, y0 = 0) {
    const pivot = new THREE.Group();
    const alongX = axis === "x";
    pivot.position.set(alongX ? x - w / 2 : x, y0, alongX ? z : z - w / 2);
    const leaf = new THREE.Mesh(BOX, wood);
    leaf.scale.set(alongX ? w - 0.06 : 0.12, h - 0.05, alongX ? 0.12 : w - 0.06);
    leaf.position.set(alongX ? w / 2 : 0, h / 2, alongX ? 0 : w / 2);
    leaf.castShadow = true;
    pivot.add(leaf);
    for (const f of [0.28, 0.72]) {                                                             // two iron bands across the door
      const b = new THREE.Mesh(BOX, band); b.scale.set(alongX ? w * 0.9 : 0.14, 0.1, alongX ? 0.14 : w * 0.9); b.position.set(alongX ? w / 2 : 0, h * f, alongX ? 0 : w / 2); pivot.add(b);
    }
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), knob); handle.position.set(alongX ? w - 0.25 : 0.1, h * 0.48, alongX ? 0.1 : w - 0.25); pivot.add(handle);
    parent.add(pivot);
    const blocker = addBlockerBox(alongX ? x - w / 2 : x - 0.15, alongX ? x + w / 2 : x + 0.15, alongX ? z - 0.15 : z - w / 2, alongX ? z + 0.15 : z + w / 2, y0, y0 + h);
    if (blockers) blockers.push(blocker);
    doors.push({ pivot, blocker, x, z, w, t: 0, swing, alongX, parent, y0 });
  }

  function update(dt) {
    if (typeof player === "undefined" || typeof started === "undefined" || !started) return;
    for (const d of doors) {
      const dist = Math.hypot(player.x - d.x, player.z - d.z);
      if (dist > 60) continue;
      const vis = shown(d.parent);
      const want = vis && (mode === "walk" || mode === "drive") && dist < (d.t > 0.2 ? 3.4 : 2.6) && Math.abs(player.feet - d.y0) < 2.5 ? 1 : 0;   // opens within 2.6 m, and stays open until you are 3.4 m away
      d.t += (want - d.t) * Math.min(1, dt * 5);
      if (Math.abs(want - d.t) < 0.01) d.t = want;
      d.pivot.rotation.y = d.swing * d.t * 1.65;
      if (vis) d.blocker.off = d.t > 0.45;                                                       // an open door lets you through
    }
  }

  return { add, update, get count() { return doors.length; } };
})();
