export interface RealtimeHandlers {
  onConnected?: () => void
  onDisconnected?: () => void
  onStatus?: (status: string) => void
  onError?: (message: string) => void
  onAudioChunk?: (pcm16: ArrayBuffer) => void
  onAudioDone?: () => void
  onAssistantTextDelta?: (delta: string) => void
  onAssistantTextDone?: () => void
  onInputCommitted?: () => void
}

export interface RealtimeClient {
  readonly connected: boolean
  readonly inputSampleRate: number
  connect(): Promise<void>
  appendInputAudio(pcm16: ArrayBuffer): void
  commitAndCreateResponse(): void
  cancelResponse(): void
  close(): void
}
