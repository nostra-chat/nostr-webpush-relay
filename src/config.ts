// SPDX-License-Identifier: AGPL-3.0-or-later
export const config = {
  port: Number(process.env.PORT || 8787),
  dbPath: process.env.DB_PATH || './data/relay.db',
  vapidPublic: process.env.VAPID_PUBLIC_KEY || '',
  vapidPrivate: process.env.VAPID_PRIVATE_KEY || '',
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@nostra.chat',
  defaultRelays: (process.env.DEFAULT_RELAYS || 'wss://relay.damus.io,wss://nos.lol').split(',').filter(Boolean),
  maxRelaysPerSub: Number(process.env.MAX_RELAYS_PER_SUB || 5),
  nip98ClockSkewSec: Number(process.env.NIP98_CLOCK_SKEW_SEC || 60)
};
