<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  type AvatarController,
  AvatarManager,
  AvatarSDK,
  AvatarView,
  ConnectionState,
  DrivingServiceMode,
} from '@spatius/avatarkit'
import {
  AVATAR_INPUT_SAMPLE_RATE,
  REALTIME_OUTPUT_SAMPLE_RATE,
  MicrophonePcmRecorder,
  resamplePcm16Mono,
} from './audio'
import { GeminiLiveClient } from './geminiLive'
import { OpenAIRealtimeClient } from './openaiRealtime'
import type { RealtimeClient, RealtimeHandlers } from './realtimeClient'

type AudioSource = 'sample' | 'realtime'

const CONNECTION_TIMEOUT_MS = 15_000
const QUICKSTART_AUDIO_URL = '/quickstart_voice.pcm'

const container = ref<HTMLDivElement | null>(null)
const audioSource = ref<AudioSource>('sample')
const status = ref('Connect the avatar, then send the bundled sample audio.')

// Floating notices: SDK failures should not be something a reader has to find
// in the developer console.
interface ToastMessage { id: number; kind: 'error' | 'warning'; text: string }
const toasts = ref<ToastMessage[]>([])
let nextToastId = 0

function pushToast(text: string, kind: 'error' | 'warning' = 'error') {
  if (!text) return
  // The SDK can report the same failure repeatedly; one notice is enough.
  if (toasts.value.some(t => t.text === text)) return
  const id = nextToastId++
  toasts.value = [...toasts.value, { id, kind, text }]
  setTimeout(() => dismissToast(id), 5000)
}

function dismissToast(id: number) {
  toasts.value = toasts.value.filter(t => t.id !== id)
}
const avatarStatus = ref('Not connected')
const realtimeStatus = ref('Not connected')
const connectingAvatar = ref(false)
const connectingRealtime = ref(false)
const sendingSample = ref(false)
const recording = ref(false)
const responding = ref(false)
const assistantText = ref('')

let avatarView: AvatarView | null = null
let realtimeClient: RealtimeClient | null = null
let recorder: MicrophonePcmRecorder | null = null
let pendingAvatarAudio: ArrayBuffer | null = null

const appId = import.meta.env.VITE_SPATIUS_APP_ID ?? ''
const avatarId = import.meta.env.VITE_SPATIUS_AVATAR_ID ?? ''
const sessionToken = import.meta.env.VITE_SPATIUS_SESSION_TOKEN ?? ''
const realtimeProvider = (import.meta.env.VITE_REALTIME_PROVIDER || 'openai').toLowerCase()
const openAIRealtimeToken = import.meta.env.VITE_OPENAI_REALTIME_TOKEN ?? ''
const openAIRealtimeModel = import.meta.env.VITE_OPENAI_REALTIME_MODEL || 'gpt-realtime'
const realtimeVoice = import.meta.env.VITE_OPENAI_REALTIME_VOICE || 'marin'
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY ?? ''
const geminiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash-native-audio-preview-12-2025'
const geminiApiVersion = (import.meta.env.VITE_GEMINI_API_VERSION || 'v1alpha') as 'v1alpha' | 'v1beta'
const realtimeInstructions =
  import.meta.env.VITE_REALTIME_INSTRUCTIONS ||
  import.meta.env.VITE_OPENAI_REALTIME_INSTRUCTIONS ||
  import.meta.env.VITE_GEMINI_INSTRUCTIONS ||
  'You are a concise, friendly avatar assistant. Keep replies short enough for a realtime demo.'

function isMissingEnv(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.startsWith('your_')
}

const isRealtimeMode = computed(() => audioSource.value === 'realtime')

const sourceLabel = computed(() => {
  return isRealtimeMode.value ? 'Realtime conversation' : 'Sample audio'
})

const realtimeModelLabel = computed(() => {
  if (realtimeProvider === 'gemini') return `gemini · ${geminiModel}`
  if (realtimeProvider === 'openai') return `openai · ${openAIRealtimeModel}`
  return realtimeProvider
})

const missingSpatiusConfig = computed(() => {
  const missing: string[] = []
  if (isMissingEnv(appId)) missing.push('VITE_SPATIUS_APP_ID')
  if (isMissingEnv(avatarId)) missing.push('VITE_SPATIUS_AVATAR_ID')
  if (isMissingEnv(sessionToken)) missing.push('VITE_SPATIUS_SESSION_TOKEN')
  return missing
})

const missingRealtimeConfig = computed(() => {
  const missing: string[] = []
  if (realtimeProvider === 'gemini') {
    if (isMissingEnv(geminiApiKey)) missing.push('VITE_GEMINI_API_KEY')
  } else if (realtimeProvider === 'openai') {
    if (isMissingEnv(openAIRealtimeToken)) missing.push('VITE_OPENAI_REALTIME_TOKEN')
  } else {
    missing.push('VITE_REALTIME_PROVIDER must be openai or gemini')
  }
  return missing
})

const activeMissingConfig = computed(() => {
  return isRealtimeMode.value
    ? [...missingSpatiusConfig.value, ...missingRealtimeConfig.value]
    : missingSpatiusConfig.value
})

const readyToRecord = computed(() => {
  return avatarStatus.value === 'Connected' && realtimeStatus.value === 'Connected' && !recording.value
})

function selectAudioSource(source: AudioSource): void {
  audioSource.value = source
  if (source === 'sample') {
    status.value = 'Sample audio selected. Connect the avatar and send the bundled PCM file.'
  } else {
    status.value = 'Realtime conversation selected. Connect all services, then hold to talk.'
  }
}

function formatAvatarError(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Failed to connect avatar'
}

function waitForAnimationChannel(controller: AvatarController): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let lastError: string | null = null

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      if (error) reject(error)
      else resolve()
    }

    const timeoutId = window.setTimeout(() => {
      finish(new Error(lastError ?? 'Timed out waiting for animation channel'))
    }, CONNECTION_TIMEOUT_MS)

    controller.onConnectionState = (state) => {
      avatarStatus.value = state === ConnectionState.connected ? 'Connected' : String(state)

      if (state === ConnectionState.connected) {
        finish()
      } else if (state === ConnectionState.failed) {
        window.setTimeout(() => {
          finish(new Error(lastError ?? 'Failed to connect to animation channel'))
        }, 100)
      }
    }

    controller.onError = (error) => {
      lastError = formatAvatarError(error)
      finish(new Error(lastError))
    }
  })
}

async function connectAvatar(): Promise<void> {
  if (missingSpatiusConfig.value.length) {
    status.value = 'Fill the missing Spatius .env values first.'
    return
  }
  if (connectingAvatar.value || avatarStatus.value === 'Connected') return

  connectingAvatar.value = true

  try {
    status.value = 'Initializing AvatarKit...'

    if (!AvatarSDK.configuration) {
      await AvatarSDK.initialize(appId, {
        region: 'us-west',
        drivingServiceMode: DrivingServiceMode.direct,
        audioFormat: {
          channelCount: 1,
          sampleRate: AVATAR_INPUT_SAMPLE_RATE,
        },
      })
    }
    AvatarSDK.setSessionToken(sessionToken)

    await nextTick()
    const mountEl = container.value
    if (!mountEl) throw new Error('Avatar container is not ready')

    if (!avatarView) {
      status.value = 'Loading avatar...'
      const avatar = await AvatarManager.shared.load(avatarId)
      avatarView = new AvatarView(avatar, mountEl)
    }

    const controller = avatarView.controller
    status.value = 'Connecting to Motion Server...'
    await controller.initializeAudioContext()
    const animationChannelReady = waitForAnimationChannel(controller)
    await Promise.all([controller.start(), animationChannelReady])

    status.value = 'Avatar connected.'
  } catch (error) {
    avatarStatus.value = 'Failed'
    status.value = error instanceof Error ? error.message : 'Failed to connect avatar'
    pushToast(status.value)
  } finally {
    connectingAvatar.value = false
  }
}

async function connectRealtime(): Promise<void> {
  if (missingRealtimeConfig.value.length) {
    status.value = 'Fill the missing realtime provider .env values first.'
    return
  }
  if (connectingRealtime.value || realtimeClient?.connected) return

  connectingRealtime.value = true

  try {
    realtimeStatus.value = 'Connecting'
    const handlers: RealtimeHandlers = {
      onConnected: () => {
        realtimeStatus.value = 'Connected'
      },
      onDisconnected: () => {
        realtimeStatus.value = 'Disconnected'
      },
      onStatus: (message) => {
        status.value = message
      },
      onError: (message) => {
        status.value = message
        pushToast(message)
        realtimeStatus.value = 'Error'
        responding.value = false
        finishAvatarAudioTurn()
      },
      onAudioChunk: (chunk) => {
        responding.value = true
        sendAvatarAudioChunk(chunk)
      },
      onAudioDone: () => {
        finishAvatarAudioTurn()
        responding.value = false
      },
      onAssistantTextDelta: (delta) => {
        assistantText.value += delta
      },
      onInputCommitted: () => {
        status.value = 'Audio committed. Waiting for response...'
      },
    }

    if (realtimeProvider === 'gemini') {
      realtimeClient = new GeminiLiveClient(
        {
          apiKey: geminiApiKey,
          model: geminiModel,
          instructions: realtimeInstructions,
          apiVersion: geminiApiVersion,
        },
        handlers
      )
    } else {
      realtimeClient = new OpenAIRealtimeClient(
        {
          token: openAIRealtimeToken,
          model: openAIRealtimeModel,
          voice: realtimeVoice,
          instructions: realtimeInstructions,
        },
        handlers
      )
    }

    await realtimeClient.connect()
  } catch (error) {
    realtimeStatus.value = 'Failed'
    status.value = error instanceof Error ? error.message : 'Failed to connect realtime model'
  } finally {
    connectingRealtime.value = false
  }
}

async function connectRealtimeFlow(): Promise<void> {
  await connectAvatar()
  if (avatarStatus.value === 'Connected') {
    await connectRealtime()
  }
}

async function downloadSampleAudio(): Promise<ArrayBuffer> {
  const response = await fetch(QUICKSTART_AUDIO_URL)
  if (!response.ok) {
    throw new Error(`Failed to download sample audio (${response.status})`)
  }
  return response.arrayBuffer()
}

async function sendSampleAudio(): Promise<void> {
  if (avatarStatus.value !== 'Connected') {
    await connectAvatar()
  }
  if (!avatarView || avatarStatus.value !== 'Connected' || sendingSample.value) return

  sendingSample.value = true
  try {
    status.value = 'Sending bundled PCM audio...'
    pendingAvatarAudio = null
    const audioData = await downloadSampleAudio()
    avatarView.controller.send(audioData, true)
    status.value = 'Sample audio sent. The avatar should speak with lip sync.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to send sample audio'
  } finally {
    sendingSample.value = false
  }
}

function sendAvatarAudioChunk(chunk: ArrayBuffer): void {
  if (!avatarView) return

  const avatarAudio = resamplePcm16Mono(chunk, REALTIME_OUTPUT_SAMPLE_RATE, AVATAR_INPUT_SAMPLE_RATE)

  if (pendingAvatarAudio) {
    avatarView.controller.send(pendingAvatarAudio, false)
  }

  pendingAvatarAudio = avatarAudio
}

function finishAvatarAudioTurn(): void {
  if (pendingAvatarAudio && avatarView) {
    avatarView.controller.send(pendingAvatarAudio, true)
  }
  pendingAvatarAudio = null
}

async function startRecording(): Promise<void> {
  if (!avatarView || !realtimeClient?.connected) {
    status.value = 'Click Connect all before holding to talk.'
    return
  }
  if (!avatarView || !realtimeClient?.connected || recording.value) return

  try {
    if (responding.value) {
      realtimeClient.cancelResponse()
      avatarView.controller.interrupt()
      pendingAvatarAudio = null
      responding.value = false
    }

    assistantText.value = ''
    recorder = new MicrophonePcmRecorder(realtimeClient.inputSampleRate)
    await recorder.start((pcm16) => {
      realtimeClient?.appendInputAudio(pcm16)
    })

    recording.value = true
    status.value = 'Recording microphone audio. Release the button to ask.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to start microphone recording'
    recorder?.stop()
    recorder = null
  }
}

function stopRecording(): void {
  if (!recording.value) return

  recorder?.stop()
  recorder = null
  recording.value = false
  responding.value = true
  realtimeClient?.commitAndCreateResponse()
  status.value = 'Generating avatar response...'
}

async function dispose(): Promise<void> {
  recorder?.stop()
  recorder = null
  realtimeClient?.close()
  realtimeClient = null
  avatarView?.controller.close()
  avatarView?.dispose()
  avatarView = null
}

onBeforeUnmount(() => {
  void dispose()
})
</script>

<template>
  <main class="page">
    <section class="shell">
      <div class="avatar-panel">
        <div ref="container" class="avatar-stage" />
      </div>

      <aside class="side">
        <section class="control-panel">
          <h1 class="title">Web Direct Mode quickstart</h1>
          <p class="subtitle">
            Start with bundled sample audio, then switch to a realtime provider when you want microphone conversation.
          </p>

          <div class="segmented-control" role="tablist" aria-label="Audio source">
            <button :class="{ selected: audioSource === 'sample' }" @click="selectAudioSource('sample')">
              Sample audio
            </button>
            <button :class="{ selected: audioSource === 'realtime' }" @click="selectAudioSource('realtime')">
              Realtime conversation
            </button>
          </div>

          <div v-if="audioSource === 'sample'" class="button-row">
            <button class="primary" :disabled="connectingAvatar" @click="connectAvatar">
              {{ avatarStatus === 'Connected' ? 'Avatar connected' : 'Connect avatar' }}
            </button>
            <button :disabled="activeMissingConfig.length > 0 || connectingAvatar || sendingSample" @click="sendSampleAudio">
              {{ sendingSample ? 'Sending...' : 'Send sample audio' }}
            </button>
          </div>

          <div v-else class="button-row">
            <button class="primary" :disabled="connectingAvatar || connectingRealtime" @click="connectRealtimeFlow">
              {{ avatarStatus === 'Connected' && realtimeStatus === 'Connected' ? 'Connected' : 'Connect all' }}
            </button>
            <button
              :class="{ recording }"
              :disabled="
                activeMissingConfig.length > 0 ||
                connectingAvatar ||
                connectingRealtime ||
                responding ||
                (!recording && !readyToRecord)
              "
              @pointerdown="startRecording"
              @pointerup="stopRecording"
              @pointerleave="stopRecording"
              @pointercancel="stopRecording"
            >
              {{ recording ? 'Release to send' : readyToRecord ? 'Hold to talk' : 'Connect all first' }}
            </button>
          </div>

          <div v-if="activeMissingConfig.length" class="warning">
            Missing env values: {{ activeMissingConfig.join(', ') }}. Copy `.env.example` to `.env` and fill them before running.
          </div>
          <div v-else-if="audioSource === 'sample'" class="notice">
            Sample audio mode only needs Spatius credentials. Realtime provider keys are optional.
          </div>
          <div v-else class="warning">
            Local development only: use an ephemeral or browser-safe realtime token. Do not ship a long-lived provider API key in browser code.
          </div>
        </section>

        <section class="status-panel">
          <p class="title">Status</p>
          <div class="status-grid">
            <div class="status-item">
              <span>AvatarKit</span>
              <strong>{{ avatarStatus }}</strong>
            </div>
            <div class="status-item">
              <span>Audio source</span>
              <strong>{{ sourceLabel }}</strong>
            </div>
            <div v-if="isRealtimeMode" class="status-item">
              <span>Realtime model</span>
              <strong>{{ realtimeModelLabel }} · {{ realtimeStatus }}</strong>
            </div>
            <div class="status-item">
              <span>Avatar audio</span>
              <strong>PCM16 mono · {{ AVATAR_INPUT_SAMPLE_RATE / 1000 }} kHz</strong>
            </div>
          </div>
          <p class="muted">{{ status }}</p>
        </section>

        <section v-if="isRealtimeMode" class="transcript-panel">
          <p class="title">Assistant transcript</p>
          <div class="transcript">{{ assistantText || 'Transcript deltas will appear here when the realtime model returns them.' }}</div>
        </section>
      </aside>
    </section>
  </main>
  <div v-if="toasts.length" class="toast-stack">
    <div
      v-for="t in toasts"
      :key="t.id"
      :class="['toast', `toast-${t.kind}`]"
      role="alert"
    >
      <span class="toast-text">{{ t.text }}</span>
      <button class="toast-close" aria-label="Dismiss" @click="dismissToast(t.id)">×</button>
    </div>
  </div>
</template>
