// SPDX-License-Identifier: AGPL-3.0-or-later
export const config = {
  port: Number(process.env.PORT || 8787),
  dbPath: process.env.DB_PATH || './data/relay.db',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@nostra.chat',
  defaultRelays: (process.env.DEFAULT_RELAYS || 'wss://relay.damus.io,wss://nos.lol').split(',').filter(Boolean),
  maxRelaysPerSub: Number(process.env.MAX_RELAYS_PER_SUB || 5),
  nip98ClockSkewSec: Number(process.env.NIP98_CLOCK_SKEW_SEC || 60),
  // Comma-separated list of origins allowed to call the HTTP API from a
  // browser. The Nostra.chat client at https://nostra.chat fetches /info
  // and PUT/DELETE /subscription/:pubkey via cross-origin fetch, so
  // Access-Control-Allow-Origin must be set or the browser silently drops
  // the response. Use '*' only for public dev relays — production should
  // pin to the actual client origin.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://nostra.chat').split(',').map((s) => s.trim()).filter(Boolean)
};
