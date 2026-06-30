export const AVATAR_INPUT_SAMPLE_RATE = 16_000
export const REALTIME_OUTPUT_SAMPLE_RATE = 24_000
export const OPENAI_INPUT_SAMPLE_RATE = 24_000
export const GEMINI_INPUT_SAMPLE_RATE = 16_000
export const DOUBAO_INPUT_SAMPLE_RATE = 16_000

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000)
    binary += Array.from(chunk, (byte) => String.fromCharCode(byte)).join('')
  }

  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

function floatToPcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)

  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return buffer
}

function pcm16ToFloat(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  const samples = new Float32Array(Math.floor(buffer.byteLength / 2))

  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000
  }

  return samples
}

function resampleMono(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input

  const outputLength = Math.max(1, Math.round((input.length * outputRate) / inputRate))
  const output = new Float32Array(outputLength)
  const ratio = (input.length - 1) / Math.max(1, outputLength - 1)

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio
    const index = Math.floor(position)
    const nextIndex = Math.min(index + 1, input.length - 1)
    const fraction = position - index
    output[i] = input[index] * (1 - fraction) + input[nextIndex] * fraction
  }

  return output
}

export function resamplePcm16Mono(buffer: ArrayBuffer, inputRate: number, outputRate: number): ArrayBuffer {
  if (inputRate === outputRate) return buffer

  const samples = pcm16ToFloat(buffer)
  const resampled = resampleMono(samples, inputRate, outputRate)
  return floatToPcm16(resampled)
}

export class MicrophonePcmRecorder {
  private readonly targetSampleRate: number
  private audioContext: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null

  constructor(targetSampleRate = OPENAI_INPUT_SAMPLE_RATE) {
    this.targetSampleRate = targetSampleRate
  }

  async start(onChunk: (pcm16: ArrayBuffer) => void): Promise<void> {
    if (this.audioContext) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    })

    this.audioContext = new AudioContext()
    this.source = this.audioContext.createMediaStreamSource(this.stream)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      const output = event.outputBuffer.getChannelData(0)
      output.fill(0)

      const resampled = resampleMono(input, this.audioContext?.sampleRate ?? this.targetSampleRate, this.targetSampleRate)
      onChunk(floatToPcm16(resampled))
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }

  stop(): void {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioContext?.close()

    this.processor = null
    this.source = null
    this.stream = null
    this.audioContext = null
  }
}
