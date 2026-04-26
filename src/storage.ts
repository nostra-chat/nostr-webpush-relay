// SPDX-License-Identifier: AGPL-3.0-or-later
import Database from 'better-sqlite3';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {config} from './config.js';

export interface Subscription {
  id: string;
  pubkey: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  relays: string[];
  created_at: number;
  last_seen: number;
}

export class Storage {
  private db: Database.Database;

  constructor(path = config.dbPath) {
    if(path !== ':memory:') mkdirSync(dirname(path), {recursive: true});
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        pubkey TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        relays TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        UNIQUE(pubkey, endpoint)
      );
      CREATE INDEX IF NOT EXISTS idx_subs_pubkey ON subscriptions(pubkey);
    `);
  }

  upsert(rec: Omit<Subscription, 'id' | 'created_at' | 'last_seen'>): Subscription {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare('SELECT * FROM subscriptions WHERE pubkey = ? AND endpoint = ?')
      .get(rec.pubkey, rec.endpoint) as any;
    if(existing) {
      this.db.prepare('UPDATE subscriptions SET p256dh=?, auth=?, relays=?, last_seen=? WHERE id=?')
        .run(rec.p256dh, rec.auth, JSON.stringify(rec.relays), now, existing.id);
      return {...this.rowToSub(existing), ...rec, last_seen: now};
    }
    const id = 'sub_' + randomBytes(12).toString('hex');
    this.db.prepare(`INSERT INTO subscriptions
      (id, pubkey, endpoint, p256dh, auth, relays, created_at, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, rec.pubkey, rec.endpoint, rec.p256dh, rec.auth, JSON.stringify(rec.relays), now, now);
    return {id, ...rec, created_at: now, last_seen: now};
  }

  getByPubkey(pubkey: string): Subscription[] {
    const rows = this.db.prepare('SELECT * FROM subscriptions WHERE pubkey = ?').all(pubkey) as any[];
    return rows.map(this.rowToSub);
  }

  delete(pubkey: string, endpoint?: string): number {
    if(endpoint) {
      const r = this.db.prepare('DELETE FROM subscriptions WHERE pubkey = ? AND endpoint = ?').run(pubkey, endpoint);
      return r.changes;
    }
    const r = this.db.prepare('DELETE FROM subscriptions WHERE pubkey = ?').run(pubkey);
    return r.changes;
  }

  deleteByEndpoint(endpoint: string): number {
    const r = this.db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(endpoint);
    return r.changes;
  }

  allDistinctPubkeys(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT pubkey FROM subscriptions').all() as {pubkey: string}[];
    return rows.map((r) => r.pubkey);
  }

  allDistinctRelays(): string[] {
    const rows = this.db.prepare('SELECT relays FROM subscriptions').all() as {relays: string}[];
    const set = new Set<string>();
    for(const r of rows) {
      try { for(const url of JSON.parse(r.relays)) set.add(url); } catch{ /* ignore */ }
    }
    return [...set];
  }

  close(): void { this.db.close(); }

  private rowToSub(row: any): Subscription {
    return {
      id: row.id, pubkey: row.pubkey, endpoint: row.endpoint,
      p256dh: row.p256dh, auth: row.auth,
      relays: JSON.parse(row.relays),
      created_at: row.created_at, last_seen: row.last_seen
    };
  }
}
