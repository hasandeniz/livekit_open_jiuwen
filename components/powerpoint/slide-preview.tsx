'use client';

import { useEffect, useRef, useState } from 'react';
import {
  type PowerPointViewerHandle,
  SlideCanvas,
  ViewerThemeProvider,
  useViewerBuildingBlocks,
} from 'pptx-react-viewer';

// A bytes-based boundary: a future agent tool can supply the downloaded presentation here.
export default function SlidePreview({
  content,
  name,
  onClose,
}: {
  content: Uint8Array;
  name: string;
  onClose: () => void;
}) {
  const handle = useRef<PowerPointViewerHandle>(null);
  const [count, setCount] = useState(0);
  const { canvasProps, loading, error } = useViewerBuildingBlocks({
    content,
    canEdit: false,
    autosaveEnabled: false,
    handle,
    onSlideCountChange: setCount,
  });
  useEffect(() => {
    handle.current?.setMode('preview');
    return undefined;
  }, []);

  const index = canvasProps.activeSlideIndex ?? 0;

  return (
    <div className="pptx-preview">
      <div className="pptx-navigation">
        <span className="pptx-filename" title={name}>
          {name}
        </span>
        <nav aria-label="Slayt gezinme">
          <button
            type="button"
            disabled={loading || !!error || index <= 0}
            onClick={() => handle.current?.goPrev()}
            aria-label="Önceki slayt"
          >
            ←
          </button>
          <span role="status">{count ? `${index + 1} / ${count}` : '—'}</span>
          <button
            type="button"
            disabled={loading || !!error || index >= count - 1}
            onClick={() => handle.current?.goNext()}
            aria-label="Sonraki slayt"
          >
            →
          </button>
        </nav>
        <div className="pptx-view-actions">
          <button
            type="button"
            aria-label="Sunumu kapat"
            onClick={() => {
              onClose();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="pptx-viewport">
        {loading ? (
          <p className="pptx-message" role="status">
            Slaytlar hazırlanıyor…
          </p>
        ) : error ? (
          <p className="pptx-message pptx-error" role="alert">
            Sunum açılamadı. Geçerli, şifresiz bir .pptx dosyası kullan.
          </p>
        ) : !canvasProps.activeSlide ? (
          <p className="pptx-message">Bu sunumda slayt bulunamadı.</p>
        ) : (
          <ViewerThemeProvider>
            <SlideCanvas
              {...canvasProps}
              canEdit={false}
              mode="preview"
              showGrid={false}
              showRulers={false}
              guides={[]}
              showCommentMarkers={false}
            />
          </ViewerThemeProvider>
        )}
      </div>
    </div>
  );
}
