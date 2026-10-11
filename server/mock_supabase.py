#!/usr/bin/env python3
"""A small stand-in for Supabase, for testing the login and saving on your own computer.
NOT for real use: it keeps everything in memory and has no real security.   python3 server/mock_supabase.py  (port 54321)
It speaks the same web API shapes as Supabase for: sign up, log in, refresh, log out, whoami, and the profiles and
entitlements tables. Like real Supabase, a player can read their own entitlements but only the service key can write them."""
import json
import os
import secrets
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ANON, SERVICE = "anon-test-key-123456", "service-test-key-123456"
USERS, SESSIONS, REFRESH, PROFILES, ENTITLEMENTS = {}, {}, {}, {}, {}


def session_for(user):
    access, refresh = secrets.token_hex(16), secrets.token_hex(16)
    SESSIONS[access] = user["id"]
    REFRESH[refresh] = user["id"]
    exp = int(time.time()) + 3600
    return {"access_token": access, "refresh_token": refresh, "expires_in": 3600, "expires_at": exp, "token_type": "bearer", "user": {"id": user["id"], "email": user["email"]}}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "apikey, authorization, content-type, prefer, x-client-info")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")

    def reply(self, code, obj=None):
        body = json.dumps(obj).encode() if obj is not None else b""
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def body(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"null")
        except ValueError:
            return None

    def bearer(self):
        return (self.headers.get("Authorization") or "").replace("Bearer ", "", 1)

    def user(self):
        uid = SESSIONS.get(self.bearer())
        return next((u for u in USERS.values() if u["id"] == uid), None)

    def do_OPTIONS(self):
        self.reply(204)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if self.headers.get("apikey") not in (ANON, SERVICE):
            return self.reply(401, {"message": "Invalid API key"})
        if u.path == "/auth/v1/user":
            me = self.user()
            return self.reply(200, {"id": me["id"], "email": me["email"]}) if me else self.reply(401, {"msg": "invalid token"})
        if u.path in ("/rest/v1/profiles", "/rest/v1/entitlements"):
            service = self.bearer() == SERVICE
            me = self.user()
            if not service and not me:
                return self.reply(401, {"message": "JWT required"})
            want = (q.get("user_id", [""])[0]).replace("eq.", "", 1)
            if not service and want != me["id"]:
                return self.reply(200, [])        # row-level security: you only ever see your own row
            table = PROFILES if u.path.endswith("profiles") else ENTITLEMENTS
            row = table.get(want)
            return self.reply(200, [row] if row else [])
        self.reply(404, {"message": "not found"})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        data = self.body()
        if self.headers.get("apikey") not in (ANON, SERVICE):
            return self.reply(401, {"message": "Invalid API key"})
        if u.path == "/auth/v1/signup" and isinstance(data, dict):
            email = str(data.get("email", "")).lower()
            if email in USERS:
                return self.reply(422, {"msg": "User already registered"})
            user = {"id": "%08x-0000-4000-8000-%012x" % (secrets.randbits(32), secrets.randbits(48)), "email": email, "password": data.get("password")}
            USERS[email] = user
            return self.reply(200, session_for(user))
        if u.path == "/auth/v1/token":
            grant = q.get("grant_type", [""])[0]
            if grant == "password":
                user = USERS.get(str((data or {}).get("email", "")).lower())
                if not user or user["password"] != (data or {}).get("password"):
                    return self.reply(400, {"error_description": "Invalid login credentials"})
                return self.reply(200, session_for(user))
            if grant == "refresh_token":
                uid = REFRESH.pop((data or {}).get("refresh_token"), None)
                user = next((x for x in USERS.values() if x["id"] == uid), None)
                return self.reply(200, session_for(user)) if user else self.reply(400, {"error_description": "Invalid Refresh Token"})
        if u.path == "/auth/v1/logout":
            SESSIONS.pop(self.bearer(), None)
            return self.reply(204)
        if u.path == "/rest/v1/profiles":
            me = self.user()
            if not me or not isinstance(data, dict) or data.get("user_id") != me["id"]:
                return self.reply(403, {"message": "row-level security: you can only write your own profile"})
            PROFILES[me["id"]] = {"user_id": me["id"], "character": data.get("character", {}), "progress": data.get("progress", {})}
            return self.reply(201)
        if u.path == "/rest/v1/entitlements":
            if self.bearer() != SERVICE:
                return self.reply(403, {"message": "row-level security: only the service key can write entitlements"})
            for row in (data if isinstance(data, list) else [data]):
                ENTITLEMENTS[row["user_id"]] = {"user_id": row["user_id"], "premium": bool(row.get("premium"))}
            return self.reply(201)
        self.reply(404, {"message": "not found"})


if __name__ == "__main__":
    port = int(os.environ.get("MOCK_PORT", "54321"))
    print("mock Supabase on port %d  (anon key: %s)" % (port, ANON))
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
