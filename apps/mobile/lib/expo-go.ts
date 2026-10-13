import Constants from 'expo-constants'

// Standalone builds can report this as undefined; only Expo Go supplies its config object.
export const isExpoGo = Boolean(Constants.expoGoConfig)
