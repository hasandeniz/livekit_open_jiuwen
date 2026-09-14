import JSZip from 'jszip';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../lib/office-document.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const code = outputText.replace(
  "'jszip'",
  JSON.stringify(pathToFileURL(require.resolve('jszip')).href)
);
const { detectOfficeKind, officeFilename, officeMimeTypes } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

async function archive(...paths) {
  const zip = new JSZip();
  for (const path of paths) zip.file(path, '<xml/>');
  return zip.generateAsync({ type: 'uint8array' });
}

test('detects Office format from archive contents, independently of URL extensions', async () => {
  assert.equal(
    await detectOfficeKind(await archive('[Content_Types].xml', 'word/document.xml')),
    'docx'
  );
  assert.equal(
    await detectOfficeKind(
      await readFile(new URL('../public/pptx-preview-test.pptx', import.meta.url))
    ),
    'pptx'
  );
});

test('rejects invalid, unsupported, and ambiguous archives', async () => {
  for (const bytes of [
    new TextEncoder().encode('<html>Access denied</html>'),
    await archive('notes.txt'),
    await archive('[Content_Types].xml', 'xl/workbook.xml', 'word/document.xml'),
    await archive('[Content_Types].xml', 'xl/workbook.xml', 'ppt/presentation.xml'),
    await archive('word/document.xml'),
    await archive('[Content_Types].xml', 'word/document.xml', 'ppt/presentation.xml'),
  ])
    await assert.rejects(detectOfficeKind(bytes), /\.pptx, \.docx veya \.xlsx/);
});

test('downloads use the detected format and preserve existing filename casing', () => {
  assert.equal(officeFilename('download', 'docx'), 'download.docx');
  assert.equal(officeFilename('report.pptx', 'docx'), 'report.docx');
  assert.equal(officeFilename('REPORT.DOCX', 'docx'), 'REPORT.DOCX');
  assert.match(officeMimeTypes.docx, /wordprocessingml.document$/);
  assert.match(officeMimeTypes.pptx, /presentationml.presentation$/);
});

test('detects XLSX and downloads using the Excel extension and MIME type', async () => {
  assert.equal(
    await detectOfficeKind(await archive('[Content_Types].xml', 'xl/workbook.xml')),
    'xlsx'
  );
  assert.equal(officeFilename('download', 'xlsx'), 'download.xlsx');
  assert.equal(officeFilename('report.docx', 'xlsx'), 'report.xlsx');
  assert.equal(officeFilename('REPORT.XLSX', 'xlsx'), 'REPORT.XLSX');
  assert.match(officeMimeTypes.xlsx, /spreadsheetml.sheet$/);
});
