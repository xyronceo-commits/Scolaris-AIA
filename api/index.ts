import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../server.js';

/**
 * Vercel entry point. Every /api/* request is rewritten here (see vercel.json) and handed to the same
 * Express app that runs everywhere else, so the routes, auth checks and rate limits are identical.
 */

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // Vercel exposes `req.body` through a lazy getter that reads and parses the request stream.
  // Express's own body parsers (express.json, plus the raw-body capture the Paystack webhook signature
  // check needs) must read that stream themselves, so replace the getter with a plain property first.
  Object.defineProperty(req, 'body', { value: undefined, writable: true, configurable: true, enumerable: true });

  // Build the app once per warm function instance
  appPromise ??= createApp();
  const app = await appPromise;
  return app(req, res);
}

// Allow long AI jobs (summaries, podcasts, document extraction) up to a minute.
export const config = { maxDuration: 60 };
