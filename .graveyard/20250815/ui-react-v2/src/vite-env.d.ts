/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_ALERTS_ENABLED?: string
  readonly VITE_RULES_ENABLED?: string
  readonly VITE_RULEPACKS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
