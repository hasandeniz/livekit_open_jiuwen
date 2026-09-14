import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const destination = new URL('../public/wasm/', import.meta.url);
await mkdir(destination, { recursive: true });
await copyFile(
  require.resolve('@extend-ai/react-xlsx/duke_sheets_wasm_bg.wasm'),
  new URL('duke_sheets_wasm_bg.wasm', destination)
);
