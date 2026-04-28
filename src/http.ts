// SPDX-License-Identifier: AGPL-3.0-or-later
import Fastify, {type FastifyInstance} from 'fastify';
import cors from '@fastify/cors';
import {config} from './config.js';
import {Storage} from './storage.js';
import {verifyNip98, reqFullUrl} from './nip98.js';
import {log} from './log.js';

const PUBKEY_RE = /^[0-9a-f]{64}$/;
const VERSION = '0.1.0';

const startTime = Date.now();

export interface BuildAppDeps {
  storage: Storage;
  vapidPublic: string;
  /**
   * Allowed cross-origin requesters. Pass '*' to allow any origin (dev only).
   * Defaults to config.allowedOrigins when omitted.
   */
  allowedOrigins?: string[];
}

export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const app = Fastify({logger: false, trustProxy: true});

  const origins = deps.allowedOrigins ?? config.allowedOrigins;
  await app.register(cors, {
    // Pass the literal '*' string when wildcard is requested so the response
    // header is `Access-Control-Allow-Origin: *` (browsers reject mismatched
    // echo-back for opaque/null origins). For an allowlist, pass the array
    // and @fastify/cors echoes the request origin only if it matches.
    origin: origins.includes('*') ? '*' : origins,
    methods: ['GET', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600
  });

  app.get('/healthz', async() => ({
    status: 'ok',
    uptime_s: Math.floor((Date.now() - startTime) / 1000)
  }));

  app.get('/info', async() => ({
    vapid_public_key: deps.vapidPublic,
    version: VERSION
  }));

  app.put<{
    Params: {pubkey: string};
    Body: {endpoint: string; keys: {p256dh: string; auth: string}; relays?: string[]};
  }>(
    '/subscription/:pubkey',
    async(req, reply) => {
      const pubkey = req.params.pubkey.toLowerCase();
      if(!PUBKEY_RE.test(pubkey)) return reply.code(400).send({error: 'invalid pubkey'});

      const url = reqFullUrl(req.protocol, req.hostname, req.url);
      const auth = verifyNip98(req.headers.authorization, req.method, url);
      if(!auth.ok) return reply.code(401).send({error: 'unauthorized', reason: auth.reason});
      if(auth.pubkey !== pubkey) return reply.code(403).send({error: 'pubkey mismatch'});

      const body = req.body;
      if(!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
        return reply.code(400).send({error: 'body must include endpoint and keys.{p256dh,auth}'});
      }
      const relays = (body.relays && body.relays.length > 0 ? body.relays : config.defaultRelays)
        .filter((r) => r.startsWith('wss://') || r.startsWith('ws://'))
        .slice(0, config.maxRelaysPerSub);
      const sub = deps.storage.upsert({
        pubkey,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        relays
      });
      log.info({pubkey, sub_id: sub.id}, 'subscription upserted');
      return reply.code(200).send({subscription_id: sub.id});
    }
  );

  app.delete<{
    Params: {pubkey: string};
    Querystring: {endpoint?: string};
  }>(
    '/subscription/:pubkey',
    async(req, reply) => {
      const pubkey = req.params.pubkey.toLowerCase();
      if(!PUBKEY_RE.test(pubkey)) return reply.code(400).send({error: 'invalid pubkey'});
      const url = reqFullUrl(req.protocol, req.hostname, req.url);
      const auth = verifyNip98(req.headers.authorization, req.method, url);
      if(!auth.ok) return reply.code(401).send({error: 'unauthorized', reason: auth.reason});
      if(auth.pubkey !== pubkey) return reply.code(403).send({error: 'pubkey mismatch'});
      const removed = deps.storage.delete(pubkey, req.query.endpoint);
      log.info({pubkey, removed}, 'subscription deleted');
      return reply.code(204).send();
    }
  );

  return app;
}
