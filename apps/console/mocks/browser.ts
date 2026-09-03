/**
 * MSW Browser Setup
 * Used in Next.js dev mode via next.config.js
 */

import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
