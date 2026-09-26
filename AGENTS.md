# FireFighterApp working agreement

## Purpose

This repository contains two distinct generations of the product:

- `serverDB/` and `signalServer/` preserve the legacy prototype as historical evidence.
- `v2/` is the production-oriented replacement.

## Rules

- Do not deploy or extend the legacy runtime. Preserve it until V2 has explicit
  behavior-parity evidence and a reviewed data migration.
- Put new product behavior in `v2/`.
- Treat dispatch state as authoritative server state. Peer-to-peer transports
  may optimize communication, but they must never be the only record.
- Require authenticated identity, role-based authorization, durable audit
  events, timestamps, and idempotency for operational state changes.
- Never commit credentials, map keys, device secrets, or production incident
  data.
- Keep emergency-radio and existing dispatch procedures as the operational
  fallback until a formally approved field pilot says otherwise.

## Verification

Run the V2 checks from `v2/`:

```sh
npm test
npm run check
npm audit --omit=dev
```
