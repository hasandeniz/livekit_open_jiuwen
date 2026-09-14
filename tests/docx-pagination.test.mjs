import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const bundle of ['docx-preview.js', 'docx-preview.mjs']) {
  const source = await readFile(
    new URL(`../node_modules/docx-preview/dist/${bundle}`, import.meta.url),
    'utf8'
  );
  const sectionMethod = source.slice(
    source.indexOf('isPageBreakSection(prev, next) {'),
    source.indexOf('splitBySection(elements, defaultProps) {')
  );
  const groupMethod = source.slice(
    source.indexOf('groupByPageBreaks(sections) {'),
    source.indexOf('renderWrapper(children) {')
  );
  const renderer = new Function(
    `return ({ options: { ignoreLastRenderedPageBreak: false }, ${sectionMethod.trim()}, ${groupMethod.trim()} });`
  )();
  const portrait = { type: 'nextPage', pageSize: { width: 595, height: 842 } };
  const landscape = {
    type: 'nextPage',
    pageSize: { orientation: 'landscape', width: 842, height: 595 },
  };
  const section = (sectProps, pageBreak = false) => ({ sectProps, pageBreak });

  test(`${bundle}: portrait and landscape sections render on separate pages`, () => {
    const first = section(portrait);
    const second = section(landscape);
    assert.deepEqual(renderer.groupByPageBreaks([first, second]), [[first], [second]]);
  });
  test(`${bundle}: next-page sections split even with matching page dimensions`, () => {
    assert.equal(renderer.groupByPageBreaks([section(portrait), section(portrait)]).length, 2);
  });
  test(`${bundle}: continuous sections stay together and explicit breaks still split`, () => {
    const continuous = { ...portrait, type: 'continuous' };
    assert.equal(renderer.groupByPageBreaks([section(continuous), section(continuous)]).length, 1);
    assert.equal(
      renderer.groupByPageBreaks([section(continuous, true), section(continuous)]).length,
      2
    );
    assert.equal(renderer.groupByPageBreaks([section(portrait, true)]).length, 1);
  });
}
