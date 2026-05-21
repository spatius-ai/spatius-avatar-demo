# Direct Mode iOS Client

SwiftUI sample implementing the same avatar conversation pipeline as Web:

`VAD -> ASR (OpenAI) -> LLM (streaming) -> TTS (OpenAI) -> AvatarKit SDK`

## Requirements

- Xcode 16+
- iOS 16+
- Apple Silicon Mac (recommended for simulator rendering)

## Session Token (Manual)

Aligned with Android:

- Do not fetch token from local backend in this sample.
- Paste Session Token manually in UI.
- Token is validated when tapping `Start Conversation`.

- Token guide: `https://docs.spatius.ai/api-reference/api-reference#obtain-a-session-token`

## Quick Start

```bash
git clone https://github.com/spatius-ai/spatius-avatar-demo.git
cd spatius-avatar-demo/direct-mode/clients/ios
brew install xcodegen
xcodegen generate
open AvatarDemo.xcodeproj
```

## SDK Version

- iOS AvatarKit: prebuilt `AvatarKit.xcframework`, downloaded by the build script from the configured official release

## Configuration

Edit `AvatarDemo/Config.swift`:

- Spatius App ID: https://app.spatius.ai/apps
- Spatius Avatar ID (test avatars): https://app.spatius.ai/avatars/library
- Temporary Session Token: https://docs.spatius.ai/api-reference/api-reference#obtain-a-session-token
- OpenAI API Key: https://platform.openai.com/api-keys

- `appID`
- `avatarID`
- `openAIApiKey`
- `openAISttLanguage`
- `avatarSampleRate`

`Session Token` is not stored in `Config.swift`; paste it in UI at runtime.

## Notes

- iOS `AvatarKit.xcframework` is downloaded automatically on first build from the configured release. Override `SPATIUS_AVATARKIT_IOS_URL` and `SPATIUS_AVATARKIT_IOS_CHECKSUM` only when testing a different release.
- Simulator supports mic input from Mac.
- If `sessionTokenInvalid` appears, check token type, token age, app/region match.
