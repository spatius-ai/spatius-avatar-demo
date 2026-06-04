import { arrayBufferToBase64, base64ToArrayBuffer, GEMINI_INPUT_SAMPLE_RATE } from './audio'
import type { RealtimeClient, RealtimeHandlers } from './realtimeClient'

type GeminiPayload = Record<string, any>

export interface GeminiLiveOptions {
  apiKey: string
  model: string
  instructions: string
  apiVersion?: 'v1alpha' | 'v1beta'
}

export class GeminiLiveClient implements RealtimeClient {
  private readonly options: Required<GeminiLiveOptions>
  private readonly handlers: RealtimeHandlers
  private ws: WebSocket | null = null

  readonly inputSampleRate = GEMINI_INPUT_SAMPLE_RATE

  constructor(options: GeminiLiveOptions, handlers: RealtimeHandlers) {
    this.options = {
      apiVersion: 'v1alpha',
      ...options,
    }
    this.handlers = handlers
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${this.options.apiVersion}.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.options.apiKey)}`
      const ws = new WebSocket(url)
      let resolved = false

      this.ws = ws

      ws.onopen = () => {
        this.handlers.onStatus?.('Gemini Live WebSocket connected')
        this.send({
          setup: {
            model: `models/${this.options.model}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
            },
            systemInstruction: {
              parts: [{ text: this.options.instructions }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        })
      }

      ws.onerror = () => {
        const message = 'Gemini Live WebSocket connection failed'
        this.handlers.onError?.(message)
        if (!resolved) reject(new Error(message))
      }

      ws.onclose = (event) => {
        this.handlers.onDisconnected?.()
        if (!resolved) {
          const detail = event.reason ? `: ${event.reason}` : ''
          const message = `Gemini Live WebSocket closed before setup completed (code: ${event.code}${detail})`
          this.handlers.onError?.(message)
          reject(new Error(message))
        }
      }

      ws.onmessage = (message) => {
        const setupComplete = this.handleMessage(message.data)
        if (setupComplete && !resolved) {
          resolved = true
          this.handlers.onConnected?.()
          resolve()
        }
      }
    })
  }

  appendInputAudio(pcm16: ArrayBuffer): void {
    if (!pcm16.byteLength) return

    this.send({
      realtimeInput: {
        audio: {
          data: arrayBufferToBase64(pcm16),
          mimeType: `audio/pcm;rate=${GEMINI_INPUT_SAMPLE_RATE}`,
        },
      },
    })
  }

  commitAndCreateResponse(): void {
    this.send({
      realtimeInput: {
        audioStreamEnd: true,
      },
    })
    this.handlers.onInputCommitted?.()
  }

  cancelResponse(): void {
    if (!this.connected) return
    this.send({
      realtimeInput: {
        activityStart: {},
      },
    })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(payload: GeminiPayload): void {
    if (!this.connected) return
    this.ws?.send(JSON.stringify(payload))
  }

  private handleMessage(data: unknown): boolean {
    if (typeof data !== 'string') return false

    let event: GeminiPayload
    try {
      event = JSON.parse(data)
    } catch {
      return false
    }

    if (event.setupComplete) {
      this.handlers.onStatus?.('Gemini Live session ready')
      return true
    }

    const serverContent = event.serverContent
    if (serverContent) {
      if (serverContent.interrupted) {
        this.handlers.onStatus?.('Gemini response interrupted')
        this.handlers.onAudioDone?.()
      }

      const parts = serverContent.modelTurn?.parts ?? []
      for (const part of parts) {
        if (typeof part.inlineData?.data === 'string') {
          this.handlers.onAudioChunk?.(base64ToArrayBuffer(part.inlineData.data))
        }
      }

      const outputText = serverContent.outputTranscription?.text
      if (typeof outputText === 'string' && outputText.length > 0) {
        this.handlers.onAssistantTextDelta?.(outputText)
      }

      if (serverContent.generationComplete || serverContent.turnComplete) {
        this.handlers.onAudioDone?.()
        this.handlers.onStatus?.('Gemini response complete')
      }
    }

    if (event.goAway?.timeLeft) {
      this.handlers.onStatus?.('Gemini Live session will close soon')
    }

    if (event.toolCall) {
      this.handlers.onStatus?.('Gemini requested a tool call; this quickstart does not handle tools')
    }

    if (event.error) {
      const message = event.error.message ?? 'Gemini Live API error'
      this.handlers.onError?.(String(message))
    }

    return false
  }
}
