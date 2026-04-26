// SPDX-License-Identifier: AGPL-3.0-or-later
import {log} from './log.js';
log.info('nostr-webpush-relay starting');
process.on('SIGINT', () => { log.info('shutdown'); process.exit(0); });
