import { arrayBufferToBase64, base64ToArrayBuffer, OPENAI_INPUT_SAMPLE_RATE } from './audio'
import type { RealtimeClient, RealtimeHandlers } from './realtimeClient'

type RealtimePayload = Record<string, any>

export interface OpenAIRealtimeOptions {
  token: string
  model: string
  voice: string
  instructions: string
}

export class OpenAIRealtimeClient implements RealtimeClient {
  private readonly options: OpenAIRealtimeOptions
  private readonly handlers: RealtimeHandlers
  private ws: WebSocket | null = null

  readonly inputSampleRate = OPENAI_INPUT_SAMPLE_RATE

  constructor(options: OpenAIRealtimeOptions, handlers: RealtimeHandlers) {
    this.options = options
    this.handlers = handlers
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve()

    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.options.model)}`
      const ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${this.options.token}`,
      ])

      this.ws = ws

      ws.onopen = () => {
        this.handlers.onStatus?.('Realtime model connected')
        this.send({
          type: 'session.update',
          session: {
            type: 'realtime',
            model: this.options.model,
            instructions: this.options.instructions,
            output_modalities: ['audio'],
            audio: {
              input: {
                format: {
                  type: 'audio/pcm',
                  rate: OPENAI_INPUT_SAMPLE_RATE,
                },
                turn_detection: null,
              },
              output: {
                format: {
                  type: 'audio/pcm',
                },
                voice: this.options.voice,
              },
            },
          },
        })
        this.handlers.onConnected?.()
        resolve()
      }

      ws.onerror = () => {
        const message = 'Realtime WebSocket connection failed'
        this.handlers.onError?.(message)
        reject(new Error(message))
      }

      ws.onclose = () => {
        this.handlers.onDisconnected?.()
      }

      ws.onmessage = (message) => {
        this.handleMessage(message.data)
      }
    })
  }

  appendInputAudio(pcm16: ArrayBuffer): void {
    if (!pcm16.byteLength) return

    this.send({
      type: 'input_audio_buffer.append',
      audio: arrayBufferToBase64(pcm16),
    })
  }

  commitAndCreateResponse(): void {
    this.send({ type: 'input_audio_buffer.commit' })
    this.send({
      type: 'response.create',
      response: {
        output_modalities: ['audio'],
      },
    })
  }

  cancelResponse(): void {
    if (!this.connected) return
    this.send({ type: 'response.cancel' })
    this.send({ type: 'input_audio_buffer.clear' })
  }

  close(): void {
    this.ws?.close()
    this.ws = null
  }

  private send(payload: RealtimePayload): void {
    if (!this.connected) return
    this.ws?.send(JSON.stringify(payload))
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return

    let event: RealtimePayload
    try {
      event = JSON.parse(data)
    } catch {
      return
    }

    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        this.handlers.onStatus?.('Realtime session ready')
        break
      case 'input_audio_buffer.committed':
        this.handlers.onInputCommitted?.()
        break
      case 'response.created':
        this.handlers.onStatus?.('Realtime model is responding')
        break
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (typeof event.delta === 'string') {
          this.handlers.onAudioChunk?.(base64ToArrayBuffer(event.delta))
        }
        break
      case 'response.output_audio.done':
      case 'response.audio.done':
        this.handlers.onAudioDone?.()
        break
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
      case 'response.output_text.delta':
      case 'response.text.delta':
        if (typeof event.delta === 'string') {
          this.handlers.onAssistantTextDelta?.(event.delta)
        }
        break
      case 'response.output_audio_transcript.done':
      case 'response.output_text.done':
      case 'response.text.done':
        this.handlers.onAssistantTextDone?.()
        break
      case 'response.done':
        this.handlers.onAudioDone?.()
        this.handlers.onStatus?.('Response complete')
        break
      case 'error': {
        const message = event.error?.message ?? event.message ?? 'Realtime API error'
        this.handlers.onError?.(String(message))
        break
      }
      default:
        break
    }
  }
}
