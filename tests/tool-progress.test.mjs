import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/elevenlabs/tool-progress.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { initialToolProgress, toolProgressReducer: reduce } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('duplicate start events do not reset elapsed time; late starts cannot revive completed work', () => {
  const started = reduce(initialToolProgress, { type: 'start', id: 'one', at: 100 });
  assert.equal(reduce(started, { type: 'start', id: 'one', at: 200 }), started);
  const finished = reduce(started, { type: 'finish', id: 'one' });
  assert.deepEqual(finished.pending, {});
  assert.equal(reduce(finished, { type: 'start', id: 'one', at: 300 }), finished);
  assert.equal(reduce(finished, { type: 'finish', id: 'one' }), finished);
});

test('finishing one tool preserves other work; disconnect/reset clears pending and completed calls', () => {
  let state = reduce(initialToolProgress, { type: 'start', id: 'one', at: 100 });
  state = reduce(state, { type: 'start', id: 'two', at: 200 });
  state = reduce(state, { type: 'finish', id: 'one' });
  assert.deepEqual(state.pending, { two: 200 });
  assert.equal(reduce(state, { type: 'reset' }), initialToolProgress);
});
