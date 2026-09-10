'use client';

import { useEffect, useRef } from 'react';
import { useConversation } from '@elevenlabs/react';
import { AvatarCanvas } from '@/components/digital-human/avatar-canvas';
import {
  disableLipSync,
  enableLipSync,
  setMouthOpenness,
  setMouthShape,
  setMouthSibilance,
  startGesturing,
  stopGesturing,
} from '@/lib/digital-human/use-avatar';

type AlignmentSegment = {
  chars: string[];
  starts: number[];
  durations: number[];
  baseMs: number;
  endMs: number;
};

type MouthTarget = { openness: number; shape: number; sibilance: number };

function targetForCharacter(char: string): MouthTarget {
  const c = char.toLocaleLowerCase('tr-TR');
  if ('aeıioöuü'.includes(c)) {
    if ('i e'.includes(c)) return { openness: 0.72, shape: 0.9, sibilance: 0 };
    if ('öü'.includes(c)) return { openness: 0.62, shape: 0.25, sibilance: 0 };
    return { openness: 0.78, shape: 0.42, sibilance: 0 };
  }
  if ('sşzcçfjh'.includes(c)) return { openness: 0.2, shape: 0.5, sibilance: 0.9 };
  if (/\p{L}/u.test(c)) return { openness: 0.3, shape: 0.5, sibilance: 0 };
  return { openness: 0.04, shape: 0.5, sibilance: 0 };
}

function sampleAlignment(segments: AlignmentSegment[], elapsedMs: number): MouthTarget | null {
  for (const segment of segments) {
    const localMs = elapsedMs - segment.baseMs;
    if (localMs < 0 || localMs > segment.endMs - segment.baseMs) continue;
    for (let i = segment.chars.length - 1; i >= 0; i--) {
      if (localMs >= segment.starts[i]) {
        return targetForCharacter(segment.chars[i]);
      }
    }
  }
  return null;
}

/** FaceUnity avatar driven by the ElevenLabs WebRTC output analyser. */
export function ElevenLabsAvatar() {
  const alignmentRef = useRef<AlignmentSegment[]>([]);
  const speechEpochRef = useRef<number | null>(null);
  const { isSpeaking, getOutputVolume, getOutputByteFrequencyData } = useConversation({
    // Lower playback volume without changing the output analyser used for
    // lip-sync (the SDK analyses the track before applying this gain).
    volume: 0.55,
    onAudioAlignment: (alignment) => {
      const chars = Array.isArray(alignment?.chars) ? alignment.chars : [];
      const starts = Array.isArray(alignment?.char_start_times_ms)
        ? alignment.char_start_times_ms
        : [];
      const durations = Array.isArray(alignment?.char_durations_ms)
        ? alignment.char_durations_ms
        : [];
      if (!chars.length || chars.length !== starts.length || chars.length !== durations.length) return;

      const localEndMs = chars.reduce(
        (end, _char, index) => Math.max(end, starts[index] + durations[index]),
        0
      );
      const previousEndMs = alignmentRef.current.at(-1)?.endMs ?? 0;
      alignmentRef.current.push({
        chars,
        starts,
        durations,
        baseMs: previousEndMs,
        endMs: previousEndMs + localEndMs,
      });
      // Keep the timeline bounded if a long session streams many audio chunks.
      if (alignmentRef.current.length > 120) alignmentRef.current.shift();
    },
  });
  const speakingRef = useRef(isSpeaking);

  useEffect(() => {
    speakingRef.current = isSpeaking;
    if (isSpeaking) {
      if (speechEpochRef.current === null) speechEpochRef.current = performance.now() - 80;
      startGesturing();
    } else {
      speechEpochRef.current = null;
      alignmentRef.current = [];
      stopGesturing();
    }
  }, [isSpeaking]);

  useEffect(() => {
    let stopped = false;
    let raf = 0;
    let openness = 0;
    let shape = 0.5;
    let sibilance = 0;

    const loop = () => {
      if (stopped) return;
      // The avatar may still be loading; enableLipSync safely retries each frame
      // until FaceUnity's expression parser is ready.
      enableLipSync();

      const volume = speakingRef.current ? getOutputVolume() : 0;
      const aligned =
        speakingRef.current && speechEpochRef.current !== null
          ? sampleAlignment(alignmentRef.current, performance.now() - speechEpochRef.current)
          : null;
      const acousticOpen = Math.min(1, Math.max(0, volume * 3.3));
      const targetOpen = aligned
        ? aligned.openness * Math.min(1, Math.max(0, volume * 5.2))
        : acousticOpen;
      openness += (targetOpen - openness) * (targetOpen > openness ? 0.45 : 0.16);
      setMouthOpenness(openness);

      const spectrum = getOutputByteFrequencyData();
      let weighted = 0;
      let total = 0;
      for (let i = 0; i < spectrum.length; i++) {
        const energy = spectrum[i];
        weighted += energy * i;
        total += energy;
      }
      if (aligned) {
        shape += (aligned.shape - shape) * 0.35;
        sibilance += (aligned.sibilance - sibilance) * 0.35;
        setMouthShape(shape);
        setMouthSibilance(sibilance);
      } else if (total > 0) {
        const targetShape = Math.min(1, Math.max(0, weighted / total / spectrum.length * 2));
        shape += (targetShape - shape) * 0.22;
        setMouthShape(shape);
      }

      // High-frequency energy gives a small teeth/sibilant contribution.
      let high = 0;
      const split = Math.floor(spectrum.length * 0.62);
      for (let i = split; i < spectrum.length; i++) high += spectrum[i];
      const targetSibilance = total > 0 ? Math.min(1, (high / total) * 2.5) : 0;
      sibilance += (targetSibilance - sibilance) * 0.2;
      if (!aligned) setMouthSibilance(sibilance);

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stopGesturing();
      disableLipSync();
    };
  }, [getOutputByteFrequencyData, getOutputVolume]);

  return (
    <div className="relative mx-auto h-[32rem] w-full max-w-[24rem] overflow-hidden rounded-2xl border border-(--glass-line) bg-black/20">
      <AvatarCanvas className="elevenlabs-avatar-canvas" />
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/75 backdrop-blur">
        {isSpeaking ? 'Agent speaking' : 'Avatar idle'}
      </span>
    </div>
  );
}
