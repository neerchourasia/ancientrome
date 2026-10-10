#!/usr/bin/env python3
"""Tests for server.py. Run:  python3 server/test_server.py
Plays the part of real browsers (WebSocket clients) and of Stripe, including cheating and abusive ones."""
import asyncio
import base64
import hashlib
import hmac
import json
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
        self.saved = (server.verify_token, server.lookup_premium, server.grant_premium, server.RACE_TOTAL, server.RACE_COUNTDOWN, server.RACE_GRACE)
        server.CFG.update(require_premium=False, bot_wait=0.6, race_wait=0.6, origins=[], supabase_url="", stripe_secret="")
        self.srv = await server.serve("127.0.0.1", 0)
        self.port = self.srv.sockets[0].getsockname()[1]
        self.clients = []

    async def asyncTearDown(self):
        for c in list(server.CONNS):
            c.close()
        self.srv.close()
        server.CONNS.clear()
        for q in server.QUEUES.values():
            q.clear()
        server.CFG.clear()
        server.CFG.update(self.cfg)
        server.verify_token, server.lookup_premium, server.grant_premium, server.RACE_TOTAL, server.RACE_COUNTDOWN, server.RACE_GRACE = self.saved
        for t in asyncio.all_tasks():
            if t is not asyncio.current_task() and "matchmaker" in repr(t):
                t.cancel()

    async def player(self, name="Ann", cls="gladiator", token=None, look=None):
        ws = await WS.connect(self.port)
        self.clients.append(ws)
        ws.send({"t": "hello", "name": name, "cls": cls, "token": token, "look": look or {}})
        ws.welcome = await ws.until(lambda m: m["t"] == "welcome")
        return ws

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
        self.assertFalse(a.welcome["premium"])
        self.assertEqual(server.clean_name("<b>Mara</b>"), "bMarab")
        self.assertEqual(server.clean_look({"toga": 99, "skin": True, "hair": 2}, True), {"skin": 0, "hair": 2, "toga": 0, "sash": 0})
        # premium colours are only for premium players
        self.assertEqual(server.clean_look({"toga": 5, "sash": 5}, False), {"skin": 0, "hair": 0, "toga": 0, "sash": 0})
        self.assertEqual(server.clean_look({"toga": 5, "sash": 5}, True)["toga"], 5)

    async def test_must_say_hello_first(self):
        ws = await WS.connect(self.port)
        ws.send({"t": "queue", "mode": "duel"})
        m = await ws.until(lambda m: m["t"] == "error")
        self.assertEqual(m["code"], "hello")

    # ---------------------------------------------------------------- premium

    async def test_online_play_needs_premium(self):
        server.CFG.update(require_premium=True, supabase_url="https://example.supabase.co")

        async def fake_verify(token):
            return {"free": "user-free", "paid": "user-paid"}.get(token)

        async def fake_premium(uid):
            return uid == "user-paid"
        server.verify_token, server.lookup_premium = fake_verify, fake_premium

        guest = await self.player(token=None)
        guest.send({"t": "queue", "mode": "duel"})
        self.assertEqual((await guest.until(lambda m: m["t"] == "error"))["code"], "premium")

        free = await self.player(token="free")
        self.assertFalse(free.welcome["premium"])
        free.send({"t": "queue", "mode": "race"})
        self.assertEqual((await free.until(lambda m: m["t"] == "error"))["code"], "premium")

        paid = await self.player(token="paid")
        self.assertTrue(paid.welcome["premium"])
        paid.send({"t": "queue", "mode": "duel"})
        self.assertEqual((await paid.until(lambda m: m["t"] in ("queued", "error")))["t"], "queued")

        forged = await self.player(token="a-forged-token")
        self.assertFalse(forged.welcome["account"])

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

    # ---------------------------------------------------------------- payments

    def webhook(self, event, secret="whsec_test", at=None, tamper=False):
        body = json.dumps(event).encode()
        t = str(int(at if at is not None else time.time()))
        sig = hmac.new(secret.encode(), t.encode() + b"." + body, hashlib.sha256).hexdigest()
        if tamper:
            body = body.replace(b"paid", b"unpaid")
        return body, "t=%s,v1=%s" % (t, sig)

    async def post_webhook(self, body, sig):
        r, w = await asyncio.open_connection("127.0.0.1", self.port)
        w.write(b"POST /stripe-webhook HTTP/1.1\r\nHost: x\r\nStripe-Signature: " + sig.encode() + b"\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
        return int((await r.read()).decode().split(" ")[1])

    async def test_stripe_webhook_grants_premium_only_when_genuine(self):
        granted = []

        async def fake_grant(uid):
            granted.append(uid)
        server.grant_premium = fake_grant
        server.CFG["stripe_secret"] = "whsec_test"
        uid = "123e4567-e89b-12d3-a456-426614174000"
        event = {"type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "paid"}}}

        self.assertEqual(await self.post_webhook(*self.webhook(event)), 200)
        self.assertEqual(granted, [uid])
        granted.clear()
        self.assertEqual(await self.post_webhook(*self.webhook(event, secret="wrong-secret")), 400)      # forged
        self.assertEqual(await self.post_webhook(*self.webhook(event, tamper=True)), 400)                  # altered after signing
        self.assertEqual(await self.post_webhook(*self.webhook(event, at=time.time() - 3600)), 400)       # replayed an hour later
        unpaid = {"type": "checkout.session.completed", "data": {"object": {"client_reference_id": uid, "payment_status": "unpaid"}}}
        self.assertEqual(await self.post_webhook(*self.webhook(unpaid)), 200)
        bad_id = {"type": "checkout.session.completed", "data": {"object": {"client_reference_id": "../../x", "payment_status": "paid"}}}
        self.assertEqual(await self.post_webhook(*self.webhook(bad_id)), 200)
        self.assertEqual(granted, [])                                                                       # nothing granted by any of those

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
