import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the installed browser bundle: this also catches a missing pnpm patch.
const require = createRequire(import.meta.url);
const reactRequire = createRequire(require.resolve('@elevenlabs/react'));
const clientRequire = createRequire(reactRequire.resolve('@elevenlabs/client'));
const livekitPath = clientRequire.resolve('livekit-client');
const source = await readFile(join(dirname(livekitPath), 'livekit-client.esm.mjs'), 'utf8');
const start = source.indexOf('  startReadingLoop(signalReader, firstMessage) {');
const end = source.indexOf('\n  close() {', start);
assert.ok(start >= 0 && end > start, 'SDK reading-loop layout changed; review the patch');
const { startReadingLoop } = runInNewContext(`({${source.slice(start, end)}})`, {
  __awaiter: createRequire(livekitPath)('tslib').__awaiter,
});

for (const state of ['disconnecting', 'closed', 'connected', 'reconnecting']) {
  test(`signal reader failure while ${state}`, async () => {
    const errors = [];
    const closes = [];
    const context = {
      attemptId: 1,
      lifecycleState: 'connected',
      log: { error: (...args) => errors.push(args) },
      handleOnClose: (...args) => closes.push(args),
    };
    const failure = new Error('socket closed while read was pending');
    await startReadingLoop.call(context, {
      async read() {
        context.lifecycleState = state;
        throw failure;
      },
    });
    const expectedFailures = ['connected', 'reconnecting'].includes(state) ? 1 : 0;
    assert.equal(errors.length, expectedFailures);
    assert.equal(closes.length, expectedFailures);
    if (expectedFailures) assert.equal(errors[0][1].error, failure);
  });
}

test('a replaced transport cannot report a failure against the new connection', async () => {
  const context = {
    attemptId: 1,
    lifecycleState: 'connected',
    log: { error: () => assert.fail('stale transport logged an error') },
    handleOnClose: () => assert.fail('stale transport closed the new connection'),
  };
  await startReadingLoop.call(context, {
    async read() {
      context.attemptId = 2;
      throw new Error('old transport closed');
    },
  });
});
