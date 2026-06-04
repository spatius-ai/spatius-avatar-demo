/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIUS_APP_ID?: string
  readonly VITE_SPATIUS_AVATAR_ID?: string
  readonly VITE_SPATIUS_SESSION_TOKEN?: string
  readonly VITE_REALTIME_PROVIDER?: 'openai' | 'gemini'
  readonly VITE_REALTIME_INSTRUCTIONS?: string
  readonly VITE_OPENAI_REALTIME_TOKEN?: string
  readonly VITE_OPENAI_REALTIME_MODEL?: string
  readonly VITE_OPENAI_REALTIME_VOICE?: string
  readonly VITE_OPENAI_REALTIME_INSTRUCTIONS?: string
  readonly VITE_GEMINI_API_KEY?: string
  readonly VITE_GEMINI_MODEL?: string
  readonly VITE_GEMINI_API_VERSION?: 'v1alpha' | 'v1beta'
  readonly VITE_GEMINI_INSTRUCTIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, any>
  export default component
}
