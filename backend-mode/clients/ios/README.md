# Backend Mode — iOS Client

iOS client for [Backend Mode](../../README.md). All AI processing (ASR → LLM → TTS) runs on the **backend**; the client records audio or sends text, then renders the avatar response.

## Prerequisites

- Xcode 16+
- Physical device or simulator (iOS 16+)
- Backend Mode backend running (see `../../servers/python/`)

## Setup

1. Edit `AvatarDemo/Config.swift` with your backend URL, or run `../../start.sh` to auto-configure it:

   ```swift
   static let backendModeURL = "http://localhost:8765"   // simulator
   // static let backendModeURL = "http://192.168.x.x:8765"  // physical device
   ```

2. Open `AvatarDemo.xcodeproj` and run.

   AvatarKit.xcframework will be downloaded automatically on first build from the configured release. Override `SPATIUS_AVATARKIT_IOS_URL` and `SPATIUS_AVATARKIT_IOS_CHECKSUM` only when testing a different release.

## How it works

```
User (mic/text) → iOS App → WebSocket /ws/agent → Backend
                                                            ↓
                                                ASR → LLM → TTS + Backend Mode bridge
                                                            ↓
            iOS App ← JSON { audio PCM + frames } ← Backend
                 ↓
        controller.yieldAudioData() + yieldFramesData()
                 ↓
            Avatar renders
```
