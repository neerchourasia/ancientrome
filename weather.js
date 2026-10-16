"use strict";
// Weather and seasons. A year is 28 days (seven days a season), and the weather changes every few hours of game time:
// clear, cloudy, rain, thunderstorms or fog, with the odds depending on the season and the city (Rome has mild damp
// winters; Delhi has hot summers, a monsoon and thick winter fog). It is worked out from the day and hour, so it needs no
// server. Rain falls as streaks around you, the sky greys, fog closes in, storms flash and rumble, and the grass and
// leaves change colour with the seasons. Depends on city.js (buildSky), audio.js and game.js at run time.

const Weather = (() => {
  const SEASONS = {
    rome: ["Spring", "Summer", "Autumn", "Winter"],
    delhi: ["Spring", "Summer", "Monsoon", "Winter"],
  };
  // chance of [clear, cloudy, rain, storm, fog] in each season
  const ODDS = {
    rome: [[0.38, 0.27, 0.27, 0.04, 0.04], [0.66, 0.17, 0.08, 0.07, 0.02], [0.27, 0.26, 0.30, 0.07, 0.10], [0.22, 0.28, 0.24, 0.02, 0.24]],
    delhi: [[0.55, 0.20, 0.10, 0.05, 0.10], [0.70, 0.15, 0.03, 0.06, 0.06], [0.15, 0.25, 0.40, 0.15, 0.05], [0.30, 0.15, 0.05, 0.0, 0.50]],
  };
  const TYPES = ["clear", "cloudy", "rain", "storm", "fog"];
  const LOOK = { // what each kind of weather does to the world
    clear: { rain: 0, fog: 0, dark: 0, grey: 0, icon: "☀", name: "Clear" },
    cloudy: { rain: 0, fog: 0.05, dark: 0.35, grey: 0.45, icon: "⛅", name: "Cloudy" },
    rain: { rain: 0.7, fog: 0.25, dark: 0.55, grey: 0.75, icon: "🌧", name: "Rain" },
    storm: { rain: 1, fog: 0.3, dark: 0.8, grey: 0.9, icon: "⛈", name: "Thunderstorm" },
    fog: { rain: 0, fog: 1, dark: 0.25, grey: 0.7, icon: "🌫", name: "Fog" },
  };
  // how the land looks: the ground tint, and the colour that leaves are blended towards (with how strongly)
  const LAND = [
    { ground: [0.95, 1.08, 0.95], leaf: 0x6bbf45, k: 0.4 },     // spring: fresh green
    { ground: [1.12, 1.02, 0.82], leaf: 0x8a9a3a, k: 0.35 },    // summer: dry and golden
    { ground: [1.1, 0.92, 0.78], leaf: 0xc4721f, k: 0.8 },      // autumn: russet
    { ground: [0.95, 0.98, 1.05], leaf: 0x7d8576, k: 0.6 },     // winter: pale and bare
  ];

  const cur = { rain: 0, fog: 0, dark: 0, grey: 0 };
  let sky = null, scene = null, forced = null, kind = "clear", season = 0, appliedSeason = -1, lastSky = 0;
  let drops = null, dropPos = null, dropVel = null, boltT = 12, flash = 0, thunderT = -1, hudT = 0, lastBadge = "";
  const N = 1100;

  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const el = (id) => document.getElementById(id);

  // The weather for a day and hour in a city: the same for everyone who is at that time.
  function forecast(c, day, hour) {
    const s = Math.floor(((day - 1) % 28 + 28) % 28 / 7), block = Math.floor((day * 24 + hour) / 5);
    const r = mulberry(block * 7919 + (c === "delhi" ? 104729 : 1299709) + s * 31)();
    let acc = 0;
    const odds = ODDS[c][s];
    for (let i = 0; i < TYPES.length; i++) { acc += odds[i]; if (r < acc) return { season: s, kind: TYPES[i] }; }
    return { season: s, kind: "clear" };
  }

  function init(skyState, sc) {
    sky = skyState; scene = sc;
    sky.wx = { grey: 0, dark: 0, fogMul: 1 };
    dropPos = new Float32Array(N * 6);
    dropVel = new Float32Array(N);
    for (let i = 0; i < N; i++) { dropPos[i * 6 + 0] = (Math.random() - 0.5) * 70; dropPos[i * 6 + 1] = Math.random() * 40; dropPos[i * 6 + 2] = (Math.random() - 0.5) * 70; dropVel[i] = 30 + Math.random() * 14; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    drops = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xc4d6e8, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    drops.frustumCulled = false; drops.visible = false; drops.renderOrder = 5;
    scene.add(drops);
    refreshLand();
  }

  // season colours: the ground tint and the leaves of every tree and lawn that is marked as foliage
  function refreshLand() {
    if (!scene) return;
    const L = LAND[season];
    if (typeof GROUND !== "undefined" && GROUND) {
      const wet = 1 - 0.14 * cur.rain;
      GROUND.material.color.setRGB(L.ground[0] * wet, L.ground[1] * wet, L.ground[2] * wet);
    }
    if (appliedSeason === season) return;
    appliedSeason = season;
    refreshFoliage();
  }

  function refreshFoliage() {
    if (!scene) return;
    const L = LAND[season], target = new THREE.Color(L.leaf), base = new THREE.Color();
    scene.traverse((o) => {
      const m = o.material;
      if (m && !Array.isArray(m) && m.userData && m.userData.leaf !== undefined && m.color) m.color.copy(base.setHex(m.userData.leaf)).lerp(target, L.k);
    });
  }

  function badge() {
    const look = LOOK[kind], name = (SEASONS[city] || SEASONS.rome)[season], text = `${look.icon} ${look.name} · ${name}`;
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
    const fc = forecast(city, Time.day, Time.hour);
    if (fc.season !== season) { season = fc.season; }
    kind = forced || fc.kind;
    const L = LOOK[kind], k = Math.min(1, dt * 0.18); // about 5 seconds to change
    let moved = false;
    for (const key of ["rain", "fog", "dark", "grey"]) {
      const before = cur[key]; cur[key] += (L[key] - cur[key]) * k;
      if (Math.abs(cur[key] - before) > 1e-4) moved = true;
    }
    if (moved || appliedSeason !== season) {
      sky.wx.grey = cur.grey; sky.wx.dark = cur.dark;
      sky.wx.fogMul = 1 - 0.86 * cur.fog;
      lastSky += dt;
      if (lastSky > 0.25) { lastSky = 0; sky.setHour(Time.hour, true); refreshLand(); }
    }
    // rain streaks around the camera
    const rain = cur.rain;
    drops.visible = rain > 0.03;
    if (drops.visible) {
      const pos = drops.geometry.attributes.position, n = Math.floor(N * Math.min(1, rain)), wind = 4 * (0.5 + rain * 0.5);
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
    Sfx.setWeather(rain);
    lightning(dt);
    hudT += dt; if (hudT > 1) { hudT = 0; badge(); }
  }

  return {
    init, update, refreshFoliage, forecast,
    force(k) { forced = TYPES.includes(k) ? k : null; },
    get kind() { return kind; }, get season() { return season; }, get seasonName() { return (SEASONS[city] || SEASONS.rome)[season]; }, get fog() { return cur.fog; }, get rain() { return cur.rain; },
  };
})();
