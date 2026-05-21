# Direct Mode Token Server (Python)

## Purpose

Issues Spatius session tokens for Direct Mode clients.

## Run

```bash
cp .env.example .env
uv sync
uv run app.py
```

Default: `http://localhost:8090`

## API

- `GET /health`
- `POST /session-token`
  - body: `{ "appId": "..." }` (optional, falls back to env)

## Validation Guardrails

`POST /session-token` returns `500` if:

- `.env` is missing
- `SPATIUS_API_KEY` or `SPATIUS_APP_ID` is missing
- either value is still a placeholder (for example `your_spatius_api_key`)

## References

- App ID / API Key: https://app.spatius.ai/apps
- Test avatars: https://app.spatius.ai/avatars/library
- Session token guide: https://docs.spatius.ai/api-reference/auth
