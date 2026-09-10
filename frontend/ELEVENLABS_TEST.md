# ElevenLabs voice test

This is the first migration milestone: an isolated voice and transcript page at
`/elevenlabs-test`. The existing `/` LiveKit application, Python worker, and Docker
services are unchanged. No avatar or openJiuwen integration is connected here yet.

## Configure the hosted agent

1. Create a private ElevenLabs Agent. Select its voice and conversation LLM.
2. Copy the Huawei persona and spoken-response rules from `../agent/prompts.py`
   into the agent's system prompt.
3. Enable interruptions and client events `user_transcript`, `agent_response`,
   `agent_response_correction`, and `interruption`.
4. Configure the supported languages: English, Turkish, Arabic, Spanish,
   Portuguese, Russian. To use this page's language selector, allow the agent
   language override in the security/override settings. Leave "Agent default"
   selected to test without any override.
5. For Huawei GLM, select Custom LLM and enter the exact OpenAI-compatible
   chat-completions URL and model ID from your MaaS console. Store the MaaS API key
   in the ElevenLabs secret store. Do not put it in browser code.
6. Confirm the agent works in the ElevenLabs dashboard first. MaaS streaming,
   response latency, and tool-call compatibility still need live verification.

The test currently targets the standard ElevenLabs API (`api.elevenlabs.io`) and
the SDK's default region. Region-specific residency deployments require matching
server and client endpoint configuration before testing.

## Local configuration

Add to `frontend/.env.local` (ignored by Git):

```dotenv
ELEVENLABS_API_KEY=your-api-key
ELEVENLABS_AGENT_ID=your-agent-id
```

Use an API key authorized to obtain conversation tokens for this agent. The server
issues a short-lived conversation credential; the API key never goes to the page.
The model is selected in the hosted agent, so this page cannot independently
guarantee that the configured model is GLM.

From `frontend`, install dependencies using the project's pnpm version, then run:

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000/elevenlabs-test` (or your configured frontend port).
With the existing Docker setup the frontend is exposed on port 3001; recreate or
update its dependencies after changing package.json. The source bind mount makes
`.env.local` available to Next.js, but restart the frontend after configuring it.
For this page alone you do not need to start the LiveKit server or Python worker.

Click **Start conversation** and grant microphone access. Starting enables the
microphone; mute it with the button. End the session before selecting a new language.
Each new session clears the displayed transcript. Text messages can be sent during
an active voice session. The page does not store transcripts locally.

This unauthenticated experiment is development-only: the page is unavailable and
the token route returns 403 in production. Keep the dev server private. Add real
application authentication and usage controls before exposing a production version.
Microphone access requires localhost or HTTPS.

## Acceptance checks

- Start, mute/unmute, end, reconnect, cancel a pending connection, and navigate away.
- Deny microphone permission and confirm a useful error appears.
- Speak Turkish sentences with Huawei, Vodafone, MatePad, and HarmonyOS; compare
  recognition with the existing app using the same inputs.
- Speak while the agent replies; confirm audio stops and the interruption counter
  increments. A response correction should update its existing transcript entry.
- Try all six languages. If an override is rejected, enable it on the hosted agent
  or use Agent default. Reconnect to apply a different language.
- Type a question and confirm the user message and spoken reply appear.
- Inspect the conversation in ElevenLabs to verify the selected GLM model and errors.
- Compare response delay over several turns. The displayed metric is text/transcript
  arrival to SDK speaking event, **not** end-of-speech to audible playback. Connection
  timing includes the microphone permission prompt.

## Checks without credentials

```sh
node --test tests/elevenlabs.test.mjs
pnpm exec tsc --noEmit
pnpm exec eslint app/elevenlabs-test/page.tsx app/api/elevenlabs-token/route.ts components/elevenlabs/elevenlabs-test.tsx lib/elevenlabs/transcript.ts
```

The automated checks mock token issuance; they do not create paid conversations or
prove recognition quality. Live audio, GLM compatibility, and interruption quality
must be tested with the configured account and a microphone.

## Next milestones

1. Validate live voice + transcripts + GLM.
2. Adapt the existing FaceUnity avatar to SDK output analysis and speaking state.
3. Connect one defined openJiuwen task through an authenticated Python API.
4. Compare results before deciding whether to migrate the main application.

## Official references

- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- https://elevenlabs.io/docs/eleven-agents/customization/events/client-events
- https://support.huaweicloud.com/intl/en-us/qs-maas/qs-maas-0001.html
