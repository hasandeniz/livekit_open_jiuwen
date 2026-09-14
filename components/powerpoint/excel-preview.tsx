'use client';

import { useMemo } from 'react';
import { XlsxViewer, useXlsxViewerController } from '@extend-ai/react-xlsx';
import { useDesign } from '@/lib/design/design-context';
import './xlsx-wasm';

export default function ExcelPreview({
  content,
  name,
  onClose,
}: {
  content: Uint8Array;
  name: string;
  onClose: () => void;
}) {
  const { design } = useDesign();
  // Keep a stable, owned buffer: parsing must not detach the downloadable original.
  const file = useMemo(() => new Uint8Array(content).buffer, [content]);
  const controller = useXlsxViewerController({
    file,
    fileName: name,
    readOnly: true,
    maxFileSizeBytes: 25 * 1024 * 1024,
  });
  const error = (
    <p className="pptx-message pptx-error" role="alert">
      Çalışma kitabı önizlenemedi. Geçerli, şifresiz bir .xlsx dosyası kullan.
    </p>
  );

  return (
    <div className="pptx-preview">
      <div className="pptx-navigation">
        <span className="pptx-filename" title={name}>
          {name}
        </span>
        <select
          className="xlsx-sheet-select"
          aria-label="Çalışma sayfası"
          value={controller.activeTabIndex}
          disabled={controller.isLoading || !!controller.error || !controller.tabs.length}
          onChange={(event) => controller.setActiveTabIndex(Number(event.target.value))}
        >
          {!controller.tabs.length && <option value={0}>Çalışma sayfası</option>}
          {controller.tabs.map((tab, index) => (
            <option key={index} value={index}>
              {tab.name}
            </option>
          ))}
        </select>
        <div className="pptx-view-actions">
          <button type="button" aria-label="Çalışma kitabını kapat" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div
        className="pptx-viewport xlsx-viewport"
        role="region"
        aria-label="Excel önizleme"
        aria-busy={controller.isLoading}
      >
        <XlsxViewer
          controller={controller}
          height="100%"
          readOnly
          isDark={design !== 'light'}
          rounded={false}
          showDefaultToolbar={false}
          allowResizeInReadOnly={false}
          enableGestureZoom={false}
          loadingState={
            <p className="pptx-message" role="status">
              Çalışma kitabı hazırlanıyor…
            </p>
          }
          errorState={error}
          emptyState={<p className="pptx-message">Görüntülenecek çalışma sayfası bulunamadı.</p>}
          fileTooLargeState={
            <p className="pptx-message pptx-error" role="alert">
              Excel önizlemesi en fazla 25 MB dosyaları destekliyor.
            </p>
          }
        />
      </div>
    </div>
  );
}
