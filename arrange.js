// Arrange the screen and the view modes (menu -> Settings -> Arrange the screen / View: Full, Explorer or Real life, which shows nothing but the menu).
// Arrange the screen: drag each box of the game's screen (the landmark card, the status box, the map, the menu, the title, the day and place, the controls hint) where you like, or hide the ones you do not need.
// The boxes themselves are not touched while you drag: a dashed frame sits over each one, and the frame carries the drag and the hide button. The places are kept in the browser (rome-layout) as a share of the window, so they still fit when the window changes size.
// The menu button and the menu bar can be moved but not hidden (you would lose the way back to this).
const Arrange = (() => {
  "use strict";
  const KEY = "rome-layout";
  const ITEMS = [
    { id: "title",   sel: ".top-left",           label: "Title and progress", hide: true },
    { id: "clock",   sel: ".top-center",         label: "Day and place",      hide: true },
    { id: "card",    sel: "#card",               label: "Landmark card",      hide: true },
    { id: "vitals",  sel: "#vitals",             label: "Status box",         hide: true },
    { id: "help",    sel: "#help",               label: "Controls hint",      hide: true },
    { id: "map",     sel: "#minimap",            label: "Map",                hide: true },
    { id: "menubtn", sel: "#btn-menu",           label: "Menu button",        hide: false },
    { id: "menubar", sel: ".top-right .buttons", label: "Menu bar",           hide: false },
  ];
  let st = {}, on = false, frames = [], bar = null, raf = 0;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && typeof o === "object") st = o; } catch (e) { /* storage unavailable or broken: no saved places */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ } };
  const el = (i) => document.querySelector(i.sel);
  const num = (v) => typeof v === "number" && isFinite(v);

  function put(e, left, top) {
    const s = e.style, W = window.innerWidth, H = window.innerHeight, r = e.getBoundingClientRect();
    left = Math.min(Math.max(left, 40 - r.width), W - 40); top = Math.min(Math.max(top, 0), H - 30);
    s.setProperty("left", left + "px", "important"); s.setProperty("top", top + "px", "important");
    s.setProperty("right", "auto", "important"); s.setProperty("bottom", "auto", "important"); s.setProperty("transform", "none", "important");
    return [left, top];
  }
  function clear(e) { for (const p of ["left", "top", "right", "bottom", "transform"]) e.style.removeProperty(p); }
  function applyAll() {
    const W = window.innerWidth, H = window.innerHeight;
    for (const i of ITEMS) {
      const e = el(i); if (!e) continue;
      const o = st[i.id];
      if (o && num(o.x) && num(o.y)) put(e, o.x * W, o.y * H); else clear(e);
      e.classList.toggle("lay-hidden", !!(i.hide && o && o.hidden));
    }
  }

  // ---- the arranging mode ----
  function makeFrame(i) {
    const f = document.createElement("div");
    f.className = "lay-frame"; f.dataset.id = i.id;
    f.innerHTML = '<span class="lay-label"></span>' + (i.hide ? '<button type="button" class="lay-x"></button>' : "");
    f.querySelector(".lay-label").textContent = i.label;
    const x = f.querySelector(".lay-x");
    if (x) x.addEventListener("click", (ev) => { ev.stopPropagation(); const o = st[i.id] || (st[i.id] = {}); o.hidden = !o.hidden; save(); applyAll(); refresh(); });
    let drag = null;
    f.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest(".lay-x")) return;
      const e = el(i); if (!e) return;
      const r = e.getBoundingClientRect();
      drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      f.setPointerCapture(ev.pointerId); ev.preventDefault();
    });
    f.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const e = el(i); if (!e) return;
      const [l, t] = put(e, ev.clientX - drag.dx, ev.clientY - drag.dy);
      const o = st[i.id] || (st[i.id] = {}); o.x = l / window.innerWidth; o.y = t / window.innerHeight;
    });
    const end = () => { if (drag) { drag = null; save(); } };
    f.addEventListener("pointerup", end); f.addEventListener("pointercancel", end);
    document.body.appendChild(f);
    return { i, f, x };
  }
  function refresh() {                    // keep each frame over its box (the boxes grow, shrink and slide), and show hidden boxes as ghosts
    for (const fr of frames) {
      const e = el(fr.i), r = e ? e.getBoundingClientRect() : null;
      if (!r || r.width < 4 || r.height < 4) { fr.f.style.display = "none"; continue; }
      const s = fr.f.style; s.display = "block"; s.left = r.left + "px"; s.top = r.top + "px"; s.width = r.width + "px"; s.height = r.height + "px";
      const hidden = !!(st[fr.i.id] && st[fr.i.id].hidden);
      fr.f.classList.toggle("ghost", hidden);
      if (fr.x) { fr.x.textContent = hidden ? "+" : "×"; fr.x.title = hidden ? "Bring it back" : "Hide it"; }
    }
  }
  const loop = () => { if (!on) return; refresh(); raf = requestAnimationFrame(loop); };
  function swallow(ev) { if (!on) return; if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); stop(); } else if (!(ev.target && ev.target.closest && ev.target.closest("#lay-bar"))) ev.stopImmediatePropagation(); }

  function start() {
    if (on) return;
    if (typeof mode !== "undefined" && mode !== "walk") { if (typeof toast === "function") toast("Finish what you are doing first"); return; }
    if (typeof closePanels === "function") closePanels();
    if (document.pointerLockElement) document.exitPointerLock();
    for (const g of document.querySelectorAll(".mgroup.open")) g.classList.remove("open");       // the menu stays open, but folded
    const mb = document.getElementById("btn-menu");
    if (mb && mb.getAttribute("aria-expanded") !== "true") mb.click();                           // the menu bar must be showing to be arranged
    on = true; document.body.classList.add("arranging");
    frames = ITEMS.map(makeFrame);
    bar = document.createElement("div"); bar.id = "lay-bar";
    bar.innerHTML = '<span>Drag the boxes where you like. × hides a box, + brings it back.</span> <button type="button" id="lay-reset">Put everything back</button> <button type="button" id="lay-done">Done</button>';
    document.body.appendChild(bar);
    bar.querySelector("#lay-done").addEventListener("click", stop);
    bar.querySelector("#lay-reset").addEventListener("click", () => { st = {}; save(); applyAll(); refresh(); });
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    if (!on) return;
    on = false; cancelAnimationFrame(raf);
    document.body.classList.remove("arranging");
    for (const fr of frames) fr.f.remove();
    frames = []; if (bar) { bar.remove(); bar = null; }
    applyAll();
  }

  window.addEventListener("keydown", swallow, true); window.addEventListener("keyup", (ev) => { if (on) ev.stopImmediatePropagation(); }, true);
  window.addEventListener("resize", () => applyAll());
  // ---- the view modes: how much of the screen is shown (menu -> Settings -> View) ----
  const VIEWS = [
    { id: "full",     label: "Full",      say: "Full view: everything on the screen." },
    { id: "explorer", label: "Explorer",  say: "Explorer view: the map, the status box and the menu. The rest is hidden." },
    { id: "real",     label: "Real life", say: "Real life: nothing but the menu. Open the menu, then Settings, then View to bring the screen back." },
  ];
  const VKEY = "rome-view";
  let view = "full";
  try { const v = localStorage.getItem(VKEY); if (VIEWS.some((x) => x.id === v)) view = v; } catch (e) { /* storage unavailable */ }
  function showView(say) {
    const root = document.documentElement, v = VIEWS.find((x) => x.id === view);
    for (const x of VIEWS) root.classList.toggle("view-" + x.id, x.id === view);
    const b = document.getElementById("btn-screenview"); if (b) b.textContent = "👁 View: " + v.label;
    if (say && typeof toast === "function") toast(v.say);
  }
  function setView(id, say) {
    if (!VIEWS.some((x) => x.id === id)) return;
    view = id; try { localStorage.setItem(VKEY, view); } catch (e) { /* ignore */ }
    showView(say);
  }
  const nextView = () => VIEWS[(VIEWS.findIndex((x) => x.id === view) + 1) % VIEWS.length].id;
  showView(false);                                   // the right view from the very first paint (the class is on <html>)

  function ready() {
    applyAll(); showView(false);
    const b = document.getElementById("btn-arrange"); if (b) b.addEventListener("click", start);
    const v = document.getElementById("btn-screenview"); if (v) v.addEventListener("click", () => setView(nextView(), true));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready); else ready();
  return { start, stop, setView, get view() { return view; }, reset() { st = {}; save(); applyAll(); }, get active() { return on; } };
})();
