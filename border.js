// The frame round the screen: a ribbon in the yellow-green-blue colours whose inner edge wobbles, thick in one place and thin in another, with a few bumps, like a hand-drawn swoosh.
// It is one SVG over everything that never catches a click, drawn again when the window changes size.
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg", STEP = 6;
  const svg = document.createElementNS(NS, "svg");
  svg.id = "frame"; svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;pointer-events:none;filter:drop-shadow(0 0 5px rgba(56,189,248,.55))";
  svg.innerHTML = '<defs><linearGradient id="frameGrad" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe066"/><stop offset=".22" stop-color="#a6e35c"/><stop offset=".44" stop-color="#3ec97c"/><stop offset=".72" stop-color="#38bdf8"/><stop offset="1" stop-color="#5b8def"/></linearGradient></defs><path id="framePath" fill="url(#frameGrad)" fill-rule="evenodd" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/>';
  const path = svg.lastChild, grad = svg.firstChild.firstChild;
  // how far the inner edge is from the screen edge at distance s along the way round (pixels): thicker towards the top left, thinner at the bottom right, with waves and bumps
  const thick = (s, P) => {
    const p = s / P, d = 7 + 6 * (0.5 + 0.5 * Math.cos(6.2832 * p)) + 3 * Math.sin(s / 80) + 2 * Math.sin(s / 29 + 1) + 6 * Math.pow(Math.max(0, Math.sin(s / 170)), 3);
    return Math.max(5, Math.min(21, d));
  };
  function draw() {
    const W = window.innerWidth, H = window.innerHeight, P = 2 * (W + H), pts = [];
    let s = 0;
    for (let x = 0; x < W; x += STEP, s += STEP) pts.push([x, thick(s, P)]);                        // along the top, left to right
    for (let y = 0; y < H; y += STEP, s += STEP) pts.push([W - thick(s, P), y]);                    // down the right
    for (let x = W; x > 0; x -= STEP, s += STEP) pts.push([x, H - thick(s, P)]);                    // along the bottom, right to left
    for (let y = H; y > 0; y -= STEP, s += STEP) pts.push([thick(s, P), y]);                        // up the left
    path.setAttribute("d", `M0 0H${W}V${H}H0Z M${pts.map(q => q[0].toFixed(1) + " " + q[1].toFixed(1)).join("L")}Z`);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0"); grad.setAttribute("x2", String(W)); grad.setAttribute("y2", String(H));
  }
  let queued = false;
  const redraw = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); };
  window.addEventListener("resize", redraw);
  draw();
  (document.body || document.documentElement).appendChild(svg);
})();
