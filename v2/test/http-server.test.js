import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createEmergencyServer } from "../src/http-server.js";

test("serves the shell and enforces development identity claims", async (t) => {
  const server = createEmergencyServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });

  const application = await fetch(baseUrl);
  assert.equal(application.status, 200);
  assert.match(application.headers.get("content-type"), /^text\/html/);
  assert.match(
    application.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.match(await application.text(), /Brigada Málaga · Centro de mando/);

  const installableShell = await Promise.all([
    fetch(`${baseUrl}/index.html`),
    fetch(`${baseUrl}/icon.svg`),
    fetch(`${baseUrl}/manifest.webmanifest`),
    fetch(`${baseUrl}/sw.js`),
  ]);
  assert.deepEqual(
    installableShell.map(({ status }) => status),
    [200, 200, 200, 200],
  );
  assert.match(
    installableShell[1].headers.get("content-type"),
    /^image\/svg\+xml/,
  );

  const unauthenticated = await fetch(`${baseUrl}/v1/state`);
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "unauthenticated");

  const rebindingAttempt = await fetch(`${baseUrl}/v1/units`, {
    method: "POST",
    headers: {
      host: `attacker.example:${port}`,
      origin: "https://attacker.example",
      "content-type": "application/json",
      "idempotency-key": "rebinding-attempt",
      "x-actor-id": "forged-dispatcher",
      "x-actor-role": "dispatcher",
    },
    body: JSON.stringify({ name: "Spoofed unit", callSign: "BAD-01" }),
  });
  assert.equal(rebindingAttempt.status, 403);
  assert.equal((await rebindingAttempt.json()).error.code, "forbidden");

  const nullBody = await fetch(`${baseUrl}/v1/units`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "null-body",
      "x-actor-id": "dispatcher-1",
      "x-actor-role": "dispatcher",
    },
    body: "null",
  });
  assert.equal(nullBody.status, 400);
  assert.equal((await nullBody.json()).error.code, "invalid_json");

  const differentLoopbackOrigin = await fetch(`${baseUrl}/v1/units`, {
    method: "POST",
    headers: {
      origin: `http://127.0.0.1:${port + 1}`,
      "content-type": "application/json",
      "idempotency-key": "cross-origin-attempt",
      "x-actor-id": "forged-dispatcher",
      "x-actor-role": "dispatcher",
    },
    body: JSON.stringify({ name: "Cross-origin unit", callSign: "BAD-02" }),
  });
  assert.equal(differentLoopbackOrigin.status, 403);

  const created = await fetch(`${baseUrl}/v1/units`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "http-unit-1",
      "x-actor-id": "dispatcher-1",
      "x-actor-role": "dispatcher",
    },
    body: JSON.stringify({ name: "Pump crew", callSign: "B-01" }),
  });
  assert.equal(created.status, 201);
  const createdUnit = await created.json();
  assert.equal(createdUnit.callSign, "B-01");

  const commandHeaders = (key) => ({
    "content-type": "application/json",
    "idempotency-key": key,
    "x-actor-id": "dispatcher-1",
    "x-actor-role": "dispatcher",
  });
  const incidentResponse = await fetch(`${baseUrl}/v1/incidents`, {
    method: "POST",
    headers: commandHeaders("http-incident-1"),
    body: JSON.stringify({
      title: "HTTP exercise incident",
      priority: "high",
      location: {
        latitude: 36.7213,
        longitude: -4.4214,
        accuracyMeters: 20,
        capturedAt: new Date().toISOString(),
      },
    }),
  });
  assert.equal(incidentResponse.status, 201);
  const incident = await incidentResponse.json();

  const assignmentResponse = await fetch(`${baseUrl}/v1/assignments`, {
    method: "POST",
    headers: commandHeaders("http-assignment-1"),
    body: JSON.stringify({ incidentId: incident.id, unitId: createdUnit.id }),
  });
  assert.equal(assignmentResponse.status, 201);
  const assignment = await assignmentResponse.json();

  const cancellationResponse = await fetch(
    `${baseUrl}/v1/assignment-cancellations`,
    {
      method: "POST",
      headers: commandHeaders("http-cancellation-1"),
      body: JSON.stringify({
        assignmentId: assignment.id,
        reason: "Exercise recall.",
      }),
    },
  );
  assert.equal(cancellationResponse.status, 201);
  assert.equal((await cancellationResponse.json()).status, "cancelled");

  const state = await fetch(`${baseUrl}/v1/state`, {
    headers: { "x-actor-id": "dispatcher-1", "x-actor-role": "dispatcher" },
  });
  assert.equal(state.status, 200);
  const stateBody = await state.json();
  assert.equal(stateBody.units.length, 1);
  assert.equal(stateBody.units[0].status, "available");
  assert.equal(stateBody.assignments[0].status, "cancelled");
});
