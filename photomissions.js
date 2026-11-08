"use strict";
// Photo missions: 📸 Photo missions in the menu (Play and compete). Every sight in the city you are in has a mission: photograph it at a certain time of day (in the morning, at midday, at
// sunset or at night; the time for each sight is fixed, so a class gets the same missions). Open photo mode (📷), stand where the sight is in the picture and at the right time (press T to jump
// the time of day), and press 🎯 Mission shot (or Take photo, which also saves the picture as a file): the missions that match are stamped in your album with a small picture of what you
// shot, and each pays 60 aspcgua. Every mission of a city done pays a bonus. The album is kept in this browser (in class mode: this tab). It is only on your own screen.
// Depends on game.js (LANDMARKS, camera, renderer, scene, player, groundAt, mode, openPanel, toast), home.js (Time) and emotes.js (Photo).

const PhotoMissions = (() => {
  const KEY = "rome-photos", REWARD = 60, BONUS = 300;
  const WINDOWS = [
    { id: "morning", name: "in the morning", from: 7, to: 11 },
    { id: "midday", name: "at midday", from: 11, to: 15 },
    { id: "sunset", name: "at sunset", from: 17, to: 20.5 },
    { id: "night", name: "at night", from: 21, to: 28 },
  ];
  const $p = (id) => document.getElementById(id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  let album = {};
  try { album = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { album = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(album)); } catch (e) { /* storage full or unavailable: the stamps last until the page closes */ } };

  const inWindow = (w, h) => (w.to > 24 ? h >= w.from || h < w.to - 24 : h >= w.from && h < w.to);
  const windowOf = (lm) => WINDOWS[hash(lm.id) % WINDOWS.length];
  const missions = () => LANDMARKS.filter((l) => !l.home && !l.game).map((lm) => ({ lm, w: windowOf(lm) }));
  const clock = () => { const h = Time.hour, m = Math.floor((h % 1) * 60); return `${String(Math.floor(h)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; };
  const text = (m) => tr("Photograph {0} {1}").replace("{0}", tr(m.lm.name)).replace("{1}", tr(m.w.name));

  // is the sight in the picture? In front of the camera, near enough to be seen and not a speck, and near the middle of the frame.
  const v = new THREE.Vector3();
  function inView(lm) {
    const d = Math.hypot(camera.position.x - lm.x, camera.position.z - lm.z);
    if (d > Math.max(80, lm.r * 3.5)) return false;
    v.set(lm.x, groundAt(lm.x, lm.z) + Math.max(4, lm.r * 0.25), lm.z).project(camera);
    return v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85;
  }

  // a small picture of what the camera sees, to stamp in the album
  function thumb() {
    try {
      renderer.render(scene, camera);
      const src = renderer.domElement, w = 200, h = Math.max(60, Math.round(w * src.height / src.width)), c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(src, 0, 0, w, h);
      return c.toDataURL("image/jpeg", 0.6);
    } catch (e) { return ""; }
  }

  // a shot: stamp every mission that matches. quiet: no message when nothing matches (the Take photo button saves a file as well)
  function shot(quiet) {
    const hour = Time.hour, all = missions(), got = [];
    let img = "";
    for (const m of all) {
      if (album[m.lm.id] || !inWindow(m.w, hour) || !inView(m.lm)) continue;
      img = img || thumb();
      album[m.lm.id] = { t: Date.now(), hour: Math.round(hour * 10) / 10, img };
      got.push(m);
    }
    if (got.length) {
      save();
      Vitals.coins += got.length * REWARD;
      if (typeof Sfx !== "undefined") Sfx.play("discover");
      toast(`📸 ${tr("Mission done")}: ${got.map((m) => tr(m.lm.name)).join(", ")} (+${got.length * REWARD})`);
      if (all.every((m) => album[m.lm.id])) { Vitals.coins += BONUS; setTimeout(() => toast(`🏆 ${tr("Every photo mission here is done!")} (+${BONUS})`), 3400); }
      if (!$p("photopanel").classList.contains("show")) renderStatus(); else renderAlbum();
      return true;
    }
    if (!quiet) {
      const seen = all.filter((m) => !album[m.lm.id] && inView(m.lm));
      if (!seen.length) toast(tr("No photo mission sight is in the picture."));
      else toast(`${tr("Wrong time of day")}: ${tr(seen[0].lm.name)} ${tr(seen[0].w.name)} (${tr("now")} ${clock()})`);
    }
    return false;
  }

  // what you see in photo mode: the missions in front of the camera and whether the time is right
  function renderStatus() {
    const box = $p("photo-mission"); if (!box) return;
    const all = missions(), hour = Time.hour, seen = all.filter((m) => !album[m.lm.id] && inView(m.lm)).slice(0, 3), done = all.filter((m) => album[m.lm.id]).length;
    const lines = seen.map((m) => `${inWindow(m.w, hour) ? "✓" : "○"} ${tr(m.lm.name)} ${tr(m.w.name)}`);
    box.textContent = `🎯 ${done} / ${all.length} · ${clock()}${lines.length ? " · " + lines.join(" · ") : ""}`;
  }

  // ---- the album panel
  function renderAlbum() {
    const body = $p("photo-body"); if (!body) return;
    const el = (t, x, c) => { const e = document.createElement(t); if (x !== undefined) e.textContent = x; if (c) e.className = c; return e; };
    const all = missions(), done = all.filter((m) => album[m.lm.id]).length, hour = Time.hour;
    const head = el("p", `${tr("Photographed")}: ${done} / ${all.length} · ${tr("Time now")}: ${clock()} · ${tr("Press T to jump the time of day, then open 📷 Photo mode and press 🎯 Mission shot.")}`, "pm-intro");
    const grid = el("div", undefined, "pm-grid");
    const sorted = all.slice().sort((a, b) => (album[a.lm.id] ? 1 : 0) - (album[b.lm.id] ? 1 : 0) || Math.hypot(a.lm.x - player.x, a.lm.z - player.z) - Math.hypot(b.lm.x - player.x, b.lm.z - player.z));
    for (const m of sorted) {
      const a = album[m.lm.id], card = el("div", undefined, "pm-card" + (a ? " done" : ""));
      if (a && a.img) { const im = el("img"); im.src = a.img; im.alt = m.lm.name; card.append(im); }
      else card.append(el("div", a ? "✓" : "📷", "pm-ph"));
      card.append(el("strong", tr(m.lm.name)));
      card.append(el("small", a ? `✓ ${tr(m.w.name)} · ${String(Math.floor(a.hour)).padStart(2, "0")}:00` : `${tr(m.w.name)}${inWindow(m.w, hour) ? " · " + tr("it is the right time now") : ""}`));
      if (!a) { const go = el("button", tr("Directions")); go.type = "button"; go.addEventListener("click", () => startDirections(m.lm)); card.append(go); }
      grid.append(card);
    }
    body.replaceChildren(head, grid);
  }
  function open() {
    if (mode !== "walk" || panelOpen) { toast(tr("Close what is open and stop the game first")); return; }
    renderAlbum(); openPanel("#photopanel");
  }
  function bind() {
    const b = $p("btn-album"); if (b) b.addEventListener("click", open);
    const s = $p("photo-snap"); if (s) s.addEventListener("click", () => shot(false));
    setInterval(() => { if (typeof Photo !== "undefined" && Photo.on) renderStatus(); }, 500);
  }
  return { bind, open, shot, get done() { return Object.keys(album).length; } };
})();
