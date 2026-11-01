"use strict";
// Emotes and photo mode.
// EMOTES: 😀 Emotes in the menu: wave, dance, bow, cheer, clap or laugh. Your character does it for three seconds (moving stops it) and the other players near you see it too.
// PHOTO MODE: 📷 Photo in the menu hides everything except the world: turn and zoom the camera as usual (C changes the view), press Take photo to save a picture
//   (a PNG with a small "Time Machine" caption), and Esc or Exit to come back. Depends on game.js (avatar parts, renderer, scene, camera) and online.js.

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
  let on = false;
  const bar = () => document.getElementById("photo-bar");
  function enter() {
    if (mode !== "walk" && mode !== "drive") { toast("Photo mode works while you are walking or driving."); return; }
    closePanels(); on = true; document.body.classList.add("photo"); bar().hidden = false;
    addEventListener("keydown", onKey, true);
  }
  function exit() { on = false; document.body.classList.remove("photo"); bar().hidden = true; removeEventListener("keydown", onKey, true); }
  function onKey(e) { if (e.code === "Escape") { e.preventDefault(); e.stopPropagation(); exit(); } }

  // save what the camera sees as a PNG, with a small caption in the corner
  function take() {
    renderer.render(scene, camera);                                         // (drawn and read in the same moment, so the picture is not empty)
    const src = renderer.domElement, c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const g = c.getContext("2d"); g.drawImage(src, 0, 0);
    const s = Math.max(14, Math.round(c.height / 40));
    g.font = `bold ${s}px Georgia, serif`; g.textAlign = "right"; g.fillStyle = "rgba(0,0,0,.55)"; g.fillText(`Time Machine · ${typeof ERA_NAMES !== "undefined" && ERA_NAMES[city] ? ERA_NAMES[city][era === "modern" ? 1 : 0] : city}`, c.width - s + 2, c.height - s + 2);
    g.fillStyle = "#fff"; g.fillText(`Time Machine · ${typeof ERA_NAMES !== "undefined" && ERA_NAMES[city] ? ERA_NAMES[city][era === "modern" ? 1 : 0] : city}`, c.width - s, c.height - s);
    c.toBlob((blob) => {
      if (!blob) { toast("The picture could not be saved."); return; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `time-machine-${Date.now()}.png`; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("Photo saved to your downloads.");
    }, "image/png");
  }
  function bind() { const t = document.getElementById("photo-take"), x = document.getElementById("photo-exit"); if (t) t.addEventListener("click", take); if (x) x.addEventListener("click", exit); }
  return { enter, exit, take, bind, get on() { return on; } };
})();
