import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {WebSocketServer} from 'ws';
import {generateSecretKey, getPublicKey, finalizeEvent} from 'nostr-tools';
import {Storage} from '../src/storage.js';
import {buildApp} from '../src/http.js';
import {RelayPool} from '../src/relay-pool.js';
import {fanout} from '../src/push-sender.js';

vi.mock('web-push', () => {
  const sent: Array<{sub: any; payload: any}> = [];
  return {
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(async(sub, payload) => {
        sent.push({sub, payload: JSON.parse(payload)});
        return {statusCode: 201};
      }),
      __sent: sent
    }
  };
});
import webpush from 'web-push';

function nip98Header(opts: {sk: Uint8Array; method: string; url: string}): string {
  const evt = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['url', opts.url], ['method', opts.method.toUpperCase()]],
    content: ''
  }, opts.sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');
}

const RELAY_PORT = 28788;

describe('integration: register → relay event → push fan-out', () => {
  let storage: Storage;
  let app: ReturnType<typeof buildApp>;
  let pool: RelayPool;
  let mockRelay: WebSocketServer;

  beforeEach(async() => {
    (webpush as any).__sent.length = 0;
    storage = new Storage(':memory:');
    pool = new RelayPool(async(evt, recipients) => {
      for(const pk of recipients) await fanout(storage, pk, evt);
    });
    app = buildApp({storage, vapidPublic: 'PUB'});
    mockRelay = new WebSocketServer({port: RELAY_PORT});
  });

  afterEach(async() => {
    pool.shutdown();
    await new Promise<void>((resolve) => mockRelay.close(() => resolve()));
  });

  it('full pipeline: register → relay event arrives → push sent', async() => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const url = `http://localhost/subscription/${pk}`;

    const r = await app.inject({
      method: 'PUT',
      url: `/subscription/${pk}`,
      headers: {host: 'localhost', authorization: nip98Header({sk, method: 'PUT', url})},
      payload: {
        endpoint: 'https://fcm.googleapis.com/wp/abc',
        keys: {p256dh: 'pX', auth: 'aY'},
        relays: [`ws://localhost:${RELAY_PORT}`]
      }
    });
    expect(r.statusCode).toBe(200);

    pool.reconcile(new Map([[`ws://localhost:${RELAY_PORT}`, new Set([pk])]]));
    await new Promise((res) => setTimeout(res, 300));

    for(const c of mockRelay.clients) {
      c.send(JSON.stringify(['EVENT', 'sub', {
        id: 'evt-int-1', pubkey: 'wrap', created_at: 1, kind: 1059,
        tags: [['p', pk]], content: 'cipher', sig: 'sig'
      }]));
    }
    await new Promise((res) => setTimeout(res, 200));

    const sent = (webpush as any).__sent;
    expect(sent.length).toBe(1);
    expect(sent[0].payload.app).toBe('nostra-webpush-relay');
    expect(sent[0].payload.event_id).toBe('evt-int-1');
    expect(sent[0].payload.recipient_pubkey).toBe(pk);
    expect(typeof sent[0].payload.nostra_event).toBe('string');
    expect(JSON.parse(sent[0].payload.nostra_event).id).toBe('evt-int-1');
  });
});
