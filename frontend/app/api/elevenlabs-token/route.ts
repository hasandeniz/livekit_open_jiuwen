import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  // This experiment has no application authentication; never expose it in production.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'This test is available in development only.' },
      { status: 403, headers }
    );
  }
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return NextResponse.json(
      { error: 'A same-origin request is required.' },
      { status: 403, headers }
    );
  }
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim();
  if (!apiKey || !agentId) {
    return NextResponse.json(
      {
        error:
          'Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in frontend/.env.local, then restart the frontend.',
      },
      { status: 503, headers }
    );
  }
  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/token');
  url.searchParams.set('agent_id', agentId);
  try {
    const response = await fetch(url, {
      headers: { 'xi-api-key': apiKey },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Provider bodies can contain sensitive diagnostics. Return only safe messages.
      const error =
        response.status === 401 || response.status === 403
          ? 'ElevenLabs rejected the credentials. Check the API key and agent access.'
          : response.status === 429
            ? 'ElevenLabs is rate limiting requests. Wait before trying again.'
            : 'ElevenLabs could not create a session. Check the agent configuration.';
      return NextResponse.json({ error }, { status: response.status === 429 ? 429 : 502, headers });
    }
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !('token' in data) ||
      typeof data.token !== 'string' ||
      !data.token
    ) {
      return NextResponse.json(
        { error: 'ElevenLabs returned an invalid session credential.' },
        { status: 502, headers }
      );
    }
    return NextResponse.json({ token: data.token }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Could not reach ElevenLabs within the connection timeout. Try again.' },
      { status: 502, headers }
    );
  }
}
