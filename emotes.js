"use strict";
// Emotes and photo mode.
// EMOTES: 😀 Emotes in the menu: wave, dance, bow, cheer, clap or laugh. Your character does it for three seconds (moving stops it) and the other players near you see it too.
// PHOTO MODE: 📷 Photo in the menu hides everything except the world: turn and zoom the camera as usual (C changes the view), press Take photo to save a picture
//   (a PNG with a small "Time Machine" caption; Enter does the same), choose a look (sepia, black and white, vivid or a postcard with a white border), Share it where the browser can
//   (phones), and Esc or Exit to come back. Depends on game.js (avatar parts, renderer, scene, camera) and online.js.

const Emotes = (() => {
  const LIST = [["wave", "👋 Wave"], ["dance", "💃 Dance"], ["bow", "🙇 Bow"], ["cheer", "🙌 Cheer"], ["clap", "👏 Clap"], ["laugh", "😂 Laugh"]];
  const IDS = new Set(LIST.map((e) => e[0])), DURATION = 3;
  let mine = null;                                         // { e, t } while you are doing one
  const bump = (t, len) => Math.sin(Math.min(1, t / len) * Math.PI);        // 0 up to 1 and back to 0 over len seconds

  // pose a figure (yours, or another player's) for an emote that started t seconds ago; returns false when it is over
  function pose(fig, e, t) {
    if (t > DURATION) return false;
    const p = fig.parts, g = fig.g, k = Math.min(1, t / 0.3, (DURATION - t) / 0.3);     // ease in and out
    switch (e) {
      case "wave": p.armR.rotation.z = (2.4 + Math.sin(t * 11) * 0.35) * k; p.armR.rotation.x = 0; break;
      case "dance": p.armL.rotation.z = -2.2 * Math.sin(t * 6) * k; p.armR.rotation.z = 2.2 * Math.sin(t * 6 + 3.14) * k; g.position.y += Math.abs(Math.sin(t * 6)) * 0.18 * k; g.rotation.y += Math.sin(t * 3) * 0.5 * k; p.legL.rotation.x = Math.sin(t * 6) * 0.6 * k; p.legR.rotation.x = -Math.sin(t * 6) * 0.6 * k; break;
      case "bow": g.rotation.x = 0.95 * bump(t, DURATION); break;
      case "cheer": p.armL.rotation.z = -2.8 * k; p.armR.rotation.z = 2.8 * k; g.position.y += Math.abs(Math.sin(t * 7)) * 0.22 * k; break;
      case "clap": p.armL.rotation.x = p.armR.rotation.x = -1.35 * k; p.armL.rotation.z = (-0.1 + Math.sin(t * 16) * 0.28) * k; p.armR.rotation.z = (0.1 - Math.sin(t * 16) * 0.28) * k; break;
      case "laugh": g.rotation.z = Math.sin(t * 22) * 0.07 * k; g.rotation.x = -0.18 * bump(t, DURATION) + Math.sin(t * 22) * 0.03 * k; g.position.y += Math.abs(Math.sin(t * 11)) * 0.05 * k; break;
    }
    return true;
  }

  // called every frame by game.js after the walking swing is set: your own emote
  function update(fig, dt) {
    if (!mine) return;
    if (Math.hypot(player.vx || 0, player.vz || 0) > 0.8 || mode !== "walk" || !fig) { mine = null; return; }
    mine.t += dt;
    if (!pose(fig, mine.e, mine.t)) mine = null;
  }
  // another player's emote, kept on their peer object by online.js
  function peer(p, dt) {
    if (!p.emote) return;
    p.emote.t += dt;
    if (!pose(p.fig, p.emote.e, p.emote.t)) p.emote = null;
  }

  function play(e) {
    if (!IDS.has(e) || mode !== "walk") { toast("Stop first to do an emote."); return; }
    mine = { e, t: 0 };
    Online.navalSend({ t: "emote", e });
  }

  function bind() {
    const box = document.getElementById("em-list");
    if (box) for (const [id, label] of LIST) { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.addEventListener("click", () => { closePanels(); play(id); }); box.append(b); }
    const b = document.getElementById("btn-emotes"); if (b) b.addEventListener("click", () => { if (mode !== "walk") { toast("Emotes work while you are walking about."); return; } openPanel("#emotes"); });
    const ph = document.getElementById("btn-photo"); if (ph) ph.addEventListener("click", () => Photo.enter());
  }
  return { bind, update, peer, play, LIST };
})();

const Photo = (() => {
  let on = false, look = "none";
  const bar = () => document.getElementById("photo-bar");
  const LOOKS = { none: "Normal", sepia: "Sepia", bw: "Black & white", vivid: "Vivid", card: "Postcard" };
  const PREVIEW = { none: "", sepia: "sepia(.85) contrast(1.05)", bw: "grayscale(1) contrast(1.1)", vivid: "saturate(1.45) contrast(1.08)", card: "sepia(.25) saturate(1.1)" };
  function enter() {
    if (mode !== "walk" && mode !== "drive") { toast("Photo mode works while you are walking or driving."); return; }
    closePanels(); on = true; document.body.classList.add("photo"); bar().hidden = false; setLook(look);
    addEventListener("keydown", onKey, true);
  }
  function exit() { on = false; document.body.classList.remove("photo"); bar().hidden = true; renderer.domElement.style.filter = ""; removeEventListener("keydown", onKey, true); }
  function onKey(e) { if (e.code === "Escape") { e.preventDefault(); e.stopPropagation(); exit(); } else if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); e.stopPropagation(); take(); } }
  function setLook(k) {
    look = LOOKS[k] ? k : "none"; renderer.domElement.style.filter = PREVIEW[look];
    for (const b of document.querySelectorAll("#photo-looks button")) b.classList.toggle("on", b.dataset.look === look);
  }

  // the colour change is done on the pixels (the CSS filter on the page does not reach a saved picture)
  function grade(g, w, h) {
    if (look === "none") return;
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2], y = 0.299 * r + 0.587 * gg + 0.114 * b;
      if (look === "bw") { const v = Math.max(0, Math.min(255, (y - 128) * 1.1 + 128)); d[i] = d[i + 1] = d[i + 2] = v; }
      else if (look === "sepia" || look === "card") {
        const k = look === "sepia" ? 1 : 0.35, sr = 0.393 * r + 0.769 * gg + 0.189 * b, sg = 0.349 * r + 0.686 * gg + 0.168 * b, sb = 0.272 * r + 0.534 * gg + 0.131 * b;
        d[i] = Math.min(255, r + (sr - r) * k); d[i + 1] = Math.min(255, gg + (sg - gg) * k); d[i + 2] = Math.min(255, b + (sb - b) * k);
      } else if (look === "vivid") {
        const c = (v) => Math.max(0, Math.min(255, (v - 128) * 1.08 + 128));
        d[i] = c(y + (r - y) * 1.45); d[i + 1] = c(y + (gg - y) * 1.45); d[i + 2] = c(y + (b - y) * 1.45);
      }
    }
    g.putImageData(img, 0, 0);
  }

  // what the camera sees as a PNG, with a small caption in the corner (a postcard look adds a white border and a bigger caption)
  function picture(done) {
    renderer.render(scene, camera);                                         // (drawn and read in the same moment, so the picture is not empty)
    const src = renderer.domElement, caption = `Time Machine · ${typeof ERA_NAMES !== "undefined" && ERA_NAMES[city] ? ERA_NAMES[city][era === "modern" ? 1 : 0] : city} · ${(typeof Time !== "undefined" ? `${String(Math.floor(Time.hour)).padStart(2, "0")}:${String(Math.floor((Time.hour % 1) * 60)).padStart(2, "0")} · ` : "")}${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    const w = src.width, h = src.height, c = document.createElement("canvas"), g0 = c.getContext("2d");
    const s = Math.max(14, Math.round(h / 40)), card = look === "card", pad = card ? Math.round(h / 22) : 0, foot = card ? Math.round(h / 12) : 0;
    c.width = w + pad * 2; c.height = h + pad * 2 + foot;
    if (card) { g0.fillStyle = "#f6f0e2"; g0.fillRect(0, 0, c.width, c.height); }
    const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; const tg = tmp.getContext("2d"); tg.drawImage(src, 0, 0); grade(tg, w, h); g0.drawImage(tmp, pad, pad);
    if (card) { g0.font = `italic ${Math.round(s * 1.3)}px Georgia, serif`; g0.textAlign = "center"; g0.fillStyle = "#4a3b26"; g0.fillText(caption, c.width / 2, c.height - foot / 2 + s * 0.4); }
    else { g0.font = `bold ${s}px Georgia, serif`; g0.textAlign = "right"; g0.fillStyle = "rgba(0,0,0,.55)"; g0.fillText(caption, c.width - s + 2, c.height - s + 2); g0.fillStyle = "#fff"; g0.fillText(caption, c.width - s, c.height - s); }
    c.toBlob(done, "image/png");
  }
  function flash() { const f = document.getElementById("photo-flash"); if (!f) return; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
  function take() {
    flash();
    picture((blob) => {
      if (!blob) { toast("The picture could not be saved."); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `time-machine-${Date.now()}.png`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Photo saved to your downloads.");
    });
  }
  function share() {
    flash();
    picture(async (blob) => {
      if (!blob) { toast("The picture could not be saved."); return; }
      const file = new File([blob], "time-machine.png", { type: "image/png" });
      try { await navigator.share({ files: [file], title: "Time Machine", text: "A photo from Time Machine" }); } catch (e) { if (e && e.name !== "AbortError") toast("Sharing did not work here: use Take photo to save it instead."); }
    });
  }
  function bind() {
    const t = document.getElementById("photo-take"), x = document.getElementById("photo-exit"), sh = document.getElementById("photo-share");
    if (t) t.addEventListener("click", take); if (x) x.addEventListener("click", exit);
    if (sh) { const ok = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([""], "a.png", { type: "image/png" })] })); sh.hidden = !ok; if (ok) sh.addEventListener("click", share); }
    for (const b of document.querySelectorAll("#photo-looks button")) b.addEventListener("click", () => setLook(b.dataset.look));
  }
  return { enter, exit, take, picture, bind, setLook, get on() { return on; }, get look() { return look; } };
})();
