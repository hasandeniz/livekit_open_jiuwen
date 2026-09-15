import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('pptx-react-viewer'));

for (const extension of ['.js', '.mjs']) {
  test(`PPTX chart font conversion survives isolated production inlining (${extension})`, async () => {
    const sources = await Promise.all(
      (await readdir(dist))
        .filter((name) => name.startsWith('chunk-') && name.endsWith(extension))
        .map((name) => readFile(join(dist, name), 'utf8'))
    );
    const matches = sources.flatMap((source) =>
      [...source.matchAll(/function chartFontPx\(sizePt\) \{[^}]*\}/g)].map(([body]) => body)
    );
    assert.equal(matches.length, 1, 'Review the package patch if the chart helper changes');
    // The production optimizer dropped the outer constant but kept references.
    // Exercise this helper without any outer scope, including at module startup.
    const convert = runInNewContext(`(${matches[0]})`);
    for (const points of [0, 9, 10, 12, 18, 10.5]) {
      assert.equal(convert(points), points * (4 / 3));
    }
  });
}
