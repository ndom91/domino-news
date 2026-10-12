# Domino News mobile

Expo Router application for iOS and Android. It consumes the same typed API client, Query options,
domain formatting utilities and design tokens as the web app.

## Run locally

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL` to the LAN URL printed by
   `pnpm dev --host`.
2. Start the web/API server with `NODE_ENV=development pnpm dev --host`.
3. Start Expo with `pnpm --filter @dn/mobile start`.

Expo Go can use the development server. A custom development build must set `APP_VARIANT=development`
to allow a LAN `http://` API; production builds require HTTPS and intentionally do not enable cleartext
transport.

No Metro configuration is required with Expo SDK 57: its monorepo resolver discovers the workspace
root and preserves package exports. If that changes, start with `pnpm --filter @dn/mobile start --clear`.
`expo install --check` currently identifies newer SDK 57 patch releases, but they are intentionally
not installable until they pass the workspace's seven-day minimum release age.

The app scheme is `dominonews`, matching `EXPO_APP_SCHEME` on the server. Bundle identifiers are not
set yet, because they must be chosen before creating store builds and native passkey associations.
