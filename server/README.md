# The game server (live duels and races against real people)

`server.py` is one small Python program (Python 3.9+, **nothing to install**). It is the referee: it decides health,
damage and who finishes first, so players cannot cheat by editing their own browser. It also checks Premium and
receives Stripe's "payment completed" message.

```bash
python3 server/server.py          # listens on port 8765 (or $PORT)
python3 server/test_server.py     # 21 tests: duels, team battles, races, cheating, payments, abuse
python3 server/mock_supabase.py   # a fake Supabase, only for testing logins on your own computer
```

With no settings it runs as a free local server: no accounts needed, anyone on `localhost` can play, practice bots on.
Open the game, click **🌐 Play online**, tick "practice bot" and press **Duel** or **Race**.

## Settings (environment variables)

| Name | What it is |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co`. Turns on accounts: players must log in and have Premium |
| `SUPABASE_ANON_KEY` | the public "anon" key (used to check a login) |
| `SUPABASE_SERVICE_KEY` | the **secret** "service_role" key. Only here, never in the website, never in git |
| `STRIPE_WEBHOOK_SECRET` | the signing secret (`whsec_...`) of your Stripe webhook |
| `ALLOWED_ORIGINS` | your site's address, e.g. `https://ancientrome-gold.vercel.app` (comma separated; `*` = anyone). Without it only pages on localhost can connect |
| `REQUIRE_PREMIUM` | `1` (default when Supabase is set) or `0` |
| `ALLOW_BOTS` | `1` (default) lets a lone player face a practice bot |
| `PORT` | default 8765 (hosts like Render set this for you) |
| `RACE_LAPS`, `BOT_WAIT`, `RACE_WAIT`, `COOP_WAIT`, `MAX_CONNS`, `MAX_PER_IP` | fine tuning |

## Putting it online (Render, free to start)

1. Make sure your code is on GitHub (`git push`).
2. On **render.com** sign up, then **New > Web Service**, pick your repo.
3. **Runtime:** Python 3. **Build command:** leave empty. **Start command:** `python3 server/server.py`.
4. Under **Environment** add the settings above (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`,
   `STRIPE_WEBHOOK_SECRET`, `ALLOWED_ORIGINS`).
5. Deploy. You get an address like `https://rome-game.onrender.com`. Check `https://rome-game.onrender.com/health` shows `{"ok": true ...}`.
6. In `config.js` set `serverUrl: "wss://rome-game.onrender.com/play"`, then `git push` so the site updates.

Render's free plan puts the server to sleep when nobody uses it; the first player waits about a minute for it to wake.
A paid plan (a few dollars a month) keeps it awake. Fly.io and Railway work the same way (same start command).

## Premium and payments, step by step

1. **Supabase**: create a project, run `supabase.sql` in its SQL Editor, copy the URL, anon key and service_role key.
2. **Stripe**: Products > create "Premium" with a price > **Payment Links** > create a link. Copy it into `config.js`
   (`checkoutUrl`, and `price` for display). The game adds the buyer's account id to the link automatically.
3. **Stripe webhook**: Developers > Webhooks > Add endpoint: `https://YOUR-SERVER/stripe-webhook`, event
   `checkout.session.completed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET` on the server.
4. Try a test payment with Stripe's test mode (card `4242 4242 4242 4242`). Within a minute the player's account shows **★ Premium**.

Premium is granted only by that webhook, after the signature is checked, by the server using the secret key. A player
cannot grant it to themselves: the database refuses (`supabase.sql`).

## How the server protects the game

- Health, damage, stamina, range and facing in duels are decided here; positions are speed-limited and kept in the arena.
- Team battles: the server runs the five enemy bots, the friendly bots, every hit and every revive; players still cannot hurt each other or heal themselves.
- Race progress is capped to what a chariot can really do, and the order of finishing is decided here.
- Names, classes and looks sent by players are cleaned; premium colours are removed for non-premium players.
- Connections from other websites are refused, message size and rate are limited, and each address may hold only a few connections.
- Webhooks need a valid Stripe signature that is less than 5 minutes old.

## What is not included yet

Text chat (deliberately: moderating chat is a big job), ranked ladders, and spectating. Matches are one duel or one race at a time.
