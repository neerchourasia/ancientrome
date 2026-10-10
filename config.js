"use strict";
// The settings you change when you put the game online. Everything in this file is PUBLIC (it is sent to every
// player's browser), so never put a secret key here. Secret keys go only on the game server (server/README.md).
window.ROME_CONFIG = {
  // Accounts and saving (Supabase > Project Settings > API). The "anon public" key is meant to be public.
  supabaseUrl: "",       // e.g. "https://abcdefghijkl.supabase.co"
  supabaseAnonKey: "",   // the long "anon public" key. NEVER the service_role key.
  // The game server for playing real people (see server/README.md), e.g. "wss://rome-game.onrender.com/play".
  // Leave empty to use ws://localhost:8765/play when you test on your own computer.
  serverUrl: "",
  // Premium: a Stripe Payment Link (https://buy.stripe.com/...) and the price to show, e.g. "$4.99".
  checkoutUrl: "",
  price: "",
};
