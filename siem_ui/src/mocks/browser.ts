/**
 * Browser setup for Mock Service Worker
 * Enables API mocking in development environment
 */
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// Setup the worker with our handlers
export const worker = setupWorker(...handlers);

// Enable API mocking in development
if (process.env.NODE_ENV === 'development') {
  worker.start({
    onUnhandledRequest: 'warn',
    serviceWorker: {
      url: '/mockServiceWorker.js'
    }
  });
}