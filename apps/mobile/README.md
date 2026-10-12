# Domino News mobile

Expo Router application for iOS and Android. It consumes the same typed API client, Query options,
domain formatting utilities and design tokens as the web app.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the LAN URL printed by
   `pnpm dev --host`.
2. Start the web/API server with `NODE_ENV=development pnpm dev --host`.
3. Start Expo with `pnpm --filter @dn/mobile start`.

Expo Go supports username/password sign-in. Google sign-in needs a custom development build because it
uses native Google Play services. A development build sets `APP_VARIANT=development` to allow a LAN
`http://` API; production builds require HTTPS and intentionally do not enable cleartext transport.

## For You alerts

The Account screen can enable local background alerts for new stories in **For You**. The installed app
periodically refreshes the authenticated feed when Android or iOS grants it a background window, then
shows a local notification for a newly surfaced story. This is best-effort: the OS controls the cadence
(15 minutes is the requested minimum) and force-quitting the app stops it. Tapping the notification opens
the story.

These are not server-originated remote push notifications yet. That requires an Expo/FCM project plus a
server-side device registration and delivery worker, which the API does not currently provide.

## Android development build

1. Create an EAS project with `pnpx eas-cli@latest init`.
2. Build an installable APK with `pnpx eas-cli@latest build --platform android --profile development`.
3. Install the APK from EAS, then run `pnpm --filter @dn/mobile start:dev-client` and open Domino News.

The EAS signing key has its own SHA-1 fingerprint. Add it as another Android OAuth client for
`dev.ndo.dominonews` before testing Google sign-in.

No Metro configuration is required with Expo SDK 57: its monorepo resolver discovers the workspace
root and preserves package exports. If that changes, start with `pnpm --filter @dn/mobile start --clear`.
`expo install --check` currently identifies newer SDK 57 patch releases, but they are intentionally
not installable until they pass the workspace's seven-day minimum release age.

The app scheme is `dominonews`, matching `EXPO_APP_SCHEME` on the server. Android uses the permanent
application ID `dev.ndo.dominonews`. An iOS bundle identifier has not been chosen yet.
