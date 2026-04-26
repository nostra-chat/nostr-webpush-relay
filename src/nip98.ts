// SPDX-License-Identifier: AGPL-3.0-or-later
import {verifyEvent, type Event} from 'nostr-tools';
import {config} from './config.js';

export interface Nip98Result {
  ok: boolean;
  pubkey?: string;
  reason?: string;
}

/**
 * Verify a NIP-98 Authorization header against (method, url) tuple.
 * Caller must additionally check that `result.pubkey === route.pubkey`.
 */
export function verifyNip98(authHeader: string | undefined, method: string, url: string): Nip98Result {
  if(!authHeader) return {ok: false, reason: 'missing Authorization header'};
  if(!authHeader.startsWith('Nostr ')) return {ok: false, reason: 'scheme must be Nostr'};
  let evt: Event;
  try {
    const b64 = authHeader.slice('Nostr '.length).trim();
    const json = Buffer.from(b64, 'base64').toString('utf-8');
    evt = JSON.parse(json);
  } catch(_e) {
    return {ok: false, reason: 'cannot parse base64/JSON'};
  }
  if(evt.kind !== 27235) return {ok: false, reason: `kind must be 27235, got ${evt.kind}`};
  const now = Math.floor(Date.now() / 1000);
  if(Math.abs(now - evt.created_at) > config.nip98ClockSkewSec) {
    return {ok: false, reason: `created_at out of window (skew=${now - evt.created_at}s)`};
  }
  const tagUrl = evt.tags.find((t) => t[0] === 'url')?.[1];
  const tagMethod = evt.tags.find((t) => t[0] === 'method')?.[1];
  if(tagUrl !== url) return {ok: false, reason: `url tag mismatch (got "${tagUrl}", want "${url}")`};
  if((tagMethod || '').toUpperCase() !== method.toUpperCase()) {
    return {ok: false, reason: `method tag mismatch (got "${tagMethod}", want "${method}")`};
  }
  if(!verifyEvent(evt)) return {ok: false, reason: 'invalid signature'};
  return {ok: true, pubkey: evt.pubkey};
}

/** Build the full URL for verification. Considers reverse proxy headers. */
export function reqFullUrl(scheme: string, host: string, originalUrl: string): string {
  return `${scheme}://${host}${originalUrl}`;
}
