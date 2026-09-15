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

## PowerPoint, Word and Excel preview

Choose **Dosya ekle** in the chat header to enter a direct HTTP(S) `.pptx`, `.docx` or `.xlsx` URL. After downloading, a file card appears in the conversation area. Choose **Sunumu aç** to open the presentation alongside the chat; the avatar becomes compact above the chat. Closing the preview restores the original layout, preserving the conversation, voice session and last viewed slide. On mobile, **Sunum / Sohbet** switches the visible content while the call controls and message composer stay available. The preview toolbar provides slide navigation and a close control. It works without starting a voice session. Downloads can be cancelled and time out after 60 seconds. The current presentation stays available if adding a replacement fails or is cancelled.

The file is fetched in the browser without credentials. Its server must allow the frontend origin via CORS (or serve the file from the same origin). Use a direct download or signed URL, not an Office/Drive sharing page. For local testing, place a presentation in `public/` and enter `http://localhost:3000/filename.pptx`.

Smoke-test files are included at `http://localhost:3000/pptx-preview-test.pptx` (two slides) and `http://localhost:3000/docx-preview-test.docx` (two pages).

Word files use `docx-preview` in the same workspace. Choose **Belgeyi aç** on the Word file card. Pages fit the panel width and scroll vertically; the toolbar has only a close button. The original file can be downloaded from its card. Document styles are isolated from the chat in a shadow root. Embedded HTML chunks are disabled. Browser rendering may differ from Microsoft Word, and page boundaries depend on the breaks stored in the file.

The downloaded Office archive determines the format, so signed URLs and URLs without filename extensions are supported. Invalid archives and unsupported formats are rejected before replacing the current document. Both preview libraries load on demand.

The implementation uses [pptx-react-viewer](https://github.com/ChristopherVR/pptx-viewer/) with `SlideCanvas` and `useViewerBuildingBlocks`, editing and autosave disabled, and only custom slide navigation. The viewer is loaded on demand in the browser. `components/powerpoint/slide-preview.tsx` accepts presentation bytes and a filename so the future OpenJiuwen/ElevenLabs tool can reuse it. Tool calling is not wired yet.

The library's current package also imports its optional `ai` and `@ai-sdk/react` peers from its entry point. They are installed for Next.js module resolution; no AI chat or editing UI is mounted.

## Agent configuration

Configure voice, languages and LLM in ElevenLabs. Enable Language overrides in Security to use the language selector. Enable audio, user_transcript, agent_response, interruption and agent_response_correction events. The custom LLM dashboard URL field appends /chat/completions; use the base URL for your MaaS region and keep its key in an ElevenLabs secret.

## Code

- app/page.tsx: main page.
- app/api/elevenlabs-token/route.ts: server-only token issuance.
- components/elevenlabs/: conversation UI and avatar adapter.
- lib/digital-human/: renderer and mouth/gesture controls.
- public/digital-human/ and vendor/: required FaceUnity assets and SDK.

Mouth motion combines audio analysis with approximate character timing, not true phoneme tracking. Hand gestures use prerecorded animations. Playback volume is 55%. openJiuwen is not integrated yet.

Voice sessions work in development and production when the server credentials are configured. Never expose keys through NEXT*PUBLIC* variables.

## Production deployment

### Kubernetes (teknofest)

Runs as `digital-human` at https://teknofest.sadc-llm.com, deployed by Argo CD from
[SADCAIVibe/argocd-deployments](https://github.com/SADCAIVibe/argocd-deployments),
`clusters/teknofest/apps/digital-human/`. Don't `helm install` by hand.

- **Release = deploy.** Publishing a GitHub release (cut from `elevenlabs_only`)
  builds `ghcr.io/sadcaivibe/livekit_open_jiuwen:<tag>` and sets that tag in
  argocd-deployments; Argo CD rolls it out within ~3 minutes. Pre-releases only build.
- **Env vars:** `APP_ORIGIN` and friends in `env.yaml` there; `ELEVENLABS_API_KEY` /
  `ELEVENLABS_AGENT_ID` with `./scripts/seal-env.sh teknofest digital-human KEY=VALUE`.

### Docker

The repository includes a production `Dockerfile` and `docker-compose.yml`. Set the required values in the shell (or a root `.env` file that is excluded from the image), then run:

```sh
docker compose up --build -d
```

The app is available at `http://localhost:3000`. Compose passes `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, and `APP_ORIGIN` into the server. The image uses Next.js standalone output and includes the generated local XLSX WASM asset. Stop it with `docker compose down`.

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

`patches/docx-preview@0.4.0.patch` fixes section pagination in the browser ESM and CommonJS bundles. Page-size/orientation changes and next-page section boundaries start a new page before the incoming section; continuous sections can remain together. This does not add automatic Word-style overflow pagination or blank-page insertion for odd/even section parity. Regression tests exercise both installed bundles. Review the patch when upgrading `docx-preview`.

`patches/pptx-react-viewer@3.16.2.patch` fixes the production `CHART_PX_PER_PT is not defined` error. Next.js optimization dropped the chart font conversion constant while retaining references to it. Both package bundles now keep the identical `4 / 3` conversion inside the helper. pnpm 9.15.9 applies the patch during installation, including the Docker dependencies stage. Deploy `package.json`, `pnpm-lock.yaml`, and the patch together, then rebuild the image (`docker compose up --build -d app` for Compose deployments). Restarting an old image cannot update its compiled JavaScript. Review this workaround when upgrading the viewer.

Excel workbooks use `@extend-ai/react-xlsx` in the same document panel, with a sheet selector in the existing header and the original download on the file card. The viewer receives downloaded bytes, uses local worker/WASM parsing, and is explicitly read-only (including paste, editing, and row/column resizing). The default library toolbar and gesture zoom are disabled. Supported workbook formatting, charts, and images use the library's renderer; Excel fidelity depends on its supported features. The current parse limit is 25 MB.

`node scripts/copy-xlsx-wasm.mjs` copies the installed package's WASM binary to `public/wasm/duke_sheets_wasm_bg.wasm`. This runs on install, development startup, and production build. Deploy that generated public asset alongside the Next.js output; no CDN, Office service, or PDF conversion is used. The worker receives an absolute URL on the frontend's own origin. The generated binary is ignored by Git to avoid retaining stale package assets.

Use `http://localhost:3000/xlsx-preview-test.xlsx` for a two-sheet test workbook with a merged, colored heading, number formats, and a formula. Closing and reopening preserves the selected sheet. XLSX detection uses archive contents, including for signed URLs without filename extensions.
