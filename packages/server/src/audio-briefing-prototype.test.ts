import { createLocalGeneration } from '@dn/inference'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('audio briefing styles', () => {
  it.each(['professional', 'radio'] as const)(
    'uses the %s instructions with factual safeguards',
    async (style) => {
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ choices: [{ message: { content: 'A script.' } }] }))
      const generation = createLocalGeneration({
        baseUrl: 'http://inference/v1',
        generationModel: 'gemma',
        embeddingModel: 'embedding',
      })
      const result = await generation.writeAudioBriefing({
        stories: [{ title: 'News', summary: 'Report [1]' }],
        greeting: { name: 'Nico', date: 'October 27' },
        style,
        signal: new AbortController().signal,
      })
      expect(result).toBe('A script.')
      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
      expect(body.messages[0].content).toContain('preserve attribution and uncertainty')
      expect(body.messages[0].content).toContain(
        style === 'radio' ? 'satirical commercial in the spirit of GTA radio' : 'professional, light-hearted',
      )
      if (style === 'radio') {
        expect(body.messages[0].content).toContain('Invent a different absurd business')
        expect(body.messages[0].content).toContain('without announcing that it is fictional')
        expect(body.messages[0].content).not.toContain('Monster Trucks')
      }
      expect(body.messages[1].content).not.toContain('[1]')
    },
  )

  it('rejects a truncated script rather than sending it to speech', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ choices: [{ finish_reason: 'length', message: { content: 'Incomplete' } }] }),
    )
    const generation = createLocalGeneration({
      baseUrl: 'http://inference/v1',
      generationModel: 'gemma',
      embeddingModel: 'embedding',
    })
    await expect(
      generation.writeAudioBriefing({
        stories: [],
        greeting: { name: '', date: 'October 27' },
        style: 'professional',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('truncated')
  })
})
