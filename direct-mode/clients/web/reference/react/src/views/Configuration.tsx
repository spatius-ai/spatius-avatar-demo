import { useState } from 'react'
import {
  AvatarSDK,
  DrivingServiceMode,
    LogLevel,
} from '@spatius/avatarkit'
import type { AppConfig } from '../App'

const DASH_URL = 'https://app.spatius.ai'

interface Props {
  mode: DrivingServiceMode
  onInitialized: (config: AppConfig) => void
}

const STORAGE_KEY = 'avatarkit-playground-config'

function loadCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { appId?: string; token?: string; env?: string }
  } catch { /* ignore */ }
  return {}
}

function saveCache(appId: string, token: string, env: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appId, token, env }))
  } catch { /* ignore */ }
}

function normalizeRegion(env?: string) {
  return env === 'us-west' ? 'us-west' : 'us-west'
}

export default function Configuration({ mode, onInitialized }: Props) {
  const cached = loadCached()
  const [appId, setAppId] = useState(cached.appId ?? '')
  const [token, setToken] = useState(cached.token ?? '')
  const [env, setEnv] = useState<string>(normalizeRegion(cached.env))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canInit = appId.trim() && token.trim()

  const handleInit = async () => {
    if (!canInit) return
    setLoading(true)
    setError(null)
    try {
      await AvatarSDK.initialize(appId.trim(), {
        region: env,
        drivingServiceMode: mode,
        audioFormat: { channelCount: 1, sampleRate: 16000 },
        logLevel: LogLevel.all,
      })
      AvatarSDK.setSessionToken(token.trim())
      saveCache(appId.trim(), token.trim(), env)
      onInitialized({ appId: appId.trim(), sessionToken: token.trim(), region: env })
    } catch (e: any) {
      setError(e.message || 'Initialization failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="config-view">
      <div className="config-layout">
        <div className="config-container">
          <h1>AvatarKit Direct Mode Demo</h1>
          <p className="config-subtitle">
            Send pre-recorded audio to the avatar and see lip-sync in action.
          </p>

          <div className="config-form">
            <div className="field">
              <label>App ID <span className="required">*</span></label>
              <input
                value={appId}
                onChange={e => setAppId(e.target.value)}
                placeholder="app_xxx"
              />
              <span className="field-hint">
                Get your App ID from the{' '}
                <a href={DASH_URL} target="_blank" rel="noreferrer">
                  Developer Platform
                </a>
              </span>
            </div>

            <div className="field">
              <label>Session Token <span className="required">*</span></label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Your session token"
              />
              <span className="field-hint">
                Required for server communication in Direct Mode
              </span>
            </div>

            <div className="field">
              <label>Region</label>
              <select value={env} onChange={e => setEnv(e.target.value as string)}>
                <option value={'us-west'}>us-west</option>
              </select>
            </div>

            {error && <div className="config-error">{error}</div>}

            <button
              className="primary init-btn"
              disabled={!canInit || loading}
              onClick={handleInit}
            >
              {loading ? 'Initializing...' : 'Initialize SDK'}
            </button>
          </div>
        </div>

        <a className="config-guide" href={DASH_URL} target="_blank" rel="noreferrer">
          <img src="/api-key-guide.png" alt="Where to find your App ID and Token" />
        </a>
      </div>
    </div>
  )
}
