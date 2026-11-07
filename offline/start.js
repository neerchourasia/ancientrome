"use strict";
// The start page of the offline copy: builds the game's address from the choices (classmode.js reads them) and opens it.
(() => {
  const $ = (id) => document.getElementById(id);
  $("s-play").addEventListener("click", () => {
    const p = new URLSearchParams();
    p.set("class", $("s-name").value.trim() || "Class");
    if ($("s-latin").checked) p.set("latin", "1");
    if ($("s-low").checked) p.set("low", "1");
    if (!$("s-fights").checked) p.set("fights", "0");
    if ($("s-city").value !== "rome") p.set("city", $("s-city").value);
    if ($("s-era").value !== "ancient") p.set("era", $("s-era").value);
    location.href = `index.html?${p.toString()}`;
  });
})();
