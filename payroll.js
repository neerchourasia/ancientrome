"use strict";
// Money that arrives "every morning" (rent, businesses, the museum) and things that renew "every day" (the daily gold coins, quests, sparkling citizens) follow REAL time, not
// the game's days: one game day is 20 real minutes. Skipping days (pressing Z to sleep through the night again and again, or T) moves the game clock but earns nothing extra,
// because what is paid is the rate per day times the real time since the last payment (at most 14 days' worth).

const Payroll = {
  DAY_MS: 1200 * 1000,                                                       // one game day, in real milliseconds
  MAX_DAYS: 14,
  realDays(since) { return Math.max(0, Math.min(this.MAX_DAYS, (Date.now() - (Number.isFinite(since) ? since : Date.now())) / this.DAY_MS)); },
  epoch() { return Math.floor(Date.now() / this.DAY_MS); },                  // a number that goes up by one every 20 real minutes, for everyone at once
};
