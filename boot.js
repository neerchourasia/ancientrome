"use strict";
// Runs first. If anything fails to load or throws, show the "something went wrong" banner. Kept in its own file
// (not inline in the page) so the Content-Security-Policy can forbid inline scripts altogether.

window.addEventListener("error", function (e) {
  if (e.message && /pointer lock/i.test(e.message)) return;
  document.getElementById("fatal").hidden = false;
}, true);

document.addEventListener("DOMContentLoaded", function () {
  var reload = document.getElementById("fatal-reload");
  if (reload) reload.addEventListener("click", function () { location.reload(); });
});
