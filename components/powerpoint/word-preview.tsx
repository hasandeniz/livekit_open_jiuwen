'use client';

import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

export default function WordPreview({
  content,
  name,
  onClose,
}: {
  content: Uint8Array;
  name: string;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let active = true;
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    const styles = document.createElement('div');
    const pages = document.createElement('div');
    const overrides = document.createElement('style');
    overrides.textContent = `
      :host { display: block; }
      .docx-wrapper { background: transparent; padding: 16px; }
      .docx-wrapper > section.docx { margin-bottom: 16px; }
      .docx-wrapper > section.docx:last-child { margin-bottom: 0; }
    `;
    shadow.replaceChildren(styles, pages, overrides);
    setStatus('loading');
    function fitPages() {
      if (!active || !element || element.clientWidth === 0) return;
      const widths = Array.from(pages.querySelectorAll<HTMLElement>('section.docx')).map(
        (page) => page.offsetWidth
      );
      const width = Math.max(0, ...widths);
      pages.style.zoom = width ? String(Math.min(1, element.clientWidth / (width + 32))) : '1';
    }
    const observer = new ResizeObserver(fitPages);
    observer.observe(element);
    void renderAsync(content, pages, styles, {
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      useBase64URL: true,
      renderAltChunks: false,
    })
      .then(() => {
        if (!active) return;
        fitPages();
        setStatus('ready');
      })
      .catch(() => {
        if (active) {
          pages.replaceChildren();
          setStatus('error');
        }
      });
    return () => {
      active = false;
      observer.disconnect();
      shadow.replaceChildren();
    };
  }, [content]);

  return (
    <div className="pptx-preview">
      <div className="pptx-navigation docx-navigation">
        <span className="pptx-filename" title={name}>
          {name}
        </span>
        <div className="pptx-view-actions">
          <button type="button" aria-label="Belgeyi kapat" onClick={onClose}>
            ×
          </button>
        </div>
      </div>
      <div
        className="pptx-viewport"
        role="region"
        aria-label="Word belge sayfaları"
        tabIndex={0}
        aria-busy={status === 'loading'}
      >
        {status === 'loading' && (
          <p className="pptx-message" role="status">
            Belge hazırlanıyor…
          </p>
        )}
        {status === 'error' && (
          <p className="pptx-message pptx-error" role="alert">
            Belge önizlenemedi. Geçerli, şifresiz bir .docx dosyası kullan.
          </p>
        )}
        <div
          ref={host}
          style={{
            width: '100%',
            flexShrink: 0,
            visibility: status === 'ready' ? 'visible' : 'hidden',
          }}
        />
      </div>
    </div>
  );
}
