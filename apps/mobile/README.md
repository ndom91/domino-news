# Domino Wire mobile

Expo Router Android application. It consumes the same typed API client, Query options, domain formatting
utilities and design tokens as the web app. iOS is deferred until its bundle identifier and native Google
sign-in configuration are chosen.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the LAN URL printed by
   `pnpm dev --host`.
2. Start the web/API server with `NODE_ENV=development pnpm dev --host`.
3. Start Expo Go with `pnpm --filter @dn/mobile start`. Its QR code starts with `exp://`.

Expo Go supports username/password sign-in. Google sign-in needs a custom development build because it
uses native Google Play services. A development build sets `APP_VARIANT=development` to allow a LAN
`http://` API; production builds require HTTPS and intentionally do not enable cleartext transport.

## For You alerts

The Account screen registers this device's Expo push token for **For You** alerts. The app is configured for
FCM, receives notification taps and opens the named Story. Server-side delivery is required before enrolled
devices receive remote alerts.

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

No Metro configuration is required with Expo SDK 57: its monorepo resolver discovers the workspace
root and preserves package exports. If that changes, start with `pnpm --filter @dn/mobile start --clear`.
`expo install --check` currently identifies newer SDK 57 patch releases, but they are intentionally
not installable until they pass the workspace's seven-day minimum release age.

The app scheme is `dominonews`, matching `EXPO_APP_SCHEME` on the server. Android uses the permanent
application ID `dev.ndo.dominonews`. An iOS bundle identifier has not been chosen yet.
