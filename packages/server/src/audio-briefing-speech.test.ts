import { describe, expect, it, vi } from 'vitest'
import { synthesizeBriefing } from './audio-briefing-speech.ts'
import { createSpeechProvider } from './speech-provider.ts'

function wav() {
  const result = Buffer.alloc(46)
  result.write('RIFF', 0)
  result.writeUInt32LE(38, 4)
  result.write('WAVEfmt ', 8)
  result.writeUInt32LE(16, 16)
  result.writeUInt16LE(1, 20)
  result.write('data', 36)
  result.writeUInt32LE(2, 40)
  return result
}

describe('audio briefing speech', () => {
  it('sends the entire script once using Kokoro defaults without authentication', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(wav()))
    try {
      const provider = createSpeechProvider({ AUDIO_PROTOTYPE_TTS_URL: 'http://tts' })
      const result = await provider?.synthesize(
        'First sentence. Second sentence.',
        new AbortController().signal,
      )
      expect(result?.bytes).toEqual(wav())
      expect(fetcher).toHaveBeenCalledTimes(1)
      const [url, init] = fetcher.mock.calls[0] ?? []
      expect(url).toBe('http://tts')
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'kokoro',
        input: 'First sentence. Second sentence.',
        voice: 'af_heart',
        response_format: 'wav',
      })
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
    } finally {
      fetcher.mockRestore()
    }
  })

  it('forwards an optional key and rejects errors and invalid audio', async () => {
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response('not wav'))
    try {
      const run = () =>
        synthesizeBriefing(
          'Hello.',
          'http://tts',
          'secret',
          'kokoro',
          'af_heart',
          new AbortController().signal,
        )
      await expect(run()).rejects.toThrow('503')
      expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
        'Bearer secret',
      )
      await expect(run()).rejects.toThrow('invalid WAV')
    } finally {
      fetcher.mockRestore()
    }
  })

  it('normalizes streaming WAV length placeholders after buffering', async () => {
    const streaming = wav()
    streaming.writeUInt32LE(0xffffffff, 4)
    streaming.writeUInt32LE(0xffffffff, 40)
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(streaming))
    try {
      const result = await synthesizeBriefing(
        'Hello.',
        'http://tts',
        undefined,
        'kokoro',
        'af_heart',
        new AbortController().signal,
      )
      expect(result.readUInt32LE(4)).toBe(result.length - 8)
      expect(result.readUInt32LE(40)).toBe(2)
    } finally {
      fetcher.mockRestore()
    }
  })
})
