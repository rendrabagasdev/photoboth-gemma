const operatorPin = import.meta.env.VITE_OPERATOR_PIN ?? import.meta.env.APP_LOCK_ENV

if (typeof operatorPin !== 'string' || operatorPin.trim().length === 0) {
  throw new Error('Environment VITE_OPERATOR_PIN belum diisi.')
}

export const env = {
  appLock: {
    pin: operatorPin.trim(),
    token: import.meta.env.VITE_OPERATOR_TOKEN ?? 'tobfest-local-operator',
  },
}
