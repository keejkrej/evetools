# Evechat mobile

The Expo app is a native client for the protected Evechat Next.js API. It signs
in through the same Clerk instance as the web app, stores the Clerk session in
the platform's encrypted Secure Store, and sends a fresh session token as a
Bearer token to `/api/health`, `/api/models`, and `/api/chat`.

## Configuration

Configure the web deployment first. `CLERK_SECRET_KEY`, `EVE_OWNER_USER_ID`,
`OPENAI_BASE_URL`, and `OPENAI_API_KEY` stay on that server and must never be placed in an
`EXPO_PUBLIC_*` variable.

The mobile bundle needs only public configuration:

```dotenv
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=https://chat.example.com
```

Keep these values in the selected EAS environment for preview/production
builds. For local development, copy this package's `.env.example` to
`apps/chat/mobile/.env.local`. Do not load the repository-root `.env` into
Expo: it also contains server-only credentials that the mobile toolchain does
not need.

Use the publishable key from the same Clerk application as Evechat web. In the
Clerk Dashboard, enable the Native API and register both native applications:

- iOS bundle identifier: `com.evechat.mobile`, together with the Apple Team ID
  used to sign the app
- Android package/namespace: `com.evechat.mobile`

For an owner-only deployment, disable public sign-ups in Clerk. The API still
enforces `EVE_OWNER_USER_ID` on every request, so a valid non-owner Clerk
session receives `403 Access denied`.

`EXPO_PUBLIC_API_URL` must be the URL the device itself can reach. On a physical
phone, `localhost` means the phone, not the computer running Next.js. Preview
and production builds require a deployed HTTPS URL. For local development
only, the app accepts the computer's LAN address (for example,
`http://192.168.1.25:3000`); ensure the development server and firewall allow
connections on that interface. Android 9+ may block cleartext HTTP depending
on the native build configuration, so an HTTPS development endpoint is more
reliable.

From the repository root:

```bash
pnpm dev:chat
pnpm dev:chat-mobile
```

After changing the bundle identifier, Android package, or Clerk plugin config,
rebuild the native app so the hosted-auth callback registration is updated.

As deployment hardening, consider setting Clerk's `authorizedParties` after
observing the legitimate `azp` values from both web and native sessions. Do not
guess the allowlist: an incomplete value would reject one of the two clients.

## Verification

```bash
pnpm --filter @evetools/chat-mobile test
pnpm --filter @evetools/chat-mobile typecheck
pnpm --filter @evetools/chat-mobile export:android
```
