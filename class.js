"use strict";
// The teacher page (class.html): builds the class link from the options and copies it.
(() => {
  const $ = (id) => document.getElementById(id);
  const SIGHTS = ClassCode.GROUPS;                                   // (the sights, by city: classcode.js)
  for (const [city, list] of Object.entries(SIGHTS)) {
    const grp = document.createElement("optgroup"); grp.label = city;
    for (const [id, name] of list) { const o = document.createElement("option"); o.value = id; o.textContent = name; grp.append(o); }
    $("c-at").append(grp);
    const det = document.createElement("details"); if (city === "Rome") det.open = true;
    const sum = document.createElement("summary"); sum.textContent = city; det.append(sum);
    const grid = document.createElement("div"); grid.className = "hunt-grid";
    for (const [id, name] of list) {
      const lab = document.createElement("label"), box = document.createElement("input");
      box.type = "checkbox"; box.value = id; box.className = "c-hunt-box"; box.addEventListener("input", show);
      lab.append(box, document.createTextNode(name)); grid.append(lab);
    }
    det.append(grid); $("c-hunt").append(det);
  }

  function options() {
    return { latin: $("c-latin").checked, fights: $("c-fights").checked, city: $("c-city").value, era: $("c-era").value, lang: $("c-lang").value, at: $("c-at").value, hour: $("c-hour").value === "" ? null : Number($("c-hour").value), hunt: [...document.querySelectorAll(".c-hunt-box:checked")].map((b) => b.value).slice(0, 12) };
  }
  function link() {
    const p = new URLSearchParams();
    p.set("class", $("c-name").value.trim() || "Class");
    if ($("c-latin").checked) p.set("latin", "1");
    if (!$("c-fights").checked) p.set("fights", "0");
    if ($("c-city").value !== "rome") p.set("city", $("c-city").value);
    if ($("c-era").value !== "ancient") p.set("era", $("c-era").value);
    if ($("c-lang").value !== "en") p.set("lang", $("c-lang").value);
    if ($("c-at").value) p.set("at", $("c-at").value);
    if ($("c-hour").value) p.set("hour", $("c-hour").value);
    const hunt = [...document.querySelectorAll(".c-hunt-box:checked")].map((b) => b.value).slice(0, 12);
    if (hunt.length) p.set("hunt", hunt.join(","));
    return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}?${p.toString().replace(/%2C/g, ",")}`;
  }
  function show() {
    const n = document.querySelectorAll(".c-hunt-box:checked").length;
    for (const b of document.querySelectorAll(".c-hunt-box:not(:checked)")) b.disabled = n >= 12;        // (up to 12 sights)
    const l = link(); $("c-link").textContent = l; $("c-open").href = l; $("c-msg").textContent = "";
    $("c-code").textContent = ClassCode.encode(options());
  }
  for (const id of ["c-name", "c-latin", "c-fights", "c-city", "c-era", "c-lang", "c-at", "c-hour"]) $(id).addEventListener("input", show);
  $("c-copy").addEventListener("click", async () => {
    const l = link();
    try { await navigator.clipboard.writeText(l); $("c-msg").textContent = "Copied."; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("c-link")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("c-msg").textContent = "Select the link and copy it (Ctrl+C)."; }
  });
  $("c-copycode").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("c-code").textContent); $("c-msg").textContent = "Code copied."; } catch (e) { $("c-msg").textContent = "Select the code and copy it (Ctrl+C)."; }
  });
  show();
})();
