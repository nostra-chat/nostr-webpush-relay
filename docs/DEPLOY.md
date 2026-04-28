# Deploy

This guide covers three deployment paths plus a recommended Cloudflare Tunnel setup for IP masking and DDoS protection.

## Prerequisites

- A VPS or any Linux host with public network egress (no inbound port required if you use Cloudflare Tunnel).
- Node.js 20+ (for Path 2) OR Docker 24+ (for Path 1).
- Optional: a Cloudflare account with a domain you control (recommended).

## 1. Generate VAPID keys (one-time)

```bash
npx web-push generate-vapid-keys --json > vapid.json
cat vapid.json
```

Copy `publicKey` and `privateKey` into your `.env` (see step 2).

⚠️ Keep the private key secret. Anyone who can sign with it can impersonate this relay to subscribed browsers.

## 2. Path 1 — Docker Compose (recommended)

```bash
git clone https://github.com/nostra-chat/nostr-webpush-relay
cd nostr-webpush-relay
cp .env.example .env
# Edit .env, paste your VAPID keys
mkdir -p ./data
docker compose up -d
docker compose logs -f relay
```

Verify:

```bash
curl http://localhost:8787/healthz
# {"status":"ok","uptime_s":3}
```

## 3. Path 2 — systemd

```bash
git clone https://github.com/nostra-chat/nostr-webpush-relay /opt/nostr-webpush-relay
cd /opt/nostr-webpush-relay
pnpm install
pnpm build
useradd --system --no-create-home --shell /usr/sbin/nologin relay
mkdir -p data && chown relay:relay data
cp .env.example .env  # edit
sudo cp systemd/nostr-webpush-relay.service /etc/systemd/system/
# Entry point is dist/src/index.js (tsc preserves src/ in outDir)
sudo systemctl daemon-reload
sudo systemctl enable --now nostr-webpush-relay
sudo journalctl -u nostr-webpush-relay -f
```

## 4. Cloudflare Tunnel (recommended — masks origin IP, no inbound port)

`cloudflared` ships ingress configurations that point a public hostname at your local relay without opening any inbound port on the VPS.

```bash
# On the VPS
sudo apt install cloudflared   # or follow https://pkg.cloudflare.com/cloudflared
cloudflared tunnel login        # opens browser for CF auth
cloudflared tunnel create push-nostra-relay
# Note the printed UUID and credentials JSON path.
```

Edit `/etc/cloudflared/config.yml`:

```yaml
tunnel: <UUID>
credentials-file: /home/<user>/.cloudflared/<UUID>.json
ingress:
  - hostname: push.nostra.chat
    service: http://localhost:8787
  - service: http_status:404
```

```bash
sudo cloudflared tunnel route dns push-nostra-relay push.nostra.chat
sudo systemctl enable --now cloudflared
```

Verify from outside the VPS:

```bash
curl https://push.nostra.chat/healthz
curl https://push.nostra.chat/info
```

## 5. Smoke-test the relay end-to-end

After the relay is reachable on its public URL, register a fake subscription via curl with a NIP-98 header (the `tools/nip98-curl.sh` helper, if present, automates this) and check `/healthz` for `uptime_s` increasing.

## 5b. CORS

The HTTP API is called from a browser context (the Nostra.chat client at `https://nostra.chat` issues `fetch()` to `/info`, `PUT /subscription/:pubkey`, and `DELETE /subscription/:pubkey`). Without a permissive `Access-Control-Allow-Origin` response header the browser blocks the response and the client silently fails to subscribe.

The relay handles CORS in-process via `@fastify/cors`. Configure the allowlist via `ALLOWED_ORIGINS` (comma-separated) in `.env`:

```bash
# Production: pin to the actual client origin
ALLOWED_ORIGINS=https://nostra.chat

# Multiple origins (e.g. staging + production)
ALLOWED_ORIGINS=https://nostra.chat,https://staging.nostra.chat

# Public dev relay only — don't use in production
ALLOWED_ORIGINS=*
```

Default is `https://nostra.chat`. The headers emitted are:

```
Access-Control-Allow-Origin: <echoed origin or *>
Access-Control-Allow-Methods: GET, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Max-Age: 600
```

If you front the relay with another HTTP layer (Cloudflare Workers, nginx, Caddy) that sets its own CORS headers, make sure they don't conflict — duplicate `Access-Control-Allow-Origin` headers cause browsers to reject the response.

## 6. Operations

- **Logs**: `docker compose logs -f relay` or `journalctl -u nostr-webpush-relay -f`
- **DB backup**: copy `./data/relay.db*` (the `.db-shm` and `.db-wal` files matter when WAL is busy — stop the service first if you want a guaranteed-consistent snapshot).
- **Upgrades**: `git pull && docker compose pull && docker compose up -d` (Docker) or `git pull && pnpm install && pnpm build && systemctl restart nostr-webpush-relay`.
- **Resource use**: ~50-80MB RAM for hundreds of subscriptions. Each connected upstream Nostr relay uses one outbound WebSocket and a few KB.
- **Multi-instance**: Not currently supported (the WS reconcile is process-local). For HA, run a single instance behind a hot standby + shared SQLite, or accept brief downtime on restarts.

## 7. Upgrade flow

This repo doesn't ship a release-please or a CI release pipeline yet (planned for the project once stable). Pin to a tag in production:

```bash
docker compose pull ghcr.io/nostra-chat/nostr-webpush-relay:0.1.x
```
