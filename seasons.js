"use strict";
// Seasonal collections: 🍂 Seasons in the menu. Each season of each city (the game year has four, and Weather.seasonName names them for the city you are in) hides six specimens, little glowing things in the
// colours of the season (spring blossoms, summer shells and fruit, autumn leaves, winter crystals), each near a different sight. Walk up to one to take it: 8 denarii each and 80 more for the six. The
// album shows every city and every season (the ones you have not met yet are dark), tells you which sights still hide a specimen, and can lead you there (G-style directions). A season's set can be
// collected again every year, but only counts once. Kept in the browser (rome-seasons) and the saved game. Depends on weather.js (Weather.season), the landmarks of each city and the globals of game.js.

const Seasons = (() => {
  const T = THREE;
  const KEY = "rome-seasons", COUNT = 6, EACH = 8, BONUS = 80, REACH = 2.4;
  const CITIES = ["rome", "delhi", "cancun", "beijing"], CITY_NAMES = { rome: "Rome", delhi: "Old Delhi", cancun: "Cancún", beijing: "Beijing" };
  // what is found in each season (the same four kinds everywhere: the game's seasons are numbered 0 to 3 in every city), and what they look like
  const KINDS = [
    { word: "blossom", plural: "blossoms", icon: "🌸", color: 0xf6a6c4 }, { word: "shell", plural: "shells", icon: "🐚", color: 0xffd36b }, { word: "leaf", plural: "leaves", icon: "🍂", color: 0xd9731f }, { word: "frost crystal", plural: "frost crystals", icon: "❄️", color: 0xa8d8ff },
  ];
  const SEASON_NAMES = {
    rome: ["Spring", "Summer", "Autumn", "Winter"], delhi: ["Spring", "Summer", "Monsoon", "Winter"], cancun: ["Dry season", "Hot season", "Hurricane season", "Cooler season"], beijing: ["Spring", "Summer rains", "Autumn", "Cold winter"],
  };
  let got = {}, set = [], builtKey = "";
  const group = new T.Group();
  let added = false;
  const clean = (raw) => { const o = {}; if (raw && typeof raw === "object") for (const c of CITIES) for (let s = 0; s < 4; s++) { const a = raw[`${c}-${s}`]; if (Array.isArray(a)) o[`${c}-${s}`] = [...new Set(a.filter((i) => Number.isInteger(i) && i >= 0 && i < COUNT))]; } return o; };
  try { got = clean(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { got = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(got)); } catch (e) { /* ignore */ } };
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const $s = (id) => document.getElementById(id);
  const seeded = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const keyNow = () => `${city}-${Weather.season}`;
  const haveN = (k) => (got[k] || []).length;
  const done = (k) => haveN(k) >= COUNT;

  // six sights for the season, always the same ones for a city and season, and a spot near each
  function pick() {
    const key = keyNow(), rnd = seeded(`seasons-${key}`), lms = LANDMARKS.filter((l) => !l.home && !l.game && !l.id.startsWith("m-") && !l.id.endsWith("-metro") && !(l.only && l.only !== era));
    const order = lms.map((l, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).map((x) => lms[x[1]]).slice(0, COUNT), out = [];
    order.forEach((lm, i) => {
      let x = lm.x, z = lm.z;
      for (let t = 0; t < 30; t++) { const a = rnd() * Math.PI * 2, r = (lm.r || 20) + 6 + rnd() * 8; x = lm.x + Math.cos(a) * r; z = lm.z + Math.sin(a) * r; if (canMove(x, z, x + 0.1, z)) break; }
      out.push({ i, x, z, lm: lm.name, id: lm.id });
    });
    return out;
  }
  function rebuild() {
    const key = keyNow() + era;
    if (key === builtKey) return;
    builtKey = key;
    if (!added) { worldScene.add(group); added = true; }
    group.clear();
    set = pick();
    const kind = KINDS[Weather.season], mat = new T.MeshBasicMaterial({ color: kind.color, transparent: true, opacity: 0.9 });
    for (const s of set) {
      const m = new T.Mesh(new T.OctahedronGeometry(0.34), mat); m.position.set(s.x, groundAt(s.x, s.z) + 0.9, s.z); m.userData.i = s.i;
      const beam = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 6, 6), new T.MeshBasicMaterial({ color: kind.color, transparent: true, opacity: 0.25, depthWrite: false })); beam.position.set(0, 3, 0); m.add(beam);
      s.mesh = m; group.add(m);
    }
    sync();
  }
  function sync() { const have = got[keyNow()] || []; for (const s of set) if (s.mesh) s.mesh.visible = !have.includes(s.i); }

  function update(dt) {
    if (typeof started === "undefined" || !started || typeof Weather === "undefined" || typeof worldScene === "undefined" || !worldScene) return;
    rebuild();
    const t = performance.now() / 1000, k = keyNow(), have = got[k] || [];
    for (const s of set) {
      if (!s.mesh || !s.mesh.visible) continue;
      s.mesh.rotation.y = t * 1.6 + s.i; s.mesh.position.y = groundAt(s.x, s.z) + 0.9 + Math.sin(t * 2 + s.i) * 0.12;
      if (mode !== "walk" && mode !== "drive") continue;
      if (Math.hypot(player.x - s.x, player.z - s.z) < REACH && !have.includes(s.i)) take(s, k);
    }
  }
  function take(s, k) {
    const arr = got[k] || (got[k] = []);
    arr.push(s.i); save(); sync(); Vitals.coins += EACH; Sfx.play("discover"); if (typeof Guilds !== "undefined") Guilds.score("spec"); 
    const kind = KINDS[Weather.season];
    if (arr.length >= COUNT) { Vitals.coins += BONUS; Sfx.play("medal"); if (typeof Guilds !== "undefined") Guilds.score("set");  toast(`${kind.icon} ${tr("The whole set of")} ${tr(kind.plural)}: ${tr(CITY_NAMES[city])}, ${tr(SEASON_NAMES[city][Weather.season])}! +${EACH + BONUS} ${tr("denarii")}`); }
    else toast(`${kind.icon} ${tr(kind.word)} ${tr("near")} ${tr(s.lm)} (${arr.length} ${tr("of")} ${COUNT}, +${EACH} ${tr("denarii")})`);
    if ($s("seasons") && $s("seasons").classList.contains("show")) render();
  }

  // ---------------------------------------------------------------- the album
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  function render() {
    const body = $s("se-body"); if (!body) return;
    const rows = [], total = Object.values(got).filter((a) => a.length >= COUNT).length;
    rows.push(el("p", `${total} ${tr("of 16 sets complete. This season:")} ${tr(CITY_NAMES[city])}, ${tr(SEASON_NAMES[city][Weather.season])}.`, "dnote"));
    for (const c of CITIES) {
      rows.push(el("h3", tr(CITY_NAMES[c])));
      const line = el("div", undefined, "sk-menu");
      for (let s = 0; s < 4; s++) { const k = `${c}-${s}`, n = haveN(k), b = el("span", `${KINDS[s].icon} ${tr(SEASON_NAMES[c][s])}: ${n}/${COUNT}${n >= COUNT ? " ✓" : ""}`); b.style.cssText = `padding:2px 8px;border-radius:10px;border:1px solid currentColor;margin:2px;opacity:${n ? 1 : 0.45};${c === city && s === Weather.season ? "font-weight:700;" : ""}`; line.append(b); }
      rows.push(line);
    }
    const k = keyNow(), have = got[k] || [], left = set.filter((s) => !have.includes(s.i));
    rows.push(el("h3", tr("Still hidden this season")));
    if (!left.length) rows.push(el("p", tr("You have found them all here. Come back when the season changes."), "dnote"));
    for (const s of left) {
      const p = el("p", `${KINDS[Weather.season].icon} ${tr("Near")} ${tr(s.lm)}`, "st-now"), lm = LANDMARKS.find((l) => l.id === s.id);
      if (lm) { const b = el("button", tr("Show me the way")); b.type = "button"; b.addEventListener("click", () => { closePanels(); if (typeof startDirections === "function") { try { startDirections(lm); } catch (e) { /* ignore */ } } }); p.append(" ", b); }
      rows.push(p);
    }
    body.replaceChildren(...rows);
  }
  function open() { rebuild(); render(); openPanel("#seasons"); }
  function bind() { const b = $s("btn-seasons"); if (b) b.addEventListener("click", open); }
  return {
    bind, update, open,
    snapshot: () => JSON.parse(JSON.stringify(got)),
    restore(raw) { got = clean(raw); save(); sync(); },
    merge(raw) { const o = clean(raw); for (const k of Object.keys(o)) got[k] = [...new Set((got[k] || []).concat(o[k]))]; save(); sync(); },
    get sets() { return Object.values(got).filter((a) => a.length >= COUNT).length; }, _set: () => set,
  };
})();
