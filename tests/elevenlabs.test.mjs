import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
async function loadTs(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const code = outputText.replace(
    "'next/server'",
    JSON.stringify(pathToFileURL(require.resolve('next/server.js')).href)
  );
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { POST } = await loadTs('../app/api/elevenlabs-token/route.ts');
const { upsertTranscript } = await loadTs('../lib/elevenlabs/transcript.ts');
const request = (origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/elevenlabs-token', {
    method: 'POST',
    headers: { origin },
  });

test('token endpoint restricts access, sanitizes failures, and forwards only the token', async (t) => {
  const previous = Object.fromEntries(
    ['NODE_ENV', 'ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID'].map((key) => [key, process.env[key]])
  );
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let calls = 0;
  const mockedFetch = t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ token: 'session-credential', extra: 'must-not-leak' });
  });

  process.env.NODE_ENV = 'production';
  assert.equal((await POST(request())).status, 403);
  process.env.NODE_ENV = 'development';
  assert.equal((await POST(request('https://another-site.example'))).status, 403);
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.ELEVENLABS_AGENT_ID;
  const missing = await POST(request());
  assert.equal(missing.status, 503);
  assert.equal(calls, 0);

  process.env.ELEVENLABS_API_KEY = 'fake-secret';
  process.env.ELEVENLABS_AGENT_ID = 'agent_test';
  const success = await POST(request());
  assert.equal(success.status, 200);
  assert.equal(success.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await success.json(), { token: 'session-credential' });
  const [url, options] = mockedFetch.mock.calls[0].arguments;
  assert.equal(url.searchParams.get('agent_id'), 'agent_test');
  assert.equal(options.headers['xi-api-key'], 'fake-secret');

  for (const status of [401, 403, 429, 500]) {
    mockedFetch.mock.mockImplementation(
      async () => new Response('fake-secret provider diagnostics', { status })
    );
    const result = await POST(request());
    assert.equal(result.status, status === 429 ? 429 : 502);
    assert.doesNotMatch(await result.text(), /fake-secret|provider diagnostics/);
  }
  mockedFetch.mock.mockImplementation(async () => Response.json({ token: 42 }));
  assert.equal((await POST(request())).status, 502);
  mockedFetch.mock.mockImplementation(async () => {
    throw new Error('fake-secret');
  });
  const unavailable = await POST(request());
  assert.equal(unavailable.status, 502);
  assert.doesNotMatch(await unavailable.text(), /fake-secret/);
});

test('transcript revisions preserve interruption corrections and repeated turns', () => {
  const original = { id: 'agent:1', role: 'agent', text: 'A long answer' };
  const corrected = { ...original, text: 'A long', corrected: true };
  let entries = upsertTranscript([], original);
  entries = upsertTranscript(entries, corrected);
  entries = upsertTranscript(entries, original);
  assert.deepEqual(entries, [corrected]);
  entries = upsertTranscript(entries, { ...original, id: 'agent:2' });
  assert.equal(entries.length, 2);
  assert.deepEqual(upsertTranscript(upsertTranscript([], corrected), original), [corrected]);
});
