#!/usr/bin/env python3
"""Tests for server.py. Run:  python3 server/test_server.py
Plays the part of real browsers (WebSocket clients), including cheating and abusive ones."""
import asyncio
import base64
import hashlib
import json
import math
import os
import struct
import sys
import time
import unittest
import warnings

warnings.simplefilter("ignore", ResourceWarning)  # the test clients' sockets are closed by the process ending

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import server  # noqa: E402


class WS:
    """A tiny WebSocket client (client frames must be masked)."""
    def __init__(self, reader, writer):
        self.r, self.w = reader, writer

    @classmethod
    async def connect(cls, port, origin=None, path="/play"):
        r, w = await asyncio.open_connection("127.0.0.1", port)
        key = base64.b64encode(os.urandom(16)).decode()
        req = "GET %s HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n" % (path, key)
        if origin:
            req += "Origin: %s\r\n" % origin
        w.write((req + "\r\n").encode())
        head = (await r.readuntil(b"\r\n\r\n")).decode()
        ws = cls(r, w)
        ws.status = int(head.split(" ")[1])
        ws.head = head
        ws.key = key
        return ws

    def send_raw(self, op, payload, mask=True):
        n = len(payload)
        head = bytes([0x80 | op])
        mbit = 0x80 if mask else 0
        if n < 126:
            head += bytes([mbit | n])
        else:
            head += bytes([mbit | 126]) + struct.pack(">H", n)
        if mask:
            m = os.urandom(4)
            payload = bytes(b ^ m[i & 3] for i, b in enumerate(payload))
            head += m
        self.w.write(head + payload)

    def send(self, obj):
        self.send_raw(1, json.dumps(obj).encode())

    async def recv(self, timeout=3.0):
        while True:
            b1, b2 = await asyncio.wait_for(self.r.readexactly(2), timeout)
            op, ln = b1 & 15, b2 & 127
            if ln == 126:
                ln = struct.unpack(">H", await self.r.readexactly(2))[0]
            data = await self.r.readexactly(ln)
            if op == 8:
                return None
            if op == 1:
                return json.loads(data)

    async def until(self, pred, timeout=5.0):
        end = time.monotonic() + timeout
        while True:
            m = await self.recv(max(0.05, end - time.monotonic()))
            if m is None:
                raise AssertionError("connection closed")
            if pred(m):
                return m

    async def closed(self, timeout=3.0):
        try:
            while True:
                if await self.recv(timeout) is None:
                    return True
        except (asyncio.IncompleteReadError, ConnectionError):
            return True
        except asyncio.TimeoutError:
            return False


class ServerTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.cfg = dict(server.CFG)
        self.saved = (server.verify_token, server.is_admin, server.RACE_TOTAL, server.RACE_COUNTDOWN, server.RACE_GRACE)
        server.CFG.update(bot_wait=0.6, race_wait=0.6, origins=[], supabase_url="")
        self.srv = await server.serve("127.0.0.1", 0)
        self.port = self.srv.sockets[0].getsockname()[1]
        self.clients = []

    async def asyncTearDown(self):
        for c in list(server.CONNS):
            c.close()
        self.srv.close()
        server.CONNS.clear()
        server.BLOCKED.clear(); server.CHAT_LOG.clear(); server.DIYAS.clear(); server.INVITES.clear()
        for d in (server.RATINGS, server.CLAIMS, server.FID_UID, server.NAMES, server.REQS, server.MAIL, server.RECENT):
            d.clear()
        for q in server.QUEUES.values():
            q.clear()
        server.CFG.clear()
        server.CFG.update(self.cfg)
        server.verify_token, server.is_admin, server.RACE_TOTAL, server.RACE_COUNTDOWN, server.RACE_GRACE = self.saved
        for t in asyncio.all_tasks():
            if t is not asyncio.current_task() and "matchmaker" in repr(t):
                t.cancel()

    async def player(self, name="Ann", cls="gladiator", token=None, look=None):
        ws = await WS.connect(self.port)
        self.clients.append(ws)
        ws.send({"t": "hello", "name": name, "cls": cls, "token": token, "look": look or {}})
        ws.welcome = await ws.until(lambda m: m["t"] == "welcome")
        return ws

    # ---------------------------------------------------------------- names

    async def test_unsuitable_names_are_refused(self):
        for good in ("Marcus", "Julius Caesar", "Scunthorpe", "Cucumber", "Alexander", "Hancock"):
            self.assertIsNone(server.local_name_check(good), good)
        for bad in ("F u c k", "sh1t", "N1gger", "Admin", "Hitler", "p0rn", "5551234567"):
            self.assertIsNotNone(server.local_name_check(bad), bad)
        ok, why = await server.check_name("Marcus")
        self.assertTrue(ok)
        ok, why = await server.check_name("B1tch")
        self.assertFalse(ok)
        self.assertTrue(why)
        # the page asks over HTTP before you can pick a name
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(b"GET /name?n=Sh1t HTTP/1.1\r\nHost: x\r\n\r\n")
        body = (await r.read()).decode()
        self.assertIn('"ok": false', body)
        # a bad name that gets in anyway is shown to other players as "Player", and its owner is told
        ws = await WS.connect(self.port)
        self.clients.append(ws)
        ws.send({"t": "hello", "name": "Fuckface", "cls": "gladiator", "look": {}})
        err = await ws.until(lambda m: m["t"] == "error" and m.get("code") == "name")
        self.assertTrue(err["msg"])
        await ws.until(lambda m: m["t"] == "welcome")

    # ---------------------------------------------------------------- basics

    async def test_health_and_unknown_page(self):
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(b"GET /health HTTP/1.1\r\nHost: x\r\n\r\n")
        body = (await r.read()).decode()
        self.assertIn("200 OK", body)
        self.assertIn('"ok": true', body)
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(b"GET /secret HTTP/1.1\r\nHost: x\r\n\r\n")
        self.assertIn("404", (await r.read()).decode())

    async def test_other_websites_are_refused(self):
        bad = await WS.connect(self.port, origin="https://evil.example")
        self.assertEqual(bad.status, 403)
        ok = await WS.connect(self.port, origin="http://localhost:8123")
        self.assertEqual(ok.status, 101)
        server.CFG["origins"] = ["https://ancientrome-gold.vercel.app"]
        self.assertEqual((await WS.connect(self.port, origin="http://localhost:8123")).status, 403)
        self.assertEqual((await WS.connect(self.port, origin="https://ancientrome-gold.vercel.app")).status, 101)

    async def test_hello_cleans_everything_the_client_claims(self):
        a = await self.player(name="<script>alert(1)</script>Bob", cls="god-mode", look={"toga": 99, "skin": -3, "sash": "x"})
        self.assertNotIn("premium", a.welcome)
        self.assertEqual(server.clean_name("<b>Mara</b>"), "bMarab")
        self.assertEqual(server.clean_look({"toga": 99, "skin": True, "hair": 2}), {"skin": 0, "hair": 2, "toga": 0, "sash": 0, "acc": [], "pet": None, "weapon": None})
        self.assertEqual(server.clean_look({"acc": ["cloak", "cloak", "<script>", 7, "helmet"]})["acc"], ["cloak", "helmet"])
        self.assertEqual(server.clean_look({"toga": 5, "sash": 5})["toga"], 5)   # every colour is free
        self.assertEqual(server.clean_look({"pet": "eagle"})["pet"], "eagle")
        self.assertIsNone(server.clean_look({"pet": "<script>"})["pet"])           # only the real companions

    async def test_must_say_hello_first(self):
        ws = await WS.connect(self.port)
        ws.send({"t": "queue", "mode": "duel"})
        m = await ws.until(lambda m: m["t"] == "error")
        self.assertEqual(m["code"], "hello")

    # ---------------------------------------------------------------- duels

    async def start_duel(self):
        a, b = await self.player("Ann"), await self.player("Ben", cls="merchant")
        a.send({"t": "queue", "mode": "duel"})
        b.send({"t": "queue", "mode": "duel"})
        ma = await a.until(lambda m: m["t"] == "match")
        mb = await b.until(lambda m: m["t"] == "match")
        self.assertEqual((ma["you"], mb["you"]), (0, 1))
        self.assertEqual(ma["room"], mb["room"])
        self.assertEqual([p["name"] for p in ma["players"]], ["Ann", "Ben"])
        return a, b

    async def walk_to(self, ws, x0, x1, yaw):
        x = x0
        while abs(x1 - x) > 0.01:
            x += max(-0.5, min(0.5, x1 - x))
            ws.send({"t": "pos", "x": x, "z": 0, "yaw": yaw})
            await asyncio.sleep(0.06)

    async def test_duel_server_decides_damage_and_ko(self):
        a, b = await self.start_duel()
        # Ben tries to edit his own health: the server ignores it
        b.send({"t": "pos", "x": 12, "z": 0, "yaw": 1.57, "hp": 9999})
        b.send({"t": "hp", "hp": 9999})
        await self.walk_to(a, -12, 9.5, -1.5708)      # Ann walks up to Ben and faces him
        first = None
        for _ in range(12):                              # Ann keeps swinging; Ben never blocks
            a.send({"t": "swing"})
            await asyncio.sleep(0.85)
        end = await b.until(lambda m: m["t"] == "end", timeout=8)
        self.assertEqual(end["winner"], 0)
        self.assertEqual(end["reason"], "ko")
        self.assertEqual(end["hp"][1], 0.0)
        self.assertGreater(end["hp"][0], 99.0)           # Ann was never hurt

    async def test_weapons_change_reach_damage_and_swing_speed(self):
        a = await self.player("Ann", look={"weapon": "spear"})
        b = await self.player("Ben", look={"weapon": "dagger"})
        self.assertIsNone(server.clean_look({"weapon": "bazooka"})["weapon"])      # only real weapons are accepted
        a.send({"t": "queue", "mode": "duel"})
        b.send({"t": "queue", "mode": "duel"})
        await a.until(lambda m: m["t"] == "match")
        await b.until(lambda m: m["t"] == "match")
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        pa, pb = room.players
        self.assertEqual((pa.reach, pb.reach), (4.3, 2.5))
        pa.x, pa.z, pa.yaw = 0.0, 0.0, 0.0
        pb.x, pb.z, pb.yaw = 0.0, -4.0, math.pi          # four metres in front of Ann, facing her
        room.events.clear()
        room.strike(pa, pb)                              # the spear reaches that far
        self.assertEqual(room.events[-1][0], "hit")
        room.events.clear()
        room.strike(pb, pa)                              # the dagger does not
        self.assertEqual(room.events[-1][0], "miss")
        pb.swing = 0.2                                   # a quick dagger swing is reported on the standard timeline
        self.assertEqual(pb.state()[6], round(0.2 / 0.65, 2))
        self.assertGreater(server.WEAPONS["axe"][0], 1.4)

    async def test_other_players_see_your_diyas_and_lanterns(self):
        a, b, c = await self.player("Ann"), await self.player("Ben"), await self.player("Cy")
        a.send({"t": "fest", "k": "diya", "c": "delhi", "x": 5900.5, "z": -30.2})
        got = await b.until(lambda m: m["t"] == "fest")
        self.assertEqual((got["k"], got["c"], got["x"], got["z"], got["n"]), ("diya", "delhi", 5900.5, -30.2, "Ann"))
        await c.until(lambda m: m["t"] == "fest")
        a.send({"t": "fest", "k": "diya", "c": "delhi", "x": 1, "z": 1})          # too soon after the last one: ignored
        with self.assertRaises(asyncio.TimeoutError):
            await b.until(lambda m: m["t"] == "fest", timeout=0.6)
        await asyncio.sleep(1.2)
        a.send({"t": "fest", "k": "lantern", "c": "delhi", "x": 5901, "z": -31, "y": 3, "col": 99, "w": "peace for everyone"})
        lan = await b.until(lambda m: m["t"] == "fest" and m["k"] == "lantern")
        self.assertEqual((lan["col"], lan["w"], lan["y"]), (5, "peace for everyone", 3.0))
        late = await self.player("Late")                                          # someone who arrives later asks for the lamps already lit
        late.send({"t": "fest", "k": "sync", "c": "delhi"})
        lamps = await late.until(lambda m: m["t"] == "diyas")
        self.assertEqual([(d["x"], d["n"]) for d in lamps["list"]], [(5900.5, "Ann")])      # lanterns drift away, only lamps stay
        late.send({"t": "fest", "k": "sync", "c": "rome"})
        self.assertEqual((await late.until(lambda m: m["t"] == "diyas"))["list"], [])      # none in the other city
        a.send({"t": "fest", "k": "diya", "c": "mars", "x": 1, "z": 1})            # not a city: ignored
        with self.assertRaises(asyncio.TimeoutError):
            await b.until(lambda m: m["t"] == "fest", timeout=0.6)

    async def test_players_can_shove_each_other_only_when_close(self):
        a, b, c = await self.player("Ann"), await self.player("Ben"), await self.player("Cy")
        ca, cb, cc = [next(x for x in server.CONNS if x.name == n) for n in ("Ann", "Ben", "Cy")]
        for conn, x, z in ((ca, 0.0, 0.0), (cb, 2.0, 0.0), (cc, 30.0, 0.0)):
            conn.city, conn.px, conn.pz, conn.walk_at = "rome", x, z, server.now()
        cb.seen = {ca.id}
        cc.seen = {cb.id}
        a.send({"t": "shove", "to": cc.id})                                        # too far away
        with self.assertRaises(asyncio.TimeoutError):
            await c.until(lambda m: m["t"] == "shoved", timeout=0.6)
        a.send({"t": "shove", "to": cb.id})
        hit = await b.until(lambda m: m["t"] == "shoved")
        self.assertEqual((hit["by"], hit["dx"], hit["dz"]), ("Ann", 1.0, 0.0))     # pushed away from Ann
        self.assertEqual((await a.until(lambda m: m["t"] == "shove_ok"))["name"], "Ben")
        await c.until(lambda m: m["t"] == "shove_fx")                              # people who can see Ben see him fall
        cb.walk_at = ca.walk_at = server.now()
        await asyncio.sleep(0.8)
        a.send({"t": "shove", "to": cb.id})                                         # Ben cannot be shoved again straight away
        with self.assertRaises(asyncio.TimeoutError):
            await b.until(lambda m: m["t"] == "shoved", timeout=0.6)

    async def test_friends_can_sail_together_against_practice_ships(self):
        self.accounts("ann", "bob", "cy")
        ann, bob, cy = await self.player("Ann", token="ann"), await self.player("Bob", token="bob"), await self.player("Cy", token="cy")
        ann.send({"t": "social", "a": "req", "name": "Bob"})
        asked = await bob.until(lambda m: m["t"] == "fr_in")
        bob.send({"t": "social", "a": "ans", "fid": asked["fid"], "ok": True})
        added = await ann.until(lambda m: m["t"] == "fr_added")
        ann.send({"t": "social", "a": "invite", "fid": server.fid_of("u-cy")})            # Cy is not a friend
        self.assertIn("only invite your friends", (await ann.until(lambda m: m["t"] == "fr_msg" and "invite" in m["msg"]))["msg"])
        ann.send({"t": "social", "a": "invite", "fid": added["fid"]})
        inv = await bob.until(lambda m: m["t"] == "fr_invite")
        self.assertEqual((inv["name"], inv["game"]), ("Ann", "naval"))
        bob.send({"t": "social", "a": "accept", "fid": inv["fid"]})
        ma = await ann.until(lambda m: m["t"] == "match")
        mb = await bob.until(lambda m: m["t"] == "match")
        self.assertTrue(ma["coop"] and mb["coop"])
        self.assertEqual([p["bot"] for p in ma["players"]], [False, False, True, True, True])      # two friends and three practice ships
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.start_at = 0
        a, b, *bots = room.ships
        room.balls.append({"id": 1, "x": b.x, "y": server.NAVAL_LEVEL + 0.5, "z": b.z, "vx": 0, "vy": 0, "vz": 0, "by": a})
        room.step(0.05)
        self.assertEqual(b.hp, 100)                                                         # crewmates cannot hurt each other
        for s in bots:
            room.sink(s)
        room.step(0.05)
        self.assertTrue(room.over)
        end = await ann.until(lambda m: m["t"] == "end")
        self.assertEqual((end["coop"], end["won"], end["reason"]), (True, True, "cleared"))
        self.assertEqual(end["rank"]["delta"], 8)                                           # a crew victory counts towards your rank

    async def test_the_admin_list_says_where_people_are(self):
        server.CFG["supabase_url"] = "https://example.supabase.co"

        async def fake_verify(token):
            return {"boss": "u-boss"}.get(token)

        async def fake_admin(token):
            return token == "boss"
        server.verify_token, server.is_admin = fake_verify, fake_admin
        boss, ann, menu = await self.player("Boss", token="boss"), await self.player("Ann"), await self.player("Menu")
        ann.send({"t": "walk", "c": "rome", "x": 432, "z": 31, "yaw": 0, "s": 3})
        await asyncio.sleep(0.3)
        boss.send({"t": "admin", "a": "who"})
        who = {w["name"]: w for w in (await boss.until(lambda m: m["t"] == "adminwho"))["who"]}
        self.assertEqual((who["Ann"]["where_city"], who["Ann"]["where_place"], who["Ann"]["where_doing"]), ("Rome", "at The Colosseum", "walking about"))
        self.assertEqual(who["Ann"]["where_xz"], "432, 31")
        self.assertEqual((who["Menu"]["where_city"], who["Menu"]["where_doing"]), ("-", "in the menus"))
        ann.send({"t": "walk", "c": "delhi", "x": 6000, "z": 1, "yaw": 0, "s": 0})
        await asyncio.sleep(0.3)
        boss.send({"t": "admin", "a": "who"})
        who = {w["name"]: w for w in (await boss.until(lambda m: m["t"] == "adminwho"))["who"]}
        self.assertEqual((who["Ann"]["where_city"], who["Ann"]["where_place"]), ("Old Delhi", "at Lahori Gate"))
        self.assertEqual(who["Ann"]["where_xz"], "0, 1")                                   # Delhi's x counts from its Lahori Gate
        ann.send({"t": "walk", "c": "cancun", "x": 12000, "z": 30, "yaw": 0, "s": 0})      # and Cancún, with Chichén Itzá's pyramid
        await asyncio.sleep(0.3)
        boss.send({"t": "admin", "a": "who"})
        who = {w["name"]: w for w in (await boss.until(lambda m: m["t"] == "adminwho"))["who"]}
        self.assertEqual((who["Ann"]["where_city"], who["Ann"]["where_place"], who["Ann"]["where_xz"]), ("Cancún", "at El Castillo (Temple of Kukulcán)", "0, 30"))

    async def test_the_chat_can_sing_a_song(self):
        server.SING_GAP = 0.15
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "chat", "text": "/songs"})
        listed = (await a.until(lambda m: m["t"] == "chat" and m.get("sys") and "Songs" in m["text"]))["text"]
        self.assertIn("row", listed)
        self.assertGreaterEqual(len(server.SONGS), 28)                                   # a good long list
        self.assertTrue(all(len(v) == 4 and all(line.strip() for line in v) for v in server.SONGS.values()))
        self.assertIn("holi", listed)
        a.send({"t": "chat", "text": "/sing nonsense"})
        self.assertIn("do not know", (await a.until(lambda m: m["t"] == "chat" and m.get("sys") and "know" in m["text"]))["text"])
        a.send({"t": "chat", "text": "/sing row"})
        lines = [(await b.until(lambda m: m["t"] == "chat" and m.get("sing")))["text"] for _ in range(4)]
        self.assertEqual(lines[0], "\u266a Row, row, row your boat, \u266a")
        self.assertIn("Life is but a dream", lines[3])
        await asyncio.sleep(1.2)
        a.send({"t": "chat", "text": "/sing legion"})                                 # too soon after the last song
        self.assertIn("rest", (await a.until(lambda m: m["t"] == "chat" and m.get("sys") and "rest" in m["text"]))["text"])

    async def test_chat_pictures_are_small_jpegs_from_accounts_only(self):
        self.accounts("ann")
        ann, ben, guest = await self.player("Ann", token="ann"), await self.player("Ben"), await self.player("Guest")
        jpeg = base64.b64encode(b"\xff\xd8\xff" + b"x" * 300 + b"\xff\xd9").decode()
        pic = "data:image/jpeg;base64," + jpeg
        guest.send({"t": "chat", "text": "look", "pic": pic})
        self.assertIn("Log in", (await guest.until(lambda m: m["t"] == "chat" and m.get("sys")))["text"])
        ann.send({"t": "chat", "text": "my cat", "pic": pic})
        got = await ben.until(lambda m: m["t"] == "chat" and m.get("pic"))
        self.assertEqual((got["name"], got["text"], got["pic"]), ("Ann", "my cat", pic))
        self.assertNotIn("pic", server.CHAT_LOG[-1])                                       # later arrivals are not sent old pictures
        self.assertEqual(server.CHAT_LOG[-1]["text"], "my cat")
        ann.send({"t": "chat", "text": "another", "pic": pic})                             # too soon
        self.assertIn("every few seconds", (await ann.until(lambda m: m["t"] == "chat" and m.get("sys")))["text"])
        ann_conn = next(c for c in server.CONNS if c.name == "Ann")
        for bad in ("data:image/svg+xml;base64," + jpeg, "data:image/jpeg;base64,!!!", "http://evil.example/x.jpg", "data:image/jpeg;base64," + base64.b64encode(b"GIF89a" + b"x" * 300).decode(), "data:image/jpeg;base64," + "A" * 4000):
            ann_conn.pic_t = -1e9
            ann.send({"t": "chat", "text": "x", "pic": bad})
            self.assertIn("could not be sent", (await ann.until(lambda m: m["t"] == "chat" and m.get("sys") and "sent" in m["text"]))["text"])

    async def test_duel_block_cuts_damage_and_range_is_checked(self):
        a, b = await self.start_duel()
        a.send({"t": "swing"})                           # far away: a miss, no damage
        await asyncio.sleep(0.9)
        far = await b.until(lambda m: m["t"] == "duel")
        self.assertEqual(far["p"][1][4], 100.0)
        await self.walk_to(a, -12, 9.5, -1.5708)
        b.send({"t": "block", "on": True})
        await asyncio.sleep(0.15)
        a.send({"t": "swing"})
        ev = await b.until(lambda m: m["t"] == "duel" and any(e[0] == "block" for e in m["ev"]), timeout=3)
        state = await b.until(lambda m: m["t"] == "duel")
        self.assertGreater(state["p"][1][4], 95.0)       # a blocked hit costs only a few points

    async def test_duel_speed_hacks_are_clamped(self):
        a, b = await self.start_duel()
        a.send({"t": "pos", "x": 0, "z": 0, "yaw": 0})   # tries to teleport 12 m at once
        await asyncio.sleep(0.2)
        st = await b.until(lambda m: m["t"] == "duel")
        self.assertLess(st["p"][0][1], -9.5)             # barely moved from -12
        a.send({"t": "pos", "x": 500, "z": 500, "yaw": 0})
        await asyncio.sleep(0.2)
        st = await b.until(lambda m: m["t"] == "duel")
        self.assertLess((st["p"][0][1] ** 2 + st["p"][0][2] ** 2) ** 0.5, server.ARENA_R)

    async def test_leaving_a_duel_forfeits(self):
        a, b = await self.start_duel()
        a.w.close()
        end = await b.until(lambda m: m["t"] == "end", timeout=4)
        self.assertEqual((end["winner"], end["reason"]), (1, "left"))

    async def test_practice_bot_joins_a_lone_player(self):
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "duel", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertIn("practice bot", m["players"][1]["name"])
        st = await a.until(lambda m: m["t"] == "duel")
        self.assertEqual(len(st["p"]), 2)
        server.CFG["allow_bots"] = False
        b = await self.player("Solo2")
        b.send({"t": "queue", "mode": "duel", "bot": True})
        with self.assertRaises(asyncio.TimeoutError):
            await b.until(lambda m: m["t"] == "match", timeout=1.5)

    # ---------------------------------------------------------------- races

    async def test_race_order_and_cheating(self):
        server.RACE_COUNTDOWN, server.RACE_TOTAL, server.RACE_GRACE = 0.4, 100.0, 1.5
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "queue", "mode": "race"})
        b.send({"t": "queue", "mode": "race"})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        await b.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(len(m["players"]), 2)
        self.assertEqual(m["laps"], 3)
        a.send({"t": "race", "s": 60, "d": 5})           # before the start signal: ignored
        await asyncio.sleep(0.2)
        st = await a.until(lambda m: m["t"] == "race")
        self.assertEqual(st["p"][0][1], 0.0)
        await asyncio.sleep(0.4)
        a.send({"t": "race", "s": 5000, "d": 5})         # a huge jump is limited
        await asyncio.sleep(0.15)
        st = await a.until(lambda m: m["t"] == "race" and m["p"][0][1] > 0)
        self.assertLess(st["p"][0][1], 10)
        s = {0: st["p"][0][1], 1: 0.0}
        for _ in range(60):                              # Ann is quicker than Ben
            s[0] += 4.0
            s[1] += 2.5
            a.send({"t": "race", "s": s[0], "d": 5})
            b.send({"t": "race", "s": s[1], "d": -3})
            await asyncio.sleep(0.12)
            if s[0] >= 100.0:
                break
        end = await a.until(lambda m: m["t"] == "end", timeout=30)
        self.assertEqual(end["order"][0]["name"], "Ann")
        self.assertIsNotNone(end["order"][0]["time"])

    async def test_race_with_practice_bots(self):
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "race", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(len(m["players"]), 4)
        self.assertTrue(all(p["name"].startswith("Practice bot") for p in m["players"][1:]))

    # ---------------------------------------------------------------- co-op: a team against five bots

    async def start_coop(self, bot=False):
        server.CFG["coop_wait"] = 0.6
        a, b = await self.player("Ann"), await self.player("Ben")
        for w in (a, b):
            w.send({"t": "queue", "mode": "coop", "bot": bot})
        ma = await a.until(lambda m: m["t"] == "match", timeout=4)
        mb = await b.until(lambda m: m["t"] == "match", timeout=4)
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        return a, b, ma, mb, room

    async def test_coop_two_players_face_five_bots(self):
        a, b, ma, mb, room = await self.start_coop()
        self.assertEqual(ma["mode"], "coop")
        self.assertEqual((ma["you"], mb["you"]), (0, 1))
        roles = [p["role"] for p in ma["players"]]
        self.assertEqual(roles, ["player", "player"] + ["enemy"] * 5)
        self.assertEqual(ma["enemies"], 5)
        room.step(0.05)
        st = await a.until(lambda m: m["t"] == "coop")
        self.assertEqual(len(st["p"]), 7)
        self.assertEqual({row[9] for row in st["p"]}, {0, 1})     # both teams are in the state

    async def test_coop_a_lone_player_gets_friendly_bots_when_they_ask(self):
        server.CFG["bot_wait"] = 0.5
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "coop", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        roles = [p["role"] for p in m["players"]]
        self.assertEqual(roles.count("player"), 1)
        self.assertEqual(roles.count("ally"), 2)
        self.assertEqual(roles.count("enemy"), 5)
        self.assertTrue(all("bot" in p["name"] for p in m["players"] if p["role"] != "player"))

    async def test_coop_hits_come_from_the_server_and_only_hurt_enemies(self):
        a, b, ma, mb, room = await self.start_coop()
        ann, ben = room.fighters[0], room.fighters[1]
        e = room.fighters[2]
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0                          # everyone out of the way ...
        ann.x, ann.z, ann.yaw = 0.0, 0.0, -math.pi / 2     # ... Ann faces east
        ben.x, ben.z = 0.0, 1.5                            # her teammate stands right beside her
        e.x, e.z = 2.0, 0.0                                # an enemy is two metres ahead
        ben.hp = 100.0
        a.send({"t": "swing"})
        await asyncio.sleep(0.2)
        for _ in range(8):
            room.step(0.05)
        self.assertLess(e.hp, 80.0)                        # the enemy was hurt
        self.assertEqual(ben.hp, 100.0)                    # friendly fire does not exist
        self.assertEqual(ann.hp, 100.0)

    async def test_coop_revive_win_and_lose(self):
        a, b, ma, mb, room = await self.start_coop()
        ann, ben = room.fighters[0], room.fighters[1]
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0
            f.bot = False if f.role == "enemy" else f.bot
        ann.x, ann.z, ben.x, ben.z = 0.0, 0.0, 1.5, 0.0
        ben.down, ben.hp = True, 0.0
        for _ in range(40):                                # 2 seconds: not enough
            room.step(0.05)
        self.assertTrue(ben.down)
        for _ in range(30):                                # past three seconds: back on their feet
            room.step(0.05)
        self.assertFalse(ben.down)
        self.assertEqual(ben.hp, 40.0)
        # all five enemies down: the team wins
        for f in room.fighters:
            if f.role == "enemy":
                f.down, f.hp = True, 0.0
        room.step(0.05)
        end = await a.until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["won"], end["reason"], end["kills"]), (True, "cleared", 5))

    async def test_coop_team_wiped_out_loses(self):
        a, b, ma, mb, room = await self.start_coop()
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0
            if f.role != "enemy":
                f.down, f.hp = True, 0.0
        room.step(0.05)
        end = await b.until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["won"], end["reason"]), (False, "defeated"))

    async def test_coop_leaving_does_not_break_the_others(self):
        a, b, ma, mb, room = await self.start_coop()
        a.w.close()
        await asyncio.sleep(0.4)
        room.step(0.05)
        st = await b.until(lambda m: m["t"] == "coop", timeout=3)
        self.assertEqual(st["p"][0][8], 1)                 # Ann is shown as down; Ben plays on
        self.assertFalse(room.over)


    # ---------------------------------------------------------------- naval battle (every ship for itself)

    async def start_naval(self, n=2):
        server.CFG["naval_wait"] = 0.6
        ws = [await self.player(nm) for nm in ("Ann", "Ben", "Cyd", "Dee")[:n]]
        for w in ws:
            w.send({"t": "queue", "mode": "naval"})
        ms = [await w.until(lambda m: m["t"] == "match", timeout=4) for w in ws]
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        room.start_at = 0                     # the countdown is over
        return ws, ms, room

    def place(self, ship, x, z, yaw):
        ship.x, ship.z, ship.yaw, ship.v = x, z, yaw, 0.0

    async def test_naval_is_every_ship_for_itself(self):
        ws, ms, room = await self.start_naval(3)
        self.assertEqual([m["you"] for m in ms], [0, 1, 2])
        self.assertEqual(len(ms[0]["players"]), 3)
        self.assertFalse(any("team" in p or "role" in p for p in ms[0]["players"]))   # no teams
        room.step(0.05)
        st = await ws[0].until(lambda m: m["t"] == "naval")
        self.assertEqual(len(st["s"]), 3)

    async def test_naval_cannons_hit_other_ships_not_your_own_and_cool_down(self):
        ws, ms, room = await self.start_naval(2)
        a, b = room.ships
        self.place(a, -8, 0, 0.0)             # a sails along +z; its port side (left) faces -x... b is to the port side
        self.place(b, 8, 0, 0.0)              # starboard (-1) of a is -x? side(-1) = (-cos, sin) -> -x; port (+1) = +x
        room.start_at = server.now() + 5      # not yet: nothing can fire
        a_conn = ws[0]
        a_conn.send({"t": "naval", "x": -8, "z": 0, "yaw": 0, "fire": 1})
        await asyncio.sleep(0.2)
        self.assertEqual(a.queue, [])
        room.start_at = 0
        for _ in range(8):
            room.step(0.05)                   # the guns finish loading
        a_conn.send({"t": "naval", "x": -8, "z": 0, "yaw": 0, "fire": 1})
        await asyncio.sleep(0.2)
        self.assertEqual(len(a.queue), 3)     # three cannons on a side
        a_conn.send({"t": "naval", "x": -8, "z": 0, "yaw": 0, "fire": 1})
        await asyncio.sleep(0.2)
        self.assertEqual(len(a.queue), 3)     # that side is still reloading
        self.assertGreater(a.cd[1], 2.0)
        for _ in range(60):
            room.step(0.05)
        self.assertLess(b.hp, 100)            # the server dealt the damage
        self.assertEqual(a.hp, 100)           # your own cannonballs do not hurt you

    async def test_naval_cannot_sail_faster_than_a_galley(self):
        ws, ms, room = await self.start_naval(2)
        a = room.ships[0]
        x0, z0 = a.x, a.z
        ws[0].send({"t": "naval", "x": 0, "z": 0, "yaw": 0})
        await asyncio.sleep(0.3)
        self.assertLess(math.hypot(a.x - x0, a.z - z0), 6.6 * 1.25 * 0.5 + 1.0)
        ws[0].send({"t": "naval", "x": 9999, "z": "x", "yaw": float("nan")})
        await asyncio.sleep(0.2)
        self.assertLessEqual((a.x / 29) ** 2 + (a.z / 23.5) ** 2, 1.0001)   # and stays inside the flooded arena

    async def test_naval_ram_hurts_once_and_last_ship_afloat_wins(self):
        ws, ms, room = await self.start_naval(3)
        a, b, c = room.ships
        self.place(a, 0, -3, 0.0)             # a's bow touches b
        self.place(b, 0, 2, math.pi)
        self.place(c, -20, 10, 0.0)
        a.v = 5.0
        room.collide_all()
        self.assertEqual(b.hp, 88)
        a.v = 5.0
        room.collide_all()
        self.assertEqual(b.hp, 88)            # the ram needs a moment to recover
        room.sink(b)
        self.assertFalse(room.over)
        room.hurt(c, 1000, 0, 1, 0)
        room.step(0.05)
        self.assertTrue(room.over)
        end = await ws[0].until(lambda m: m["t"] == "end")
        self.assertEqual(end["mode"], "naval")
        self.assertEqual([o["i"] for o in end["order"]], [0, 2, 1])   # winner, then the later sinking, then the first

    def test_ship_designs_are_cut_down_to_what_is_allowed(self):
        d = server.clean_ship({"type": "bogus", "sail": 99, "hull": "x", "port": [True] * 20, "star": [True] * 20})
        self.assertEqual((d["type"], d["sail"], d["hull"]), ("galley", 0, 0))
        self.assertEqual(sum(d["port"]) + sum(d["star"]), 8)                       # a galley has 4 spots a side
        k = server.clean_ship({"type": "kayak", "port": [True] * 7, "star": [True] * 7})
        self.assertEqual(sum(k["port"]) + sum(k["star"]), 1)                       # a kayak holds one cannon
        e = server.clean_ship({"type": "battleship", "port": [False] * 7, "star": [False] * 7})
        self.assertEqual(sum(e["port"]) + sum(e["star"]), 2)                       # never a ship with no cannons
        self.assertEqual(sum(server.clean_ship(None)["port"]), 3)                  # the default: three a side
        c = server.clean_ship({"type": "canoe", "port": [True] * 7, "star": [True] * 7})
        self.assertEqual((sum(c["port"]), sum(c["star"])), (1, 1))                 # a canoe only has the middle spot on each side
        counts = [len(v["ports"]) + len(v["stars"]) for v in server.NAVAL_TYPES.values()]
        self.assertEqual(sorted(set(counts)), [1, 2, 4, 6, 8, 10, 12, 14])                      # boats hold from one cannon to fourteen
        self.assertEqual(len(server.NAVAL_TYPES), 20)                                            # the old eight and twelve motorboats, sailboats and other craft
        self.assertEqual(server.clean_ship({"type": "yacht"})["type"], "yacht")

    async def test_naval_players_bring_their_own_ships(self):
        server.CFG["naval_wait"] = 0.6
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "queue", "mode": "naval", "ship": {"type": "battleship", "sail": 2, "hull": 3, "port": [True] * 7, "star": [True] * 7}})
        b.send({"t": "queue", "mode": "naval", "ship": {"type": "kayak", "port": [True, False, False, False, False, False, False], "star": [True, False, False, False, False, False, False]}})
        ma = await a.until(lambda m: m["t"] == "match", timeout=4)
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.start_at = 0
        ann, ben = room.ships
        self.assertEqual((ann.hp, ben.hp), (260.0, 30.0))
        self.assertEqual((len(ann.cannons[1]), len(ann.cannons[-1])), (7, 7))
        self.assertEqual((ann.max_speed, ben.max_speed), (4.2, 9.6))
        self.assertEqual([p["ship"]["type"] for p in ma["players"]], ["battleship", "kayak"])
        ann.cd = {1: 0.0, -1: 0.0}
        self.assertTrue(room.fire(ann, 1))
        self.assertEqual(len(ann.queue), 7)                                        # the whole broadside goes off
        self.assertEqual(round(ann.cd[1], 1), 3.0)                                 # and a big broadside reloads slower

    async def test_naval_a_lone_player_gets_practice_ships_when_they_ask(self):
        server.CFG["bot_wait"] = 0.5
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "naval", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(len(m["players"]), 3)
        self.assertEqual(sum(1 for p in m["players"] if p["bot"]), 2)
        server.CFG["allow_bots"] = False
        b = await self.player("Solo2")
        b.send({"t": "queue", "mode": "naval", "bot": True})
        with self.assertRaises(asyncio.TimeoutError):
            await b.until(lambda m: m["t"] == "match", timeout=1.5)

    async def test_naval_practice_ships_fight_back_but_can_be_beaten(self):
        server.CFG["bot_wait"] = 0.3
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "naval", "bot": True})
        await a.until(lambda m: m["t"] == "match", timeout=4)
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.start_at = 0
        me, b1, b2 = room.ships
        for _ in range(800):                  # 40 seconds with a captain who does nothing
            room.step(0.05)
        self.assertLess(me.hp, 100)           # the bots do shoot
        room2_bots_alive = [s for s in room.ships if s.bot and not s.dead]
        self.assertTrue(room2_bots_alive)
        # a stationary target at point blank range is beaten by the player's guns
        room.over = False
        for s in (b1, b2):
            s.hp = 5
        self.place(b1, 6, 0, 0.0)
        self.place(me, 0, 0, 0.0)
        me.hp = 100
        me.dead_at = None
        me.cd = {1: 0, -1: 0}
        room.fire(me, 1)
        for _ in range(40):
            room.step(0.05)
        self.assertTrue(b1.dead or b1.hp < 5)

    async def test_naval_practice_ships_charge_and_ram_you(self):
        server.CFG["bot_wait"] = 0.3
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "naval", "bot": True})
        await a.until(lambda m: m["t"] == "match", timeout=4)
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.start_at = 0
        me, b1, b2 = room.ships
        rams = []
        real_hurt = room.hurt

        def spy(s, dmg, x, y, z, by=None):
            if dmg == server.NAVAL_RAM_DMG and by is not None and by.bot and s is me:
                rams.append(by.i)
            return real_hurt(s, dmg, x, y, z, by)
        room.hurt = spy
        self.place(me, 0, 0, 0.0)
        self.place(b1, 18, 0, -math.pi / 2)       # a practice ship off to the side
        self.place(b2, -18, 0, math.pi / 2)
        b1.ai, b1.ai_t = "ram", 9.0
        b2.ai, b2.ai_t = "ram", 9.0
        for _ in range(500):                      # 25 seconds with a captain who does nothing
            me.hp = max(me.hp, 60)                # stay afloat so the whole charge can be seen
            me.v = 0.0
            room.step(0.05)
        self.assertTrue(rams, "a practice ship should ram you bow first")
        self.assertLessEqual(len(rams), 14)       # and not over and over: a ram, then they back away

    async def test_naval_leaving_sinks_your_ship_and_the_others_play_on_or_win(self):
        ws, ms, room = await self.start_naval(3)
        ws[0].w.close()
        await asyncio.sleep(0.4)
        room.step(0.05)
        self.assertTrue(room.ships[0].dead)
        self.assertFalse(room.over)           # two captains remain
        ws[1].w.close()
        await asyncio.sleep(0.4)
        room.step(0.05)
        self.assertTrue(room.over)            # the last captain is alone: the battle is over

    # ---------------------------------------------------------------- the open world

    async def test_walkers_see_each_other_only_nearby_in_the_same_city(self):
        a, b, c, d = await self.player("Ann"), await self.player("Ben"), await self.player("Cyd"), await self.player("Dee")
        a.send({"t": "walk", "c": "rome", "x": 100, "z": 50, "yaw": 1.0, "s": 3})
        b.send({"t": "walk", "c": "rome", "x": 150, "z": 50, "yaw": 2.0, "s": 0})      # 50 m away: visible
        c.send({"t": "walk", "c": "rome", "x": 900, "z": 50, "yaw": 0, "s": 0})        # far away: not visible
        d.send({"t": "walk", "c": "delhi", "x": 110, "z": 50, "yaw": 0, "s": 0})       # same numbers, other city: not visible
        await asyncio.sleep(0.3)
        server.world_once()
        wa = await a.until(lambda m: m["t"] == "world")
        self.assertEqual([p[0] for p in wa["p"]], [b.welcome["id"]])
        self.assertEqual(wa["i"][0][1], "Ben")                                           # name, class and look come once
        self.assertEqual(wa["p"][0][1:3], [150.0, 50.0])
        self.assertEqual(wa["p"][0][5:], [0, 0, 0, 0.0])                                 # no vehicle yet, on the ground, not leaning
        wb = await b.until(lambda m: m["t"] == "world")
        self.assertEqual([p[0] for p in wb["p"]], [a.welcome["id"]])
        server.world_once()
        again = await a.until(lambda m: m["t"] == "world")
        self.assertEqual(again["i"], [])                                                 # not told about Ben twice
        # Ben climbs into a sports car and leaves a scooter behind; junk is ignored
        b.send({"t": "walk", "c": "rome", "x": 150, "z": 50, "yaw": 2.0, "s": 20, "v": "sportscar", "k": ["scooter", 140, 40, 1.5]})
        await asyncio.sleep(0.3)
        server.world_once()
        wv = await a.until(lambda m: m["t"] == "world" and m["p"] and m["p"][0][5] == "sportscar")
        self.assertEqual(wv["p"][0][6], ["scooter", 140.0, 40.0, 1.5])
        b.send({"t": "walk", "c": "rome", "x": 150, "z": 50, "yaw": 2.0, "s": 0, "v": "<script>", "k": ["tank", 1, 2, 3]})
        await asyncio.sleep(0.3)
        server.world_once()
        wj = await a.until(lambda m: m["t"] == "world" and m["p"] and m["p"][0][5] == 0)
        self.assertEqual(wj["p"][0][5:7], [0, 0])
        # Ben takes off in a plane: Ann sees how high he is and how he leans, and she can see him from much further away
        b.send({"t": "walk", "c": "rome", "x": 800, "z": 50, "yaw": 2.0, "s": 80, "v": "plane", "a": 120, "r": 0.4})
        await asyncio.sleep(0.3)
        server.world_once()
        wf = await a.until(lambda m: m["t"] == "world" and m["p"] and m["p"][0][5] == "plane")
        self.assertEqual(wf["p"][0][4], 80.0)                                          # (a plane is faster than a walker)
        self.assertEqual(wf["p"][0][7:], [120, 0.4])
        # Ben walks away: Ann is told he is gone
        b.send({"t": "walk", "c": "rome", "x": 5000, "z": 50, "yaw": 0, "s": 0})
        await asyncio.sleep(0.3)
        server.world_once()
        gone = await a.until(lambda m: m["t"] == "world" and m["g"])
        self.assertEqual(gone["g"], [b.welcome["id"]])

    async def test_houses_stand_on_the_street_and_a_thief_can_get_away_or_be_caught(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "walk", "c": "rome", "x": 100, "z": 50, "yaw": 0, "s": 0, "h": 2})
        b.send({"t": "walk", "c": "rome", "x": 150, "z": 50, "yaw": 0, "s": 0, "h": 1})
        await asyncio.sleep(0.3)
        server.houses_once()
        ha = await a.until(lambda m: m["t"] == "houses" and m["h"])
        self.assertEqual([h[2:] for h in ha["h"]], [["Ben", 1]])                          # Ann sees Ben's house, with its tier
        self.assertNotEqual(ha["mine"], ha["h"][0][0])                                    # and everyone has their own plot
        bx, bz, _, _ = server.plot_pos(ha["h"][0][0])
        # too far from the door: refused
        a.send({"t": "rob", "target": b.welcome["id"]})
        no = await a.until(lambda m: m["t"] == "heist_no")
        self.assertIn("door", no["msg"])
        # at the door: the robbery starts for both
        a.send({"t": "walk", "c": "rome", "x": bx, "z": bz, "yaw": 0, "s": 0})
        await asyncio.sleep(0.2)
        a.send({"t": "rob", "target": b.welcome["id"]})
        ta = await a.until(lambda m: m["t"] == "heist")
        tb = await b.until(lambda m: m["t"] == "heist")
        self.assertEqual((ta["role"], ta["other"], tb["role"], tb["other"]), ("thief", "Ben", "owner", "Ann"))
        # Ann runs far away: she gets clear
        a.send({"t": "walk", "c": "rome", "x": bx + 400, "z": bz, "yaw": 0, "s": 20})
        await asyncio.sleep(0.2)
        for _ in range(9):
            server.heist_once()
        endA = await a.until(lambda m: m["t"] == "heist_end")
        self.assertEqual((endA["result"], endA["loot"]), ("escaped", 100))
        await b.until(lambda m: m["t"] == "heist_end")
        # robbing again at once is refused (she lies low)
        a.send({"t": "walk", "c": "rome", "x": bx, "z": bz, "yaw": 0, "s": 0})
        await asyncio.sleep(0.2)
        a.send({"t": "rob", "target": b.welcome["id"]})
        again = await a.until(lambda m: m["t"] == "heist_no")
        self.assertIn("Lie low", again["msg"])
        # a second robbery where the owner catches up
        server.HEISTS.clear()
        for c in server.CONNS:
            c.rob_cd, c.heist = 0.0, None
        server.VICTIM_CD.clear()
        a.send({"t": "rob", "target": b.welcome["id"]})
        await a.until(lambda m: m["t"] == "heist")
        b.send({"t": "walk", "c": "rome", "x": bx + 2, "z": bz, "yaw": 0, "s": 8})   # Ben is right on top of her
        await asyncio.sleep(0.2)
        server.heist_once()
        caught = await a.until(lambda m: m["t"] == "heist_end")
        self.assertEqual(caught["result"], "caught")

    async def test_the_city_guards_can_catch_a_thief(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "walk", "c": "rome", "x": 100, "z": 50, "yaw": 0, "s": 0})
        b.send({"t": "walk", "c": "rome", "x": 150, "z": 50, "yaw": 0, "s": 0})
        await asyncio.sleep(0.3)
        server.houses_once()
        ha = await a.until(lambda m: m["t"] == "houses" and m["h"])
        bx, bz, _, _ = server.plot_pos(ha["h"][0][0])
        a.send({"t": "walk", "c": "rome", "x": bx, "z": bz, "yaw": 0, "s": 0})
        await asyncio.sleep(0.2)
        b.send({"t": "heist_caught"})                       # only the thief can be caught this way: nothing happens
        a.send({"t": "rob", "target": b.welcome["id"]})
        await a.until(lambda m: m["t"] == "heist")
        b.send({"t": "heist_caught"})
        await asyncio.sleep(0.2)
        self.assertEqual(len(server.HEISTS), 1)
        a.send({"t": "heist_caught"})                       # the guards got Ann
        end = await a.until(lambda m: m["t"] == "heist_end")
        self.assertEqual(end["result"], "caught")
        await b.until(lambda m: m["t"] == "heist_end")

    async def test_walkers_in_a_game_are_not_in_the_open_world_and_bad_positions_are_clamped(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "walk", "c": "rome", "x": "x", "z": float("nan"), "yaw": 1e99, "s": -5})
        b.send({"t": "walk", "c": "mars", "x": 1, "z": 1})                               # not a city: ignored
        await asyncio.sleep(0.3)
        ca = [c for c in server.CONNS if c.id == a.welcome["id"]][0]
        self.assertEqual((ca.px, ca.pz), (0.0, 0.0))
        self.assertLessEqual(abs(ca.pyaw), 50)
        self.assertEqual(ca.pspd, 0)
        cb = [c for c in server.CONNS if c.id == b.welcome["id"]][0]
        self.assertIsNone(cb.city)

    # ---------------------------------------------------------------- chat and admin

    async def test_chat_reaches_everyone_is_cleaned_and_rate_limited(self):
        a = await self.player("Ann")
        b = await self.player("Ben")
        a.send({"t": "chat", "text": "  hello\x00 \n  friends  "})
        for w in (a, b):
            m = await w.until(lambda m: m["t"] == "chat" and not m.get("sys"))
            self.assertEqual((m["name"], m["text"], m["adm"]), ("Ann", "hello friends", 0))
        a.send({"t": "chat", "text": "x" * 500})
        long = await b.until(lambda m: m["t"] == "chat" and m["text"].startswith("xxx"))
        self.assertEqual(len(long["text"]), 140)
        a.send({"t": "chat", "text": "what the fuck"})
        masked = await b.until(lambda m: m["t"] == "chat" and m["text"].startswith("what"))
        self.assertNotIn("fuck", masked["text"])
        for i in range(8):                       # a flood is cut short
            a.send({"t": "chat", "text": "spam %d" % i})
        await asyncio.sleep(0.5)
        got = []
        while True:
            try:
                got.append(await b.until(lambda m: m["t"] == "chat", timeout=0.4))
            except asyncio.TimeoutError:
                break
        self.assertLess(len([g for g in got if g["text"].startswith("spam")]), 8)
        c = await self.player("Cyd")             # newcomers see what was said
        log = await c.until(lambda m: m["t"] == "chat_log")
        self.assertTrue(any(e["text"] == "hello friends" for e in log["m"]))

    async def test_whisper_goes_only_to_the_two_people(self):
        a, b, c = await self.player("Ann"), await self.player("Ben"), await self.player("Cyd")
        a.send({"t": "chat", "text": "/w ben psst"})
        got = await b.until(lambda m: m["t"] == "chat" and m.get("w"))
        self.assertEqual((got["name"], got["to"], got["text"]), ("Ann", "Ben", "psst"))
        await a.until(lambda m: m["t"] == "chat" and m.get("w"))
        with self.assertRaises(asyncio.TimeoutError):
            await c.until(lambda m: m["t"] == "chat" and m.get("w"), timeout=0.6)

    async def test_names_with_spaces_work_in_commands(self):
        a, b = await self.player("Ann"), await self.player("The OG")
        a.send({"t": "chat", "text": "/w The OG you have a space in your name"})
        got = await b.until(lambda m: m["t"] == "chat" and m.get("w"))
        self.assertEqual((got["to"], got["text"]), ("The OG", "you have a space in your name"))

    async def test_only_admins_can_mute_kick_and_announce(self):
        server.CFG["supabase_url"] = "https://example.supabase.co"

        async def fake_verify(token):
            return {"boss": "u-boss", "pal": "u-pal"}.get(token)

        async def fake_admin(token):
            return token == "boss"
        server.verify_token, server.is_admin = fake_verify, fake_admin
        boss, pal = await self.player("Boss", token="boss"), await self.player("Pal", token="pal")
        self.assertTrue(boss.welcome["admin"])
        self.assertFalse(pal.welcome["admin"])
        pal.send({"t": "chat", "text": "/kick boss"})                                  # not allowed
        refuse = await pal.until(lambda m: m["t"] == "chat" and m.get("sys"))
        self.assertIn("Unknown", refuse["text"])
        boss.send({"t": "chat", "text": "/say the games start soon"})
        ann = await pal.until(lambda m: m["t"] == "chat" and "Announcement" in m.get("text", ""))
        self.assertIn("games start soon", ann["text"])
        boss.send({"t": "chat", "text": "/mute pal 5"})
        await pal.until(lambda m: m["t"] == "chat" and "muted you" in m.get("text", ""))
        pal.send({"t": "chat", "text": "can anyone hear me"})
        again = await pal.until(lambda m: m["t"] == "chat" and m.get("sys") and "muted" in m["text"])
        self.assertTrue(again)
        boss.send({"t": "admin", "a": "who"})
        who = await boss.until(lambda m: m["t"] == "adminwho")
        self.assertEqual({w["name"] for w in who["who"]}, {"Boss", "Pal"})
        pal.send({"t": "admin", "a": "who"})                                           # the panel answers only to admins
        with self.assertRaises(asyncio.TimeoutError):
            await pal.until(lambda m: m["t"] == "adminwho", timeout=0.6)
        boss.send({"t": "chat", "text": "/kick pal"})
        self.assertTrue(await pal.closed())
        again = await WS.connect(self.port)                                              # kicked people are kept out for a while
        again.send({"t": "hello", "name": "Pal", "cls": "gladiator", "token": "pal", "look": {}})
        err = await again.until(lambda m: m["t"] == "error")
        self.assertEqual(err["code"], "kicked")


    # ---------------------------------------------------------------- ranked matches and friends

    def accounts(self, *names):
        server.CFG["supabase_url"] = "https://example.supabase.co"

        async def fake_verify(token):
            return ("u-" + token) if token in names else None
        server.verify_token = fake_verify

    async def test_every_duel_between_people_is_rated_and_bot_duels_are_not(self):
        self.accounts("ann", "bob", "cy")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob", token="bob")
        self.assertEqual(ann.welcome["rank"]["r"], 1000)
        ann.send({"t": "queue", "mode": "duel", "bot": True})
        bob.send({"t": "queue", "mode": "duel"})
        ma = await ann.until(lambda m: m["t"] == "match")
        await bob.until(lambda m: m["t"] == "match")
        self.assertTrue(ma["ranked"])
        self.assertIn("(1000)", ma["players"][0]["name"])
        bob.send({"t": "leave"})                                      # Bob gives up: Ann wins
        ea = await ann.until(lambda m: m["t"] == "end")
        self.assertEqual(ea["winner"], ma["you"])
        self.assertEqual(ea["rank"]["delta"], 20)                    # even match, new player: K=40, so +20
        self.assertEqual((ea["rank"]["r"], ea["rank"]["w"]), (1020, 1))
        rec = server.RATINGS["u-bob"]
        self.assertEqual((rec["r"], rec["l"]), (980, 1))
        ann.send({"t": "social", "a": "top"})
        top = await ann.until(lambda m: m["t"] == "top")
        self.assertEqual([x["name"] for x in top["list"]], ["Ann", "Bob"])
        cy = await self.player("Cy", token="cy")                      # a practice match against a bot changes nothing
        cy.send({"t": "queue", "mode": "duel", "bot": True})
        mc = await cy.until(lambda m: m["t"] == "match", timeout=4)
        self.assertFalse(mc["ranked"])
        cy.send({"t": "leave"})
        self.assertEqual(server.RATINGS["u-cy"]["r"], 1000)

    async def test_a_guest_can_duel_an_account_and_only_the_account_is_rated(self):
        self.accounts("ann")
        ann, guest = await self.player("Ann", token="ann"), await self.player("Guest")
        ann.send({"t": "queue", "mode": "duel"})
        guest.send({"t": "queue", "mode": "duel"})
        ma = await ann.until(lambda m: m["t"] == "match")
        await guest.until(lambda m: m["t"] == "match")
        guest.send({"t": "leave"})
        end = await ann.until(lambda m: m["t"] == "end")
        self.assertEqual(end["rank"]["delta"], 20)
        self.assertEqual(list(server.RATINGS), ["u-ann"])             # the guest has no saved rating

    def test_races_naval_battles_and_team_fights_change_ratings_too(self):
        class C:                                                      # a stand-in for a connection
            def __init__(self, uid, name):
                self.uid, self.id, self.name = uid, "id-" + name, name
        a, b, c, d = C("u-a", "A"), C("u-b", "B"), C("u-c", "C"), C("u-d", "D")
        r = server.rate_placements([(a, 0), (b, 1), (c, 2), (d, 3)])    # first, second, third and last of four
        self.assertGreater(r[id(a)]["delta"], 0)
        self.assertLess(r[id(d)]["delta"], 0)
        self.assertGreater(r[id(a)]["delta"], r[id(b)]["delta"])
        self.assertEqual((server.RATINGS["u-a"]["w"], server.RATINGS["u-d"]["l"], server.RATINGS["u-b"]["d"]), (1, 1, 1))   # first wins, last loses, the middle is neither
        self.assertEqual(sum(v["delta"] for v in r.values()), 0)         # points only move between people
        self.assertEqual(server.rate_placements([(a, 0)]), {})            # a match against nobody changes nothing
        server.RECENT.clear()
        t = server.rate_team([a, b], True)                                # a team win against the bots: +8
        self.assertEqual((t[id(a)]["delta"], t[id(b)]["delta"]), (8, 8))
        server.RECENT.clear()
        self.assertEqual(server.rate_team([a, b], False)[id(a)]["delta"], -6)
        self.assertEqual(server.rate_team([a], True), {})                 # nobody to team up with: nothing
        server.RECENT.clear()
        for _ in range(4):                                                # the same people over and over: no more points
            last = server.rate_placements([(a, 0), (b, 1)])
        self.assertEqual(last[id(a)]["delta"], 0)
        self.assertTrue(last[id(a)]["farm"])

    async def test_a_race_between_accounts_sends_the_new_rating(self):
        self.accounts("ann", "ben")
        server.RACE_COUNTDOWN, server.RACE_TOTAL, server.RACE_GRACE = 0.4, 100.0, 1.5
        a, b = await self.player("Ann", token="ann"), await self.player("Ben", token="ben")
        a.send({"t": "queue", "mode": "race"})
        b.send({"t": "queue", "mode": "race"})
        await a.until(lambda m: m["t"] == "match", timeout=4)
        await b.until(lambda m: m["t"] == "match", timeout=4)
        await asyncio.sleep(0.5)
        s = [0.0, 0.0]
        for _ in range(60):
            s[0] += 4.0
            s[1] += 2.5
            a.send({"t": "race", "s": s[0], "d": 5})
            b.send({"t": "race", "s": s[1], "d": -3})
            await asyncio.sleep(0.12)
            if s[0] >= 100.0:
                break
        ea = await a.until(lambda m: m["t"] == "end", timeout=30)
        eb = await b.until(lambda m: m["t"] == "end", timeout=30)
        self.assertEqual((ea["rank"]["delta"], eb["rank"]["delta"]), (20, -20))

    async def test_ranked_matches_similar_ratings_first(self):
        self.accounts("hi", "lo", "mid")
        hi = await self.player("Hi", token="hi")
        lo = await self.player("Lo", token="lo")
        server.RATINGS["u-hi"]["r"], server.RATINGS["u-lo"]["r"] = 1800, 800
        hi.send({"t": "queue", "mode": "duel"})
        lo.send({"t": "queue", "mode": "duel"})
        with self.assertRaises(asyncio.TimeoutError):                  # 1000 points apart: they must wait for the search to widen
            await hi.until(lambda m: m["t"] == "match", timeout=1.2)

    async def test_friend_requests_and_chats(self):
        self.accounts("ann", "bob", "cy")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob", token="bob")
        guest = await self.player("Guest")
        guest.send({"t": "social", "a": "req", "name": "Ann"})
        self.assertIn("Log in", (await guest.until(lambda m: m["t"] == "fr_msg"))["msg"])
        ann.send({"t": "social", "a": "online"})
        rows = (await ann.until(lambda m: m["t"] == "fr_online"))["list"]
        self.assertEqual([r["name"] for r in rows], ["Bob"])
        ann.send({"t": "social", "a": "req", "name": "bob"})
        asked = await bob.until(lambda m: m["t"] == "fr_in")
        self.assertEqual(asked["name"], "Ann")
        ann.send({"t": "social", "a": "dm", "to": bob.welcome and asked["fid"], "text": "hi before we are friends"})   # not friends yet
        self.assertIn("not friends", (await ann.until(lambda m: m["t"] == "fr_msg" and "friends" in m["msg"]))["msg"])
        bob.send({"t": "social", "a": "ans", "fid": asked["fid"], "ok": True})
        added_b = await bob.until(lambda m: m["t"] == "fr_added")
        added_a = await ann.until(lambda m: m["t"] == "fr_added")
        self.assertEqual((added_b["name"], added_a["name"]), ("Ann", "Bob"))
        ann.send({"t": "social", "a": "dm", "to": added_a["fid"], "text": "hello friend"})
        got = await bob.until(lambda m: m["t"] == "dm")
        self.assertEqual((got["name"], got["text"], got["from"]), ("Ann", "hello friend", asked["fid"]))
        echo = await ann.until(lambda m: m["t"] == "dm")
        self.assertEqual(echo["to"], added_a["fid"])
        # a message left for a friend who is away waits for them
        bob.w.close()
        await asyncio.sleep(0.3)
        ann.send({"t": "social", "a": "dm", "to": added_a["fid"], "text": "see you later"})
        await ann.until(lambda m: m["t"] == "dm")
        bob2 = await self.player("Bob", token="bob")
        state = await bob2.until(lambda m: m["t"] == "fr_state")
        self.assertEqual([f["name"] for f in state["friends"]], ["Ann"])
        mail = await bob2.until(lambda m: m["t"] == "dm")
        self.assertEqual(mail["text"], "see you later")
        # removing a friend ends the chat on both sides
        bob2.send({"t": "social", "a": "del", "fid": asked["fid"]})
        await ann.until(lambda m: m["t"] == "fr_removed")
        ann.send({"t": "social", "a": "dm", "to": added_a["fid"], "text": "still there?"})
        self.assertIn("not friends", (await ann.until(lambda m: m["t"] == "fr_msg" and "friends" in m["msg"]))["msg"])

    async def test_nobody_can_make_themselves_a_friend(self):
        self.accounts("ann", "mal")
        ann = await self.player("Ann", token="ann")
        fid_ann = server.fid_of("u-ann")
        mal = await WS.connect(self.port)
        self.clients.append(mal)
        mal.send({"t": "hello", "name": "Mal", "token": "mal", "look": {}, "friends": [{"fid": fid_ann, "name": "Ann"}]})   # claims Ann is a friend
        await mal.until(lambda m: m["t"] == "welcome")
        mal.send({"t": "social", "a": "dm", "to": fid_ann, "text": "hi bestie"})
        self.assertIn("not friends", (await mal.until(lambda m: m["t"] == "fr_msg" and "friends" in m["msg"]))["msg"])
        with self.assertRaises(asyncio.TimeoutError):
            await ann.until(lambda m: m["t"] == "dm", timeout=0.6)

    # ---------------------------------------------------------------- abuse

    async def test_abusive_connections_are_dropped(self):
        big = await self.player()
        big.send_raw(1, b"x" * 5000)
        self.assertTrue(await big.closed())
        unmasked = await self.player()
        unmasked.send_raw(1, b'{"t":"ping"}', mask=False)
        self.assertTrue(await unmasked.closed())
        flood = await self.player()
        for _ in range(400):
            flood.send({"t": "ping"})
        self.assertTrue(await flood.closed(timeout=4))
        junk = await self.player()
        junk.send_raw(1, b"not json at all")
        junk.send({"t": "ping"})
        self.assertEqual((await junk.until(lambda m: m["t"] == "pong"))["t"], "pong")   # junk is ignored, the connection survives

    async def test_too_many_connections_from_one_address(self):
        server.CFG["max_per_ip"] = 3
        for _ in range(3):
            self.assertEqual((await WS.connect(self.port)).status, 101)
        self.assertEqual((await WS.connect(self.port)).status, 503)


if __name__ == "__main__":
    unittest.main(verbosity=2)
