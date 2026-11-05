"use strict";
// Class codes: a short code that carries the options of a class link (Latin names, fights, era, city, language, start sight, hour, scavenger-hunt sights), so a teacher can give the class a code to type
// into the box on the front page instead of a link. There is no server to look a code up in, so the code IS the options: 24 bits of settings, then 7 bits for each sight of the hunt, written in
// base 32 (digits and letters without I, L, O and U, so it is easy to read out), in groups of five, with a last character that catches a typing mistake. The class name is not in the code.
// The list of sights below must never be reordered (codes in use would change meaning): new sights go at the end. Used by class.html (makes the code) and index.html (the box that takes it).

const ClassCode = (() => {
  const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", CITIES = ["rome", "delhi", "cancun", "beijing"], LANGS = ["en", "es", "it", "hi", "zh"];
  // the sights, by city: [id, name]
  const GROUPS = {
    "Rome": [["forum", "The Roman Forum"], ["colosseum", "The Colosseum"], ["pantheon", "The Pantheon"], ["rostra", "The Rostra"], ["curia", "Curia Julia"], ["julia", "Basilica Julia"], ["saturn", "Temple of Saturn"], ["castor", "Temple of Castor and Pollux"], ["vesta", "Temple of Vesta"], ["titus", "Arch of Titus"], ["milestone", "The Golden Milestone"], ["capitolium", "Temple of Jupiter Optimus Maximus"], ["palatine", "The Palatine Hill"], ["circus", "Circus Maximus"], ["trajan", "Trajan's Column"], ["colossus", "Colossus of the Sun"], ["carcer", "The Carcer (Mamertine Prison)"], ["hercules", "Temple of Hercules Victor"], ["pompey", "Theatre of Pompey"], ["servian", "Servian Wall"], ["aqua-claudia", "The Aqua Claudia"], ["domus-severiana", "Domus Severiana"], ["severus-arches", "The Arches of Severus"]],
    "Old Delhi": [["d-lahori", "Lahori Gate"], ["d-chhatta", "Chhatta Chowk and the Naubat Khana"], ["d-diwanaam", "Diwan-i-Aam"], ["d-diwankhas", "Diwan-i-Khas"], ["d-rangmahal", "Rang Mahal and the Stream of Paradise"], ["d-burj", "Muthamman Burj"], ["d-chandni", "Chandni Chowk"], ["d-serai", "Begum ki Serai"], ["d-katra", "Katra Neel"], ["d-fatehpuri", "Fatehpuri Masjid"], ["d-jama", "Jama Masjid"], ["d-indiagate", "India Gate (today)"], ["d-kartavya", "Kartavya Path (today)"], ["d-metro", "Chandni Chowk Metro Station (today)"]],
    "Cancún and Chichén Itzá": [["c-castillo", "El Castillo (Temple of Kukulcán)"], ["c-ballcourt", "The Great Ball Court"], ["c-warriors", "Temple of the Warriors"], ["c-columns", "Group of the Thousand Columns"], ["c-caracol", "El Caracol"], ["c-cenote", "The Sacred Cenote"], ["c-sacbe", "The Sacbé (the white road)"], ["c-venus", "Platform of Venus"], ["c-tzompantli", "The Tzompantli"], ["c-tulum", "Tulum (Maya days)"], ["c-hotelzone", "Cancún Hotel Zone (today)"], ["c-beach", "The Caribbean beach"], ["c-reef", "The Coral Reef"], ["c-azul", "Cenote Azul"]],
    "Beijing": [["b-tiananmen", "Tiananmen, the Gate of Heavenly Peace"], ["b-meridian", "The Meridian Gate"], ["b-harmony", "Hall of Supreme Harmony"], ["b-jingshan", "Jingshan Hill"], ["b-heaven", "Temple of Heaven"], ["b-drum", "The Drum Tower"], ["b-bell", "The Bell Tower"], ["b-hutong", "The Hutongs"], ["b-summer", "The Summer Palace"], ["b-lake", "Kunming Lake"], ["b-bridge", "The Seventeen-Arch Bridge"], ["b-wall", "The Great Wall at Badaling"], ["b-square", "Tiananmen Square (today)"], ["b-cbd", "The CBD towers (today)"]],
  };
  const IDS = Object.values(GROUPS).flat().map((s) => s[0]);

  const check = (vals) => vals.reduce((a, v, i) => (a + v * (2 * i + 1)) % 32, 0);               // (odd weights: any one wrong character is always caught)
  function encode(o) {
    const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    const hunt = (o.hunt || []).map((id) => IDS.indexOf(id)).filter((i) => i >= 0).slice(0, 12);
    put(o.latin ? 1 : 0, 1); put(o.fights === false ? 0 : 1, 1); put(o.era === "modern" ? 1 : 0, 1);
    put(Math.max(0, CITIES.indexOf(o.city)), 2); put(Math.max(0, LANGS.indexOf(o.lang)), 3);
    put(o.hour === null || o.hour === undefined || o.hour === "" ? 0 : (Math.round(Number(o.hour)) % 24) + 1, 5);
    put(o.at && IDS.indexOf(o.at) >= 0 ? IDS.indexOf(o.at) + 1 : 0, 7);
    put(hunt.length, 4); for (const i of hunt) put(i + 1, 7);
    while (bits.length % 5) bits.push(0);
    const vals = []; for (let i = 0; i < bits.length; i += 5) vals.push(bits.slice(i, i + 5).reduce((a, b) => a * 2 + b, 0));
    vals.push(check(vals));
    const s = vals.map((v) => ALPHA[v]).join("");
    return s.replace(/(.{5})(?=.)/g, "$1-");
  }
  // the options a code stands for, or null when it is not a good code (a typing mistake, or something else altogether)
  function decode(text) {
    const s = String(text || "").toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
    if (s.length < 6 || s.length > 40) return null;
    const vals = [...s].map((c) => ALPHA.indexOf(c));
    if (vals.some((v) => v < 0)) return null;
    const sum = vals.pop();
    if (check(vals) !== sum) return null;
    const bits = vals.flatMap((v) => [4, 3, 2, 1, 0].map((i) => (v >> i) & 1));
    let pos = 0; const get = (n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + (bits[pos++] || 0); return v; };
    if (bits.length < 24) return null;
    const o = { latin: !!get(1), fights: !!get(1), era: get(1) ? "modern" : "ancient", city: CITIES[get(2)], lang: LANGS[get(3)] };
    if (!o.city || !o.lang) return null;
    const hr = get(5); o.hour = hr === 0 ? null : hr - 1; if (hr > 24) return null;
    const at = get(7); o.at = at === 0 ? "" : IDS[at - 1]; if (at > IDS.length) return null;
    const n = get(4); if (n > 12 || bits.length < pos + n * 7) return null;
    o.hunt = []; for (let i = 0; i < n; i++) { const k = get(7); if (k < 1 || k > IDS.length) return null; o.hunt.push(IDS[k - 1]); }
    return o;
  }
  // the link for some options: the class name is shown on the screen; options are only added when they differ from what a link starts with
  function query(o, name) {
    const p = new URLSearchParams();
    p.set("class", (name || "Class").trim().slice(0, 30) || "Class");
    if (o.latin) p.set("latin", "1");
    if (o.fights === false) p.set("fights", "0");
    if (o.city && o.city !== "rome") p.set("city", o.city);
    if (o.era && o.era !== "ancient") p.set("era", o.era);
    if (o.lang && o.lang !== "en") p.set("lang", o.lang);
    if (o.at) p.set("at", o.at);
    if (o.hour !== null && o.hour !== undefined && o.hour !== "") p.set("hour", String(o.hour));
    if (o.hunt && o.hunt.length) p.set("hunt", o.hunt.join(","));
    return p.toString().replace(/%2C/g, ",");
  }

  // the box on the front page
  function bind() {
    const input = document.getElementById("class-code"), btn = document.getElementById("class-code-btn"), msg = document.getElementById("class-code-msg");
    if (!input || !btn) return;
    const go = () => {
      const o = decode(input.value);
      if (!o) { msg.textContent = (typeof I18n !== "undefined" ? I18n.t("That code does not look right. Check it and try again.") : "That code does not look right. Check it and try again."); return; }
      location.assign(`${location.pathname}?${query(o, "Class")}`);
    };
    btn.addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    input.addEventListener("input", () => { msg.textContent = ""; });
  }
  if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind(); }
  return { encode, decode, query, GROUPS, IDS };
})();
