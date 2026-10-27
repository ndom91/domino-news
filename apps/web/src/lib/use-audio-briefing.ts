import { useEffect, useRef, useState } from 'react'

export function useAudioBriefing() {
  const [briefing, setBriefing] = useState<{
    audio: string
    transcript: string
    stories: { title: string; slug: string }[]
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<'selecting' | 'writing' | 'recording'>('selecting')
  const [selected, setSelected] = useState<{ title: string; slug: string }[] | null>(null)
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
    setStage('selecting')
    setSelected(null)
    try {
      const response = await fetch('/api/v1/briefing/audio-prototype', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: abort.signal,
      })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error?.message || 'Could not prepare your audio briefing.')
      }
      type Result = {
        audio: string
        contentType: string
        transcript: string
        stories: { title: string; slug: string }[]
      }
      let data: Result | undefined
      if (response.headers.get('content-type')?.includes('application/x-ndjson')) {
        if (!response.body) throw new Error('Could not read the briefing response.')
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          buffer += chunk.value
          let newline = buffer.indexOf('\n')
          while (newline !== -1) {
            const event = JSON.parse(buffer.slice(0, newline))
            buffer = buffer.slice(newline + 1)
            if (event.type === 'selected') setSelected(event.stories)
            else if (
              event.type === 'stage' &&
              (event.stage === 'writing' || event.stage === 'recording')
            )
              setStage(event.stage)
            else if (event.type === 'result') data = event as Result
            else if (event.type === 'error')
              throw new Error(event.message || 'Could not prepare your briefing.')
            newline = buffer.indexOf('\n')
          }
        }
        if (buffer.trim() || !data)
          throw new Error('The briefing response was incomplete. Please try again.')
      } else {
        data = (await response.json()) as Result
      }
      const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0))
      setBriefing({
        ...data,
        audio: URL.createObjectURL(new Blob([bytes], { type: data.contentType })),
      })
    } catch (err) {
      if (!abort.signal.aborted) {
        abort.abort()
        setError(err instanceof Error ? err.message : 'Could not prepare your audio briefing.')
      }
    } finally {
      controller.current = null
      setPending(false)
    }
  }

  return {
    briefing,
    pending,
    error,
    stage,
    selected,
    generate,
    cancel: () => controller.current?.abort(),
  }
}
