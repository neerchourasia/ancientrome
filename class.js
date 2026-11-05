"use strict";
// The teacher page (class.html): builds the class link from the options and copies it.
(() => {
  const $ = (id) => document.getElementById(id);
  function link() {
    const p = new URLSearchParams();
    p.set("class", $("c-name").value.trim() || "Class");
    if ($("c-latin").checked) p.set("latin", "1");
    if (!$("c-fights").checked) p.set("fights", "0");
    if ($("c-city").value !== "rome") p.set("city", $("c-city").value);
    if ($("c-era").value !== "ancient") p.set("era", $("c-era").value);
    if ($("c-lang").value !== "en") p.set("lang", $("c-lang").value);
    return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}?${p.toString()}`;
  }
  function show() { const l = link(); $("c-link").textContent = l; $("c-open").href = l; $("c-msg").textContent = ""; }
  for (const id of ["c-name", "c-latin", "c-fights", "c-city", "c-era", "c-lang"]) $(id).addEventListener("input", show);
  $("c-copy").addEventListener("click", async () => {
    const l = link();
    try { await navigator.clipboard.writeText(l); $("c-msg").textContent = "Copied."; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("c-link")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("c-msg").textContent = "Select the link and copy it (Ctrl+C)."; }
  });
  show();
})();
