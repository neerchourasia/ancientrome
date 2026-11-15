"use strict";
// The "Is this computer ready?" page (check.html): tries to start 3D graphics the way the game does and says what is wrong, if anything. A browser extension that "protects" canvas or WebGL (privacy
// and fingerprint blockers) replaces the browser's own drawing functions: those no longer say "[native code]", which is how it is told apart from graphics that are simply switched off.
(() => {
  const $ = (id) => document.getElementById(id);
  const isNative = (f) => { try { return /\[native code\]/.test(Function.prototype.toString.call(f)); } catch (e) { return false; } };
  const ctx = (name) => { try { return document.createElement("canvas").getContext(name); } catch (e) { return null; } };
  const g2 = ctx("webgl2"), g1 = ctx("webgl"), gl = g2 || g1;
  let renderer = "unknown";
  try { const x = gl && gl.getExtension("WEBGL_debug_renderer_info"); if (x) renderer = gl.getParameter(x.UNMASKED_RENDERER_WEBGL); } catch (e) { /* blocked */ }
  const patched = !isNative(HTMLCanvasElement.prototype.getContext) || (gl && !isNative(gl.getParameter));
  const software = /swiftshader|llvmpipe|software|microsoft basic/i.test(renderer);

  const rows = [["Browser", navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 110)], ["3D graphics (WebGL 2)", g2 ? "yes" : "no"], ["3D graphics (WebGL 1)", g1 ? "yes" : "no"],
    ["Graphics chip", gl ? renderer : "-"], ["An extension is changing how 3D is drawn", patched ? "yes (probably)" : "no"]];
  for (const [a, b] of rows) { const tr = document.createElement("tr"), x = document.createElement("td"), y = document.createElement("td"); x.textContent = a; y.textContent = b; tr.append(x, y); $("rows").append(tr); }

  let verdict, cls, advice;
  if (gl && !software) { verdict = "✓ Ready. This browser can run the game."; cls = "ok"; advice = "You can go back and play."; }
  else if (gl && software) { verdict = "✓ It works, but slowly."; cls = "ok"; advice = "The browser is drawing 3D in software. Turn on hardware acceleration (Chrome or Edge: Settings, System, \"Use graphics acceleration when available\", then Relaunch) and run this check again. Meanwhile, the game's \"Light graphics\" button helps."; }
  else if (patched) { verdict = "✗ Not ready: an extension is blocking 3D."; cls = "bad"; advice = "A privacy or \"canvas / WebGL blocker\" extension is replacing the browser's 3D drawing. Open this page in a private window (Ctrl+Shift+N, or Cmd+Shift+N on Mac), where extensions are off, or switch the extension off for this site, then run the check again."; }
  else { verdict = "✗ Not ready: 3D graphics are switched off."; cls = "bad"; advice = "Try, in this order: (1) close other tabs and windows that show 3D, then reload; (2) in Chrome or Edge open Settings, System, switch on \"Use graphics acceleration when available\" and press Relaunch; (3) type chrome://gpu in the address bar and look at the WebGL line: it should say Hardware accelerated; (4) update the browser or try another one (Chrome, Edge, Firefox); (5) on a school computer, ask the school's IT person: some school settings switch 3D off."; }
  $("verdict").textContent = verdict; $("verdict").className = "verdict " + cls; $("advice").textContent = advice;

  $("copy").addEventListener("click", async () => {
    const text = `${verdict}\n${rows.map((r) => r.join(": ")).join("\n")}`;
    try { await navigator.clipboard.writeText(text); $("msg").textContent = "Copied."; } catch (e) { $("msg").textContent = "Select the text above and copy it."; }
  });
})();
