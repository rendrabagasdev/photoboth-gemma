interface ImportMetaEnv {
  readonly VITE_OPERATOR_PIN?: string
  readonly VITE_OPERATOR_TOKEN?: string
  readonly APP_LOCK_ENV?: string
  [key: string]: string | boolean | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
