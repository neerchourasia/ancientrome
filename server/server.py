#!/usr/bin/env python3
"""Game server for Walk Ancient Rome: live gladiator duels and chariot races against real people.

Standard library only (Python 3.9+), so there is nothing to install:    python3 server/server.py

One port serves three things:
  GET  /health            a status page for the host's health check
  POST /stripe-webhook    Stripe tells us a payment went through; we grant Premium (signature checked)
  WS   /play              the game connection (JSON text messages)

Who decides what (this is the whole point of having a server):
  * Duels: the server owns health, stamina, swing timing and damage. A client only says where it is, when it swings
    and whether it blocks. A hit needs range, facing and cooldown, all checked here, so nobody can edit their
    own health or one-shot the other player. Movement speed and arena bounds are enforced too.
  * Races: each client drives its own chariot, but the server limits how fast the distance can grow, and it alone
    decides the finishing order.
  * Premium: online play needs Premium. Premium comes from the `entitlements` table, which only this server (with
    the service key) can write, never the player.

Settings are environment variables (see server/README.md).
"""
import asyncio
import base64
import hashlib
import hmac
import json
import math
import os
import random
import re
import struct
import time
import urllib.error
import urllib.parse
import urllib.request

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


def load_config():
    e = os.environ.get
    supa = e("SUPABASE_URL", "").rstrip("/")
    return {
        "port": int(e("PORT", "8765")),
        "supabase_url": supa,
        "anon_key": e("SUPABASE_ANON_KEY", ""),
        "service_key": e("SUPABASE_SERVICE_KEY", ""),
        "stripe_secret": e("STRIPE_WEBHOOK_SECRET", ""),
        # Premium is required online as soon as accounts are configured; with no Supabase it is a free dev server.
        "require_premium": e("REQUIRE_PREMIUM", "1" if supa else "0") == "1",
        "allow_bots": e("ALLOW_BOTS", "1") == "1",
        "bot_wait": float(e("BOT_WAIT", "6")),        # seconds alone in the queue before a practice bot joins
        "race_wait": float(e("RACE_WAIT", "6")),      # seconds to wait for more racers once two are queued
        "origins": [o.strip() for o in e("ALLOWED_ORIGINS", "").split(",") if o.strip()],
        "max_conns": int(e("MAX_CONNS", "400")),
        "max_per_ip": int(e("MAX_PER_IP", "8")),
    }


CFG = load_config()

# ---------------------------------------------------------------------------------------------------------------
# game data (must match the game: character.js and race.js)

CLASS_MODS = {  # only what a duel needs
    "gladiator": {"melee": 1.25, "taken": 0.9},
    "charioteer": {"melee": 0.9, "taken": 1.05},
    "venator": {"melee": 0.9, "taken": 1.0},
    "merchant": {"melee": 0.85, "taken": 1.1},
}
LOOK_COUNTS = {"skin": 6, "hair": 6, "toga": 7, "sash": 6}
PREMIUM_LOOK = {"toga": (5, 6), "sash": (5,)}

ARENA_R = 21.0            # duel arena radius, in metres around its centre
DUEL_SPEED = 9.0          # fastest honest movement in a duel (m/s); more is clamped
DUEL_TIME = 150.0
SWING_HIT_AT, SWING_END, SWING_COST, REACH, REACH_SLACK = 0.28, 0.7, 14.0, 3.1, 0.5

RACE_LEN = 2 * 340 + 2 * math.pi * 22   # one lap of the Circus Maximus path
RACE_LAPS = int(os.environ.get("RACE_LAPS", "3"))   # 3 in the game; set lower to test a whole race quickly
RACE_TOTAL = RACE_LEN * RACE_LAPS
RACE_VMAX = 32.0          # fastest honest chariot speed (m/s); the game's top is about 27
RACE_COUNTDOWN = 4.0
RACE_GRACE = 40.0         # seconds the others get to finish after the first racer crosses the line


def now():
    return time.monotonic()


def clean_name(v):
    v = re.sub(r"[^A-Za-z0-9 '\-]", "", str(v if v is not None else ""))
    return re.sub(r"\s+", " ", v).strip()[:16] or "Player"


def clean_look(look, premium):
    out = {}
    for part, n in LOOK_COUNTS.items():
        i = look.get(part) if isinstance(look, dict) else None
        ok = isinstance(i, int) and not isinstance(i, bool) and 0 <= i < n
        if ok and not premium and i in PREMIUM_LOOK.get(part, ()):
            ok = False   # premium colours only for premium players
        out[part] = i if ok else 0
    return out


def num(v, lo, hi, default=0.0):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    if v != v or v in (float("inf"), float("-inf")):
        return default
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------------------------------------------
# Supabase (accounts and what has been paid for). Replaced by fakes in the tests.

def _http_json(url, headers, body=None, method=None, timeout=8):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method or ("POST" if data else "GET"))
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


async def verify_token(token):
    """Returns the account id (uuid) for a Supabase login token, or None."""
    if not CFG["supabase_url"] or not token:
        return None
    hdr = {"apikey": CFG["anon_key"], "Authorization": "Bearer " + str(token)[:4000]}
    try:
        user = await asyncio.to_thread(_http_json, CFG["supabase_url"] + "/auth/v1/user", hdr)
        return user.get("id") if isinstance(user, dict) else None
    except Exception:
        return None


async def lookup_premium(uid):
    if not CFG["supabase_url"] or not uid:
        return False
    hdr = {"apikey": CFG["service_key"], "Authorization": "Bearer " + CFG["service_key"]}
    url = CFG["supabase_url"] + "/rest/v1/entitlements?select=premium&user_id=eq." + urllib.parse.quote(str(uid), safe="")
    try:
        rows = await asyncio.to_thread(_http_json, url, hdr)
        return bool(rows and rows[0].get("premium"))
    except Exception:
        return False


async def grant_premium(uid):
    hdr = {"apikey": CFG["service_key"], "Authorization": "Bearer " + CFG["service_key"], "Content-Type": "application/json",
           "Prefer": "resolution=merge-duplicates,return=minimal"}
    body = [{"user_id": uid, "premium": True, "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}]
    await asyncio.to_thread(_http_json, CFG["supabase_url"] + "/rest/v1/entitlements?on_conflict=user_id", hdr, body, "POST")


def stripe_signature_ok(payload, header, secret, tolerance=300, at=None):
    """Checks a Stripe-Signature header: 't=...,v1=...' where v1 = HMAC-SHA256(secret, f'{t}.{payload}')."""
    if not secret or not header:
        return False
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    t, sig = parts.get("t"), parts.get("v1")
    if not t or not sig or not t.isdigit():
        return False
    if abs((at if at is not None else time.time()) - int(t)) > tolerance:
        return False
    want = hmac.new(secret.encode(), t.encode() + b"." + payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, sig)


# ---------------------------------------------------------------------------------------------------------------
# WebSocket framing (RFC 6455)

MAX_FRAME = 4096


class ProtocolError(Exception):
    pass


async def read_frame(reader):
    b1, b2 = await reader.readexactly(2)
    op, masked, ln = b1 & 15, b2 >> 7, b2 & 127
    if not b1 >> 7 or op == 0:
        raise ProtocolError("fragmented messages are not supported")
    if ln == 126:
        ln = struct.unpack(">H", await reader.readexactly(2))[0]
    elif ln == 127:
        ln = struct.unpack(">Q", await reader.readexactly(8))[0]
    if ln > MAX_FRAME:
        raise ProtocolError("message too large")
    if not masked:
        raise ProtocolError("client frames must be masked")
    mask = await reader.readexactly(4)
    data = bytearray(await reader.readexactly(ln))
    for i in range(ln):
        data[i] ^= mask[i & 3]
    return op, bytes(data)


def make_frame(op, payload=b""):
    n = len(payload)
    head = bytes([0x80 | op])
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack(">H", n)
    else:
        head += bytes([127]) + struct.pack(">Q", n)
    return head + payload


# ---------------------------------------------------------------------------------------------------------------
# players and rooms

class Conn:
    """One connected browser."""
    def __init__(self, reader, writer, ip):
        self.reader, self.writer, self.ip = reader, writer, ip
        self.id = os.urandom(4).hex()
        self.closed = False
        self.hello = False
        self.uid = None
        self.premium = False
        self.name, self.cls, self.look = "Player", "gladiator", clean_look({}, False)
        self.queue = None          # "duel" / "race" while waiting
        self.queued_at = 0.0
        self.want_bot = False
        self.room = None
        self.me = None             # this connection's player inside its room
        self.tokens, self.tok_t = 60.0, now()

    def send(self, obj):
        if self.closed:
            return
        try:
            self.writer.write(make_frame(1, json.dumps(obj, separators=(",", ":")).encode()))
            if self.writer.transport.get_write_buffer_size() > 512 * 1024:   # a client that cannot keep up
                self.close()
        except Exception:
            self.close()

    def close(self):
        if self.closed:
            return
        self.closed = True
        try:
            self.writer.write(make_frame(8, struct.pack(">H", 1000)))
            self.writer.close()
        except Exception:
            pass

    def allow_message(self):
        t = now()
        self.tokens = min(80.0, self.tokens + (t - self.tok_t) * 50.0)   # 50 messages/s sustained, 80 burst
        self.tok_t = t
        if self.tokens < 1:
            return False
        self.tokens -= 1
        return True

    def info(self):
        return {"id": self.id, "name": self.name, "cls": self.cls, "look": self.look}


class Duelist:
    def __init__(self, conn, index, bot=False, name=None):
        self.conn, self.i, self.bot = conn, index, bot
        self.name = name or (conn.name if conn else "Brutus")
        self.cls = conn.cls if conn else "gladiator"
        self.look = conn.look if conn else clean_look({"toga": 2, "sash": 1}, False)
        self.melee = CLASS_MODS.get(self.cls, CLASS_MODS["gladiator"])["melee"]
        self.taken = CLASS_MODS.get(self.cls, CLASS_MODS["gladiator"])["taken"]
        self.x, self.z = (-12.0, 12.0)[index], 0.0
        self.yaw = (-math.pi / 2, math.pi / 2)[index]
        self.hp, self.st = 100.0, 100.0
        self.swing, self.hit_done, self.block = -1.0, False, False
        self.last_t = now()
        self.next_act = now() + 1.5
        self.block_until = 0.0

    def state(self):
        return [self.i, round(self.x, 2), round(self.z, 2), round(self.yaw, 2), round(self.hp, 1), round(self.st, 1),
                round(self.swing, 2), 1 if self.block else 0]


class DuelRoom:
    kind = "duel"
    TICK = 0.05

    def __init__(self, conns, with_bot=False):
        self.id = os.urandom(3).hex()
        self.players = [Duelist(c, i) for i, c in enumerate(conns)]
        if with_bot:
            self.players.append(Duelist(None, 1, bot=True))
        self.t0 = now()
        self.over = False
        self.events = []
        for p in self.players:
            if p.conn:
                p.conn.room, p.conn.me, p.conn.queue = self, p, None
        for p in self.players:
            if p.conn:
                p.conn.send({"t": "match", "mode": "duel", "room": self.id, "you": p.i, "radius": ARENA_R,
                             "players": [{"i": q.i, "name": q.name + (" (practice bot)" if q.bot else ""), "cls": q.cls, "look": q.look} for q in self.players]})
        self.task = asyncio.ensure_future(self.run())

    # --- messages from a player
    def on_msg(self, conn, m):
        p, t = conn.me, m.get("t")
        if self.over or p is None:
            return
        if t == "pos":
            self.move(p, num(m.get("x"), -100, 100), num(m.get("z"), -100, 100), num(m.get("yaw"), -50, 50))
        elif t == "swing":
            if p.swing < 0 and p.st >= SWING_COST and not p.block:
                p.swing, p.hit_done, p.st = 0.0, False, p.st - SWING_COST
        elif t == "block":
            p.block = bool(m.get("on")) and p.swing < 0

    def move(self, p, x, z, yaw):
        t = now()
        dt = max(0.03, t - p.last_t)
        p.last_t = t
        d = math.hypot(x - p.x, z - p.z)
        limit = DUEL_SPEED * dt + 0.6
        if d > limit:                                   # too fast: move only as far as an honest player could
            x, z = p.x + (x - p.x) * limit / d, p.z + (z - p.z) * limit / d
        r = math.hypot(x, z)
        if r > ARENA_R - 0.6:                           # stay inside the arena
            x, z = x * (ARENA_R - 0.6) / r, z * (ARENA_R - 0.6) / r
        p.x, p.z, p.yaw = x, z, yaw

    def leave(self, conn):
        p = conn.me
        if self.over or p is None:
            return
        others = [q for q in self.players if q is not p and (q.conn or q.bot)]
        self.finish(others[0].i if others else -1, "left")

    # --- the simulation
    async def run(self):
        try:
            while not self.over:
                await asyncio.sleep(self.TICK)
                self.step(self.TICK)
        except asyncio.CancelledError:
            pass

    def step(self, dt):
        a, b = self.players[0], self.players[1]
        for p in self.players:
            if p.bot:
                self.bot_ai(p, b if p is a else a, dt)
            p.st = min(100.0, p.st + (6.0 if p.block else 16.0) * dt) if p.swing < 0 else p.st
            if p.swing >= 0:
                p.swing += dt
                if not p.hit_done and p.swing >= SWING_HIT_AT:
                    p.hit_done = True
                    self.strike(p, b if p is a else a)
                if p.swing >= SWING_END:
                    p.swing = -1.0
        # never stand inside each other
        d = math.hypot(a.x - b.x, a.z - b.z)
        if d < 1.0 and d > 0:
            push = (1.0 - d) / 2
            for p, q in ((a, b), (b, a)):
                p.x += (p.x - q.x) / d * push
                p.z += (p.z - q.z) / d * push
        if not self.over:
            payload = {"t": "duel", "p": [p.state() for p in self.players], "ev": self.events}
            self.events = []
            for p in self.players:
                if p.conn:
                    p.conn.send(payload)
            if a.hp <= 0 or b.hp <= 0:
                self.finish(b.i if a.hp <= 0 else a.i, "ko")
            elif now() - self.t0 > DUEL_TIME:
                self.finish(-1 if abs(a.hp - b.hp) < 0.5 else (a.i if a.hp > b.hp else b.i), "time")

    def strike(self, p, q):
        dx, dz = q.x - p.x, q.z - p.z
        d = math.hypot(dx, dz)
        if d > REACH + REACH_SLACK:
            return self.events.append(["miss", p.i])
        fx, fz = -math.sin(p.yaw), -math.cos(p.yaw)
        if d > 0.01 and (fx * dx + fz * dz) / d < math.cos(1.1):      # must be roughly facing the target
            return self.events.append(["miss", p.i])
        dmg = 20.0 * (0.85 + random.random() * 0.3) * p.melee * q.taken
        qf = (-math.sin(q.yaw), -math.cos(q.yaw))
        facing_back = d > 0.01 and (qf[0] * -dx + qf[1] * -dz) / d > math.cos(1.3)
        if q.block and q.st > 0 and facing_back:
            dmg *= 0.15
            q.st = max(0.0, q.st - 16.0)
            self.events.append(["block", p.i, q.i])
        else:
            self.events.append(["hit", p.i, q.i, round(dmg, 1)])
        q.hp = max(0.0, q.hp - dmg)

    def bot_ai(self, p, target, dt):
        t = now()
        dx, dz = target.x - p.x, target.z - p.z
        d = math.hypot(dx, dz) or 0.01
        want = math.atan2(-dx, -dz)                     # yaw that faces the target (forward = (-sin, -cos))
        diff = (want - p.yaw + math.pi) % (2 * math.pi) - math.pi
        p.yaw += max(-4 * dt, min(4 * dt, diff))
        speed = 3.4 if d > 2.6 else (-1.2 if d < 1.7 else 0.0)
        p.x += -math.sin(p.yaw) * speed * dt
        p.z += -math.cos(p.yaw) * speed * dt
        r = math.hypot(p.x, p.z)
        if r > ARENA_R - 0.6:
            p.x, p.z = p.x * (ARENA_R - 0.6) / r, p.z * (ARENA_R - 0.6) / r
        p.block = t < p.block_until and p.swing < 0
        if target.swing >= 0 and d < 4 and random.random() < 0.02 and t > p.block_until + 0.8:
            p.block_until = t + 0.6
        if p.swing < 0 and d < 3.0 and p.st >= SWING_COST and t >= p.next_act and not p.block:
            p.swing, p.hit_done, p.st = 0.0, False, p.st - SWING_COST
            p.next_act = t + 1.3 + random.random() * 1.4

    def finish(self, winner, reason):
        if self.over:
            return
        self.over = True
        msg = {"t": "end", "mode": "duel", "winner": winner, "reason": reason,
               "hp": [round(p.hp, 1) for p in self.players]}
        for p in self.players:
            if p.conn:
                p.conn.send(msg)
                p.conn.room = p.conn.me = None
        self.task.cancel()


class Racer:
    def __init__(self, conn, index, bot=False):
        self.conn, self.i, self.bot = conn, index, bot
        self.name = conn.name if conn else "Practice bot %d" % index
        self.cls = conn.cls if conn else "charioteer"
        self.look = conn.look if conn else clean_look({"toga": index, "sash": index}, False)
        self.s, self.d, self.v = 0.0, (10.0, -8.0, 2.0, 20.0)[index % 4], 0.0
        self.last_t = None
        self.fin = None
        self.speed = 18.0 + random.random() * 6.0


class RaceRoom:
    kind = "race"
    TICK = 0.1

    def __init__(self, conns, bots=0):
        self.id = os.urandom(3).hex()
        self.players = [Racer(c, i) for i, c in enumerate(conns)]
        for k in range(bots):
            self.players.append(Racer(None, len(self.players), bot=True))
        self.start_at = now() + RACE_COUNTDOWN
        self.over = False
        self.first_fin = None
        for p in self.players:
            if p.conn:
                p.conn.room, p.conn.me, p.conn.queue = self, p, None
        for p in self.players:
            if p.conn:
                p.conn.send({"t": "match", "mode": "race", "room": self.id, "you": p.i, "countdown": RACE_COUNTDOWN,
                             "laps": RACE_LAPS, "length": round(RACE_LEN, 2),
                             "players": [{"i": q.i, "name": q.name, "cls": q.cls, "look": q.look, "d": q.d} for q in self.players]})
        self.task = asyncio.ensure_future(self.run())

    def on_msg(self, conn, m):
        p = conn.me
        if self.over or p is None or m.get("t") != "race" or p.fin is not None:
            return
        t = now()
        if t < self.start_at:                             # no early start
            return
        if p.last_t is None:
            p.last_t = max(self.start_at, t - 0.1)
        dt = max(0.05, t - p.last_t)
        p.last_t = t
        s = num(m.get("s"), 0, RACE_TOTAL + 50)
        if s < p.s - 3:                                   # cannot drive backwards
            s = p.s
        s = min(s, p.s + RACE_VMAX * dt + 2.0)            # cannot be faster than a chariot can go
        p.v = (s - p.s) / dt
        p.s, p.d = s, num(m.get("d"), -16, 26, p.d)
        self.check_finish(p, t)

    def check_finish(self, p, t):
        if p.fin is None and p.s >= RACE_TOTAL:
            p.fin = t - self.start_at
            if self.first_fin is None:
                self.first_fin = t

    def leave(self, conn):
        p = conn.me
        if p is not None:
            p.conn = None
            p.fin = p.fin if p.fin is not None else float("inf")
        if not any(q.conn for q in self.players):
            self.finish("empty")

    async def run(self):
        try:
            while not self.over:
                await asyncio.sleep(self.TICK)
                self.step(self.TICK)
        except asyncio.CancelledError:
            pass

    def step(self, dt):
        t = now()
        for p in self.players:
            if p.bot and t >= self.start_at and p.fin is None:
                p.speed = max(14.0, min(26.0, p.speed + (random.random() - 0.5) * 2))
                p.s += p.speed * dt
                p.v = p.speed
                self.check_finish(p, t)
        payload = {"t": "race", "p": [[p.i, round(p.s, 1), round(p.d, 1), round(p.v, 1), 1 if p.fin is not None else 0] for p in self.players]}
        for p in self.players:
            if p.conn:
                p.conn.send(payload)
        humans = [p for p in self.players if p.conn]
        if humans and all(p.fin is not None for p in humans):
            self.finish("finished")
        elif self.first_fin and t - self.first_fin > RACE_GRACE:
            self.finish("timeout")
        elif t - self.start_at > 600:
            self.finish("timeout")

    def finish(self, reason):
        if self.over:
            return
        self.over = True
        order = sorted(self.players, key=lambda p: (p.fin if p.fin is not None else float("inf"), -p.s))
        msg = {"t": "end", "mode": "race", "reason": reason,
               "order": [{"i": p.i, "name": p.name, "time": (round(p.fin, 2) if p.fin not in (None, float("inf")) else None)} for p in order]}
        for p in self.players:
            if p.conn:
                p.conn.send(msg)
                p.conn.room = p.conn.me = None
        self.task.cancel()


# ---------------------------------------------------------------------------------------------------------------
# matchmaking

CONNS = set()
QUEUES = {"duel": [], "race": []}


def enqueue(conn, mode, want_bot):
    leave_queue(conn)
    conn.queue, conn.queued_at, conn.want_bot = mode, now(), bool(want_bot) and CFG["allow_bots"]
    QUEUES[mode].append(conn)
    conn.send({"t": "queued", "mode": mode, "waiting": len(QUEUES[mode])})


def leave_queue(conn):
    if conn.queue and conn in QUEUES[conn.queue]:
        QUEUES[conn.queue].remove(conn)
    conn.queue = None


def match_once():
    """Pairs up whoever is waiting. Called twice a second."""
    t = now()
    q = QUEUES["duel"]
    q[:] = [c for c in q if not c.closed]
    while len(q) >= 2:
        a, b = q.pop(0), q.pop(0)
        DuelRoom([a, b])
    if q and q[0].want_bot and t - q[0].queued_at >= CFG["bot_wait"]:
        DuelRoom([q.pop(0)], with_bot=True)

    q = QUEUES["race"]
    q[:] = [c for c in q if not c.closed]
    if len(q) >= 4:
        RaceRoom([q.pop(0) for _ in range(4)])
    elif len(q) >= 2 and t - q[1].queued_at >= CFG["race_wait"]:
        RaceRoom([q.pop(0) for _ in range(min(4, len(q)))])
    elif len(q) == 1 and q[0].want_bot and t - q[0].queued_at >= CFG["bot_wait"]:
        RaceRoom([q.pop(0)], bots=3)


async def matchmaker():
    while True:
        await asyncio.sleep(0.5)
        try:
            match_once()
        except Exception as e:  # never let a bug here stop matchmaking
            print("matchmaker error:", repr(e))


# ---------------------------------------------------------------------------------------------------------------
# message handling

async def handle_msg(conn, m):
    t = m.get("t")
    if t == "ping":
        return conn.send({"t": "pong"})
    if t == "hello":
        if conn.hello:
            return
        conn.hello = True
        conn.uid = await verify_token(m.get("token"))
        conn.premium = bool(conn.uid) and await lookup_premium(conn.uid)
        conn.name = clean_name(m.get("name"))
        conn.cls = m.get("cls") if m.get("cls") in CLASS_MODS else "gladiator"
        conn.look = clean_look(m.get("look"), conn.premium or not CFG["require_premium"])
        return conn.send({"t": "welcome", "id": conn.id, "account": bool(conn.uid), "premium": conn.premium,
                          "premiumRequired": CFG["require_premium"], "bots": CFG["allow_bots"]})
    if not conn.hello:
        return conn.send({"t": "error", "code": "hello", "msg": "Say hello first"})
    if t == "queue":
        mode = m.get("mode")
        if mode not in QUEUES:
            return conn.send({"t": "error", "code": "mode", "msg": "Unknown game"})
        if conn.room:
            return conn.send({"t": "error", "code": "busy", "msg": "You are already in a game"})
        if CFG["require_premium"] and not conn.premium:
            return conn.send({"t": "error", "code": "premium", "msg": "Playing real people is a Premium feature" if conn.uid else "Log in with a Premium account to play real people"})
        return enqueue(conn, mode, m.get("bot"))
    if t == "leave":
        leave_queue(conn)
        if conn.room:
            conn.room.leave(conn)
            conn.room = conn.me = None
        return conn.send({"t": "left"})
    if conn.room:
        conn.room.on_msg(conn, m)


def drop(conn):
    leave_queue(conn)
    if conn.room:
        conn.room.leave(conn)
        conn.room = conn.me = None
    CONNS.discard(conn)
    conn.close()


# ---------------------------------------------------------------------------------------------------------------
# HTTP and the WebSocket upgrade

def origin_ok(origin):
    if not origin:
        return True    # not a browser (tests, tools)
    if CFG["origins"]:
        return "*" in CFG["origins"] or origin in CFG["origins"]
    host = urllib.parse.urlparse(origin).hostname
    return host in ("localhost", "127.0.0.1")


async def reply(writer, code, body=b"", ctype="text/plain; charset=utf-8", extra=""):
    reason = {200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 413: "Payload Too Large", 503: "Service Unavailable"}.get(code, "")
    head = "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n%s\r\n" % (code, reason, ctype, len(body), extra)
    writer.write(head.encode() + body)
    try:
        await writer.drain()
    finally:
        writer.close()


async def handle_http(reader, writer):
    peer = writer.get_extra_info("peername") or ("?", 0)
    ip = peer[0]
    try:
        raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        lines = raw.decode("latin-1").split("\r\n")
        method, path, _ = lines[0].split(" ", 2)
        hdr = {}
        for ln in lines[1:]:
            if ":" in ln:
                k, v = ln.split(":", 1)
                hdr[k.strip().lower()] = v.strip()
    except Exception:
        return writer.close()

    path = path.split("?", 1)[0]
    if path == "/health":
        return await reply(writer, 200, json.dumps({"ok": True, "players": len(CONNS), "waiting": {k: len(v) for k, v in QUEUES.items()}}).encode(), "application/json")

    if path == "/stripe-webhook" and method == "POST":
        try:
            n = int(hdr.get("content-length", "0"))
            if n > 65536:
                return await reply(writer, 413)
            payload = await asyncio.wait_for(reader.readexactly(n), timeout=10)
        except Exception:
            return await reply(writer, 400)
        if not stripe_signature_ok(payload, hdr.get("stripe-signature", ""), CFG["stripe_secret"]):
            return await reply(writer, 400, b"bad signature")
        try:
            event = json.loads(payload)
            if event.get("type") == "checkout.session.completed":
                obj = event["data"]["object"]
                uid = obj.get("client_reference_id")
                if uid and obj.get("payment_status") in ("paid", "no_payment_required") and re.fullmatch(r"[0-9a-fA-F-]{36}", uid):
                    await grant_premium(uid)
        except Exception as e:
            print("webhook error:", repr(e))
            return await reply(writer, 503)   # Stripe will retry
        return await reply(writer, 200, b"ok")

    if path == "/play" and hdr.get("upgrade", "").lower() == "websocket" and "sec-websocket-key" in hdr:
        if not origin_ok(hdr.get("origin")):
            return await reply(writer, 403, b"origin not allowed")
        if len(CONNS) >= CFG["max_conns"] or sum(1 for c in CONNS if c.ip == ip) >= CFG["max_per_ip"]:
            return await reply(writer, 503, b"busy")
        accept = base64.b64encode(hashlib.sha1((hdr["sec-websocket-key"] + GUID).encode()).digest()).decode()
        writer.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n" % accept).encode())
        await writer.drain()
        return await ws_session(reader, writer, ip)

    await reply(writer, 404, b"not found")


async def ws_session(reader, writer, ip):
    conn = Conn(reader, writer, ip)
    CONNS.add(conn)
    try:
        while not conn.closed:
            op, data = await asyncio.wait_for(read_frame(reader), timeout=60)
            if op == 8:
                break
            if op == 9:
                writer.write(make_frame(10, data[:125]))
                continue
            if op != 1:
                continue
            if not conn.allow_message():
                break
            try:
                m = json.loads(data)
            except ValueError:
                continue
            if isinstance(m, dict):
                await handle_msg(conn, m)
    except (asyncio.TimeoutError, asyncio.IncompleteReadError, ConnectionError, ProtocolError, OSError):
        pass
    finally:
        drop(conn)


async def serve(host="0.0.0.0", port=None):
    srv = await asyncio.start_server(handle_http, host, CFG["port"] if port is None else port, limit=2 ** 16)
    asyncio.ensure_future(matchmaker())
    return srv


async def main():
    srv = await serve()
    port = srv.sockets[0].getsockname()[1]
    print("Walk Ancient Rome game server on port %d" % port)
    print("  accounts: %s | premium required: %s | bots: %s" % ("on" if CFG["supabase_url"] else "OFF (dev mode)", CFG["require_premium"], CFG["allow_bots"]))
    if not CFG["origins"]:
        print("  WARNING: ALLOWED_ORIGINS is not set, so only pages on localhost can connect. Set it to your site's address.")
    if CFG["supabase_url"] and not CFG["stripe_secret"]:
        print("  note: STRIPE_WEBHOOK_SECRET is not set, so payments cannot unlock Premium yet.")
    async with srv:
        await srv.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
