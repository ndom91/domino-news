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
  experiments: { typedRoutes: true },
  plugins: ['expo-router', 'expo-secure-store'],
}

export default developmentBuild ? withDevelopmentCleartext(config) : config
