# Backend Mode Backend (Python)

## Purpose

Provides the complete Backend Mode backend pipeline:

- ASR
- LLM
- TTS
- Backend Mode bridge frame generation (optional)

## Run

```bash
cp .env.example .env
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8765
```

## API

- `GET /healthz`
- `GET /api/config`
- `WS /ws/agent`

## Note

To validate only ASR/LLM/TTS without avatar frame generation:

- set `BACKEND_MODE_ENABLE_AVATAR_BRIDGE=false`

## References

- App ID / API Key: https://app.spatius.ai/apps
- Test avatars: https://app.spatius.ai/avatars/library
- Regions / endpoints: https://docs.spatius.ai/api-reference/regions
