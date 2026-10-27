import { describe, expect, it, vi } from 'vitest'
import { joinWavs, speechChunks, synthesizeBriefing } from './audio-briefing-speech.ts'

function wav(samples: number[], rate = 24000) {
  const data = Buffer.from(samples)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

describe('audio briefing speech', () => {
  it('preserves all text in order and bounds long sentences', () => {
    const input = `Hello Nico. ${'Long '.repeat(100)}End. Next story.`
    const chunks = speechChunks(input)
    expect(chunks.join(' ')).toBe(input.replace(/\s+/g, ' ').trim())
    expect(chunks.every((chunk) => chunk.length <= 180)).toBe(true)
    expect(chunks[0]).toBe('Hello Nico.')
  })

  it('joins PCM samples in order and rejects incompatible or truncated audio', () => {
    const combined = joinWavs([wav([1, 2]), wav([3, 4])])
    expect(combined.readUInt32LE(4)).toBe(combined.length - 8)
    expect(combined.readUInt32LE(40)).toBe(4)
    expect([...combined.subarray(44)]).toEqual([1, 2, 3, 4])
    expect(() => joinWavs([wav([1, 2]), wav([3, 4], 16000)])).toThrow('incompatible')
    expect(() => joinWavs([wav([1, 2]).subarray(0, 44)])).toThrow('invalid')
  })

  it('sends each passage in order and fails rather than returning partial audio', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    fetcher.mockResolvedValueOnce(new Response(wav([1, 2])))
    fetcher.mockResolvedValueOnce(new Response(wav([3, 4])))
    try {
      const audio = await synthesizeBriefing(
        'First sentence. Second sentence.',
        'http://tts',
        'key',
        'model',
        new AbortController().signal,
      )
      expect(fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).input)).toEqual([
        'First sentence.',
        'Second sentence.',
      ])
      expect([...audio.subarray(44)]).toEqual([1, 2, 3, 4])
      fetcher
        .mockReset()
        .mockResolvedValueOnce(new Response(wav([1, 2])))
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
      await expect(
        synthesizeBriefing(
          'First sentence. Second sentence.',
          'http://tts',
          'key',
          'model',
          new AbortController().signal,
        ),
      ).rejects.toThrow('503')
    } finally {
      fetcher.mockRestore()
    }
  })
})
