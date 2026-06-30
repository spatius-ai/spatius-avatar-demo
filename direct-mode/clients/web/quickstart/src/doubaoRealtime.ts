import { DOUBAO_INPUT_SAMPLE_RATE } from './audio'
import type { RealtimeClient, RealtimeHandlers } from './realtimeClient'

type DoubaoControlEvent = {
  type: string
  message?: string
  delta?: string
  dialogId?: string
}

export interface DoubaoRealtimeOptions {
  instructions: string
  model: string
  speaker: string
}

export class DoubaoRealtimeClient implements RealtimeClient {
  private readonly options: DoubaoRealtimeOptions
  private readonly handlers: RealtimeHandlers
  private ws: WebSocket | null = null
  private ready = false

  readonly inputSampleRate = DOUBAO_INPUT_SAMPLE_RATE

  constructor(options: DoubaoRealtimeOptions, handlers: RealtimeHandlers) {
    this.options = options
    this.handlers = handlers
  }

  get connected(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN
  }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({
        instructions: this.options.instructions,
        model: this.options.model,
        speaker: this.options.speaker,
      })
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/doubao-realtime?${params}`)
      let resolved = false

      ws.binaryType = 'arraybuffer'
      this.ws = ws

      ws.onopen = () => {
        this.handlers.onStatus?.('Doubao proxy connected')
      }

      ws.onerror = () => {
        const message = 'Doubao realtime WebSocket connection failed'
        this.handlers.onError?.(message)
        if (!resolved) reject(new Error(message))
      }

      ws.onclose = () => {
        this.ready = false
        this.handlers.onDisconnected?.()
      }

      ws.onmessage = (message) => {
        if (typeof message.data === 'string') {
          const event = this.parseControlEvent(message.data)
          if (!event) return

          if (event.type === 'connected') {
            this.ready = true
            this.handlers.onStatus?.('Doubao realtime session ready')
            this.handlers.onConnected?.()
            if (!resolved) {
              resolved = true
              resolve()
            }
          } else if (event.type === 'status' && event.message) {
            this.handlers.onStatus?.(event.message)
          } else if (event.type === 'assistant_delta' && event.delta) {
            this.handlers.onAssistantTextDelta?.(event.delta)
          } else if (event.type === 'assistant_done') {
            this.handlers.onAssistantTextDone?.()
          } else if (event.type === 'audio_done') {
            this.handlers.onAudioDone?.()
          } else if (event.type === 'disconnected') {
            this.ready = false
            this.handlers.onDisconnected?.()
          } else if (event.type === 'error') {
            const errorMessage = event.message || 'Doubao realtime error'
            this.handlers.onError?.(errorMessage)
            if (!resolved) reject(new Error(errorMessage))
          }
          return
        }

        this.handlers.onAudioChunk?.(message.data)
      }
    })
  }

  appendInputAudio(pcm16: ArrayBuffer): void {
    if (!this.connected || !pcm16.byteLength) return
    this.ws?.send(pcm16)
  }

  commitAndCreateResponse(): void {
    if (!this.connected) return
    this.ws?.send(JSON.stringify({ type: 'commit' }))
    this.handlers.onInputCommitted?.()
  }

  cancelResponse(): void {
    if (!this.connected) return
    this.ws?.send(JSON.stringify({ type: 'cancel' }))
  }

  close(): void {
    this.ready = false
    this.ws?.close()
    this.ws = null
  }

  private parseControlEvent(data: string): DoubaoControlEvent | null {
    try {
      return JSON.parse(data) as DoubaoControlEvent
    } catch {
      return null
    }
  }
}
