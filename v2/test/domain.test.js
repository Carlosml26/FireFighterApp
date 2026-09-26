import assert from "node:assert/strict";
import test from "node:test";

import {
  AssignmentStatuses,
  DomainError,
  EmergencyCore,
  IncidentStatuses,
  Roles,
  UnitStatuses,
} from "../src/domain.js";

const dispatcher = Object.freeze({
  id: "user_dispatch",
  role: Roles.DISPATCHER,
});
const auditor = Object.freeze({ id: "user_audit", role: Roles.AUDITOR });

function harness() {
  let tick = 0;
  let id = 0;
  return {
    core: new EmergencyCore({
      clock: () => new Date(Date.UTC(2026, 7, 12, 10, 0, tick++)),
      idFactory: (prefix) => `${prefix}_${++id}`,
    }),
    capturedAt: "2026-08-12T10:00:00.000Z",
  };
}

function prepareAssignment(core, capturedAt) {
  const unit = core.registerUnit(
    dispatcher,
    { name: "Pump crew one", callSign: "B-01", capabilities: ["pump"] },
    "unit-1",
  );
  const incident = core.createIncident(
    dispatcher,
    {
      title: "Warehouse alarm",
      priority: "high",
      description: "Smoke reported from loading area.",
      location: {
        latitude: 36.7213,
        longitude: -4.4214,
        accuracyMeters: 12,
        capturedAt,
      },
      hazards: ["unknown chemicals"],
    },
    "incident-1",
  );
  const assignment = core.assignUnit(
    dispatcher,
    { incidentId: incident.id, unitId: unit.id },
    "assignment-1",
  );
  return { unit, incident, assignment };
}

test("runs the authoritative incident-to-clear lifecycle and audits every command", () => {
  const { core, capturedAt } = harness();
  const { unit, incident, assignment } = prepareAssignment(core, capturedAt);
  const crew = { id: "user_crew", role: Roles.CREW_LEADER, unitId: unit.id };

  const acknowledged = core.respondToAssignment(
    crew,
    { assignmentId: assignment.id, decision: "acknowledge" },
    "response-1",
  );
  assert.equal(acknowledged.status, AssignmentStatuses.ACKNOWLEDGED);

  const location = core.recordLocation(
    crew,
    {
      unitId: unit.id,
      position: {
        latitude: 36.722,
        longitude: -4.42,
        accuracyMeters: 8,
        capturedAt: "2026-08-12T10:00:05.000Z",
      },
      source: "rugged_tablet_gnss",
    },
    "location-1",
  );
  assert.equal(location.unitId, unit.id);

  core.updateUnitStatus(
    crew,
    { unitId: unit.id, status: UnitStatuses.EN_ROUTE },
    "status-1",
  );
  core.updateUnitStatus(
    crew,
    { unitId: unit.id, status: UnitStatuses.ON_SCENE },
    "status-2",
  );
  const available = core.updateUnitStatus(
    crew,
    { unitId: unit.id, status: UnitStatuses.AVAILABLE },
    "status-3",
  );
  assert.equal(available.activeAssignmentId, null);
  assert.deepEqual(
    core.updateUnitStatus(
      crew,
      { unitId: unit.id, status: UnitStatuses.AVAILABLE },
      "status-3",
    ),
    available,
  );

  const closed = core.closeIncident(
    dispatcher,
    {
      incidentId: incident.id,
      reason: "Exercise complete and units released.",
    },
    "close-1",
  );
  assert.equal(closed.status, IncidentStatuses.CLOSED);

  const snapshot = core.snapshot(dispatcher);
  assert.equal(snapshot.assignments[0].status, AssignmentStatuses.CLEARED);
  assert.equal(snapshot.locations[0].freshness, "fresh");
  assert.deepEqual(
    core.auditLog(auditor).map(({ sequence, type }) => ({ sequence, type })),
    [
      { sequence: 1, type: "unit.registered" },
      { sequence: 2, type: "incident.created" },
      { sequence: 3, type: "unit.assigned" },
      { sequence: 4, type: "assignment.acknowledged" },
      { sequence: 5, type: "unit.location_recorded" },
      { sequence: 6, type: "unit.status_changed" },
      { sequence: 7, type: "unit.status_changed" },
      { sequence: 8, type: "unit.status_changed" },
      { sequence: 9, type: "assignment.cleared" },
      { sequence: 10, type: "incident.closed" },
    ],
  );
});

test("idempotent retries do not duplicate units or audit events", () => {
  const { core } = harness();
  const input = { name: "Ladder crew", callSign: "E-02" };
  const first = core.registerUnit(dispatcher, input, "retry-key");
  const retry = core.registerUnit(dispatcher, input, "retry-key");

  assert.deepEqual(retry, first);
  assert.equal(core.snapshot(dispatcher).units.length, 1);
  assert.equal(core.auditLog(auditor).length, 1);

  assert.throws(
    () =>
      core.registerUnit(
        dispatcher,
        { ...input, callSign: "E-03" },
        "retry-key",
      ),
    (error) =>
      error instanceof DomainError && error.code === "idempotency_conflict",
  );
});

test("scopes idempotency keys unambiguously and authorizes before replay", () => {
  const { core, capturedAt } = harness();
  const sensitiveInput = {
    title: "Sensitive incident",
    priority: "high",
    location: {
      latitude: 36.72,
      longitude: -4.42,
      accuracyMeters: 10,
      capturedAt,
    },
  };
  core.createIncident(
    { id: "crew:lead", role: Roles.DISPATCHER },
    sensitiveInput,
    "retry-key",
  );

  assert.throws(
    () =>
      core.createIncident(
        { id: "crew", role: Roles.CREW_LEADER, unitId: "unit-unknown" },
        sensitiveInput,
        "lead:retry-key",
      ),
    (error) => error instanceof DomainError && error.code === "forbidden",
  );
  assert.equal(core.snapshot(dispatcher).incidents.length, 1);

  const firstAuthorized = core.createIncident(
    { id: "dispatcher:second", role: Roles.DISPATCHER },
    { ...sensitiveInput, title: "Delimiter test one" },
    "shared-key",
  );
  const secondAuthorized = core.createIncident(
    { id: "dispatcher", role: Roles.DISPATCHER },
    { ...sensitiveInput, title: "Delimiter test one" },
    "second:shared-key",
  );
  assert.notEqual(firstAuthorized.id, secondAuthorized.id);
});

test("prevents a crew from acting for another unit", () => {
  const { core, capturedAt } = harness();
  const { assignment } = prepareAssignment(core, capturedAt);
  const impostor = {
    id: "user_other_crew",
    role: Roles.CREW_LEADER,
    unitId: "unit_not_assigned",
  };

  assert.throws(
    () =>
      core.respondToAssignment(
        impostor,
        { assignmentId: assignment.id, decision: "acknowledge" },
        "bad-response",
      ),
    (error) => error instanceof DomainError && error.code === "forbidden",
  );
  assert.equal(core.auditLog(auditor).length, 3);
});

test("crew state is scoped to its own unit and assigned incidents", () => {
  const { core, capturedAt } = harness();
  const { unit, incident } = prepareAssignment(core, capturedAt);
  const otherUnit = core.registerUnit(
    dispatcher,
    { name: "Unrelated ladder crew", callSign: "E-09" },
    "other-unit",
  );
  const crew = { id: "user_crew", role: Roles.CREW_LEADER, unitId: unit.id };

  const state = core.snapshot(crew);
  assert.deepEqual(
    state.units.map(({ id }) => id),
    [unit.id],
  );
  assert.deepEqual(
    state.incidents.map(({ id }) => id),
    [incident.id],
  );
  assert.equal(state.assignments.length, 1);
  assert.ok(!state.units.some(({ id }) => id === otherUnit.id));

  assert.throws(
    () => core.snapshot({ id: "crew_without_unit", role: Roles.CREW_LEADER }),
    (error) => error instanceof DomainError && error.code === "forbidden",
  );
});

test("requires acknowledgement before en-route and clearing before closure", () => {
  const { core, capturedAt } = harness();
  const { unit, incident, assignment } = prepareAssignment(core, capturedAt);
  const crew = { id: "user_crew", role: Roles.CREW_LEADER, unitId: unit.id };

  assert.throws(
    () =>
      core.updateUnitStatus(
        crew,
        { unitId: unit.id, status: UnitStatuses.EN_ROUTE },
        "too-soon",
      ),
    (error) => error instanceof DomainError && error.code === "conflict",
  );
  assert.throws(
    () =>
      core.closeIncident(
        dispatcher,
        { incidentId: incident.id, reason: "Done" },
        "early-close",
      ),
    (error) => error instanceof DomainError && error.code === "conflict",
  );

  core.respondToAssignment(
    crew,
    {
      assignmentId: assignment.id,
      decision: "reject",
      reason: "Mechanical failure.",
    },
    "reject-1",
  );
  assert.equal(
    core.snapshot(dispatcher).units[0].status,
    UnitStatuses.AVAILABLE,
  );
  assert.equal(
    core.closeIncident(
      dispatcher,
      {
        incidentId: incident.id,
        reason: "No response required after verification.",
      },
      "close-after-reject",
    ).status,
    IncidentStatuses.CLOSED,
  );
});

test("does not let unavailable status bypass assignment response or completion", () => {
  const { core, capturedAt } = harness();
  const { unit, assignment } = prepareAssignment(core, capturedAt);
  const crew = { id: "user_crew", role: Roles.CREW_LEADER, unitId: unit.id };

  assert.throws(
    () =>
      core.updateUnitStatus(
        crew,
        { unitId: unit.id, status: UnitStatuses.UNAVAILABLE },
        "pending-unavailable",
      ),
    (error) => error instanceof DomainError && error.code === "conflict",
  );
  core.respondToAssignment(
    crew,
    { assignmentId: assignment.id, decision: "acknowledge" },
    "acknowledge",
  );
  assert.throws(
    () =>
      core.updateUnitStatus(
        crew,
        { unitId: unit.id, status: UnitStatuses.UNAVAILABLE },
        "acknowledged-unavailable",
      ),
    (error) => error instanceof DomainError && error.code === "conflict",
  );
  assert.equal(
    core.snapshot(dispatcher).assignments[0].status,
    AssignmentStatuses.ACKNOWLEDGED,
  );
});

test("lets dispatch cancel an active assignment and releases the unit", () => {
  const { core, capturedAt } = harness();
  const { incident, assignment } = prepareAssignment(core, capturedAt);

  const cancelled = core.cancelAssignment(
    dispatcher,
    {
      assignmentId: assignment.id,
      reason: "Unit recalled for a higher priority response.",
    },
    "cancel-1",
  );
  assert.equal(cancelled.status, AssignmentStatuses.CANCELLED);
  const state = core.snapshot(dispatcher);
  assert.equal(state.units[0].status, UnitStatuses.AVAILABLE);
  assert.equal(state.units[0].activeAssignmentId, null);
  const formerCrewState = core.snapshot({
    id: "former_crew",
    role: Roles.CREW_LEADER,
    unitId: state.units[0].id,
  });
  assert.equal(formerCrewState.assignments.length, 0);
  assert.equal(formerCrewState.incidents.length, 0);
  assert.equal(
    core.closeIncident(
      dispatcher,
      { incidentId: incident.id, reason: "Response no longer required." },
      "close-cancelled",
    ).status,
    IncidentStatuses.CLOSED,
  );
  assert.ok(
    core.auditLog(auditor).some(({ type }) => type === "assignment.cancelled"),
  );
});

test("rejects invalid, stale, future, and non-monotonic positions", () => {
  const { core, capturedAt } = harness();
  const unit = core.registerUnit(
    dispatcher,
    { name: "Rescue", callSign: "R-01" },
    "unit-1",
  );
  const crew = { id: "user_crew", role: Roles.CREW_LEADER, unitId: unit.id };

  const base = {
    unitId: unit.id,
    position: {
      latitude: 36.72,
      longitude: -4.42,
      accuracyMeters: 5,
      capturedAt,
    },
  };
  core.recordLocation(crew, base, "location-1");

  assert.throws(
    () => core.recordLocation(crew, base, "location-duplicate"),
    (error) => error instanceof DomainError && error.code === "stale_location",
  );
  assert.throws(
    () =>
      core.recordLocation(
        crew,
        { ...base, position: { ...base.position, latitude: 91 } },
        "location-invalid",
      ),
    (error) =>
      error instanceof DomainError && error.code === "validation_error",
  );
  assert.throws(
    () =>
      core.recordLocation(
        crew,
        {
          ...base,
          position: { ...base.position, capturedAt: 1_786_530_000_000 },
        },
        "location-numeric-timestamp",
      ),
    (error) =>
      error instanceof DomainError && error.code === "validation_error",
  );
  assert.throws(
    () =>
      core.recordLocation(
        crew,
        {
          ...base,
          position: {
            ...base.position,
            capturedAt: "2026-08-12T10:01:00.000Z",
          },
        },
        "location-future",
      ),
    (error) =>
      error instanceof DomainError && error.code === "validation_error",
  );
  assert.throws(
    () =>
      core.recordLocation(
        crew,
        {
          ...base,
          position: {
            ...base.position,
            latitude: -89,
            longitude: 170,
            capturedAt: "2026-08-12T10:00:01.000Z",
          },
        },
        "location-implausible",
      ),
    (error) =>
      error instanceof DomainError && error.code === "implausible_location",
  );
});
