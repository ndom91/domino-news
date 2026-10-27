import { synthesizeBriefing } from './audio-briefing-speech.ts'

// A provider owns its transport, audio format and any chunking requirements.
export interface SpeechProvider {
  synthesize(text: string, signal: AbortSignal): Promise<{ bytes: Buffer; contentType: string }>
}

export function createSpeechProvider(env: NodeJS.ProcessEnv = process.env): SpeechProvider | null {
  const endpoint = env.AUDIO_PROTOTYPE_TTS_URL
  const key = env.AUDIO_PROTOTYPE_TTS_API_KEY
  if (!endpoint) return null
  const model = env.AUDIO_PROTOTYPE_TTS_MODEL || 'kokoro'
  const voice = env.AUDIO_PROTOTYPE_TTS_VOICE || 'af_heart'
  return {
    synthesize: async (text, signal) => ({
      bytes: await synthesizeBriefing(text, endpoint, key, model, voice, signal),
      contentType: 'audio/wav',
    }),
  }
}
