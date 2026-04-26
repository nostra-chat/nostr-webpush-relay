# Protocol — HTTP API & Push Payload

## Routes

| Route | Method | Auth | Body | Response |
|---|---|---|---|---|
| `/healthz` | GET | none | — | `{status, uptime_s}` |
| `/info` | GET | none | — | `{vapid_public_key, version}` |
| `/subscription/:pubkey_hex` | PUT | NIP-98 | `{endpoint, keys: {p256dh, auth}, relays?}` | `{subscription_id}` (200) |
| `/subscription/:pubkey_hex` | DELETE | NIP-98 | optional `?endpoint=<url>` | 204 |

`:pubkey_hex` must be 64 lowercase hex chars (the npub decoded to hex).

## NIP-98 authentication

NIP-98 reference: https://github.com/nostr-protocol/nips/blob/master/98.md

The client must include an `Authorization` header with the format:

```
Authorization: Nostr <base64(JSON-of-kind-27235-event)>
```

The kind-27235 event must include:

- `tags`: at least `["url", "<full request URL>"]` and `["method", "<UPPERCASE METHOD>"]`.
- `created_at`: within ±60 seconds of server time (configurable).
- A valid Schnorr signature (same npub as the URL `:pubkey_hex` parameter).

### Example (TypeScript pseudocode using nostr-tools)

```typescript
import {finalizeEvent, type EventTemplate} from 'nostr-tools';

const url = `https://push.nostra.chat/subscription/${pubkey_hex}`;
const tmpl: EventTemplate = {
  kind: 27235,
  created_at: Math.floor(Date.now() / 1000),
  tags: [['url', url], ['method', 'PUT']],
  content: ''
};
const evt = finalizeEvent(tmpl, secret_key);
const header = 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');

await fetch(url, {
  method: 'PUT',
  headers: {'Content-Type': 'application/json', authorization: header},
  body: JSON.stringify({
    endpoint: '<your browser push endpoint>',
    keys: {p256dh: '<base64>', auth: '<base64>'},
    relays: ['wss://relay.damus.io']
  })
});
```

### Failure modes

- `401 unauthorized` — missing/malformed `Authorization` header (response includes a `reason` string for debugging).
- `403 pubkey mismatch` — auth event's pubkey doesn't equal the URL's `:pubkey_hex`.
- `400 invalid pubkey` — URL param not 64 hex chars.
- `400 body must include endpoint and keys.{p256dh,auth}` — body shape wrong.

## Push payload (received by the browser SW)

```json
{
  "app": "nostra-webpush-relay",
  "version": 1,
  "event_id": "<gift wrap event id, hex>",
  "recipient_pubkey": "<your pubkey, hex>",
  "nostra_event": "<JSON.stringify of the full kind 1059 event>"
}
```

The SW handler should discriminate on `payload.app === "nostra-webpush-relay"`. The full event JSON is embedded as a string under `nostra_event` — no relay refetch needed for decryption.

## Storage model

The relay persists subscriptions as `(pubkey, endpoint, p256dh, auth, relays[])` rows. Multiple subscriptions per pubkey (multiple devices) are allowed. Idempotent updates: registering the same `(pubkey, endpoint)` overwrites keys + last_seen.

## Garbage collection

When a Web Push delivery returns `404` or `410 Gone`, the relay automatically removes that subscription. Browsers normally rotate push tokens silently; the relay self-heals without manual intervention.
