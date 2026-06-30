/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIUS_APP_ID?: string
  readonly VITE_SPATIUS_AVATAR_ID?: string
  readonly VITE_SPATIUS_SESSION_TOKEN?: string
  readonly VITE_SPATIUS_REGION?: 'us-west' | 'ap-northeast' | 'cn-beijing'
  readonly VITE_REALTIME_PROVIDER?: 'openai' | 'gemini' | 'doubao'
  readonly VITE_REALTIME_INSTRUCTIONS?: string
  readonly VITE_OPENAI_REALTIME_TOKEN?: string
  readonly VITE_OPENAI_REALTIME_MODEL?: string
  readonly VITE_OPENAI_REALTIME_VOICE?: string
  readonly VITE_OPENAI_REALTIME_INSTRUCTIONS?: string
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_GEMINI_MODEL?: string
  readonly VITE_GEMINI_API_VERSION?: 'v1alpha' | 'v1beta'
  readonly VITE_GEMINI_INSTRUCTIONS?: string
  readonly VITE_DOUBAO_E2E_MODEL?: string
  readonly VITE_DOUBAO_E2E_SPEAKER?: string
  readonly VITE_DOUBAO_E2E_INSTRUCTIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
