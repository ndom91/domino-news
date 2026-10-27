import type { ForYouResponse } from '@dn/schemas'

export const AUDIO_BRIEFING_STORY_LIMIT = 5

export function selectAudioStories(items: ForYouResponse['items']) {
  return items.slice(0, AUDIO_BRIEFING_STORY_LIMIT).filter(({ story }) => story.summary?.trim())
}
