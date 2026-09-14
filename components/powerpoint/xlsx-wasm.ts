'use client';

import { setWasmSource } from '@extend-ai/react-xlsx';

// Workers need an absolute URL; it still points to this app's own origin.
setWasmSource(new URL('/wasm/duke_sheets_wasm_bg.wasm', window.location.origin).href);
