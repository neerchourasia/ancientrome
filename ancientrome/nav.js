"use strict";
// Directions: finds a walkable route to a landmark (around buildings and over the hills) and guides you along it
// with an arrow, turn-by-turn text, gold markers on the ground and a light beam at the destination.

const Nav = (() => {
  const CELL = 5, WALK_SPEED = 5.5, MAX_CRUMBS = 30;
  let scene, dest = null, route = [], cum = [], total = 0, lastCalc = 0, progress = 0, offRoute = 0, found = true;
  let beacon, ring, crumbs, crumbT = 0, clock = 0;
  const dummy = new THREE.Object3D();

  // Can someone walk straight from (ax, az) to (bx, bz)? Sampled every 1.5 m so thin walls are not skipped.
  function edgeOk(ax, az, bx, bz) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    let px = ax, pz = az;
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
      if (!canMove(px, pz, x, z)) return false;
      px = x; pz = z;
    }
    return true;
  }

  // A* over a grid of 5 m cells, then straightened with line-of-sight shortcuts.
  function search(sx, sz, tx, tz) {
    const ox = BOUNDS.minX, oz = BOUNDS.minZ;
    const W = Math.ceil((BOUNDS.maxX - ox) / CELL) + 1, H = Math.ceil((BOUNDS.maxZ - oz) / CELL) + 1;
    const near = (x, z) => [Math.max(0, Math.min(W - 1, Math.round((x - ox) / CELL))), Math.max(0, Math.min(H - 1, Math.round((z - oz) / CELL)))];
    const [si, sj] = near(sx, sz), [ti, tj] = near(tx, tz);
    const start = sj * W + si, goal = tj * W + ti;
    const g = new Float32Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), closed = new Uint8Array(W * H);
    const heap = []; // binary min-heap of [f, index]
    const push = (f, n) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last; let i = 0;
        for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
      }
      return top;
    };
    const px = (n) => ox + (n % W) * CELL, pz = (n) => oz + Math.floor(n / W) * CELL;
    const h = (n) => Math.hypot(px(n) - px(goal), pz(n) - pz(goal));
    g[start] = 0; push(h(start), start);
    let expanded = 0, reached = false;
    while (heap.length && expanded < 60000) {
      const [, n] = pop();
      if (closed[n]) continue;
      closed[n] = 1; expanded++;
      if (n === goal) { reached = true; break; }
      const i = n % W, j = Math.floor(n / W);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const m = nj * W + ni;
        if (closed[m]) continue;
        const cost = g[n] + (di && dj ? 1.414 : 1) * CELL;
        if (cost >= g[m]) continue;
        if (!edgeOk(px(n), pz(n), px(m), pz(m))) continue;
        g[m] = cost; prev[m] = n; push(cost + h(m), m);
      }
    }
    if (!reached) return null;
    const cells = [];
    for (let n = goal; n !== -1; n = prev[n]) cells.push({ x: px(n), z: pz(n) });
    cells.reverse();
    const pts = [{ x: sx, z: sz }, ...cells, { x: tx, z: tz }];
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !edgeOk(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--;
      out.push(pts[b]); a = b;
    }
    return out;
  }

  function measure() {
    cum = [0];
    for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z));
    total = cum[cum.length - 1] || 0;
  }

  function compute() {
    lastCalc = performance.now();
    const [tx, tz] = dest.stand;
    const r = search(player.x, player.z, tx, tz);
    found = !!r;
    route = r || [{ x: player.x, z: player.z }, { x: tx, z: tz }]; // no walkable route: fall back to a straight line
    measure();
    progress = 0;
  }

  // ---------- 3D markers ----------

  function init(sc) {
    scene = sc;
    beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.2, 320, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.3, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd24a, fog: false }));
    ring.rotation.x = Math.PI / 2;
    beacon.visible = ring.visible = false;
    beacon.frustumCulled = false;
    crumbs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 12), new THREE.MeshBasicMaterial({ color: 0xffd24a }), MAX_CRUMBS);
    crumbs.frustumCulled = false;
    crumbs.visible = false;
    scene.add(beacon, ring, crumbs);
  }

  function pointAt(s) {
    s = Math.max(0, Math.min(total, s));
    let i = 1;
    while (i < route.length - 1 && cum[i] < s) i++;
    const seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
    return { x: route[i - 1].x + (route[i].x - route[i - 1].x) * t, z: route[i - 1].z + (route[i].z - route[i - 1].z) * t };
  }

  function updateCrumbs() {
    for (let k = 0; k < MAX_CRUMBS; k++) {
      const s = progress + 4 + k * 6;
      if (s >= total - 4) { dummy.scale.set(0, 0, 0); dummy.position.set(0, -50, 0); }
      else {
        const p = pointAt(s);
        dummy.position.set(p.x, groundAt(p.x, p.z) + 0.15, p.z);
        dummy.scale.setScalar(1 - k / (MAX_CRUMBS * 1.4));
      }
      dummy.updateMatrix();
      crumbs.setMatrixAt(k, dummy.matrix);
    }
    crumbs.instanceMatrix.needsUpdate = true;
  }

  // ---------- guidance ----------

  const CARD = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  const cardinal = (dx, dz) => CARD[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];

  function step() {
    if (!dest) return null;
    // where am I on the route?
    let best = Infinity, bestS = progress;
    for (let i = 1; i < route.length; i++) {
      const ax = route[i - 1].x, az = route[i - 1].z, bx = route[i].x, bz = route[i].z;
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((player.x - ax) * dx + (player.z - az) * dz) / len2));
      const d = Math.hypot(player.x - (ax + dx * t), player.z - (az + dz * t));
      if (d < best) { best = d; bestS = cum[i - 1] + t * Math.sqrt(len2); }
    }
    offRoute = best;
    progress = bestS;
    const remaining = Math.max(0, total - progress);

    // next turn
    let text = `Continue ${cardinal(...segDir(progress))} for ${Math.round(remaining)} m`;
    for (let k = 1; k < route.length - 1; k++) {
      if (cum[k] <= progress + 4) continue;
      const a = { x: route[k].x - route[k - 1].x, z: route[k].z - route[k - 1].z }, b = { x: route[k + 1].x - route[k].x, z: route[k + 1].z - route[k].z };
      const ang = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
      if (Math.abs(ang) > 0.5) {
        const side = ang > 0 ? "right" : "left", sharp = Math.abs(ang) > 1.3 ? "sharp " : "";
        text = `In ${Math.round(cum[k] - progress)} m, turn ${sharp}${side}`;
        break;
      }
    }
    // arrow toward a point a little ahead on the route
    const look = pointAt(progress + 22), vx = look.x - player.x, vz = look.z - player.z;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = -fz, rz = fx;
    const arrow = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
    return { name: dest.name, remaining, eta: remaining / WALK_SPEED, arrow, text: found ? text : "No walkable route found, heading straight there" };
  }

  function segDir(s) {
    const a = pointAt(s), b = pointAt(s + 6);
    return [b.x - a.x, b.z - a.z];
  }

  return {
    init,
    get dest() { return dest; },
    get route() { return route; },
    get found() { return found; },
    set(lm) {
      dest = lm;
      compute();
      beacon.visible = ring.visible = crumbs.visible = true;
      beacon.position.set(lm.stand[0], groundAt(lm.stand[0], lm.stand[1]) + 160, lm.stand[1]);
      ring.position.set(lm.stand[0], groundAt(lm.stand[0], lm.stand[1]) + 0.3, lm.stand[1]);
      return route.length;
    },
    clear() { dest = null; route = []; beacon.visible = ring.visible = crumbs.visible = false; },
    // Called every frame while walking. Returns guidance info, or "arrived".
    update(dt) {
      if (!dest) return null;
      clock += dt;
      const info = step();
      if (!info) return null;
      if (offRoute > 35 && performance.now() - lastCalc > 2000) compute(); // wandered away: find a new route
      if (info.remaining < 10 || Math.hypot(player.x - dest.stand[0], player.z - dest.stand[1]) < 8) {
        const name = dest.name;
        this.clear();
        return { arrived: name };
      }
      crumbT += dt;
      if (crumbT > 0.15) { crumbT = 0; updateCrumbs(); }
      ring.scale.setScalar(1 + Math.sin(clock * 3) * 0.12);
      beacon.material.opacity = 0.22 + Math.sin(clock * 2) * 0.06;
      return info;
    },
    cardinal,
  };
})();
