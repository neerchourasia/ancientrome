"use strict";
// Taxi fares and passenger flights, for the modern cities.
//  Taxi: drive the Taxi. Passengers wait at the sights, shown by a blue light: stop next to one, and they get in and say where they are going. Drive them
//        there and stop: the faster you get there (without crashing), the more they pay, plus a tip for a smooth ride.
//  Passenger flights: stop an aircraft on the ground for a couple of seconds and passengers turn up (as many as it seats). Press P to take them. Fly to
//        where they want to go and land within 120 m of it: the more passengers and the further the flight, the more they pay.
// Leaving the vehicle, or the city, cancels the job. Depends on car.js, physics.js, game.js (LANDMARKS, startDirections) and vitals.js.

const Fares = (() => {
  const T = THREE;
  // how many passengers each aircraft takes (0: it carries no passengers)
  const PAX = { plane: 3, gyro: 1, helicopter: 4, tiltrotor: 8, blimp: 12, balloon: 2, vlj: 4, lightjet: 7, midjet: 9, supermid: 11, heavyjet: 16, airliner: 70, b777x: 120, a350: 110, a380: 200, glider: 0, cargo: 0, fighter: 0, bomber: 0, transport: 0 };
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  let fare = null, offer = null, cooldown = 4, still = 0, hudT = 0, hudEl = null, marker = null, scene2 = null;

  function hud() {
    if (hudEl) return hudEl;
    hudEl = document.createElement("div"); hudEl.id = "fare-hud"; hudEl.setAttribute("aria-live", "polite"); document.body.appendChild(hudEl);
    return hudEl;
  }
  const show = (title, line) => { const h = hud(); h.innerHTML = `<strong>${title}</strong><span>${line}</span>`; h.classList.add("show"); };
  const hide = () => { if (hudEl) hudEl.classList.remove("show"); };

  // the waiting passenger: a little figure with a blue light over it
  function placeMarker(x, z) {
    if (!marker) {
      marker = new T.Group();
      const skin = new T.MeshLambertMaterial({ color: 0xd9a77a }), cloth = new T.MeshLambertMaterial({ color: 0x2f6fb5 });
      const body = new T.Mesh(new T.BoxGeometry(0.6, 1.2, 0.35), cloth); body.position.y = 1.0;
      const head = new T.Mesh(new T.SphereGeometry(0.22, 10, 8), skin); head.position.y = 1.85;
      const arm = new T.Mesh(new T.BoxGeometry(0.14, 0.7, 0.14), cloth); arm.position.set(0.42, 1.9, 0); arm.rotation.z = -0.4; marker.userData.arm = arm;
      const beam = new T.Mesh(new T.CylinderGeometry(0.5, 0.5, 18, 10, 1, true), new T.MeshBasicMaterial({ color: 0x5aa8ff, transparent: true, opacity: 0.25, depthWrite: false }));
      beam.position.y = 9;
      marker.add(body, head, arm, beam); scene.add(marker);
    }
    marker.position.set(x, groundAt(x, z), z); marker.visible = true;
  }
  const hideMarker = () => { if (marker) marker.visible = false; };

  const dist = (x, z, p) => Math.hypot(x - p[0], z - p[1]);
  const standOf = (l) => (l.stand || [l.x, l.z]);
  const clearNav = () => { try { if (typeof Nav !== "undefined" && Nav.clear) Nav.clear(); } catch (e) { /* ignore */ } };
  const point = (l) => { try { if (typeof startDirections === "function") startDirections(l); } catch (e) { /* ignore */ } };
  const landmarks = () => (typeof LANDMARKS !== "undefined" ? LANDMARKS : []).filter((l) => !l.home && !l.game);
  const cardinal = (dx, dz) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];

  function cancel(msg) {
    if (fare || offer) { if (msg) toast(msg); }
    fare = null; offer = null; hideMarker(); hide(); clearNav(); cooldown = 6; still = 0;
  }

  // a landmark between lo and hi metres from (x, z), not `not`
  function chooseLandmark(x, z, lo, hi, not) {
    const list = landmarks().filter((l) => l !== not).map((l) => ({ l, d: Math.hypot(standOf(l)[0] - x, standOf(l)[1] - z) }));
    let c = list.filter((e) => e.d >= lo && e.d <= hi);
    if (!c.length) c = list.filter((e) => e.d >= lo * 0.5 && e.d <= hi * 1.5);
    return c.length ? pick(c) : null;
  }

  function update(dt) {
    if (typeof started === "undefined" || !started) return;
    const st = Car.state(), veh = Car.driving && st ? Car.MODELS[Car.current] : null;
    const inTaxi = !!veh && Car.current === "taxi" && era === "modern";
    const pax = veh && veh.fly && era === "modern" ? (PAX[Car.current] || 0) : 0;
    if (fare && (!veh || era !== "modern" || fare.city !== city || (fare.kind === "taxi" && !inTaxi) || (fare.kind === "air" && !pax))) { cancel(fare.kind === "taxi" ? "You left your taxi: the fare is cancelled." : "You left your aircraft: the passengers go home."); return; }
    cooldown -= dt;
    if (marker && marker.visible && marker.userData.arm) marker.userData.arm.rotation.z = -0.4 + Math.sin(performance.now() / 150) * 0.5;

    // ---- a taxi fare in progress
    if (fare && fare.kind === "taxi") {
      const left = (fare.until - performance.now()) / 1000, here = [st.x, st.z];
      hudT -= dt;
      if (fare.phase === "wait") {
        const sp = standOf(fare.from), d = dist(st.x, st.z, sp);
        if (hudT <= 0) { hudT = 0.5; show("🚕 A passenger is waiting", `${fare.from.name}: ${Math.round(d)} m to the ${cardinal(sp[0] - st.x, sp[1] - st.z)}. Pull up beside the blue light.`); }
        if (d < 14 && Math.abs(st.v) < 5) {
          const pickTo = chooseLandmark(sp[0], sp[1], 350, 950, fare.from), to = pickTo && pickTo.l;
          if (!to) { cancel("Nobody wants to go anywhere from here."); return; }
          const d2 = dist(sp[0], sp[1], standOf(to)), total = Math.round(d2 / 8 + 25);
          Object.assign(fare, { phase: "ride", to, d: d2, total, until: performance.now() + total * 1000, hp0: Vitals.hp });
          hideMarker(); point(to); Sfx.play("coin");
          toast(`"Take me to ${to.name}, please!" ${Math.round(d2)} m, ${total} seconds.`); hudT = 0;
        } else if (left <= 0) cancel("The passenger found another taxi.");
      } else {
        const tp = standOf(fare.to), d = dist(st.x, st.z, tp);
        if (hudT <= 0) { hudT = 0.5; show(`🚕 Fare to ${fare.to.name}`, `${Math.round(d)} m to the ${cardinal(tp[0] - st.x, tp[1] - st.z)}. ${Math.max(0, Math.round(left))} s left. Stop at the sight to drop them off.`); }
        if (d < 16 && Math.abs(st.v) < 6) {
          const f = Math.max(0, left) / fare.total, base = Math.round((25 + 0.16 * fare.d) * (0.5 + 0.5 * f)), smooth = Vitals.hp >= fare.hp0 - 0.5, tip = smooth ? Math.round(base * 0.25) : 0;
          Vitals.coins += base + tip; Sfx.play("coin");
          toast(`Fare paid: ${base} denarii${tip ? ` and a ${tip} tip for a smooth ride` : ""}.`);
          fare = null; hide(); clearNav(); cooldown = 4;
        } else if (left <= 0) cancel("Too late: the passenger got out and walked.");
      }
      return;
    }
    // ---- a passenger flight in progress
    if (fare && fare.kind === "air") {
      const left = (fare.until - performance.now()) / 1000, tp = standOf(fare.to), d = dist(st.x, st.z, tp);
      hudT -= dt;
      if (hudT <= 0) { hudT = 0.5; show(`✈ ${fare.pax} passenger${fare.pax === 1 ? "" : "s"} to ${fare.to.name}`, `${Math.round(d)} m to the ${cardinal(tp[0] - st.x, tp[1] - st.z)}. ${Math.max(0, Math.round(left))} s left. Land within ${fare.radius} m and stop.`); }
      if (d < fare.radius && st.alt < 1.2 && Math.abs(st.v) < 8) {
        const f = Math.max(0, left) / fare.total, base = Math.round(fare.pax * (15 + fare.d / 25) * (0.5 + 0.5 * f)), smooth = Vitals.hp >= fare.hp0 - 0.5, tip = smooth ? Math.round(base * 0.2) : 0;
        Vitals.coins += base + tip; Sfx.play("coin");
        toast(`The passengers pay ${base} denarii${tip ? ` and tip ${tip} for a smooth flight` : ""}.`);
        fare = null; hide(); clearNav(); cooldown = 4; still = 0;
      } else if (left <= 0) cancel("Too late: the passengers have missed their connection.");
      return;
    }
    // ---- nothing yet: look for work
    if (inTaxi) {
      if (cooldown <= 0 && !fare) {
        const c = chooseLandmark(st.x, st.z, 150, 600);
        if (c) {
          const sp = standOf(c.l);
          fare = { kind: "taxi", phase: "wait", from: c.l, until: performance.now() + (c.d / 7 + 45) * 1000, city };
          placeMarker(sp[0], sp[1]); point(c.l); toast(`A passenger is waiting at ${c.l.name}: ${Math.round(c.d)} m away.`); hudT = 0;
        } else cooldown = 10;
      } else if (!fare) hide();
      return;
    }
    if (pax > 0) {
      const parked = st.alt < 0.5 && Math.abs(st.v) < 2.5;
      if (!parked) { if (offer) { offer = null; hide(); } still = 0; return; }
      still += dt;
      if (!offer && still > 2.5 && cooldown <= 0) {
        const c = chooseLandmark(st.x, st.z, 500, 1500);
        if (c) offer = { to: c.l, d: c.d, pax: Math.max(1, Math.round(pax * (0.6 + Math.random() * 0.4))) };
        else cooldown = 10;
      }
      if (offer) show(`✈ ${offer.pax} passenger${offer.pax === 1 ? "" : "s"} want${offer.pax === 1 ? "s" : ""} to fly to ${offer.to.name}`, `${Math.round(offer.d)} m away. Press <kbd>P</kbd> to take them.`);
      else { const th = typeof Trade !== "undefined" ? Trade.hint() : ""; if (th) show("📦 Trading depot", th); else hide(); }
      return;
    }
    // nothing to do here: maybe the trading depot
    const hint = typeof Trade !== "undefined" ? Trade.hint() : "";
    if (hint) show("📦 Trading depot", hint); else hide();
  }

  // P: take the waiting passengers on a flight
  function accept() {
    if (!offer || fare) return false;
    const st = Car.state(), veh = Car.MODELS[Car.current];
    if (!st || !veh) return false;
    const total = Math.round(offer.d / (Math.max(20, veh.max) * 0.5) + 70);
    fare = { kind: "air", to: offer.to, d: offer.d, pax: offer.pax, total, until: performance.now() + total * 1000, hp0: Vitals.hp, radius: 120, city };
    offer = null; point(fare.to); Sfx.play("coin");
    toast(`${fare.pax} passenger${fare.pax === 1 ? "" : "s"} board. Fly to ${fare.to.name}: ${Math.round(fare.d)} m, ${total} seconds.`);
    return true;
  }

  return { update, accept, get active() { return !!fare; }, cancel, debug: () => ({ fare, offer, cooldown, still }) };
})();
