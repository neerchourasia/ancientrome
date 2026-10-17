"use strict";
// Weather and seasons. A year is 28 days (seven days a season), and the weather changes every few hours of game time:
// clear, partly cloudy, cloudy, windy, drizzle, rain, thunderstorm, fog, mist and snow, with the odds depending on the season
// and the city (Rome has mild damp winters and the odd snowfall; Delhi has hot windy summers, a monsoon and thick winter fog).
// It is worked out from the day and hour, so it needs no server. Rain and snow fall around you, the sky greys, fog and mist
// close in, wind blows leaves and dust about, storms flash and rumble, and the grass and leaves change colour with the seasons
// (and turn white under snow). Depends on city.js (buildSky), audio.js and game.js at run time.

const Weather = (() => {
  const SEASONS = {
    rome: ["Spring", "Summer", "Autumn", "Winter"],
    delhi: ["Spring", "Summer", "Monsoon", "Winter"],
  };
  const TYPES = ["clear", "partly", "cloudy", "windy", "drizzle", "rain", "storm", "fog", "mist", "snow", "hail", "blizzard", "tornado", "cyclone"];
  // the chance of each kind of weather in each season (they are scaled to add up to one)
  const ODDS = {
    rome: [
      { clear: 0.28, partly: 0.20, cloudy: 0.12, windy: 0.08, drizzle: 0.10, rain: 0.14, storm: 0.03, fog: 0.02, mist: 0.03, hail: 0.015, tornado: 0.004 },
      { clear: 0.50, partly: 0.22, cloudy: 0.05, windy: 0.08, drizzle: 0.02, rain: 0.04, storm: 0.06, fog: 0.01, mist: 0.02, hail: 0.025, tornado: 0.008 },
      { clear: 0.16, partly: 0.14, cloudy: 0.14, windy: 0.12, drizzle: 0.12, rain: 0.17, storm: 0.05, fog: 0.04, mist: 0.06, hail: 0.01, cyclone: 0.02 },
      { clear: 0.14, partly: 0.10, cloudy: 0.16, windy: 0.08, drizzle: 0.08, rain: 0.14, storm: 0.02, fog: 0.12, mist: 0.08, snow: 0.08, blizzard: 0.02 },
    ],
    delhi: [
      { clear: 0.40, partly: 0.20, cloudy: 0.10, windy: 0.15, drizzle: 0.04, rain: 0.04, storm: 0.04, fog: 0.02, mist: 0.01, hail: 0.03, tornado: 0.006 },
      { clear: 0.50, partly: 0.15, cloudy: 0.05, windy: 0.18, drizzle: 0.00, rain: 0.02, storm: 0.06, fog: 0.03, mist: 0.01, tornado: 0.01 },
      { clear: 0.08, partly: 0.10, cloudy: 0.17, windy: 0.05, drizzle: 0.15, rain: 0.27, storm: 0.13, fog: 0.03, mist: 0.02, cyclone: 0.05 },
      { clear: 0.15, partly: 0.10, cloudy: 0.10, windy: 0.03, drizzle: 0.02, rain: 0.03, storm: 0.00, fog: 0.38, mist: 0.19 },
    ],
  };
  const LOOK = { // what each kind of weather does to the world
    clear: { cover: 0.04, rain: 0, snow: 0, hail: 0, fog: 0, dark: 0, grey: 0, wind: 0.05, icon: "☀", name: "Sunny" },
    partly: { cover: 0.3, rain: 0, snow: 0, hail: 0, fog: 0, dark: 0.12, grey: 0.2, wind: 0.15, icon: "🌤", name: "Partly cloudy" },
    cloudy: { cover: 0.72, rain: 0, snow: 0, hail: 0, fog: 0.05, dark: 0.35, grey: 0.45, wind: 0.2, icon: "⛅", name: "Cloudy" },
    windy: { cover: 0.18, rain: 0, snow: 0, hail: 0, fog: 0, dark: 0.1, grey: 0.15, wind: 1, icon: "💨", name: "Windy" },
    drizzle: { cover: 0.85, rain: 0.28, snow: 0, hail: 0, fog: 0.12, dark: 0.35, grey: 0.55, wind: 0.2, icon: "🌦", name: "Drizzle" },
    rain: { cover: 0.95, rain: 0.7, snow: 0, hail: 0, fog: 0.25, dark: 0.55, grey: 0.75, wind: 0.35, icon: "🌧", name: "Rain" },
    storm: { cover: 1, rain: 1, snow: 0, hail: 0, fog: 0.3, dark: 0.8, grey: 0.9, wind: 0.8, icon: "⛈", name: "Thunderstorm" },
    fog: { cover: 0.35, rain: 0, snow: 0, hail: 0, fog: 1, dark: 0.25, grey: 0.7, wind: 0, icon: "🌫", name: "Fog" },
    mist: { cover: 0.25, rain: 0, snow: 0, hail: 0, fog: 0.45, dark: 0.12, grey: 0.35, wind: 0.05, icon: "🌁", name: "Misty" },
    hail: { cover: 0.95, rain: 0.45, snow: 0, hail: 1, fog: 0.2, dark: 0.65, grey: 0.85, wind: 0.5, icon: "🧊", name: "Hailstorm" },
    blizzard: { cover: 1, rain: 0, snow: 1, hail: 0, fog: 0.8, dark: 0.45, grey: 0.85, wind: 1, icon: "🌨", name: "Blizzard" },
    tornado: { cover: 1, rain: 0.3, snow: 0, hail: 0, fog: 0.3, dark: 0.75, grey: 0.9, wind: 1, icon: "🌪", name: "Tornado" },
    cyclone: { cover: 1, rain: 1, snow: 0, hail: 0, fog: 0.45, dark: 0.85, grey: 0.95, wind: 1, icon: "🌀", name: "Cyclone" },
    snow: { cover: 0.85, rain: 0, snow: 1, hail: 0, fog: 0.35, dark: 0.3, grey: 0.6, wind: 0.2, icon: "❄", name: "Snow" },
  };
  // how the land looks: the ground tint, and the colour that leaves are blended towards (with how strongly)
  const LAND = [
    { ground: [0.95, 1.08, 0.95], leaf: 0x6bbf45, k: 0.4, bits: 0x8dbf5a },     // spring: fresh green
    { ground: [1.12, 1.02, 0.82], leaf: 0x8a9a3a, k: 0.35, bits: 0xc9b27a },    // summer: dry and golden
    { ground: [1.1, 0.92, 0.78], leaf: 0xc4721f, k: 0.8, bits: 0xc46a1c },      // autumn: russet
    { ground: [0.95, 0.98, 1.05], leaf: 0x7d8576, k: 0.6, bits: 0xd9dde0 },     // winter: pale and bare
  ];

  const cur = { rain: 0, snow: 0, hail: 0, fog: 0, dark: 0, grey: 0, wind: 0, cover: 0 };
  let sky = null, scene = null, forced = null, kind = "clear", season = 0, appliedSeason = -1, appliedSnow = -1, lastSky = 0;
  let clouds = [], cloudTex = null, hail = null, hailPos = null, funnel = null, funnelBits = null, tx = 0, tz = 0, tdir = 0, hailT = 0, hurtT = 0, warned = "", drops = null, dropPos = null, dropVel = null, flakes = null, flakePos = null, bits = null, bitPos = null, bitSeed = null, boltT = 12, flash = 0, thunderT = -1, hudT = 0, lastBadge = "", clock = 0;
  const NH = 420, N = 1100, NF = 1500, NB = 170, NC = 36;   // NC: clouds in the sky; how many show depends on the weather

  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const el = (id) => document.getElementById(id);

  // The weather changes every day. Each day has a theme (rolled for that day, never the same as yesterday's), and the day's
  // weather follows it most of the time. Severe days (hail, blizzard, tornado, cyclone) come every week or so, by season and city:
  // the severe weather lasts for two stretches of that day (about ten hours), and the rest of the day is the build-up and the aftermath.
  const SEVERE = ["hail", "blizzard", "tornado", "cyclone"];
  const SEVERE_DAY = { // the chance that a day in this season is a severe day, and what kind
    rome: [{ hail: 0.07, tornado: 0.04 }, { hail: 0.09, tornado: 0.05 }, { cyclone: 0.12, hail: 0.05, tornado: 0.02 }, { blizzard: 0.13, hail: 0.03 }],
    delhi: [{ hail: 0.07, tornado: 0.04 }, { tornado: 0.05, hail: 0.05 }, { cyclone: 0.16, hail: 0.04 }, { hail: 0.03, tornado: 0.01 }],
  };

  const seasonOf = (c, day) => (Math.floor(((day - 1) % 28 + 28) % 28 / 7) + (c === "delhi" ? 2 : 0)) % 4; // Delhi's seasons run two ahead of Rome's

  // the theme of a day (k re-rolls it)
  function dayRaw(c, day, k) {
    const s = seasonOf(c, day), r = mulberry(day * 104729 + (c === "delhi" ? 7919 : 15485863) + s * 977 + k * 6700417);
    let x = r();
    for (const [kind, p] of Object.entries(SEVERE_DAY[c][s])) { if (x < p) return { kind, severe: true, w: Math.floor(r() * 4) }; x -= p; }
    const odds = ODDS[c][s], list = TYPES.filter((t) => !SEVERE.includes(t) && odds[t]), total = list.reduce((a, t) => a + odds[t], 0);
    let y = r() * total;
    for (const t of list) { y -= odds[t]; if (y <= 0) return { kind: t, severe: false }; }
    return { kind: "clear", severe: false };
  }
  function dayTheme(c, day) {
    const yest = dayRaw(c, day - 1, 0).kind;
    let k = 0, d = dayRaw(c, day, 0);
    while (d.kind === yest && k < 6) d = dayRaw(c, day, ++k);       // never the same weather two days running
    return { ...d, k };
  }

  // One roll of the weather for a city (`bump` re-rolls it with another seed)
  function roll(c, day, hour, bump) {
    const s = seasonOf(c, day), th = dayTheme(c, day), slot = Math.min(4, Math.floor(hour / 5));
    const r = mulberry(day * 7919 + slot * 31337 + (c === "delhi" ? 104729 : 1299709) + s * 31 + bump * 15485863);
    if (th.severe && slot >= th.w && slot <= th.w + 1) return { season: s, kind: th.kind };      // the storm itself
    if (th.severe && (slot === th.w - 1 || slot === th.w + 2)) return { season: s, kind: s === 3 && c === "rome" && th.kind === "blizzard" ? "snow" : th.kind === "cyclone" ? "storm" : "cloudy" }; // the build-up and the aftermath
    if (r() < 0.65) return { season: s, kind: th.kind };                                           // most of the day follows its theme
    const odds = ODDS[c][s], list = TYPES.filter((t) => !SEVERE.includes(t) && odds[t]), total = list.reduce((a, t) => a + odds[t], 0);
    let y = r() * total;
    for (const t of list) { y -= odds[t]; if (y <= 0) return { season: s, kind: t }; }
    return { season: s, kind: "clear" };
  }

  // The weather for a day and hour in a city: the same for everyone who is at that time. Rome and Delhi have their own weather:
  // when both would get the same sort of weather (dry, grey, wet...) at the same moment, Delhi's is rolled again, so the two cities
  // are clearly different. (A severe event in either city is never rolled away.)
  const GROUP = { clear: "dry", partly: "dry", windy: "dry", cloudy: "grey", mist: "grey", fog: "grey", drizzle: "wet", rain: "wet", storm: "wet", hail: "wet", cyclone: "wet", snow: "snow", blizzard: "snow", tornado: "tornado" };
  function forecast(c, day, hour) {
    if (c !== "delhi") return roll("rome", day, hour, 0);
    const other = GROUP[roll("rome", day, hour, 0).kind];
    let w = roll("delhi", day, hour, 0);
    for (let bump = 1; bump <= 10 && GROUP[w.kind] === other && !SEVERE.includes(w.kind); bump++) w = roll("delhi", day, hour, bump); // a different sort of weather, not just a different name
    return w;
  }

  function init(skyState, sc) {
    sky = skyState; scene = sc;
    sky.wx = { grey: 0, dark: 0, fogMul: 1 };
    // rain: little streaks
    dropPos = new Float32Array(N * 6);
    dropVel = new Float32Array(N);
    for (let i = 0; i < N; i++) { dropPos[i * 6 + 0] = (Math.random() - 0.5) * 70; dropPos[i * 6 + 1] = Math.random() * 40; dropPos[i * 6 + 2] = (Math.random() - 0.5) * 70; dropVel[i] = 30 + Math.random() * 14; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    drops = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4d6e8, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    drops.frustumCulled = false; drops.visible = false; drops.renderOrder = 5;
    // snow: drifting white flakes
    flakePos = new Float32Array(NF * 3);
    for (let i = 0; i < NF; i++) { flakePos[i * 3] = (Math.random() - 0.5) * 70; flakePos[i * 3 + 1] = Math.random() * 36; flakePos[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NF * 3), 3));
    flakes = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    flakes.frustumCulled = false; flakes.visible = false; flakes.renderOrder = 5;
    // wind: leaves, petals or dust blowing along
    bitPos = new Float32Array(NB * 3); bitSeed = new Float32Array(NB);
    for (let i = 0; i < NB; i++) { bitPos[i * 3] = (Math.random() - 0.5) * 70; bitPos[i * 3 + 1] = Math.random() * 9; bitPos[i * 3 + 2] = (Math.random() - 0.5) * 70; bitSeed[i] = Math.random() * 6.3; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
    bits = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xc46a1c, size: 0.32, transparent: true, opacity: 0.85, depthWrite: false }));
    bits.frustumCulled = false; bits.visible = false; bits.renderOrder = 5;
    // hail: hard white pellets, much faster than snow
    hailPos = new Float32Array(NH * 3);
    for (let i = 0; i < NH; i++) { hailPos[i * 3] = (Math.random() - 0.5) * 50; hailPos[i * 3 + 1] = Math.random() * 30; hailPos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const hg = new THREE.BufferGeometry(); hg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NH * 3), 3));
    hail = new THREE.Points(hg, new THREE.PointsMaterial({ color: 0xf2f8ff, size: 0.34, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
    hail.frustumCulled = false; hail.visible = false; hail.renderOrder = 5;
    // tornado: a tall grey funnel that turns, with a skirt of dust
    funnel = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(26, 2.5, 160, 18, 8, true), new THREE.MeshBasicMaterial({ color: 0x555b60, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    cone.position.y = 80; cone.name = "cone";
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(15, 1.6, 150, 12, 6, true), new THREE.MeshBasicMaterial({ color: 0x2c3033, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    inner.position.y = 75; inner.name = "inner";
    const dust = new THREE.Mesh(new THREE.CylinderGeometry(18, 28, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x8a7a62, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    dust.position.y = 6; dust.name = "dust";
    funnel.add(cone, inner, dust); funnel.visible = false; funnel.renderOrder = 4;
    // clouds: soft white puffs high up, in clumps of a few; each has its own limit, so more of them show as the sky clouds over
    cloudTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, "rgba(255,255,255,.95)"); gr.addColorStop(0.55, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    for (let i = 0; i < NC; i++) {
      const grp = new THREE.Group(), puffs = 4 + Math.floor(Math.random() * 3), big = 90 + Math.random() * 90;
      for (let k = 0; k < puffs; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 }));
        const w = big * (0.7 + Math.random() * 0.6); sp.scale.set(w, w * 0.45, 1); sp.position.set((k - puffs / 2) * big * 0.5 + (Math.random() - 0.5) * 20, (Math.random() - 0.3) * 10, (Math.random() - 0.5) * 40);
        grp.add(sp);
      }
      // clouds are spread over a wide square around you and drift with the wind; thr: the cloud cover at which this one appears
      grp.userData = { x: (Math.random() - 0.5) * 2400, z: (Math.random() - 0.5) * 2400, y: 260 + Math.random() * 120, thr: i / NC, fade: 0 };
      grp.visible = false; grp.renderOrder = -1; scene.add(grp); clouds.push(grp);
    }
    scene.add(drops, flakes, bits, hail, funnel);
    refreshLand();
  }

  // season colours: the ground tint and the leaves of every tree and lawn that is marked as foliage (white under snow)
  function refreshLand() {
    if (!scene) return;
    const L = LAND[season];
    if (typeof GROUND !== "undefined" && GROUND) {
      const wet = 1 - 0.14 * cur.rain, s = cur.snow;
      GROUND.material.color.setRGB((L.ground[0] * (1 - s) + 1.9 * s) * wet, (L.ground[1] * (1 - s) + 1.9 * s) * wet, (L.ground[2] * (1 - s) + 2.0 * s) * wet);
    }
    bits.material.color.setHex(L.bits);
    if (appliedSeason === season && Math.abs(appliedSnow - cur.snow) < 0.05) return;
    appliedSeason = season; appliedSnow = cur.snow;
    refreshFoliage();
  }

  function refreshFoliage() {
    if (!scene) return;
    const L = LAND[season], target = new THREE.Color(L.leaf), base = new THREE.Color(), white = new THREE.Color(0xeef3f6);
    scene.traverse((o) => {
      const m = o.material;
      if (m && !Array.isArray(m) && m.userData && m.userData.leaf !== undefined && m.color) m.color.copy(base.setHex(m.userData.leaf)).lerp(target, L.k).lerp(white, 0.6 * cur.snow);
    });
  }

  function badge() {
    const look = Object.assign({}, LOOK[kind], kind === "cyclone" && city === "rome" ? { name: "Hurricane (medicane)" } : {}), name = (SEASONS[city] || SEASONS.rome)[season], text = `${look.icon} ${look.name} · ${name}`;
    if (text !== lastBadge) { lastBadge = text; const b = el("wx-badge"); if (b) b.textContent = text; }
  }

  function lightning(dt) {
    boltT -= dt;
    if (kind === "storm" && cur.rain > 0.5 && boltT <= 0) {
      boltT = 5 + Math.random() * 14;
      flash = 1; thunderT = 0.4 + Math.random() * 2.4;
    }
    if (flash > 0) { flash = Math.max(0, flash - dt * 2.8); const l = el("lightning"); if (l) l.style.opacity = (flash > 0.55 ? 0.65 : flash * 0.5).toFixed(2); }
    if (thunderT >= 0) { thunderT -= dt; if (thunderT < 0) { Sfx.play("thunder"); thunderT = -1; } }
  }

  function update(dt) {
    if (!sky) return;
    clock += dt;
    const fc = forecast(city, Time.day, Time.hour);
    if (fc.season !== season) { season = fc.season; }
    kind = forced || fc.kind;
    const L = LOOK[kind], k = Math.min(1, dt * 0.18); // about 5 seconds to change
    let moved = false;
    for (const key of ["rain", "snow", "hail", "fog", "dark", "grey", "wind", "cover"]) {
      const before = cur[key]; cur[key] += (L[key] - cur[key]) * k;
      if (Math.abs(cur[key] - before) > 1e-4) moved = true;
    }
    if (moved || appliedSeason !== season) {
      sky.wx.grey = cur.grey; sky.wx.dark = cur.dark;
      sky.wx.fogMul = 1 - 0.86 * cur.fog;
      lastSky += dt;
      if (lastSky > 0.25) { lastSky = 0; sky.setHour(Time.hour, true); refreshLand(); }
    }
    const windSpeed = 3 + cur.wind * 9;
    // rain streaks around the camera
    const rain = cur.rain;
    drops.visible = rain > 0.03;
    if (drops.visible) {
      const pos = drops.geometry.attributes.position, n = Math.floor(N * Math.min(1, rain)), wind = windSpeed * (0.5 + rain * 0.5);
      for (let i = 0; i < N; i++) {
        const o = i * 6;
        if (i >= n) { for (let j = 0; j < 6; j++) pos.array[o + j] = 0; continue; }
        dropPos[o + 1] -= dropVel[i] * dt;
        dropPos[o] += wind * dt;
        if (dropPos[o + 1] < -2) { dropPos[o + 1] = 38; dropPos[o] = (Math.random() - 0.5) * 70; dropPos[o + 2] = (Math.random() - 0.5) * 70; }
        const x = camera.position.x + dropPos[o], y = camera.position.y + dropPos[o + 1] - 8, z = camera.position.z + dropPos[o + 2];
        pos.array[o] = x; pos.array[o + 1] = y; pos.array[o + 2] = z;
        pos.array[o + 3] = x - wind * 0.035; pos.array[o + 4] = y - 1.5; pos.array[o + 5] = z;
        if (dropPos[o] > 35) dropPos[o] = -35;
      }
      pos.needsUpdate = true;
      drops.material.opacity = 0.18 + 0.4 * Math.min(1, rain);
    }
    // snowflakes: slow, swirling, a little blown by the wind
    flakes.visible = cur.snow > 0.03;
    if (flakes.visible) {
      const pos = flakes.geometry.attributes.position, n = Math.floor(NF * Math.min(1, cur.snow));
      for (let i = 0; i < NF; i++) {
        const o = i * 3;
        if (i >= n) { pos.array[o + 1] = -500; continue; }
        flakePos[o + 1] -= (1.4 + (i % 7) * 0.22) * dt;
        flakePos[o] += (Math.sin(clock * 0.8 + i) * 0.6 + windSpeed * 0.25) * dt;
        flakePos[o + 2] += Math.cos(clock * 0.7 + i * 1.3) * 0.5 * dt;
        if (flakePos[o + 1] < -2) { flakePos[o + 1] = 34; flakePos[o] = (Math.random() - 0.5) * 70; flakePos[o + 2] = (Math.random() - 0.5) * 70; }
        if (flakePos[o] > 35) flakePos[o] = -35; else if (flakePos[o] < -35) flakePos[o] = 35;
        pos.array[o] = camera.position.x + flakePos[o]; pos.array[o + 1] = camera.position.y + flakePos[o + 1] - 6; pos.array[o + 2] = camera.position.z + flakePos[o + 2];
      }
      pos.needsUpdate = true;
    }
    // wind: leaves (or dust) streaming across
    bits.visible = cur.wind > 0.3 && cur.snow < 0.3;
    if (bits.visible) {
      const pos = bits.geometry.attributes.position, speed = 2 + cur.wind * 11, n = Math.floor(NB * Math.min(1, (cur.wind - 0.2)));
      for (let i = 0; i < NB; i++) {
        const o = i * 3;
        if (i >= n) { pos.array[o + 1] = -500; continue; }
        bitPos[o] += speed * dt * (0.7 + (i % 5) * 0.12);
        bitPos[o + 1] += Math.sin(clock * 1.6 + bitSeed[i]) * 0.9 * dt;
        bitPos[o + 2] += Math.cos(clock * 1.1 + bitSeed[i] * 2) * 1.2 * dt;
        if (bitPos[o] > 35) { bitPos[o] = -35; bitPos[o + 1] = Math.random() * 9; bitPos[o + 2] = (Math.random() - 0.5) * 70; }
        pos.array[o] = camera.position.x + bitPos[o]; pos.array[o + 1] = Math.max(0.2, bitPos[o + 1]) + (camera.position.y > 4 ? camera.position.y - 3 : 0); pos.array[o + 2] = camera.position.z + bitPos[o + 2];
      }
      pos.needsUpdate = true;
    }
    // hail: pellets that rattle down; they sting if you stand out in them
    hail.visible = cur.hail > 0.03;
    if (hail.visible) {
      const pos = hail.geometry.attributes.position;
      for (let i = 0; i < NH; i++) {
        const o = i * 3;
        hailPos[o + 1] -= (24 + (i % 5) * 3) * dt; hailPos[o] += windSpeed * 0.3 * dt;
        if (hailPos[o + 1] < -2) { hailPos[o + 1] = 30; hailPos[o] = (Math.random() - 0.5) * 50; hailPos[o + 2] = (Math.random() - 0.5) * 50; }
        if (hailPos[o] > 25) hailPos[o] = -25;
        pos.array[o] = camera.position.x + hailPos[o]; pos.array[o + 1] = camera.position.y + hailPos[o + 1] - 6; pos.array[o + 2] = camera.position.z + hailPos[o + 2];
      }
      pos.needsUpdate = true;
      hailT -= dt;
      if (cur.hail > 0.5 && hailT <= 0) { hailT = 0.07 + Math.random() * 0.12; Sfx.play("hail"); }
      if (cur.hail > 0.5 && (mode === "walk" || mode === "drive") && started) {
        if (warned !== "hail") { warned = "hail"; toast("Hail! Take cover: the ice stings."); }
        Vitals.hp = Math.max(20, Vitals.hp - 0.35 * dt);
      }
    }
    // tornado: it wanders across the land a couple of hundred metres away, and tears at you if you walk into it
    const tw = kind === "tornado";
    funnel.visible = tw || (funnel.userData.fade || 0) > 0.02;
    funnel.userData.fade = (funnel.userData.fade || 0) + ((tw ? 1 : 0) - (funnel.userData.fade || 0)) * Math.min(1, dt * 0.4);
    if (funnel.visible) {
      if (!funnel.userData.placed) { funnel.userData.placed = 1; tdir = Math.random() * 6.28; tx = camera.position.x + Math.cos(tdir) * 190; tz = camera.position.z + Math.sin(tdir) * 190; warned = ""; Sfx.play("tornado"); }
      tdir += Math.sin(clock * 0.07) * 0.25 * dt;
      tx += Math.cos(tdir + 1.9) * 5 * dt; tz += Math.sin(tdir + 1.9) * 5 * dt;
      const dx = tx - camera.position.x, dz = tz - camera.position.z, dist = Math.hypot(dx, dz);
      if (dist > 330) { tx = camera.position.x + (dx / dist) * 200; tz = camera.position.z + (dz / dist) * 200; } // never leaves you for good
      funnel.position.set(tx + Math.sin(clock * 1.7) * 3, 0, tz + Math.cos(clock * 1.3) * 3);
      funnel.rotation.y += dt * 6;
      funnel.children[0].rotation.y = clock * 2; funnel.children[1].rotation.y = -clock * 3;
      funnel.children.forEach((m) => { m.material.opacity = m.material.opacity * 0 + (m.name === "cone" ? 0.62 : m.name === "inner" ? 0.5 : 0.5) * funnel.userData.fade; });
      if (tw && started && (mode === "walk" || mode === "drive") && player) {
        const pd = Math.hypot(tx - player.x, tz - player.z);
        if (pd < 130 && warned !== "near") { warned = "near"; toast("A tornado! Run away from it."); Narrator.say("A tornado is on the land. Run from it.", { interrupt: true }); }
        if (pd < 45 && pd > 3) { // the wind drags you in
          const pull = (45 - pd) / 45 * 6 * dt, nx = player.x + (tx - player.x) / pd * pull, nz = player.z + (tz - player.z) / pd * pull;
          if (!blockedAt(nx, nz, player.feet)) { player.x = nx; player.z = nz; }
        }
        if (pd < 28) { // inside the funnel it kills: faster the closer you are
          Vitals.hp -= (pd < 12 ? 45 : 18) * dt; hurtT -= dt;
          if (hurtT <= 0) { hurtT = 1.2; toast("The tornado tears at you! Run!"); Sfx.play("bump"); }
          if (Vitals.hp <= 0.01) { Vitals.hp = 0; funnel.userData.placed = 0; } // it moves off and comes back about 190 m away after you die
        }
      }
    } else funnel.userData.placed = 0;
    // clouds drift on the wind, wrapping round you, and fade in and out as the cover changes; they darken with the storm and at night
    const night = sky.night || 0, shade = (1 - 0.8 * night) * (1 - 0.55 * cur.dark), ground = 0.62 + 0.38 * shade;
    for (const c of clouds) {
      const u = c.userData, want = cur.cover > u.thr ? 1 : 0;
      u.fade += (want - u.fade) * Math.min(1, dt * 0.5);
      c.visible = u.fade > 0.02;
      if (!c.visible) continue;
      u.x += (3 + cur.wind * 14) * dt;
      let dx = u.x - camera.position.x, dz = u.z - camera.position.z;
      if (dx > 1200) u.x -= 2400; else if (dx < -1200) u.x += 2400;
      if (dz > 1200) u.z -= 2400; else if (dz < -1200) u.z += 2400;
      c.position.set(u.x, u.y, u.z);
      for (const sp of c.children) { sp.material.opacity = 0.9 * u.fade; sp.material.color.setScalar(ground); }
    }
    Sfx.setWeather(rain, cur.wind);
    lightning(dt);
    hudT += dt; if (hudT > 1) { hudT = 0; badge(); }
  }

  return {
    init, update, refreshFoliage, forecast, TYPES,
    force(k) { forced = TYPES.includes(k) ? k : null; },
    get kind() { return kind; }, get season() { return season; }, get seasonName() { return (SEASONS[city] || SEASONS.rome)[season]; }, get fog() { return cur.fog; }, get rain() { return cur.rain; }, get snow() { return cur.snow; }, get hail() { return cur.hail; }, get tornado() { return funnel && funnel.visible ? { x: tx, z: tz } : null; }, get wind() { return cur.wind; },
  };
})();
