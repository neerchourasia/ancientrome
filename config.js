"use strict";
// The settings you change when you put the game online. Everything in this file is PUBLIC (it is sent to every
// player's browser), so never put a secret key here. Secret keys go only on the game server (server/README.md).
window.ROME_CONFIG = {
  // Accounts and saving (Supabase > Project Settings > API). The "anon public" key is meant to be public.
  supabaseUrl: "https://gqxugubkcjfrvdyhncyp.supabase.co",
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxeHVndWJrY2pmcnZkeWhuY3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3NDYxMDAsImV4cCI6MjEwNzMyMjEwMH0.JsZ0BG6nRBAvcgdkvYw_smbUrBkbEuS1jKB3RIjyrjo", // the public "anon" key (never the service_role key)
  // The game server for playing real people (see server/README.md), e.g. "wss://rome-game.onrender.com/play".
  // Leave empty to use ws://localhost:8765/play when you test on your own computer.
  serverUrl: "wss://ancientrome-game.onrender.com/play",
};
