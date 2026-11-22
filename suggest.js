"use strict";
// The suggestions page (suggest.html): sends a suggestion, or a request to have a car named after you, to the `suggestions` table
// (supabase-suggestions.sql). Anyone may send one, signed in or not; if the player is signed in to the game, the database adds their account
// id by itself so an admin can tell who it was. The page only checks the obvious things: the database applies the same limits itself.
// Depends on config.js (the Supabase address and public key).
(() => {
  const cfg = window.ROME_CONFIG || {};
  const base = String(cfg.supabaseUrl || "").replace(/\/+$/, ""), anon = String(cfg.supabaseAnonKey || "");
  const $ = (id) => document.getElementById(id);
  const CARS = ["Vespa scooter", "City car", "Sports car", "SUV", "Taxi", "Delivery truck", "Bus", "Motorcycle", "Light plane", "Chariot", "Cycle rickshaw", "Metro train"];
  for (const c of CARS) { const o = document.createElement("option"); o.value = o.textContent = c; $("car").append(o); }

  const kind = () => document.querySelector('input[name="kind"]:checked').value;
  function layout() {
    const car = kind() === "car";
    $("car-only").hidden = !car; $("car-note").hidden = !car;
    $("name-label").textContent = car ? "The name for the car" : "Your name";
    $("name-hint").textContent = car ? "(as it should be written on it)" : "(optional: shown only to us)";
    $("msg-label").textContent = car ? "Anything else about the car?" : "Your suggestion";
    $("msg-hint").textContent = car ? "(optional: colour, why this name...)" : "";
    $("go").textContent = car ? "Ask for my car" : "Send my suggestion";
  }
  for (const r of document.querySelectorAll('input[name="kind"]')) r.addEventListener("change", layout);
  $("msg").addEventListener("input", () => { $("count").textContent = `${$("msg").value.length} / 1500`; });
  layout();

  // The player's login from the game (the same one the admin page uses), so the database can note who sent it.
  function token() {
    for (const st of [localStorage, sessionStorage]) {
      try { const s = JSON.parse(st.getItem("rome-session") || "null"); if (s && typeof s.access_token === "string" && (s.expires_at || 0) > Date.now() / 1000 + 30) return s.access_token; } catch (e) { /* none */ }
    }
    return null;
  }
  const say = (t, cls) => { $("out").textContent = t; $("out").className = cls || ""; };

  $("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("site").value) { say("Thank you!", "ok"); return; }                       // a robot filled the hidden box: pretend, send nothing
    const k = kind(), name = $("name").value.trim(), message = $("msg").value.trim(), contact = $("contact").value.trim();
    if (k === "car" && !name) return say("Write the name that should go on the car.", "bad");
    if (k === "idea" && message.length < 3) return say("Write your suggestion first.", "bad");
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return say("That email does not look right (or leave it empty).", "bad");
    const last = Number(localStorage.getItem("rome-suggest-at") || 0);
    if (Date.now() - last < 30000) return say("Please wait a moment before sending another.", "bad");
    if (!base || !anon) return say("This site has no place to send it to yet (config.js).", "bad");
    $("go").disabled = true; say("Sending...");
    try {
      const res = await fetch(base + "/rest/v1/suggestions", {
        method: "POST",
        headers: { apikey: anon, Authorization: "Bearer " + (token() || anon), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ kind: k, name: name || "(no name)", car_type: k === "car" && $("car").value ? $("car").value : null, message, contact: contact || null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      localStorage.setItem("rome-suggest-at", String(Date.now()));
      $("f").reset(); $("count").textContent = "0 / 1500"; layout();
      say(k === "car" ? "Thank you! We have your name. If the car goes in, we will tell you if you gave an email." : "Thank you! We read every one.", "ok");
    } catch (err) {
      say("Could not send it just now. Please try again in a little while.", "bad");
    }
    $("go").disabled = false;
  });
})();
