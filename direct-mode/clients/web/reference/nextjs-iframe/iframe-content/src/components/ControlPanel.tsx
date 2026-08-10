import { useState, useRef, useCallback, useEffect } from 'react'
import type { AvatarController } from '@spatius/avatarkit'
import type { AvatarInstance } from '../hooks/useAvatarSDK'
import { PCM_ASSETS, AUDIO_SOURCE_HINT } from '../data/audioAssets'
import { loadPcmFile, sendPcmChunks } from '../utils/audio'

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
  onNotify?: (text: string, kind?: 'error' | 'warning') => void
}

export default function ControlPanel({ activeAvatar, activeController, multiMode, avatarSlots, activeUid, onSlotSelect, onNotify }: Props) {
  // Track which clip is playing, not just that one is: swapping every button's
  // label at once resizes them and reflows the panel, which stutters the canvas.
  const [sendingPath, setSendingPath] = useState<string | null>(null)
  const sending = sendingPath !== null
  const sdkCancelRef = useRef<(() => void) | null>(null)

  const connected = activeAvatar?.connectionState === 'connected'
  const hasAvatar = activeAvatar?.view !== null && !activeAvatar?.loading

  const handleStart = useCallback(async () => {
    if (!activeController) return
    try {
      await (activeController as any).initializeAudioContext()
      await activeController.start()
    } catch (e: any) {
      console.error('Start failed:', e)
      onNotify?.(`Failed to connect: ${e?.message ?? e}`)
    }
  }, [activeController, onNotify])

  const handleSendPcm = useCallback(async (path: string) => {
    // Direct Mode has no session until start() runs, so audio sent now would be
    // dropped silently. Say so instead of leaving a dead button.
    if (!connected) {
      onNotify?.('Please click Start to connect before sending audio.', 'warning')
      return
    }
    if (!activeController || sending) return
    setSendingPath(path)
    try {
      // The audio context is already warmed up by handleStart; doing it here
      // again stalls the first frames of playback.
      const data = await loadPcmFile(path)
      sdkCancelRef.current = sendPcmChunks(
        data,
        (chunk, end) => activeController.send(chunk.buffer as ArrayBuffer, end),
        () => setSendingPath(null),
      )
    } catch (e: any) {
      console.error('Send failed:', e)
      onNotify?.(`Failed to send audio: ${e?.message ?? e}`)
      setSendingPath(null)
    }
  }, [activeController, sending, connected, onNotify])

  const handlePause = () => activeController?.pause()
  const handleResume = () => activeController?.resume()
  const handleInterrupt = () => {
    activeController?.interrupt()
    if (sdkCancelRef.current) { sdkCancelRef.current(); sdkCancelRef.current = null }
    setSendingPath(null)
  }

  // Cancel ongoing audio send when disconnected
  useEffect(() => {
    if (!connected && sdkCancelRef.current) {
      sdkCancelRef.current()
      sdkCancelRef.current = null
      setSendingPath(null)
    }
  }, [connected])

  return (
    <div className="control-panel">
      <h3>Controls</h3>
      {activeAvatar && (
        <div className="status-bar">
          <div className="status-row">
            <span className="status-label">Connection</span>
            <span className={`status-value ${activeAvatar.connectionState}`}>{activeAvatar.connectionState}</span>
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
              <button key={s.uid} className={`slot-btn ${s.uid === activeUid ? 'active' : ''}`} onClick={() => onSlotSelect?.(s.uid)}>
                <span className="slot-index">{s.index}</span>
                <span className="slot-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!hasAvatar && <p className="panel-hint">Load a character first</p>}
      {hasAvatar && (
        <>
          <button className="primary full-width" disabled={connected || !hasAvatar} onClick={handleStart}>
            {connected ? 'Connected' : 'Start'}
          </button>
          <div className="audio-list">
            <h4>
              Audio Files
              <span className="audio-hint" title={AUDIO_SOURCE_HINT}>?</span>
            </h4>
            {PCM_ASSETS.map(a => (
              <button key={a.path} className="secondary full-width audio-btn" disabled={sending} onClick={() => handleSendPcm(a.path)}>
                {sendingPath === a.path ? '...' : `\u25B6 ${a.name}`}
              </button>
            ))}
          </div>
        </>
      )}
      {hasAvatar && (
        <div className="btn-row">
          <button className="secondary" onClick={handlePause}>Pause</button>
          <button className="secondary" onClick={handleResume}>Resume</button>
          <button className="danger" onClick={handleInterrupt}>Interrupt</button>
        </div>
      )}
    </div>
  )
}
