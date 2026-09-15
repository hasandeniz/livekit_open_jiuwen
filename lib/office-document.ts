import JSZip from 'jszip';

export type OfficeDocument = {
  id: string;
  content: Uint8Array;
  name: string;
  kind: 'pptx' | 'docx' | 'xlsx';
};

export const officeMimeTypes = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function loadOfficeDocument(
  url: string,
  signal: AbortSignal
): Promise<OfficeDocument> {
  let source: URL;
  try {
    source = new URL(url.trim());
    if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
      throw new Error();
    }
  } catch {
    throw new Error('Geçerli bir HTTP veya HTTPS dosya bağlantısı gir.');
  }
  let response: Response;
  try {
    response = await fetch(source.href, { signal, credentials: 'omit' });
  } catch {
    signal.throwIfAborted();
    throw new Error(
      'Dosyaya erişilemiyor. Bağlantıyı ve dosya sunucusunun CORS izinlerini kontrol et.'
    );
  }
  if (!response.ok) throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
  if (response.headers.get('content-type')?.includes('text/html')) {
    throw new Error(
      'Bu bağlantı bir web sayfası açıyor. Doğrudan .pptx, .docx veya .xlsx dosyasının bağlantısını kullan.'
    );
  }
  const content = new Uint8Array(await response.arrayBuffer());
  const kind = await detectOfficeKind(content);
  signal.throwIfAborted();
  let name = source.pathname.split('/').pop() || 'Dosya';
  try {
    name = decodeURIComponent(name);
  } catch {
    // Preserve filenames with invalid percent encoding.
  }
  return { id: crypto.randomUUID(), content, kind, name: officeFilename(name, kind) };
}

export async function detectOfficeKind(content: Uint8Array): Promise<OfficeDocument['kind']> {
  try {
    const archive = await JSZip.loadAsync(content);
    const formats = [
      ['pptx', 'ppt/presentation.xml'],
      ['docx', 'word/document.xml'],
      ['xlsx', 'xl/workbook.xml'],
    ] as const;
    const matches = formats.filter(([, path]) => archive.file(path));
    if (archive.file('[Content_Types].xml') && matches.length === 1) {
      return matches[0][0];
    }
  } catch {
    // Invalid or encrypted archives cannot be previewed.
  }
  throw new Error(
    'Geçerli bir .pptx, .docx veya .xlsx dosyası bulunamadı. Şifresiz bir dosya bağlantısı kullan.'
  );
}

export function officeFilename(name: string, kind: OfficeDocument['kind']) {
  return name.toLowerCase().endsWith(`.${kind}`)
    ? name
    : `${name.replace(/\.(pptx|docx|xlsx)$/i, '')}.${kind}`;
}
