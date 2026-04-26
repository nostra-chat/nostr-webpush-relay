import {describe, it, expect, beforeEach} from 'vitest';
import {Storage} from '../src/storage.js';

const SAMPLE = {
  pubkey: 'a'.repeat(64),
  endpoint: 'https://fcm.googleapis.com/wp/abc',
  p256dh: 'pX',
  auth: 'aY',
  relays: ['wss://relay.damus.io', 'wss://nos.lol']
};

describe('Storage', () => {
  let s: Storage;
  beforeEach(() => { s = new Storage(':memory:'); });

  it('upsert inserts a new subscription', () => {
    const rec = s.upsert(SAMPLE);
    expect(rec.id).toMatch(/^sub_[0-9a-f]{24}$/);
    expect(rec.pubkey).toBe(SAMPLE.pubkey);
    expect(rec.relays).toEqual(SAMPLE.relays);
  });

  it('upsert replaces same (pubkey, endpoint) with new keys', () => {
    const a = s.upsert(SAMPLE);
    const b = s.upsert({...SAMPLE, p256dh: 'newP', auth: 'newA'});
    expect(b.id).toBe(a.id);
    const list = s.getByPubkey(SAMPLE.pubkey);
    expect(list).toHaveLength(1);
    expect(list[0].p256dh).toBe('newP');
  });

  it('upsert allows multiple endpoints per pubkey', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, endpoint: 'https://other.invalid'});
    const list = s.getByPubkey(SAMPLE.pubkey);
    expect(list).toHaveLength(2);
  });

  it('delete by (pubkey, endpoint) removes 1 row', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, endpoint: 'https://other.invalid'});
    expect(s.delete(SAMPLE.pubkey, SAMPLE.endpoint)).toBe(1);
    expect(s.getByPubkey(SAMPLE.pubkey)).toHaveLength(1);
  });

  it('delete by pubkey removes all rows for that pubkey', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, endpoint: 'https://other.invalid'});
    expect(s.delete(SAMPLE.pubkey)).toBe(2);
    expect(s.getByPubkey(SAMPLE.pubkey)).toHaveLength(0);
  });

  it('deleteByEndpoint cleans up 410-Gone endpoints across pubkeys', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, pubkey: 'b'.repeat(64)});
    expect(s.deleteByEndpoint(SAMPLE.endpoint)).toBe(2);
  });

  it('allDistinctPubkeys returns each pubkey once', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, endpoint: 'https://other.invalid'});
    s.upsert({...SAMPLE, pubkey: 'b'.repeat(64)});
    expect(s.allDistinctPubkeys().sort()).toEqual([SAMPLE.pubkey, 'b'.repeat(64)].sort());
  });

  it('allDistinctRelays merges across rows', () => {
    s.upsert(SAMPLE);
    s.upsert({...SAMPLE, pubkey: 'b'.repeat(64), relays: ['wss://nos.lol', 'wss://relay.snort.social']});
    expect(s.allDistinctRelays().sort()).toEqual(['wss://nos.lol', 'wss://relay.damus.io', 'wss://relay.snort.social']);
  });
});
