import type { IncomingMessage, ServerResponse } from 'http';
import { createExpressApp } from '../server';

let cachedAppPromise: Promise<any> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!cachedAppPromise) {
    cachedAppPromise = createExpressApp();
  }
  const app = await cachedAppPromise;
  return app(req, res);
}
