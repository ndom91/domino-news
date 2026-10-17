import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { parse } from 'dotenv'

const envPath = '.env'
if (!existsSync(envPath)) fail('Create apps/mobile/.env from .env.example first.')

const env = parse(readFileSync(envPath, 'utf8'))
const apiUrl = parseApiUrl(env.EXPO_PUBLIC_API_URL)
const googleWebClientId = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
if (!googleWebClientId?.match(/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/)) {
  fail(
    'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to an OAuth Web application client ID in apps/mobile/.env.',
  )
}

mkdirSync('dist', { recursive: true })
execFileSync(
  'pnpx',
  [
    'eas-cli@24.12.1',
    'build',
    '--platform',
    'android',
    '--profile',
    'preview',
    '--local',
    '--non-interactive',
    '--output',
    'dist/domino-wire-preview.apk',
  ],
  {
    env: {
      ...process.env,
      APP_VARIANT: 'preview',
      EXPO_PUBLIC_API_URL: apiUrl,
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: googleWebClientId,
    },
    stdio: 'inherit',
  },
)

function parseApiUrl(value) {
  try {
    const url = new URL(value)
    if (
      url.protocol === 'https:' &&
      url.hostname &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    ) {
      return url.origin
    }
  } catch {
    fail('Set EXPO_PUBLIC_API_URL to an HTTPS API origin in apps/mobile/.env.')
  }
  fail('Set EXPO_PUBLIC_API_URL to an HTTPS API origin in apps/mobile/.env.')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
