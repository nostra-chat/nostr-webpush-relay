import {describe, it, expect} from 'vitest';
import {generateSecretKey, getPublicKey, finalizeEvent, type EventTemplate} from 'nostr-tools';
import {verifyNip98} from '../src/nip98.js';

function buildAuthHeader(opts: {sk: Uint8Array; method: string; url: string; createdAt?: number}): string {
  const tmpl: EventTemplate = {
    kind: 27235,
    created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
    tags: [['url', opts.url], ['method', opts.method.toUpperCase()]],
    content: ''
  };
  const evt = finalizeEvent(tmpl, opts.sk);
  return 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');
}

describe('NIP-98 verifyNip98', () => {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const url = 'https://push.nostra.chat/subscription/' + pk;

  it('accepts a valid header', () => {
    const h = buildAuthHeader({sk, method: 'PUT', url});
    const r = verifyNip98(h, 'PUT', url);
    expect(r.ok).toBe(true);
    expect(r.pubkey).toBe(pk);
  });

  it('rejects missing header', () => {
    expect(verifyNip98(undefined, 'PUT', url).ok).toBe(false);
  });

  it('rejects wrong scheme', () => {
    expect(verifyNip98('Bearer x', 'PUT', url).ok).toBe(false);
  });

  it('rejects bad base64', () => {
    expect(verifyNip98('Nostr !!!@@@', 'PUT', url).ok).toBe(false);
  });

  it('rejects wrong kind', () => {
    const tmpl: EventTemplate = {kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content: ''};
    const evt = finalizeEvent(tmpl, sk);
    const h = 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');
    expect(verifyNip98(h, 'PUT', url).reason).toMatch(/kind/);
  });

  it('rejects mismatched url tag', () => {
    const h = buildAuthHeader({sk, method: 'PUT', url: 'https://other.invalid'});
    expect(verifyNip98(h, 'PUT', url).reason).toMatch(/url/);
  });

  it('rejects mismatched method tag', () => {
    const h = buildAuthHeader({sk, method: 'GET', url});
    expect(verifyNip98(h, 'PUT', url).reason).toMatch(/method/);
  });

  it('rejects expired created_at', () => {
    const h = buildAuthHeader({sk, method: 'PUT', url, createdAt: Math.floor(Date.now() / 1000) - 3600});
    expect(verifyNip98(h, 'PUT', url).reason).toMatch(/created_at/);
  });

  it('rejects forged signature', () => {
    const tmpl: EventTemplate = {kind: 27235, created_at: Math.floor(Date.now() / 1000),
      tags: [['url', url], ['method', 'PUT']], content: ''};
    const evt = finalizeEvent(tmpl, sk);
    evt.sig = '0'.repeat(128);
    const h = 'Nostr ' + Buffer.from(JSON.stringify(evt)).toString('base64');
    expect(verifyNip98(h, 'PUT', url).reason).toMatch(/signature/);
  });
});
