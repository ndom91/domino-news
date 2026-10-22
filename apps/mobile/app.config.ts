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
  name: 'Domino Wire',
  description: 'Follow the news as it falls: one story, every source, and what came next.',
  slug: 'domino-news',
  scheme: 'dominonews',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: '#f3f1ec',
  primaryColor: '#121212',
  icon: '../web/public/icon-512.png',
  ios: developmentBuild
    ? {
        infoPlist: {
          NSAppTransportSecurity: { NSAllowsArbitraryLoads: true },
        },
      }
    : undefined,
  android: {
    package: 'dev.ndo.dominonews',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: '../web/public/icon-maskable-512.png',
      backgroundColor: '#f3f1ec',
    },
  },
  extra: { eas: { projectId: '433e551b-9dfb-4c06-9edf-59f8b0b5faa1' } },
  experiments: { reactCompiler: true, typedRoutes: true },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-background-task',
    ['expo-navigation-bar', { enforceContrast: false, style: 'dark' }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f3f1ec',
        image: '../web/public/icon-maskable-512.png',
        imageWidth: 180,
      },
    ],
    ['expo-notifications', { color: '#ff4d1a', defaultChannel: 'for-you' }],
  ],
}

export default developmentBuild ? withDevelopmentCleartext(config) : config
