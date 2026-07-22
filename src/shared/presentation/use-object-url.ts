import { useEffect, useState } from 'react'

export function useObjectUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    let active = true

    if (!blob) {
      queueMicrotask(() => {
        if (active) setUrl(undefined)
      })
      return () => {
        active = false
      }
    }

    const nextUrl = URL.createObjectURL(blob)
    queueMicrotask(() => {
      if (active) setUrl(nextUrl)
    })

    return () => {
      active = false
      URL.revokeObjectURL(nextUrl)
    }
  }, [blob])

  return url
}
