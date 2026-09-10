# ElevenLabs digital human

Next.js + ElevenLabs Agents + FaceUnity. No Python worker or separate LiveKit server is required.

## Run

Use Node.js 22+ and pnpm 9.15.9.

```powershell
pnpm install
Copy-Item .env.example .env.local
# Fill ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in .env.local.
pnpm dev
```

Open http://localhost:3000. If .env.local already exists, edit it instead of copying over it. Run only one dev server in this folder.

## Agent setup

Configure voice, languages and LLM in ElevenLabs. Enable Language overrides in Security to use the language selector. Enable audio, user_transcript, agent_response, interruption and agent_response_correction events. The custom LLM dashboard URL field appends /chat/completions; use the base URL for your MaaS region and keep its key in an ElevenLabs secret.

## Code

- app/page.tsx: main page.
- app/api/elevenlabs-token/route.ts: server-only token issuance.
- components/elevenlabs/: conversation UI and avatar adapter.
- lib/digital-human/: renderer and mouth/gesture controls.
- public/digital-human/ and vendor/: required FaceUnity assets and SDK.

Mouth motion combines audio analysis with approximate character timing, not true phoneme tracking. Hand gestures use prerecorded animations. Playback volume is 55%. openJiuwen is not integrated yet.

Token issuance remains development-only because this app has no user authentication. Production voice sessions remain disabled until access control is implemented. Never expose keys through NEXT_PUBLIC_ variables.

## Checks

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Stop the dev server before building: both use .next. Live microphone, interruption and avatar synchronization require manual verification.

The ElevenLabs SDK retains its own transitive LiveKit transport dependency. LICENSE retains attribution for reused starter code.
