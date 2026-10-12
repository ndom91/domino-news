import Constants from 'expo-constants'
import { googleWebClientId } from './config'

export const supportsGoogleSignIn =
  Constants.appOwnership !== 'expo' && googleWebClientId.length > 0

export async function requestGoogleIdToken(): Promise<string | null> {
  if (!supportsGoogleSignIn) throw new Error('Google sign-in is unavailable in this app.')

  const { GoogleSignin, isSuccessResponse } = await import(
    '@react-native-google-signin/google-signin'
  )
  GoogleSignin.configure({ webClientId: googleWebClientId })

  const hasPlayServices = await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  })
  if (!hasPlayServices) throw new Error('Google Play services are unavailable.')

  const response = await GoogleSignin.signIn()
  if (!isSuccessResponse(response)) return null
  if (!response.data.idToken) throw new Error('Google did not return an identity token.')
  return response.data.idToken
}
