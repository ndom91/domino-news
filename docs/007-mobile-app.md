# 007: Mobile app (Expo), getting started

What an agent or developer needs before building the iOS/Android app. The direction comes from [004](004-frontend-platform.md): Expo + React Native with Expo Router. Share contracts, data access and formatting with the web app; build native screens rather than wrapping the website. Status, commands and configuration live in [`AGENTS.md`](../AGENTS.md). This doc covers only what's specific to the app.

Written 2026-10-12, when the server was made Expo-ready (`@better-auth/expo` 1.7.7, the `expo()` plugin). No app code exists yet.

## 1. Where it goes

- Create the app at **`apps/mobile`**. `pnpm-workspace.yaml` already includes `apps/*`.
- Name the package `@dn/mobile`. Workspace packages are `@dn/*` and are consumed as `workspace:*`.
- Keep app-only code in the app. If something is useful to web and native, it belongs in a `packages/*` package.

## 2. Repo rules that affect the app

- **pnpm 12, exact versions.** `saveExact: true`. Add dependencies with `pnpm --filter @dn/mobile add <pkg>`, not `npm`/`yarn`. Commit `pnpm-lock.yaml`.
- **Packages must be at least 7 days old** (`minimumReleaseAge: 10080` in `pnpm-workspace.yaml`). A release of Expo, React Native or `@better-auth/*` from the last week won't install. Pick the newest version older than 7 days, and don't turn the guard off.
- **Biome, not ESLint or Prettier.** `pnpm check` / `pnpm format` / `pnpm lint` cover the whole repo, the app included.
- **Every package has a `typecheck` script.** `pnpm typecheck` runs `tsc` in each one. Give the app one too.
- **Node ≥ 26** (`engines`).
- **Commits:** other agents work in the same tree. Stage only your own files, never `git add -A`.
- **Copy rules** from AGENTS.md "Frontend guidelines" apply to the app too:
  - Say "publisher", "story" and "narrative".
  - Use no pipeline terms outside admin screens.
  - Pluralise with `plural()`.
  - Use curly quotes and "…".

## 3. Shared packages the app should use

All shared packages export raw TypeScript (`"exports": { ".": "./src/index.ts" }`), which Metro/Babel compiles directly.

| Package | Use in the app | Notes |
| --- | --- | --- |
| `@dn/schemas` | API types and Zod contracts | Uses `zod/mini` (React Native-safe). The source of truth for every response shape. |
| `@dn/api-client` | Typed `/api/v1` client | No DOM or Node libs; `fetch` is injected. See §5. |
| `@dn/queries` | TanStack Query options and mutations | Peer `@tanstack/react-query` 5.104.1. Use the same version in the app. |
| `@dn/domain` | Formatting (`relativeTime`, `formatDate`, `plural`, `countryName`, `hostnameOf` …), lean helpers | See the runtime notes below. |
| `@dn/design-tokens` | **Not usable as-is.** CSS only (`design-tokens.css`, light/dark via `[data-theme]`). | The app needs a JS/TS export of the same values. Add one to this package rather than copying hex values. |
| `@dn/ui` | **Web only** (React DOM + Tailwind). | Reuse its meaning and data, not its components (004 §6). |

**Runtime notes for `@dn/domain` on Hermes:**

- **`hostnameOf` / URL normalisation** use `new URL(...)`. React Native's built-in `URL` is incomplete, so install `react-native-url-polyfill` and import `react-native-url-polyfill/auto` first thing in the app entry.
- **Dates and times** use `Intl.DateTimeFormat` and `Intl.RelativeTimeFormat`. Check them on both platforms in a release build. If a format throws or comes out wrong, add the matching `@formatjs/intl-*` polyfill.
- **`countryName`** uses `Intl.DisplayNames` and falls back to the ISO code when it's missing. It's created lazily, so importing the package never throws.
- **`newId` (IDs)** uses `crypto.getRandomValues`. The app shouldn't need to create IDs. If it does, add `react-native-get-random-values`.

## 4. Auth

The server is ready. See `packages/server/src/auth.ts` and AGENTS.md "Mobile app (Expo)".

**Server facts:**
- **better-auth 1.7.7**, with plugins `username`, `bearer`, `expo`, `passkey` and `tanstackStartCookies`.
- **Public sign-up is disabled.** Accounts come from `pnpm cli user:create`, or from Google sign-in when that's configured.
- **App scheme:** `dominonews` by default (`EXPO_APP_SCHEME`). It must equal `"scheme"` in the app's `app.json`. The server trusts `dominonews://`.
- **Expo Go:** its `exp://…` URLs are trusted only when the server runs with `NODE_ENV=development`. A production build must use the app scheme.
- **Sessions last 30 days.** Each user has a `role` (`admin` | `user`), and only admins can use `/ops` and publisher assessment review.

**Client setup** (better-auth's Expo guide: https://better-auth.com/docs/integrations/expo):

```bash
pnpm --filter @dn/mobile add better-auth@1.7.7 @better-auth/expo@1.7.7 expo-secure-store expo-network
# expo-linking, expo-web-browser, expo-constants ship with the default template (needed for social sign-in later)
```

```ts
// apps/mobile/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'
import { expoClient } from '@better-auth/expo/client'
import { usernameClient } from 'better-auth/client/plugins'
import * as SecureStore from 'expo-secure-store'

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL, // e.g. https://news.example.com (no /api/auth)
  plugins: [
    usernameClient(),
    expoClient({ scheme: 'dominonews', storagePrefix: 'dominonews', storage: SecureStore }),
  ],
})

// Sign in: authClient.signIn.username({ username, password })
// Session: authClient.useSession() (cached in SecureStore, so no spinner after a restart)
```

**What works on native today:** username + password sign-in, sign-out, and the session.

**Not yet:**
- **Passkeys.** WebAuthn on native needs a passkey library such as `react-native-passkey`. The site also has to serve `/.well-known/assetlinks.json` (Android) and `/.well-known/apple-app-site-association` (iOS) for the app's package and bundle IDs. The server's passkey `rpID` is the site hostname. If the passkey plugin uses a custom challenge cookie, add its prefix to `expoClient`'s `cookiePrefix`.
- **Google sign-in.** It needs Android and iOS OAuth client IDs in Google Cloud and `@react-native-google-signin/google-signin`. Then call `authClient.signIn.social({ provider: 'google', idToken: { token } })`. On native, `signIn.social` doesn't navigate; call `router.replace(...)` yourself.

## 5. Calling the API

All product data comes from `/api/v1` (contracts in `packages/schemas/src/api.ts`, endpoint list in AGENTS.md "API"). Every route needs a session. Native apps don't enforce CORS, so the API needs no CORS headers for the app. Only an Expo **web** build would.

```ts
// apps/mobile/lib/api.ts
import { createApiClient } from '@dn/api-client'
import { createQueries } from '@dn/queries'
import { authClient } from './auth-client'

export const api = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  fetch: (url, init) => fetch(url, init),
  // better-auth's Expo docs: send the cookie yourself, with credentials "omit".
  credentials: 'omit',
  headers: async () => {
    const cookie = await authClient.getCookie()
    return cookie ? { cookie } : {}
  },
})
export const queries = createQueries(api)
```

- **Errors:** `ApiError` from `@dn/api-client` has `status` and `code`. `code` is `unauthorized` (session expired: send the user to sign-in), `forbidden`, `not_found`, `bad_request`, `conflict`, `unavailable`, `internal`, or `network` (no connection).
- **Bearer tokens** also work as an alternative: sign in, read the `set-auth-token` response header, then send `Authorization: Bearer <token>`. Prefer the cookie flow above, which `@better-auth/expo` manages for you.
- Contract tests for the native flow live in `test/api.test.ts` ("Expo app sign-in") and `test/unit.test.ts` ("API client on native").

## 6. Running against a dev server

1. Start the stack as in AGENTS.md "Frontend work with hot reload". Postgres and Typesense run in Docker; the web app runs on the host.
2. Run **`pnpm dev --host`**. Plain `pnpm dev` binds to localhost only, so a phone can't reach it. With `--host`, Vite prints the LAN address (e.g. `http://10.0.0.99:4000`).
3. Set `EXPO_PUBLIC_API_URL=http://<LAN IP>:4000` for the app.
4. With Expo Go, run the dev server with `NODE_ENV=development` so the `exp://` origins are trusted.
5. Sign in with a dev account (`DEV_USERNAME` / `DEV_PASSWORD` in `.env`, or `pnpm cli user:create`).

**Gotchas:**

- **Cleartext HTTP.** Android blocks plain `http://` by default in release builds, and iOS has App Transport Security. A LAN dev server over HTTP needs those allowed in development builds only. Production uses HTTPS.
- **Session cookie name.** The cookie is `better-auth.session_token`. If you change the cookie prefix on the server, set `cookiePrefix` in `expoClient` to match.
- **The pipeline doesn't matter for the app.** The worker can stay stopped. The app only reads what's already in the database.

## 7. Metro and pnpm

- **Package exports.** Expo SDK 53+ enables package `exports` resolution by default, and better-auth needs it. Don't set `resolver.unstable_enablePackageExports = false`.
- **pnpm's symlinked `node_modules` is unconfirmed.** Check the Expo monorepo guide for the SDK version you install. Some setups need `watchFolders` set to the repo root and `nodeModulesPaths` for the root and app `node_modules`. Some need `node-linker=hoisted` scoped to the app. Prefer the smallest config that works, and write down what was needed.
- **Duplicate React.** Make sure exactly one copy of React and React Native resolves. Duplicate React copies are the usual cause of "Invalid hook call" in pnpm monorepos.
- After Metro config changes, run `npx expo start --clear`.

## 8. What to build first

- **Product scope:** follow the web app's reader features: front page, story, narrative, search, For You, Blindspot, publishers and account. Admin screens (`/ops`, assessment review) can stay web-only.
- **Story view-models:** keep them in shared packages where both apps need the same derived data, such as the lean mix grouping or citation numbering. Native-only presentation stays in the app.
- **Context entries:** a desktop popover becomes a native bottom sheet (004 §6). Share the data, not the component.
- **Out of scope for now** (004 §2): push notifications, deep links beyond auth callbacks, offline-first storage and store subscriptions. Don't design contracts that rule them out.
