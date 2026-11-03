#!/usr/bin/env python3
"""Tests for server.py. Run:  python3 server/test_server.py
Plays the part of real browsers (WebSocket clients), including cheating and abusive ones."""
import asyncio
import base64
import datetime
import hashlib
import json
import math
import os
import struct
import sys
import time
import urllib.parse
import unittest
from unittest import mock
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

    # ---------------------------------------------------------------- the admin's visitor log, suspicious activity and blocking

    async def test_visitors_are_logged_and_an_admin_can_block_someone_on_the_spot(self):
        vid_a, vid_b = "a" * 32, "b" * 32
        server.VISITS.clear(); server.EVENTS.clear(); server.BLOCKED.clear(); server.FLAG_GAP.clear()
        # the page says someone came
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(("GET /visit?v=%s&n=Ann HTTP/1.1\r\nHost: x\r\nUser-Agent: Mozilla/5.0 (Macintosh) Chrome/120 Safari/537\r\nX-Forwarded-For: 203.0.113.9\r\n\r\n" % vid_a).encode())
        self.assertIn("204", (await r.read()).decode())
        self.assertEqual(server.VISITS[vid_a]["name"], "Ann")
        self.assertIn("Chrome on Mac", server.VISITS[vid_a]["ua"])
        # two players connect; Bea is not an admin
        ann = await WS.connect(self.port); self.clients.append(ann)
        ann.send({"t": "hello", "name": "Ann", "cls": "gladiator", "look": {}, "vid": vid_a})
        ann.welcome = await ann.until(lambda m: m["t"] == "welcome")
        bea = await WS.connect(self.port); self.clients.append(bea)
        bea.send({"t": "hello", "name": "Bea", "cls": "gladiator", "look": {}, "vid": vid_b})
        bea.welcome = await bea.until(lambda m: m["t"] == "welcome")
        self.assertEqual(server.VISITS[vid_b]["plays"], 1)
        # someone who is not an admin tries an admin command: it is logged as serious
        bea.send({"t": "admin", "a": "visits"})
        await asyncio.sleep(0.3)
        self.assertTrue(any(e["kind"] == "tried an admin command" and e["level"] == "high" for e in server.EVENTS))
        # Ann is made an admin (as the database would); she sees the log and blocks Bea
        next(c for c in server.CONNS if c.id == ann.welcome["id"]).admin = True
        ann.send({"t": "admin", "a": "visits"})
        v = await ann.until(lambda m: m["t"] == "adminvisits")
        self.assertEqual({x["vid"] for x in v["v"]}, {vid_a, vid_b})
        ann.send({"t": "admin", "a": "events"})
        ev = await ann.until(lambda m: m["t"] == "adminevents")
        self.assertTrue(ev["e"])
        ann.send({"t": "admin", "a": "give", "id": bea.welcome["id"], "n": 777})
        gift = await bea.until(lambda m: m["t"] == "fr_gift")
        self.assertEqual((gift["n"], gift["name"]), (777, "Ann (admin)"))                 # an admin can hand a player some denarii
        ann.send({"t": "admin", "a": "block", "vid": vid_b[:8]})
        gone = await bea.until(lambda m: m["t"] == "kicked")
        self.assertTrue(gone["blocked"])                                               # Bea is thrown out at once
        await asyncio.sleep(0.3)
        self.assertNotIn(bea.welcome["id"], [c.id for c in server.CONNS])
        # she cannot come back, even under another name
        bea2 = await WS.connect(self.port); self.clients.append(bea2)
        bea2.send({"t": "hello", "name": "Cleo", "cls": "gladiator", "look": {}, "vid": vid_b})
        err = await bea2.until(lambda m: m["t"] == "error" and m.get("code") == "kicked")
        self.assertTrue(err)
        # admins cannot be blocked, and unblocking lets her back in
        ann.send({"t": "admin", "a": "unblock", "vid": vid_b})
        await asyncio.sleep(0.3)
        self.assertFalse(server.BLOCKED.get(vid_b))

    async def test_user_journey_is_recorded_and_only_admins_can_read_it(self):
        vid = "c" * 32
        server.JOURNEYS.clear(); server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear(); server.JOURNEY_HITS.clear()
        ev = json.dumps([[0, "arrive", "rome modern"], [5, "play", "demo"], [40, "city", "delhi"], [41, "hack", "x"], [90, "buy", "Boeing 737 MAX <script>"], [95, "chat", "no"]])
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(("GET /journey?v=%s&s=%s&n=Ann&e=%s HTTP/1.1\r\nHost: x\r\nUser-Agent: Mozilla/5.0 (Macintosh) Chrome/120 Safari/537\r\n\r\n" % (vid, "d" * 16, urllib.parse.quote(ev))).encode())
        self.assertIn("204", (await r.read()).decode())
        ses = server.JOURNEYS[vid]["sessions"][0]
        self.assertEqual([e[1] for e in ses["events"]], ["arrive", "play", "city", "buy"])           # unknown kinds are dropped
        self.assertNotIn("<", ses["events"][3][2])                                                   # and odd characters are stripped
        # a second batch for the same visit joins the same list; a new visit starts a new one
        server.note_journey(vid, "d" * 16, None, "", [[120, "left", ""]])
        server.note_journey(vid, "e" * 16, None, "", [[0, "arrive", "rome modern"]])
        self.assertEqual([len(x["events"]) for x in server.JOURNEYS[vid]["sessions"]], [5, 1])
        # garbage is ignored
        self.assertEqual(server.note_journey("zz", "d" * 16, None, "", [[0, "arrive", ""]]), 0)
        # the admin reads it; someone who is not an admin only gets their attempt logged
        ann = await WS.connect(self.port); self.clients.append(ann)
        ann.send({"t": "hello", "name": "Ann", "cls": "gladiator", "look": {}, "vid": vid})
        ann.welcome = await ann.until(lambda m: m["t"] == "welcome")
        ann.send({"t": "admin", "a": "journey"})
        await asyncio.sleep(0.3)
        self.assertTrue(any(e["kind"] == "tried an admin command" for e in server.EVENTS))
        next(c for c in server.CONNS if c.id == ann.welcome["id"]).admin = True
        ann.send({"t": "admin", "a": "journey"})
        lst = await ann.until(lambda m: m["t"] == "adminjourney" and "list" in m)
        self.assertEqual((lst["list"][0]["vid"], lst["list"][0]["sessions"], lst["list"][0]["events"]), (vid, 2, 6))
        ann.send({"t": "admin", "a": "journey", "vid": vid[:8]})
        one = await ann.until(lambda m: m["t"] == "adminjourney" and "sessions" in m)
        self.assertEqual(len(one["sessions"]), 2)
        self.assertEqual(one["sessions"][0]["sid"], "e" * 16)                                          # newest visit first

    async def test_an_admin_can_kick_and_block_an_account_from_the_users_list(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.BLOCKED.clear(); server.FLAG_GAP.clear(); server.USER_EMAIL.clear()
        uid_b = "12345678-1234-1234-1234-123456789abc"
        ann = await WS.connect(self.port); self.clients.append(ann)
        ann.send({"t": "hello", "name": "Ann", "cls": "gladiator", "look": {}, "vid": "a" * 32})
        ann.welcome = await ann.until(lambda m: m["t"] == "welcome")
        bea = await WS.connect(self.port); self.clients.append(bea)
        bea.send({"t": "hello", "name": "Bea", "cls": "gladiator", "look": {}, "vid": "b" * 32})
        bea.welcome = await bea.until(lambda m: m["t"] == "welcome")
        cb = next(c for c in server.CONNS if c.id == bea.welcome["id"])
        cb.uid = uid_b; server.USER_EMAIL[uid_b] = "bea@example.com"                 # as if she had logged in
        next(c for c in server.CONNS if c.id == ann.welcome["id"]).admin = True
        # offline accounts cannot be kicked; online ones can, found by email
        ann.send({"t": "admin", "a": "kickacct", "email": "nobody@example.com"})
        self.assertIn("not in the game", (await ann.until(lambda m: m["t"] == "chat" or m["t"] == "say" or "text" in m)).get("text", ""))
        ann.send({"t": "admin", "a": "kickacct", "email": "BEA@example.com"})
        gone = await bea.until(lambda m: m["t"] == "kicked")
        self.assertFalse(gone.get("blocked"))
        await asyncio.sleep(0.3)
        self.assertNotIn(cb, server.CONNS)
        # blocking by account id (from the database) works even when she is not connected, and the list says so
        ann.send({"t": "admin", "a": "blockacct", "email": "bea@example.com", "uid": uid_b})
        await asyncio.sleep(0.3)
        self.assertGreater(server.BLOCKED.get(uid_b, 0), server.now())
        ann.send({"t": "admin", "a": "who"})
        who = await ann.until(lambda m: m["t"] == "adminwho")
        self.assertEqual((who["blocked_uids"], who["blocked_emails"]), ([uid_b], ["bea@example.com"]))
        ann.send({"t": "admin", "a": "unblockacct", "email": "bea@example.com", "uid": uid_b})
        await asyncio.sleep(0.3)
        self.assertFalse(server.BLOCKED.get(uid_b))

    async def test_passengers_ride_along_cannot_drive_and_are_put_out(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear()
        async def player(name):
            c = await WS.connect(self.port); self.clients.append(c)
            c.send({"t": "hello", "name": name, "cls": "gladiator", "look": {}})
            c.welcome = await c.until(lambda m: m["t"] == "welcome")
            return c
        drv, pas, bys = await player("Dora"), await player("Pia"), await player("Bo")
        for c, x, v in ((drv, 100, "citycar"), (pas, 104, None), (bys, 110, None)):
            c.send({"t": "walk", "c": "rome", "x": x, "z": 50, "yaw": 0.5, "s": 0, **({"v": v} if v else {})})
        await asyncio.sleep(0.3)
        # Pia climbs in: she is told, and so is Dora
        pas.send({"t": "board", "id": drv.welcome["id"]})
        ride = await pas.until(lambda m: m["t"] == "ride")
        self.assertEqual((ride["on"], ride["name"], ride["veh"], ride["seat"]), (True, "Dora", "citycar", 0))
        self.assertIn("Pia got in", (await drv.until(lambda m: m["t"] == "ridenote"))["text"])
        # the driver moves; the passenger goes with them, sees the driver in the world, and nobody else sees the passenger
        drv.send({"t": "walk", "c": "rome", "x": 160, "z": 60, "yaw": 1.0, "s": 12, "v": "citycar"})
        pas.send({"t": "walk", "c": "rome", "x": 999, "z": 999, "yaw": 0, "s": 0})                  # a passenger's own position is ignored
        await asyncio.sleep(0.6)
        seen_by_pia = await pas.until(lambda m: m["t"] == "world" and any(o[0] == drv.welcome["id"] for o in m["p"]))   # Pia still sees Dora's car in the world
        self.assertTrue(seen_by_pia)
        await bys.until(lambda m: m["t"] == "world" and pas.welcome["id"] in m["g"])                   # Pia disappears from Bo's world (she is inside the car)
        bo_saw = []
        end = time.monotonic() + 1.0
        while time.monotonic() < end:
            try:
                m = await bys.recv(0.3)
            except asyncio.TimeoutError:
                continue
            if m and m["t"] == "world":
                bo_saw += [o[0] for o in m["p"]]
        self.assertNotIn(pas.welcome["id"], bo_saw)                                                    # and Bo never sees her again
        cp = next(c for c in server.CONNS if c.id == pas.welcome["id"])
        self.assertEqual((round(cp.px), round(cp.pz)), (160, 60))
        # cannot get out while it is moving, and a full vehicle has no room (a city car seats three)
        pas.send({"t": "unboard"})
        self.assertIn("stopped", (await pas.until(lambda m: m["t"] == "chat"))["text"])
        # a second walker far away cannot board
        bys.send({"t": "board", "id": drv.welcome["id"]})
        self.assertIn("next to the vehicle", (await bys.until(lambda m: m["t"] == "chat"))["text"])
        # it stops: Pia gets out beside it
        drv.send({"t": "walk", "c": "rome", "x": 160, "z": 60, "yaw": 1.0, "s": 0, "v": "citycar"})
        await asyncio.sleep(0.2)
        pas.send({"t": "unboard"})
        out = await pas.until(lambda m: m["t"] == "ride" and not m["on"])
        self.assertEqual((out["x"], out["z"]), (160.0, 60.0))
        self.assertIsNone(cp.ride)
        # she climbs in again; when the driver gets out of the vehicle everyone is put out
        pas.send({"t": "walk", "c": "rome", "x": 162, "z": 60, "yaw": 0, "s": 0})
        await asyncio.sleep(0.2)
        pas.send({"t": "board", "id": drv.welcome["id"]})
        await pas.until(lambda m: m["t"] == "ride" and m["on"])
        drv.send({"t": "walk", "c": "rome", "x": 160, "z": 60, "yaw": 1.0, "s": 0})                   # no vehicle any more
        gone = await pas.until(lambda m: m["t"] == "ride" and not m["on"])
        self.assertIn("driver got out", gone["why"])

    async def test_emotes_reach_the_players_nearby_only_and_not_too_often(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear()
        async def player(name):
            c = await WS.connect(self.port); self.clients.append(c)
            c.send({"t": "hello", "name": name, "cls": "gladiator", "look": {}}); c.welcome = await c.until(lambda m: m["t"] == "welcome")
            return c
        ann, bea, far = await player("Ann"), await player("Bea"), await player("Far")
        for c, x in ((ann, 0), (bea, 20), (far, 900)):
            c.send({"t": "walk", "c": "rome", "x": x, "z": 0, "yaw": 0, "s": 0})
        await asyncio.sleep(0.3)
        ann.send({"t": "emote", "e": "dance"})
        got = await bea.until(lambda m: m["t"] == "emote")
        self.assertEqual((got["id"], got["e"]), (ann.welcome["id"], "dance"))
        ann.send({"t": "emote", "e": "wave"}); ann.send({"t": "emote", "e": "hack"})                   # too soon, and not an emote
        await asyncio.sleep(0.4)
        self.assertEqual(ann.welcome["id"], got["id"])
        try:
            extra = await bea.until(lambda m: m["t"] == "emote", timeout=0.6)
        except (asyncio.TimeoutError, AssertionError):
            extra = None
        self.assertIsNone(extra)
        try:
            seen_far = await far.until(lambda m: m["t"] == "emote", timeout=0.6)
        except (asyncio.TimeoutError, AssertionError):
            seen_far = None
        self.assertIsNone(seen_far)

    async def test_a_big_aircraft_can_be_boarded_from_its_wing(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear()
        self.assertGreater(server.board_range("a380"), server.board_range("citycar"))
        drv = await WS.connect(self.port); self.clients.append(drv)
        drv.send({"t": "hello", "name": "Pilot", "cls": "gladiator", "look": {}}); drv.welcome = await drv.until(lambda m: m["t"] == "welcome")
        pas = await WS.connect(self.port); self.clients.append(pas)
        pas.send({"t": "hello", "name": "Guest", "cls": "gladiator", "look": {}}); pas.welcome = await pas.until(lambda m: m["t"] == "welcome")
        drv.send({"t": "walk", "c": "rome", "x": 100, "z": 50, "yaw": 0, "s": 0, "v": "a380"})
        pas.send({"t": "walk", "c": "rome", "x": 100, "z": 76, "yaw": 0, "s": 0})                    # 26 m from the middle of an A380: next to its wing
        await asyncio.sleep(0.3)
        pas.send({"t": "board", "id": drv.welcome["id"]})
        ride = await pas.until(lambda m: m["t"] == "ride")
        self.assertTrue(ride["on"])

    async def test_a_teleport_the_game_reports_is_not_flagged_but_a_silent_jump_is(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear()
        ann = await WS.connect(self.port); self.clients.append(ann)
        ann.send({"t": "hello", "name": "Ann", "cls": "gladiator", "look": {}, "vid": "a" * 32}); ann.welcome = await ann.until(lambda m: m["t"] == "welcome")
        ann.send({"t": "walk", "c": "rome", "x": 0, "z": 0, "yaw": 0, "s": 0})
        await asyncio.sleep(0.2)
        ann.send({"t": "walk", "c": "rome", "x": 400, "z": 0, "yaw": 0, "s": 0, "tp": 1})              # the Go there button
        await asyncio.sleep(0.3)
        self.assertFalse(any(e["kind"] == "jumped across the city" for e in server.EVENTS))
        ann.send({"t": "walk", "c": "rome", "x": -400, "z": 0, "yaw": 0, "s": 0})                      # a jump nobody reported
        await asyncio.sleep(0.3)
        self.assertTrue(any(e["kind"] == "jumped across the city" for e in server.EVENTS))

    async def test_admin_chat_log_player_reports_and_big_money_jumps(self):
        server.VISITS.clear(); server.EVENTS.clear(); server.FLAG_GAP.clear(); server.ADMIN_CHAT.clear()
        async def player(name, vid):
            c = await WS.connect(self.port); self.clients.append(c)
            c.send({"t": "hello", "name": name, "cls": "gladiator", "look": {}, "vid": vid}); c.welcome = await c.until(lambda m: m["t"] == "welcome")
            return c
        ann, bea = await player("Ann", "a" * 32), await player("Bea", "b" * 32)
        next(c for c in server.CONNS if c.id == ann.welcome["id"]).admin = True
        # the chat log has public messages, with who sent them, and no whispers
        bea.send({"t": "chat", "text": "hello everyone"}); await asyncio.sleep(0.2)
        bea.send({"t": "chat", "text": "/w Ann a secret"}); await asyncio.sleep(0.2)
        ann.send({"t": "admin", "a": "chatlog"})
        log = await ann.until(lambda m: m["t"] == "adminchat")
        self.assertEqual([(e["name"], e["text"]) for e in log["m"]], [("Bea", "hello everyone")])
        self.assertEqual(log["m"][0]["vid"], "b" * 8)
        # a player reports another: it appears in the suspicious list, and reports are limited
        ann.send({"t": "chat", "text": "/report Bea was rude in chat"}); await asyncio.sleep(0.3)
        ev = [e for e in server.EVENTS if e["kind"] == "reported by a player"]
        self.assertEqual((len(ev), ev[0]["who"]), (1, "Bea"))
        self.assertIn("Ann reported Bea", ev[0]["detail"])
        # a sudden pile of denarii is flagged, unless the server itself gave it
        bea.send({"t": "walk", "c": "rome", "x": 5, "z": 5, "yaw": 0, "s": 0, "d": 100}); await asyncio.sleep(0.1)
        bea.send({"t": "walk", "c": "rome", "x": 5, "z": 5, "yaw": 0, "s": 0, "d": 9000}); await asyncio.sleep(0.3)
        self.assertTrue(any(e["kind"] == "big jump in denarii" for e in server.EVENTS))
        server.EVENTS.clear(); server.FLAG_GAP.clear()
        cb = next(c for c in server.CONNS if c.id == bea.welcome["id"])
        cb.coin_hist = [(server.now(), 9000)]
        cb.coin_credit = [(server.now(), 8000)]
        bea.send({"t": "walk", "c": "rome", "x": 5, "z": 5, "yaw": 0, "s": 0, "d": 17000}); await asyncio.sleep(0.3)
        self.assertFalse(any(e["kind"] == "big jump in denarii" for e in server.EVENTS))

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


    # ---------------------------------------------------------------- challenging someone who is online

    async def test_challenge_list_shows_the_others_online(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "challenge", "a": "list"})
        m = await a.until(lambda m: m["t"] == "chal" and m["a"] == "list")
        self.assertEqual([p["name"] for p in m["list"]], ["Ben"])
        self.assertEqual(m["list"][0]["busy"], 0)

    async def test_challenge_accepted_starts_a_ranked_duel(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "challenge", "a": "list"})
        lst = await a.until(lambda m: m["t"] == "chal" and m["a"] == "list")
        a.send({"t": "challenge", "a": "send", "id": lst["list"][0]["id"]})
        inc = await b.until(lambda m: m["t"] == "chal" and m["a"] == "in")
        self.assertEqual(inc["name"], "Ann")
        await a.until(lambda m: m["t"] == "chal" and m["a"] == "sent")
        b.send({"t": "challenge", "a": "accept", "from": inc["from"]})
        ma = await a.until(lambda m: m["t"] == "match")
        mb = await b.until(lambda m: m["t"] == "match")
        self.assertEqual((ma["mode"], ma["ranked"], mb["mode"]), ("duel", True, "duel"))
        self.assertEqual(sorted(p["name"].split(" ")[0] for p in ma["players"]), ["Ann", "Ben"])

    async def test_challenge_lets_the_challenger_pick_the_game(self):
        for game, mode in (("kushti", "kushti"), ("kites", "kites"), ("ball", "ball"), ("derby", "derby"), ("brawl", "brawl"), ("wushu", "wushu"), ("nonsense", "duel")):
            a, b = await self.player("Ann"), await self.player("Ben")
            ben = next(c for c in server.CONNS if c.name == "Ben")
            a.send({"t": "challenge", "a": "send", "id": ben.id, "game": game})
            inc = await b.until(lambda m: m["t"] == "chal" and m["a"] == "in")
            self.assertEqual(inc["game"], "duel" if game == "nonsense" else game)
            b.send({"t": "challenge", "a": "accept", "from": inc["from"]})
            ma = await a.until(lambda m: m["t"] == "match", timeout=4)
            self.assertEqual(ma["mode"], mode)
            for c in list(server.CONNS):
                if c.room:
                    c.room.task.cancel()
                c.close()
            server.CONNS.clear()
            await asyncio.sleep(0.2)

    async def test_challenge_declined_tells_the_challenger(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "challenge", "a": "send", "id": next(c.id for c in server.CONNS if c.name == "Ben")})
        inc = await b.until(lambda m: m["t"] == "chal" and m["a"] == "in")
        b.send({"t": "challenge", "a": "decline", "from": inc["from"]})
        no = await a.until(lambda m: m["t"] == "chal" and m["a"] == "declined")
        self.assertEqual(no["name"], "Ben")
        b.send({"t": "challenge", "a": "accept", "from": inc["from"]})        # too late: it is gone
        late = await b.until(lambda m: m["t"] == "chal" and m["a"] == "no")
        self.assertIn("run out", late["msg"])

    async def test_challenge_cannot_target_yourself_or_someone_busy(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        ann = next(c for c in server.CONNS if c.name == "Ann")
        ben = next(c for c in server.CONNS if c.name == "Ben")
        a.send({"t": "challenge", "a": "send", "id": ann.id})
        self.assertEqual((await a.until(lambda m: m["t"] == "chal"))["a"], "no")
        ben.room = object()                                # Ben is in a game
        a.send({"t": "challenge", "a": "send", "id": ben.id})
        m = await a.until(lambda m: m["t"] == "chal")
        self.assertEqual((m["a"], m["msg"]), ("no", "They are not free right now."))
        ben.room = None

    async def test_challenge_cannot_be_spammed(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        ben = next(c for c in server.CONNS if c.name == "Ben")
        a.send({"t": "challenge", "a": "send", "id": ben.id})
        await a.until(lambda m: m["t"] == "chal" and m["a"] == "sent")
        a.send({"t": "challenge", "a": "send", "id": ben.id})
        m = await a.until(lambda m: m["t"] == "chal" and m["a"] == "no")
        self.assertIn("Wait", m["msg"])

    async def test_challenge_goes_away_when_the_challenger_leaves(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "challenge", "a": "send", "id": next(c.id for c in server.CONNS if c.name == "Ben")})
        inc = await b.until(lambda m: m["t"] == "chal" and m["a"] == "in")
        a.w.close()
        await asyncio.sleep(0.4)
        b.send({"t": "challenge", "a": "accept", "from": inc["from"]})
        no = await b.until(lambda m: m["t"] == "chal" and m["a"] == "no")
        self.assertTrue(no["msg"])

    # ---------------------------------------------------------------- city games: kushti, kite fight, ball game

    async def start_mini(self, kind, bots=False):
        server.CFG["bot_wait"] = 0.5
        if bots:
            ws = [await self.player("Ann")]
            ws[0].send({"t": "queue", "mode": kind, "bot": True})
        else:
            ws = [await self.player("Ann"), await self.player("Ben")]
            for w in ws:
                w.send({"t": "queue", "mode": kind})
        ms = [await w.until(lambda m: m["t"] == "match", timeout=4) for w in ws]
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        return ws, ms, room

    async def test_kushti_more_presses_win_the_throw_and_two_throws_win_the_bout(self):
        ws, ms, room = await self.start_mini("kushti")
        self.assertEqual((ms[0]["mode"], ms[0]["ranked"]), ("kushti", True))
        for rnd in range(2):
            room.pt = 0.0
            room.step(0.2)                                    # ready -> mash
            self.assertEqual(room.phase, "mash")
            for _ in range(5):
                ws[0].send({"t": "press"})
            for _ in range(2):
                ws[1].send({"t": "press"})
            await asyncio.sleep(0.2)
            room.pt = 0.0
            room.step(0.2)                                    # mash -> rest, Ann takes the throw
            self.assertEqual(room.players[0].score, rnd + 1)
            room.pt = 0.0
            room.step(0.2)
        end = await ws[1].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["reason"]), ("kushti", 0, "throws"))
        self.assertIn("rank", end)

    async def test_kushti_a_draw_replays_and_presses_are_rate_limited(self):
        ws, ms, room = await self.start_mini("kushti")
        room.pt = 0.0
        room.step(0.2)
        for _ in range(60):
            ws[0].send({"t": "press"})                        # a macro pressing far too fast
        await asyncio.sleep(0.4)
        self.assertLess(room.c[0], 15)
        room.c = [4, 4]
        room.pt = 0.0
        room.step(0.2)
        self.assertEqual([p.score for p in room.players], [0, 0])

    async def test_kites_pulling_in_range_cuts_the_other_string(self):
        ws, ms, room = await self.start_mini("kites")
        a, b = room.players
        a.x, a.y, b.x, b.y = 50.0, 30.0, 53.0, 31.0
        a.pull_until = time.monotonic() + 5
        for _ in range(30):
            room.step(0.1)
        self.assertLess(b.string, 90.0)
        self.assertEqual(a.string, 100.0)                     # the one who did not pull is not hurt... and the puller is safe
        b.pull_until = time.monotonic() + 5
        a.string = b.string = 100.0
        for _ in range(10):
            room.step(0.1)
        self.assertLess(a.string, 100.0)                      # pulling against each other frays both
        self.assertLess(b.string, 100.0)

    async def test_kites_too_far_apart_nothing_happens_and_a_cut_string_loses(self):
        ws, ms, room = await self.start_mini("kites")
        a, b = room.players
        a.x, b.x = 10.0, 90.0
        a.pull_until = time.monotonic() + 5
        room.step(0.1)
        self.assertEqual(b.string, 100.0)
        a.x, a.y, b.x, b.y = 50.0, 30.0, 52.0, 30.0
        b.string = 2.0
        room.step(0.1)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["reason"]), ("kites", 0, "cut"))

    async def test_kite_moves_are_speed_limited(self):
        ws, ms, room = await self.start_mini("kites")
        a = room.players[0]
        a.last_t = time.monotonic() - 0.1
        ws[0].send({"t": "kite", "x": 98, "y": 56})
        await asyncio.sleep(0.2)
        self.assertLess(a.x, 40.0)

    async def test_ball_ground_ring_and_first_to_five(self):
        ws, ms, room = await self.start_mini("ball")
        a, b = room.players
        room.hold = 0.0
        room.b, room.v = [0.0, 0.4, 10.0], [0.0, -10.0, 0.0]            # lands on the south half (Ben's): Ann scores 1
        room.step(0.05)
        self.assertEqual((a.score, b.score), (1, 0))
        room.hold = 0.0
        room.last = 1                                                   # an inch outside the ring is only a bounce
        room.b, room.v = [14.6, 6.4, 4.0], [20.0, 0.0, 0.0]
        room.step(0.05)
        self.assertEqual((a.score, b.score), (1, 0))
        self.assertLess(room.v[0], 0.0)
        self.assertFalse(room.over)
        a.score = 4
        room.hold = 0.0
        room.b, room.v = [0.0, 0.4, 10.0], [0.0, -10.0, 0.0]
        room.step(0.05)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["score"]), ("ball", 0, [5, 0]))

    async def test_ball_through_the_ring_wins_the_whole_match_at_once(self):
        ws, ms, room = await self.start_mini("ball")
        a, b = room.players
        room.hold = 0.0
        room.last = 1                                                   # Ben hit it last and it flies through the ring on the left wall
        room.b, room.v = [14.6, 6.4, 0.0], [20.0, 0.0, 0.0]
        room.step(0.05)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["reason"]), ("ball", 1, "ring"))

    async def test_ball_hits_need_you_near_and_go_where_you_face(self):
        ws, ms, room = await self.start_mini("ball")
        a, b = room.players
        a.x, a.z, a.yaw = 0.0, -10.0, math.pi                          # Ann faces south, towards Ben's half
        room.hold = 0.0
        room.b, room.v = [10.0, 1.0, -10.0], [0.0, 0.0, 0.0]            # ten metres away: nothing happens
        ws[0].send({"t": "hit"})
        await asyncio.sleep(0.2)
        self.assertEqual(room.v, [0.0, 0.0, 0.0])
        room.b = [0.5, 1.0, -9.0]
        ws[0].send({"t": "hit"})
        await asyncio.sleep(0.2)
        self.assertGreater(room.v[2], 5.0)                              # towards the south
        self.assertGreater(room.v[1], 5.0)                              # and up
        self.assertEqual(room.last, 0)

    async def test_ball_players_stay_on_their_own_half_and_inside_the_court(self):
        ws, ms, room = await self.start_mini("ball")
        a = room.players[0]
        a.last_t = time.monotonic() - 5.0
        ws[0].send({"t": "pos", "x": 40.0, "z": 30.0, "yaw": 0})
        await asyncio.sleep(0.2)
        self.assertLessEqual(a.x, 12.5)
        self.assertLessEqual(a.z, -0.8)

    async def test_practice_game_starts_straight_away_against_a_bot(self):
        server.CFG["bot_wait"] = 30.0                        # (so a normal queue would wait a long time)
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "ball", "bot": True, "practice": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=2)
        self.assertEqual((m["mode"], len(m["players"]), m["ranked"]), ("ball", 2, False))
        self.assertTrue(m["players"][1]["name"].endswith("(practice bot)"))

    async def test_city_game_with_bots_and_leaving(self):
        ws, ms, room = await self.start_mini("ball", bots=True)
        self.assertEqual((len(ms[0]["players"]), ms[0]["ranked"]), (2, False))
        room.hold = 0.0
        room.b, room.v = [3.0, 1.2, 8.0], [0.0, 0.0, 0.0]
        bot = room.players[1]
        for _ in range(12):
            room.step(0.05)
        self.assertLess(math.hypot(bot.x - 3.0, bot.z - 8.0), 6.0)       # the bot ran at the ball
        ws[0].w.close()
        await asyncio.sleep(0.4)
        self.assertTrue(room.over)

    # ---------------------------------------------------------------- the world key

    def test_a_key_pasted_with_a_line_break_is_cleaned_up(self):
        saved = os.environ.get("SUPABASE_SERVICE_KEY")
        os.environ["SUPABASE_SERVICE_KEY"] = "  sb_secret_abc\ndefghijk \n"
        try:
            self.assertEqual(server.load_config()["service_key"], "sb_secret_abcdefghijk")
        finally:
            if saved is None:
                del os.environ["SUPABASE_SERVICE_KEY"]
            else:
                os.environ["SUPABASE_SERVICE_KEY"] = saved

    def test_a_service_key_copied_with_dots_is_refused_and_explained(self):
        saved = dict(server.CFG)
        try:
            server.CFG.update(supabase_url="https://x.supabase.co", service_key="sb_secret_abc\u2022\u2022\u2022\u2022")
            server._world_err[0] = ""
            self.assertFalse(server.world_on())
            self.assertIn("copy the whole key again", server._world_err[0])
            server.CFG["service_key"] = "sb_secret_abc\ndefghijk"                 # a line break in the middle (copied across two lines)
            self.assertFalse(server.world_on())
            server.CFG["service_key"] = "sb_secret_abcdefghijk"
            self.assertTrue(server.world_on())
            # an error message that contains the key never reaches the health page
            err = ValueError("Invalid header value b'sb_secret_abcdefghijk'")
            self.assertNotIn("abcdefghijk", server.safe_err(err))
            self.assertEqual(server.safe_err(urllib.error.HTTPError("u", 401, "x", {}, None)), "HTTP 401")
        finally:
            server.CFG.clear()
            server.CFG.update(saved)
            server._world_err[0] = ""

    # ---------------------------------------------------------------- the pyramid is kept

    async def test_pyramid_a_fresh_server_takes_what_a_browser_remembers_once(self):
        server.PYRAMID.update({"blocks": 0, "done": 0, "who": {}})
        server.PYR_CLAIMED[0] = False
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "pyr_get", "blocks": 37, "done": 2})
        v = await a.until(lambda m: m["t"] == "pyr")
        self.assertEqual((v["blocks"], v["done"]), (37, 2))
        b.send({"t": "pyr_get", "blocks": 99999, "done": 99})          # a second claim changes nothing
        v = await b.until(lambda m: m["t"] == "pyr")
        self.assertEqual((v["blocks"], v["done"]), (37, 2))

    async def test_pyramid_saved_progress_is_never_overwritten_by_a_browser(self):
        server.PYRAMID.update({"blocks": 12, "done": 1, "who": {"Ann": 12}})
        server.PYR_CLAIMED[0] = False
        a = await self.player("Ann")
        a.send({"t": "pyr_get", "blocks": 3, "done": 0})
        v = await a.until(lambda m: m["t"] == "pyr")
        self.assertEqual((v["blocks"], v["done"]), (12, 1))
        server.PYRAMID.update({"blocks": 0, "done": 0, "who": {}})

    # ---------------------------------------------------------------- the weekly cup

    def weekly_fresh(self):
        server.WEEKLY.update({"week": server.week_of(time.time()), "scores": {}, "last": None})
        server.PRIZES.clear()
        self.addCleanup(lambda: (server.WEEKLY.update({"week": -1, "scores": {}, "last": None}), server.PRIZES.clear()))

    class WC:                                                          # a stand-in for a connection with an account
        def __init__(self, fid, name):
            self.fid, self.name, self.uid, self.id = fid, name, "u-" + name, "id-" + name

    def test_weekly_weeks_start_on_monday_and_themes_rotate(self):
        mon = datetime.datetime(2026, 11, 2, tzinfo=datetime.timezone.utc).timestamp()
        self.assertEqual(server.week_of(mon), server.week_of(mon + 6.9 * 86400))     # all of Monday to Sunday is one week
        self.assertEqual(server.week_of(mon + 7 * 86400), server.week_of(mon) + 1)
        self.assertEqual(server.week_of(mon - 1), server.week_of(mon) - 1)           # one second before Monday is last week
        names = [server.week_theme(w)["name"] for w in range(len(server.WEEK_THEMES))]
        self.assertEqual(len(set(names)), len(server.WEEK_THEMES))
        self.assertEqual(server.week_theme(0), server.week_theme(len(server.WEEK_THEMES)))

    def test_weekly_points_wins_featured_games_and_guests(self):
        self.weekly_fresh()
        th = server.week_theme(server.WEEKLY["week"])
        feat = th["kinds"][0] if th["kinds"] else None
        other = next(k for k in server.KIND_NAMES if k not in th["kinds"])
        a, b = self.WC("aaaaaaaaaaaa", "Ann"), self.WC("bbbbbbbbbbbb", "Ben")
        server.weekly_match(a, other, True)
        server.weekly_match(b, other, False)
        self.assertEqual((server.WEEKLY["scores"][a.fid]["pts"], server.WEEKLY["scores"][b.fid]["pts"]), (3, 1))      # a win is 3, anything else 1
        if feat:
            server.weekly_match(a, feat, True)
            self.assertEqual(server.WEEKLY["scores"][a.fid]["pts"], 3 + 6)                                              # a game that suits the theme counts double
        guest = self.WC(None, "Guest")
        server.weekly_match(guest, other, True)                                                                         # guests have no account: no points
        self.assertEqual(len(server.WEEKLY["scores"]), 2)

    def test_weekly_pyramid_blocks_pay_a_few_points_and_are_capped(self):
        self.weekly_fresh()
        server.WEEKLY["week"] = next(w for w in range(server.WEEKLY["week"], server.WEEKLY["week"] + 10) if server.week_theme(w)["id"] != "pyramid")
        a = self.WC("aaaaaaaaaaaa", "Ann")
        with mock.patch.object(server, "week_of", return_value=server.WEEKLY["week"]):
            for _ in range(400):
                server.weekly_block(a)
            self.assertEqual(server.WEEKLY["scores"][a.fid]["pts"], 25)                      # a normal week: one point per four blocks, at most 25
            server.WEEKLY["week"] = next(w for w in range(2000, 2100) if server.week_theme(w)["id"] == "pyramid")
        with mock.patch.object(server, "week_of", return_value=server.WEEKLY["week"]):
            server.WEEKLY["scores"] = {}
            for _ in range(400):
                server.weekly_block(a)
            self.assertEqual(server.WEEKLY["scores"][a.fid]["pts"], 100)                     # Pyramid Week: one point per two blocks, at most 100

    def test_weekly_a_finished_week_pays_prizes_once_confirmed(self):
        self.weekly_fresh()
        server.WEEKLY["week"] -= 1
        fids = ["%012x" % i for i in range(1, 7)]
        pts = [50, 40, 30, 12, 10, 4]
        server.WEEKLY["scores"] = {f: {"name": "P%d" % i, "pts": p, "blk": 0, "bp": 0} for i, (f, p) in enumerate(zip(fids, pts))}
        server.weekly_roll()
        self.assertEqual(server.WEEKLY["week"], server.week_of(time.time()))
        self.assertEqual(server.WEEKLY["scores"], {})                                         # a new, empty week
        self.assertEqual([server.PRIZES[f][0]["coins"] for f in fids[:5]], [1000, 600, 300, 100, 100])
        self.assertNotIn(fids[5], server.PRIZES)                                               # under 10 points: nothing
        self.assertEqual([x[1] for x in server.WEEKLY["last"]["top"]], [50, 40, 30])
        server.weekly_roll()
        self.assertEqual(len(server.PRIZES[fids[0]]), 1)                                       # rolling twice does not pay twice

    async def test_weekly_view_prize_delivery_and_confirmation(self):
        self.accounts("ann")
        self.weekly_fresh()
        guest = await self.player("Guest")
        guest.send({"t": "weekly", "a": "get"})
        v = await guest.until(lambda m: m["t"] == "weekly")
        self.assertFalse(v["login"])
        self.assertIsNone(v["you"])
        self.assertEqual(v["prizes"], [1000, 600, 300])
        fid = server.fid_of("u-ann")
        server.PRIZES[fid] = [{"id": "w1", "week": 1, "theme": "Arena Week", "rank": 1, "coins": 1000, "pts": 50}]
        ann = await self.player("Ann", token="ann")
        got = await ann.until(lambda m: m["t"] == "weekly_prize")                             # waiting prizes arrive when you come online
        self.assertEqual(got["prizes"][0]["coins"], 1000)
        ann.send({"t": "weekly", "a": "ack", "ids": ["w1"]})
        ann.send({"t": "weekly", "a": "get"})
        v = await ann.until(lambda m: m["t"] == "weekly")
        self.assertTrue(v["login"])
        self.assertEqual(v["you"], {"pts": 0, "rank": 0})
        self.assertNotIn(fid, server.PRIZES)                                                   # confirmed: it will not be sent again
        ann.send({"t": "weekly", "a": "ack", "ids": ["w1"]})                                    # (a repeated confirmation is harmless)

    def test_weekly_ranked_matches_score_but_farmed_rematches_and_bot_games_do_not(self):
        self.weekly_fresh()
        server.RECENT.clear()
        a, b = self.WC("aaaaaaaaaaaa", "Ann"), self.WC("bbbbbbbbbbbb", "Ben")
        server.rate_placements([(a, 0), (b, 1)], "xiangqi")
        mult = 2 if "xiangqi" in server.week_theme(server.WEEKLY["week"])["kinds"] else 1
        self.assertEqual((server.WEEKLY["scores"][a.fid]["pts"], server.WEEKLY["scores"][b.fid]["pts"]), (3 * mult, 1 * mult))
        for _ in range(5):                                                                    # the same two people again and again: only the first few count
            server.rate_placements([(a, 0), (b, 1)], "xiangqi")
        self.assertEqual(server.WEEKLY["scores"][a.fid]["pts"], 3 * mult * 3)
        server.rate_placements([(a, 0)], "xiangqi")                                            # a game against a bot has one human: nothing
        self.assertEqual(server.WEEKLY["scores"][a.fid]["pts"], 3 * mult * 3)
        server.RECENT.clear()

    def test_weekly_state_is_saved_and_loaded(self):
        self.weekly_fresh()
        f = "abcdef012345"
        server.WEEKLY["scores"][f] = {"name": "Ann", "pts": 7, "blk": 3, "bp": 0}
        server.WEEKLY["last"] = {"week": 1, "theme": "Arena Week", "top": [["Bo", 9]]}
        server.PRIZES[f] = [{"id": "w1", "week": 1, "theme": "Arena Week", "rank": 2, "coins": 600, "pts": 9}]
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.WEEKLY.update({"week": -1, "scores": {}, "last": None})
        server.PRIZES.clear()
        server.world_apply(snap)
        self.assertEqual(server.WEEKLY["scores"][f]["pts"], 7)
        self.assertEqual(server.PRIZES[f][0]["coins"], 600)
        self.assertEqual(server.WEEKLY["last"]["top"], [["Bo", 9]])
        server.world_apply({"weekly": {"week": 3, "scores": {"not a friend id": {"pts": 99}}, "prizes": {"zz": [1]}}})       # junk is ignored
        self.assertEqual(server.WEEKLY["scores"], {})

    # ---------------------------------------------------------------- tournaments

    def tourney_fresh(self):
        server.TOURNEYS.clear(); server.TOURNEY_WON.clear(); server.TOURNEY_MADE.clear(); server.PRIZES.clear(); server.STATS.clear()
        saved = (server.TOURNEY_GAP, server.TOURNEY_GRACE, server.TOURNEY_REMATCH)
        server.TOURNEY_GAP = server.TOURNEY_REMATCH = 0.0
        self.addCleanup(lambda: (setattr(server, "TOURNEY_GAP", saved[0]), setattr(server, "TOURNEY_GRACE", saved[1]), setattr(server, "TOURNEY_REMATCH", saved[2]),
                                 server.TOURNEYS.clear(), server.TOURNEY_WON.clear(), server.TOURNEY_MADE.clear(), server.PRIZES.clear(), server.STATS.clear()))

    def tourney_pure(self, kind, n):
        """A running tournament of n people (nobody is online), the best seed first: fids 000000000001, 000000000002, ..."""
        t = {"id": "t1", "kind": kind, "by": "", "state": "running", "created": 0, "start_at": 0, "cap": 16, "rounds": [], "out": {}, "ended": 0, "champ": "", "places": [],
             "players": [{"f": "%012x" % i, "name": "P%d" % i, "seed": 1000 + 10 * (n - i)} for i in range(1, n + 1)]}
        t["rounds"] = [server.tourney_deal(t, [p["f"] for p in t["players"]], True)]
        server.TOURNEYS["t1"] = t
        return t

    def test_tourney_bracket_seeds_and_byes(self):
        self.tourney_fresh()
        self.assertEqual(server.tourney_seed_order(8), [1, 8, 4, 5, 2, 7, 3, 6])
        t = self.tourney_pure("xiangqi", 6)                                              # 6 people: seeds 1 and 2 have byes
        f = lambda i: "%012x" % i
        self.assertEqual([m["ps"] for m in t["rounds"][0]], [[f(1)], [f(4), f(5)], [f(2)], [f(3), f(6)]])
        self.assertEqual([m["st"] for m in t["rounds"][0]], ["done", "wait", "done", "wait"])
        self.assertEqual([server.tourney_label(t, 0)], ["Quarterfinal"])

    def test_tourney_two_player_rounds_go_on_and_the_final_gives_places_and_prizes(self):
        self.tourney_fresh()
        t = self.tourney_pure("kushti", 4)
        f = lambda i: "%012x" % i
        for m, win in zip(t["rounds"][0], (f(1), f(2))):                                  # semifinals: 1 v 4 and 2 v 3
            server.tourney_settle(t, m, [win] + [x for x in m["ps"] if x != win])
        server.tourney_round_done(t)
        self.assertEqual([m["ps"] for m in t["rounds"][1]], [[f(1), f(2)]])
        self.assertEqual(server.tourney_label(t, 1), "Final")
        server.tourney_settle(t, t["rounds"][1][0], [f(2), f(1)])
        server.tourney_round_done(t)
        self.assertEqual((t["state"], t["champ"]), ("done", "P2"))
        ranks = {p[1]: p[2] for p in t["places"]}
        self.assertEqual((ranks["P2"], ranks["P1"]), (1, 2))
        self.assertEqual({n for n, r in ranks.items() if r == 3}, {"P3", "P4"})
        self.assertEqual([p["coins"] for p in server.PRIZES[f(2)]], [500])                # four or more people: there are prizes
        self.assertEqual(server.PRIZES[f(3)][0]["rank"], 3)
        self.assertEqual(server.STATS[f(2)]["tw"], 1)

    def test_tourney_without_four_people_has_no_prizes_and_prizes_are_limited_each_day(self):
        self.tourney_fresh()
        t = self.tourney_pure("ball", 2)
        server.tourney_settle(t, t["rounds"][0][0], ["%012x" % 1, "%012x" % 2])
        server.tourney_round_done(t)
        self.assertEqual((t["state"], server.PRIZES), ("done", {}))
        for i in range(5):                                                               # one account winning again and again: three prizes a day
            t = self.tourney_pure("ball", 4)
            t["id"] = "t%d" % (i + 2)
            for m in t["rounds"][0]:
                server.tourney_settle(t, m, [m["ps"][0], m["ps"][1]])
            server.tourney_round_done(t)
            server.tourney_settle(t, t["rounds"][1][0], ["%012x" % 1, "%012x" % 2])
            server.tourney_round_done(t)
        self.assertEqual(len(server.PRIZES["%012x" % 1]), 3)

    def test_tourney_dragon_boats_race_in_heats_and_half_of_each_go_on(self):
        self.tourney_fresh()
        t = self.tourney_pure("dragon", 5)
        f = lambda i: "%012x" % i
        self.assertEqual(sorted(len(m["ps"]) for m in t["rounds"][0]), [2, 3])            # heats of 3 and 2, seeds dealt like a snake
        self.assertEqual(sorted(m["adv"] for m in t["rounds"][0]), [1, 2])
        for m in t["rounds"][0]:
            server.tourney_settle(t, m, list(m["ps"]))
        server.tourney_round_done(t)
        self.assertEqual((len(t["rounds"][1]), len(t["rounds"][1][0]["ps"]), t["rounds"][1][0]["adv"]), (1, 3, 3))
        self.assertEqual(server.tourney_label(t, 1), "Final")
        server.tourney_settle(t, t["rounds"][1][0], list(reversed(t["rounds"][1][0]["ps"])))
        server.tourney_round_done(t)
        self.assertEqual([p[2] for p in t["places"]], [1, 2, 3])
        self.assertEqual(t["state"], "done")
        t = self.tourney_pure("dragon", 16)                                              # sixteen boats: four heats, then two, then the final
        self.assertEqual([len(m["ps"]) for m in t["rounds"][0]], [4, 4, 4, 4])
        for m in t["rounds"][0]:
            server.tourney_settle(t, m, list(m["ps"]))
        server.tourney_round_done(t)
        self.assertEqual([len(m["ps"]) for m in t["rounds"][1]], [4, 4])

    def test_tourney_draws_are_replayed_and_the_third_draw_goes_to_the_better_seed(self):
        self.tourney_fresh()
        t = self.tourney_pure("xiangqi", 2)
        m = t["rounds"][0][0]
        for n in (1, 2):
            m["st"], m["room"] = "live", "r%d" % n
            server.tourney_done(("t1", 0, 0, "r%d" % n), [])
            self.assertEqual((m["st"], m["tries"]), ("wait", n))
        m["st"], m["room"] = "live", "r3"
        server.tourney_done(("t1", 0, 0, "r3"), [])
        self.assertEqual((m["st"], m["w"]), ("done", ["%012x" % 1]))
        server.tourney_done(("t1", 0, 0, "r3"), ["%012x" % 2])                          # (a late or repeated report changes nothing)
        self.assertEqual(m["w"], ["%012x" % 1])

    async def test_tourney_sign_up_play_a_real_xiangqi_bracket_and_a_missing_player_is_out(self):
        self.accounts("ann", "ben", "cy", "dee")
        self.tourney_fresh()
        server.TOURNEY_GRACE = 0.0
        guest = await self.player("Guest")
        guest.send({"t": "tourney", "a": "create", "kind": "xiangqi", "cap": 8})
        self.assertIn("Log in", (await guest.until(lambda m: m["t"] == "tourney"))["msg"])
        ann, ben, cy, dee = [await self.player(n.title(), token=n) for n in ("ann", "ben", "cy", "dee")]
        ann.send({"t": "tourney", "a": "create", "kind": "xiangqi", "cap": 9})                # (only 8 or 16)
        await asyncio.sleep(0.2)
        self.assertEqual(server.TOURNEYS, {})
        ann.send({"t": "tourney", "a": "create", "kind": "xiangqi", "cap": 8})
        v = await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        self.assertEqual((v["state"], v["players"], v["joined"]), ("open", ["Ann"], True))
        tid = v["id"]
        ben.send({"t": "tourney", "a": "create", "kind": "xiangqi", "cap": 8})                # one open sign-up for each game
        self.assertIn("already one open", (await ben.until(lambda m: m["t"] == "tourney"))["msg"])
        for w in (ben, cy, dee):
            w.send({"t": "tourney", "a": "join", "id": tid})
            await w.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        ben.send({"t": "tourney", "a": "list"})
        row = (await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "list"))["list"][0]
        self.assertEqual((row["n"], row["state"], row["joined"]), (4, "open", True))
        dee.w.close()                                                                      # Dee goes offline before the start: dropped
        await asyncio.sleep(0.2)
        server.TOURNEYS[tid]["start_at"] = 0
        server.tourney_tick()
        t = server.TOURNEYS[tid]
        self.assertEqual((t["state"], len(t["players"])), ("running", 3))
        names = {p["f"]: p["name"] for p in t["players"]}
        ws = {f: next(w for w in (ann, ben, cy) if w is not None and names[f] == {ann: "Ann", ben: "Ben", cy: "Cy"}[w]) for f in names}
        # three people: one has a bye, the other two play the first match
        match = next(m for m in t["rounds"][0] if len(m["ps"]) == 2)
        server.tourney_tick()                                                            # the call goes out...
        call = await ws[match["ps"][0]].until(lambda m: m["t"] == "tourney" and m["a"] == "call")
        self.assertEqual((call["kind"], call["label"]), ("xiangqi", "Semifinal"))
        server.tourney_tick()                                                            # ...and then the match starts by itself
        for f in match["ps"]:
            await ws[f].until(lambda m: m["t"] == "match" and m["mode"] == "xiangqi")
        self.assertEqual(match["st"], "live")
        self.assertEqual([(r["tour"]) for r in server.watch_list()], [True])               # it can be watched, and is marked
        loser = match["ps"][1]
        ws[loser].send({"t": "resign"})
        await ws[match["ps"][0]].until(lambda m: m["t"] == "end")
        server.tourney_tick()
        self.assertEqual(match["w"], [match["ps"][0]])
        final = t["rounds"][1][0]
        self.assertEqual(sorted(final["ps"]), sorted([match["ps"][0], next(f for f in names if f not in match["ps"])]))
        server.tourney_tick()
        server.tourney_tick()
        for f in final["ps"]:
            await ws[f].until(lambda m: m["t"] == "match" and m["mode"] == "xiangqi")
        ws[final["ps"][1]].send({"t": "resign"})
        await ws[final["ps"][0]].until(lambda m: m["t"] == "end")
        server.tourney_tick()
        self.assertEqual((t["state"], t["champ"]), ("done", names[final["ps"][0]]))
        self.assertEqual(server.PRIZES, {})                                              # (three people: no prizes)

    async def test_tourney_a_player_who_does_not_turn_up_loses_by_walkover(self):
        self.accounts("ann", "ben")
        self.tourney_fresh()
        server.TOURNEY_GRACE = 0.0
        ann, ben = await self.player("Ann", token="ann"), await self.player("Ben", token="ben")
        ann.send({"t": "tourney", "a": "create", "kind": "kites", "cap": 8})
        tid = (await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "view"))["id"]
        ben.send({"t": "tourney", "a": "join", "id": tid})
        await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        server.TOURNEY_GAP = 100.0
        server.TOURNEYS[tid]["start_at"] = 0
        server.tourney_tick()                                                            # the tournament starts
        server.tourney_tick()                                                            # the call goes out: the match is in 100 seconds
        t = server.TOURNEYS[tid]
        m = t["rounds"][0][0]
        self.assertEqual(m["st"], "wait")
        ben.send({"t": "queue", "mode": "xiangqi", "bot": True})                          # Ben is busy in a game of his own
        await ben.until(lambda m: m["t"] == "match", timeout=4)
        m["call"] = 0.0
        server.tourney_tick()                                                            # the time has come and a minute (here none) of grace is up
        self.assertEqual((m["st"], m["order"][0]), ("done", next(p["f"] for p in t["players"] if p["name"] == "Ann")))
        server.tourney_tick()
        self.assertEqual((t["state"], t["champ"]), ("done", "Ann"))

    async def test_tourney_rules_one_at_a_time_full_and_leaving(self):
        self.accounts("ann", "ben", "cy")
        self.tourney_fresh()
        ann, ben, cy = [await self.player(n.title(), token=n) for n in ("ann", "ben", "cy")]
        ann.send({"t": "tourney", "a": "create", "kind": "ball", "cap": 8})
        tid = (await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "view"))["id"]
        ann.send({"t": "tourney", "a": "create", "kind": "dragon", "cap": 8})             # already in one
        self.assertIn("already", (await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])
        server.TOURNEYS[tid]["cap"] = 2
        ben.send({"t": "tourney", "a": "join", "id": tid})
        await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        cy.send({"t": "tourney", "a": "join", "id": tid})
        self.assertIn("full", (await cy.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])
        server.tourney_tick()                                                            # a full tournament starts soon, not in four minutes
        self.assertLess(server.TOURNEYS[tid]["start_at"] - time.time(), server.TOURNEY_FULL + 1)
        ben.send({"t": "tourney", "a": "leave", "id": tid})
        await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "left")
        self.assertEqual([p["name"] for p in server.TOURNEYS[tid]["players"]], ["Ann"])
        server.TOURNEYS[tid]["start_at"] = 0
        server.tourney_tick()                                                            # one person is not a tournament
        self.assertEqual(server.TOURNEYS[tid]["state"], "cancelled")
        cy.send({"t": "tourney", "a": "get", "id": "nothere"})
        self.assertIn("over", (await cy.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])

    async def test_tourney_the_host_can_start_it_now(self):
        self.accounts("ann", "ben", "cy")
        self.tourney_fresh()
        ann, ben, cy = [await self.player(n.title(), token=n) for n in ("ann", "ben", "cy")]
        ann.send({"t": "tourney", "a": "create", "kind": "xiangqi", "cap": 8})
        v = await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        self.assertTrue(v["host"])
        tid = v["id"]
        ann.send({"t": "tourney", "a": "start", "id": tid})                               # alone: not enough people
        self.assertIn("at least", (await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])
        ben.send({"t": "tourney", "a": "join", "id": tid})
        v = await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        self.assertFalse(v["host"])
        ben.send({"t": "tourney", "a": "start", "id": tid})                               # only the host can
        self.assertIn("Only whoever", (await ben.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])
        self.assertEqual(server.TOURNEYS[tid]["state"], "open")
        ann.send({"t": "tourney", "a": "start", "id": tid})
        v = await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "view" and m["state"] == "running")
        self.assertEqual((v["round"], len(v["rounds"][0]["m"])), ("Final", 1))
        ann.send({"t": "tourney", "a": "start", "id": tid})                               # (already under way)
        self.assertIn("Only whoever", (await ann.until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])

    async def test_tourney_the_server_opens_a_saturday_tournament_with_double_prizes(self):
        self.accounts("ann", "ben", "cy", "dee")
        self.tourney_fresh()
        server.TOURNEY_AUTO["week"] = -1
        self.addCleanup(lambda: server.TOURNEY_AUTO.update(week=-1))
        sat = datetime.datetime(2026, 11, 7, tzinfo=datetime.timezone.utc).timestamp()          # a Saturday
        wk = server.week_of(sat)
        with mock.patch.object(server.time, "time", return_value=sat + 15 * 3600):               # 15:00: not yet
            server.tourney_tick()
        self.assertEqual(server.TOURNEYS, {})
        with mock.patch.object(server.time, "time", return_value=sat + 16 * 3600 + 5):           # 16:00: sign-up opens
            server.tourney_tick()
            server.tourney_tick()                                                                # (only once a week)
        self.assertEqual(len(server.TOURNEYS), 1)
        t = next(iter(server.TOURNEYS.values()))
        self.assertEqual((t["kind"], t["cap"], t["state"], t["start_at"], bool(t["auto"])), (server.TOURNEY_KINDS[wk % 5], 16, "open", sat + 18 * 3600, True))
        self.assertIn("Saturday", server.tourney_name(t))
        self.assertEqual(server.CHAT_LOG[-1]["text"].count("Saturday"), 1)
        before = len(server.CHAT_LOG)
        with mock.patch.object(server.time, "time", return_value=sat + 17 * 3600 + 50 * 60):    # 17:50: a reminder, once
            server.tourney_tick()
            server.tourney_tick()
        self.assertEqual(len(server.CHAT_LOG), before + 1)
        ps = [await self.player(n.title(), token=n) for n in ("ann", "ben", "cy", "dee")]
        for w in ps:
            w.send({"t": "tourney", "a": "join", "id": t["id"]})
            await w.until(lambda m: m["t"] == "tourney" and m["a"] == "view")
        ps[0].send({"t": "tourney", "a": "start", "id": t["id"]})                               # nobody hosts it: no Start now
        self.assertIn("Only whoever", (await ps[0].until(lambda m: m["t"] == "tourney" and m["a"] == "no"))["msg"])
        with mock.patch.object(server.time, "time", return_value=sat + 18 * 3600 + 1):
            server.tourney_tick()
        self.assertEqual((t["state"], len(t["players"])), ("running", 4))
        for rd in (0, 1):                                                                        # two semifinals, then the final: the first of each match wins
            for m in t["rounds"][rd]:
                server.tourney_settle(t, m, list(m["ps"]))
            server.tourney_round_done(t)
        champ = t["rounds"][1][0]["ps"][0]
        self.assertEqual(t["state"], "done")
        self.assertEqual(server.PRIZES[champ][0]["coins"], 1000)                                 # double the usual 500
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.TOURNEY_AUTO["week"] = -1
        server.world_apply(snap)
        self.assertEqual(server.TOURNEY_AUTO["week"], wk)

    async def test_hall_of_fame_lists_winners_and_the_best_players(self):
        self.tourney_fresh()
        server.HALL.update(tourneys=[], weekly=[])
        self.addCleanup(lambda: server.HALL.update(tourneys=[], weekly=[]))
        f = lambda i: "%012x" % i
        server.STATS[f(1)] = {"name": "Ann", "r": 1210, "g": {"xiangqi": [6, 1, 0], "kushti": [1, 0, 0]}, "cups": [2, 0, 0], "hist": [], "tw": 3}
        server.STATS[f(2)] = {"name": "Ben", "r": 1105, "g": {"xiangqi": [4, 3, 0]}, "cups": [0, 1, 0], "hist": []}
        server.STATS[f(3)] = {"name": "Cy", "r": 990, "g": {"xiangqi": [0, 2, 0]}, "cups": [0, 0, 0], "hist": []}
        t = self.tourney_pure("kushti", 4)                                                   # a finished tournament goes into the hall
        for m in t["rounds"][0]:
            server.tourney_settle(t, m, list(m["ps"]))
        server.tourney_round_done(t)
        server.tourney_settle(t, t["rounds"][1][0], list(t["rounds"][1][0]["ps"]))
        server.tourney_round_done(t)
        self.assertEqual([(r["k"], r["n"]) for r in server.HALL["tourneys"]], [("kushti", 4)])
        server.weekly_roll(time.time())                                                      # (the week is -1 at first: nothing to record)
        server.WEEKLY.update(week=server.week_of(time.time()) - 1, scores={f(1): {"name": "Ann", "pts": 12, "blk": 0, "bp": 0}})
        server.weekly_roll(time.time())
        self.assertEqual([(r["top"]) for r in server.HALL["weekly"]], [[["Ann", 12]]])
        v = server.hall_view()
        self.assertEqual(v["best"]["xiangqi"], [["Ann", 6, 1, 0], ["Ben", 4, 3, 0]])         # Cy has no wins: not listed; kushti has too few games
        self.assertNotIn("kushti", v["best"])
        self.assertEqual([r[0] for r in v["rating"]], ["Ann", "Ben"])                         # (Cy has played fewer than five games)
        self.assertEqual((v["tw"], v["cups"][0]), ([["Ann", 4]], ["Ann", 3]))                 # (she won the tournament above, and the week that was just recorded)
        ws = await self.player("Zed")
        ws.send({"t": "hall", "a": "get"})
        got = await ws.until(lambda m: m["t"] == "hall")
        self.assertEqual(got["tourneys"][0]["champ"], t["champ"])
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.HALL.update(tourneys=[], weekly=[])
        server.world_apply(snap)
        self.assertEqual((len(server.HALL["tourneys"]), len(server.HALL["weekly"])), (1, 1))
        server.world_apply({"hall": {"tourneys": [{"k": "chess"}, 5], "weekly": "x"}})      # junk is ignored
        self.assertEqual((server.HALL["tourneys"], server.HALL["weekly"]), ([], []))

    def test_tourney_is_saved_and_a_match_that_was_live_waits_again(self):
        self.tourney_fresh()
        t = self.tourney_pure("xiangqi", 4)
        m = t["rounds"][0][0]
        m["st"], m["room"], m["call"] = "live", "abc", 5.0
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.TOURNEYS.clear()
        server.world_apply(snap)
        t2 = server.TOURNEYS["t1"]
        self.assertEqual((t2["state"], len(t2["players"]), len(t2["rounds"][0])), ("running", 4, 2))
        self.assertEqual((t2["rounds"][0][0]["st"], t2["rounds"][0][0]["room"], t2["rounds"][0][0]["call"]), ("wait", None, None))
        server.world_apply({"tourneys": {"x": {"id": "x", "kind": "chess", "state": "open"}, "y": 5}})              # junk is ignored
        self.assertEqual(server.TOURNEYS, {})

    async def test_souvenirs_are_listed_on_a_profile_and_junk_is_ignored(self):
        self.accounts("ann")
        server.STATS.clear()
        ann = await self.player("Ann", token="ann")
        ann.send({"t": "souv", "ids": ["rome-pantheon", "beijing-seal", "nonsense", 7, "rome-pantheon"]})
        await asyncio.sleep(0.3)
        fid = server.fid_of("u-ann")
        self.assertEqual(server.STATS[fid]["sv"], ["rome-pantheon", "beijing-seal"])
        ann.send({"t": "souv", "ids": ["delhi-diya"]})                                      # (too soon after the last one)
        await asyncio.sleep(0.2)
        self.assertEqual(server.STATS[fid]["sv"], ["rome-pantheon", "beijing-seal"])
        self.assertEqual(server.profile_view(fid)["sv"], ["rome-pantheon", "beijing-seal"])
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.STATS.clear()
        server.world_apply(snap)
        self.assertEqual(server.STATS[fid]["sv"], ["rome-pantheon", "beijing-seal"])
        guest = await self.player("Guest")
        guest.send({"t": "souv", "ids": ["rome-pantheon"]})                                 # a guest has no profile
        await asyncio.sleep(0.2)
        self.assertEqual(list(server.STATS), [fid])
        server.STATS.clear()

    # ---------------------------------------------------------------- watching a match

    async def test_watch_a_match_between_two_people(self):
        ws, ms, room = await self.start_mini("xiangqi")
        cy = await self.player("Cy")
        cy.send({"t": "watch", "a": "list"})
        lst = (await cy.until(lambda m: m["t"] == "watch" and m["a"] == "list"))["list"]
        self.assertEqual([(r["kind"], sorted(r["names"]), r["n"]) for r in lst], [("xiangqi", ["Ann", "Ben"], 0)])
        cy.send({"t": "watch", "a": "join", "room": lst[0]["room"]})
        joined = await cy.until(lambda m: m["t"] == "match")
        self.assertTrue(joined["watch"])
        self.assertEqual([p["name"] for p in joined["players"]], ["Ann", "Ben"])
        room.send_state(room.state())                                                  # the board is sent to everyone, watchers included
        got = await cy.until(lambda m: m["t"] == "mini")
        self.assertEqual((got["k"], got["turn"], got["w"]), ("xiangqi", 0, 1))
        f, t = next(mv for mv in room.legal if room.board[mv[0]] == "C")
        cy.send({"t": "move", "f": f, "to": t})                                        # a watcher cannot move
        await asyncio.sleep(0.2)
        self.assertEqual(room.moves_n, 0)
        ws[1].send({"t": "resign"})
        end = await cy.until(lambda m: m["t"] == "end", timeout=3)                    # and is told how it ended
        self.assertEqual((end["winner"], end["reason"], end.get("watch")), (0, "resign", True))
        self.assertEqual(server.watch_list(), [])                                      # a finished match is no longer listed

    async def test_watch_refuses_games_vs_bots_busy_players_and_ended_matches(self):
        ws, ms, room = await self.start_mini("xiangqi", bots=True)                    # a practice game against a bot: not listed
        cy = await self.player("Cy")
        cy.send({"t": "watch", "a": "list"})
        self.assertEqual((await cy.until(lambda m: m["t"] == "watch"))["list"], [])
        cy.send({"t": "watch", "a": "join", "room": "nope"})
        no = await cy.until(lambda m: m["t"] == "watch" and m["a"] == "no")
        self.assertIn("over", no["msg"])
        ws[0].send({"t": "watch", "a": "join", "room": room.id})                      # someone in a game cannot watch another
        no = await ws[0].until(lambda m: m["t"] == "watch" and m["a"] == "no")
        self.assertIn("own game", no["msg"])

    async def test_guild_leader_sets_a_message_of_the_day(self):
        server.GUILDS.clear(); server.GUILD_OF.clear()
        self.addCleanup(lambda: (server.GUILDS.clear(), server.GUILD_OF.clear()))
        self.accounts("ann", "bob")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob", token="bob")
        ann.send({"t": "social", "a": "g_make", "name": "Red Eagles", "tag": "ead"})
        await ann.until(lambda m: m["t"] == "guild" and m["g"])
        bob.send({"t": "social", "a": "g_join", "name": "Red Eagles"})
        await ann.until(lambda m: m["t"] == "guild" and m["g"] and len(m["g"]["members"]) == 2)
        bob.send({"t": "social", "a": "g_motd", "text": "Bob is the boss now"})                  # only the leader can
        self.assertIn("leader", (await bob.until(lambda m: m["t"] == "fr_msg"))["msg"])
        ann.send({"t": "social", "a": "g_motd", "text": "Meet at the Colosseum at dusk"})
        st = await bob.until(lambda m: m["t"] == "guild" and m["g"] and m["g"]["motd"])
        self.assertEqual(st["g"]["motd"], "Meet at the Colosseum at dusk")
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.GUILDS.clear(); server.GUILD_OF.clear()
        server.world_apply(snap)
        self.assertEqual(server.GUILDS["red eagles"]["motd"], "Meet at the Colosseum at dusk")      # and it is saved

    # ---------------------------------------------------------------- the bulletin boards

    async def test_notice_board_post_list_delete_and_limits(self):
        server.NOTICES.clear(); server.NOTICE_LAST.clear()
        self.addCleanup(lambda: (server.NOTICES.clear(), server.NOTICE_LAST.clear()))
        self.accounts("ann", "bob")
        ann, bob, guest = await self.player("Ann", token="ann"), await self.player("Bob", token="bob"), await self.player("Guest")
        guest.send({"t": "notice", "a": "post", "c": "rome", "text": "hello from a guest"})
        self.assertIn("Log in", (await guest.until(lambda m: m["t"] == "notice" and m["a"] == "no"))["msg"])      # guests can read but not write
        ann.send({"t": "notice", "a": "post", "c": "rome", "text": "Selling a mule, ask at the Forum"})
        v = await ann.until(lambda m: m["t"] == "notice" and m["a"] == "list")
        self.assertEqual([(p["name"], p["text"], p["mine"]) for p in v["posts"]], [("Ann", "Selling a mule, ask at the Forum", True)])
        ann.send({"t": "notice", "a": "post", "c": "rome", "text": "a second one straight away"})              # one every ten minutes
        self.assertIn("minute", (await ann.until(lambda m: m["t"] == "notice" and m["a"] == "no"))["msg"])
        guest.send({"t": "notice", "a": "get", "c": "rome"})
        seen = await guest.until(lambda m: m["t"] == "notice" and m["a"] == "list")
        self.assertEqual((len(seen["posts"]), seen["posts"][0]["mine"]), (1, False))
        guest.send({"t": "notice", "a": "get", "c": "delhi"})                                                  # each city has its own board
        self.assertEqual((await guest.until(lambda m: m["t"] == "notice" and m["a"] == "list" and m["c"] == "delhi"))["posts"], [])
        bob.send({"t": "notice", "a": "del", "c": "rome", "id": seen["posts"][0]["id"]})                       # you cannot take down someone else's
        after = await bob.until(lambda m: m["t"] == "notice" and m["a"] == "list")
        self.assertEqual(len(after["posts"]), 1)
        ann.send({"t": "notice", "a": "del", "c": "rome", "id": seen["posts"][0]["id"]})
        self.assertEqual((await ann.until(lambda m: m["t"] == "notice" and m["a"] == "list" and not m["posts"]))["posts"], [])
        bob.send({"t": "notice", "a": "post", "c": "atlantis", "text": "no such city"})                         # an unknown city is ignored
        bob.send({"t": "notice", "a": "post", "c": "beijing", "text": "x"})                                    # too short
        self.assertIn("few words", (await bob.until(lambda m: m["t"] == "notice" and m["a"] == "no"))["msg"])

    def test_notice_board_old_notices_expire_and_are_saved(self):
        server.NOTICES.clear()
        self.addCleanup(server.NOTICES.clear)
        now = time.time()
        server.NOTICES["cancun"] = [{"id": "old", "fid": "aaaaaaaaaaaa", "name": "Ann", "text": "ancient news", "t": now - 8 * 86400},
                                    {"id": "new", "fid": "aaaaaaaaaaaa", "name": "Ann", "text": "fresh news", "t": now - 3600}]
        self.assertEqual([n["id"] for n in server.notices_live("cancun")], ["new"])                          # a week old: gone
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.NOTICES.clear()
        server.world_apply(snap)
        self.assertEqual(server.NOTICES["cancun"][0]["text"], "fresh news")

    async def test_watch_a_dragon_boat_race_and_cheer(self):
        ws, ms, room = await self.start_dragon(2)
        cy = await self.player("Cy")
        cy.send({"t": "watch", "a": "list"})
        lst = (await cy.until(lambda m: m["t"] == "watch" and m["a"] == "list"))["list"]
        self.assertEqual([(r["kind"], sorted(r["names"])) for r in lst], [("dragon", ["Ann", "Ben"])])
        cy.send({"t": "watch", "a": "join", "room": lst[0]["room"]})
        joined = await cy.until(lambda m: m["t"] == "match")
        self.assertEqual((joined["mode"], joined["watch"], joined["length"], joined["beat"]), ("dragon", True, 250.0, 0.6))
        self.assertLess(joined["countdown"], 0)                                                # (the race is already under way)
        room.step(0.1)
        got = await cy.until(lambda m: m["t"] == "dragon")                                    # the boats' positions reach the watcher
        self.assertEqual((len(got["p"]), got["w"]), (2, 1))
        cy.send({"t": "watch", "a": "cheer", "e": "🔥"})
        for w in (ws[0], ws[1], cy):                                                          # everyone sees the cheer
            c = await w.until(lambda m: m["t"] == "cheer")
            self.assertEqual((c["name"], c["e"]), ("Cy", "🔥"))
        cy.send({"t": "watch", "a": "cheer", "e": "😮"})                                       # too soon after the last one: ignored
        with self.assertRaises(asyncio.TimeoutError):
            await ws[0].until(lambda m: m["t"] == "cheer", timeout=0.5)
        server.on_watch(next(c for c in server.CONNS if c.name == "Cy"), {"a": "cheer", "e": "💩"}) # (and only the listed cheers)
        a, b = room.players
        a.s, a.v, b.s, b.v = 249.5, 6.0, 200.0, 4.0
        for _ in range(3):
            room.step(0.1)
        b.s = 249.5
        for _ in range(3):
            room.step(0.1)
        end = await cy.until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end.get("watch"), end["order"][0]["i"]), ("dragon", True, 0))
        self.assertNotIn("rank", end)

    async def test_watch_the_ball_game(self):
        ws, ms, room = await self.start_mini("ball")
        cy = await self.player("Cy")
        cy.send({"t": "watch", "a": "list"})
        lst = (await cy.until(lambda m: m["t"] == "watch" and m["a"] == "list"))["list"]
        self.assertEqual([r["kind"] for r in lst], ["ball"])
        cy.send({"t": "watch", "a": "join", "room": lst[0]["room"]})
        joined = await cy.until(lambda m: m["t"] == "match")
        self.assertEqual((joined["mode"], joined["watch"], [p["name"] for p in joined["players"]]), ("ball", True, ["Ann", "Ben"]))
        room.step(0.1)
        got = await cy.until(lambda m: m["t"] == "mini")
        self.assertEqual((len(got["b"]), len(got["p"])), (3, 2))                              # the ball and both players

    def test_weekly_end_of_week_is_announced_in_chat(self):
        self.weekly_fresh()
        sent = []
        with mock.patch.object(server, "broadcast_chat", side_effect=lambda e: sent.append(e["text"])):
            server.WEEKLY["week"] -= 1
            server.WEEKLY["scores"] = {"aaaaaaaaaaaa": {"name": "Ann", "pts": 9, "blk": 0, "bp": 0}, "bbbbbbbbbbbb": {"name": "Ben", "pts": 5, "blk": 0, "bp": 0}}
            server.weekly_roll()
        self.assertEqual(len(sent), 2)
        self.assertIn("🥇 Ann (9)", sent[0])
        self.assertIn("🥈 Ben (5)", sent[0])
        self.assertIn("A new weekly cup begins", sent[1])
        server.CHAT_LOG.clear()
        with mock.patch.object(server, "broadcast_chat", side_effect=lambda e: sent.append(e["text"])):
            server.weekly_roll()                                                              # the same week again: nothing is said
        self.assertEqual(len(sent), 2)

    # ---------------------------------------------------------------- profiles and replays

    def test_profile_collects_results_history_and_cups(self):
        self.weekly_fresh()
        server.STATS.clear(); server.REPLAYS.clear(); server.RECENT.clear()
        self.addCleanup(lambda: (server.STATS.clear(), server.REPLAYS.clear()))
        a, b = self.WC("aaaaaaaaaaaa", "Ann"), self.WC("bbbbbbbbbbbb", "Ben")
        server.rate_placements([(a, 0), (b, 1)], "duel")
        server.rate_placements([(a, 1), (b, 0)], "duel")
        server.rate_placements([(a, 0), (b, 1)], "xiangqi", "rp123456")
        v = server.profile_view(a.fid)
        self.assertEqual((v["name"], v["w"], v["l"], v["d"]), ("Ann", 2, 1, 0))
        self.assertEqual(v["games"], {"duel": [1, 1, 0], "xiangqi": [1, 0, 0]})
        self.assertEqual(v["fav"], "duel")
        self.assertEqual([(h["k"], h["r"], h["vs"]) for h in v["hist"]], [("xiangqi", "w", ["Ben"]), ("duel", "l", ["Ben"]), ("duel", "w", ["Ben"])])   # newest first
        self.assertIsNone(v["hist"][0]["rp"])                                                  # (no such replay is kept, so no replay link)
        self.assertEqual(server.profile_view("cccccccccccc"), {"t": "profile", "fid": "cccccccccccc", "none": True})
        for i in range(20):
            server.RECENT.clear()
            server.rate_placements([(a, 0), (b, 1)], "kites")
        self.assertEqual(len(server.profile_view(a.fid)["hist"]), 12)                          # only the last twelve are kept
        server.WEEKLY["week"] -= 1
        server.WEEKLY["scores"] = {a.fid: {"name": "Ann", "pts": 9, "blk": 0, "bp": 0}, b.fid: {"name": "Ben", "pts": 5, "blk": 0, "bp": 0}}
        server.weekly_roll()
        self.assertEqual(server.profile_view(a.fid)["cups"], [1, 0, 0])
        self.assertEqual(server.profile_view(b.fid)["cups"], [0, 1, 0])
        snap = json.loads(json.dumps(server.world_snapshot()))
        server.STATS.clear()
        server.world_apply(snap)
        self.assertEqual(server.profile_view(a.fid)["cups"], [1, 0, 0])
        self.assertEqual(len(server.STATS[a.fid]["hist"]), 12)

    async def test_xiangqi_replay_is_kept_and_can_be_fetched(self):
        server.REPLAYS.clear()
        self.addCleanup(server.REPLAYS.clear)
        ws, ms, room = await self.start_mini("xiangqi")
        f, t = next(mv for mv in room.legal if room.board[mv[0]] == "C")
        ws[0].send({"t": "move", "f": f, "to": t})
        await asyncio.sleep(0.2)
        ws[1].send({"t": "resign"})
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual(len(end["rp"]), 8)
        ws[1].send({"t": "replay", "id": end["rp"]})
        got = await ws[1].until(lambda m: m["t"] == "replay")
        self.assertEqual((got["rp"]["names"], got["rp"]["w"], got["rp"]["mv"]), (["Ann", "Ben"], 0, [[f, t]]))
        ws[1].send({"t": "replay", "id": "nope"})
        self.assertTrue((await ws[1].until(lambda m: m["t"] == "replay"))["none"])
        ws[1].send({"t": "profile"})                                                           # a guest has no profile of their own
        self.assertTrue((await ws[1].until(lambda m: m["t"] == "profile"))["none"])

    # ---------------------------------------------------------------- xiangqi (Chinese chess)

    def xq(self, rows):
        """A board from ten strings of nine characters (row 0 first)."""
        self.assertEqual(len(rows), 10)
        return [ch for r in rows for ch in r]

    def test_xiangqi_the_opening_position_has_44_legal_moves_each(self):
        b = server.xq_parse(server.XQ_START)
        self.assertEqual(len(b), 90)
        self.assertEqual(len(server.xq_legal(b, 0)), 44)
        self.assertEqual(len(server.xq_legal(b, 1)), 44)

    def test_xiangqi_pieces_move_by_the_rules(self):
        E = "........."
        # a horse with its leg blocked, an elephant that cannot cross the river or jump a blocked eye, a cannon that needs a screen
        b = self.xq([".....g...", E, E, E, E, E, E, "........H", E, "....G...."])
        b[6 * 9 + 8] = "."
        b[7 * 9 + 4] = "H"
        b[7 * 9 + 5] = "P"                                                  # a friendly piece on the horse's right leg
        moves = {(f, t) for f, t in server.xq_legal(b, 0) if f == 7 * 9 + 4}
        self.assertNotIn((7 * 9 + 4, 6 * 9 + 6), moves)                      # blocked on that side
        self.assertIn((7 * 9 + 4, 5 * 9 + 3), moves)                         # but the upward jumps work
        b = self.xq([".....g...", E, E, E, E, E, "..E......", E, E, "....G...."])
        e = {t for f, t in server.xq_legal(b, 0) if f == 6 * 9 + 2}
        self.assertNotIn(4 * 9 + 0, e)                                       # never across the river
        self.assertNotIn(4 * 9 + 4, e)
        self.assertIn(8 * 9 + 0, e)
        b = self.xq([".....g...", E, "c........", E, E, E, E, E, E, "....G...."])   # a black cannon with nothing to jump
        self.assertTrue(all(t % 9 == 0 or t // 9 == 2 for f, t in server.xq_pseudo(b, 1) if f == 2 * 9))

    def test_xiangqi_the_generals_may_not_face_each_other(self):
        E = "........."
        b = self.xq(["....g....", E, E, E, E, E, E, E, E, "....G...."])
        self.assertTrue(server.xq_in_check(b, 0))                            # nothing between them: illegal position
        b[4 * 9 + 4] = "P"
        self.assertFalse(server.xq_in_check(b, 0))
        # a pinned piece cannot leave the file (that would open the face-off)
        moves = server.xq_legal(b, 0)
        self.assertFalse(any(f == 4 * 9 + 4 and t % 9 != 4 for f, t in moves))

    def test_xiangqi_checkmate_leaves_no_legal_move(self):
        E = "........."
        # two chariots on the back two ranks: the black general at the top has no escape
        b = self.xq(["R...g....", "........R", E, E, E, E, E, E, E, "...G....."])
        self.assertTrue(server.xq_in_check(b, 1))
        self.assertEqual(server.xq_legal(b, 1), [])
        b[17] = "."                                                           # take the second chariot away and the general can step down
        self.assertTrue(len(server.xq_legal(b, 1)) > 0)

    async def test_xiangqi_a_game_between_two_people(self):
        ws, ms, room = await self.start_mini("xiangqi")
        self.assertEqual((ms[0]["mode"], ms[0]["ranked"], ms[0]["you"], ms[1]["you"]), ("xiangqi", True, 0, 1))
        room.task.cancel()
        ws[1].send({"t": "move", "f": 12, "to": 21})                          # Ben moves out of turn: ignored
        await asyncio.sleep(0.15)
        self.assertEqual(room.moves_n, 0)
        ws[0].send({"t": "move", "f": 0, "to": 80})                           # an illegal move: ignored
        await asyncio.sleep(0.15)
        self.assertEqual(room.moves_n, 0)
        f, t = next(mv for mv in room.legal if room.board[mv[0]] == "C")      # a cannon move
        ws[0].send({"t": "move", "f": f, "to": t})
        await asyncio.sleep(0.2)
        self.assertEqual((room.moves_n, room.turn), (1, 1))
        ws[1].send({"t": "resign"})
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["reason"]), ("xiangqi", 0, "resign"))
        self.assertIn("rank", end)

    async def test_xiangqi_practice_bot_answers_and_the_clock_loses_the_game(self):
        server.CFG["bot_wait"] = 30.0
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "xiangqi", "bot": True, "practice": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=2)
        self.assertFalse(m["ranked"])
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.play(room.legal[0])                                              # you move ...
        room.bot_at = 0.0
        room.step(0.5)                                                        # ... and the bot answers
        self.assertEqual((room.moves_n, room.turn), (2, 0))
        room.clk[0] = 0.2
        room.t_turn = time.monotonic() - 1.0
        room.step(0.5)
        end = await a.until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["winner"], end["reason"]), (1, "time"))

    # ---------------------------------------------------------------- wushu duel (Beijing)

    async def test_wushu_two_people_are_matched_bare_handed_and_ranked(self):
        a, b = await self.player("Ann"), await self.player("Ben")
        a.send({"t": "queue", "mode": "wushu"})
        b.send({"t": "queue", "mode": "wushu"})
        ma = await a.until(lambda m: m["t"] == "match", timeout=4)
        mb = await b.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual((ma["mode"], ma["ranked"], mb["mode"]), ("wushu", True, "wushu"))
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        self.assertEqual(room.players[0].reach, 2.0)                       # no weapon: a short bare-handed reach
        room.players[1].hp = 1.0
        room.players[0].x, room.players[0].z, room.players[0].yaw = 0.0, 0.0, -math.pi / 2
        room.players[1].x, room.players[1].z = 1.6, 0.0
        a.send({"t": "swing"})
        await asyncio.sleep(0.2)
        for _ in range(8):
            room.step(0.05)
        end = await a.until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["winner"], end["reason"]), ("wushu", 0, "ko"))
        self.assertIn("rank", end)

    async def test_wushu_practice_bout_starts_at_once_against_master_li(self):
        server.CFG["bot_wait"] = 30.0
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "wushu", "bot": True, "practice": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=2)
        self.assertEqual((m["mode"], m["ranked"]), ("wushu", False))
        self.assertTrue(m["players"][1]["name"].startswith("Master Li"))

    # ---------------------------------------------------------------- dragon boat race

    async def start_dragon(self, n=2):
        server.CFG["race_wait"] = 0.6
        ws = [await self.player(nm) for nm in ("Ann", "Ben", "Cyd", "Dee")[:n]]
        for w in ws:
            w.send({"t": "queue", "mode": "dragon", "bot": False})
        ms = [await w.until(lambda m: m["t"] == "match", timeout=4) for w in ws]
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        room.start_at = time.monotonic() - 1.0   # (the race is under way, and the beat starts one second ago)
        return ws, ms, room

    async def test_dragon_strokes_on_the_beat_drive_the_boat_and_ragged_ones_barely_do(self):
        ws, ms, room = await self.start_dragon(2)
        self.assertEqual((ms[0]["mode"], ms[0]["length"], ms[0]["beat"]), ("dragon", 250.0, 0.6))
        a, b = room.players
        # a stroke exactly on a beat
        room.start_at = time.monotonic() - 1.2                # 1.2 s = exactly two beats ago
        ws[0].send({"t": "stroke"})
        await asyncio.sleep(0.15)
        good = a.v
        self.assertGreater(good, 1.8)                         # a perfect stroke adds about 2 m/s
        ws[0].send({"t": "stroke"})                           # (too soon after the last one: ignored)
        await asyncio.sleep(0.1)
        self.assertEqual(a.strokes, 1)
        room.start_at = time.monotonic() - 1.2 - 0.3          # the middle of a beat: as ragged as it gets
        ws[1].send({"t": "stroke"})
        await asyncio.sleep(0.15)
        self.assertLess(b.v, 0.6)

    async def test_dragon_no_early_start_and_the_water_slows_the_boat(self):
        ws, ms, room = await self.start_dragon(2)
        a = room.players[0]
        room.start_at = time.monotonic() + 3.0                # still counting down
        ws[0].send({"t": "stroke"})
        await asyncio.sleep(0.15)
        self.assertEqual(a.strokes, 0)
        room.start_at = time.monotonic() - 1.0
        a.v = 6.0
        for _ in range(10):
            room.step(0.1)
        self.assertLess(a.v, 4.0)
        self.assertGreater(a.s, 3.0)

    async def test_dragon_finish_order_rewards_the_first_across_the_line(self):
        ws, ms, room = await self.start_dragon(2)
        a, b = room.players
        a.s, b.s, a.v, b.v = 249.0, 240.0, 6.0, 4.0
        for _ in range(5):
            room.step(0.1)
        self.assertIsNotNone(a.fin)
        self.assertFalse(room.over)                           # Ben is still rowing
        b.s, b.v = 249.5, 6.0
        for _ in range(3):
            room.step(0.1)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["order"][0]["i"], end["order"][1]["i"]), ("dragon", 0, 1))
        self.assertIn("rank", end)

    async def test_dragon_a_lone_player_gets_three_practice_crews_at_once_with_f(self):
        server.CFG["bot_wait"] = 30.0
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "dragon", "bot": True, "practice": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=2)
        self.assertEqual((m["mode"], len(m["players"])), ("dragon", 4))
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()
        room.start_at = time.monotonic() - 3.0
        for _ in range(20):
            room.step(0.1)
        self.assertTrue(all(p.s > 0 for p in room.players if p.bot))      # the practice crews paddle themselves

    # ---------------------------------------------------------------- chariot derby

    async def start_derby(self, n=2):
        server.CFG["race_wait"] = 0.6
        ws = [await self.player(nm) for nm in ("Ann", "Ben", "Cyd", "Dee")[:n]]
        for w in ws:
            w.send({"t": "queue", "mode": "derby", "bot": False})
        ms = [await w.until(lambda m: m["t"] == "match", timeout=4) for w in ws]
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        room.start_at = 0.0                   # (no countdown)
        return ws, ms, room

    async def test_derby_match_has_staggered_chariots_and_no_finish_line(self):
        ws, ms, room = await self.start_derby(3)
        self.assertEqual(ms[0]["mode"], "derby")
        self.assertEqual([p["s"] for p in ms[0]["players"]], [0.0, 7.0, 14.0])
        self.assertGreater(ms[0]["laps"], 100)
        room.step(0.1)
        st = await ws[0].until(lambda m: m["t"] == "derby")
        self.assertEqual(len(st["p"]), 3)
        self.assertEqual(st["p"][0][4], 100)             # everyone starts on 100 health

    async def test_derby_a_hit_from_behind_hurts_the_one_in_front_most(self):
        ws, ms, room = await self.start_derby(2)
        a, b = room.players
        a.s, a.d, a.v = 100.0, 5.0, 25.0                 # Ann is behind and fast
        b.s, b.d, b.v = 102.0, 5.5, 10.0                 # Ben is just ahead and slower
        room.step(0.1)
        self.assertLess(b.hp, a.hp)
        self.assertLess(b.hp, 90.0)
        self.assertLess(a.hp, 100.0)                     # the rammer is bruised too
        before = (a.hp, b.hp)
        room.step(0.1)                                   # the same touch does not count twice straight away
        self.assertEqual((a.hp, b.hp), before)

    async def test_derby_chariots_apart_do_not_hurt_each_other(self):
        ws, ms, room = await self.start_derby(2)
        a, b = room.players
        a.s, a.d, b.s, b.d = 100.0, 0.0, 100.0, 10.0     # side by side but a lane apart
        room.step(0.1)
        self.assertEqual((a.hp, b.hp), (100.0, 100.0))
        b.s, b.d = 100.0 + server.RACE_LEN, 0.0               # exactly a lap ahead is the same place on the track
        room.step(0.1)
        self.assertLess(a.hp, 100.0)

    async def test_derby_a_wrecked_chariot_is_out_and_the_last_one_running_wins(self):
        ws, ms, room = await self.start_derby(3)
        a, b, c = room.players
        a.s, a.d, a.v = 100.0, 5.0, 30.0
        b.s, b.d, b.v = 102.0, 5.0, 0.0
        c.s, c.d = 300.0, 0.0
        b.hp = 3.0
        room.step(0.1)
        self.assertTrue(b.out)
        st = await ws[0].until(lambda m: m["t"] == "derby")
        self.assertTrue(any(e[0] == "wreck" and e[1] == 1 for e in st["ev"]))
        self.assertFalse(room.over)                      # two are still running
        c.hp, c.out = 0.0, True
        room.order.append(c)
        room.step(0.1)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["reason"], end["order"][0]["i"]), ("derby", "last", 0))
        self.assertEqual([o["i"] for o in end["order"]], [0, 2, 1])    # Cyd was wrecked after Ben, so she is second
        self.assertIn("rank", end)

    async def test_derby_a_lone_player_who_asks_gets_three_bots(self):
        server.CFG["bot_wait"] = 0.5
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "derby", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(len(m["players"]), 4)
        room = next(c.room for c in server.CONNS if c.room)
        s0 = [p.s for p in room.players if p.bot]
        room.task.cancel()
        room.start_at = 0.0
        room.step(0.1)
        self.assertTrue(all(p.s > s for p, s in zip([q for q in room.players if q.bot], s0)))     # the bots drive themselves

    # ---------------------------------------------------------------- arena brawl and 2v2

    async def start_arena(self, kind, n):
        server.CFG["arena_wait"] = 0.6
        ws = [await self.player(nm) for nm in ("Ann", "Ben", "Cyd", "Dee", "Eve", "Fay")[:n]]
        for w in ws:
            w.send({"t": "queue", "mode": kind})
        ms = [await w.until(lambda m: m["t"] == "match", timeout=4) for w in ws]
        room = next(c.room for c in server.CONNS if c.room)
        room.task.cancel()                    # the tests step the room by hand
        return ws, ms, room

    async def test_brawl_everybody_is_their_own_team(self):
        ws, ms, room = await self.start_arena("brawl", 3)
        self.assertEqual(ms[0]["mode"], "brawl")
        self.assertEqual([m["you"] for m in ms], [0, 1, 2])
        self.assertEqual(sorted(p["team"] for p in ms[0]["players"]), [0, 1, 2])
        self.assertTrue(ms[0]["ranked"])
        room.step(0.05)
        st = await ws[0].until(lambda m: m["t"] == "arena")
        self.assertEqual(len(st["p"]), 3)

    async def test_brawl_a_hit_hurts_whoever_is_in_front_and_the_last_one_standing_wins(self):
        ws, ms, room = await self.start_arena("brawl", 3)
        ann, ben, cyd = room.fighters
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0
        ann.x, ann.z, ann.yaw = 0.0, 0.0, -math.pi / 2     # Ann faces east
        ben.x, ben.z = 2.0, 0.0                            # Ben is two metres ahead
        cyd.x, cyd.z = -15.0, -15.0
        ws[0].send({"t": "swing"})
        await asyncio.sleep(0.2)
        for _ in range(8):
            room.step(0.05)
        self.assertLess(ben.hp, 100.0)
        self.assertEqual((ann.hp, cyd.hp), (100.0, 100.0))
        ben.hp, cyd.hp = 0.0, 0.0                          # now Ben and Cyd both fall
        ben.down, cyd.down = True, True
        room.order += [cyd, ben]
        room.step(0.05)
        end = await ws[0].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((end["mode"], end["won"], end["place"], end["reason"]), ("brawl", True, 0, "ko"))
        endb = await ws[1].until(lambda m: m["t"] == "end", timeout=3)
        endc = await ws[2].until(lambda m: m["t"] == "end", timeout=3)
        self.assertEqual((endb["place"], endc["place"], endb["won"]), (1, 2, False))   # Ben fell last of the two
        self.assertIn("rank", end)

    async def test_brawl_leaving_does_not_stop_the_others(self):
        ws, ms, room = await self.start_arena("brawl", 3)
        ws[2].w.close()
        await asyncio.sleep(0.4)
        room.step(0.05)
        st = await ws[0].until(lambda m: m["t"] == "arena", timeout=3)
        self.assertEqual(st["p"][2][8], 1)                 # Cyd is shown as out
        self.assertFalse(room.over)

    async def test_brawl_a_lone_player_who_asks_gets_practice_bots_that_do_not_count(self):
        server.CFG["bot_wait"] = 0.5
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "brawl", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(len(m["players"]), 4)
        self.assertEqual(sum(1 for p in m["players"] if p["bot"]), 3)
        self.assertFalse(m["ranked"])

    async def test_team2_two_teams_of_two_and_no_friendly_fire(self):
        ws, ms, room = await self.start_arena("team2", 4)
        self.assertEqual([p["team"] for p in ms[0]["players"]], [0, 1, 0, 1])
        ann, ben, cyd, dee = room.fighters
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0
        ann.x, ann.z, ann.yaw = 0.0, 0.0, -math.pi / 2
        cyd.x, cyd.z = 1.5, 1.5                            # her partner stands right beside her
        ben.x, ben.z = 2.0, 0.0                            # an opponent two metres ahead
        ws[0].send({"t": "swing"})
        await asyncio.sleep(0.2)
        for _ in range(8):
            room.step(0.05)
        self.assertLess(ben.hp, 100.0)
        self.assertEqual(cyd.hp, 100.0)

    async def test_team2_the_team_left_standing_wins_together(self):
        ws, ms, room = await self.start_arena("team2", 4)
        ann, ben, cyd, dee = room.fighters
        for f in room.fighters:
            f.x, f.z = 18.0, 18.0
        for f in (ben, dee):
            f.down, f.hp = True, 0.0
            room.order.append(f)
        room.step(0.05)
        ends = [await w.until(lambda m: m["t"] == "end", timeout=3) for w in ws]
        self.assertEqual([e["won"] for e in ends], [True, False, True, False])
        self.assertEqual([e["place"] for e in ends], [0, 1, 0, 1])

    async def test_team2_a_lone_player_gets_a_partner_and_two_opponents(self):
        server.CFG["bot_wait"] = 0.5
        a = await self.player("Solo")
        a.send({"t": "queue", "mode": "team2", "bot": True})
        m = await a.until(lambda m: m["t"] == "match", timeout=4)
        self.assertEqual(sorted(p["team"] for p in m["players"]), [0, 0, 1, 1])
        self.assertFalse(m["ranked"])

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

    async def test_flowers_thrown_at_a_player_hit_them_and_are_seen_nearby(self):
        ann, bob, cy = await self.player("Ann"), await self.player("Bob"), await self.player("Cy")
        ann.send({"t": "walk", "c": "rome", "x": 100, "z": 50, "yaw": 0, "s": 0})
        bob.send({"t": "walk", "c": "rome", "x": 100, "z": 42, "yaw": 0, "s": 0})      # 8 m in front of Ann (she faces -z when yaw is 0)
        cy.send({"t": "walk", "c": "rome", "x": 160, "z": 50, "yaw": 0, "s": 0})       # 60 m to the side: sees the flowers, is not hit
        await asyncio.sleep(0.3)
        ann.send({"t": "fest", "k": "throw", "c": "rome", "x": 100, "z": 50, "yaw": 0, "f": "floralia"})
        hit = await bob.until(lambda m: m["t"] == "fest" and m["k"] == "hit")
        self.assertEqual((hit["n"], hit["f"]), ("Ann", "floralia"))
        seen = await cy.until(lambda m: m["t"] == "fest" and m["k"] == "burst")
        self.assertEqual(seen["x"], 100.0)
        with self.assertRaises(asyncio.TimeoutError):                                      # Cy was not in front of her
            await cy.until(lambda m: m["t"] == "fest" and m["k"] == "hit", timeout=0.5)

    async def test_friends_can_give_each_other_denarii(self):
        self.accounts("ann", "bob", "cy")
        ann, bob, cy = await self.player("Ann", token="ann"), await self.player("Bob", token="bob"), await self.player("Cy", token="cy")
        ann.send({"t": "social", "a": "req", "name": "bob"})
        asked = await bob.until(lambda m: m["t"] == "fr_in")
        bob.send({"t": "social", "a": "ans", "fid": asked["fid"], "ok": True})
        added = await ann.until(lambda m: m["t"] == "fr_added")
        await bob.until(lambda m: m["t"] == "fr_added")
        ann.send({"t": "social", "a": "give", "fid": added["fid"], "n": 250})
        gift = await bob.until(lambda m: m["t"] == "fr_gift")
        self.assertEqual((gift["name"], gift["n"]), ("Ann", 250))
        sent = await ann.until(lambda m: m["t"] == "fr_gave")
        self.assertEqual(sent["n"], 250)
        # a gift that was never confirmed (an old page, or the friend was away) is sent again, until the browser says it has it
        bob2 = await self.player("Bob", token="bob")
        again = await bob2.until(lambda m: m["t"] == "fr_gift")
        self.assertEqual((again["id"], again["n"]), (gift["id"], 250))
        bob2.send({"t": "social", "a": "gift_ack", "id": gift["id"]})
        await asyncio.sleep(0.3)
        self.assertEqual(server.PENDING_GIFTS.get(added["fid"], []), [])
        # not too much, not too fast, and not to someone who is not a friend
        ann.send({"t": "social", "a": "give", "fid": added["fid"], "n": 999999})
        self.assertIn("between", (await ann.until(lambda m: m["t"] == "fr_msg"))["msg"])
        ann.send({"t": "social", "a": "give", "fid": added["fid"], "n": 5})
        self.assertIn("Slow down", (await ann.until(lambda m: m["t"] == "fr_msg" and "Slow" in m["msg"]))["msg"])
        cy.send({"t": "social", "a": "req", "name": "ann"})
        stranger = await ann.until(lambda m: m["t"] == "fr_in")
        ann.send({"t": "social", "a": "give", "fid": stranger["fid"], "n": 10})
        self.assertIn("only give", (await ann.until(lambda m: m["t"] == "fr_msg" and "only give" in m["msg"]))["msg"])

    async def test_friends_can_trade_with_a_lock_in_from_both_sides(self):
        self.accounts("ann", "bob", "cy")
        ann, bob, cy = await self.player("Ann", token="ann"), await self.player("Bob", token="bob"), await self.player("Cy", token="cy")
        ann.send({"t": "social", "a": "req", "name": "bob"})
        asked = await bob.until(lambda m: m["t"] == "fr_in")
        bob.send({"t": "social", "a": "ans", "fid": asked["fid"], "ok": True})
        added = await ann.until(lambda m: m["t"] == "fr_added")
        await bob.until(lambda m: m["t"] == "fr_added")
        fa, fb = added["fid"], asked["fid"]
        # only friends can be asked
        cy.send({"t": "social", "a": "trade_req", "fid": fa})                                               # Cy is nobody's friend
        self.assertIn("only trade with your friends", (await cy.until(lambda m: m["t"] == "fr_msg" and "friends" in m["msg"]))["msg"])
        # Ann asks, Bob says yes: both windows open
        ann.send({"t": "social", "a": "trade_req", "fid": fa})                                              # (fa is Bob's friend id, as Ann sees it)
        req = await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "req")
        self.assertEqual(req["name"], "Ann")
        bob.send({"t": "social", "a": "trade_yes", "fid": req["fid"]})
        await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "open"); await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "open")
        # offers: each sees the other's, bad ids are dropped, and changing an offer unlocks both
        ann.send({"t": "social", "a": "trade_offer", "items": ["r_ring", "bad id!", "r_ring", "hound"], "coins": 50})
        seen = await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "theirs")
        self.assertEqual((seen["items"], seen["coins"]), (["r_ring", "hound"], 50))
        bob.send({"t": "social", "a": "trade_offer", "items": ["wreath"], "coins": 0})
        await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "theirs")
        ann.send({"t": "social", "a": "trade_ok"})
        await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "theirs_ok")
        bob.send({"t": "social", "a": "trade_offer", "items": ["wreath", "crown"], "coins": 0})            # a change after Ann locked in: Ann is unlocked again
        await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "theirs")
        ann.send({"t": "social", "a": "trade_ok"}); bob.send({"t": "social", "a": "trade_ok"})
        done_a = await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "done")
        done_b = await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "done")
        self.assertEqual((done_a["get"]["items"], done_a["give"]["items"]), (["wreath", "crown"], ["r_ring", "hound"]))
        self.assertEqual((done_b["get"]["items"], done_b["get"]["coins"]), (["r_ring", "hound"], 50))
        # cancelling and leaving close the trade
        ann.send({"t": "social", "a": "trade_req", "fid": fa}); req = await bob.until(lambda m: m["t"] == "fr_trade" and m["s"] == "req")
        bob.send({"t": "social", "a": "trade_yes", "fid": req["fid"]}); await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "open")
        bob.send({"t": "social", "a": "trade_cancel"})
        self.assertIn("stopped the trade", (await ann.until(lambda m: m["t"] == "fr_trade" and m["s"] == "closed"))["why"])

    async def test_leaderboards_rank_players_and_let_them_hide(self):
        server.LEADERS.clear()
        self.accounts("ann", "bob")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob", token="bob")
        ann.send({"t": "social", "a": "stats", "coins": 5000, "relics": 3, "houses": 1})
        bob.send({"t": "social", "a": "stats", "coins": 9000, "relics": 0, "houses": 4})
        await asyncio.sleep(0.2)
        ann.send({"t": "social", "a": "leaders"})
        top = await ann.until(lambda m: m["t"] == "leaders")
        self.assertEqual(top["coins"], [["Bob", 9000], ["Ann", 5000]])
        self.assertEqual((top["relics"], top["houses"]), ([["Ann", 3]], [["Bob", 4], ["Ann", 1]]))        # a zero is not listed
        bob.send({"t": "social", "a": "stats", "hide": 1}); await asyncio.sleep(0.2)                           # Bob switches himself off
        ann.send({"t": "social", "a": "leaders"})
        top = await ann.until(lambda m: m["t"] == "leaders")
        self.assertEqual(top["coins"], [["Ann", 5000]])
        ann.send({"t": "social", "a": "stats", "coins": 10 ** 15, "relics": 99, "houses": -5}); await asyncio.sleep(0.2)   # silly numbers are clamped
        ann.send({"t": "social", "a": "leaders"})
        top = await ann.until(lambda m: m["t"] == "leaders")
        self.assertEqual((top["relics"], top["houses"]), ([["Ann", 12]], []))

    async def test_guilds_share_a_chat_and_a_treasury_the_leader_controls(self):
        server.GUILDS.clear(); server.GUILD_OF.clear()
        self.accounts("ann", "bob", "cy")
        ann, bob, cy = await self.player("Ann", token="ann"), await self.player("Bob", token="bob"), await self.player("Cy", token="cy")
        ann.send({"t": "social", "a": "g_make", "name": "Red Eagles", "tag": "ead!"})
        st = await ann.until(lambda m: m["t"] == "guild" and m["g"])
        self.assertEqual((st["g"]["name"], st["g"]["tag"], len(st["g"]["members"])), ("Red Eagles", "EAD", 1))
        bob.send({"t": "social", "a": "g_make", "name": "red eagles", "tag": "XX"})                     # the name is taken
        self.assertIn("already a guild", (await bob.until(lambda m: m["t"] == "fr_msg"))["msg"])
        bob.send({"t": "social", "a": "g_join", "name": "Red Eagles"})
        st = await ann.until(lambda m: m["t"] == "guild" and m["g"] and len(m["g"]["members"]) == 2)
        bob.send({"t": "social", "a": "g_say", "text": "hello guild"})
        st = await ann.until(lambda m: m["t"] == "guild" and any(c["text"] == "hello guild" for c in m["g"]["chat"]))
        bob.send({"t": "social", "a": "g_dep", "n": 800})
        paid = await bob.until(lambda m: m["t"] == "g_paid")
        self.assertEqual(paid["n"], 800)
        bob.send({"t": "social", "a": "g_pay", "fid": server.fid_of("u-bob"), "n": 100})                # only the leader pays out
        self.assertIn("leader", (await bob.until(lambda m: m["t"] == "fr_msg"))["msg"])
        ann.send({"t": "social", "a": "g_pay", "fid": server.fid_of("u-bob"), "n": 500})
        self.assertEqual((await bob.until(lambda m: m["t"] == "g_got"))["n"], 500)
        ann.send({"t": "social", "a": "g_pay", "fid": server.fid_of("u-bob"), "n": 500})                # more than the treasury holds
        self.assertIn("treasury holds 300", (await ann.until(lambda m: m["t"] == "fr_msg"))["msg"])
        ann.send({"t": "social", "a": "g_list"})
        self.assertEqual((await ann.until(lambda m: m["t"] == "guilds"))["list"][0]["treasury"], 300)
        ann.send({"t": "chat", "text": "hi all"})
        self.assertEqual((await cy.until(lambda m: m["t"] == "chat" and m.get("text") == "hi all"))["tag"], "EAD")   # the tag shows in the main chat
        ann.send({"t": "social", "a": "g_kick", "fid": server.fid_of("u-bob")})
        await bob.until(lambda m: m["t"] == "guild" and m["g"] is None)
        ann.send({"t": "social", "a": "g_leave"})
        await asyncio.sleep(0.2)
        self.assertEqual(server.GUILDS, {})                                                              # the last member out closes the guild

    async def test_the_exchange_shows_shared_prices_and_prices_each_trade(self):
        ann, bob = await self.player("Ann"), await self.player("Bob")
        ann.send({"t": "stock", "a": "list"})
        a = await ann.until(lambda m: m["t"] == "stocks")
        self.assertEqual(len(a["list"]), 8)
        bob.send({"t": "stock", "a": "list"})
        b = await bob.until(lambda m: m["t"] == "stocks")
        self.assertEqual([(r["id"], r["price"]) for r in a["list"]], [(r["id"], r["price"]) for r in b["list"]])        # everyone sees the same prices
        price = a["list"][0]["price"]
        ann.send({"t": "stock", "a": "buy", "id": a["list"][0]["id"], "n": 10})
        fill = await ann.until(lambda m: m["t"] == "stock_fill")
        self.assertEqual((fill["side"], fill["n"], fill["price"]), ("buy", 10, price))
        self.assertGreater(fill["total"], price * 10)                                                                   # the one percent fee is added
        ann.send({"t": "stock", "a": "sell", "id": a["list"][0]["id"], "n": 10 ** 9})                                    # a silly amount is clamped
        self.assertEqual((await ann.until(lambda m: m["t"] == "stock_fill"))["n"], server.STOCK_MAX_N)
        ann.send({"t": "stock", "a": "buy", "id": "nonsense", "n": 5})
        with self.assertRaises(asyncio.TimeoutError):
            await ann.until(lambda m: m["t"] == "stock_fill", timeout=0.4)

    def test_prices_wander_but_stay_in_bounds(self):
        server.STOCKS["t"] -= 3600 * 6
        server.stocks_catch_up()
        for sid, name, base, vol in server.STOCK_DEFS:
            self.assertTrue(base * 0.15 <= server.STOCKS["p"][sid] <= base * 6)
            self.assertLessEqual(len(server.STOCKS["hist"][sid]), server.STOCK_HIST)

    async def test_race_events_keep_each_players_best_time(self):
        server.EVENT_BEST.clear()
        self.accounts("ann", "bob")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob", token="bob")
        ann.send({"t": "social", "a": "ev_time", "course": "rome-car", "ms": 90000, "len": 1500})
        bob.send({"t": "social", "a": "ev_time", "course": "rome-car", "ms": 80000, "len": 1500})
        await asyncio.sleep(0.2)
        ann.send({"t": "social", "a": "ev_time", "course": "rome-car", "ms": 95000, "len": 1500})     # slower: the best stays
        ann.send({"t": "social", "a": "ev_top", "course": "rome-car"})
        top = await ann.until(lambda m: m["t"] == "ev_top" and len(m["list"]) == 2 and m["list"][0][0] == "Bob")
        self.assertEqual(top["list"], [["Bob", 80000], ["Ann", 90000]])
        ann.send({"t": "social", "a": "ev_time", "course": "rome-car", "ms": 12000, "len": 40000})  # 3,300 m/s is not possible
        ann.send({"t": "social", "a": "ev_time", "course": "mars-car", "ms": 90000, "len": 1500})    # no such course
        await asyncio.sleep(0.2)
        ann.send({"t": "social", "a": "ev_top", "course": "rome-car"})
        top = await ann.until(lambda m: m["t"] == "ev_top")
        self.assertEqual(top["list"][1], ["Ann", 90000])
        self.assertNotIn("mars-car", server.EVENT_BEST)

    async def test_everyone_builds_the_same_pyramid(self):
        server.PYRAMID.update({"blocks": 0, "done": 0, "who": {}})
        ann, bob = await self.player("Ann"), await self.player("Bob")
        ann.send({"t": "pyr_add"})
        st = await bob.until(lambda m: m["t"] == "pyr" and m["blocks"] == 1)                       # Bob sees Ann's block
        self.assertEqual(st["top"], [["Ann", 1]])
        ann.send({"t": "pyr_add"})                                                                 # too soon: ignored
        with self.assertRaises(asyncio.TimeoutError):
            await bob.until(lambda m: m["t"] == "pyr" and m["blocks"] == 2, timeout=0.4)
        server.PYRAMID["blocks"] = server.PYR_NEED - 1
        server.PYRAMID["who"] = {"Ann": 7, "Bob": 2}
        bob.send({"t": "pyr_add"})
        done = await ann.until(lambda m: m["t"] == "pyr_done")                                      # the last block finishes it
        self.assertEqual((done["who"], done["done"]), (["Ann"], 1))
        st = await ann.until(lambda m: m["t"] == "pyr")
        self.assertEqual(st["blocks"], 0)

    async def test_titles_show_in_chat_but_only_the_real_ones(self):
        self.accounts("ann")
        ann, bob = await self.player("Ann", token="ann"), await self.player("Bob")
        ann.send({"t": "social", "a": "title", "title": "Champion"}); await asyncio.sleep(0.2)
        ann.send({"t": "chat", "text": "hello"})
        self.assertEqual((await bob.until(lambda m: m["t"] == "chat" and m.get("text") == "hello"))["title"], "Champion")
        ann.send({"t": "social", "a": "title", "title": "King of Everything"}); await asyncio.sleep(0.2)   # not a real title
        ann.send({"t": "chat", "text": "again"})
        self.assertEqual((await bob.until(lambda m: m["t"] == "chat" and m.get("text") == "again"))["title"], "")

    async def test_the_world_is_saved_and_loaded_again(self):
        saved = {}

        def fake_http(url, headers, body=None, method=None, timeout=8):
            if method == "POST":
                for row in body:
                    saved[row["key"]] = row["data"]
                return None
            return [{"key": k, "data": v} for k, v in saved.items()]
        old = (server._http_json, dict(server.CFG))
        server._http_json = fake_http
        server.CFG.update({"supabase_url": "https://example.supabase.co", "service_key": "service"})
        try:
            server._world_sig.clear()
            server.GUILDS.clear(); server.GUILD_OF.clear(); server.LEADERS.clear(); server.EVENT_BEST.clear()
            server.GUILDS["red"] = {"name": "Red", "tag": "RED", "leader": "aaa", "members": {"aaa": "Ann"}, "treasury": 250, "chat": [], "paid": [0.0, 0]}
            server.GUILD_OF["aaa"] = "red"
            server.LEADERS["aaa"] = {"name": "Ann", "coins": 900, "relics": 1, "houses": 0, "t": time.time()}
            server.EVENT_BEST["rome-car"] = {"aaa": {"name": "Ann", "ms": 90000}}
            server.PYRAMID.update({"blocks": 42, "done": 2, "who": {"Ann": 9}})
            self.assertGreaterEqual(await server.world_save(), 4)
            self.assertEqual(await server.world_save(), 0)                                   # nothing changed: nothing sent
            server.GUILDS.clear(); server.GUILD_OF.clear(); server.LEADERS.clear(); server.EVENT_BEST.clear(); server.PYRAMID.update({"blocks": 0, "done": 0, "who": {}})
            self.assertTrue(await server.world_load())                                        # a restart: it all comes back
            self.assertEqual(server.GUILDS["red"]["treasury"], 250)
            self.assertEqual(server.GUILD_OF["aaa"], "red")
            self.assertEqual(server.LEADERS["aaa"]["coins"], 900)
            self.assertEqual(server.EVENT_BEST["rome-car"]["aaa"]["ms"], 90000)
            self.assertEqual((server.PYRAMID["blocks"], server.PYRAMID["done"]), (42, 2))
        finally:
            server._http_json = old[0]
            server.CFG.clear(); server.CFG.update(old[1])
            server._world_sig.clear()

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
