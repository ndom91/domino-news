import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAudioBriefing } from './audio-briefing-prototype.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('audio briefing styles', () => {
  it.each(['professional', 'radio'] as const)(
    'uses the %s instructions with factual safeguards',
    async (style) => {
      vi.stubEnv('INFERENCE_MODE', 'local')
      vi.stubEnv('INFERENCE_BASE_URL', 'http://inference/v1')
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ choices: [{ message: { content: 'A script.' } }] }))
      const result = await writeAudioBriefing(
        [{ title: 'News', summary: 'Report [1]' }],
        { name: 'Nico', date: 'October 27' },
        style,
        new AbortController().signal,
      )
      expect(result).toBe('A script.')
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
      expect(body.messages[0].content).toContain('preserve attribution and uncertainty')
      expect(body.messages[0].content).toContain(
        style === 'radio' ? 'clearly fictional spoof sponsor' : 'professional, light-hearted',
      )
      expect(body.messages[1].content).not.toContain('[1]')
    },
  )
})
