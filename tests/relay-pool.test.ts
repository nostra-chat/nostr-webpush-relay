import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {WebSocketServer} from 'ws';
import {RelayPool, type RelayEvent} from '../src/relay-pool.js';

const TEST_PUBKEY = 'a'.repeat(64);
const PORT = 28787;

interface MockRelay {wss: WebSocketServer; sentReqs: any[];}

function startMockRelay(port: number): MockRelay {
  const wss = new WebSocketServer({port});
  const sentReqs: any[] = [];
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if(msg[0] === 'REQ') sentReqs.push(msg);
      } catch{ /* ignore */ }
    });
  });
  return {wss, sentReqs};
}

function publishToAll(mock: MockRelay, evt: RelayEvent): void {
  const subId = mock.sentReqs.at(-1)?.[1] || 'sub';
  for(const c of mock.wss.clients) {
    c.send(JSON.stringify(['EVENT', subId, evt]));
  }
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('RelayPool', () => {
  let pool: RelayPool;
  let received: {evt: RelayEvent; recipients: string[]}[] = [];
  let mock: MockRelay;

  beforeEach(() => {
    received = [];
    pool = new RelayPool((evt, recipients) => { received.push({evt, recipients}); });
    mock = startMockRelay(PORT);
  });
  afterEach(async() => {
    pool.shutdown();
    await new Promise<void>((resolve) => mock.wss.close(() => resolve()));
  });

  it('connects, sends REQ, dispatches matching events', async() => {
    pool.reconcile(new Map([[`ws://localhost:${PORT}`, new Set([TEST_PUBKEY])]]));
    await waitMs(300);
    expect(mock.sentReqs.length).toBeGreaterThanOrEqual(1);
    expect(mock.sentReqs[0][2]).toEqual({kinds: [1059], '#p': [TEST_PUBKEY]});
    publishToAll(mock, {
      id: 'evt1', pubkey: 'b'.repeat(64), created_at: 1, kind: 1059,
      tags: [['p', TEST_PUBKEY]], content: 'enc', sig: 'sig'
    });
    await waitMs(150);
    expect(received).toHaveLength(1);
    expect(received[0].recipients).toEqual([TEST_PUBKEY]);
  });

  it('dedups identical event ids', async() => {
    pool.reconcile(new Map([[`ws://localhost:${PORT}`, new Set([TEST_PUBKEY])]]));
    await waitMs(300);
    const evt: RelayEvent = {
      id: 'dup', pubkey: 'b'.repeat(64), created_at: 1, kind: 1059,
      tags: [['p', TEST_PUBKEY]], content: '', sig: ''
    };
    publishToAll(mock, evt);
    publishToAll(mock, evt);
    await waitMs(150);
    expect(received).toHaveLength(1);
  });

  it('ignores events with no matching #p tag', async() => {
    pool.reconcile(new Map([[`ws://localhost:${PORT}`, new Set([TEST_PUBKEY])]]));
    await waitMs(300);
    const evt: RelayEvent = {
      id: 'nomatch', pubkey: 'b'.repeat(64), created_at: 1, kind: 1059,
      tags: [['p', 'c'.repeat(64)]], content: '', sig: ''
    };
    publishToAll(mock, evt);
    await waitMs(150);
    expect(received).toHaveLength(0);
  });
});
