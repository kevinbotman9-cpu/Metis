/**
 * MSW browser worker.
 *
 * start() is memoised: React StrictMode runs effects twice in development, and
 * calling worker.start() a second time throws "cannot configure an already
 * enabled network". Returning the same promise makes repeat calls harmless.
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

let startPromise: Promise<unknown> | null = null;

export function startWorker() {
  if (!startPromise) {
    startPromise = worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
  }
  return startPromise;
}
