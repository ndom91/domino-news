import { nativeDarkTokens, nativeTokens } from '@dn/design-tokens/native'
import { createContext, use } from 'react'
import { useColorScheme } from 'react-native'

export type StoryTokens = typeof nativeTokens | typeof nativeDarkTokens

export const StoryTheme = createContext<'light' | 'dark' | null>(null)
export function useStoryTheme() {
  const override = use(StoryTheme)
  const system = useColorScheme()
  return (override ?? system) === 'dark' ? nativeDarkTokens : nativeTokens
}
