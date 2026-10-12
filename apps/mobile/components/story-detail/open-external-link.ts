import { Alert, Linking } from 'react-native'

// openExternalLink opens a web link and explains when the device cannot handle it.
export async function openExternalLink(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    Alert.alert('Link unavailable', 'This link could not be opened. Try again later.')
  }
}
