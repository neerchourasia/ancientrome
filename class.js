"use strict";
// The teacher page (class.html): builds the class link from the options and copies it.
(() => {
  const $ = (id) => document.getElementById(id);
  // the sights (id, name), by city; "m" = only in the modern city, "a" = only in the ancient one
  const SIGHTS = {
    "Rome": [["forum", "The Roman Forum"], ["colosseum", "The Colosseum"], ["pantheon", "The Pantheon"], ["rostra", "The Rostra"], ["curia", "Curia Julia"], ["julia", "Basilica Julia"], ["saturn", "Temple of Saturn"], ["castor", "Temple of Castor and Pollux"], ["vesta", "Temple of Vesta"], ["titus", "Arch of Titus"], ["milestone", "The Golden Milestone"], ["capitolium", "Temple of Jupiter Optimus Maximus"], ["palatine", "The Palatine Hill"], ["circus", "Circus Maximus"], ["trajan", "Trajan's Column"], ["colossus", "Colossus of the Sun"], ["carcer", "The Carcer (Mamertine Prison)"], ["hercules", "Temple of Hercules Victor"], ["pompey", "Theatre of Pompey"], ["servian", "Servian Wall"], ["aqua-claudia", "The Aqua Claudia"], ["domus-severiana", "Domus Severiana"], ["severus-arches", "The Arches of Severus"]],
    "Old Delhi": [["d-lahori", "Lahori Gate"], ["d-chhatta", "Chhatta Chowk and the Naubat Khana"], ["d-diwanaam", "Diwan-i-Aam"], ["d-diwankhas", "Diwan-i-Khas"], ["d-rangmahal", "Rang Mahal and the Stream of Paradise"], ["d-burj", "Muthamman Burj"], ["d-chandni", "Chandni Chowk"], ["d-serai", "Begum ki Serai"], ["d-katra", "Katra Neel"], ["d-fatehpuri", "Fatehpuri Masjid"], ["d-jama", "Jama Masjid"], ["d-indiagate", "India Gate (today)"], ["d-kartavya", "Kartavya Path (today)"], ["d-metro", "Chandni Chowk Metro Station (today)"]],
    "Cancún and Chichén Itzá": [["c-castillo", "El Castillo (Temple of Kukulcán)"], ["c-ballcourt", "The Great Ball Court"], ["c-warriors", "Temple of the Warriors"], ["c-columns", "Group of the Thousand Columns"], ["c-caracol", "El Caracol"], ["c-cenote", "The Sacred Cenote"], ["c-sacbe", "The Sacbé (the white road)"], ["c-venus", "Platform of Venus"], ["c-tzompantli", "The Tzompantli"], ["c-tulum", "Tulum (Maya days)"], ["c-hotelzone", "Cancún Hotel Zone (today)"], ["c-beach", "The Caribbean beach"], ["c-reef", "The Coral Reef"], ["c-azul", "Cenote Azul"]],
    "Beijing": [["b-tiananmen", "Tiananmen, the Gate of Heavenly Peace"], ["b-meridian", "The Meridian Gate"], ["b-harmony", "Hall of Supreme Harmony"], ["b-jingshan", "Jingshan Hill"], ["b-heaven", "Temple of Heaven"], ["b-drum", "The Drum Tower"], ["b-bell", "The Bell Tower"], ["b-hutong", "The Hutongs"], ["b-summer", "The Summer Palace"], ["b-lake", "Kunming Lake"], ["b-bridge", "The Seventeen-Arch Bridge"], ["b-wall", "The Great Wall at Badaling"], ["b-square", "Tiananmen Square (today)"], ["b-cbd", "The CBD towers (today)"]],
  };
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
  }
  for (const id of ["c-name", "c-latin", "c-fights", "c-city", "c-era", "c-lang", "c-at", "c-hour"]) $(id).addEventListener("input", show);
  $("c-copy").addEventListener("click", async () => {
    const l = link();
    try { await navigator.clipboard.writeText(l); $("c-msg").textContent = "Copied."; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("c-link")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("c-msg").textContent = "Select the link and copy it (Ctrl+C)."; }
  });
  show();
})();
