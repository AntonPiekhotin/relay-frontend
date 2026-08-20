/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** A PATH, never a host — everything goes through the Vite proxy. See docs/ARCHITECTURE.md §2. */
  readonly VITE_API_BASE?: string
  /** A PATH. Same reason. */
  readonly VITE_WS_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
