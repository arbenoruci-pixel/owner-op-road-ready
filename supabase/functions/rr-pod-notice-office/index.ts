import {handleOfficeNotice} from './worker.js';

const getEnv = (name: string) => Deno.env.get(name);
const request = (url: string, init: RequestInit) =>
  fetch(url, {...init, redirect: 'error', signal: AbortSignal.timeout(10000)});

Deno.serve(req => handleOfficeNotice(req, {getEnv, request}));
