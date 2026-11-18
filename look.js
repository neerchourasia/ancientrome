// The look of the game, and the "Look and sound" settings (menu -> Settings -> Look): the colour theme (cool, gold, fire, violet) and switches for the screen border, the shimmer on buttons, the tick on button presses and the chime when something is waiting.
// Kept in the browser (rome-look). It sets the colour variables on the page (--g1 to --g5, --grad, --edge, --gold, --panel, --panel-solid, --bar-ok, --spark-hue), so everything that uses them follows. Loaded in the head, before the border, so the first paint already has the right colours.
const Look = (() => {
  "use strict";
  const KEY = "rome-look";
  const THEMES = {
    cool:   { name: "Cool",   stops: ["#ffe066", "#a6e35c", "#3ec97c", "#38bdf8", "#5b8def"], accent: "#3ec97c", edge: "#5fe0b0", panel: "rgba(12,24,32,.82)", solid: "rgba(12,24,32,.97)", barOk: "#3ec97c, #38bdf8", hue: "0deg" },
    gold:   { name: "Gold",   stops: ["#fff1b8", "#ffd24a", "#e2b955", "#d48a2c", "#a0601c"], accent: "#e2b955", edge: "#f0cf7a", panel: "rgba(30,23,14,.84)", solid: "rgba(26,20,12,.97)", barOk: "#6fbf5a, #e2b955", hue: "-135deg" },
    fire:   { name: "Fire",   stops: ["#fff0a0", "#ffc24a", "#ff8a3a", "#ff4d4d", "#c0262b"], accent: "#ff8a3a", edge: "#ffb070", panel: "rgba(32,14,14,.84)", solid: "rgba(28,12,12,.97)", barOk: "#7bd36a, #ffc24a", hue: "-165deg" },
    violet: { name: "Violet", stops: ["#fdf0ff", "#f5a3ff", "#c084fc", "#8b5cf6", "#5b8def"], accent: "#c084fc", edge: "#d6b0ff", panel: "rgba(22,14,34,.84)", solid: "rgba(20,12,32,.97)", barOk: "#c084fc, #5b8def", hue: "75deg" },
  };
  const DEFAULTS = { theme: "cool", border: true, shimmer: true, tick: true, chime: true };
  let s = { ...DEFAULTS };
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null"); if (o && typeof o === "object") for (const k of Object.keys(DEFAULTS)) if (typeof o[k] === typeof DEFAULTS[k] && (k !== "theme" || THEMES[o[k]])) s[k] = o[k]; } catch (e) { /* storage unavailable or broken: use the defaults */ }

  const root = document.documentElement;
  const grad = (t) => `linear-gradient(115deg, ${t.stops[0]} 0%, ${t.stops[1]} 22%, ${t.stops[2]} 44%, ${t.stops[3]} 72%, ${t.stops[4]} 100%)`;
  function apply() {
    const t = THEMES[s.theme], st = root.style;
    t.stops.forEach((c, i) => st.setProperty("--g" + (i + 1), c));
    st.setProperty("--grad", grad(t)); st.setProperty("--gold", t.accent); st.setProperty("--edge", t.edge);
    st.setProperty("--panel", t.panel); st.setProperty("--panel-solid", t.solid);
    st.setProperty("--bar-ok", `linear-gradient(90deg, ${t.barOk})`); st.setProperty("--spark-hue", t.hue);
    root.setAttribute("data-theme", s.theme);
    root.classList.toggle("look-noborder", !s.border);
    root.classList.toggle("look-noshimmer", !s.shimmer);
    window.dispatchEvent(new Event("lookchange"));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }
  apply();

  // ---- the settings window (made when the page is ready) ----
  function build() {
    if (document.getElementById("look")) return;
    const p = document.createElement("div");
    p.id = "look"; p.className = "dpanel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Look and sound");
    p.innerHTML = '<div class="box"><header><h2>🎨 Look and sound</h2><button type="button" class="dclose" aria-label="Close">×</button></header>'
      + '<p class="dnote">Pick the colours of the game.</p><div id="look-themes"></div>'
      + '<label class="look-row"><input type="checkbox" id="look-border"> The wavy border round the screen</label>'
      + '<label class="look-row"><input type="checkbox" id="look-shimmer"> A shimmer when you point at a button</label>'
      + '<label class="look-row"><input type="checkbox" id="look-tick"> A soft tick when you press a button</label>'
      + '<label class="look-row"><input type="checkbox" id="look-chime"> A chime when something is waiting for you (a gift, a message)</label></div>';
    document.body.appendChild(p);
    const box = p.querySelector("#look-themes");
    for (const [id, t] of Object.entries(THEMES)) {
      const b = document.createElement("button"); b.type = "button"; b.dataset.theme = id; b.textContent = t.name; b.style.cssText = "margin:0 6px 6px 0";
      b.addEventListener("click", () => { s.theme = id; save(); apply(); sync(); });
      box.append(b);
    }
    for (const k of ["border", "shimmer", "tick", "chime"]) p.querySelector("#look-" + k).addEventListener("change", (e) => { s[k] = e.target.checked; save(); apply(); });
    p.querySelector(".dclose").addEventListener("click", () => { if (typeof closePanels === "function") closePanels(); else p.classList.remove("show"); });
    const pop = document.querySelector("#btn-controls") && document.querySelector("#btn-controls").parentElement;
    if (pop) {
      const b = document.createElement("button"); b.type = "button"; b.id = "btn-look"; b.textContent = "🎨 Look and sound";
      b.addEventListener("click", () => { sync(); if (typeof openPanel === "function") openPanel("#look"); else p.classList.add("show"); });
      pop.insertBefore(b, document.querySelector("#btn-controls"));
    }
    sync();
  }
  function sync() {
    for (const b of document.querySelectorAll("#look-themes button")) b.classList.toggle("on", b.dataset.theme === s.theme);
    for (const k of ["border", "shimmer", "tick", "chime"]) { const c = document.getElementById("look-" + k); if (c) c.checked = !!s[k]; }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();

  return {
    THEMES, apply,
    get theme() { return s.theme; },
    get tick() { return s.tick; }, get chime() { return s.chime; },
    stops: () => THEMES[s.theme].stops,
  };
})();
