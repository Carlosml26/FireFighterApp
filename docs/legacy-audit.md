# Legacy audit

Audit date: 2026-08-12
Audited revision: `de94bf6` (`master` before modernization)

## Decision

The legacy application is **not release-ready and must not be exposed to a
public or operational network**. It is useful as a product specification and
historical prototype, but its identity, authorization, state, communications,
dependency, and recovery assumptions require a clean replacement.

The repository history starts on 2020-01-30 and the last merged change on
`master` is dated 2020-02-02. The Node 8, AngularJS, LoopBack 3, Bower, and
MongoDB 3.6 stack is consistent with code written in the late 2010s, but the
repository alone does not prove a ten-year history.

## What is actually implemented

### Evidenced behavior

- An administrator can create an incident, place it on a Málaga-centered map,
  assign teams, set priority and free-text topology, and close it.
- A field-team browser publishes geolocation and displays team and incident
  markers.
- A WebSocket server tracks connected names, positions, and incident membership
  in process memory and forwards WebRTC offers, answers, and ICE candidates.
- WebRTC data channels carry text and recorded WAV voice notes between peers.
- MongoDB stores three flat models: `Admin`, `Equipo`, and `Incidencia`.
- The administration UI can edit administrators and teams and view historical
  incidents.

### Not implemented or only partial

- `Equipo` conflates a crew, operational unit, vehicle, and device. Trucks are
  not distinct records.
- There is no point-to-point road routing, ETA, navigation, hydrant layer,
  building plan, or route optimization.
- WebRTC media is not live radio. It sends text and recorded audio blobs.
- Peer communication still requires the signaling server and only configures a
  public STUN service; there is no TURN fallback or infrastructure-independent
  vehicle mesh.
- Messages, acknowledgements, presence, position history, and voice notes are
  not durably stored.
- There is no test suite, CI, deployment configuration, observability,
  backup/restore procedure, or operational runbook.

The request's “baby” feature is ambiguous. It may be speech-to-text for Spanish
“BBDD” (database), but could mean beacon, body camera, API, or Mayday behavior.
It remains a discovery question rather than an assumed requirement.

## Vulnerability GHSA-mh99-v99m-4gvg

Before remediation, `serverDB/package-lock.json` pinned `brace-expansion`
1.1.8. It was brought in by `minimatch` 3.0.4, which is used by several legacy
framework/build packages. Version 1.1.8 is affected by
GHSA-mh99-v99m-4gvg / CVE-2026-14257, a high
severity uncontrolled-resource-consumption issue. Crafted brace patterns can
exhaust the Node.js heap and terminate the process.

No application route was found that deliberately accepts a user-supplied glob
or calls `brace-expansion`, `minimatch`, or `glob`. Remote reachability through
the application's normal incident/chat inputs is therefore **not evidenced**.
The legacy Juggler version's relevant in-memory key/value matching path also
uses `minimatch` with brace processing disabled, while this app selects MongoDB.
The vulnerable package is nevertheless present in the production lock graph,
and the obsolete stack contains much more serious exploitable surface.

A 2026-08-12 `npm audit --package-lock-only --omit=dev --ignore-scripts` result:

| Severity | Count |
| --- | ---: |
| Critical | 32 |
| High | 36 |
| Moderate | 15 |
| Low | 7 |
| Total | 90 |

The complete lockfile (including development dependencies) reports 97
vulnerabilities. Direct production packages reported as vulnerable include
LoopBack, LoopBack Boot, LoopBack Component Explorer, the MongoDB connector,
Helmet, compression, and strong-error-handler.

A one-package override would be misleading. The later
GHSA-rgw5-rvv9-x895 / CVE-2026-69152 bypass means the fully patched 1.x release
is 1.1.18, not merely the 1.1.17 fix named by the original alert. Even after
that update, the end-of-life runtime would retain dozens of critical/high
findings. The remediation is to keep the old server offline and replace it.

The targeted repository patch pins `brace-expansion` 1.1.18 and its immediate
parent `minimatch` 3.1.5, with npm overrides so future supported npm installs
retain those patched lines. A post-change npm audit no longer lists
`brace-expansion`, `minimatch`, or the reported GHSA.
That does **not** make the legacy runtime safe: the refreshed production audit
still reports 88 other vulnerable packages (32 critical, 35 high, 14 moderate,
and 7 low), reflecting the unsupported framework graph and current advisory
data.

## Critical application findings

### 1. Authentication and authorization are ineffective

- `Admin` and `Equipo` passwords are normal strings returned by the public REST
  API and compared in browser JavaScript.
- `Admin`, `Equipo`, and `Incidencia` are public models with empty ACL lists.
- Any network client can read or mutate operational and credential records
  without a trusted server-side authorization decision.

### 2. Signaling trusts unauthenticated clients

- Clients connect to `ws://localhost:9090` without TLS or a session token.
- The server accepts a self-asserted name, role-like login type, coordinates,
  assignments, and signaling messages.
- Any connected party can spoof a unit or dispatcher, broadcast false
  locations, create/delete incident state, or redirect signaling.
- Deleting an unknown incident dereferences missing in-memory state and can
  crash the signaling process before authentication (which does not exist).

### 3. Operational state is volatile and globally broadcast

- Users, positions, incident membership, and the current dispatcher live only
  in JavaScript objects/maps. Restarting the signal server loses them.
- A single global `admin` value is overwritten by the last administrator login.
- Every location update is sent to every connected user, regardless of incident
  membership or role.

### 4. Assignment state can diverge

The database incident stores the union of teams selected from the map and list,
but signaling notifications and some `incidenciaActual` updates use only the
list selection. A team can appear assigned in persistent data without receiving
the dispatch notification.

### 5. No delivery or recovery contract

There are no assignment acknowledgements, message receipts, sequence numbers,
idempotency keys, reconnect synchronization, offline queues, background
notifications, or authoritative event history. Silence is indistinguishable
from success in several safety-relevant paths.

### 6. Credential and browser supply-chain exposure

- A Google Maps browser key is committed in both HTML clients. It must be
  revoked/rotated and any replacement restricted by application and API.
- AngularJS, jQuery 1.12, Bootstrap 3, and other assets are loaded from external
  CDNs by an application that would handle operational data.
- CORS reflects arbitrary origins while allowing credentials, HSTS is
  effectively disabled, and the API explorer is enabled.
- Peer-controlled chat content is inserted as HTML, enabling DOM cross-site
  scripting in both operational clients.

### 7. A clean clone is not reproducibly runnable

- The signal server imports `ws` but has no package manifest or lockfile.
- Both HTML clients reference an untracked `client/lib/` Bower tree and another
  missing stylesheet.
- There is no default application route, automated test script, test file, CI
  workflow, environment example, container, or release configuration.
- Installing with a current npm resolves the patched override, but the legacy
  `npm run lint` still fails because the committed ESLint configuration is named
  `_eslintrc` rather than a recognized `.eslintrc`. This confirms that the old
  package is not a clean-clone-supported release, even after dependency
  resolution.

## Release-readiness result

**Not ready.** Releasing the legacy application is blocked by ineffective auth,
public data models, unauthenticated signaling, volatile state, unencrypted
transport, secret exposure, unsupported frameworks, extensive known
vulnerabilities, missing tests, and missing operational controls.

## Immediate containment

1. Keep both legacy servers stopped and network-inaccessible.
2. Revoke/rotate the committed Google Maps key in its provider console; a code
   deletion cannot erase Git history or revoke the credential.
3. Do not place real personnel, incident, or location data in the prototype.
4. Preserve the code and any historical database export read-only for a later,
   reviewed migration.
5. Develop and pilot V2 alongside it; do not incrementally expose the old API.
