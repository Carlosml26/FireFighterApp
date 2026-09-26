> **Documento archivado.** Describe el primer núcleo V2. Para ejecutar la
> aplicación actual y su persistencia SQLite, consulta el [README vigente](../README.md).

# FireFighterApp V2 reference core

This directory is the first executable modernization slice. It is deliberately
bounded but not a deployment claim: it defines and verifies the safety-relevant
domain contract and provides a dependency-free operations UI before a database,
identity provider, or real-time gateway is selected.

## Included

- Development identity claims and server-enforced role checks
- Incident validation and lifecycle
- Explicit unit availability, assignment acknowledgement, and dispatch recall
- Timestamped, accuracy-aware locations with stale and implausible-jump rejection
- Same-process idempotent command replay
- Append-only audit events
- Node's built-in HTTP adapter and test runner
- Responsive dispatcher, field-unit, and audit views
- Network-only operational data with an offline-cacheable application shell
- Zero third-party runtime dependencies

## Run

Use Node.js 24 LTS or newer:

```sh
npm install
npm test
npm run check
npm audit --omit=dev
npm start
```

The HTTP server listens on `127.0.0.1:3000` by default. It intentionally binds
to loopback and uses a development-only identity adapter. Example:

```sh
curl -s http://127.0.0.1:3000/health
```

Open `http://127.0.0.1:3000/` for the reference operations console.

State is in memory and there is no production authentication adapter yet. Do
not expose this reference server to a network or use it for live incidents.
The entry point refuses non-loopback `HOST` values. Its idempotency records,
like all operational state, are lost when the process restarts.

OpenAPI documentation for the reference contract is in [`openapi.yaml`](../openapi.yaml).

## Next implementation gate

Replace the in-memory repository with PostgreSQL/PostGIS transactions and an
outbox, and replace development headers with verified OIDC/device claims. Keep
the domain tests as the invariant suite for those adapters.
