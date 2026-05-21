<h1 align="center">Spatius AvatarKit Demos</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@spatius/avatarkit"><img src="https://img.shields.io/npm/v/%40spatius%2Favatarkit?label=%40spatius%2Favatarkit&color=0ea5e9" alt="npm" /></a>
  <a href="https://central.sonatype.com/artifact/ai.spatius/avatarkit"><img src="https://img.shields.io/maven-central/v/ai.spatius/avatarkit?label=Maven%20Central&color=0ea5e9" alt="Maven Central" /></a>
  <a href="https://github.com/spatius-ai/avatarkit-ios-release/releases"><img src="https://img.shields.io/github/v/release/spatius-ai/avatarkit-ios-release?label=iOS&color=0ea5e9" alt="iOS" /></a>
  <br/>
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://docs.spatius.ai/"><img src="https://img.shields.io/badge/docs-spatius.ai-blue" alt="Docs" /></a>
</p>

<p align="center">
  A collection of demo projects showing how to integrate <a href="https://docs.spatius.ai/">AvatarKit</a> into avatar applications.<br/>
  Multiple integration paths · Multi-platform clients · Production-ready pipelines
</p>

## Features

- **End-to-end examples** — Each demo is self-contained with frontend, backend, and `.env` config
- **Multiple architectures** — Direct Mode, LiveKit Agents, and Backend Mode integration paths
- **Multi-provider backends** — Swap between OpenAI, Google Gemini, Deepgram, Cartesia, Azure, AWS, and more
- **Cross-platform** — Web (React, Vue, Vanilla JS, Next.js), iOS, Android, and Flutter

## AvatarKit SDKs

<table>
  <tr>
    <th>Platform</th>
    <th>Package</th>
    <th>Links</th>
  </tr>
  <tr>
    <td><b>Web</b></td>
    <td><code>@spatius/avatarkit</code></td>
    <td><a href="https://www.npmjs.com/package/@spatius/avatarkit">npm</a> · <a href="https://docs.spatius.ai/">docs</a></td>
  </tr>
  <tr>
    <td><b>Android</b></td>
    <td><code>ai.spatius:avatarkit</code></td>
    <td><a href="https://central.sonatype.com/artifact/ai.spatius/avatarkit">Maven Central</a> · <a href="https://docs.spatius.ai/">docs</a></td>
  </tr>
  <tr>
    <td><b>iOS</b></td>
    <td><code>AvatarKit.xcframework</code></td>
    <td><a href="https://github.com/spatius-ai/avatarkit-ios-release/releases">GitHub Releases</a> · <a href="https://docs.spatius.ai/">docs</a></td>
  </tr>
  <tr>
    <td><b>Flutter</b></td>
    <td><code>spatius</code></td>
    <td><a href="https://pub.dev/packages/spatius">pub.dev</a> · <a href="https://docs.spatius.ai/">docs</a></td>
  </tr>
</table>

## Demos

> **New here?** Start with [`speech-to-avatar-quickstart`](./direct-mode/clients/web/speech-to-avatar-quickstart) to validate the Web SDK, or [`livekit-agent-quickstart`](./platform-integrations/livekit-agents-demo/livekit-agent-quickstart) for the fastest Web voice-agent path.

| Platform | Direct Mode | Backend Mode | LiveKit Agents Integration |
| --- | --- | --- | --- |
| **Web** | [`speech-to-avatar-quickstart`](./direct-mode/clients/web/speech-to-avatar-quickstart) for the minimal smoke test; [`reference`](./direct-mode/clients/web/reference) for multi-framework clients | [`backend-mode/clients/web`](./backend-mode/clients/web) | [`livekit-agent-quickstart`](./platform-integrations/livekit-agents-demo/livekit-agent-quickstart), [`livekit-agents`](./platform-integrations/livekit-agents-demo/livekit-agents-reference-demo) |
| **iOS** | [`direct-mode/clients/ios`](./direct-mode/clients/ios) | [`backend-mode/clients/ios`](./backend-mode/clients/ios) | Not provided today; current Spatius AvatarKit RTC demo path is Web-only |
| **Android** | [`direct-mode/clients/android`](./direct-mode/clients/android) | [`backend-mode/clients/android`](./backend-mode/clients/android) | Not provided today; current Spatius AvatarKit RTC demo path is Web-only |
| **Flutter** | [`direct-mode/clients/flutter`](./direct-mode/clients/flutter) | [`backend-mode/clients/flutter`](./backend-mode/clients/flutter) | Not provided today; current Spatius AvatarKit RTC demo path is Web-only |

Transport options such as LiveKit, future Agora support, and your own WebSocket transport live inside the relevant integration docs. [`platform-integrations/livekit-room-demo`](./platform-integrations/livekit-room-demo) is the minimal LiveKit example for `@spatius/avatarkit-rtc` (the RTC Adapter) with `LiveKitProvider`: it validates token issuance, room connection, adapter init, avatar load, and mic publishing. Remote audio playback and motion rendering only happen when a producer publishes into the room — this demo has no agent or Backend Mode publisher. Not the full Backend Mode + RTC transport voice-agent demo.

## Quick Start

The fastest Web SDK smoke test is the Direct Mode quickstart:

```bash
git clone https://github.com/spatius-ai/spatius-avatar-demo.git
cd spatius-avatar-demo/direct-mode/clients/web/speech-to-avatar-quickstart

# Set up environment variables
cp .env.example .env
# Fill VITE_SPATIUS_APP_ID, VITE_SPATIUS_AVATAR_ID, and VITE_SPATIUS_SESSION_TOKEN
```

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Prerequisites

| Tool | Version | Link |
|------|---------|------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| pnpm | latest | [pnpm.io](https://pnpm.io/) |
| Python | 3.10+ | [python.org](https://www.python.org/) |
| uv | latest | [docs.astral.sh/uv](https://docs.astral.sh/uv/) |

You will also need:

- A **Spatius** account — [Create one in Studio](https://app.spatius.ai/)
- A **LiveKit Cloud** account (or self-hosted) — [cloud.livekit.io](https://cloud.livekit.io/)
- API keys for your chosen LLM / TTS / STT providers when you run agent or backend pipeline demos

## Links

- [Studio](https://app.spatius.ai/) — Manage apps, avatars, and API keys
- [Playground](https://playground.spatius.ai/) — Try avatars in the browser
- [Documentation](https://docs.spatius.ai/) — Guides and API reference

## License

MIT
