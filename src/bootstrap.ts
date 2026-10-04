import * as fs from 'fs/promises';

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const urlStr = input instanceof URL ? input.href : String(input);
  if (urlStr.startsWith('file:')) {
    const filePath = input instanceof URL ? input : new URL(urlStr);
    const buf = await fs.readFile(filePath);
    return new Response(buf, {
      headers: { 'Content-Type': 'application/wasm' }
    });
  }
  return originalFetch(input, init);
}) as typeof fetch;
