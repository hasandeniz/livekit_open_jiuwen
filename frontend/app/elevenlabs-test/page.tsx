import { notFound } from 'next/navigation';
import { ElevenLabsTest } from '@/components/elevenlabs/elevenlabs-test';

export const dynamic = 'force-dynamic';

export default function ElevenLabsTestPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const configured = Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_AGENT_ID?.trim()
  );
  return <ElevenLabsTest configured={configured} />;
}
