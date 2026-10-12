const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim()

export const apiUrl = rawApiUrl?.replace(/\/$/, '') ?? ''
export const hasApiUrl = apiUrl.length > 0
