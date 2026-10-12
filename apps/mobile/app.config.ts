import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest } from 'expo/config-plugins'

const developmentBuild = process.env.APP_VARIANT === 'development'

function withDevelopmentCleartext(config: ExpoConfig): ExpoConfig {
  return withAndroidManifest(config, (configuration) => {
    configuration.modResults.manifest.$['android:usesCleartextTraffic'] = 'true'
    return configuration
  })
}

const config: ExpoConfig = {
  name: 'Domino News',
  slug: 'domino-news',
  scheme: 'dominonews',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: developmentBuild
    ? {
        infoPlist: {
          NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        },
      }
    : undefined,
  android: { package: 'dev.ndo.dominonews' },
  extra: { eas: { projectId: '433e551b-9dfb-4c06-9edf-59f8b0b5faa1' } },
  experiments: { typedRoutes: true },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-background-task',
    ['expo-notifications', { color: '#ff4d1a', defaultChannel: 'for-you' }],
  ],
}

export default developmentBuild ? withDevelopmentCleartext(config) : config
