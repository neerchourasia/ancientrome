"use strict";
// Games played in this browser against bots, with no game server and no login: the dragon boat race (against three practice crews, Beijing) and pok-ta-pok (against a practice bot, Cancún), started with F
// at the pier and on the Great Ball Court. They are the rooms the game server runs (BallRoom and DragonRoom in server/server.py), written again here: the same rules, the same numbers and the same messages,
// so the screens in pvpgames.js do not know the difference (online.js hands the messages to the code that handles the server's, and the browser's key presses come back to the room here). Like the fights in the
// Colosseum nothing is sent anywhere and there is no rank. Real people are still played through the server (the PvP menu). Depends on online.js (which creates the room and gives it somewhere to send its messages).

const LocalGames = (() => {
  const clamp = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
  const botLook = (toga, sash) => ({ skin: 0, hair: 0, toga, sash, acc: [], pet: null, weapon: null });
  let nextId = 1;

  // a room: its own clock (seconds), advanced by the timer in real time (or by hand in a test), and a way to send messages to the screens
  class Room {
    constructor(kind, human, out, done) {
      this.id = `L${(nextId++).toString(16)}`; this.kind = kind; this.human = human; this.out = out; this.done = done;
      this.t = 0; this.real = performance.now(); this.over = false; this.events = []; this.timer = 0;
    }
    now() { return this.t + (performance.now() - this.real) / 1000; }              // (the moment a key was pressed, between two ticks)
    advance(dt) { this.t += dt; this.real = performance.now(); if (!this.over) this.step(dt); }
    begin() {
      this.out(this.matchMessage());
      this.real = performance.now();
      this.timer = setInterval(() => this.advance(Math.min(0.25, (performance.now() - this.real) / 1000)), this.TICK * 1000);
    }
    stop() { if (this.over) return; this.over = true; clearInterval(this.timer); if (this.done) this.done(); }
    on(m) { if (m && m.t === "leave") this.stop(); else if (!this.over && m) this.msg(m); }      // (leaving ends it without a word, as on the server)
  }

  // ---------------------------------------------------------------- pok-ta-pok: BallRoom in server.py
  class BallRoom extends Room {
    constructor(human, out, done) {
      super("ball", human, out, done);
      this.TICK = 0.05; this.TIME_LIMIT = 180;
      this.players = [{ i: 0, bot: false, name: human.name, cls: human.cls, look: human.look }, { i: 1, bot: true, name: "Practice bot", cls: "gladiator", look: botLook(2, 1) }];
      for (const p of this.players) { p.score = 0; p.cool = 0; p.last_t = 0; p.x = 0; p.z = p.i === 0 ? -12 : 12; p.yaw = p.i === 0 ? Math.PI : 0; }
      this.serve(0);
    }
    matchMessage() {
      return { t: "match", mode: "ball", room: this.id, you: 0, ranked: false, players: this.players.map((q) => ({ i: q.i, name: q.name + (q.bot ? " (practice bot)" : ""), cls: q.cls, look: q.look })) };
    }
    serve(side) {                                                                // drops the ball on the half of the player who lost the point
      this.b = [0, 6, side === 0 ? -10 : 10]; this.v = [0, 0, 0]; this.hold = this.t + 2; this.last = null;
    }
    msg(m) {
      const p = this.players[0], tm = this.now();
      if (m.t === "pos") {
        const dt = Math.max(0.03, Math.min(0.5, tm - p.last_t)); p.last_t = tm;
        const lo = -34, hi = -0.8;                                                // (the human is player 0: the north half)
        let x = clamp(m.x, -12.5, 12.5, p.x), z = clamp(m.z, lo, hi, p.z);
        const lim = 8 * dt + 0.6, d = Math.hypot(x - p.x, z - p.z);
        if (d > lim) { x = p.x + (x - p.x) * lim / d; z = p.z + (z - p.z) * lim / d; }
        p.x = x; p.z = z; p.yaw = clamp(m.yaw, -50, 50, p.yaw);
      } else if (m.t === "hit") this.hit(p, tm);
    }
    hit(p, tm) {
      const b = this.b, dx = b[0] - p.x, dz = b[2] - p.z;
      if (tm < p.cool || tm < this.hold || Math.hypot(dx, dz) > 2.4 || b[1] > 2.6) return;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), aim = p.i === 0 ? 1 : -1;      // the way they face, nudged towards the other half so a hit usually goes over
      const ax = fx * 0.65, az = fz * 0.65 + aim * 0.35, n = Math.hypot(ax, az) || 1, speed = 10 + Math.random() * 4;
      this.v = [ax / n * speed, 7.5 + Math.random() * 2, az / n * speed];
      p.cool = tm + 0.45; this.last = p.i; this.events.push(["hit", p.i]);
    }
    point(w, pts, why) {
      this.players[w].score += pts; this.events.push(["point", w, pts, why]);
      if (this.players[w].score >= 5) return this.finish(w, "score");
      this.serve(1 - w);
    }
    botMove(p, dt) {
      const lo = 0.8, hi = 34, b = this.b, tx = Math.max(-12.5, Math.min(12.5, b[0])), tz = Math.max(lo, Math.min(hi, b[2]));
      const d = Math.hypot(tx - p.x, tz - p.z), step = Math.min(d, 4.6 * dt);
      if (d > 0.01) { p.x += (tx - p.x) / d * step; p.z += (tz - p.z) / d * step; }
      const other = this.players[0];
      p.yaw = Math.atan2(-(other.x - p.x), -(other.z - p.z));                       // face the other player
      if (Math.hypot(b[0] - p.x, b[2] - p.z) < 2 && b[1] < 2.4 && Math.random() < 0.6) this.hit(p, this.now());
    }
    step(dt) {
      this.botMove(this.players[1], dt);
      if (this.t >= this.hold) {
        const b = this.b, v = this.v;
        v[1] -= 9.8 * dt;
        for (let k = 0; k < 3; k++) b[k] += v[k] * dt;
        if (Math.abs(b[0]) > 13 && b[1] < 2.2) { b[0] = Math.sign(b[0]) * 13; v[0] = -v[0] * 0.6; }                  // the sloping benches along the foot of the walls
        else if (Math.abs(b[0]) > 15) {                                                                                // the walls, with a stone ring high on each
          if (this.last !== null && Math.abs(b[2]) < 1.3 && Math.abs(b[1] - 6.4) < 1.3) {
            this.players[this.last].score += 3; this.events.push(["point", this.last, 3, "ring"]);                     // the ball through a ring wins the whole match at once
            return this.finish(this.last, "ring");
          }
          b[0] = Math.sign(b[0]) * 15; v[0] = -v[0] * 0.6;
        }
        if (Math.abs(b[2]) > 35) { b[2] = Math.sign(b[2]) * 35; v[2] = -v[2] * 0.6; }                                 // the temples at the two ends
        if (b[1] <= 0.3) return this.point(b[2] < 0 ? 1 : 0, 1, "ground");                                            // it landed on someone's half: the other player scores
      }
      if (this.t > this.TIME_LIMIT) {
        const [a, c] = this.players;
        return this.finish(a.score === c.score ? -1 : a.score > c.score ? 0 : 1, "time");
      }
      this.send();
    }
    send() {
      const ev = this.events; this.events = [];
      this.out({ t: "mini", k: "ball", ev, s: this.players.map((p) => p.score), w: 0, b: this.b.map((x) => Math.round(x * 100) / 100), p: this.players.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, Math.round(p.yaw * 100) / 100]) });
    }
    finish(winner, reason) {
      if (this.over) return;
      this.send();
      this.out({ t: "end", mode: "ball", winner, reason, score: this.players.map((p) => p.score), ranked: false });
      this.stop();
    }
  }

  // ---------------------------------------------------------------- the dragon boat race: DragonRoom in server.py
  const D = { LEN: 250, BEAT: 0.6, COUNTDOWN: 5, KICK: 2, GRACE: 25 };
  class DragonRoom extends Room {
    constructor(human, out, done) {
      super("dragon", human, out, done);
      this.TICK = 0.1;
      this.players = [{ i: 0, bot: false, name: human.name, cls: human.cls, look: human.look }];
      for (let k = 1; k <= 3; k++) this.players.push({ i: k, bot: true, name: `Practice crew ${k + 1}`, cls: "gladiator", look: botLook((k + 1) % 7, k) });
      for (const p of this.players) { p.s = 0; p.v = 0; p.fin = null; p.last_stroke = -9; p.nbeat = -1; p.skill = 0.6 + Math.random() * 0.35; p.strokes = 0; p.perfect = 0; }
      this.start_at = D.COUNTDOWN; this.first_fin = null;
    }
    matchMessage() {
      return { t: "match", mode: "dragon", room: this.id, you: 0, countdown: D.COUNTDOWN, length: D.LEN, beat: D.BEAT, players: this.players.map((q) => ({ i: q.i, name: q.name, cls: q.cls, look: q.look })) };
    }
    msg(m) {
      const p = this.players[0], tm = this.now();
      if (m.t !== "stroke" || p.fin !== null) return;
      if (tm < this.start_at || tm - p.last_stroke < 0.3) return;                  // no early start, and nobody can stroke faster than that
      p.last_stroke = tm;
      const phase = (tm - this.start_at) % D.BEAT, err = Math.min(phase, D.BEAT - phase), q = err < 0.15 ? 1 : err < 0.28 ? 0.6 : 0.2;
      p.v = Math.min(9, p.v + D.KICK * q); p.strokes++; if (q === 1) p.perfect++;
      this.events.push(["stroke", p.i, q]);
    }
    step(dt) {
      const t = this.t, racing = t >= this.start_at;
      if (racing) {
        const beat = Math.floor((t - this.start_at) / D.BEAT);
        for (const p of this.players) {
          if (p.bot && p.fin === null && beat > p.nbeat) {
            p.nbeat = beat;
            if (Math.random() < 0.92) p.v = Math.min(9, p.v + D.KICK * Math.max(0.2, Math.min(1, p.skill + (Math.random() * 0.16 - 0.08))));
          }
          if (p.fin === null) {
            p.v -= p.v * 0.5 * dt; p.s += p.v * dt;
            if (p.s >= D.LEN) { p.fin = t - this.start_at; if (this.first_fin === null) this.first_fin = t; }
          }
        }
      }
      const ev = this.events; this.events = [];
      this.out({ t: "dragon", p: this.players.map((p) => [p.i, Math.round(p.s * 10) / 10, Math.round(p.v * 100) / 100, p.fin !== null ? 1 : 0]), ev, w: 0 });
      if (racing && this.players[0].fin !== null) this.finish("finished");
      else if (this.first_fin !== null && t - this.first_fin > D.GRACE) this.finish("timeout");
      else if (racing && t - this.start_at > 240) this.finish("timeout");
    }
    finish(reason) {
      if (this.over) return;
      const order = this.players.slice().sort((a, b) => (a.fin === null ? Infinity : a.fin) - (b.fin === null ? Infinity : b.fin) || b.s - a.s);
      this.out({ t: "end", mode: "dragon", reason, order: order.map((p) => ({ i: p.i, name: p.name, time: p.fin !== null ? Math.round(p.fin * 100) / 100 : null, perfect: p.perfect, strokes: p.strokes })) });
      this.stop();
    }
  }

  // a room for `kind` ("ball" or "dragon") for this player; `out(message)` receives what the server would send and `done()` is called when it is over. Call room.begin() when `out` is ready.
  function make(kind, me, out, done) {
    const human = { name: (me && me.name) || "Player", cls: (me && me.cls) || "gladiator", look: (me && me.look) || botLook(0, 0) };
    return kind === "ball" ? new BallRoom(human, out, done) : kind === "dragon" ? new DragonRoom(human, out, done) : null;
  }
  return { make, KINDS: ["ball", "dragon"] };
})();
