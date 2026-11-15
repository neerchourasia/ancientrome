"use strict";
// Runs first. If anything fails to load or throws, show the "something went wrong" banner. Kept in its own file
// (not inline in the page) so the Content-Security-Policy can forbid inline scripts altogether.

window.addEventListener("error", function (e) {
  if (e.message && /pointer lock/i.test(e.message)) return;
  // a picture, sound or font that did not load (a bad connection, a blocked file) is not a reason to stop the game: only scripts and styles are
  var t = e.target;
  if (t && t !== window && t.tagName && !/^(SCRIPT|LINK)$/.test(t.tagName)) return;
  document.getElementById("fatal").hidden = false;
  // the computer cannot draw 3D (WebGL is off, the graphics driver is blocked, or too many 3D tabs are open): say what to try, instead of "reload"
  if (e.message && /WebGL/i.test(e.message)) {
    var gen = document.getElementById("fatal-generic"), gl = document.getElementById("fatal-webgl"), why2 = document.getElementById("fatal-why2");
    if (gen && gl) { gen.hidden = true; gl.hidden = false; }
    if (why2) why2.textContent = e.message;
    // a privacy extension that "protects" canvas or WebGL replaces the browser's own drawing functions, which then no longer say [native code]: that is the commonest cause on a computer that can do 3D
    if (gl && !document.getElementById("fatal-hint")) {
      var nat = function (f) { try { return /\[native code\]/.test(Function.prototype.toString.call(f)); } catch (x) { return false; } };
      var hint = document.createElement("p"); hint.id = "fatal-hint"; hint.style.fontWeight = "700";
      if (!nat(HTMLCanvasElement.prototype.getContext)) { hint.textContent = "An extension in your browser looks like it is blocking 3D. Open this page in a private window (Ctrl+Shift+N, or Cmd+Shift+N on a Mac), or switch the extension off for this site."; gl.insertBefore(hint, gl.children[1] || null); }
      var link = document.createElement("a"); link.href = "check.html"; link.style.color = "#fff"; link.textContent = "Test this computer (shows what is wrong)"; link.style.display = "block"; gl.appendChild(link);
    }
  }
  // say what went wrong, in small writing under the message, so that a screenshot of it is enough to find the problem
  var why = document.getElementById("fatal-why");
  if (why) why.textContent = (e.message || ("A file did not load: " + String((t && (t.src || t.href)) || "?").split("/").pop())) + (e.filename ? " (" + String(e.filename).split("/").pop() + ":" + e.lineno + ")" : "");
}, true);

document.addEventListener("DOMContentLoaded", function () {
  var reload = document.getElementById("fatal-reload");
  if (reload) reload.addEventListener("click", function () { location.reload(); });
});
