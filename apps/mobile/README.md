# Domino News mobile

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

The Account screen can enable local background alerts for new stories in **For You**. The installed Android
app periodically refreshes the authenticated feed when Android grants it a background window, then shows a
local notification for a newly surfaced story. This is best-effort: the OS controls the cadence (15 minutes
is the requested minimum) and force-quitting the app stops it. Tapping the notification opens the story.

These are not server-originated remote push notifications yet. That requires an Expo/FCM project plus a
server-side device registration and delivery worker, which the API does not currently provide.

## Android development build

1. Sign in to the existing `@ndom91/domino-news` EAS project with `pnpx eas-cli@latest login`.
2. Build an installable APK with `pnpx eas-cli@latest build --platform android --profile development`.
3. Install the APK from EAS, then run `pnpm --filter @dn/mobile start:dev-client` and open Domino News.

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
