import { Platform } from 'react-native'
import { googleIosClientId, googleWebClientId } from './config'
import { isExpoGo } from './expo-go'

// iOS also needs its own OAuth client. The ID token is still issued for the web client
// (webClientId), so the server verifies it the same way on both platforms.
export const supportsGoogleSignIn =
  !isExpoGo &&
  googleWebClientId.length > 0 &&
  (Platform.OS !== 'ios' || googleIosClientId.length > 0)

export async function requestGoogleIdToken(): Promise<string | null> {
  if (!supportsGoogleSignIn) throw new Error('Google sign-in is unavailable in this app.')

  const { GoogleSignin, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  )
  GoogleSignin.configure({
    webClientId: googleWebClientId,
    ...(Platform.OS === 'ios' ? { iosClientId: googleIosClientId } : {}),
  })

  if (Platform.OS === 'android') {
    const hasPlayServices = await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    })
    if (!hasPlayServices) throw new Error('Google Play services are unavailable.')
  }

  const response = await GoogleSignin.signIn()
  if (!isSuccessResponse(response)) return null
  if (!response.data.idToken) throw new Error('Google did not return an identity token.')
  return response.data.idToken
}
