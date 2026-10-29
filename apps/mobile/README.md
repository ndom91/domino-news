# Domino Wire mobile

Expo Router Android application. It consumes the same typed API client, Query options, domain formatting
utilities and design tokens as the web app. iOS is deferred until its bundle identifier and native Google
sign-in configuration are chosen.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the LAN URL printed by
   `pnpm dev --host`.
2. Start the web/API server with `NODE_ENV=development pnpm dev --host`.
3. Start Expo Go with `pnpm --filter @dn/mobile start`. Its QR code starts with `exp://`.

Start `pnpm dev:worker` as well when testing a low-coverage Story that does not have context or
claims yet. Opening its detail screen admits that optional enrichment at interactive priority; the
shared Story query polls briefly and updates the screen when the exact summary version is ready.
Previously generated Stories can still be read with the worker stopped.

The Local tab uses the location saved in Account, or the API's connection-country fallback when
available. Narratives remain accessible from Latest. Briefing is available from For You; opening it
updates the same last-opened checkpoint used by web.

Audio briefing is an on-demand prototype. Configure the server's local inference and speech service
as described in the root `AGENTS.md`. Android requests the complete audio response, so it shows a
single preparation state rather than the web's streamed stages. Playback uses a temporary cache file,
removed when the Briefing screen closes; it is not designed for background playback. The new
`expo-audio` and `expo-file-system` native modules require rebuilding existing development/preview
clients before testing. Expo Go can also be used where its bundled SDK supports them.
Run the mobile unit tests with `pnpm --filter @dn/mobile test`.

Expo Go supports username/password sign-in. Google sign-in needs a custom development build because it
uses native Google Play services. A development build sets `APP_VARIANT=development` to allow a LAN
`http://` API; production builds require HTTPS and intentionally do not enable cleartext transport.

## For You alerts

The Account screen registers this device's Expo push token for **For You** alerts. The server sends the
notifications through Expo/FCM, and the app opens the named Story when the reader taps one. The Account
screen confirms that the server has the device registration.

## Local Preview APK

Use the production-style Preview APK for native Google sign-in and push-notification testing:

1. In `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL` to your HTTPS API origin and
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

The app scheme is `dominonews`, matching `EXPO_APP_SCHEME` on the server. Android uses the permanent
application ID `dev.ndo.dominonews`. An iOS bundle identifier has not been chosen yet.
