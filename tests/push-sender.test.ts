import {describe, it, expect, beforeEach, vi} from 'vitest';
import {Storage} from '../src/storage.js';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}));

import webpush from 'web-push';
import {sendPush, fanout} from '../src/push-sender.js';

const SAMPLE_SUB = {
  pubkey: 'a'.repeat(64),
  endpoint: 'https://fcm.googleapis.com/wp/x',
  p256dh: 'pX',
  auth: 'aY',
  relays: [] as string[]
};

const SAMPLE_PAYLOAD = {
  app: 'nostra-webpush-relay' as const,
  version: 1 as const,
  event_id: 'eid',
  recipient_pubkey: SAMPLE_SUB.pubkey,
  nostra_event: '{}'
};

describe('push-sender', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = new Storage(':memory:');
    (webpush.sendNotification as any).mockReset();
  });

  it('sendPush returns ok on 201', async() => {
    (webpush.sendNotification as any).mockResolvedValue({statusCode: 201});
    const r = await sendPush(
      {...SAMPLE_SUB, id: 'sub1', created_at: 0, last_seen: 0},
      SAMPLE_PAYLOAD
    );
    expect(r.ok).toBe(true);
    expect(r.status).toBe(201);
  });

  it('sendPush flags gone on 410', async() => {
    (webpush.sendNotification as any).mockRejectedValue({statusCode: 410, body: 'gone'});
    const r = await sendPush(
      {...SAMPLE_SUB, id: 'sub1', created_at: 0, last_seen: 0},
      SAMPLE_PAYLOAD
    );
    expect(r.ok).toBe(false);
    expect(r.gone).toBe(true);
  });

  it('sendPush flags gone on 404', async() => {
    (webpush.sendNotification as any).mockRejectedValue({statusCode: 404, body: 'not found'});
    const r = await sendPush(
      {...SAMPLE_SUB, id: 'sub1', created_at: 0, last_seen: 0},
      SAMPLE_PAYLOAD
    );
    expect(r.gone).toBe(true);
  });

  it('fanout sends to all subs for a pubkey', async() => {
    storage.upsert(SAMPLE_SUB);
    storage.upsert({...SAMPLE_SUB, endpoint: 'https://other.invalid'});
    (webpush.sendNotification as any).mockResolvedValue({statusCode: 201});
    const r = await fanout(storage, SAMPLE_SUB.pubkey, {
      id: 'evt1', kind: 1059, tags: [], content: '', pubkey: 'b', created_at: 0, sig: ''
    });
    expect(r.sent).toBe(2);
    expect(r.pruned).toBe(0);
  });

  it('fanout prunes 410-Gone subscriptions', async() => {
    storage.upsert(SAMPLE_SUB);
    (webpush.sendNotification as any).mockRejectedValue({statusCode: 410, body: 'gone'});
    const r = await fanout(storage, SAMPLE_SUB.pubkey, {
      id: 'evt1', kind: 1059, tags: [], content: '', pubkey: 'b', created_at: 0, sig: ''
    });
    expect(r.sent).toBe(0);
    expect(r.pruned).toBe(1);
    expect(storage.getByPubkey(SAMPLE_SUB.pubkey)).toHaveLength(0);
  });
});
