// SPDX-License-Identifier: AGPL-3.0-or-later
// nostr-webpush-relay © 2026 Nostra.chat contributors
import pino from 'pino';
export const log = pino({level: process.env.LOG_LEVEL || 'info'});
