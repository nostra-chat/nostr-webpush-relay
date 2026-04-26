// SPDX-License-Identifier: AGPL-3.0-or-later
import WebSocket from 'ws';
import {log} from './log.js';

export interface RelayEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type EventHandler = (event: RelayEvent, recipientPubkeys: string[]) => void | Promise<void>;

interface RelayState {
  url: string;
  ws?: WebSocket;
  desiredPubkeys: Set<string>;
  reconnectAttempts: number;
  closed: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

export class RelayPool {
  private relays = new Map<string, RelayState>();
  private dedup = new Map<string, number>();
  private dedupMaxMs = 24 * 60 * 60 * 1000;
  private dedupGcThreshold = 10000;

  constructor(private onEvent: EventHandler) {}

  reconcile(plan: Map<string, Set<string>>): void {
    for(const [url, pubkeys] of plan) {
      let r = this.relays.get(url);
      if(!r) {
        r = {url, desiredPubkeys: new Set(pubkeys), reconnectAttempts: 0, closed: false};
        this.relays.set(url, r);
        this.connect(r);
      } else {
        const same = r.desiredPubkeys.size === pubkeys.size && [...r.desiredPubkeys].every((p) => pubkeys.has(p));
        r.desiredPubkeys = new Set(pubkeys);
        if(!same && r.ws?.readyState === WebSocket.OPEN) this.sendReq(r);
      }
    }
    for(const [url, r] of this.relays) {
      if(!plan.has(url)) {
        r.closed = true;
        if(r.reconnectTimer) clearTimeout(r.reconnectTimer);
        try { r.ws?.close(); } catch{ /* ignore */ }
        this.relays.delete(url);
      }
    }
  }

  shutdown(): void {
    for(const r of this.relays.values()) {
      r.closed = true;
      if(r.reconnectTimer) clearTimeout(r.reconnectTimer);
      try { r.ws?.close(); } catch{ /* ignore */ }
    }
    this.relays.clear();
  }

  private connect(r: RelayState): void {
    if(r.closed) return;
    log.info({url: r.url}, 'relay connect');
    const ws = new WebSocket(r.url);
    r.ws = ws;
    ws.on('open', () => {
      r.reconnectAttempts = 0;
      log.info({url: r.url}, 'relay open');
      this.sendReq(r);
    });
    ws.on('message', (data) => this.onMessage(r, data.toString()));
    ws.on('close', () => this.scheduleReconnect(r));
    ws.on('error', (err) => log.warn({url: r.url, err: err.message}, 'relay error'));
  }

  private sendReq(r: RelayState): void {
    if(r.ws?.readyState !== WebSocket.OPEN) return;
    if(r.desiredPubkeys.size === 0) return;
    const subId = 'webpush-' + Math.floor(Math.random() * 1e9).toString(36);
    const filter = {kinds: [1059], '#p': [...r.desiredPubkeys]};
    r.ws.send(JSON.stringify(['REQ', subId, filter]));
  }

  private onMessage(r: RelayState, raw: string): void {
    let msg: unknown;
    try { msg = JSON.parse(raw); } catch { return; }
    if(!Array.isArray(msg) || msg[0] !== 'EVENT') return;
    const evt = msg[2] as RelayEvent;
    if(!evt || evt.kind !== 1059) return;
    if(this.dedup.has(evt.id)) return;
    this.gcDedup();
    this.dedup.set(evt.id, Date.now());

    const pTags = evt.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    const recipients = pTags.filter((p) => r.desiredPubkeys.has(p));
    if(recipients.length === 0) return;
    try {
      const out = this.onEvent(evt, recipients);
      if(out instanceof Promise) out.catch((e) => log.warn({err: e?.message}, 'onEvent rejected'));
    } catch(e) { log.warn({err: (e as Error).message}, 'onEvent threw'); }
  }

  private gcDedup(): void {
    if(this.dedup.size < this.dedupGcThreshold) return;
    const cutoff = Date.now() - this.dedupMaxMs;
    for(const [id, ts] of this.dedup) if(ts < cutoff) this.dedup.delete(id);
  }

  private scheduleReconnect(r: RelayState): void {
    if(r.closed) return;
    r.reconnectAttempts += 1;
    const delayMs = Math.min(30000, 1000 * Math.pow(2, Math.min(r.reconnectAttempts, 5)));
    log.info({url: r.url, delayMs}, 'relay reconnect scheduled');
    r.reconnectTimer = setTimeout(() => { if(!r.closed) this.connect(r); }, delayMs);
  }
}
