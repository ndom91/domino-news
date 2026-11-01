import type { ExpoConfig } from 'expo/config'
import { withAndroidManifest } from 'expo/config-plugins'

const developmentBuild = process.env.APP_VARIANT === 'development'

// Google's iOS URL scheme is the iOS OAuth client ID reversed. Google sign-in returns to the app
// through it, so the plugin is only added once that client exists.
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim()
const googleIosUrlScheme = googleIosClientId
  ? `com.googleusercontent.apps.${googleIosClientId.replace(/\.apps\.googleusercontent\.com$/, '')}`
  : null

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
  ios: {
    // iOS masks icons to a squircle, so it needs the padded variant to avoid clipping the logo.
    icon: '../web/public/icon-maskable-512.png',
    // Permanent once released on the App Store; matches the Android package.
    bundleIdentifier: 'dev.ndo.dominonews',
    supportsTablet: false,
    infoPlist: {
      // The app only uses standard HTTPS, which is exempt from export compliance.
      ITSAppUsesNonExemptEncryption: false,
      ...(developmentBuild ? { NSAppTransportSecurity: { NSAllowsArbitraryLoads: true } } : {}),
    },
  },
  android: {
    package: 'dev.ndo.dominonews',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#f3f1ec',
    },
  },
  extra: { eas: { projectId: '433e551b-9dfb-4c06-9edf-59f8b0b5faa1' } },
  experiments: { reactCompiler: true, typedRoutes: true },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-audio',
      { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: true },
    ],
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
    // Without options this plugin switches to its Firebase mode, which also edits Android.
    ...(googleIosUrlScheme
      ? [
          ['@react-native-google-signin/google-signin', { iosUrlScheme: googleIosUrlScheme }] as [
            string,
            unknown,
          ],
        ]
      : []),
  ],
}

export default developmentBuild ? withDevelopmentCleartext(config) : config
