# Domino Wire mobile

Expo Router application for Android and iOS. It consumes the same typed API client, Query options, domain
formatting utilities and design tokens as the web app. Both platforms use the identifier
`dev.ndo.dominonews`.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the LAN URL printed by
   `pnpm dev --host`.
2. Start the web/API server with `NODE_ENV=development pnpm dev --host`.
3. Start Expo Go with `pnpm --filter @dn/mobile start`. Its QR code starts with `exp://`.

Start `pnpm dev:worker` as well when testing a low-coverage Story that does not have context
yet. Opening its detail screen admits that optional enrichment at interactive priority; the
shared Story query polls briefly and updates the screen when the exact summary version is ready.
Previously generated Stories can still be read with the worker stopped.

The Local tab uses the location saved in Account, or the API's connection-country fallback when
available. Narratives remain accessible from Latest. The audio player and a link to the written
Briefing are on For You; opening the written Briefing updates the same last-opened checkpoint used
by web.

Audio briefing is an on-demand prototype. Configure the server's local inference and speech service
as described in the root `AGENTS.md`. Android requests the complete audio response, so it shows a
single preparation state rather than the web's streamed stages. Playback continues while navigating,
when the app is backgrounded, and with the screen locked; Android exposes media notification controls.
The temporary audio file is removed when the signed-in session ends or a new briefing replaces it.
Background playback requires a new development or preview build with the audio config plugin enabled;
Expo Go does not provide the app-specific foreground-service configuration.
Run the mobile unit tests with `pnpm --filter @dn/mobile test`.

Expo Go supports username/password sign-in. Google sign-in needs a custom development build because it
uses native Google Play services. A development build sets `APP_VARIANT=development` to allow a LAN
`http://` API; production builds require HTTPS and intentionally do not enable cleartext transport.

## iOS

Run a simulator development build with `npx expo run:ios` from `apps/mobile` (needs Xcode and
CocoaPods). Simulator builds need no Apple Developer account; TestFlight, App Store and push
notifications do.

Google sign-in on iOS needs an OAuth client of type **iOS** for bundle ID `dev.ndo.dominonews`, in the
same Google Cloud project as the web client. Set its client ID as `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in
`apps/mobile/.env` and in the EAS environment. The config plugin derives the reversed URL scheme from it,
so rebuild the native app after setting or changing it. Without it, iOS hides the Google button. The ID
token is still issued for the web client, so the server needs no iOS-specific setting.

Sign in with Apple needs no app-side env var: iOS shows Apple's button whenever the device supports it
(not in Expo Go, and not reliably in the Simulator). App Review requires it next to Google. The App ID
needs the Sign in with Apple capability, and the server needs `APPLE_TEAM_ID`, `APPLE_KEY_ID` and
`APPLE_PRIVATE_KEY` (see AGENTS.md), or sign-in fails with "Provider not found".

## For You alerts

The Account screen registers this device's Expo push token for **For You** alerts. The server sends the
notifications through Expo/FCM, and the app opens the named Story when the reader taps one. The Account
screen confirms that the server has the device registration. Every signed-in launch registers the
current Expo token again, which is how a changed token reaches the server.

## Local Preview APK

Use the production-style Preview APK for native Google sign-in and push-notification testing:

1. In `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL=https://dominowire.com` for production and
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the OAuth 2.0 **Web application** client ID.
2. Run `pnpm mobile:build:preview` from the repository root.
3. Install `apps/mobile/dist/domino-wire-preview.apk` on the device.

The command reads only these two public values from the ignored `.env` before EAS stages the project, so they
are embedded in the APK. It requires an authenticated EAS CLI and Android build prerequisites on the local
machine. It sets `APP_VARIANT=preview`, so the APK deliberately does not permit an insecure `http://` LAN API
URL. The command uses `ANDROID_HOME` when set, otherwise the standard macOS Android Studio SDK at
`~/Library/Android/sdk`; set `ANDROID_HOME` if your SDK is elsewhere. The Android OAuth client and its
signing-certificate fingerprint remain configured separately.

## Android development build

1. Sign in to the existing `@ndom91/domino-news` EAS project with `pnpx eas-cli@latest login`.
2. Build an installable APK with `pnpx eas-cli@latest build --platform android --profile development`.
3. Install the APK from EAS, then run `pnpm --filter @dn/mobile start:dev-client` and open Domino Wire.

The development-client QR code starts with `exp+domino-news://`; it cannot be opened in Expo Go.

The EAS signing key has its own SHA-1 fingerprint. Add it as another Android OAuth client for
`dev.ndo.dominonews` before testing Google sign-in.

Remote EAS builds do not receive ignored local `.env` files. Before a build that embeds JavaScript (such as
a release or EAS Update), configure `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the EAS
environment that build uses. The local development client gets these values from `apps/mobile/.env` through
Metro.

No Metro configuration is required with Expo SDK 58: its monorepo resolver discovers the workspace
root and preserves package exports. If that changes, start with `pnpm --filter @dn/mobile start --clear`.
`expo install --check` currently identifies newer SDK 58 patch releases, but they are intentionally
not installable until they pass the workspace's seven-day minimum release age.

## Changing the public domain

For the transition to `dominowire.com`, configure the server with:

```dotenv
BETTER_AUTH_URL=https://dominowire.com
BETTER_AUTH_ADDITIONAL_ORIGINS=https://domino-wire.ndo.dev
```

Serve both origins from the same application, database and `BETTER_AUTH_SECRET`. Preserve the public
`Host` header at the reverse proxy. Keep `/api/auth/*` and `/api/v1/*` working on the old origin without
redirecting them: installed apps still use their bundled URL. Better Auth selects the matching origin
for authentication callbacks and keeps cookies host-only. Existing mobile session cookies and bearer
tokens remain valid; browser sessions are separate for each domain. Web passkeys work only on the
hostname where they were registered.

Keep both Google web OAuth callback URLs authorised during the transition:
`https://dominowire.com/api/auth/callback/google` and
`https://domino-wire.ndo.dev/api/auth/callback/google`. The native Google client IDs, app identifiers,
`dominonews` scheme and EAS project stay the same.

Set `EXPO_PUBLIC_API_URL=https://dominowire.com` in the EAS **preview** environment (both preview and
production build profiles currently use it), and release new iOS and Android builds. Once old builds
are retired, remove `BETTER_AUTH_ADDITIONAL_ORIGINS` and restart the server. Then the old website can
redirect to the new one. No database migration is required.

## Release to the stores

The app version lives in `app.config.ts`. Commit the version bump on `main`, then push a matching
`mobile-v<version>` tag (for example, `mobile-v0.8.7`). The EAS GitHub integration runs
`.eas/workflows/release.yml`, builds both platforms with the `production` profile, then uploads iOS
to App Store Connect/TestFlight and Android to Google Play's `alpha` (closed testing) track.
Build numbers auto-increment in EAS; do not change the app identifiers or signing credentials.

Before tagging, check the EAS **preview** environment: `EXPO_PUBLIC_API_URL` must be
`https://dominowire.com`, and both `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` and
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` must be set. Both store-build profiles use that environment.

The workflow does not sync `store.config.json` or publish a public store rollout. Update listing URLs
separately in App Store Connect and Google Play Console (or use EAS Metadata for Apple's listing).
Apple still requires processing and any beta/App Review steps; a public Play release requires
promotion from closed testing.

The app scheme is `dominonews`, matching `EXPO_APP_SCHEME` on the server. Android's application ID and
iOS's bundle identifier are both `dev.ndo.dominonews`.
