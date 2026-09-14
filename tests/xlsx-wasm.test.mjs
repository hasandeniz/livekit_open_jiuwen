import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

test('local WASM asset matches the installed workbook parser', async () => {
  await import('../scripts/copy-xlsx-wasm.mjs');
  const require = createRequire(import.meta.url);
  const source = await readFile(require.resolve('@extend-ai/react-xlsx/duke_sheets_wasm_bg.wasm'));
  const served = await readFile(
    new URL('../public/wasm/duke_sheets_wasm_bg.wasm', import.meta.url)
  );
  assert.deepEqual([...served.subarray(0, 4)], [0, 97, 115, 109]);
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(served), hash(source));
});
