const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()
const rawGoogleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim()
const rawGoogleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim()

export const apiUrl = rawApiUrl?.replace(/\/$/, '') ?? ''
export const hasApiUrl = apiUrl.length > 0
export const googleWebClientId = rawGoogleWebClientId ?? ''
export const googleIosClientId = rawGoogleIosClientId ?? ''
