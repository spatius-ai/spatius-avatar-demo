/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIUS_APP_ID?: string
  readonly VITE_SPATIUS_AVATAR_ID?: string
  readonly VITE_SPATIUS_REGION?: 'us-west' | 'ap-northeast' | 'cn-beijing'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
