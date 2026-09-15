'use client';

import { Component, type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { type OfficeDocument, loadOfficeDocument } from '@/lib/office-document';

const SlidePreview = dynamic(() => import('./slide-preview'), {
  ssr: false,
  loading: () => (
    <p className="pptx-message" role="status">
      Önizleyici yükleniyor…
    </p>
  ),
});

const WordPreview = dynamic(() => import('./word-preview'), {
  ssr: false,
  loading: () => (
    <p className="pptx-message" role="status">
      Önizleyici yükleniyor…
    </p>
  ),
});

const ExcelPreview = dynamic(() => import('./excel-preview'), {
  ssr: false,
  loading: () => (
    <p className="pptx-message" role="status">
      Önizleyici yükleniyor…
    </p>
  ),
});

export function DocumentUrlDialog({
  onLoaded,
  onClose,
}: {
  onLoaded: (document: OfficeDocument) => void;
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
      onLoaded(await loadOfficeDocument(url, controller.signal));
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Dosya yüklenemedi.');
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
          <span className="section-eyebrow">POWERPOINT / WORD / EXCEL</span>
          <h2 id="pptx-heading">Dosya ekle</h2>
        </div>
        <button type="button" onClick={clear} aria-label="Dosya eklemeyi kapat">
          ×
        </button>
      </header>
      <form className="pptx-url-form" onSubmit={(event) => void load(event)}>
        <label htmlFor="pptx-url">PowerPoint, Word veya Excel dosya bağlantısı</label>
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
            {loading ? 'Yükleniyor…' : 'Dosyayı ekle'}
          </button>
          {loading && (
            <button type="button" onClick={clear}>
              İptal
            </button>
          )}
        </div>
        <p id="pptx-url-help">
          Doğrudan .pptx, .docx veya .xlsx bağlantısını yapıştır. Dosya sunucusu tarayıcıdan erişime
          izin vermeli.
        </p>
      </form>
      {error && (
        <p className="pptx-message pptx-error" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="pptx-message" role="status">
          Dosya indiriliyor…
        </p>
      )}
    </dialog>
  );
}

export function DocumentPreview({
  document,
  onClose,
}: {
  document: OfficeDocument;
  onClose: () => void;
}) {
  return (
    <PreviewErrorBoundary key={document.id} onClose={onClose}>
      {document.kind === 'xlsx' ? (
        <ExcelPreview content={document.content} name={document.name} onClose={onClose} />
      ) : document.kind === 'docx' ? (
        <WordPreview content={document.content} name={document.name} onClose={onClose} />
      ) : (
        <SlidePreview content={document.content} name={document.name} onClose={onClose} />
      )}
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
          Önizleme açılamadı. Tekrar dene veya başka bir .pptx, .docx veya .xlsx bağlantısı kullan.
        </p>
        <button type="button" onClick={this.props.onClose}>
          Önizlemeyi kapat
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
