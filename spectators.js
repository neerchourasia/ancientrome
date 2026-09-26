"use strict";
// Spectators sitting in the Colosseum and Circus Maximus. They cheer during fights and races.

const Crowd = (() => {
  const spots = [];
  let body, head, cheering = false, acc = 0;
  const o = new THREE.Object3D();

  function build(scene) {
    // Colosseum: every second row of seating, skipping the two gates.
    {
      const cx = 430, cz = 30, sx = 94 / 78, r0 = 26, tread = (77 - 26) / 20;
      for (let k = 2; k <= 20; k += 2) {
        const r = r0 + (k - 0.5) * tread, n = Math.round((2 * Math.PI * r * 1.15) / 1.5);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          if (Math.abs(Math.cos(a)) < 0.11) continue;
          spots.push({ x: cx + sx * r * Math.sin(a) + (rnd() - 0.5) * 0.4, y: k * 0.7, z: cz + r * Math.cos(a) + (rnd() - 0.5) * 0.4, ph: rnd() * 6.28 });
        }
      }
    }
    // Circus Maximus: both long stands, skipping the two gaps.
    {
      const cx = -230, rise = 0.6, tread = 1.9;
      for (const side of [-1, 1]) {
        for (let k = 2; k <= 12; k += 2) {
          const off = 50 + (k - 1) * tread + tread / 2;
          for (let z = 124; z < 736; z += 2.3) {
            if ((z > 298 && z < 314) || (z > 558 && z < 574)) continue;
            spots.push({ x: cx + side * off + (rnd() - 0.5) * 0.4, y: k * rise, z: z + (rnd() - 0.5) * 0.4, ph: rnd() * 6.28 });
          }
        }
      }
    }

    const bodyGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.8, 6); bodyGeo.translate(0, 0.4, 0);
    const headGeo = new THREE.SphereGeometry(0.16, 6, 5); headGeo.translate(0, 0.95, 0);
    body = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    head = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    const robes = [0xf1ead8, 0xf1ead8, 0xd8c39a, 0xb0473a, 0x4f6f8f, 0xd6a13a, 0x7d8f5b, 0x8a4f8f].map((c) => new THREE.Color(c));
    const skins = [0xe0b38a, 0xc9956b, 0xa8724c, 0xefc9a3].map((c) => new THREE.Color(c));
    spots.forEach((s, i) => { body.setColorAt(i, pick(robes)); head.setColorAt(i, pick(skins)); });
    body.instanceColor.needsUpdate = head.instanceColor.needsUpdate = true;
    writeMatrices(0, false);
    scene.add(body, head);
  }

  function writeMatrices(time, bob) {
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      o.position.set(s.x, s.y + (bob ? Math.abs(Math.sin(time * 6 + s.ph)) * 0.3 : 0), s.z);
      o.updateMatrix();
      body.setMatrixAt(i, o.matrix);
      head.setMatrixAt(i, o.matrix);
    }
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = true;
  }

  return {
    build,
    get cheering() { return cheering; },
    setCheer(on) { if (cheering && !on) writeMatrices(0, false); cheering = on; },
    update(dt, time) {
      if (!cheering) return;
      acc += dt;
      if (acc < 0.05) return;
      acc = 0;
      writeMatrices(time, true);
    },
  };
})();
