"use strict";
// The class scavenger hunt: a teacher's link (class.html) can name the sights to find (?hunt=forum,pantheon,rostra). A checklist shows at the left of the screen (the sights' names change to Latin
// with the Latin names on); each is ticked when the student discovers it (the game's ordinary discovery: walk up to it). When the last one is found a finished screen shows the student's name,
// the class, the time it took, the sights and a short check code, to show the teacher. The start time is kept in the browser tab (storage, which in class mode is per tab), so a reload does not
// restart the clock. Depends on game.js (ALL_LANDMARKS, discovered, Character, openPanel, toast) and classmode.js.

const Hunt = (() => {
  const KEY = "rome-hunt";
  let ids = [], t0 = 0, doneAt = 0, shown = "", hud = null;
  const $h = (id) => document.getElementById(id);
  const lm = (id) => ALL_LANDMARKS.find((l) => l.id === id);
  const tr = (t) => (typeof I18n !== "undefined" && I18n.t ? I18n.t(t) : t);

  function start(list) {
    ids = [...new Set(list)].filter((id) => { const l = lm(id); return l && !l.home && !l.game; }).slice(0, 12);
    if (!ids.length) return false;
    try { const r = JSON.parse(localStorage.getItem(KEY) || "null"); if (r && r.ids === ids.join(",")) { t0 = r.t0; doneAt = r.doneAt || 0; } } catch (e) { /* storage unavailable */ }
    if (!t0) t0 = Date.now();
    save(); render(); return true;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ids: ids.join(","), t0, doneAt })); } catch (e) { /* ignore */ } };
  const found = () => ids.filter((id) => discovered.has(id));
  const mmss = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const code = (secs) => (hash(`${Character.name}|${(window.CLASSMODE && CLASSMODE.name) || ""}|${ids.join(",")}|${secs}`) % 60466176).toString(36).toUpperCase().padStart(5, "0");

  function render() {
    if (!ids.length) return;
    hud = hud || $h("hunt-hud"); if (!hud) return;
    const got = found(), key = got.join(",") + (typeof Latin !== "undefined" && Latin.active ? "L" : "") + (typeof I18n !== "undefined" ? I18n.lang : "");
    if (key === shown) return;
    shown = key;
    const rows = ids.map((id) => { const li = document.createElement("li"); li.textContent = `${got.includes(id) ? "✓" : "○"} ${tr(lm(id).name)}`; if (got.includes(id)) li.className = "got"; return li; });
    const h = document.createElement("strong"); h.textContent = tr("Sights to find: {0} of {1}").replace("{0}", got.length).replace("{1}", ids.length);
    const ul = document.createElement("ul"); ul.append(...rows);
    hud.replaceChildren(h, ul); hud.hidden = false;
  }

  function finish() {
    if (!doneAt) { doneAt = Date.now(); save(); }
    const secs = Math.round((doneAt - t0) / 1000), body = $h("hd-body");
    const line = (t) => { const p = document.createElement("p"); p.textContent = t; return p; };
    const ul = document.createElement("ul"); ul.className = "hd-list";
    for (const id of ids) { const li = document.createElement("li"); li.textContent = `✓ ${tr(lm(id).name)}`; ul.append(li); }
    body.replaceChildren(
      line(`${Character.name}${window.CLASSMODE && CLASSMODE.name ? " · " + CLASSMODE.name : ""}`),
      line(tr("Time: {0}").replace("{0}", mmss(doneAt - t0))), ul,
      line(tr("Check code: {0}").replace("{0}", code(secs))));
    openPanel("#huntdone");
    if (typeof Sfx !== "undefined") Sfx.play("medal");
  }
  let last = 0;
  function update(dt) {
    if (!ids.length || typeof started === "undefined" || !started) return;
    last -= dt; if (last > 0) return; last = 1;
    render();
    if (!doneAt && found().length === ids.length) finish();
  }
  const reopen = () => { if (doneAt) finish(); };
  return { start, update, reopen, get progress() { return ids.length ? { n: found().length, of: ids.length, done: doneAt ? Math.round((doneAt - t0) / 1000) : 0 } : null; }, get active() { return ids.length > 0; }, get done() { return !!doneAt; } };
})();
