"use strict";
// The teacher page (class.html): builds the class link from the options and copies it. A teacher has to be logged in (teacher-auth.js); the class key lives in the teacher's account.
(() => {
  const $ = (id) => document.getElementById(id);
  // the class id (the first 8 hex digits of the sha256 of the class key, which stays in the teacher's account: the server checks the key against the id)
  let cid = "", cur = 0, nameTimer = 0;
  async function pick(i) {                                           // (the class being worked on: its name, its id)
    cur = i; const c = TeacherAuth.classes[i];
    cid = await TeacherAuth.classId(c.k); $("c-name").value = c.n; await TeacherAuth.choose(i); fillClasses(); show();
  }
  function fillClasses() {
    const sel = $("c-class"); sel.replaceChildren();
    TeacherAuth.classes.forEach((c, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = c.n; sel.append(o); });
    sel.value = String(cur); $("c-delclass").disabled = TeacherAuth.classes.length <= 1; $("c-addclass").disabled = TeacherAuth.classes.length >= TeacherAuth.MAX_CLASSES;
  }
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
    return { cur: $("c-cur").value, cid: $("c-watch").checked ? cid : "", latin: $("c-latin").checked, fights: $("c-fights").checked, city: $("c-city").value, era: $("c-era").value, lang: $("c-lang").value, at: $("c-at").value, hour: $("c-hour").value === "" ? null : Number($("c-hour").value), hunt: [...document.querySelectorAll(".c-hunt-box:checked")].map((b) => b.value).slice(0, 12) };
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
    if ($("c-cur").value === "denarii") p.set("cur", "denarii");
    if ($("c-watch").checked && cid) p.set("cid", cid);
    const hunt = [...document.querySelectorAll(".c-hunt-box:checked")].map((b) => b.value).slice(0, 12);
    if (hunt.length) p.set("hunt", hunt.join(","));
    return `${location.origin}${location.pathname.replace(/[^/]*$/, "")}?${p.toString().replace(/%2C/g, ",")}`;
  }
  function show() {
    const n = document.querySelectorAll(".c-hunt-box:checked").length;
    for (const b of document.querySelectorAll(".c-hunt-box:not(:checked)")) b.disabled = n >= 12;        // (up to 12 sights)
    const l = link(); $("c-link").textContent = l; $("c-open").href = l; $("c-msg").textContent = "";
    $("c-code").textContent = ClassCode.encode(options());
    $("c-watch-box").hidden = !$("c-watch").checked;
    $("c-dash").href = `${location.origin}${location.pathname.replace(/[^/]*$/, "")}class-live.html?class=${cid}`;          // (no key in the link: the dashboard asks the account for it; the id says which class)
  }
  $("c-class").addEventListener("change", () => pick(Number($("c-class").value)));
  $("c-addclass").addEventListener("click", async () => { try { await pick(await TeacherAuth.addClass()); $("c-msg").textContent = "A new class was made: give it a name above."; $("c-name").focus(); $("c-name").select(); } catch (e) { $("c-msg").textContent = e.message; } });
  let sure = 0;
  $("c-delclass").addEventListener("click", async () => {
    if (Date.now() - sure > 4000) { sure = Date.now(); $("c-delclass").textContent = "Sure? Delete it"; setTimeout(() => { $("c-delclass").textContent = "Delete this class"; }, 4000); return; }      // (a second click within four seconds)
    sure = 0; $("c-delclass").textContent = "Delete this class";
    try { await TeacherAuth.removeClass(cur); await pick(0); $("c-msg").textContent = "Class deleted."; } catch (e) { $("c-msg").textContent = e.message; }
  });
  $("c-name").addEventListener("input", () => { clearTimeout(nameTimer); nameTimer = setTimeout(async () => { try { await TeacherAuth.renameClass(cur, $("c-name").value.trim() || "Class"); fillClasses(); } catch (e) { /* ignore */ } }, 900); });
  for (const id of ["c-cur", "c-watch", "c-name", "c-latin", "c-fights", "c-city", "c-era", "c-lang", "c-at", "c-hour"]) $(id).addEventListener("input", show);
  $("c-copy").addEventListener("click", async () => {
    const l = link();
    try { await navigator.clipboard.writeText(l); $("c-msg").textContent = "Copied."; }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("c-link")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); $("c-msg").textContent = "Select the link and copy it (Ctrl+C)."; }
  });
  $("c-copycode").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("c-code").textContent); $("c-msg").textContent = "Code copied."; } catch (e) { $("c-msg").textContent = "Select the code and copy it (Ctrl+C)."; }
  });
  TeacherAuth.start(async ({ index }) => { await pick(index); });
})();
