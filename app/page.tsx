import { VoiceAssistant } from '@/components/elevenlabs/voice-assistant';

export const dynamic = 'force-dynamic';
export default function Page() {
  const configured = Boolean(
    process.env.ELEVENLABS_API_KEY?.trim() && process.env.ELEVENLABS_AGENT_ID?.trim()
  );
  return <VoiceAssistant configured={configured} />;
}
