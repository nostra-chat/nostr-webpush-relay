// SPDX-License-Identifier: AGPL-3.0-or-later
import {Storage} from './storage.js';
import {buildApp} from './http.js';
import {RelayPool} from './relay-pool.js';
import {fanout} from './push-sender.js';
import {config} from './config.js';
import {log} from './log.js';

if(!config.vapidPublic || !config.vapidPrivate) {
  log.error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required. Generate with: npx web-push generate-vapid-keys');
  process.exit(1);
}

const storage = new Storage();
const pool = new RelayPool(async(evt, recipients) => {
  for(const pk of recipients) {
    const r = await fanout(storage, pk, evt);
    log.info({pk, evtId: evt.id, sent: r.sent, pruned: r.pruned}, 'event fanout');
  }
});

function reconcile(): void {
  const plan = new Map<string, Set<string>>();
  const pubkeys = storage.allDistinctPubkeys();
  for(const pk of pubkeys) {
    const subs = storage.getByPubkey(pk);
    const relays = new Set<string>();
    for(const s of subs) for(const url of s.relays) relays.add(url);
    if(relays.size === 0) for(const url of config.defaultRelays) relays.add(url);
    for(const url of relays) {
      if(!plan.has(url)) plan.set(url, new Set());
      plan.get(url)!.add(pk);
    }
  }
  pool.reconcile(plan);
}

const app = buildApp({storage, vapidPublic: config.vapidPublic});

app.addHook('onResponse', async(req, reply) => {
  if(/^\/subscription\//.test(req.url) && [200, 204].includes(reply.statusCode)) {
    reconcile();
  }
});

reconcile();

app.listen({port: config.port, host: '0.0.0.0'}).then(() => {
  log.info({port: config.port}, 'listening');
}).catch((err) => {
  log.error({err}, 'failed to bind');
  process.exit(1);
});

process.on('SIGINT', () => {
  log.info('shutdown');
  pool.shutdown();
  storage.close();
  app.close().then(() => process.exit(0));
});
