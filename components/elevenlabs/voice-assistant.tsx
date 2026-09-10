'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { SUPPORTED_LANGUAGES } from '@/app-config';
import { ElevenLabsAvatar } from '@/components/elevenlabs/elevenlabs-avatar';
import { type TranscriptEntry, upsertTranscript } from '@/lib/elevenlabs/transcript';

type Language = 'en' | 'tr' | 'ar' | 'es' | 'pt' | 'ru';
const buttonClass =
  'rounded-xl border border-(--glass-line) px-4 py-2.5 text-sm font-medium transition hover:bg-(--glass) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--aqua) disabled:cursor-not-allowed disabled:opacity-40';

export function VoiceAssistant({ configured }: { configured: boolean }) {
  return (
    <ConversationProvider>
      <VoiceSession configured={configured} />
    </ConversationProvider>
  );
}

function VoiceSession({ configured }: { configured: boolean }) {
  const [language, setLanguage] = useState<Language | ''>('');
  const [messages, setMessages] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [conversationId, setConversationId] = useState('');
  const [interruptions, setInterruptions] = useState(0);
  const [levels, setLevels] = useState({ input: 0, output: 0 });
  const [connectionMs, setConnectionMs] = useState<number | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const startTime = useRef(0);
  const transcriptTime = useRef<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const endOfMessages = useRef<HTMLDivElement>(null);

  const conversation = useConversation({
    onConnect: ({ conversationId: id }) => {
      setConversationId(id);
      setConnectionMs(Math.round(performance.now() - startTime.current));
      startingRef.current = false;
      setStarting(false);
    },
    onDisconnect: () => {
      startingRef.current = false;
      setStarting(false);
      transcriptTime.current = null;
    },
    onError: (message, context) => {
      // The SDK supplies the provider's actual failure message. Keep the
      // fallback for browser/transport failures where it may be absent.
      const detail = typeof message === 'string' && message.trim() ? message.trim() : '';
      const contextDetail =
        context && typeof context === 'object' && 'message' in context && typeof context.message === 'string'
          ? context.message.trim()
          : '';
      setError(
        detail || contextDetail ||
          'The voice session failed. Check microphone permission, agent settings, language overrides, and custom LLM configuration, then reconnect.'
      );
      startingRef.current = false;
      setStarting(false);
    },
    onMessage: ({ role, message, event_id }) => {
      if (role === 'user') transcriptTime.current = performance.now();
      const entry: TranscriptEntry = {
        id: event_id === undefined ? crypto.randomUUID() : `${role}:${event_id}`,
        role,
        text: message,
      };
      setMessages((current) => upsertTranscript(current, entry));
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
    onInterruption: () => setInterruptions((count) => count + 1),
    onModeChange: ({ mode }) => {
      if (mode === 'speaking' && transcriptTime.current !== null) {
        setResponseMs(Math.round(performance.now() - transcriptTime.current));
        transcriptTime.current = null;
      }
    },
  });
  const {
    status,
    isSpeaking,
    isMuted,
    setMuted,
    startSession,
    endSession,
    getInputVolume,
    getOutputVolume,
  } = conversation;
  const connected = status === 'connected';
  const busy = starting || status === 'connecting';

  useEffect(
    () => () => {
      requestRef.current?.abort();
    },
    []
  );
  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: 'nearest' });
  }, [messages]);
  useEffect(() => {
    if (!connected) {
      setLevels({ input: 0, output: 0 });
      return;
    }
    const timer = window.setInterval(() => {
      setLevels({ input: isMuted ? 0 : getInputVolume(), output: getOutputVolume() });
    }, 100);
    return () => window.clearInterval(timer);
  }, [connected, isMuted, getInputVolume, getOutputVolume]);

  async function connect() {
    if (startingRef.current || connected || busy) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    setConnectionMs(null);
    setResponseMs(null);
    setConversationId('');
    setInterruptions(0);
    setMessages([]);
    transcriptTime.current = null;
    startTime.current = performance.now();
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
      transcriptTime.current = performance.now();
      setDraft('');
    } catch {
      setError('Could not send the message. Reconnect and try again.');
    }
  }

  return (
    <main className="relative mx-auto min-h-svh max-w-5xl px-5 pt-24 pb-16 text-(--ink)">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-xs tracking-widest text-(--aqua) uppercase">
            Voice assistant · Local development
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Voice assistant</h1>
          <p className="mt-2 text-sm text-(--ink-soft)">
            Test speech, transcripts, and interruptions with your configured agent.
          </p>
        </div>
      </div>

      <section aria-label="Digital human" className="mb-6">
        <ElevenLabsAvatar />
      </section>

      {!configured && (
        <div
          role="status"
          className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5"
        >
          <h2 className="font-semibold">Connect your ElevenLabs agent</h2>
          <p className="mt-2 text-sm">
            Set <code>ELEVENLABS_API_KEY</code> and <code>ELEVENLABS_AGENT_ID</code> in{' '}
            <code>.env.local</code>, then restart the app.
          </p>
          <p className="mt-2 text-sm">
            Choose the voice and Huawei MaaS custom LLM in the ElevenLabs dashboard. Setup
            instructions are in <code>README.md</code>.
          </p>
        </div>
      )}

      <section
        aria-label="Conversation controls"
        className="rounded-2xl border border-(--glass-line) bg-(--glass) p-5 backdrop-blur-xl"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="mr-auto text-sm font-medium">
            {starting
              ? 'Connecting…'
              : connected
                ? isSpeaking
                  ? 'Agent speaking'
                  : isMuted
                    ? 'Connected · microphone muted'
                    : 'Listening'
                : status}
          </span>
          <label className="flex items-center gap-2 text-sm">
            Language
            <select
              value={language}
              disabled={connected || busy}
              onChange={(event) => setLanguage(event.target.value as Language | '')}
              className="rounded-lg border border-(--glass-line) bg-(--scene-to) px-3 py-2"
            >
              <option value="">Agent default</option>
              {SUPPORTED_LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`${buttonClass} bg-(--aqua) text-black`}
            disabled={!configured || connected || busy}
            onClick={() => void connect()}
          >
            Start conversation
          </button>
          <button
            className={buttonClass}
            disabled={!connected}
            aria-pressed={isMuted}
            onClick={() => setMuted(!isMuted)}
          >
            {isMuted ? 'Unmute microphone' : 'Mute microphone'}
          </button>
          <button className={buttonClass} disabled={!connected && !busy} onClick={disconnect}>
            {busy ? 'Cancel' : 'End conversation'}
          </button>
        </div>
        <p className="mt-4 text-xs text-(--ink-soft)">
          Start enables your microphone. Speak while the agent talks to test interruptions. End the
          conversation before changing language.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm"
          >
            {error}
          </p>
        )}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs">
            Microphone level
            <meter className="mt-2 block h-3 w-full" min={0} max={1} value={levels.input} />
          </label>
          <label className="text-xs">
            Agent audio level
            <meter className="mt-2 block h-3 w-full" min={0} max={1} value={levels.output} />
          </label>
        </div>
      </section>

      <section
        aria-label="Transcript"
        className="mt-6 overflow-hidden rounded-2xl border border-(--glass-line) bg-(--glass) backdrop-blur-xl"
      >
        <h2 className="border-b border-(--glass-line) px-5 py-4 font-semibold">Conversation</h2>
        <div
          role="log"
          aria-label="Conversation transcript"
          aria-live="polite"
          className="h-80 space-y-4 overflow-y-auto p-5"
        >
          {messages.length === 0 && (
            <p className="py-12 text-center text-sm text-(--ink-soft)">
              Your speech and the agent’s replies will appear here.
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[90%] rounded-xl border border-(--glass-line) p-3 ${message.role === 'user' ? 'ml-auto bg-(--aqua)/10' : ''}`}
            >
              <p className="mb-1 text-xs font-semibold text-(--ink-soft)">
                {message.role === 'user' ? 'You' : 'Agent'}
                {message.corrected ? ' · corrected after interruption' : ''}
              </p>
              <p dir="auto" className="text-sm whitespace-pre-wrap">
                {message.text || '(Response interrupted before speech)'}
              </p>
            </div>
          ))}
          <div ref={endOfMessages} />
        </div>
        <form onSubmit={send} className="flex gap-3 border-t border-(--glass-line) p-4">
          <input
            aria-label="Message"
            placeholder="Or type a question…"
            value={draft}
            disabled={!connected}
            onChange={(event) => setDraft(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-(--glass-line) bg-transparent px-3 py-2 text-sm"
          />
          <button type="submit" disabled={!connected || !draft.trim()} className={buttonClass}>
            Send
          </button>
        </form>
      </section>
      <details className="mt-6 rounded-xl border border-(--glass-line) p-4 text-xs text-(--ink-soft)">
        <summary className="cursor-pointer font-semibold">Session diagnostics</summary>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2">
          <div>
            <dt>Conversation ID</dt>
            <dd className="break-all">{conversationId || '—'}</dd>
          </div>
          <div>
            <dt>Connection time (includes permission prompt)</dt>
            <dd>{connectionMs === null ? '—' : `${connectionMs} ms`}</dd>
          </div>
          <div>
            <dt>Last text/transcript → SDK speaking event</dt>
            <dd>{responseMs === null ? '—' : `${responseMs} ms`}</dd>
          </div>
          <div>
            <dt>Interruption events</dt>
            <dd>{interruptions}</dd>
          </div>
        </dl>
        <p className="mt-3">
          Timing is an SDK event approximation, not measured end-of-speech to audible playback. The
          model and voice are controlled by your ElevenLabs agent settings.
        </p>
      </details>
    </main>
  );
}
