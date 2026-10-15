import Constants from 'expo-constants'

// Development clients also use Expo's store-client environment; app ownership identifies Expo Go itself.
export const isExpoGo = Constants.appOwnership === 'expo'
