import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DomainError, EmergencyCore } from "./domain.js";
import { SqliteRepository } from "./repository.js";
import { SignalingHub } from "./signaling.js";
import { seedTraining } from "./training.js";

const MAX_BODY_BYTES = 32 * 1024;
const PUBLIC_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
);
const STATIC_FILES = Object.freeze({
  "/": ["console/index.html", "text/html; charset=utf-8"],
  "/reference": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/icon.svg": ["icon.svg", "image/svg+xml"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/manifest.webmanifest": [
    "manifest.webmanifest",
    "application/manifest+json",
  ],
  "/sw.js": ["sw.js", "text/javascript; charset=utf-8"],
});
const CONSOLE_FILES = [
  "app.js",
  "api.js",
  "map.js",
  "radio.js",
  "ui.js",
  "styles.css",
];
const ALL_STATIC_FILES = {
  ...STATIC_FILES,
  ...Object.fromEntries(
    CONSOLE_FILES.map((file) => [
      `/console/${file}`,
      [
        `console/${file}`,
        file.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "text/javascript; charset=utf-8",
      ],
    ]),
  ),
  "/vendor/leaflet.js": [
    "../node_modules/leaflet/dist/leaflet.js",
    "text/javascript; charset=utf-8",
  ],
  "/vendor/leaflet.css": [
    "../node_modules/leaflet/dist/leaflet.css",
    "text/css; charset=utf-8",
  ],
};

export function createEmergencyServer({
  core = new EmergencyCore(),
  repository = null,
  training = false,
} = {}) {
  const hub = new SignalingHub(core);
  return createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https://tile.openstreetmap.org; media-src 'self' blob:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'",
    );
    response.setHeader(
      "permissions-policy",
      "camera=(), geolocation=(self), microphone=(self)",
    );

    try {
      enforceLoopbackRequest(request.headers);
      const url = new URL(request.url, "http://localhost");
      const staticFile = ALL_STATIC_FILES[url.pathname];
      if (request.method === "GET" && staticFile) {
        const [fileName, contentType] = staticFile;
        const content = await readFile(join(PUBLIC_DIRECTORY, fileName));
        response.statusCode = 200;
        response.setHeader("content-type", contentType);
        response.setHeader("cache-control", "no-cache");
        return response.end(content);
      }
      if (request.method === "GET" && url.pathname === "/health") {
        return send(response, 200, { status: "ok" });
      }

      if (request.method === "GET" && url.pathname === "/v1/local-context") {
        const units = core
          .snapshot({ id: "local-profile-directory", role: "system_admin" })
          .units.map(({ id, callSign, name }) => ({ id, callSign, name }));
        return send(response, 200, {
          mode: "local-development",
          persistent: Boolean(repository),
          training,
          units,
        });
      }

      const actor = actorFromDevelopmentHeaders(request.headers);
      if (request.method === "GET" && url.pathname === "/v1/peers") {
        return send(
          response,
          200,
          hub.poll(
            actor,
            url.searchParams.get("peerId"),
            request.headers["x-peer-token"],
            Number(url.searchParams.get("after") || 0),
          ),
        );
      }
      if (
        request.method === "POST" &&
        ["/v1/peers", "/v1/signals", "/v1/peer-leave"].includes(url.pathname)
      ) {
        const input = await readJsonBody(request);
        const result =
          url.pathname === "/v1/peers"
            ? hub.join(actor, input)
            : url.pathname === "/v1/signals"
              ? hub.signal(actor, input, request.headers["x-peer-token"])
              : hub.leave(actor, input.peerId, request.headers["x-peer-token"]);
        return send(response, 200, result);
      }
      if (request.method === "GET" && url.pathname === "/v1/state") {
        return send(response, 200, core.snapshot(actor));
      }
      if (request.method === "GET" && url.pathname === "/v1/audit-events") {
        return send(response, 200, { events: core.auditLog(actor) });
      }

      const routes = {
        "POST /v1/units": () => core.registerUnit(actor, body, idempotencyKey),
        "POST /v1/unit-details": () =>
          core.updateUnit(actor, body, idempotencyKey),
        "POST /v1/incidents": () =>
          core.createIncident(actor, body, idempotencyKey),
        "POST /v1/assignments": () =>
          core.assignUnit(actor, body, idempotencyKey),
        "POST /v1/assignment-cancellations": () =>
          core.cancelAssignment(actor, body, idempotencyKey),
        "POST /v1/assignment-responses": () =>
          core.respondToAssignment(actor, body, idempotencyKey),
        "POST /v1/unit-status": () =>
          core.updateUnitStatus(actor, body, idempotencyKey),
        "POST /v1/locations": () =>
          core.recordLocation(actor, body, idempotencyKey),
        "POST /v1/incident-closures": () =>
          core.closeIncident(actor, body, idempotencyKey),
      };
      const operation = routes[`${request.method} ${url.pathname}`];
      if (!operation) {
        return send(response, 404, {
          error: { code: "not_found", message: "Route not found." },
        });
      }
      const body = await readJsonBody(request);
      const idempotencyKey = request.headers["idempotency-key"];
      return send(
        response,
        201,
        repository ? repository.execute(core, operation) : operation(),
      );
    } catch (error) {
      if (error instanceof DomainError) {
        return send(response, error.status, {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
      }
      if (error?.code === "invalid_json" || error?.code === "body_too_large") {
        return send(response, error.status, {
          error: { code: error.code, message: error.message },
        });
      }
      console.error(error);
      return send(response, 500, {
        error: { code: "internal_error", message: "Unexpected server error." },
      });
    }
  });
}

function enforceLoopbackRequest(headers) {
  const authority = parseLoopbackAuthority(headers.host);
  if (!authority) {
    throw new DomainError(
      "forbidden",
      "The reference server accepts only loopback Host values.",
      403,
    );
  }
  if (headers.origin) {
    let origin;
    try {
      origin = new URL(headers.origin);
    } catch {
      throw new DomainError("forbidden", "Request Origin is invalid.", 403);
    }
    if (
      origin.protocol !== "http:" ||
      !isLoopbackHostname(origin.hostname) ||
      origin.host.toLowerCase() !== authority.host.toLowerCase()
    ) {
      throw new DomainError(
        "forbidden",
        "Request Origin must match the loopback Host.",
        403,
      );
    }
  }
}

function parseLoopbackAuthority(authority) {
  if (typeof authority !== "string" || authority.length === 0) return false;
  try {
    const parsed = new URL(`http://${authority}`);
    return isLoopbackHostname(parsed.hostname) ? parsed : null;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  return ["127.0.0.1", "::1", "[::1]", "localhost"].includes(
    hostname.toLowerCase(),
  );
}

function actorFromDevelopmentHeaders(headers) {
  const actor = {
    id: headers["x-actor-id"],
    role: headers["x-actor-role"],
  };
  if (headers["x-unit-id"]) actor.unitId = headers["x-unit-id"];
  return actor;
}

async function readJsonBody(request) {
  if (!["POST", "PUT", "PATCH"].includes(request.method)) return {};
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
      error.code = "body_too_large";
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    const raw = Buffer.concat(chunks).toString("utf8");
    const value = raw.length === 0 ? {} : JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      const error = new Error("Request body must be a JSON object.");
      error.code = "invalid_json";
      error.status = 400;
      throw error;
    }
    return value;
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.code = "invalid_json";
    error.status = 400;
    throw error;
  }
}

function send(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

const isEntryPoint =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntryPoint) {
  const port = Number.parseInt(process.env.PORT ?? "4318", 10);
  const host = process.env.HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "localhost"].includes(host)) {
    throw new Error("The reference server only permits loopback HOST values.");
  }
  const core = new EmergencyCore();
  const repository = new SqliteRepository(
    process.env.DB_PATH ??
      join(PUBLIC_DIRECTORY, "..", "data", "brigada.sqlite"),
  );
  repository.load(core);
  const training = process.env.TRAINING !== "0";
  if (training) repository.execute(core, () => seedTraining(core));
  const server = createEmergencyServer({ core, repository, training });
  server.listen(port, host, () => {
    console.log(`Brigada Málaga · local development · http://${host}:${port}`);
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      server.close(() => {
        repository.close();
        process.exit(0);
      });
      server.closeIdleConnections();
    });
}
