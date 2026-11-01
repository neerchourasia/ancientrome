"use strict";
// Runs first. If anything fails to load or throws, show the "something went wrong" banner. Kept in its own file
// (not inline in the page) so the Content-Security-Policy can forbid inline scripts altogether.

window.addEventListener("error", function (e) {
  if (e.message && /pointer lock/i.test(e.message)) return;
  // a picture, sound or font that did not load (a bad connection, a blocked file) is not a reason to stop the game: only scripts and styles are
  var t = e.target;
  if (t && t !== window && t.tagName && !/^(SCRIPT|LINK)$/.test(t.tagName)) return;
  document.getElementById("fatal").hidden = false;
  // say what went wrong, in small writing under the message, so that a screenshot of it is enough to find the problem
  var why = document.getElementById("fatal-why");
  if (why) why.textContent = (e.message || ("A file did not load: " + String((t && (t.src || t.href)) || "?").split("/").pop())) + (e.filename ? " (" + String(e.filename).split("/").pop() + ":" + e.lineno + ")" : "");
}, true);

document.addEventListener("DOMContentLoaded", function () {
  var reload = document.getElementById("fatal-reload");
  if (reload) reload.addEventListener("click", function () { location.reload(); });
});
