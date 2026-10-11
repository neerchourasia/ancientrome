# The game server (live duels and races against real people)

`server.py` is one small Python program (Python 3.9+, **nothing to install**). It is the referee: it decides health,
damage and who finishes first, so players cannot cheat by editing their own browser.

```bash
python3 server/server.py          # listens on port 8765 (or $PORT)
python3 server/test_server.py     # 26 tests: duels, team battles, naval battles, races, cheating, abuse
python3 server/mock_supabase.py   # a fake Supabase, only for testing logins on your own computer
```

With no settings it runs as a free local server: no accounts needed, anyone on `localhost` can play, practice bots on.
Open the game, click **🌐 Play online**, tick "practice bot" and press **Duel** or **Race**.

## Settings (environment variables)

| Name | What it is |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co`. Turns on accounts (logging in and saving your game) |
| `SUPABASE_ANON_KEY` | the public "anon" key (used to check a login) |
| `ALLOWED_ORIGINS` | your site's address, e.g. `https://ancientrome-gold.vercel.app` (comma separated; `*` = anyone). Without it only pages on localhost can connect |
| `ALLOW_BOTS` | `1` (default) lets a lone player face a practice bot |
| `PORT` | default 8765 (hosts like Render set this for you) |
| `RACE_LAPS`, `BOT_WAIT`, `RACE_WAIT`, `COOP_WAIT`, `NAVAL_WAIT`, `MAX_CONNS`, `MAX_PER_IP` | fine tuning |

## Putting it online (Render, free to start)

1. Make sure your code is on GitHub (`git push`).
2. On **render.com** sign up, then **New > Web Service**, pick your repo.
3. **Runtime:** Python 3. **Build command:** leave empty. **Start command:** `python3 server/server.py`.
4. Under **Environment** add the settings above (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`).
5. Deploy. You get an address like `https://rome-game.onrender.com`. Check `https://rome-game.onrender.com/health` shows `{"ok": true ...}`.
6. In `config.js` set `serverUrl: "wss://rome-game.onrender.com/play"`, then `git push` so the site updates.

Render's free plan puts the server to sleep when nobody uses it; the first player waits about a minute for it to wake.
A paid plan (a few dollars a month) keeps it awake. Fly.io and Railway work the same way (same start command).

## Accounts, step by step

1. **Supabase**: create a project, run `supabase.sql` in its SQL Editor, copy the URL and the anon key into `config.js` and into the server's settings.
2. Everything is free: there is nothing to pay for, and no payment service is involved.

## How the server protects the game

- Health, damage, stamina, range and facing in duels are decided here; positions are speed-limited and kept in the arena.
- Naval battle: free-for-all, no teams, 2-4 captains (two practice ships if you play alone and ask for bots). Browsers send where their ship is (speed and the flooded arena's edge are enforced); the server fires every cannonball and decides every hit, ram and who is the last ship afloat.
- Team battles: the server runs the five enemy bots, the friendly bots, every hit and every revive; players still cannot hurt each other or heal themselves.
- Race progress is capped to what a chariot can really do, and the order of finishing is decided here.
- Names, classes and looks sent by players are cleaned.
- Connections from other websites are refused, message size and rate are limited, and each address may hold only a few connections.

## What is not included yet

Text chat (deliberately: moderating chat is a big job), ranked ladders, and spectating. Matches are one duel or one race at a time.
