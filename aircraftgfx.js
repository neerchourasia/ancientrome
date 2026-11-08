"use strict";
// Better-looking aircraft: the shapes and materials that aircraft.js and car.js build their planes from. A fuselage turned on a lathe (a smooth nose, a long body, a tapering tail), wings and tail
// surfaces cut from a real planform (taper, thickness and rounded edges, not a slab), jet engines with a lip, a fan and a cone, a row of windows drawn on one strip instead of dozens of boxes,
// glossy paint and glass (Phong materials that catch the light), wheels with hubs and navigation lights (red on the left wingtip, green on the right, white at the tail, and a flashing strobe: Car makes
// them blink). Everything faces -z, like the models it replaces. Loaded before aircraft.js and car.js.

const AircraftGfx = (() => {
  const T = THREE;
  const paint = (c, shine = 80) => new T.MeshPhongMaterial({ color: c, shininess: shine, specular: 0x5a5f66 });
  const metal = (c) => new T.MeshPhongMaterial({ color: c, shininess: 120, specular: 0xa0a6ae });
  const dull = (c) => new T.MeshLambertMaterial({ color: c });
  const glass = () => new T.MeshPhongMaterial({ color: 0x15283a, shininess: 160, specular: 0xb8d4ee });
  const bright = (c) => new T.MeshBasicMaterial({ color: c });

  // a fuselage on a lathe: length len, greatest radius r. noseEnd: the fraction of the length where the nose reaches full width; tailStart: where the tail begins to narrow; tailR: the radius at the very
  // end as a fraction of r; noseR: the radius of the very tip. Centred on z = 0, the nose at -z.
  function fuselage(len, r, o = {}) {
    const noseEnd = o.noseEnd || 0.14, tailStart = o.tailStart || 0.62, tailR = o.tailR === undefined ? 0.16 : o.tailR, noseR = o.noseR === undefined ? 0.06 : o.noseR, pts = [];
    const N = 48;
    for (let i = 0; i <= N; i++) {
      const s = i / N;                                                          // 0 at the nose, 1 at the tail
      let k;
      if (s < noseEnd) { const u = (noseEnd - s) / noseEnd; k = Math.sqrt(Math.max(0, 1 - u * u)); k = noseR + (1 - noseR) * Math.pow(k, 0.85); }
      else if (s > tailStart) { const u = (s - tailStart) / (1 - tailStart); k = 1 - (1 - tailR) * Math.pow(u, 1.5); }
      else k = 1;
      pts.push(new T.Vector2(Math.max(0.001, r * k), len * (1 - s)));           // (radius, position along the lathe's axis: the nose at the largest value)
    }
    const geo = new T.LatheGeometry(pts, 28);
    geo.rotateX(-Math.PI / 2);                                                  // the axis now runs along -z (the nose at -z)
    geo.translate(0, 0, len / 2);
    return geo;
  }

  // a wing (or a tailplane) half, lying along +x from the root at x = 0: a trapezoid of root chord and tip chord (the leading edge toward -z), with thickness and rounded edges
  function wingGeo(span, rootChord, tipChord, thick, sweep = 0) {
    const sh = new T.Shape();
    sh.moveTo(0, rootChord / 2); sh.lineTo(span, tipChord / 2 - sweep); sh.lineTo(span, -tipChord / 2 - sweep); sh.lineTo(0, -rootChord / 2); sh.closePath();     // (shape y becomes -z: y > 0 is the leading edge)
    const b = thick * 0.35, geo = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, thick / 2, 0);
    return geo;
  }
  // a fin: height h, root chord, tip chord, the leading edge swept back by `sweep`; it stands on y = 0 and runs from the leading edge (z = 0) back toward +z
  function finGeo(h, rootChord, tipChord, sweep, thick) {
    const sh = new T.Shape(); sh.moveTo(0, 0); sh.lineTo(sweep, h); sh.lineTo(sweep + tipChord, h); sh.lineTo(rootChord, 0); sh.closePath();
    const b = thick * 0.35, geo = new T.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 });
    geo.rotateY(-Math.PI / 2);                                                  // the chord now runs along +z, the thickness along x
    geo.translate(thick / 2, 0, 0);
    return geo;
  }

  // the row of windows along one side of an airliner: one strip with the windows painted on it
  let stripTex = null;
  const windowStrip = (len, h, mat) => {
    if (!stripTex) {
      const c = document.createElement("canvas"); c.width = 512; c.height = 32; const g = c.getContext("2d");
      g.clearRect(0, 0, 512, 32); g.fillStyle = "#101c28";
      for (let x = 4; x < 512; x += 16) { g.beginPath(); g.moveTo(x + 2, 10); g.lineTo(x + 9, 10); g.quadraticCurveTo(x + 11, 10, x + 11, 12); g.lineTo(x + 11, 20); g.quadraticCurveTo(x + 11, 22, x + 9, 22); g.lineTo(x + 2, 22); g.quadraticCurveTo(x, 22, x, 20); g.lineTo(x, 12); g.quadraticCurveTo(x, 10, x + 2, 10); g.fill(); }
      stripTex = new T.CanvasTexture(c); stripTex.wrapS = T.RepeatWrapping; stripTex.anisotropy = 4;
    }
    const tex = stripTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, len / 8), 1);
    return new T.Mesh(new T.PlaneGeometry(len, h), new T.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: T.DoubleSide }));
  };

  // a jet engine: a nacelle with a rounded lip, a dark fan inside the front and a cone at the back. Length len, radius r; the front faces -z; centred on z = 0.
  let fanTex = null;
  function nacelle(len, r, bodyMat, steelMat) {
    const g = new T.Group();
    const pts = [[0.8, 0], [0.97, 0.03], [1, 0.12], [1, 0.62], [0.9, 0.92], [0.62, 1]].map(([k, s]) => new T.Vector2(r * k, len * (1 - s)));
    const body = new T.Mesh(new T.LatheGeometry(pts, 20), bodyMat); body.geometry.rotateX(-Math.PI / 2); body.geometry.translate(0, 0, len / 2); g.add(body);
    if (!fanTex) {
      const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
      x.fillStyle = "#15181c"; x.fillRect(0, 0, 64, 64); x.strokeStyle = "#5a6068"; x.lineWidth = 3;
      for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; x.beginPath(); x.moveTo(32, 32); x.lineTo(32 + Math.cos(a) * 30, 32 + Math.sin(a) * 30); x.stroke(); }
      x.fillStyle = "#8a9098"; x.beginPath(); x.arc(32, 32, 7, 0, 7); x.fill();
      fanTex = new T.CanvasTexture(c);
    }
    const fan = new T.Mesh(new T.CircleGeometry(r * 0.78, 20), new T.MeshBasicMaterial({ map: fanTex })); fan.position.z = -len / 2 + len * 0.1; fan.rotation.y = Math.PI; g.add(fan);
    const cone = new T.Mesh(new T.ConeGeometry(r * 0.3, len * 0.28, 12), steelMat); cone.rotation.x = Math.PI / 2; cone.position.z = len / 2 - len * 0.04; g.add(cone);
    return g;
  }

  // a wheel with a tyre and a hub that spins with it (the wheel the caller keeps in its list of wheels)
  const wheelMesh = (r, w, x, y, z) => {
    const tyre = new T.Mesh(new T.CylinderGeometry(r, r, w, 16), dull(0x15161a));
    const hub = new T.Mesh(new T.CylinderGeometry(r * 0.55, r * 0.55, w * 1.04, 12), metal(0xb4b9c0)); tyre.add(hub);
    const stripe = new T.Mesh(new T.BoxGeometry(w * 1.06, r * 0.18, r * 0.3), dull(0xd9d9d9)); stripe.position.set(0, r * 0.55, 0); hub.add(stripe);   // (so you can see it turn)
    tyre.rotation.z = Math.PI / 2; tyre.position.set(x, y, z); tyre.castShadow = true; return tyre;
  };
  // a strut from point a to point b
  const strut = (a, b, mat, r = 0.05) => {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), m = new T.Mesh(new T.CylinderGeometry(r, r, d.length(), 8), mat);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; return m;
  };

  // navigation lights: red on the left wingtip, green on the right, white at the tail; the strobes flash (the aircraft's userData.strobes: car.js shows and hides them)
  const lamp = (c, size, x, y, z) => { const m = new T.Mesh(new T.SphereGeometry(size, 8, 6), bright(c)); m.position.set(x, y, z); return m; };
  function addLights(g, span, wingY, wingZ, tailY, tailZ, size = 0.12) {
    const strobes = g.userData.strobes = g.userData.strobes || [];
    g.add(lamp(0xff2a2a, size, -span / 2, wingY, wingZ), lamp(0x22e05a, size, span / 2, wingY, wingZ), lamp(0xffffff, size, 0, tailY, tailZ));
    for (const sx of [-1, 1]) { const s = lamp(0xffffff, size * 1.5, sx * span / 2, wingY + size, wingZ + size * 2); strobes.push({ m: s, phase: sx > 0 ? 0 : 0.55 }); g.add(s); }
  }
  return { paint, metal, dull, glass, bright, fuselage, wingGeo, finGeo, windowStrip, nacelle, wheelMesh, strut, lamp, addLights };
})();
