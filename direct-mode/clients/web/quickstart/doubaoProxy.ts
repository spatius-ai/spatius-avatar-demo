import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { gunzipSync } from 'node:zlib'
import type { Plugin, ViteDevServer } from 'vite'
import { WebSocket, WebSocketServer } from 'ws'

const DOUBAO_PROXY_PATH = '/doubao-realtime'
const DOUBAO_WS_URL = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
const DOUBAO_RESOURCE_ID = 'volc.speech.dialog'
const DOUBAO_APP_KEY = 'PlgvMymc7f3tQnJ6'

const EVENT_START_CONNECTION = 1
const EVENT_START_SESSION = 100
const EVENT_TASK_REQUEST = 200

const EVENT_CONNECTION_STARTED = 50
const EVENT_CONNECTION_FAILED = 51
const EVENT_SESSION_STARTED = 150
const EVENT_SESSION_FAILED = 153
const EVENT_TTS_ENDED = 359
const EVENT_ASR_STARTED = 450
const EVENT_ASR_RESPONSE = 451
const EVENT_ASR_ENDED = 459
const EVENT_CHAT_RESPONSE = 550
const EVENT_CHAT_ENDED = 559
const EVENT_DIALOG_COMMON_ERROR = 599

const MSG_TYPE_FULL_CLIENT = 1
const MSG_TYPE_AUDIO_ONLY_CLIENT = 2
const MSG_TYPE_FULL_SERVER = 9
const MSG_TYPE_AUDIO_ONLY_SERVER = 11
const MSG_TYPE_ERROR = 15

const FLAG_WITH_EVENT = 0b0100
const FLAG_POSITIVE_SEQ = 0b0001
const FLAG_NEGATIVE_SEQ = 0b0011

const SERIALIZATION_RAW = 0
const SERIALIZATION_JSON = 1
const COMPRESSION_NONE = 0
const COMPRESSION_GZIP = 1

type QuickstartEnv = Record<string, string | undefined>

interface DecodedFrame {
  type: number
  flag: number
  event?: number
  sessionId?: string
  connectId?: string
  errorCode?: number
  payload: Buffer
}

function control(type: string, data: Record<string, unknown> = {}): string {
  return JSON.stringify({ type, ...data })
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}

function writeInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeInt32BE(value)
  return buffer
}

function writeSizedBuffer(buffer: Buffer): Buffer {
  return Buffer.concat([writeUInt32(buffer.byteLength), buffer])
}

function header(messageType: number, flag: number, serialization: number, compression: number): Buffer {
  return Buffer.from([
    0x11,
    (messageType << 4) | flag,
    (serialization << 4) | compression,
    0x00,
  ])
}

function shouldWriteSessionId(event: number): boolean {
  return ![1, 2, 50, 51, 52].includes(event)
}

function buildFullClientEvent(event: number, sessionId: string, payload: unknown): Buffer {
  const payloadBuffer = Buffer.from(JSON.stringify(payload))
  const parts = [
    header(MSG_TYPE_FULL_CLIENT, FLAG_WITH_EVENT, SERIALIZATION_JSON, COMPRESSION_NONE),
    writeInt32(event),
  ]

  if (shouldWriteSessionId(event)) {
    parts.push(writeSizedBuffer(Buffer.from(sessionId)))
  }

  parts.push(writeSizedBuffer(payloadBuffer))
  return Buffer.concat(parts)
}

function buildAudioEvent(sessionId: string, pcm16: Buffer): Buffer {
  return Buffer.concat([
    header(MSG_TYPE_AUDIO_ONLY_CLIENT, FLAG_WITH_EVENT, SERIALIZATION_RAW, COMPRESSION_NONE),
    writeInt32(EVENT_TASK_REQUEST),
    writeSizedBuffer(Buffer.from(sessionId)),
    writeSizedBuffer(pcm16),
  ])
}

function containsSequence(flag: number): boolean {
  return flag === FLAG_POSITIVE_SEQ || flag === FLAG_NEGATIVE_SEQ
}

function containsEvent(flag: number): boolean {
  return (flag & FLAG_WITH_EVENT) === FLAG_WITH_EVENT
}

function readSizedBuffer(buffer: Buffer, offsetRef: { offset: number }): Buffer {
  const size = buffer.readUInt32BE(offsetRef.offset)
  offsetRef.offset += 4
  const value = buffer.subarray(offsetRef.offset, offsetRef.offset + size)
  offsetRef.offset += size
  return value
}

function maybeDecompress(payload: Buffer, compression: number): Buffer {
  if (compression === COMPRESSION_GZIP) return gunzipSync(payload)
  return payload
}

function decodeFrame(data: Buffer): DecodedFrame {
  if (data.byteLength < 4) throw new Error('Doubao frame is shorter than the protocol header')

  const headerSize = (data[0] & 0x0f) * 4
  const type = data[1] >> 4
  const flag = data[1] & 0x0f
  const compression = data[2] & 0x0f
  const state = { offset: headerSize }
  const decoded: DecodedFrame = {
    type,
    flag,
    payload: Buffer.alloc(0),
  }

  if (type === MSG_TYPE_ERROR) {
    decoded.errorCode = data.readUInt32BE(state.offset)
    state.offset += 4
  }

  if ((type === MSG_TYPE_AUDIO_ONLY_CLIENT || type === MSG_TYPE_AUDIO_ONLY_SERVER) && containsSequence(flag)) {
    state.offset += 4
  }

  if (containsEvent(flag)) {
    decoded.event = data.readInt32BE(state.offset)
    state.offset += 4

    if (shouldWriteSessionId(decoded.event)) {
      decoded.sessionId = readSizedBuffer(data, state).toString('utf8')
    }

    if ([50, 51, 52].includes(decoded.event)) {
      decoded.connectId = readSizedBuffer(data, state).toString('utf8')
    }
  }

  decoded.payload = maybeDecompress(readSizedBuffer(data, state), compression)
  return decoded
}

function safeJson(payload: Buffer): Record<string, any> {
  if (!payload.byteLength) return {}
  try {
    return JSON.parse(payload.toString('utf8'))
  } catch {
    return {}
  }
}

function startSessionPayload(params: URLSearchParams, env: QuickstartEnv): Record<string, unknown> {
  const speaker = params.get('speaker') || env.DOUBAO_E2E_SPEAKER || 'zh_female_vv_jupiter_bigtts'
  const model = params.get('model') || env.DOUBAO_E2E_MODEL || 'O'
  const instructions =
    params.get('instructions') ||
    env.DOUBAO_E2E_INSTRUCTIONS ||
    '你是豆包，一个由字节跳动开发的智能助手。请用简短、自然的中文回答。'

  return {
    asr: {
      format: 'pcm',
      rate: 16000,
      bits: 16,
      channel: 1,
      extra: {
        enable_itn_convert: true,
      },
    },
    tts: {
      speaker,
      audio_config: {
        channel: 1,
        format: 'pcm_s16le',
        sample_rate: 24000,
      },
    },
    dialog: {
      bot_name: '豆包',
      system_role: instructions,
      speaking_style: '友好、专业、有帮助。回答简洁明了。',
      extra: {
        strict_audit: false,
        input_mod: 'audio',
        model,
        audit_response: '抱歉，我暂时无法回答这个问题。让我们聊点别的吧。',
        enable_volc_websearch: false,
      },
    },
  }
}

function sendJson(ws: WebSocket, type: string, data: Record<string, unknown> = {}): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(control(type, data))
  }
}

function sendTrailingSilence(upstream: WebSocket, sessionId: string): void {
  const silenceChunk = Buffer.alloc(3200)
  let remainingChunks = 16

  const interval = setInterval(() => {
    if (upstream.readyState !== WebSocket.OPEN || remainingChunks <= 0) {
      clearInterval(interval)
      return
    }

    upstream.send(buildAudioEvent(sessionId, silenceChunk))
    remainingChunks -= 1
  }, 100)
}

function closePair(client: WebSocket, upstream: WebSocket | null): void {
  if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
    client.close()
  }
  if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
    upstream.close()
  }
}

function handleDoubaoFrame(client: WebSocket, upstream: WebSocket, frame: Buffer, sessionId: string, params: URLSearchParams, env: QuickstartEnv): void {
  const message = decodeFrame(frame)

  if (message.type === MSG_TYPE_AUDIO_ONLY_SERVER) {
    if (message.payload.byteLength) client.send(message.payload)
    return
  }

  if (message.type === MSG_TYPE_ERROR) {
    sendJson(client, 'error', {
      message: `Doubao server error ${message.errorCode ?? ''}: ${message.payload.toString('utf8')}`.trim(),
    })
    return
  }

  if (message.type !== MSG_TYPE_FULL_SERVER) return

  const payload = safeJson(message.payload)

  switch (message.event) {
    case EVENT_CONNECTION_STARTED:
      sendJson(client, 'status', { message: 'Doubao connection started' })
      upstream.send(buildFullClientEvent(EVENT_START_SESSION, sessionId, startSessionPayload(params, env)))
      break
    case EVENT_CONNECTION_FAILED:
      sendJson(client, 'error', { message: payload.error || 'Doubao connection failed' })
      break
    case EVENT_SESSION_STARTED:
      sendJson(client, 'connected', { dialogId: payload.dialog_id })
      break
    case EVENT_SESSION_FAILED:
      sendJson(client, 'error', { message: payload.error || 'Doubao session failed' })
      break
    case EVENT_ASR_STARTED:
      sendJson(client, 'status', { message: 'Doubao detected speech' })
      break
    case EVENT_ASR_RESPONSE: {
      const result = payload.results?.[0]
      if (result?.text) {
        sendJson(client, 'status', {
          message: result.is_interim ? `ASR partial: ${result.text}` : `ASR final: ${result.text}`,
        })
      }
      break
    }
    case EVENT_ASR_ENDED:
      sendJson(client, 'status', { message: 'Doubao ASR complete. Waiting for response...' })
      break
    case EVENT_CHAT_RESPONSE:
      if (payload.content) sendJson(client, 'assistant_delta', { delta: payload.content })
      break
    case EVENT_CHAT_ENDED:
      sendJson(client, 'assistant_done')
      break
    case EVENT_TTS_ENDED:
      sendJson(client, 'audio_done')
      break
    case EVENT_DIALOG_COMMON_ERROR:
      sendJson(client, 'error', { message: payload.message || 'Doubao realtime error' })
      break
    default:
      break
  }
}

function handleBrowserConnection(client: WebSocket, request: IncomingMessage, env: QuickstartEnv): void {
  const appId = env.DOUBAO_E2E_APP_ID?.trim()
  const accessToken = env.DOUBAO_E2E_ACCESS_TOKEN?.trim()
  const appKey = env.DOUBAO_E2E_APP_KEY?.trim() || DOUBAO_APP_KEY

  if (!appId || !accessToken) {
    sendJson(client, 'error', {
      message: 'Missing DOUBAO_E2E_APP_ID or DOUBAO_E2E_ACCESS_TOKEN in the local dev server environment.',
    })
    client.close(1011, 'missing doubao env')
    return
  }

  const requestUrl = new URL(request.url || DOUBAO_PROXY_PATH, 'http://localhost')
  const sessionId = randomUUID()
  let upstreamReady = false
  let upstream: WebSocket | null = new WebSocket(DOUBAO_WS_URL, {
    headers: {
      'X-Api-Resource-Id': DOUBAO_RESOURCE_ID,
      'X-Api-Access-Key': accessToken,
      'X-Api-App-Key': appKey,
      'X-Api-App-ID': appId,
      'X-Api-Connect-Id': randomUUID(),
    },
  })

  sendJson(client, 'status', { message: 'Connecting to Doubao E2E...' })

  upstream.on('open', () => {
    upstreamReady = true
    upstream?.send(buildFullClientEvent(EVENT_START_CONNECTION, sessionId, {}))
  })

  upstream.on('message', (data) => {
    const frame = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
    try {
      if (upstream) handleDoubaoFrame(client, upstream, frame, sessionId, requestUrl.searchParams, env)
    } catch (error) {
      sendJson(client, 'error', {
        message: error instanceof Error ? error.message : 'Failed to decode Doubao message',
      })
    }
  })

  upstream.on('error', (error) => {
    sendJson(client, 'error', { message: error.message || 'Doubao WebSocket error' })
  })

  upstream.on('close', () => {
    sendJson(client, 'disconnected')
    if (client.readyState === WebSocket.OPEN) client.close()
  })

  client.on('message', (data, isBinary) => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN || !upstreamReady) return

    if (isBinary) {
      const pcm16 = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      upstream.send(buildAudioEvent(sessionId, pcm16))
      return
    }

    const raw = data.toString()
    try {
      const event = JSON.parse(raw)
      if (event.type === 'commit') {
        sendJson(client, 'status', { message: 'Audio committed. Waiting for Doubao VAD...' })
        sendTrailingSilence(upstream, sessionId)
      } else if (event.type === 'cancel') {
        sendJson(client, 'status', { message: 'Doubao cancel requested' })
      }
    } catch {
      // Ignore malformed local control messages.
    }
  })

  client.on('close', () => {
    closePair(client, upstream)
    upstream = null
  })
}

export function doubaoRealtimeProxy(env: QuickstartEnv): Plugin {
  return {
    name: 'doubao-realtime-proxy',
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true })

      server.httpServer?.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        const requestUrl = new URL(request.url || '/', 'http://localhost')
        if (requestUrl.pathname !== DOUBAO_PROXY_PATH) return

        wss.handleUpgrade(request, socket, head, (client) => {
          handleBrowserConnection(client, request, env)
        })
      })
    },
  }
}
