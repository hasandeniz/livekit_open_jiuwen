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
