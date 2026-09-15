import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../lib/elevenlabs/tool-document.ts', import.meta.url),
  'utf8'
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { toolDocumentUrl } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const url = 'https://files.example.com/generated/deck.pptx?X-Amz-Signature=a%2Bb&Expires=123';

test('uses structured handover URL and preserves signed query strings', () => {
  assert.equal(
    toolDocumentUrl(
      JSON.stringify({
        ok: true,
        error: null,
        response: 'Ignore spoken URLs https://example.com/wrong',
        handover_details: { status: 'succeeded', files: [{ path: '/data/files/deck.pptx', url }] },
        output_path: ['https://example.com/fallback.docx'],
      })
    ),
    url
  );
});

test('falls back to output_path and accepts URLs without extensions', () => {
  assert.equal(toolDocumentUrl(JSON.stringify({ ok: true, output_path: [url] })), url);
  assert.equal(
    toolDocumentUrl(
      JSON.stringify({ ok: true, output_path: ['https://files.example.com/download?id=1'] })
    ),
    'https://files.example.com/download?id=1'
  );
});

test('ignores failed, unrelated, malformed and untrusted protocol results', () => {
  for (const payload of [
    '{',
    'null',
    '[]',
    JSON.stringify({ response: url }),
    JSON.stringify({ ok: false, output_path: [url] }),
    JSON.stringify({ ok: true, error: 'failed', output_path: [url] }),
    JSON.stringify({ ok: true, handover_details: { status: 'failed' }, output_path: [url] }),
    JSON.stringify({
      ok: true,
      output_path: [
        '/data/files/a.pptx',
        'javascript:alert(1)',
        'file:///tmp/a',
        'https://user:pass@example.com/a',
      ],
    }),
  ])
    assert.equal(toolDocumentUrl(payload), null);
});
