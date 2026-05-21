import { useState, useEffect } from 'react'
import { AvatarSDK, DrivingServiceMode, LogLevel } from '@spatius/avatarkit'
import Playground from './views/Playground'
import './App.css'

function deriveHttpBase(wsUrl: string): string {
  return wsUrl
    .replace(/^ws:\/\//, 'http://')
    .replace(/^wss:\/\//, 'https://')
    .replace(/\/ws\/agent$/, '')
}

const BACKEND_MODE_WS_URL = import.meta.env.VITE_BACKEND_MODE_WS_URL || 'ws://localhost:8765/ws/agent'
const HTTP_BASE = deriveHttpBase(BACKEND_MODE_WS_URL)

interface ConfigCheckResult {
  serverReachable: boolean
  missingKeys?: string[]
  appId?: string
  region?: string
}

async function checkServerConfig(): Promise<ConfigCheckResult> {
  try {
    const configRes = await fetch(`${HTTP_BASE}/api/config`)
    if (!configRes.ok) {
      // Try healthz for diagnostics
      try {
        const healthRes = await fetch(`${HTTP_BASE}/healthz`)
        const health = await healthRes.json()
        if (!health.ok && health.missing) {
          return { serverReachable: true, missingKeys: health.missing }
        }
      } catch { /* ignore */ }
      return { serverReachable: true, missingKeys: ['Unknown config error (api/config returned ' + configRes.status + ')'] }
    }
    const config = await configRes.json()
    if (!config.appId) {
      return { serverReachable: true, missingKeys: ['appId (not returned by server)'] }
    }
    return {
      serverReachable: true,
      appId: config.appId,
      region: config.region,
    }
  } catch {
    return { serverReachable: false }
  }
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configIssues, setConfigIssues] = useState<ConfigCheckResult | null>(null)

  useEffect(() => {
    let cancelled = false

    checkServerConfig().then(async (result) => {
      if (cancelled) return

      if (!result.serverReachable) {
        setConfigIssues(result)
        return
      }
      if (result.missingKeys) {
        setConfigIssues(result)
        return
      }

      const env = result.region === 'us-west' ? 'us-west' : 'us-west'

      try {
        await AvatarSDK.initialize(result.appId!, {
          region: env,
          drivingServiceMode: DrivingServiceMode.host,
          audioFormat: { channelCount: 1, sampleRate: 16000 },
          logLevel: LogLevel.all,
        })
        if (!cancelled) setReady(true)
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'SDK initialization failed')
      }
    })

    return () => { cancelled = true }
  }, [])

  if (configIssues) {
    return (
      <div className="app">
        <div className="config-error" style={{ padding: 32, textAlign: 'center' }}>
          <a href="https://app.spatius.ai" target="_blank" rel="noreferrer">
            <img src="/api-key-guide.png" alt="API Key Guide" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 16 }} />
          </a>
          <h2>Server Configuration Check</h2>
          {!configIssues.serverReachable ? (
            <>
              <p>Cannot reach the host server at <code>{HTTP_BASE}</code></p>
              <p style={{ fontSize: 14, color: '#888' }}>
                Make sure the Backend Mode server is running and <code>VITE_BACKEND_MODE_WS_URL</code> is set correctly.
              </p>
            </>
          ) : (
            <>
              <p>The host server is reachable but has missing configuration:</p>
              <ul style={{ textAlign: 'left', display: 'inline-block' }}>
                {configIssues.missingKeys?.map((key) => (
                  <li key={key}><code>{key}</code></li>
                ))}
              </ul>
              <p style={{ fontSize: 14, color: '#888' }}>
                Please check the server's environment variables and restart it.
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="config-error" style={{ padding: 32, textAlign: 'center' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="app">
        <div style={{ padding: 32, textAlign: 'center' }}>Initializing SDK...</div>
      </div>
    )
  }

  return (
    <div className="app">
      <Playground />
    </div>
  )
}
