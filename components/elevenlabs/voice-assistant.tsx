'use client';

import { type FormEvent, useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { SUPPORTED_LANGUAGES } from '@/app-config';
import { BrandLogo } from '@/components/app/brand-logo';
import { ElevenLabsAvatar } from '@/components/elevenlabs/elevenlabs-avatar';
import { ToolProgress } from '@/components/elevenlabs/tool-progress';
import { DocumentPreview, DocumentUrlDialog } from '@/components/powerpoint/powerpoint-preview';
import { toolDocumentUrl } from '@/lib/elevenlabs/tool-document';
import {
  DOCUMENT_TOOL_NAME,
  initialToolProgress,
  toolProgressReducer,
} from '@/lib/elevenlabs/tool-progress';
import { type TranscriptEntry, upsertTranscript } from '@/lib/elevenlabs/transcript';
import {
  type OfficeDocument,
  loadOfficeDocument,
  officeFilename,
  officeMimeTypes,
} from '@/lib/office-document';

type Language = 'en' | 'tr';

export function VoiceAssistant({ configured }: { configured: boolean }) {
  return (
    <ConversationProvider>
      <VoiceSession configured={configured} />
    </ConversationProvider>
  );
}

function VoiceSession({ configured }: { configured: boolean }) {
  const [language, setLanguage] = useState<Language>('tr');
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const [presentation, setPresentation] = useState<OfficeDocument | null>(null);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'presentation' | 'chat'>('presentation');
  const presentationButton = useRef<HTMLButtonElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const presentationStage = useRef<HTMLElement>(null);
  const toolRequest = useRef<AbortController | null>(null);
  const handledToolCalls = useRef(new Set<string>());
  const [toolLoading, setToolLoading] = useState(false);
  const [toolProgress, dispatchToolProgress] = useReducer(toolProgressReducer, initialToolProgress);
  const pendingToolTimes = Object.values(toolProgress.pending);
  const [toolError, setToolError] = useState<string | null>(null);
  const [retryDocument, setRetryDocument] = useState<{ url: string; callId: string } | null>(null);

  function cancelToolDownload() {
    toolRequest.current?.abort();
    toolRequest.current = null;
    setToolLoading(false);
  }

  function acceptDocument(document: OfficeDocument) {
    cancelToolDownload();
    setToolError(null);
    setRetryDocument(null);
    setPresentation(document);
    setPresentationOpen(false);
    setMobileView('chat');
  }

  async function loadToolDocument(url: string, callId: string) {
    cancelToolDownload();
    const controller = new AbortController();
    toolRequest.current = controller;
    setToolLoading(true);
    setToolError(null);
    setRetryDocument({ url, callId });
    const timeout = setTimeout(() => controller.abort('timeout'), 60_000);
    try {
      const document = await loadOfficeDocument(url, controller.signal);
      if (toolRequest.current === controller && !controller.signal.aborted) {
        acceptDocument(document);
      }
    } catch (cause) {
      if (toolRequest.current === controller) {
        if (controller.signal.reason === 'timeout') {
          setToolError('İndirme zaman aşımına uğradı. Tekrar dene.');
        } else if (!controller.signal.aborted) {
          setToolError(cause instanceof Error ? cause.message : 'Dosya yüklenemedi.');
        }
      }
    } finally {
      clearTimeout(timeout);
      if (toolRequest.current === controller) {
        toolRequest.current = null;
        setToolLoading(false);
      }
    }
  }

  useEffect(() => {
    if (presentationOpen) presentationStage.current?.focus({ preventScroll: true });
  }, [presentationOpen]);

  function openPresentation() {
    setPresentationOpen(true);
    setMobileView('presentation');
  }

  function closePresentation() {
    setPresentationOpen(false);
    requestAnimationFrame(() => fileButton.current?.focus());
  }

  function downloadPresentation() {
    if (!presentation) return;
    const bytes = new Uint8Array(presentation.content);
    const blob = new Blob([bytes.buffer], {
      type: officeMimeTypes[presentation.kind],
    });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = officeFilename(presentation.name, presentation.kind);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  }

  const conversation = useConversation({
    onConnect: () => {
      startingRef.current = false;
      setStarting(false);
    },
    onDisconnect: () => {
      dispatchToolProgress({ type: 'reset' });
      cancelToolDownload();
      startingRef.current = false;
      setStarting(false);
    },
    onError: (message, context) => {
      dispatchToolProgress({ type: 'reset' });
      // The SDK supplies the provider's actual failure message. Keep the
      // fallback for browser/transport failures where it may be absent.
      const detail = typeof message === 'string' && message.trim() ? message.trim() : '';
      const contextDetail =
        context &&
        typeof context === 'object' &&
        'message' in context &&
        typeof context.message === 'string'
          ? context.message.trim()
          : '';
      setError(
        detail ||
          contextDetail ||
          'The voice session failed. Check microphone permission, agent settings, language overrides, and custom LLM configuration, then reconnect.'
      );
      startingRef.current = false;
      setStarting(false);
    },
    onMessage: ({ role, message, event_id }) => {
      const entry: TranscriptEntry = {
        id: event_id === undefined ? crypto.randomUUID() : `${role}:${event_id}`,
        role,
        text: message,
      };
      setMessages((current) => upsertTranscript(current, entry));
    },
    onAgentToolRequest: (event) => {
      if (event.tool_name !== DOCUMENT_TOOL_NAME) return;
      setToolError(null);
      dispatchToolProgress({ type: 'start', id: event.tool_call_id, at: Date.now() });
    },
    onAgentToolResponse: (event) => {
      if (event.tool_name === DOCUMENT_TOOL_NAME) {
        dispatchToolProgress({ type: 'finish', id: event.tool_call_id });
        if (event.is_error || ('is_blocked' in event && event.is_blocked)) {
          setRetryDocument(null);
          setToolError('Dosya hazırlanamadı. Asistandan tekrar denemesini iste.');
        }
      }
      if (!('full_tool_result' in event) || event.is_error || event.is_blocked) return;
      if (handledToolCalls.current.has(event.tool_call_id)) return;
      if (event.truncated) {
        cancelToolDownload();
        setRetryDocument(null);
        setToolError('Araç yanıtı eksik iletildi. Dosya bağlantısı alınamadı.');
        return;
      }
      const url = toolDocumentUrl(event.full_tool_result);
      if (!url) return;
      handledToolCalls.current.add(event.tool_call_id);
      void loadToolDocument(url, event.tool_call_id);
    },
    onAgentResponseCorrection: ({ event_id, corrected_agent_response }) => {
      setMessages((current) =>
        upsertTranscript(current, {
          id: `agent:${event_id}`,
          role: 'agent',
          text: corrected_agent_response,
          corrected: true,
        })
      );
    },
  });
  const { status, isMuted, setMuted, startSession, endSession } = conversation;
  const connected = status === 'connected';
  const busy = starting || status === 'connecting';
  useEffect(
    () => () => {
      requestRef.current?.abort();
      toolRequest.current?.abort();
    },
    []
  );
  useEffect(() => {
    if (followMessages.current) endOfMessages.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);
  async function connect() {
    if (startingRef.current || connected || busy) return;
    followMessages.current = true;
    startingRef.current = true;
    setStarting(true);
    setError(null);

    setMessages([]);

    cancelToolDownload();
    handledToolCalls.current.clear();
    dispatchToolProgress({ type: 'reset' });
    setToolError(null);
    setRetryDocument(null);

    const controller = new AbortController();
    requestRef.current = controller;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires localhost or HTTPS and a supported browser.');
      }
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      // The SDK owns the real microphone stream. Release this permission probe.
      permission.getTracks().forEach((track) => track.stop());
      if (controller.signal.aborted) return;
      const response = await fetch('/api/elevenlabs-token', {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to obtain a session credential.');
      if (controller.signal.aborted) return;
      // This SDK version reports async completion through callbacks, not a promise.
      startSession({
        conversationToken: data.token,
        connectionType: 'webrtc',
        ...(language ? { overrides: { agent: { language } } } : {}),
      });
    } catch (cause) {
      if (!controller.signal.aborted) {
        const denied = cause instanceof DOMException && cause.name === 'NotAllowedError';
        setError(
          denied
            ? 'Microphone permission was denied. Allow it in the browser and try again.'
            : cause instanceof Error
              ? cause.message
              : 'Unable to start the session.'
        );
        startingRef.current = false;
        setStarting(false);
      }
    }
  }

  function disconnect() {
    dispatchToolProgress({ type: 'reset' });
    cancelToolDownload();
    requestRef.current?.abort();
    endSession();
    startingRef.current = false;
    setStarting(false);
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !connected) return;
    try {
      conversation.sendUserMessage(text);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text }]);

      setDraft('');
    } catch {
      setError('Could not send the message. Reconnect and try again.');
    }
  }

  function clearConversation() {
    dispatchToolProgress({ type: 'reset' });
    cancelToolDownload();
    setToolError(null);
    setRetryDocument(null);
    setMessages([]);
    setError(null);
    followMessages.current = true;
  }

  return (
    <main className="assistant-shell">
      <header className="assistant-header">
        <Link href="/" className="assistant-brand" aria-label="Ana sayfa">
          <BrandLogo title="Huawei" className="h-8 w-auto" />
        </Link>
      </header>
      <div
        className={`assistant-workspace ${presentationOpen ? 'has-presentation' : ''}`}
        data-mobile-view={mobileView}
      >
        <section className="avatar-stage" aria-label="Dijital asistan">
          <div className="stage-topline">
            <label className="language-control">
              <VoiceIcon kind="globe" />
              <span className="sr-only">Görüşme dili</span>
              <select
                value={language}
                disabled={connected || busy}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <span className={`session-pill ${connected ? 'is-live' : ''}`} role="status">
              <span />
              {connected ? 'Canlı görüşme' : busy ? 'Bağlanıyor…' : 'Hazır'}
            </span>
          </div>
          <div className="avatar-spotlight" aria-hidden="true" />
          <div className="avatar-presentation">
            <ElevenLabsAvatar />
          </div>
        </section>
        <nav className="workspace-tabs" aria-label="Çalışma alanı">
          <button
            type="button"
            aria-pressed={mobileView === 'presentation'}
            onClick={() => setMobileView('presentation')}
          >
            {presentation?.kind === 'pptx' ? 'Sunum' : 'Belge'}
          </button>
          <button
            type="button"
            aria-pressed={mobileView === 'chat'}
            onClick={() => setMobileView('chat')}
          >
            Sohbet {messages.length > 0 && <span>({messages.length})</span>}
          </button>
        </nav>
        <section
          className="presentation-stage pptx-panel"
          aria-label="Dosya önizleme"
          hidden={!presentationOpen}
          ref={presentationStage}
          tabIndex={-1}
        >
          {presentation && <DocumentPreview document={presentation} onClose={closePresentation} />}
        </section>
        <section className="chat-panel" aria-label="Sohbet">
          <header className="chat-header">
            <h2>Sohbetimiz</h2>
            <div className="chat-header-actions">
              <button
                ref={presentationButton}
                type="button"
                className="presentation-trigger"
                onClick={() => setUrlDialogOpen(true)}
                aria-haspopup="dialog"
              >
                Dosya ekle
              </button>
              <button
                className="clear-chat-button"
                type="button"
                disabled={!messages.length && !error}
                onClick={clearConversation}
                aria-label="Sohbeti temizle"
              >
                <VoiceIcon kind="clear" />
              </button>
            </div>
          </header>
          {presentation && (
            <article className="presentation-card" aria-label="Eklenen dosya" aria-live="polite">
              <span className="presentation-file-icon" aria-hidden="true">
                {{ pptx: 'P', docx: 'W', xlsx: 'X' }[presentation.kind]}
              </span>
              <div>
                <strong title={presentation.name}>{presentation.name}</strong>
                <span>
                  {{ pptx: 'PowerPoint', docx: 'Word', xlsx: 'Excel' }[presentation.kind]} · Salt
                  okunur
                </span>
              </div>
              <div className="presentation-card-actions">
                <button
                  type="button"
                  className="presentation-download"
                  onClick={downloadPresentation}
                >
                  İndir
                </button>
                {!presentationOpen && (
                  <button ref={fileButton} type="button" onClick={openPresentation}>
                    {presentation.kind === 'pptx' ? 'Sunumu aç' : 'Belgeyi aç'}
                  </button>
                )}
              </div>
            </article>
          )}
          {pendingToolTimes.length > 0 && (
            <ToolProgress startedAt={Math.min(...pendingToolTimes)} />
          )}
          {toolLoading && (
            <div className="session-notice" role="status">
              <p>Asistanın hazırladığı dosya yükleniyor…</p>
              <button className="tool-document-action" type="button" onClick={cancelToolDownload}>
                İptal
              </button>
            </div>
          )}
          {toolError && (
            <div className="session-notice" role="alert">
              <strong>Dosya yüklenemedi</strong>
              <p>{toolError}</p>
              {retryDocument && !toolLoading && (
                <button
                  className="tool-document-action"
                  type="button"
                  onClick={() => void loadToolDocument(retryDocument.url, retryDocument.callId)}
                >
                  Tekrar dene
                </button>
              )}
              <button
                type="button"
                onClick={() => setToolError(null)}
                aria-label="Dosya bildirimini kapat"
              >
                ×
              </button>
            </div>
          )}
          {(!configured || error) && (
            <div className="session-notice" role="alert">
              <strong>
                {!configured ? 'Asistan şu anda kullanılamıyor' : 'Bağlantıda bir sorun oluştu'}
              </strong>
              <p>{!configured ? 'Lütfen daha sonra tekrar dene.' : error}</p>
              {error && (
                <button onClick={() => setError(null)} aria-label="Bildirimi kapat">
                  ×
                </button>
              )}
            </div>
          )}
          <div
            className="chat-history"
            role="log"
            aria-label="Sohbet mesajları"
            aria-live="polite"
            onScroll={(event) => {
              const element = event.currentTarget;
              followMessages.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            }}
          >
            {messages.length === 0 ? (
              <div className="chat-empty">
                <div className="empty-symbol">
                  <VoiceIcon kind="chat" />
                  <span aria-hidden="true">✦</span>
                </div>
                <h3>Ne konuşalım?</h3>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`chat-message ${message.role === 'user' ? 'from-user' : 'from-assistant'}`}
                >
                  <span className="message-author">
                    {message.role === 'user' ? 'Sen' : 'Dijital asistan'}
                  </span>
                  <div className="message-bubble">
                    <p dir="auto">{message.text || 'Yanıt kesildi.'}</p>
                  </div>
                  {message.corrected && <span className="message-note">Konuşma kesildi</span>}
                </article>
              ))
            )}
            <div ref={endOfMessages} />
          </div>
          <div className="composer-area">
            <div className={`composer-layout ${connected || busy ? 'is-compact' : 'is-start'}`}>
              <div className="stage-bottom chat-controls">
                <div className="call-controls">
                  {connected ? (
                    <>
                      <button
                        className={`control-button mute-button ${isMuted ? 'is-muted' : ''}`}
                        aria-pressed={isMuted}
                        aria-label={isMuted ? 'Mikrofonu aç' : 'Sessize al'}
                        title={isMuted ? 'Mikrofonu aç' : 'Sessize al'}
                        onClick={() => setMuted(!isMuted)}
                      >
                        <VoiceIcon kind={isMuted ? 'muted' : 'mic'} />
                      </button>
                      <button
                        className="control-button end-button"
                        aria-label="Görüşmeyi bitir"
                        title="Görüşmeyi bitir"
                        onClick={disconnect}
                      >
                        <VoiceIcon kind="end" />
                      </button>
                    </>
                  ) : busy ? (
                    <button className="control-button secondary-button" onClick={disconnect}>
                      Bağlanıyor… İptal et
                    </button>
                  ) : (
                    <button
                      className="control-button start-button"
                      aria-label="Konuşmaya başla"
                      title="Konuşmaya başla"
                      disabled={!configured}
                      onClick={() => void connect()}
                    >
                      <VoiceIcon kind="mic" />
                      Konuşmaya başla
                    </button>
                  )}
                </div>
              </div>
              <form onSubmit={send} className="chat-composer">
                <input
                  aria-label="Mesajın"
                  placeholder={connected ? 'Aklından geçeni yaz…' : 'Önce bir görüşme başlat…'}
                  value={draft}
                  disabled={!connected}
                  maxLength={4000}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  type="submit"
                  aria-label="Mesajı gönder"
                  disabled={!connected || !draft.trim()}
                >
                  <VoiceIcon kind="send" />
                </button>
              </form>
            </div>
            <p className="composer-note">
              Yapay zekâ yanıtları hata içerebilir. Önemli bilgileri doğrula.
            </p>
          </div>
        </section>
      </div>
      {urlDialogOpen && (
        <DocumentUrlDialog
          onLoaded={acceptDocument}
          onClose={() => {
            setUrlDialogOpen(false);
            requestAnimationFrame(() => presentationButton.current?.focus());
          }}
        />
      )}
    </main>
  );
}

function VoiceIcon({
  kind,
}: {
  kind: 'mic' | 'muted' | 'end' | 'chat' | 'send' | 'globe' | 'clear';
}) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'mic' || kind === 'muted' ? (
        <>
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
          {kind === 'muted' && <path d="m3 3 18 18" />}
        </>
      ) : kind === 'send' ? (
        <path d="M12 19V5m-6 6 6-6 6 6" />
      ) : kind === 'chat' ? (
        <path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0ZM7 10h8M7 14h5" />
      ) : kind === 'clear' ? (
        <>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
        </>
      ) : kind === 'globe' ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </>
      ) : (
        <path d="M3 15v-4c5-5 13-5 18 0v4h-5v-4a14 14 0 0 0-8 0v4Z" />
      )}
    </svg>
  );
}
