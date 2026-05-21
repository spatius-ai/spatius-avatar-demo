<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import {
  type AvatarController,
  AvatarManager,
  AvatarSDK,
  AvatarView,
  ConnectionState,
  DrivingServiceMode,
} from '@spatius/avatarkit'

const CONNECTION_TIMEOUT_MS = 15_000
const QUICKSTART_AUDIO_URL = '/quickstart_voice.pcm'

const container = ref<HTMLDivElement | null>(null)
const status = ref('Click Connect Avatar to start')
const connecting = ref(false)
const sending = ref(false)

let avatarView: AvatarView | null = null
const connected = ref(false)

const appId = import.meta.env.VITE_SPATIUS_APP_ID
const avatarId = import.meta.env.VITE_SPATIUS_AVATAR_ID
const sessionToken = import.meta.env.VITE_SPATIUS_SESSION_TOKEN

if (!sessionToken) throw new Error('Missing VITE_SPATIUS_SESSION_TOKEN')

async function downloadPcmAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to load demo audio URL')
  return response.arrayBuffer()
}

async function disposeAvatar(): Promise<void> {
  connected.value = false
  avatarView?.controller.close()
  avatarView?.dispose()
  avatarView = null
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
      connected.value = state === ConnectionState.connected

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
  if (connecting.value || connected.value) return
  connecting.value = true

  try {
    status.value = 'Using session token from .env...'

    if (!AvatarSDK.configuration) {
      await AvatarSDK.initialize(appId, {
        region: 'us-west',
        drivingServiceMode: DrivingServiceMode.sdk,
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

    const controller = avatarView?.controller
    if (!controller) throw new Error('Avatar controller is not ready')

    status.value = 'Connecting to Spatius...'
    await controller.initializeAudioContext()
    const animationChannelReady = waitForAnimationChannel(controller)
    await Promise.all([controller.start(), animationChannelReady])

    status.value = 'Avatar connected. Click Send Audio.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to connect avatar'
  } finally {
    connecting.value = false
  }
}

async function sendAudio(): Promise<void> {
  if (sending.value) return
  if (!connected.value || !avatarView) {
    status.value = 'Please click Connect Avatar first.'
    return
  }

  sending.value = true

  try {
    status.value = 'Downloading demo PCM audio...'
    const audioData = await downloadPcmAudio(QUICKSTART_AUDIO_URL)

    status.value = 'Sending audio...'
    avatarView.controller.send(audioData, true)
    status.value = `Audio sent (${audioData.byteLength} bytes)`
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to send audio'
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(async () => {
  await disposeAvatar()
})
</script>

<template>
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px;">
    <div style="width:min(720px, 100%); display:flex; flex-direction:column; gap:10px;">
      <div
        ref="container"
        style="width:100%; aspect-ratio:16/10; min-height:320px; border-radius:12px; overflow:hidden; border:1px solid;"
      />

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button :disabled="connecting || connected" @click="connectAvatar">
          {{ connecting ? 'Connecting...' : connected ? 'Avatar Connected' : 'Connect Avatar' }}
        </button>
        <button :disabled="sending || !connected" @click="sendAudio">
          {{ sending ? 'Sending...' : 'Send Audio' }}
        </button>
      </div>

      <div style="font-size:14px;">{{ status }}</div>
    </div>
  </div>
</template>
