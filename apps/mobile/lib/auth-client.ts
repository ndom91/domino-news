import { expoClient } from '@better-auth/expo/client'
import { usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import * as SecureStore from 'expo-secure-store'
import { apiUrl } from './config'

export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [
    usernameClient(),
    expoClient({ scheme: 'dominonews', storagePrefix: 'dominonews', storage: SecureStore }),
  ],
})
