import {describe, it, expect, beforeEach} from 'vitest';
import {generateSecretKey, getPublicKey, finalizeEvent} from 'nostr-tools';
import {buildApp} from '../src/http.js';
import {Storage} from '../src/storage.js';

function nip98(opts: {sk: Uint8Array; method: string; url: string}): string {
  const evt = finalizeEvent({
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['url', opts.url], ['method', opts.method.toUpperCase()]],
    content: ''
  }, opts.sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');
}

describe('HTTP API', () => {
  let storage: Storage;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    storage = new Storage(':memory:');
    app = buildApp({storage, vapidPublic: 'PUB_KEY_XX'});
  });

  it('GET /healthz returns ok', async() => {
    const r = await app.inject({method: 'GET', url: '/healthz'});
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.payload).status).toBe('ok');
  });

  it('GET /info returns vapid_public_key', async() => {
    const r = await app.inject({method: 'GET', url: '/info'});
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.payload).vapid_public_key).toBe('PUB_KEY_XX');
  });

  it('PUT /subscription/:pubkey rejects bad pubkey', async() => {
    const r = await app.inject({
      method: 'PUT',
      url: '/subscription/notahex',
      payload: {}
    });
    expect(r.statusCode).toBe(400);
  });

  it('PUT /subscription/:pubkey rejects missing auth', async() => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const r = await app.inject({
      method: 'PUT',
      url: `/subscription/${pk}`,
      payload: {endpoint: 'x', keys: {p256dh: 'a', auth: 'b'}}
    });
    expect(r.statusCode).toBe(401);
  });

  it('PUT /subscription/:pubkey accepts valid auth + body', async() => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const url = `http://localhost/subscription/${pk}`;
    const r = await app.inject({
      method: 'PUT',
      url: `/subscription/${pk}`,
      headers: {host: 'localhost', authorization: nip98({sk, method: 'PUT', url})},
      payload: {endpoint: 'https://fcm.googleapis.com/wp/abc', keys: {p256dh: 'pX', auth: 'aY'}}
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.payload).subscription_id).toMatch(/^sub_/);
  });

  it('PUT /subscription/:pubkey rejects pubkey mismatch', async() => {
    const sk1 = generateSecretKey();
    const sk2 = generateSecretKey();
    const pk2 = getPublicKey(sk2);
    const url = `http://localhost/subscription/${pk2}`;
    const r = await app.inject({
      method: 'PUT',
      url: `/subscription/${pk2}`,
      headers: {host: 'localhost', authorization: nip98({sk: sk1, method: 'PUT', url})},
      payload: {endpoint: 'x', keys: {p256dh: 'a', auth: 'b'}}
    });
    expect(r.statusCode).toBe(403);
  });

  it('DELETE /subscription/:pubkey removes the row', async() => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const putUrl = `http://localhost/subscription/${pk}`;
    await app.inject({
      method: 'PUT',
      url: `/subscription/${pk}`,
      headers: {host: 'localhost', authorization: nip98({sk, method: 'PUT', url: putUrl})},
      payload: {endpoint: 'x', keys: {p256dh: 'a', auth: 'b'}}
    });
    const delUrl = `http://localhost/subscription/${pk}`;
    const r = await app.inject({
      method: 'DELETE',
      url: `/subscription/${pk}`,
      headers: {host: 'localhost', authorization: nip98({sk, method: 'DELETE', url: delUrl})}
    });
    expect(r.statusCode).toBe(204);
    expect(storage.getByPubkey(pk)).toHaveLength(0);
  });
});
