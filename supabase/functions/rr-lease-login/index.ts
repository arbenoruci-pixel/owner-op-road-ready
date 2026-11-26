import { makeLoginHandler } from './handler.js';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
Deno.serve(
  makeLoginHandler({
    getEnv: (key: string) => Deno.env.get(key),
    request: fetch,
    waitUntil: (job: Promise<unknown>) => EdgeRuntime.waitUntil(job),
    logFailure: (stage: string) => console.error('Operator sign-in request failed at ' + stage),
  })
);
