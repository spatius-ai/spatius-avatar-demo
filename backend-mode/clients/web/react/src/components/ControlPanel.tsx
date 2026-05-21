import { useState, useRef, useCallback, useEffect } from 'react'
import type { AvatarController } from '@spatius/avatarkit'
import type { AvatarInstance } from '../hooks/useAvatarSDK'
import { MicrophonePcmCapture } from '../utils/audioCapture'

interface AvatarSlot {
  uid: string
  index: number
  name: string
}

interface Props {
  activeAvatar: AvatarInstance | null
  activeController: AvatarController | null
  multiMode?: boolean
  avatarSlots?: AvatarSlot[]
  activeUid?: string | null
  onSlotSelect?: (uid: string) => void
}

const BACKEND_MODE_URL = import.meta.env.VITE_BACKEND_MODE_WS_URL || 'ws://localhost:8765/ws/agent'
const SAMPLE_RATE = 16000

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export default function ControlPanel({ activeAvatar, activeController, multiMode, avatarSlots, activeUid, onSlotSelect }: Props) {
  const [backendConnected, setHostConnected] = useState(false)
  const [backendConnecting, setHostConnecting] = useState(false)
  const [backendMicActive, setHostMicActive] = useState(false)
  const [backendTextInput, setHostTextInput] = useState('')
  const hostWsRef = useRef<WebSocket | null>(null)
  const backendTurnMapRef = useRef(new Map<string, string>())
  const microphoneRef = useRef<MicrophonePcmCapture | null>(null)

  const hasAvatar = activeAvatar?.view !== null && !activeAvatar?.loading

  // Keep refs in sync so callbacks always see latest values
  const activeControllerRef = useRef(activeController)
  activeControllerRef.current = activeController
  const activeAvatarRef = useRef(activeAvatar)
  activeAvatarRef.current = activeAvatar

  // ========== Backend Mode ==========

  const handleHostMessage = useCallback((msg: any) => {
    const controller = activeControllerRef.current
    const type = msg.type
    if (type === 'ready') {
      setHostConnected(true)
      setHostConnecting(false)
      const avatarId = activeAvatarRef.current?.characterId || ''
      hostWsRef.current?.send(JSON.stringify({ type: 'set_avatar', avatarId }))
    } else if (type === 'avatar_audio') {
      const audioB64 = msg.audio || ''
      const turnId = msg.turnId
      const isLast = msg.isLast ?? false
      const audioBytes = audioB64 ? base64Decode(audioB64) : new Uint8Array(0)
      const localCid = (controller as any).yieldAudioData(audioBytes, isLast)
      if (localCid && !backendTurnMapRef.current.has(turnId)) {
        backendTurnMapRef.current.set(turnId, localCid)
      }
    } else if (type === 'avatar_frames') {
      const frames = (msg.frames || []).map((b64: string) => base64Decode(b64))
      const localCid = backendTurnMapRef.current.get(msg.turnId)
      if (localCid && frames.length) {
        ;(controller as any).yieldFramesData(frames, localCid)
      }
      if (msg.isLast) {
        backendTurnMapRef.current.delete(msg.turnId)
      }
    } else if (type === 'interrupt') {
      controller?.interrupt()
      backendTurnMapRef.current.clear()
    } else if (type === 'error') {
      console.error('Host server error:', msg.message)
    }
  }, [])

  const backendConnect = useCallback(async () => {
    if (hostWsRef.current || backendConnecting) return
    setHostConnecting(true)
    try {
      await (activeControllerRef.current as any).initializeAudioContext()
    } catch (e) {
      console.error('Audio context init failed:', e)
      setHostConnecting(false)
      return
    }

    const ws = new WebSocket(BACKEND_MODE_URL)
    hostWsRef.current = ws

    ws.onmessage = (event) => {
      let msg: any
      try { msg = JSON.parse(event.data) } catch { return }
      handleHostMessage(msg)
    }
    ws.onerror = () => {
      console.error('Host server connection failed')
      setHostConnecting(false)
      setHostConnected(false)
    }
    ws.onclose = () => {
      hostWsRef.current = null
      setHostConnected(false)
      setHostConnecting(false)
      setHostMicActive(false)
    }
  }, [backendConnecting, handleHostMessage])

  const backendDisconnect = useCallback(() => {
    if (microphoneRef.current) {
      microphoneRef.current.stop()
      microphoneRef.current = null
      setHostMicActive(false)
    }
    if (hostWsRef.current) {
      hostWsRef.current.close()
      hostWsRef.current = null
    }
    setHostConnected(false)
    backendTurnMapRef.current.clear()
  }, [])

  const toggleMic = useCallback(async () => {
    if (backendMicActive) {
      // Stop mic
      if (microphoneRef.current) {
        await microphoneRef.current.stop()
        microphoneRef.current = null
      }
      setHostMicActive(false)
      if (hostWsRef.current?.readyState === WebSocket.OPEN) {
        hostWsRef.current.send(JSON.stringify({ type: 'mic_end' }))
      }
    } else {
      // Start mic — auto-connect if needed
      if (!backendConnected) {
        await backendConnect()
        // Wait for ready
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (hostWsRef.current && hostWsRef.current.readyState === WebSocket.OPEN) {
              clearInterval(check)
              resolve()
            }
          }, 100)
          setTimeout(() => { clearInterval(check); resolve() }, 3000)
        })
      }
      // Check connection via ref since state may not have updated yet
      if (!hostWsRef.current || hostWsRef.current.readyState !== WebSocket.OPEN) return
      const mic = new MicrophonePcmCapture(SAMPLE_RATE)
      microphoneRef.current = mic
      await mic.start((chunk: Uint8Array) => {
        if (hostWsRef.current?.readyState === WebSocket.OPEN) {
          hostWsRef.current.send(JSON.stringify({ type: 'mic_audio', audio: bytesToBase64(chunk) }))
        }
      })
      setHostMicActive(true)
    }
  }, [backendMicActive, backendConnected, backendConnect])

  const sendTextQuery = useCallback(async () => {
    const text = backendTextInput.trim()
    if (!text) return
    if (!backendConnected) {
      await backendConnect()
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (hostWsRef.current && hostWsRef.current.readyState === WebSocket.OPEN) {
            clearInterval(check)
            resolve()
          }
        }, 100)
        setTimeout(() => { clearInterval(check); resolve() }, 3000)
      })
    }
    if (hostWsRef.current?.readyState === WebSocket.OPEN) {
      hostWsRef.current.send(JSON.stringify({ type: 'text_query', text }))
      setHostTextInput('')
    }
  }, [backendTextInput, backendConnected, backendConnect])

  const [paused, setPaused] = useState(false)

  const handlePauseResume = () => {
    if (paused) {
      activeController?.resume()
      setPaused(false)
    } else {
      activeController?.pause()
      setPaused(true)
    }
  }

  const handleInterrupt = () => {
    activeController?.interrupt()
    if (microphoneRef.current) {
      microphoneRef.current.stop()
      microphoneRef.current = null
      setHostMicActive(false)
    }
    if (hostWsRef.current?.readyState === WebSocket.OPEN) {
      hostWsRef.current.send(JSON.stringify({ type: 'interrupt' }))
    }
    backendTurnMapRef.current.clear()
  }

  // When active avatar changes, send set_avatar to backend
  useEffect(() => {
    if (backendConnected && activeAvatar?.characterId && hostWsRef.current?.readyState === WebSocket.OPEN) {
      hostWsRef.current.send(JSON.stringify({ type: 'set_avatar', avatarId: activeAvatar.characterId }))
    }
  }, [activeAvatar?.characterId, backendConnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (microphoneRef.current) {
        microphoneRef.current.stop()
        microphoneRef.current = null
      }
      if (hostWsRef.current) {
        hostWsRef.current.close()
        hostWsRef.current = null
      }
    }
  }, [])

  return (
    <div className="control-panel">
      <h3>Controls</h3>

      {activeAvatar && (
        <div className="status-bar">
          <div className="status-row">
            <span className="status-label">Server</span>
            <span className="status-value">
              {backendConnected ? 'connected' : backendConnecting ? 'connecting...' : 'disconnected'}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">Conversation</span>
            <span className="status-value">{activeAvatar.conversationState}</span>
          </div>
          {activeAvatar.error && (
            <div className="status-row error">
              <span className="status-label">Error</span>
              <span className="status-value error-text">{activeAvatar.error}</span>
            </div>
          )}
        </div>
      )}

      {multiMode && avatarSlots && avatarSlots.length > 0 && (
        <div className="slot-selector">
          <h4>Active Avatar</h4>
          <div className="slot-list">
            {avatarSlots.map(s => (
              <button
                key={s.uid}
                className={`slot-btn ${s.uid === activeUid ? 'active' : ''}`}
                onClick={() => onSlotSelect?.(s.uid)}
              >
                <span className="slot-index">{s.index}</span>
                <span className="slot-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasAvatar && (
        <p className="panel-hint">Load a character first</p>
      )}

      {hasAvatar && (
        <>
          <div className="btn-row" style={{ marginBottom: 8 }}>
            {!backendConnected ? (
              <button
                className="primary"
                disabled={backendConnecting}
                onClick={backendConnect}
              >
                {backendConnecting ? 'Connecting...' : 'Connect'}
              </button>
            ) : (
              <button
                className="secondary"
                onClick={backendDisconnect}
              >
                Disconnect
              </button>
            )}
          </div>

          <button
            className={`full-width ${backendMicActive ? 'danger' : 'primary'}`}
            disabled={!hasAvatar}
            onClick={toggleMic}
          >
            {backendMicActive ? 'Stop Mic' : 'Start Mic'}
          </button>

          <form
            className="host-text-form"
            style={{ marginTop: 8 }}
            onSubmit={(e) => { e.preventDefault(); sendTextQuery() }}
          >
            <input
              type="text"
              placeholder="Type a message..."
              className="host-text-input"
              disabled={!hasAvatar}
              value={backendTextInput}
              onChange={(e) => setHostTextInput(e.target.value)}
            />
            <button
              type="submit"
              className="primary"
              disabled={!backendTextInput.trim() || !hasAvatar}
            >
              Send
            </button>
          </form>

          <p className="host-hint">
            Connects to <code>{BACKEND_MODE_URL}</code>.
            Using Backend Mode server — see <a href="https://github.com/spatius-ai/spatius-avatar-demo" target="_blank" rel="noreferrer">github.com/spatius-ai/spatius-avatar-demo</a>.
          </p>
        </>
      )}

      {hasAvatar && (
        <div className="btn-row">
          <button className="secondary" onClick={handlePauseResume}>{paused ? 'Resume' : 'Pause'}</button>
          <button className="danger" onClick={handleInterrupt}>Interrupt</button>
        </div>
      )}
    </div>
  )
}
