# Direct Mode Android Client

Kotlin + Compose sample implementing the same pipeline as Web / iOS:

`VAD -> ASR -> LLM (stream) -> TTS -> Avatar`

## Requirements

- Android Studio (latest stable)
- JDK 17
- Android API 24+
- arm64-v8a device (real device recommended)

## Session Token (Manual)

Aligned with iOS:

- The app does not request a local token server.
- Paste session token manually in UI.
- Token is validated when `Start Conversation` is tapped.

- Token guide: `https://docs.spatius.ai/api-reference/api-reference#obtain-a-session-token`

## SDK Version

- Android AvatarKit: `ai.spatius:avatarkit:1.+`

## Stage Background

Uses local static asset:

- `app/src/main/res/drawable/avatar_bg.webp`

## Configuration

```bash
cp local.properties.example local.properties
```

Fill at least:

- Spatius App ID: https://app.spatius.ai/apps
- Spatius Avatar ID (test avatars): https://app.spatius.ai/avatars/library
- Temporary Session Token: https://docs.spatius.ai/api-reference/api-reference#obtain-a-session-token
- OpenAI API Key: https://platform.openai.com/api-keys

- `SPATIUS_APP_ID`
- `SPATIUS_AVATAR_ID`
- `OPENAI_API_KEY`
- `OPENAI_USE_PROXY=false`

`Session Token` is not configured in files; it is pasted at runtime in UI.

## Build

```bash
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" ./gradlew :app:assembleDebug
```

Install with Android Studio or adb.

## Run Flow

1. Initialize Avatar.
2. Paste Session Token in UI.
3. Tap `Start Conversation`.
4. Speak and pause to trigger one full round.

## Notes

- This sample calls OpenAI directly from client for demo use.
- If you see `sessionTokenInvalid`, verify token type, expiration, app ID, and region.
