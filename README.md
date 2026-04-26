# nostr-webpush-relay

Web Push (RFC 8030) relay for Nostr browser/PWA clients. Subscribes to NIP-17 gift-wraps on Nostr relays and dispatches Web Push notifications to registered browsers.

> **Status: pre-alpha, in active development.**

## What it does

1. Browsers register a `(pubkey, push_endpoint, p256dh, auth, relays)` tuple via `PUT /subscription/:pubkey` (NIP-98 authenticated).
2. The relay maintains persistent WebSocket connections to each user's preferred Nostr relays, subscribed to `{kinds:[1059], '#p':[<that user's pubkey>]}`.
3. When an event matches, the relay sends a VAPID-signed Web Push to the registered browser endpoint.
4. The browser Service Worker decrypts the gift-wrap locally (private key never leaves the device) and shows a notification.

## License

AGPL-3.0-or-later. If you run a public instance, you must also publish your modifications.

## Status

- [x] S1 — Scaffold
- [ ] S2 — SQLite storage
- [ ] S3 — NIP-98 auth
- [ ] S4 — HTTP API
- [ ] S5 — Relay subscriber
- [ ] S6 — Push sender
- [ ] S7 — Integration test
- [ ] S8 — Deploy artifacts

## Quickstart (full instructions arrive in S8)

```bash
git clone https://github.com/nostra-chat/nostr-webpush-relay
cd nostr-webpush-relay
pnpm install
cp .env.example .env  # set VAPID keys, see docs/DEPLOY.md
pnpm dev
```

## Documentation

- Protocol: `docs/PROTOCOL.md`
- Deploy: `docs/DEPLOY.md`

## Acknowledgements

API surface inspired by `damus-io/notepush` (APNS-only). NIP-98 auth standard from nostr-protocol/nips#98.
