// SPDX-License-Identifier: AGPL-3.0-or-later
import webpush from 'web-push';
import {config} from './config.js';
import type {Storage, Subscription} from './storage.js';
import {log} from './log.js';

export interface PushPayload {
  app: 'nostra-webpush-relay';
  version: 1;
  event_id: string;
  recipient_pubkey: string;
  nostra_event: string;  // JSON.stringify of full kind 1059 event
}

if(config.vapidPublic && config.vapidPrivate) {
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublic, config.vapidPrivate);
}

export interface PushResult {
  ok: boolean;
  status?: number;
  gone?: boolean;
  reason?: string;
}

export async function sendPush(sub: Subscription, payload: PushPayload, opts: {ttlSec?: number} = {}): Promise<PushResult> {
  try {
    const res = await webpush.sendNotification(
      {endpoint: sub.endpoint, keys: {p256dh: sub.p256dh, auth: sub.auth}},
      JSON.stringify(payload),
      {TTL: opts.ttlSec ?? 60, contentEncoding: 'aes128gcm'}
    );
    return {ok: true, status: res.statusCode};
  } catch(e: any) {
    const status = e?.statusCode || e?.status || 0;
    const gone = status === 404 || status === 410;
    log.warn({status, endpoint: sub.endpoint, msg: e?.body || e?.message}, 'sendPush failed');
    return {ok: false, status, gone, reason: e?.body || e?.message};
  }
}

export async function fanout(storage: Storage, pubkeyHex: string, evt: any): Promise<{sent: number; pruned: number}> {
  const subs = storage.getByPubkey(pubkeyHex);
  let sent = 0;
  let pruned = 0;
  for(const sub of subs) {
    const payload: PushPayload = {
      app: 'nostra-webpush-relay',
      version: 1,
      event_id: evt.id,
      recipient_pubkey: pubkeyHex,
      nostra_event: JSON.stringify(evt)
    };
    const r = await sendPush(sub, payload);
    if(r.ok) { sent++; continue; }
    if(r.gone) { storage.delete(sub.pubkey, sub.endpoint); pruned++; }
  }
  return {sent, pruned};
}
