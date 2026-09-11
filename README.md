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

Voice sessions work in development and production when the server credentials are configured. Never expose keys through NEXT_PUBLIC_ variables.

## Production deployment

Use Node.js 22+ and the pinned pnpm 9.15.9. Include `patches/`, `pnpm-lock.yaml`, `vendor/`, and `public/` in the deployment source. The LiveKit patch is applied automatically during `pnpm install`; no separate LiveKit server is needed.

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` in the server environment. For an HTTPS reverse proxy, set `APP_ORIGIN` to the exact public origin, for example `https://assistant.example.com` (no trailing slash or path). This keeps the token endpoint's browser-origin check working when the internal server uses HTTP. Do not derive this value from untrusted forwarded headers.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm start
```

Use a Node.js hosting service or process manager to keep the app running, and serve the public site over HTTPS for microphone access. Static-only hosting is insufficient because session tokens are issued by the server. The server must reach the ElevenLabs API, and visitors' browsers must reach ElevenLabs' WebRTC service. Forward the browser's Origin header unchanged through the proxy. Keep the FaceUnity assets in `public/digital-human/` available at their original paths.

This app currently allows visitors to start sessions without signing in. The origin check is not authentication or a usage limit. For a restricted deployment, protect the entire site and `/api/elevenlabs-token` with your hosting platform's access control. Configure usage limits in ElevenLabs for public deployments.

## Checks

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Stop the dev server before building: both use .next. Live microphone, interruption and avatar synchronization require manual verification.

The ElevenLabs SDK retains its own transitive LiveKit transport dependency. LICENSE retains attribution for reused starter code.

`patches/livekit-client@2.22.3.patch` fixes shutdown logging in the browser ESM transport: pending reads from a locally closed or replaced connection no longer report a session failure. Active connection failures still report normally. pnpm applies the patch on install; review it when upgrading the SDK. The CommonJS bundle is unchanged.
