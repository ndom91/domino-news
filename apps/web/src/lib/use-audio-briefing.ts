import { useEffect, useRef, useState } from 'react'

export function useAudioBriefing() {
  const [briefing, setBriefing] = useState<{
    audio: string
    transcript: string
    stories: { title: string; slug: string }[]
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)

  useEffect(() => () => controller.current?.abort(), [])

  useEffect(
    () => () => {
      if (briefing) URL.revokeObjectURL(briefing.audio)
    },
    [briefing],
  )

  async function generate() {
    const abort = new AbortController()
    controller.current = abort
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/v1/briefing/audio-prototype', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: abort.signal,
      })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error?.message || 'Could not prepare your audio briefing.')
      }
      const data = (await response.json()) as {
        audio: string
        contentType: string
        transcript: string
        stories: { title: string; slug: string }[]
      }
      const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0))
      setBriefing({
        ...data,
        audio: URL.createObjectURL(new Blob([bytes], { type: data.contentType })),
      })
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'Could not prepare your audio briefing.')
    } finally {
      controller.current = null
      setPending(false)
    }
  }

  return { briefing, pending, error, generate, cancel: () => controller.current?.abort() }
}
