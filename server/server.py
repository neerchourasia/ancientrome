#!/usr/bin/env python3
"""Game server for Time Machine: live gladiator duels and chariot races against real people.

Standard library only (Python 3.9+), so there is nothing to install:    python3 server/server.py

One port serves two things:
  GET  /health            a status page for the host's health check
  WS   /play              the game connection (JSON text messages)

Who decides what (this is the whole point of having a server):
  * Duels: the server owns health, stamina, swing timing and damage. A client only says where it is, when it swings
    and whether it blocks. A hit needs range, facing and cooldown, all checked here, so nobody can edit their
    own health or one-shot the other player. Movement speed and arena bounds are enforced too.
  * Races: each client drives its own chariot, but the server limits how fast the distance can grow, and it alone
    decides the finishing order.

Settings are environment variables (see server/README.md).
"""
import asyncio
import base64
import collections
import hashlib
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
        "allow_bots": e("ALLOW_BOTS", "1") == "1",
        "bot_wait": float(e("BOT_WAIT", "6")),        # seconds alone in the queue before a practice bot joins
        "race_wait": float(e("RACE_WAIT", "6")),      # seconds to wait for more racers once two are queued
        "coop_wait": float(e("COOP_WAIT", "8")),      # seconds to wait for more teammates once two are queued
        "naval_wait": float(e("NAVAL_WAIT", "8")),    # seconds to wait for more captains once two are queued
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
ACCESSORIES = ("wreath", "helmet", "crown", "cloak", "royalcloak", "cuirass", "armbands", "boots", "shield")   # bought in the Market; cosmetic only
PETS = ("hound", "eagle", "cat", "monkey", "peacock", "owl", "parrot", "cub")
VEHICLES = ("scooter", "citycar", "sportscar", "rickshaw", "oxcart", "elephant", "horse", "camel", "donkey", "bicycle", "motorcycle", "suv", "taxi", "truck", "bus", "chariot")   # what a walker can be seen riding or leaving parked

ARENA_R = 21.0            # duel arena radius, in metres around its centre
DUEL_SPEED = 9.0          # fastest honest movement in a duel (m/s); more is clamped
DUEL_TIME = 150.0
SWING_HIT_AT, SWING_END, SWING_COST, REACH, REACH_SLACK = 0.28, 0.7, 14.0, 3.1, 0.5
# weapons from the armourer: (damage multiplier, reach in metres, how long a swing takes, stamina a swing costs). Must match weapons.js.
WEAPONS = {"dagger": (0.7, 2.5, 0.65, 0.6), "spear": (1.0, 4.3, 1.25, 1.1), "trident": (1.15, 3.9, 1.15, 1.1), "axe": (1.55, 3.0, 1.45, 1.4), "spatha": (1.35, 3.4, 1.2, 1.25)}
WEAPON_DEFAULT = (1.0, REACH, 1.0, 1.0)

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


def clean_look(look):
    out = {}
    for part, n in LOOK_COUNTS.items():
        i = look.get(part) if isinstance(look, dict) else None
        ok = isinstance(i, int) and not isinstance(i, bool) and 0 <= i < n
        out[part] = i if ok else 0
    acc = look.get("acc") if isinstance(look, dict) else None
    out["acc"] = list(dict.fromkeys(a for a in acc if isinstance(a, str) and a in ACCESSORIES))[:5] if isinstance(acc, list) else []
    pet = look.get("pet") if isinstance(look, dict) else None
    out["pet"] = pet if pet in PETS else None      # a companion that follows them (shown to others)
    w = look.get("weapon") if isinstance(look, dict) else None
    out["weapon"] = w if w in WEAPONS else None    # the weapon they fight with (the gladius when none)
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
# Supabase (accounts). Replaced by fakes in the tests.

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


async def is_admin(token):
    """Is this login an admin? Asked of Supabase (the `is_admin` function in supabase-admin.sql), so the list of admins lives in
    your database and nothing secret is needed here. A forged token is never an admin."""
    if not CFG["supabase_url"] or not token:
        return False
    hdr = {"apikey": CFG["anon_key"], "Authorization": "Bearer " + str(token)[:4000], "Content-Type": "application/json"}
    try:
        r = await asyncio.to_thread(_http_json, CFG["supabase_url"] + "/rest/v1/rpc/is_admin", hdr, {}, "POST")
        return r is True
    except Exception:
        return False


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
        self.name, self.cls, self.look = "Player", "gladiator", clean_look({})
        self.queue = None          # "duel" / "race" while waiting
        self.queued_at = 0.0
        self.want_bot = False
        self.room = None
        self.me = None             # this connection's player inside its room
        self.city, self.px, self.pz, self.pyaw, self.pspd, self.walk_at = None, 0.0, 0.0, 0.0, 0.0, 0.0   # where they walk in the open world
        self.veh, self.park = None, None     # the vehicle they are in / the one they left parked
        self.seen = set()          # the other walkers this connection has been told about
        self.ship = None           # the ship design they chose for the naval battle
        self.htier = 0             # the tier of their house (0 to 5), shown to others on their plot
        self.plot = None           # which house plot in Rome is theirs
        self.heist = None          # a robbery they are in (as the thief or the owner)
        self.rob_cd = 0.0          # when they may rob again
        self.houses_sig = None
        self.admin = False         # set from the database when they log in with an admin account
        self.fid = None            # their public friend id (a hash of the account id), only for logged-in players
        self.hints = {}            # friend id -> the name their own browser remembers for that friend
        self.shove_t, self.immune_t = 0.0, 0.0   # when they last shoved someone, and until when nobody can shove them again
        self.singing, self.sang_at = None, -1e9    # the song they are singing in the chat, and when they last started one
        self.pic_t = -1e9          # when they last sent a picture in the chat
        self.fest_t = 0.0          # when they last put a festival lamp or lantern down
        self.social_t, self.social_n = now(), 8.0   # how many friend requests / lookups they may do right now
        self.muted_until = 0.0
        self.ctok, self.ctok_t = 3.0, now()   # chat: how many messages they may send right now
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
        self.who = conn            # who they started as (stays when they leave, so leaving still counts for the rating)
        self.name = name or (conn.name if conn else "Brutus")
        self.cls = conn.cls if conn else "gladiator"
        self.look = conn.look if conn else clean_look({"toga": 2, "sash": 1})
        self.melee = CLASS_MODS.get(self.cls, CLASS_MODS["gladiator"])["melee"]
        self.taken = CLASS_MODS.get(self.cls, CLASS_MODS["gladiator"])["taken"]
        self.x, self.z = (-12.0, 12.0)[index], 0.0
        self.yaw = (-math.pi / 2, math.pi / 2)[index]
        self.hp, self.st = 100.0, 100.0
        self.swing, self.hit_done, self.block = -1.0, False, False
        self.last_t = now()
        self.next_act = now() + 1.5
        self.block_until = 0.0
        self.speed, self.cool, self.cool_span = 3.4, 1.3, 1.4   # how fast a bot walks, and how often it swings
        self.wdmg, self.reach, self.wtime, wcost = WEAPONS.get(self.look.get("weapon"), WEAPON_DEFAULT)
        self.hit_at, self.end_at, self.swing_cost = SWING_HIT_AT * self.wtime, SWING_END * self.wtime, SWING_COST * wcost

    def state(self):
        return [self.i, round(self.x, 2), round(self.z, 2), round(self.yaw, 2), round(self.hp, 1), round(self.st, 1),
                round(self.swing if self.swing < 0 else self.swing / self.wtime, 2), 1 if self.block else 0]   # a swing is reported on the standard timeline, so every weapon animates the same


def bot_think(p, target, dt):
    """What a bot (a practice opponent, an ally or an enemy) does each tick: face the target, close in, swing, sometimes block."""
    t = now()
    dx, dz = target.x - p.x, target.z - p.z
    d = math.hypot(dx, dz) or 0.01
    want = math.atan2(-dx, -dz)                     # yaw that faces the target (forward = (-sin, -cos))
    diff = (want - p.yaw + math.pi) % (2 * math.pi) - math.pi
    p.yaw += max(-4 * dt, min(4 * dt, diff))
    speed = p.speed if d > 2.6 else (-1.2 if d < 1.7 else 0.0)
    p.x += -math.sin(p.yaw) * speed * dt
    p.z += -math.cos(p.yaw) * speed * dt
    r = math.hypot(p.x, p.z)
    if r > ARENA_R - 0.6:
        p.x, p.z = p.x * (ARENA_R - 0.6) / r, p.z * (ARENA_R - 0.6) / r
    p.block = t < p.block_until and p.swing < 0
    if target.swing >= 0 and d < 4 and random.random() < 0.02 and t > p.block_until + 0.8:
        p.block_until = t + 0.6
    if p.swing < 0 and d < p.reach - 0.1 and p.st >= p.swing_cost and t >= p.next_act and not p.block:
        p.swing, p.hit_done, p.st = 0.0, False, p.st - p.swing_cost
        p.next_act = t + p.cool + random.random() * p.cool_span


class DuelRoom:
    kind = "duel"
    TICK = 0.05

    def __init__(self, conns, with_bot=False, ranked=False):
        self.id = os.urandom(3).hex()
        self.ranked = ranked and not with_bot       # a practice match against a bot does not count
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
                p.conn.send({"t": "match", "mode": "duel", "room": self.id, "you": p.i, "radius": ARENA_R, "ranked": self.ranked,
                             "players": [{"i": q.i, "name": q.name + (" (practice bot)" if q.bot else "") + (" (%d)" % rating_of(q.conn)["r"] if self.ranked and q.conn and q.conn.uid else ""), "cls": q.cls, "look": q.look} for q in self.players]})
        self.task = asyncio.ensure_future(self.run())

    # --- messages from a player
    def on_msg(self, conn, m):
        p, t = conn.me, m.get("t")
        if self.over or p is None:
            return
        if t == "pos":
            self.move(p, num(m.get("x"), -100, 100), num(m.get("z"), -100, 100), num(m.get("yaw"), -50, 50))
        elif t == "swing":
            if p.swing < 0 and p.st >= p.swing_cost and not p.block:
                p.swing, p.hit_done, p.st = 0.0, False, p.st - p.swing_cost
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
                if not p.hit_done and p.swing >= p.hit_at:
                    p.hit_done = True
                    self.strike(p, b if p is a else a)
                if p.swing >= p.end_at:
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
        if d > p.reach + REACH_SLACK:
            return self.events.append(["miss", p.i])
        fx, fz = -math.sin(p.yaw), -math.cos(p.yaw)
        if d > 0.01 and (fx * dx + fz * dz) / d < math.cos(1.1):      # must be roughly facing the target
            return self.events.append(["miss", p.i])
        dmg = 20.0 * (0.85 + random.random() * 0.3) * p.melee * p.wdmg * q.taken
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
        bot_think(p, target, dt)

    def finish(self, winner, reason):
        if self.over:
            return
        self.over = True
        msg = {"t": "end", "mode": "duel", "winner": winner, "reason": reason,
               "hp": [round(p.hp, 1) for p in self.players]}
        ranks = rate_placements([(p.who, 0 if p.i == winner else 1 if winner != -1 else 0) for p in self.players if p.who]) if self.ranked else {}
        for p in self.players:
            if p.conn:
                out = dict(msg, ranked=self.ranked, rank=ranks.get(id(p.who))) if self.ranked else msg
                p.conn.send(out)
                p.conn.room = p.conn.me = None
        self.task.cancel()


ENEMY_NAMES = ("Brutus", "Lucius", "Gaius", "Cassius", "Titus")
ALLY_NAMES = ("Marcus", "Decimus", "Flavius")
ENEMIES = 5


class Fighter(Duelist):
    """Anyone in a co-op battle: a player, a friendly bot (ally) or an enemy bot."""
    def __init__(self, conn, index, role, name=None):
        super().__init__(conn, 0, bot=conn is None, name=name)
        self.i, self.role = index, role
        self.team = 1 if role == "enemy" else 0
        self.down, self.rev = False, 0.0
        if role == "enemy":                 # weaker one by one, dangerous together
            self.look = clean_look({"toga": 4, "sash": 3, "hair": 0})
            self.cls, self.melee, self.taken, self.hp = "gladiator", 0.8, 1.0, 80.0
            self.speed, self.cool, self.cool_span = 3.0, 1.8, 1.2
        elif role == "ally":
            self.look = clean_look({"toga": 2 + index % 3, "sash": 1})
            self.speed, self.cool, self.cool_span = 3.2, 1.5, 1.2

    def state(self):
        return super().state() + [1 if self.down else 0, self.team]


class CoopRoom:
    """Players (and friendly bots) work together to beat five enemy bots in the arena."""
    kind = "coop"
    TICK = 0.05
    TIME_LIMIT = 300.0

    def __init__(self, conns, allies=0):
        self.id = os.urandom(3).hex()
        self.fighters = []
        n = len(conns) + allies
        for k, c in enumerate(conns):
            self.fighters.append(Fighter(c, len(self.fighters), "player"))
        for k in range(allies):
            self.fighters.append(Fighter(None, len(self.fighters), "ally", name=ALLY_NAMES[k % len(ALLY_NAMES)] + " (ally bot)"))
        friends = list(self.fighters)
        for k, f in enumerate(friends):     # the team starts on the west side, in a line
            f.x, f.z, f.yaw = -14.0, (k - (n - 1) / 2) * 3.4, -math.pi / 2
        for k in range(ENEMIES):            # the enemies spread out around the east side
            e = Fighter(None, len(self.fighters), "enemy", name=ENEMY_NAMES[k % len(ENEMY_NAMES)] + " (bot)")
            a = math.radians(-70 + k * 35)
            e.x, e.z, e.yaw = 15.0 * math.cos(a), 15.0 * math.sin(a), math.pi / 2
            self.fighters.append(e)
        self.t0, self.over, self.events = now(), False, []
        for f in self.fighters:
            if f.conn:
                f.conn.room, f.conn.me, f.conn.queue = self, f, None
        roster = [{"i": f.i, "name": f.name, "cls": f.cls, "look": f.look, "role": f.role, "x": round(f.x, 2), "z": round(f.z, 2), "yaw": round(f.yaw, 2)} for f in self.fighters]
        for f in self.fighters:
            if f.conn:
                f.conn.send({"t": "match", "mode": "coop", "room": self.id, "you": f.i, "radius": ARENA_R, "enemies": ENEMIES, "players": roster})
        self.task = asyncio.ensure_future(self.run())

    # --- messages from a player
    def on_msg(self, conn, m):
        p, t = conn.me, m.get("t")
        if self.over or p is None or p.down:
            return
        if t == "pos":
            DuelRoom.move(self, p, num(m.get("x"), -100, 100), num(m.get("z"), -100, 100), num(m.get("yaw"), -50, 50))
        elif t == "swing":
            if p.swing < 0 and p.st >= p.swing_cost and not p.block:
                p.swing, p.hit_done, p.st = 0.0, False, p.st - p.swing_cost
        elif t == "block":
            p.block = bool(m.get("on")) and p.swing < 0

    def leave(self, conn):
        p = conn.me
        if p is None:
            return
        p.conn, p.hp, p.down, p.swing, p.block = None, 0.0, True, -1.0, False   # a player who leaves is out of the fight
        p.rev = 0.0
        if not any(f.conn for f in self.fighters if f.role == "player"):
            self.finish("empty", False)

    # --- the simulation
    async def run(self):
        try:
            while not self.over:
                await asyncio.sleep(self.TICK)
                self.step(self.TICK)
        except asyncio.CancelledError:
            pass

    def nearest(self, p, team):
        best, bd = None, 1e9
        for q in self.fighters:
            if q.team == team and not q.down:
                d = math.hypot(q.x - p.x, q.z - p.z)
                if d < bd:
                    best, bd = q, d
        return best

    def step(self, dt):
        for p in self.fighters:
            if p.down:
                continue
            if p.bot:
                target = self.nearest(p, 1 - p.team)
                if target:
                    bot_think(p, target, dt)
            if p.swing < 0:
                p.st = min(100.0, p.st + (6.0 if p.block else 16.0) * dt)
            else:
                p.swing += dt
                if not p.hit_done and p.swing >= p.hit_at:
                    p.hit_done = True
                    self.strike(p)
                if p.swing >= p.end_at:
                    p.swing = -1.0
        # nobody stands inside anybody else
        live = [f for f in self.fighters if not f.down]
        for i, a in enumerate(live):
            for b in live[i + 1:]:
                d = math.hypot(a.x - b.x, a.z - b.z)
                if 0 < d < 1.0:
                    push, ux, uz = (1.0 - d) / 2, (a.x - b.x) / d, (a.z - b.z) / d
                    a.x += ux * push; a.z += uz * push
                    b.x -= ux * push; b.z -= uz * push
        # a teammate standing beside a downed player for three seconds gets them back on their feet
        for p in self.fighters:
            if p.down and p.role == "player" and p.conn:
                near = any(not q.down and q.team == 0 and q is not p and math.hypot(q.x - p.x, q.z - p.z) < 2.6 for q in self.fighters)
                p.rev = p.rev + dt if near else max(0.0, p.rev - 2 * dt)
                if p.rev >= 3.0:
                    p.down, p.hp, p.rev = False, 40.0, 0.0
                    self.events.append(["revive", p.i])
        if self.over:
            return
        payload = {"t": "coop", "p": [f.state() for f in self.fighters], "ev": self.events, "rev": [[f.i, round(f.rev, 1)] for f in self.fighters if f.rev > 0]}
        self.events = []
        for f in self.fighters:
            if f.conn:
                f.conn.send(payload)
        enemies = [f for f in self.fighters if f.team == 1]
        team = [f for f in self.fighters if f.team == 0]
        if all(e.down for e in enemies):
            self.finish("cleared", True)
        elif all(f.down for f in team):
            self.finish("defeated", False)
        elif now() - self.t0 > self.TIME_LIMIT:
            self.finish("time", False)

    def strike(self, p):
        best, bd = None, 1e9
        fx, fz = -math.sin(p.yaw), -math.cos(p.yaw)
        for q in self.fighters:
            if q.team == p.team or q.down:
                continue
            dx, dz = q.x - p.x, q.z - p.z
            d = math.hypot(dx, dz)
            if d > p.reach + REACH_SLACK or (d > 0.01 and (fx * dx + fz * dz) / d < math.cos(1.1)):
                continue
            if d < bd:
                best, bd = q, d
        if best is None:
            return self.events.append(["miss", p.i])
        q = best
        dx, dz = q.x - p.x, q.z - p.z
        dmg = 20.0 * (0.85 + random.random() * 0.3) * p.melee * p.wdmg * q.taken
        qf = (-math.sin(q.yaw), -math.cos(q.yaw))
        facing = bd > 0.01 and (qf[0] * -dx + qf[1] * -dz) / bd > math.cos(1.3)
        if q.block and q.st > 0 and facing:
            dmg *= 0.15
            q.st = max(0.0, q.st - 16.0)
            self.events.append(["block", p.i, q.i])
        else:
            self.events.append(["hit", p.i, q.i, round(dmg, 1)])
        q.hp = max(0.0, q.hp - dmg)
        if q.hp <= 0:
            q.down, q.swing, q.block = True, -1.0, False
            self.events.append(["down", q.i])

    def finish(self, reason, won):
        if self.over:
            return
        self.over = True
        kills = sum(1 for f in self.fighters if f.team == 1 and f.down)
        msg = {"t": "end", "mode": "coop", "won": won, "reason": reason, "kills": kills, "enemies": ENEMIES}
        ranks = rate_team([f.who for f in self.fighters if f.who and f.role == "player"], won) if reason != "empty" else {}
        for f in self.fighters:
            if f.conn:
                f.conn.send(dict(msg, rank=ranks.get(id(f.who))) if ranks.get(id(f.who)) else msg)
                f.conn.room = f.conn.me = None
        self.task.cancel()


class Racer:
    def __init__(self, conn, index, bot=False):
        self.conn, self.i, self.bot = conn, index, bot
        self.who = conn
        self.name = conn.name if conn else "Practice bot %d" % index
        self.cls = conn.cls if conn else "charioteer"
        self.look = conn.look if conn else clean_look({"toga": index, "sash": index})
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
        ranks = rate_placements([(p.who, k) for k, p in enumerate(order) if p.who])
        for p in self.players:
            if p.conn:
                p.conn.send(dict(msg, rank=ranks[id(p.who)]) if id(p.who) in ranks else msg)
                p.conn.room = p.conn.me = None
        self.task.cancel()


# ---------------------------------------------------------------------------------------------------------------
# naval battle: every ship for itself (no teams). Players steer their own galley (the browser sends where it is, as
# with duels, and the server clamps how fast it can move); the SERVER owns cannonballs, hits, rams, hull and the winner.

NAVAL_RX, NAVAL_RZ = 29.0, 23.5      # sailable ellipse, in metres around the flooded arena's centre
NAVAL_SPEED = 6.6                    # a galley's top speed (m/s); a little more is allowed for lag, the rest is clamped
NAVAL_COUNTDOWN = 5.0                # the arena floods while this runs down
NAVAL_TIME = 240.0
NAVAL_CD = 2.2                       # seconds before the same side can fire again
NAVAL_BALL_DMG = 8.0
NAVAL_RAM_DMG = 12.0
NAVAL_LEVEL = 0.9                    # water level when flooded
NAVAL_GRAVITY = 14.0
BOT_SHIP_NAMES = ("Corvus", "Neptunus", "Fortuna")


# The ships a player can bring (mirrors shipyard.js): hull points, size, top speed (m/s), how many cannons, half-width and length
NAVAL_SLOTS = 7
NAVAL_SLOT_Z = (3.6, 2.4, 1.2, 0.0, -1.2, -2.4, -3.6)
NAVAL_TYPES = {
    "kayak": {"hp": 30, "scale": 0.5, "max": 9.6, "hw": 0.45, "lenK": 0.7, "ports": (3,), "stars": ()},
    "canoe": {"hp": 45, "scale": 0.6, "max": 8.8, "hw": 0.7, "lenK": 0.78, "ports": (3,), "stars": (3,)},
    "fishing": {"hp": 65, "scale": 0.55, "max": 6.2, "hw": 1.1, "lenK": 0.75, "ports": (2, 4), "stars": (2, 4)},
    "liburna": {"hp": 70, "scale": 0.8, "max": 8.2, "hw": 1.5, "lenK": 1.0, "ports": (1, 3, 5), "stars": (1, 3, 5)},
    "galley": {"hp": 100, "scale": 0.9, "max": 6.6, "hw": 1.5, "lenK": 1.0, "ports": (0, 2, 4, 6), "stars": (0, 2, 4, 6)},
    "trireme": {"hp": 130, "scale": 1.0, "max": 5.8, "hw": 1.5, "lenK": 1.0, "ports": (0, 1, 3, 5, 6), "stars": (0, 1, 3, 5, 6)},
    "quinquereme": {"hp": 175, "scale": 1.15, "max": 4.8, "hw": 1.5, "lenK": 1.0, "ports": (0, 1, 2, 4, 5, 6), "stars": (0, 1, 2, 4, 5, 6)},
    # motorboats, sailboats and other modern craft (the same numbers as shipyard.js)
    "rowboat": {"hp": 40, "scale": 0.55, "max": 5, "hw": 0.9, "lenK": 0.6, "ports": (3,), "stars": ()},
    "jon": {"hp": 55, "scale": 0.6, "max": 7.4, "hw": 0.9, "lenK": 0.7, "ports": (3,), "stars": (3,)},
    "pwc": {"hp": 25, "scale": 0.45, "max": 12, "hw": 0.55, "lenK": 0.45, "ports": (3,), "stars": ()},
    "bowrider": {"hp": 80, "scale": 0.7, "max": 11, "hw": 1.2, "lenK": 0.85, "ports": (2, 4), "stars": (2, 4)},
    "console": {"hp": 90, "scale": 0.75, "max": 10, "hw": 1.25, "lenK": 0.9, "ports": (1, 3, 5), "stars": (1, 3, 5)},
    "pontoon": {"hp": 110, "scale": 0.9, "max": 4.4, "hw": 1.7, "lenK": 0.9, "ports": (1, 2, 4, 5), "stars": (1, 2, 4, 5)},
    "sloop": {"hp": 85, "scale": 0.8, "max": 7, "hw": 1.1, "lenK": 0.95, "ports": (2, 4), "stars": (2, 4)},
    "catamaran": {"hp": 100, "scale": 0.85, "max": 9, "hw": 1.9, "lenK": 0.9, "ports": (1, 3, 5), "stars": (1, 3, 5)},
    "cruiser": {"hp": 120, "scale": 0.95, "max": 8, "hw": 1.4, "lenK": 1.05, "ports": (0, 2, 4, 6), "stars": (0, 2, 4, 6)},
    "houseboat": {"hp": 150, "scale": 1, "max": 2.8, "hw": 2, "lenK": 1, "ports": (0, 1, 3, 5, 6), "stars": (0, 1, 3, 5, 6)},
    "trawler": {"hp": 160, "scale": 1.05, "max": 4.6, "hw": 1.5, "lenK": 1.1, "ports": (0, 1, 2, 4, 5), "stars": (0, 1, 2, 4, 5)},
    "yacht": {"hp": 200, "scale": 1.2, "max": 8.5, "hw": 1.5, "lenK": 1.25, "ports": (0, 1, 2, 4, 5, 6), "stars": (0, 1, 2, 4, 5, 6)},
    "battleship": {"hp": 260, "scale": 1.4, "max": 4.2, "hw": 2.1, "lenK": 1.3, "ports": tuple(range(7)), "stars": tuple(range(7))},
}
for _t in NAVAL_TYPES.values():
    _t["cannons"] = len(_t["ports"]) + len(_t["stars"])         # the most a boat can hold


def clean_ship(d):
    """A ship design from a browser, cut down to what is allowed: a known type, at most that type's cannons, no junk."""
    out = {"type": "galley", "sail": 0, "hull": 0, "port": [False] * NAVAL_SLOTS, "star": [False] * NAVAL_SLOTS, "pa": [2] * NAVAL_SLOTS, "sa": [2] * NAVAL_SLOTS}   # pa / sa: how each cannon is aimed (0 ahead, 1 ahead-diagonal, 2 side, 3 astern-diagonal, 4 astern)
    if not isinstance(d, dict):
        out["port"] = [i in (0, 2, 4) for i in range(NAVAL_SLOTS)]
        out["star"] = list(out["port"])
        return out
    if d.get("type") in NAVAL_TYPES:
        out["type"] = d["type"]
    for k, n in (("sail", 8), ("hull", 6)):
        v = d.get(k)
        out[k] = v if isinstance(v, int) and not isinstance(v, bool) and 0 <= v < n else 0
    left = NAVAL_TYPES[out["type"]]["cannons"]
    ok = {"port": NAVAL_TYPES[out["type"]]["ports"], "star": NAVAL_TYPES[out["type"]]["stars"]}
    for side, aim in (("port", "pa"), ("star", "sa")):
        arr = d.get(side) if isinstance(d.get(side), list) else []
        aims = d.get(aim) if isinstance(d.get(aim), list) else []
        for i in range(NAVAL_SLOTS):
            if i < len(arr) and arr[i] is True and left > 0 and i in ok[side]:
                out[side][i] = True
                left -= 1
            if i < len(aims) and isinstance(aims[i], int) and not isinstance(aims[i], bool) and 0 <= aims[i] <= 4:
                out[aim][i] = aims[i]
    if not any(out["port"]) and not any(out["star"]):
        t = NAVAL_TYPES[out["type"]]
        if t["ports"]:
            out["port"][t["ports"][len(t["ports"]) // 2]] = True
        if t["stars"]:
            out["star"][t["stars"][len(t["stars"]) // 2]] = True
    return out


class Ship:
    def __init__(self, conn, index, count, bot=False):
        self.conn, self.i, self.bot = conn, index, bot
        self.who = conn
        self.name = conn.name if conn else "%s (practice ship)" % BOT_SHIP_NAMES[index % len(BOT_SHIP_NAMES)]
        self.cls = conn.cls if conn else "gladiator"
        self.look = conn.look if conn else clean_look({"toga": index, "sash": index})
        a = 2 * math.pi * index / max(1, count)
        self.x, self.z = 19.0 * math.cos(a), 15.5 * math.sin(a)
        self.yaw = math.atan2(-self.x, -self.z)          # facing the middle
        self.v = 0.0
        self.design = None if (bot or conn is None) else clean_ship(getattr(conn, "ship", None))
        T = NAVAL_TYPES[self.design["type"]] if self.design else NAVAL_TYPES["galley"]
        self.sc, self.hw, self.lenK = T["scale"], T["hw"], T["lenK"]
        self.hp = 60.0 if bot else float(T["hp"])
        self.max_speed = 5.4 if bot else T["max"]
        d = self.design or clean_ship(None)
        self.cannons = {1: [(NAVAL_SLOT_Z[i] * self.lenK, d["pa"][i]) for i in range(NAVAL_SLOTS) if d["port"][i]], -1: [(NAVAL_SLOT_Z[i] * self.lenK, d["sa"][i]) for i in range(NAVAL_SLOTS) if d["star"][i]]}   # (position along the ship, aim)
        self.cd = {1: 0.3, -1: 0.3}
        self.team = None
        self.ram = 0.0
        self.ai, self.ai_t = "kite", random.random() * 3.0   # what a practice ship is doing: ram (bow first at you), back (away after a ram), or kite (circle and fire broadsides)
        self.dead_at = None                               # when it sank (for the final order)
        self.last_t = None
        self.queue = []                                   # cannons waiting to go off: [delay, side]
        self.fire_cd = random.random() * 2.5 + 2.0        # bots: first broadside

    @property
    def dead(self):
        return self.dead_at is not None

    def row(self):
        return [self.i, round(self.x, 2), round(self.z, 2), round(self.yaw, 3), round(self.v, 1), round(self.hp, 1),
                round(self.cd[1], 1), round(self.cd[-1], 1), 1 if self.dead else 0]


def ship_fwd(s):
    return math.sin(s.yaw), math.cos(s.yaw)


def ship_side(s, side):
    """Unit vector out of the port (+1) or starboard (-1) side."""
    return (math.cos(s.yaw), -math.sin(s.yaw)) if side > 0 else (-math.cos(s.yaw), math.sin(s.yaw))


def ang_diff(a, b):
    return (b - a + math.pi) % (2 * math.pi) - math.pi


class NavalRoom:
    kind = "naval"
    TICK = 0.05

    def __init__(self, conns, bots=0, coop=False):
        self.id = os.urandom(3).hex()
        self.coop = coop                                  # a crew battle: the players sail together against the practice ships
        n = len(conns) + bots
        self.ships = [Ship(c, i, n) for i, c in enumerate(conns)]
        for _ in range(bots):
            self.ships.append(Ship(None, len(self.ships), n, bot=True))
        for s in self.ships:
            s.team = 1 if s.bot else 0
        self.balls, self.next_ball, self.events = [], 1, []
        self.start_at = now() + NAVAL_COUNTDOWN
        self.over = False
        self.out = 0                                      # how many have sunk so far
        for s in self.ships:
            if s.conn:
                s.conn.room, s.conn.me, s.conn.queue = self, s, None
        for s in self.ships:
            if s.conn:
                s.conn.send({"t": "match", "mode": "naval", "room": self.id, "you": s.i, "countdown": NAVAL_COUNTDOWN, "coop": self.coop,
                             "rx": NAVAL_RX, "rz": NAVAL_RZ,
                             "players": [{"i": q.i, "name": q.name, "cls": q.cls, "look": q.look, "bot": q.bot, "ship": q.design,
                                          "x": round(q.x, 2), "z": round(q.z, 2), "yaw": round(q.yaw, 3)} for q in self.ships]})
        self.task = asyncio.ensure_future(self.run())

    # ---- what the players send: where the ship is, and which side to fire
    def on_msg(self, conn, m):
        s = conn.me
        if self.over or s is None or m.get("t") != "naval" or s.dead:
            return
        t = now()
        if t < self.start_at:
            return
        if s.last_t is None:
            s.last_t = max(self.start_at, t - 0.05)
        dt = max(0.03, min(0.5, t - s.last_t))
        s.last_t = t
        if "x" in m and "z" in m:
            nx, nz = num(m.get("x"), -60, 60, s.x), num(m.get("z"), -60, 60, s.z)
            step = math.hypot(nx - s.x, nz - s.z)
            lim = s.max_speed * 1.25 * dt + 0.4           # cannot sail faster than their ship can
            if step > lim:
                nx, nz = s.x + (nx - s.x) * lim / step, s.z + (nz - s.z) * lim / step
                step = lim
            e = (nx / NAVAL_RX) ** 2 + (nz / NAVAL_RZ) ** 2
            if e > 1:
                k = 1 / math.sqrt(e)
                nx, nz = nx * k, nz * k
            yaw = num(m.get("yaw"), -50, 50, s.yaw)
            fx, fz = math.sin(yaw), math.cos(yaw)
            along = ((nx - s.x) * fx + (nz - s.z) * fz) / dt   # speed along the bow, for rams
            s.v = max(-3.0, min(s.max_speed, 0.5 * s.v + 0.5 * along))
            s.x, s.z, s.yaw = nx, nz, yaw
        side = m.get("fire")
        if side in (1, -1):
            self.fire(s, side)

    def fire(self, s, side):
        if s.dead or s.cd[side] > 0 or now() < self.start_at:
            return False
        guns = s.cannons[side]
        if not guns:
            return False
        s.cd[side] = 1.6 + 0.2 * len(guns) if not s.bot else 4.5 + random.random() * 2   # a bigger broadside reloads slower (three: 2.2 s)
        for k, (cz, aim) in enumerate(guns):
            s.queue.append([k * min(0.13, 0.4 / max(1, len(guns))) + random.random() * 0.04, side, cz, aim])   # a quick ripple, so a big broadside is over in under half a second
        return True

    def shoot(self, s, side, cz, aim=2):
        fx, fz = ship_fwd(s)
        nx, nz = ship_side(s, side)
        sc = s.sc
        off = (s.hw + 0.4) * sc
        x, z, y = s.x + fx * cz * sc + nx * off, s.z + fz * cz * sc + nz * off, NAVAL_LEVEL + 1.3 * sc
        spread = 4.2 if s.bot else 1.5
        th = aim * math.pi / 4                             # 0 ahead ... 2 straight out of the side ... 4 astern
        dx_, dz_ = fx * math.cos(th) + nx * math.sin(th), fz * math.cos(th) + nz * math.sin(th)
        x, z = x + dx_ * 0.6, z + dz_ * 0.6
        off = (random.random() - 0.5) * spread             # the shot wanders a little across its line
        sp = 15.0 * (0.95 + random.random() * 0.1)             # a weaker shot: it carries about 15 m
        self.balls.append({"id": self.next_ball, "x": x, "y": y, "z": z, "vx": dx_ * sp - dz_ * off + fx * s.v,
                           "vz": dz_ * sp + dx_ * off + fz * s.v, "vy": 5.5 + random.random(), "by": s})
        self.next_ball += 1
        self.events.append(["f", round(x, 1), round(y, 1), round(z, 1), round(dx_, 2), round(dz_, 2)])

    def leave(self, conn):
        s = conn.me
        if s is not None:
            s.conn = None
            if not s.dead:
                self.sink(s)
        if not any(q.conn for q in self.ships):
            self.finish("empty")

    # ---- the simulation
    async def run(self):
        try:
            while not self.over:
                await asyncio.sleep(self.TICK)
                self.step(self.TICK)
        except asyncio.CancelledError:
            pass

    def sink(self, s):
        s.hp, s.dead_at, s.v = 0.0, self.out, 0.0
        self.out += 1
        s.queue = []
        self.events.append(["d", s.i])

    def hurt(self, s, dmg, x, y, z, by=None):
        s.hp -= dmg
        self.events.append(["h", s.i, round(x, 1), round(y, 1), round(z, 1)])
        if s.hp <= 0 and not s.dead:
            self.sink(s)

    def bot_think(self, b, dt):
        targets = [q for q in self.ships if q is not b and not q.dead]
        humans = [q for q in targets if not q.bot]
        pool = humans or targets
        if not pool:
            return
        t = min(pool, key=lambda q: math.hypot(q.x - b.x, q.z - b.z))
        dx, dz = t.x - b.x, t.z - b.z
        dist = math.hypot(dx, dz) or 1.0
        bearing = math.atan2(dx, dz)
        # practice ships do not only circle and shoot: they also charge and ram you bow first, then back away for a moment
        b.ai_t -= dt
        if b.ai == "ram" and b.ram > 0:
            b.ai, b.ai_t = "back", 2.5
        elif b.ai_t <= 0:
            if b.ai == "ram":
                b.ai, b.ai_t = "kite", 3.0 + random.random() * 3.0
            elif random.random() < 0.7:
                b.ai, b.ai_t = "ram", 6.0 + random.random() * 3.0
            else:
                b.ai, b.ai_t = "kite", 3.0 + random.random() * 3.0
        if b.ai == "ram":
            want, thr = bearing, 1.0
        elif b.ai == "back" and dist < 14:
            want, thr = bearing + math.pi, 0.9
        elif dist > 12:
            want, thr = bearing, 1.0
        elif dist < 6:
            want, thr = bearing + math.pi, 0.8
        else:
            a1, a2 = bearing + math.pi / 2, bearing - math.pi / 2
            want, thr = (a1 if abs(ang_diff(b.yaw, a1)) < abs(ang_diff(b.yaw, a2)) else a2), 0.45
        turn = max(-1.0, min(1.0, ang_diff(b.yaw, want) * 2))
        self.move(b, dt, thr, turn)
        if dist < 16:
            fx, fz = ship_fwd(b)
            if abs((dx * fx + dz * fz) / dist) < 0.5:
                lx, lz = ship_side(b, 1)
                self.fire(b, 1 if dx * lx + dz * lz > 0 else -1)

    def move(self, s, dt, throttle, turn):
        target = s.max_speed * throttle if throttle > 0 else (-2.2 if throttle < 0 else 0.0)
        s.v += max(-5 * dt, min(3.2 * dt, target - s.v))
        s.yaw += turn * (0.35 + min(1.0, abs(s.v) / s.max_speed) * 0.65) * dt * (-1 if s.v < -0.1 else 1)
        s.x += math.sin(s.yaw) * s.v * dt
        s.z += math.cos(s.yaw) * s.v * dt
        e = (s.x / NAVAL_RX) ** 2 + (s.z / NAVAL_RZ) ** 2
        if e > 1:
            k = 1 / math.sqrt(e)
            s.x, s.z, s.v = s.x * k, s.z * k, s.v * 0.7

    def step(self, dt):
        t = now()
        live = t >= self.start_at
        for s in self.ships:
            s.cd[1] = max(0.0, s.cd[1] - dt)
            s.cd[-1] = max(0.0, s.cd[-1] - dt)
            s.ram = max(0.0, s.ram - dt)
            if live and s.bot and not s.dead:
                self.bot_think(s, dt)
            for q in s.queue:
                q[0] -= dt
            for q in [q for q in s.queue if q[0] <= 0]:
                s.queue.remove(q)
                if not s.dead:
                    self.shoot(s, q[1], q[2], q[3] if len(q) > 3 else 2)
        if live:
            self.collide_all()
        # cannonballs
        for b in self.balls[:]:
            b["vy"] -= NAVAL_GRAVITY * dt
            b["x"] += b["vx"] * dt
            b["y"] += b["vy"] * dt
            b["z"] += b["vz"] * dt
            done = False
            for s in self.ships:
                if s is b["by"] or s.dead or (s.bot and b["by"].bot) or (self.coop and s.team == b["by"].team):   # practice ships do not shoot each other, and neither do crewmates
                    continue
                dx, dz = b["x"] - s.x, b["z"] - s.z
                sn, cs = math.sin(s.yaw), math.cos(s.yaw)
                along, lateral = dx * sn + dz * cs, dx * cs - dz * sn
                if abs(lateral) < (s.hw + 0.4) * s.sc and abs(along) < 5.0 * s.sc * s.lenK and NAVAL_LEVEL - 0.3 < b["y"] < NAVAL_LEVEL + 2.4:
                    self.hurt(s, NAVAL_BALL_DMG, b["x"], b["y"], b["z"], b["by"])
                    done = True
                    break
            if not done and b["y"] <= NAVAL_LEVEL + 0.05:
                self.events.append(["w", round(b["x"], 1), round(b["z"], 1)])
                done = True
            if done:
                self.balls.remove(b)
        payload = {"t": "naval", "l": 1 if live else 0, "s": [s.row() for s in self.ships],
                   "b": [[b["id"], round(b["x"], 1), round(b["y"], 1), round(b["z"], 1), round(b["vx"], 1), round(b["vy"], 1), round(b["vz"], 1)] for b in self.balls],
                   "e": self.events}
        self.events = []
        for s in self.ships:
            if s.conn:
                s.conn.send(payload)
        alive = [s for s in self.ships if not s.dead]
        humans = [s for s in self.ships if s.conn and not s.dead]
        if self.coop:
            if live and not any(s.bot for s in alive):
                self.finish("cleared")
            elif live and not humans:
                self.finish("sunk")
            elif t - self.start_at > NAVAL_TIME * 1.5:
                self.finish("time")
        elif live and len(alive) <= 1:
            self.finish("last")
        elif live and not humans:
            self.finish("last")
        elif t - self.start_at > NAVAL_TIME:
            self.finish("time")

    def collide_all(self):
        live = [s for s in self.ships if not s.dead]
        pts = lambda s: [(s.x + math.sin(s.yaw) * z * s.sc * s.lenK, s.z + math.cos(s.yaw) * z * s.sc * s.lenK) for z in (-2.6, 0.0, 2.6)]
        for ai in range(len(live)):
            for bi in range(ai + 1, len(live)):
                a, b = live[ai], live[bi]
                r = ((a.hw + 0.4) * a.sc + (b.hw + 0.4) * b.sc) * 0.45
                hit = None
                for p in pts(a):
                    for q in pts(b):
                        dx, dz = q[0] - p[0], q[1] - p[1]
                        d = math.hypot(dx, dz)
                        if d < r * 2 and d > 0.001:
                            hit = hit or (p, q, dx, dz, d)
                            if a.bot:        # bots are pushed apart here; people push themselves in their own browser
                                push = (r * 2 - d) * 0.25
                                a.x -= dx / d * push
                                a.z -= dz / d * push
                            if b.bot:
                                push = (r * 2 - d) * 0.25
                                b.x += dx / d * push
                                b.z += dz / d * push
                if not hit:
                    continue
                _, _, dx, dz, _ = hit
                for rammer, target, sgn in ((a, b, 1), (b, a, -1)):
                    fx, fz = ship_fwd(rammer)
                    if rammer.v > 3.5 and rammer.ram <= 0 and sgn * (dx * fx + dz * fz) > 0 and not (rammer.bot and target.bot) and not (self.coop and rammer.team == target.team):
                        rammer.ram = 1.2
                        rammer.v *= 0.4
                        self.events.append(["r", rammer.i, target.i])
                        self.hurt(target, NAVAL_RAM_DMG, (a.x + b.x) / 2, NAVAL_LEVEL + 0.8, (a.z + b.z) / 2, rammer)

    def finish(self, reason):
        if self.over:
            return
        self.over = True
        # winner first: whoever is still afloat (most hull first), then the others in reverse order of sinking
        order = sorted(self.ships, key=lambda s: (0, -s.hp) if not s.dead else (1, -s.dead_at))
        msg = {"t": "end", "mode": "naval", "reason": reason,
               "order": [{"i": s.i, "name": s.name, "hp": round(s.hp), "bot": s.bot} for s in order]}
        if self.coop:
            msg["coop"], msg["won"] = True, reason == "cleared"
            ranks = rate_team([s.who for s in self.ships if s.who], msg["won"]) if reason != "empty" else {}
        else:
            ranks = rate_placements([(s.who, k) for k, s in enumerate(order) if s.who])
        for s in self.ships:
            if s.conn:
                s.conn.send(dict(msg, rank=ranks[id(s.who)]) if id(s.who) in ranks else msg)
                s.conn.room = s.conn.me = None
        self.task.cancel()


# ---------------------------------------------------------------------------------------------------------------
# matchmaking

CONNS = set()
QUEUES = {"duel": [], "race": [], "coop": [], "naval": []}


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
    match_rated(t)
    q = QUEUES["duel"]
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

    q = QUEUES["coop"]
    q[:] = [c for c in q if not c.closed]
    team = None
    if len(q) >= 4:
        team = [q.pop(0) for _ in range(4)]
    elif len(q) >= 2 and t - q[1].queued_at >= CFG["coop_wait"]:
        team = [q.pop(0) for _ in range(min(4, len(q)))]
    elif len(q) == 1 and q[0].want_bot and t - q[0].queued_at >= CFG["bot_wait"]:
        team = [q.pop(0)]
    if team:
        # friendly bots fill a small team up to three, when someone asked for bots
        CoopRoom(team, allies=max(0, 3 - len(team)) if any(c.want_bot for c in team) else 0)

    q = QUEUES["naval"]
    q[:] = [c for c in q if not c.closed]
    if len(q) >= 4:
        NavalRoom([q.pop(0) for _ in range(4)])
    elif len(q) >= 2 and t - q[1].queued_at >= CFG["naval_wait"]:
        NavalRoom([q.pop(0) for _ in range(min(4, len(q)))])
    elif len(q) == 1 and q[0].want_bot and t - q[0].queued_at >= CFG["bot_wait"]:
        NavalRoom([q.pop(0)], bots=2)   # two practice ships to fight


async def matchmaker():
    while True:
        await asyncio.sleep(0.5)
        try:
            match_once()
        except Exception as e:  # never let a bug here stop matchmaking
            print("matchmaker error:", repr(e))



# ---------------------------------------------------------------------------------------------------------------
# where people are (for the admin's list): the sights and places of each city, from landmarks.js and delhi-data.js: (name, x, z, radius)

PLACES = {
    "rome": [
    ('The Carcer (Mamertine Prison)', -112, -30, 28),
    ('Temple of Hercules Victor', -430, 75, 30),
    ('Theatre of Pompey', -690, -125, 70),
    ('The Circus Office', -205, 98, 14),
    ('The Harbour (Portus)', 50, 82, 40),
    ('The Via Domus', 250, -40, 30),
    ('The Hypogeum Jobs', 318, 66, 16),
    ('The Market', 170, 62, 26),
    ('a house by the Colosseum road', 255, 50, 9),
    ('The Roman Forum', 30, 0, 95),
    ('The Colosseum', 430, 30, 125),
    ('Colossus of the Sun', 288, -36, 60),
    ('Arch of Titus', 200, 0, 38),
    ('Curia Julia', -10, -52, 42),
    ('The Rostra', -72, -16, 30),
    ('Temple of Saturn', -105, -52, 40),
    ('Basilica Julia', -40, 55, 58),
    ('Temple of Castor and Pollux', 30, 55, 34),
    ('Temple of Vesta', 78, 52, 26),
    ('The Golden Milestone', -58, 6, 16),
    ('The Palatine Hill', 40, 260, 105),
    ('Temple of Jupiter Optimus Maximus', -235, -50, 70),
    ('Circus Maximus', -230, 430, 190),
    ("Trajan's Column", -150, -360, 45),
    ('Servian Wall', 120, -465, 80),
    ('The Pantheon', -480, -380, 55),
    ('the Armourer in the arena', 430, 46.5, 8),
],
    "cancun": [
        ("a player's casita", 11930.0, 95.0, 14.0),
        ('El Castillo (Temple of Kukulcán)', 12000.0, 0.0, 62.0),
        ('The Great Ball Court', 11850.0, -35.0, 50.0),
        ('Temple of the Warriors', 12105.0, -45.0, 46.0),
        ('Group of the Thousand Columns', 12110.0, 8.0, 34.0),
        ('El Caracol', 11925.0, -135.0, 36.0),
        ('The Sacred Cenote', 12000.0, -235.0, 58.0),
        ('The Sacbé (the white road)', 12000.0, -115.0, 28.0),
        ('Platform of Venus', 12050.0, 62.0, 20.0),
        ('The Tzompantli', 11952.0, -32.0, 20.0),
        ('The coast: Tulum', 12770.0, 0.0, 70.0),
        ('Cancún Hotel Zone', 12770.0, 0.0, 80.0),
        ('The Caribbean beach', 12880.0, 130.0, 55.0),
        ('The Coral Reef', 13050.0, 0.0, 120.0),
        ('Cenote Azul', 11670.0, 215.0, 40.0),
        ('Snorkel Hire', 12860.0, 130.0, 12.0),
        ('The Market', 12000.0, 150.0, 26.0),
    ],
    "delhi": [
    ("a player's plot off Chandni Chowk", 5900, -50, 22),
    ('Lahori Gate', 6000, 0, 40),
    ('Chhatta Chowk and the Naubat Khana', 6045, 0, 42),
    ('Diwan-i-Aam', 6158, 0, 46),
    ('Diwan-i-Khas', 6280, -88, 32),
    ('Rang Mahal and the Stream of Paradise', 6280, 28, 38),
    ('Muthamman Burj', 6296, -30, 26),
    ('Chandni Chowk', 5690, 0, 70),
    ('Begum ki Serai', 5760, -62, 48),
    ('Katra Neel', 5580, -24, 30),
    ('Fatehpuri Masjid', 5340, 0, 60),
    ('Jama Masjid', 5760, 270, 95),
    ('India Gate', 5900, 900, 70),
    ('Kartavya Path', 5720, 900, 60),
    ('Chandni Chowk Metro Station', 5788, 30, 22),
    ('The Akhara', 5955, 35, 12),
    ('The Race Start', 5428, 0, 18),
    ('The Cannon', 6004, 45, 10),
    ('The Kite Stall', 5982, -42, 9),
    ('The Pachisi Pavilion', 6112, -45, 10),
    ('The Bazaar Stall', 5648, -12, 9),
    ('The Market', 5950, 60, 26),
    ('The Chaat Stall', 5785, 13, 8),
],
}
CITY_NAMES = {"rome": "Rome", "delhi": "Old Delhi", "cancun": "Cancún"}
ROOM_WORDS = {"duel": "in a duel", "race": "in a chariot race", "coop": "in a team battle", "naval": "in a naval battle"}
QUEUE_WORDS = {"duel": "a duel", "race": "a race", "coop": "a team battle", "naval": "a naval battle"}


def where_is(c):
    """Where a connected player is, in words an admin can use: the city, the nearest sight, what they are doing, and the coordinates."""
    if c.room:
        what = ROOM_WORDS.get(getattr(c.room, "kind", ""), "in a game")
    elif c.heist:
        what = "robbing a house" if c.heist["thief"] is c else "chasing a thief"
    elif c.queue:
        what = "waiting for " + QUEUE_WORDS.get(c.queue, "a game")
    elif c.veh:
        what = "riding: " + str(c.veh)
    elif c.city:
        what = "walking about" if now() - c.walk_at < 6 else "standing still (or away)"
    else:
        what = "in the menus"
    place = ""
    if c.city in PLACES and not c.room:
        best = None
        for name, x, z, r in PLACES[c.city]:
            d = math.hypot(c.px - x, c.pz - z)
            if d <= r + 30 and (best is None or d - r < best[0]):
                best = (d - r, name)
        place = ("at " if best and best[0] <= 0 else "near ") + best[1] if best else "out in the streets"
    elif c.room:
        place = "in the arena"
    x, z = round(c.px - {"delhi": 6000, "cancun": 12000}.get(c.city, 0)), round(c.pz)
    return {"city": CITY_NAMES.get(c.city, "-"), "place": place, "doing": what, "xz": ("%d, %d" % (x, z)) if c.city and not c.room else ""}


# ---------------------------------------------------------------------------------------------------------------
# the open world: players who are just walking around can see each other (same city, within earshot)

WORLD_RANGE = 260.0     # metres: you see people this close
WORLD_MAX = 30          # and at most this many at once (the nearest)
WORLD_CITIES = ("rome", "delhi", "cancun")


def on_walk(conn, m):
    """A player says where they are. Only where they stand is taken from them; who can see them is decided here."""
    if conn.room or not conn.hello:
        return
    city = m.get("c")
    if city not in WORLD_CITIES:
        return
    conn.city = city
    conn.px, conn.pz = num(m.get("x"), -20000, 20000, conn.px), num(m.get("z"), -20000, 20000, conn.pz)
    conn.pyaw, conn.pspd = num(m.get("yaw"), -50, 50, conn.pyaw), num(m.get("s"), 0, 60, 0)
    veh = m.get("v")
    conn.veh = veh if veh in VEHICLES else None
    pk = m.get("k")
    conn.park = [pk[0], round(num(pk[1], -20000, 20000), 1), round(num(pk[2], -20000, 20000), 1), round(num(pk[3], -50, 50), 2)] if isinstance(pk, list) and len(pk) == 4 and pk[0] in VEHICLES else None
    conn.walk_at = now()
    h = m.get("h")
    conn.htier = int(h) if isinstance(h, (int, float)) and 0 <= h <= 5 else conn.htier


def world_once():
    """Tells every walker who is near them (a few times a second)."""
    t = now()
    groups = {}
    for c in list(CONNS):
        if c.hello and not c.closed and not c.room and c.city and t - c.walk_at < 4:
            groups.setdefault(c.city, []).append(c)
    live = set()
    for group in groups.values():
        for c in group:
            live.add(c)
            near = sorted(((math.hypot(o.px - c.px, o.pz - c.pz), o) for o in group if o is not c), key=lambda p: p[0])
            near = [o for d, o in near if d <= WORLD_RANGE][:WORLD_MAX]
            ids = {o.id for o in near}
            new = [o for o in near if o.id not in c.seen]
            gone = [i for i in c.seen if i not in ids]
            c.seen = ids
            if near or gone:
                c.send({"t": "world", "p": [[o.id, round(o.px, 1), round(o.pz, 1), round(o.pyaw, 2), round(o.pspd, 1), o.veh or 0, o.park or 0] for o in near],
                        "i": [[o.id, o.name, o.cls, o.look] for o in new], "g": gone})
    for c in list(CONNS):          # anyone who stopped walking (in a game, or gone) sees nobody
        if c not in live and c.seen:
            c.send({"t": "world", "p": [], "i": [], "g": list(c.seen)})
            c.seen = set()


async def world_loop():
    n = 0
    while True:
        await asyncio.sleep(0.25)
        n += 1
        try:
            world_once()
            if n % 2 == 0:
                heist_once()
            if n % 4 == 0:
                houses_once()
        except Exception as e:  # never let a bug here stop the world
            print("world error:", repr(e))


# ---------------------------------------------------------------------------------------------------------------
# houses and robberies: everyone online has a house plot on the Via Domus in Rome. You can break into someone else's house
# (they must be online and in Rome), run with the loot, and the owner chases you. Caught, you lose 100 denarii (to the owner);
# get away and you keep 100 denarii of theirs. Coins are kept by the browsers; the server only decides who got caught.

HOUSE_PLOTS = 8             # plots 0 to 7 are for players; the other four on the street belong to people who are always at home (the game draws those)
PLOT_X0, PLOT_DX = 185.0, 26.0
PLOT_NORTH_Z, PLOT_SOUTH_Z = -55.0, -25.0
HEIST_LOOT = 100
HEIST_TIME = 80.0           # seconds the thief has to get away
HEIST_CATCH = 4.0           # the owner catches the thief within this many metres
HEIST_ESCAPE = 230.0        # ... and the thief is clear when this far away
HEIST_DOOR = 9.0            # you must be this close to a house door to break in
HEIST_COOLDOWN = 90.0       # a thief rests this long after a robbery
HEIST_SAME_VICTIM = 300.0
HEISTS = []                 # [{thief, victim, t0, last_send, far}]
VICTIM_CD = {}              # (thief id, victim id) -> when they may rob that house again


def plot_pos(i):
    """The door of plot i (x, z) where you stand to break in, and the plot's centre."""
    col, row = i % 6, i // 6
    x = PLOT_X0 + col * PLOT_DX
    if row == 0:
        return x, PLOT_NORTH_Z + 7.5, x, PLOT_NORTH_Z
    return x, PLOT_SOUTH_Z - 7.5, x, PLOT_SOUTH_Z


def assign_plots():
    used = {c.plot for c in CONNS if c.hello and not c.closed and c.plot is not None}
    for c in sorted((c for c in CONNS if c.hello and not c.closed and c.plot is None), key=lambda c: c.id):
        for i in range(HOUSE_PLOTS):
            if i not in used:
                c.plot = i
                used.add(i)
                break


def houses_once():
    """Tells everyone which houses stand on the street (their owners are online), when that changes."""
    assign_plots()
    rows = sorted([c.plot, c.id, c.name, c.htier] for c in CONNS if c.hello and not c.closed and c.plot is not None)
    sig = json.dumps(rows)
    for c in list(CONNS):
        if not c.hello or c.closed:
            continue
        mine = [r for r in rows if r[1] != c.id]
        s2 = sig + (c.id if c.plot is None else str(c.plot))
        if c.houses_sig != s2:
            c.houses_sig = s2
            c.send({"t": "houses", "h": mine, "mine": c.plot})


def find_conn(cid):
    for c in CONNS:
        if c.id == cid and c.hello and not c.closed:
            return c
    return None


def walking(c):
    return c.city == "rome" and not c.room and now() - c.walk_at < 4


def on_rob(conn, m):
    """The thief says: I am breaking into this house."""
    t = now()
    victim = find_conn(m.get("target"))
    err = None
    if conn.room or not walking(conn):
        err = "You can only rob a house while you are walking in Rome."
    elif conn.heist:
        err = "You are already running from a robbery."
    elif victim is None or victim is conn or victim.plot is None:
        err = "That house is empty."
    elif not walking(victim):
        err = "The owner is not at home in Rome right now, so there is nothing worth taking."
    elif victim.heist:
        err = "Someone is already robbing that house."
    elif t < conn.rob_cd:
        err = "Lie low for a bit: you robbed someone a moment ago."
    elif t < VICTIM_CD.get((conn.id, victim.id), 0):
        err = "You robbed that house recently. Try another."
    else:
        dx, dz, _, _ = plot_pos(victim.plot)
        if math.hypot(conn.px - dx, conn.pz - dz) > HEIST_DOOR:
            err = "Go up to the door first."
    if err:
        return conn.send({"t": "heist_no", "msg": err})
    h = {"thief": conn, "victim": victim, "t0": t, "last": 0.0, "far": 0.0}
    HEISTS.append(h)
    conn.heist = victim.heist = h
    conn.send({"t": "heist", "role": "thief", "other": victim.name, "loot": HEIST_LOOT, "time": HEIST_TIME})
    victim.send({"t": "heist", "role": "owner", "other": conn.name, "loot": HEIST_LOOT, "time": HEIST_TIME, "x": round(conn.px, 1), "z": round(conn.pz, 1)})


def on_heist_caught(conn, m):
    """The thief's browser says the city guards caught them (the guards chase every thief, besides the owner)."""
    h = conn.heist
    if h and h["thief"] is conn:
        heist_end(h, "caught")


def heist_end(h, result):
    if h in HEISTS:
        HEISTS.remove(h)
    th, vi = h["thief"], h["victim"]
    th.heist = vi.heist = None
    th.rob_cd = now() + HEIST_COOLDOWN
    VICTIM_CD[(th.id, vi.id)] = now() + HEIST_SAME_VICTIM
    msg = {"t": "heist_end", "result": result, "loot": HEIST_LOOT, "thief": th.name, "victim": vi.name}
    th.send({**msg, "role": "thief"})
    vi.send({**msg, "role": "owner"})


def heist_once():
    """Called a few times a second: who got caught, who got away."""
    t = now()
    for h in list(HEISTS):
        th, vi = h["thief"], h["victim"]
        if th.closed or not th.hello:
            heist_end(h, "caught")
            continue
        if vi.closed or not vi.hello or vi.room:
            heist_end(h, "escaped")
            continue
        if th.room:
            heist_end(h, "escaped")
            continue
        d = math.hypot(th.px - vi.px, th.pz - vi.pz) if th.city == vi.city else 1e9
        if d < HEIST_CATCH:
            heist_end(h, "caught")
            continue
        h["far"] = h["far"] + 1 if d > HEIST_ESCAPE else 0
        if h["far"] >= 8 or t - h["t0"] > HEIST_TIME:
            heist_end(h, "escaped")
            continue
        if t - h["last"] > 1.0:
            h["last"] = t
            vi.send({"t": "heistpos", "x": round(th.px, 1), "z": round(th.pz, 1), "d": round(d), "left": max(0, round(HEIST_TIME - (t - h["t0"])))})
            th.send({"t": "heistpos", "d": round(d), "left": max(0, round(HEIST_TIME - (t - h["t0"]))), "x": round(vi.px, 1), "z": round(vi.pz, 1)})   # where the owner is, so the thief knows which way to run


# ---------------------------------------------------------------------------------------------------------------
# chat, and the admin's tools

CHAT_LOG = collections.deque(maxlen=40)     # the last messages, shown to people who join
BLOCKED = {}                                # kicked: login id or address -> until when
CHAT_MAX = 140
BAD_WORDS = re.compile(r"(fuck|shit|bitch|cunt|asshole|nigg|fagg)", re.I)   # masked, not blocked


def clean_chat(v):
    v = re.sub(r"[\x00-\x1f\x7f]", " ", str(v if v is not None else ""))
    v = re.sub(r"\s+", " ", v).strip()[:CHAT_MAX]
    return BAD_WORDS.sub(lambda m: m.group(0)[0] + "*" * (len(m.group(0)) - 1), v)


def say_to(conn, text):
    conn.send({"t": "chat", "sys": 1, "text": text})


def match_name(rest):
    """Splits 'The OG hello there' into (the player called 'The OG', 'hello there'): names may contain spaces, so the longest
    name that the text starts with wins."""
    rest = str(rest or "").strip()
    best = None
    for c in CONNS:
        if c.hello and not c.closed:
            n = c.name.lower()
            low = rest.lower()
            if (low == n or low.startswith(n + " ")) and (best is None or len(c.name) > len(best.name)):
                best = c
    if best is None:
        return None, rest
    return best, rest[len(best.name):].strip()


def find_player(name):
    name = str(name or "").strip().lower()
    for c in CONNS:
        if c.hello and not c.closed and c.name.lower() == name:
            return c
    return None


def broadcast_chat(entry):
    for c in list(CONNS):
        if c.hello and not c.closed:
            c.send(entry)


def kick(target, minutes=10):
    BLOCKED[target.uid or target.ip] = now() + minutes * 60
    BLOCKED[target.ip] = now() + minutes * 60
    target.send({"t": "kicked", "minutes": minutes})
    target.close()


def blocked(conn):
    t = now()
    return BLOCKED.get(conn.ip, 0) > t or (conn.uid and BLOCKED.get(conn.uid, 0) > t)


PIC_RE = re.compile(r"^data:image/jpeg;base64,([A-Za-z0-9+/]+={0,2})$")
PIC_MAX = 3400             # characters: the browser shrinks a picture to a small thumbnail so it fits in one message
PIC_GAP = 8.0              # seconds between two pictures from the same person


def clean_pic(v):
    """A chat picture must be a small JPEG thumbnail sent as a data address: anything else is thrown away."""
    if not isinstance(v, str) or len(v) > PIC_MAX:
        return None
    mt = PIC_RE.match(v)
    if not mt:
        return None
    try:
        raw = base64.b64decode(mt.group(1), validate=True)
    except Exception:
        return None
    return v if len(raw) > 100 and raw[:3] == b"\xff\xd8\xff" and raw[-2:] == b"\xff\xd9" else None


def on_chat(conn, m):
    t = now()
    if t < conn.muted_until:
        return say_to(conn, "You are muted for another %d minute(s)." % (int((conn.muted_until - t) / 60) + 1))
    conn.ctok = min(3.0, conn.ctok + (t - conn.ctok_t) / 1.5)
    conn.ctok_t = t
    if conn.ctok < 1:
        return say_to(conn, "Slow down a little.")
    text = clean_chat(m.get("text"))
    pic = None
    if m.get("pic"):
        if not conn.uid:
            return say_to(conn, "Log in to your account to send pictures.")
        if t - conn.pic_t < PIC_GAP:
            return say_to(conn, "One picture every few seconds, please.")
        pic = clean_pic(m.get("pic"))
        if not pic:
            return say_to(conn, "That picture could not be sent. Try a smaller one.")
        conn.pic_t = t
    if not text and not pic:
        return
    conn.ctok -= 1
    if text.startswith("/"):
        return chat_command(conn, text)
    entry = {"t": "chat", "id": conn.id, "name": conn.name, "text": text, "adm": 1 if conn.admin else 0}
    if pic:
        CHAT_LOG.append(dict(entry, text=text or "(sent a picture)"))      # people who join later do not get the picture, only that there was one
        entry["pic"] = pic
    else:
        CHAT_LOG.append(entry)
    broadcast_chat(entry)


SONGS = {   # traditional songs (long out of copyright) and a few new ones for the game
    "row": ["Row, row, row your boat,", "Gently down the stream.", "Merrily, merrily, merrily, merrily,", "Life is but a dream."],
    "twinkle": ["Twinkle, twinkle, little star,", "How I wonder what you are!", "Up above the world so high,", "Like a diamond in the sky."],
    "grace": ["Amazing grace, how sweet the sound,", "That saved a wretch like me.", "I once was lost, but now am found,", "Was blind, but now I see."],
    "auldlangsyne": ["Should auld acquaintance be forgot,", "And never brought to mind?", "Should auld acquaintance be forgot,", "And auld lang syne!"],
    "jingle": ["Dashing through the snow,", "In a one-horse open sleigh,", "O'er the fields we go,", "Laughing all the way!"],
    "legion": ["Marching, marching to the Forum,", "Shields held high and spirits bright,", "Rome is ours and Rome is mighty,", "Sing it out into the night!"],
    "gladiator": ["Sand beneath and sun above,", "Swords of steel and hearts of fire,", "The crowd is roaring out our names,", "Rise up, rise up, higher and higher!"],
    "delhi": ["Chai, chai, garam chai,", "Chandni Chowk in the morning light,", "Jalebi sweet and kites on high,", "Delhi, Delhi, shining bright!"],
    "london": ["London Bridge is falling down,", "Falling down, falling down.", "London Bridge is falling down,", "My fair lady."],
    "lamb": ["Mary had a little lamb,", "Its fleece was white as snow;", "And everywhere that Mary went", "The lamb was sure to go."],
    "macdonald": ["Old MacDonald had a farm,", "E-I-E-I-O!", "And on that farm he had a cow,", "E-I-E-I-O!"],
    "yankee": ["Yankee Doodle went to town,", "Riding on a pony;", "Stuck a feather in his cap", "And called it macaroni."],
    "susanna": ["Oh! Susanna, oh, don't you cry for me,", "For I come from Alabama", "With my banjo on my knee.", "Oh! Susanna!"],
    "greensleeves": ["Alas, my love, you do me wrong,", "To cast me off discourteously;", "For I have loved you well and long,", "Delighting in your company."],
    "frere": ["Brother John, Brother John,", "Are you sleeping? Are you sleeping?", "Morning bells are ringing, morning bells are ringing,", "Ding, dang, dong; ding, dang, dong."],
    "mountain": ["She'll be coming round the mountain when she comes,", "She'll be coming round the mountain when she comes,", "She'll be coming round the mountain,", "She'll be coming round the mountain when she comes."],
    "oldman": ["This old man, he played one,", "He played knick-knack on my thumb;", "With a knick-knack paddy-whack, give a dog a bone,", "This old man came rolling home."],
    "spider": ["The itsy bitsy spider climbed up the waterspout;", "Down came the rain and washed the spider out;", "Out came the sun and dried up all the rain,", "And the itsy bitsy spider climbed up the spout again."],
    "silent": ["Silent night, holy night,", "All is calm, all is bright;", "Round yon virgin mother and child,", "Holy infant so tender and mild."],
    "deck": ["Deck the halls with boughs of holly,", "Fa la la la la, la la la la;", "'Tis the season to be jolly,", "Fa la la la la, la la la la."],
    "shanty": ["Heave away, my sailors bold,", "The harbour wind is blowing free;", "Hoist the sail and raise the gold,", "We'll sail the wide blue sea!"],
    "chariot": ["Round the Circus, wheels a-flying,", "Dust and thunder, horses strong;", "Hear the cheering, none denying,", "Here we come, we race along!"],
    "saturnalia": ["Io Saturnalia, light the lamps tonight,", "Masters serve the slaves today,", "Candles bright and hearts so light,", "Come and feast and dance and play!"],
    "diwali": ["Diyas glowing, rows of light,", "Fireworks bloom across the sky;", "Sweets to share on Diwali night,", "Lanterns floating, drifting high!"],
    "holi": ["Throw the colours, red and gold,", "Pink and green and blue and white;", "Holi hai, be young, be bold,", "Everyone is dancing bright!"],
    "market": ["Bread and honey, figs and cheese,", "Come and see my fine display;", "Bargain here, and buy with ease,", "Best of all the market day!"],
    "friends": ["Friends are sailing, friends are near,", "Side by side we'll face the sea;", "Share the laughter, share the cheer,", "Friends together, you and me!"],
    "rain": ["Rain on the rooftops, rain on the street,", "Puddles are dancing round my feet;", "Wrap in a cloak and hurry home,", "Warm by the fire, never alone."],
}
SING_GAP = 2.4          # seconds between the lines of a song
SING_COOLDOWN = 25.0    # seconds before the same person can start another one


async def sing_task(conn, lines):
    try:
        for line in lines:
            if conn.closed:
                return
            broadcast_chat({"t": "chat", "id": conn.id, "name": conn.name, "text": "\u266a " + line + " \u266a", "sing": 1, "adm": 1 if conn.admin else 0})
            await asyncio.sleep(SING_GAP)
    finally:
        conn.singing = None


def start_song(conn, which):
    t = now()
    if conn.singing and not conn.singing.done():
        return say_to(conn, "You are already singing. Wait for the end of the song.")
    if t - conn.sang_at < SING_COOLDOWN:
        return say_to(conn, "Give your voice a rest for a moment, then sing again.")
    key = which.strip().lower().replace(" ", "")
    if key and key not in SONGS:
        return say_to(conn, "I do not know that song. Type /songs to see the ones I know.")
    key = key or random.choice(list(SONGS))
    conn.sang_at = t
    conn.singing = asyncio.ensure_future(sing_task(conn, SONGS[key]))


def chat_command(conn, text):
    head, _, rest = text[1:].partition(" ")
    cmd = head.lower()
    if cmd in ("sing", "song"):
        return start_song(conn, rest)
    if cmd == "songs":
        return say_to(conn, "Songs (%d): " % len(SONGS) + ", ".join(SONGS) + ". Type /sing and a name (or just /sing for a surprise).")
    if cmd in ("w", "whisper", "msg"):
        target, msg = match_name(rest)
        if not target:
            return say_to(conn, "Nobody online has that name. Whisper with: /w name your message")
        if not msg:
            return say_to(conn, "Whisper with: /w name your message")
        entry = {"t": "chat", "id": conn.id, "name": conn.name, "to": target.name, "text": msg, "w": 1, "adm": 1 if conn.admin else 0}
        target.send(entry)
        if target is not conn:
            conn.send(entry)
        return
    if cmd == "help":
        say_to(conn, "Chat: just type. /w name message whispers to one person. /sing sings a song, /songs lists them.")
        if conn.admin:
            say_to(conn, "Admin: /who, /kick name, /mute name [minutes], /unmute name, /say message")
        return
    if not conn.admin:
        return say_to(conn, "Unknown command. Type /help.")
    if cmd == "who":
        names = ["%s (%s, %s)" % (c.name, where_is(c)["city"], (where_is(c)["place"] + ", " if where_is(c)["place"] else "") + where_is(c)["doing"]) for c in CONNS if c.hello and not c.closed]
        return say_to(conn, "Online (%d): %s" % (len(names), ", ".join(names) or "nobody"))
    if cmd == "say" and rest.strip():
        entry = {"t": "chat", "sys": 1, "text": "Announcement: " + rest.strip()[:CHAT_MAX]}
        CHAT_LOG.append(entry)
        return broadcast_chat(entry)
    if cmd in ("kick", "mute", "unmute") and rest.strip():
        target, extra = match_name(rest)
        if not target:
            return say_to(conn, "Nobody online has that name.")
        if target.admin:
            return say_to(conn, "You cannot do that to an admin.")
        if cmd == "kick":
            kick(target)
            return say_to(conn, "%s was kicked for 10 minutes." % target.name)
        if cmd == "mute":
            try:
                minutes = max(1, min(1440, int(extra))) if extra else 10
            except ValueError:
                minutes = 10
            target.muted_until = now() + minutes * 60
            say_to(target, "An admin muted you for %d minute(s)." % minutes)
            return say_to(conn, "%s is muted for %d minute(s)." % (target.name, minutes))
        target.muted_until = 0.0
        return say_to(conn, "%s can chat again." % target.name)
    say_to(conn, "Unknown command. Type /help.")


def on_admin(conn, m):
    """The admin panel: who is online, and kick / mute buttons."""
    if not conn.admin:
        return
    a = m.get("a")
    if a == "who":
        conn.send({"t": "adminwho", "who": [dict({"id": c.id, "name": c.name, "acct": bool(c.uid), "city": c.city, "room": c.room.kind if c.room else None,
                                                  "muted": c.muted_until > now(), "admin": c.admin}, **{("where_" + k): v for k, v in where_is(c).items()}) for c in CONNS if c.hello and not c.closed]})
        return
    target = next((c for c in CONNS if c.id == m.get("id") and c.hello), None)
    if not target or target.admin:
        return
    if a == "kick":
        kick(target)
    elif a == "mute":
        try:
            minutes = max(1, min(1440, int(m.get("min", 10))))
        except (TypeError, ValueError):
            minutes = 10
        target.muted_until = now() + minutes * 60
        say_to(target, "An admin muted you for %d minute(s)." % minutes)
    elif a == "unmute":
        target.muted_until = 0.0


# ---------------------------------------------------------------------------------------------------------------
# ranked matches, friends and friend chats (these need an account: the game server only knows who you are when you log in)
#
# Ratings, friend lists and requests live in this server's memory, and each player's browser keeps its own copy in their saved
# game and sends it back when they connect, so a restart of the server does not lose them. A friendship counts only when BOTH
# sides have it, so nobody can make themselves somebody's friend by just saying so. Friends are named by a public friend id
# (a hash of the account id), never by the account id itself.

START_RATING = 1000
RATINGS = {}      # account id -> {"r": rating, "w": wins, "l": losses, "d": draws, "name": last name}
CLAIMS = {}       # friend id -> set of friend ids they list as friends
FID_UID = {}      # friend id -> account id
NAMES = {}        # friend id -> the name they last played under
REQS = {}         # friend id -> {friend id of the one asking: their name}
MAIL = {}         # friend id -> messages sent to them while they were away
RECENT = collections.defaultdict(list)    # (account id, account id) -> times they played a ranked match against each other
MAIL_MAX, REQ_MAX, FRIENDS_MAX = 30, 20, 60
INVITES = {}      # (friend id of the one inviting, friend id of the one invited) -> when
INVITE_LIFE = 90.0


def fid_of(uid):
    return hashlib.sha256(("tm-friend:" + str(uid)).encode()).hexdigest()[:12]


def clean_fid(v):
    return v if isinstance(v, str) and re.fullmatch(r"[0-9a-f]{12}", v) else None


def conns_of(fid):
    return [c for c in CONNS if c.hello and not c.closed and c.fid == fid]


def rating_of(conn):
    """The rating record of a logged-in player (guests get a throwaway one)."""
    if not conn or not conn.uid:
        return {"r": START_RATING, "w": 0, "l": 0, "d": 0, "name": conn.name if conn else ""}
    return RATINGS.setdefault(conn.uid, {"r": START_RATING, "w": 0, "l": 0, "d": 0, "name": conn.name})


def public_rank(rec):
    return {"r": rec["r"], "w": rec["w"], "l": rec["l"], "d": rec["d"]}


def claim_rank(conn, claimed):
    """A player's browser remembers their rating; the first time this server sees them, that is where they start from."""
    if not conn.uid or conn.uid in RATINGS or not isinstance(claimed, dict):
        return
    r = int(num(claimed.get("r"), 0, 4000, START_RATING))
    RATINGS[conn.uid] = {"r": r, "w": int(num(claimed.get("w"), 0, 100000)), "l": int(num(claimed.get("l"), 0, 100000)), "d": int(num(claimed.get("d"), 0, 100000)), "name": conn.name}


def elo_change(ra, rb, score, games):
    k = 40 if games < 10 else 24
    expected = 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))
    return int(round(k * (score - expected)))


def rate_placements(entries):
    """Updates ratings after any match between real people: entries is [(connection, place)] for the humans in it (a lower place is
    better, equal places are a tie). Each pair of people is scored like a duel and the results are averaged, so the same function does
    duels (two people), races and naval battles (up to four). Returns {id(connection): {r, w, l, d, delta, farm}}. Practice bots do not
    count, a match with fewer than two real people changes nothing, and meeting the same people more than three times in ten minutes
    changes nothing, so friends cannot farm points. Guests (no account) count as opponents but have no saved rating."""
    entries = [(c, k) for c, k in entries if c]
    n = len(entries)
    if n < 2:
        return {}
    t = now()
    key = tuple(sorted(str(c.uid or c.id) for c, _ in entries))
    RECENT[key] = [x for x in RECENT[key] if t - x < 600] + [t]
    farm = len(RECENT[key]) > 3
    recs = [rating_of(c) for c, _ in entries]
    before = [r["r"] for r in recs]
    out = {}
    for i, (c, ki) in enumerate(entries):
        total = 0.0
        for j, (_, kj) in enumerate(entries):
            if i != j:
                total += (1.0 if ki < kj else 0.0 if ki > kj else 0.5) - 1.0 / (1.0 + 10 ** ((before[j] - before[i]) / 400.0))
        rec = recs[i]
        games = rec["w"] + rec["l"] + rec["d"]
        delta = 0 if farm else int(round((40 if games < 10 else 24) * total / (n - 1)))
        if rec["r"] + delta < 0:
            delta = -rec["r"]
        better = sum(1 for _, kj in entries if kj < ki)
        worse = sum(1 for _, kj in entries if kj > ki)
        rec["r"] += delta
        rec["w" if better == 0 and worse > 0 else "l" if worse == 0 and better > 0 else "d"] += 1
        rec["name"] = c.name
        out[id(c)] = dict(public_rank(rec), delta=delta, farm=farm)
    return out


def rate_team(conns, won):
    """A team battle against bots: with at least two real people on the team, a win is worth +8 and a defeat costs 6."""
    conns = [c for c in conns if c]
    if len(conns) < 2:
        return {}
    t = now()
    key = tuple(sorted(str(c.uid or c.id) for c in conns))
    RECENT[key] = [x for x in RECENT[key] if t - x < 600] + [t]
    farm = len(RECENT[key]) > 3
    out = {}
    for c in conns:
        rec = rating_of(c)
        delta = 0 if farm else (8 if won else -6)
        if rec["r"] + delta < 0:
            delta = -rec["r"]
        rec["r"] += delta
        rec["w" if won else "l"] += 1
        rec["name"] = c.name
        out[id(c)] = dict(public_rank(rec), delta=delta, farm=farm)
    return out


def match_rated(t):
    """Pairs duel players with someone of a similar rating (guests count as 1000). The longer you wait, the wider the search gets (40 points per second)."""
    q = QUEUES["duel"]
    q[:] = [c for c in q if not c.closed]
    while len(q) >= 2:
        best = None
        for i in range(len(q)):
            for j in range(i + 1, len(q)):
                a, b = q[i], q[j]
                gap = abs(rating_of(a)["r"] - rating_of(b)["r"])
                window = 100 + 40 * max(t - a.queued_at, t - b.queued_at)
                if gap <= window and (best is None or gap < best[0]):
                    best = (gap, a, b)
        if not best:
            return
        _, a, b = best
        q.remove(a)
        q.remove(b)
        DuelRoom([a, b], ranked=True)


def top_list(n=10):
    rows = sorted(RATINGS.values(), key=lambda x: (-x["r"], -x["w"]))[:n]
    return [{"name": x["name"], "r": x["r"], "w": x["w"], "l": x["l"]} for x in rows]


def mutual(a, b):
    return bool(a and b and b in CLAIMS.get(a, ()) and a in CLAIMS.get(b, ()))


def friend_rows(conn):
    rows = []
    for f in sorted(CLAIMS.get(conn.fid, ())):
        if mutual(conn.fid, f):
            rows.append({"fid": f, "name": NAMES.get(f) or conn.hints.get(f) or "Friend", "online": bool(conns_of(f))})
    return rows[:FRIENDS_MAX]


def send_social(conn):
    if not conn.fid:
        return
    conn.send({"t": "fr_state", "fid": conn.fid, "friends": friend_rows(conn), "rank": public_rank(rating_of(conn)),
               "requests": [{"fid": f, "name": n} for f, n in REQS.get(conn.fid, {}).items()]})
    for e in MAIL.pop(conn.fid, []):
        conn.send(e)


def presence(conn, online):
    for f in list(CLAIMS.get(conn.fid, ())):
        if mutual(conn.fid, f):
            for c in conns_of(f):
                c.send({"t": "fr_presence", "fid": conn.fid, "name": conn.name, "online": online})


def social_start(conn, m):
    """Called when a logged-in player says hello: remember who they are and what their browser says about them."""
    if not conn.uid:
        return
    conn.fid = fid_of(conn.uid)
    FID_UID[conn.fid] = conn.uid
    NAMES[conn.fid] = conn.name
    claim_rank(conn, m.get("rank"))
    rating_of(conn)["name"] = conn.name
    mine = CLAIMS.setdefault(conn.fid, set())
    for f in (m.get("friends") if isinstance(m.get("friends"), list) else [])[:FRIENDS_MAX]:
        fid = clean_fid(f.get("fid") if isinstance(f, dict) else None)
        if fid and fid != conn.fid:
            mine.add(fid)
            conn.hints[fid] = clean_name(f.get("name"))
    presence(conn, True)


def social_drop(conn):
    if conn.fid and not [c for c in conns_of(conn.fid) if c is not conn]:
        presence(conn, False)


def social_msg(conn, text):
    conn.send({"t": "fr_msg", "msg": text})


# ---------------------------------------------------------------------------------------------------------------
# festivals: the diyas (clay lamps) and sky lanterns people put down are seen by everybody in the same city

DIYAS = collections.deque(maxlen=80)     # { x, z, c (city), n (who), at } of the lamps set down in the last half hour
DIYA_LIFE = 1800.0


def on_fest(conn, m):
    k, t = m.get("k"), now()
    city = m.get("c") if m.get("c") in WORLD_CITIES else None
    if not city:
        return
    while DIYAS and t - DIYAS[0]["at"] > DIYA_LIFE:
        DIYAS.popleft()
    if k == "sync":                                          # a festival has begun for them: here are the lamps already lit
        return conn.send({"t": "diyas", "c": city, "list": [{"x": d["x"], "z": d["z"], "n": d["n"]} for d in DIYAS if d["c"] == city]})
    if k not in ("diya", "lantern") or t - conn.fest_t < 1.2:
        return
    conn.fest_t = t
    x, z = round(num(m.get("x"), -20000, 20000), 1), round(num(m.get("z"), -20000, 20000), 1)
    if k == "diya":
        DIYAS.append({"x": x, "z": z, "c": city, "n": conn.name, "at": t})
        msg = {"t": "fest", "k": "diya", "c": city, "x": x, "z": z, "n": conn.name}
    else:
        msg = {"t": "fest", "k": "lantern", "c": city, "x": x, "z": z, "y": round(num(m.get("y"), 0, 60), 1), "col": int(num(m.get("col"), 0, 5)), "w": clean_chat(m.get("w"))[:60], "n": conn.name}
    for c in list(CONNS):
        if c is not conn and c.hello and not c.closed:
            c.send(msg)


# ---------------------------------------------------------------------------------------------------------------
# shoving: two players walking in the same city can push each other over (a knock-back, no damage). The server checks that they really are
# standing close together, and nobody can be shoved twice within a moment.

SHOVE_RANGE = 3.4        # metres between them (a little more than the 2.1 m the game allows, for lag)


def on_shove(conn, m):
    t = now()
    target = next((c for c in CONNS if c.hello and not c.closed and c.id == m.get("to")), None)
    no = lambda why: conn.send({"t": "shove_no", "msg": why})
    if not target or target is conn:
        return
    if conn.room or target.room or not conn.city or conn.city != target.city or t - conn.walk_at > 4 or t - target.walk_at > 4:
        return no("%s is somewhere you cannot reach right now (a game, a vehicle, or another city)." % target.name)
    if t - conn.shove_t < 0.7:
        return
    if t < target.immune_t:
        return no("%s was only just shoved. Give them a moment." % target.name)
    d = math.hypot(target.px - conn.px, target.pz - conn.pz)
    if d > SHOVE_RANGE:
        return no("%s is too far away. Step right up to them." % target.name)
    conn.shove_t, target.immune_t = t, t + 1.6
    dx, dz = ((target.px - conn.px) / d, (target.pz - conn.pz) / d) if d > 0.05 else (-math.sin(conn.pyaw), -math.cos(conn.pyaw))
    target.send({"t": "shoved", "by": conn.name, "dx": round(dx, 2), "dz": round(dz, 2)})
    conn.send({"t": "shove_ok", "name": target.name})
    for c in list(CONNS):
        if c is not conn and c is not target and c.hello and not c.closed and target.id in c.seen:
            c.send({"t": "shove_fx", "id": target.id})
    conn.send({"t": "shove_fx", "id": target.id})


def on_social(conn, m):
    a = m.get("a")
    if not conn.fid:
        return social_msg(conn, "Log in to your account to use friends and ranked matches.")
    t = now()
    conn.social_n = min(8.0, conn.social_n + (t - conn.social_t) * 1.0)   # eight lookups at once, then one a second
    conn.social_t = t
    if conn.social_n < 1:
        return social_msg(conn, "Slow down a little.")
    conn.social_n -= 1
    if a == "online":
        rows = [{"fid": c.fid, "name": c.name, "friend": mutual(conn.fid, c.fid), "sent": conn.fid in REQS.get(c.fid, {})}
                for c in CONNS if c.hello and not c.closed and c.fid and c is not conn]
        return conn.send({"t": "fr_online", "list": rows[:40]})
    if a == "top":
        return conn.send({"t": "top", "list": top_list(), "me": public_rank(rating_of(conn))})
    if a == "req":
        target = None
        fid = clean_fid(m.get("fid"))
        if fid:
            cs = conns_of(fid)
            target = cs[0] if cs else None
        elif m.get("name"):
            c = find_player(clean_name(m.get("name")))
            target = c if c and c.fid else None
        if not target:
            return social_msg(conn, "Nobody online with an account has that name. They need to be online and logged in.")
        if target is conn or target.fid == conn.fid:
            return social_msg(conn, "That is you!")
        if mutual(conn.fid, target.fid):
            return social_msg(conn, "%s is already your friend." % target.name)
        if conn.fid in REQS.get(target.fid, {}):
            return social_msg(conn, "You already asked %s." % target.name)
        if target.fid in REQS.get(conn.fid, {}):          # they asked you first: that is a yes
            return accept_friend(conn, target.fid)
        pending = REQS.setdefault(target.fid, {})
        if len(pending) >= REQ_MAX:
            return social_msg(conn, "%s has too many requests waiting." % target.name)
        pending[conn.fid] = conn.name
        for c in conns_of(target.fid):
            c.send({"t": "fr_in", "fid": conn.fid, "name": conn.name})
        return social_msg(conn, "Friend request sent to %s." % target.name)
    if a == "ans":
        fid = clean_fid(m.get("fid"))
        if not fid or fid not in REQS.get(conn.fid, {}):
            return
        if m.get("ok"):
            return accept_friend(conn, fid)
        REQS[conn.fid].pop(fid, None)
        return conn.send({"t": "fr_state", "fid": conn.fid, "friends": friend_rows(conn), "rank": public_rank(rating_of(conn)),
                          "requests": [{"fid": f, "name": n} for f, n in REQS.get(conn.fid, {}).items()]})
    if a == "del":
        fid = clean_fid(m.get("fid"))
        if not fid:
            return
        CLAIMS.get(conn.fid, set()).discard(fid)
        CLAIMS.get(fid, set()).discard(conn.fid)
        for c in conns_of(fid):
            c.send({"t": "fr_removed", "fid": conn.fid})
        return conn.send({"t": "fr_removed", "fid": fid})
    if a == "dm":
        return on_dm(conn, m)
    if a == "invite":
        fid = clean_fid(m.get("fid"))
        if not fid or not mutual(conn.fid, fid):
            return social_msg(conn, "You can only invite your friends.")
        others = [c for c in conns_of(fid) if not c.room]
        if conn.room or not others:
            return social_msg(conn, "Your friend is not free to sail right now (offline, or busy in a game)." if not conn.room else "Finish your game first.")
        conn.ship = clean_ship(m.get("ship"))
        leave_queue(conn)
        INVITES[(conn.fid, fid)] = now()
        for c in others:
            c.send({"t": "fr_invite", "fid": conn.fid, "name": conn.name, "game": "naval"})
        return social_msg(conn, "Invitation sent. You sail as soon as they accept.")
    if a == "accept":
        fid = clean_fid(m.get("fid"))
        t = now()
        if not fid or t - INVITES.get((fid, conn.fid), -1e9) > INVITE_LIFE or not mutual(conn.fid, fid):
            return social_msg(conn, "That invitation has run out.")
        hosts = [c for c in conns_of(fid) if not c.room]
        if conn.room or not hosts:
            return social_msg(conn, "Your friend is not free to sail any more.")
        INVITES.pop((fid, conn.fid), None)
        conn.ship = clean_ship(m.get("ship"))
        host = hosts[0]
        leave_queue(conn)
        leave_queue(host)
        NavalRoom([host, conn], bots=3, coop=True)
        return


def accept_friend(conn, fid):
    them = REQS.get(conn.fid, {}).pop(fid, None)
    REQS.get(fid, {}).pop(conn.fid, None)
    if len(CLAIMS.get(conn.fid, ())) >= FRIENDS_MAX or len(CLAIMS.get(fid, ())) >= FRIENDS_MAX:
        return social_msg(conn, "Friend lists are full (%d friends)." % FRIENDS_MAX)
    CLAIMS.setdefault(conn.fid, set()).add(fid)
    CLAIMS.setdefault(fid, set()).add(conn.fid)
    conn.send({"t": "fr_added", "fid": fid, "name": NAMES.get(fid) or them or "Friend", "online": bool(conns_of(fid))})
    for c in conns_of(fid):
        c.send({"t": "fr_added", "fid": conn.fid, "name": conn.name, "online": True})


def on_dm(conn, m):
    t = now()
    if t < conn.muted_until:
        return social_msg(conn, "You are muted for another %d minute(s)." % (int((conn.muted_until - t) / 60) + 1))
    conn.ctok = min(3.0, conn.ctok + (t - conn.ctok_t) / 1.5)
    conn.ctok_t = t
    if conn.ctok < 1:
        return social_msg(conn, "Slow down a little.")
    fid = clean_fid(m.get("to"))
    text = clean_chat(m.get("text"))
    if not fid or not text:
        return
    if not mutual(conn.fid, fid):
        conn.send({"t": "fr_removed", "fid": fid})
        return social_msg(conn, "You are not friends any more.")
    conn.ctok -= 1
    entry = {"t": "dm", "from": conn.fid, "to": fid, "name": conn.name, "text": text, "at": int(time.time())}
    cs = conns_of(fid)
    for c in cs:
        c.send(entry)
    if not cs:
        box = MAIL.setdefault(fid, [])
        box.append(entry)
        del box[:-MAIL_MAX]
    for c in conns_of(conn.fid):
        c.send(entry)


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
        conn.name = clean_name(m.get("name"))
        conn.cls = m.get("cls") if m.get("cls") in CLASS_MODS else "gladiator"
        conn.look = clean_look(m.get("look"))
        if blocked(conn):
            conn.send({"t": "error", "code": "kicked", "msg": "You were kicked for a while. Try again later."})
            return conn.close()
        conn.admin = bool(conn.uid) and await is_admin(m.get("token"))
        social_start(conn, m)
        conn.send({"t": "welcome", "id": conn.id, "account": bool(conn.uid), "admin": conn.admin, "bots": CFG["allow_bots"],
                   "rank": public_rank(rating_of(conn)) if conn.uid else None})
        conn.send({"t": "chat_log", "m": list(CHAT_LOG)})
        return send_social(conn)
    if not conn.hello:
        return conn.send({"t": "error", "code": "hello", "msg": "Say hello first"})
    if t == "walk":
        return on_walk(conn, m)
    if t == "rob":
        return on_rob(conn, m)
    if t == "heist_caught":
        return on_heist_caught(conn, m)
    if t == "chat":
        return on_chat(conn, m)
    if t == "social":
        return on_social(conn, m)
    if t == "fest":
        return on_fest(conn, m)
    if t == "shove":
        return on_shove(conn, m)
    if t == "admin":
        return on_admin(conn, m)
    if t == "queue":
        mode = "duel" if m.get("mode") == "ranked" else m.get("mode")      # every duel between real people is ranked now
        if mode not in QUEUES:
            return conn.send({"t": "error", "code": "mode", "msg": "Unknown game"})
        if conn.room:
            return conn.send({"t": "error", "code": "busy", "msg": "You are already in a game"})
        if mode == "naval":
            conn.ship = clean_ship(m.get("ship"))
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
    social_drop(conn)
    if conn.heist:
        heist_end(conn.heist, "caught" if conn.heist["thief"] is conn else "escaped")
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
    asyncio.ensure_future(world_loop())
    return srv


async def main():
    srv = await serve()
    port = srv.sockets[0].getsockname()[1]
    print("Time Machine game server on port %d" % port)
    print("  accounts: %s | bots: %s" % ("on" if CFG["supabase_url"] else "OFF (dev mode)", CFG["allow_bots"]))
    if not CFG["origins"]:
        print("  WARNING: ALLOWED_ORIGINS is not set, so only pages on localhost can connect. Set it to your site's address.")
    async with srv:
        await srv.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
