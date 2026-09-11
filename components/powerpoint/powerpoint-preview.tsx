'use client';

import { Component, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const SlidePreview = dynamic(() => import('./slide-preview'), {
  ssr: false,
  loading: () => (
    <p className="pptx-message" role="status">
      Önizleyici yükleniyor…
    </p>
  ),
});

export type PresentationDocument = { id: string; content: Uint8Array; name: string };

export function PowerPointUrlDialog({
  onLoaded,
  onClose,
}: {
  onLoaded: (document: PresentationDocument) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    urlInput.current?.focus();
    return () => request.current?.abort();
  }, []);

  function clear() {
    request.current?.abort();
    onClose();
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setLoading(true);
    const timeout = setTimeout(() => controller.abort('timeout'), 60_000);
    try {
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
        response = await fetch(source.href, { signal: controller.signal, credentials: 'omit' });
      } catch {
        throw new Error(
          'Dosyaya erişilemiyor. Bağlantıyı ve dosya sunucusunun CORS izinlerini kontrol et.'
        );
      }
      if (!response.ok) throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
      if (response.headers.get('content-type')?.includes('text/html')) {
        throw new Error(
          'Bu bağlantı bir web sayfası açıyor. Doğrudan .pptx dosyasının bağlantısını kullan.'
        );
      }
      const content = new Uint8Array(await response.arrayBuffer());
      if (
        content.length < 4 ||
        content[0] !== 0x50 ||
        content[1] !== 0x4b ||
        content[2] !== 3 ||
        content[3] !== 4
      ) {
        throw new Error(
          'Geçerli bir .pptx dosyası bulunamadı. Doğrudan dosya bağlantısını kullan.'
        );
      }
      if (controller.signal.aborted) return;
      const segment = source.pathname.split('/').pop() || 'Sunum.pptx';
      let name = segment;
      try {
        name = decodeURIComponent(segment);
      } catch {
        /* Keep the original filename. */
      }
      onLoaded({ id: crypto.randomUUID(), content, name });
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Sunum yüklenemedi.');
      } else if (controller.signal.reason === 'timeout') {
        setError('İndirme zaman aşımına uğradı. Tekrar dene.');
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="pptx-panel pptx-url-dialog"
      aria-labelledby="pptx-heading"
      onCancel={(event) => {
        event.preventDefault();
        clear();
      }}
    >
      <header className="pptx-header">
        <div>
          <span className="section-eyebrow">POWERPOINT</span>
          <h2 id="pptx-heading">Sunum ekle</h2>
        </div>
        <button type="button" onClick={clear} aria-label="Sunum eklemeyi kapat">
          ×
        </button>
      </header>
      <form className="pptx-url-form" onSubmit={(event) => void load(event)}>
        <label htmlFor="pptx-url">PowerPoint dosya bağlantısı</label>
        <div className="pptx-url-controls">
          <input
            id="pptx-url"
            ref={urlInput}
            type="url"
            required
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…/sunum.pptx"
            aria-describedby="pptx-url-help"
          />
          <button type="submit" disabled={!url.trim() || loading}>
            {loading ? 'Yükleniyor…' : 'Sunumu ekle'}
          </button>
          {loading && (
            <button type="button" onClick={clear}>
              İptal
            </button>
          )}
        </div>
        <p id="pptx-url-help">
          Doğrudan .pptx bağlantısını yapıştır. Dosya sunucusu tarayıcıdan erişime izin vermeli.
        </p>
      </form>
      {error && (
        <p className="pptx-message pptx-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="pptx-message" role="status">
          Sunum indiriliyor…
        </p>
      )}
    </dialog>
  );
}

export function PowerPointPreview({
  document,
  onClose,
}: {
  document: PresentationDocument;
  onClose: () => void;
}) {
  return (
    <PreviewErrorBoundary key={document.id} onClose={onClose}>
      <SlidePreview content={document.content} name={document.name} onClose={onClose} />
    </PreviewErrorBoundary>
  );
}

class PreviewErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? (
      <div className="pptx-message">
        <p className="pptx-error" role="alert">
          Önizleme açılamadı. Tekrar dene veya başka bir .pptx bağlantısı kullan.
        </p>
        <button type="button" onClick={this.props.onClose}>
          Sunumu kapat
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
