// The frame round the screen: a ribbon in the yellow-green-blue colours whose inner edge wobbles, thick in one place and thin in another, with a few bumps, like a hand-drawn swoosh.
// (It also holds the one name-tag background that the labels over people and ships use: coolTagBg.)
// It is one SVG over everything that never catches a click, drawn again when the window changes size.
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg", STEP = 6;
  const svg = document.createElementNS(NS, "svg");
  svg.id = "frame"; svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none;filter:drop-shadow(0 0 5px rgba(56,189,248,.55))";
  svg.innerHTML = '<defs><linearGradient id="frameGrad" gradientUnits="userSpaceOnUse"><stop offset="0"/><stop offset=".22"/><stop offset=".44"/><stop offset=".72"/><stop offset="1"/></linearGradient></defs><path id="framePath" fill="url(#frameGrad)" fill-rule="evenodd" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/>';
  const path = svg.lastChild, grad = svg.firstChild.firstChild;
  // how far the inner edge is from the screen edge at distance s along the way round (pixels): thicker towards the top left, thinner at the bottom right, with waves and bumps
  const thick = (s, P) => {
    const p = s / P, d = 7 + 6 * (0.5 + 0.5 * Math.cos(6.2832 * p)) + 3 * Math.sin(s / 80) + 2 * Math.sin(s / 29 + 1) + 6 * Math.pow(Math.max(0, Math.sin(s / 170)), 3);
    return Math.max(5, Math.min(21, d)) * K;
  };
  // the five colours of the gradient, from the theme (look.js) or the page's variables
  const stops = () => { const cs = getComputedStyle(document.documentElement); return [1, 2, 3, 4, 5].map((i) => cs.getPropertyValue("--g" + i).trim() || ["#ffe066", "#a6e35c", "#3ec97c", "#38bdf8", "#5b8def"][i - 1]); };
  function colour() { const c = stops(); grad.querySelectorAll("stop").forEach((e, i) => e.setAttribute("stop-color", c[i])); svg.style.filter = "drop-shadow(0 0 5px " + c[3] + ")"; }
  let K = 1;   // thinner on small screens
  function draw() {
    const W = window.innerWidth, H = window.innerHeight, P = 2 * (W + H), pts = [];
    K = Math.max(0.45, Math.min(1, Math.min(W, H) / 700));
    let s = 0;
    for (let x = 0; x < W; x += STEP, s += STEP) pts.push([x, thick(s, P)]);                        // along the top, left to right
    for (let y = 0; y < H; y += STEP, s += STEP) pts.push([W - thick(s, P), y]);                    // down the right
    for (let x = W; x > 0; x -= STEP, s += STEP) pts.push([x, H - thick(s, P)]);                    // along the bottom, right to left
    for (let y = H; y > 0; y -= STEP, s += STEP) pts.push([thick(s, P), y]);                        // up the left
    path.setAttribute("d", `M0 0H${W}V${H}H0Z M${pts.map(q => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L")}Z`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    colour();
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", String(W)); grad.setAttribute("y2", String(H));
  }
  let queued = false;
  const redraw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); };
  window.addEventListener("resize", redraw);
  window.addEventListener("lookchange", redraw);
  draw();
  const calm = (window.GAMEOPTS && window.GAMEOPTS.low) || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (!calm) svg.animate([{ opacity: 0.82 }, { opacity: 1 }], { duration: 3600, iterations: Infinity, direction: "alternate", easing: "ease-in-out" });
  (document.body || document.documentElement).appendChild(svg);
})();

// The plate behind a name over a person or a ship (drawn on the 256 x 64 label canvas, text drawn by the caller on top): a rounded dark blue-green pill with a yellow-green-blue edge.
window.coolTagBg = function (g) {
  const r = 22, x = 5, y = 9, w = 246, h = 46;
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r); g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r); g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  g.fillStyle = "rgba(6,26,32,.82)"; g.fill();
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  const cs = getComputedStyle(document.documentElement), c = [1, 2, 3, 4, 5].map((i) => cs.getPropertyValue("--g" + i).trim() || ["#ffe066", "#a6e35c", "#3ec97c", "#38bdf8", "#5b8def"][i - 1]);
  [0, 0.25, 0.5, 0.75, 1].forEach((o, i) => gr.addColorStop(o, c[i]));
  g.lineWidth = 4; g.strokeStyle = gr; g.stroke();
};
