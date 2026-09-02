interface ImportMetaEnv {
  readonly VITE_OPERATOR_PIN?: string
  readonly VITE_OPERATOR_TOKEN?: string
  readonly APP_LOCK_ENV?: string
  readonly VITE_PHOTO_COUNT?: string
  readonly PHOTO_BOOTH_SHOT_COUNT?: string
  [key: string]: string | boolean | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
