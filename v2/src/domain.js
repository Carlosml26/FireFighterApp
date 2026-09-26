import { randomUUID } from "node:crypto";

export const Roles = Object.freeze({
  DISPATCHER: "dispatcher",
  INCIDENT_COMMANDER: "incident_commander",
  CREW_LEADER: "crew_leader",
  SYSTEM_ADMIN: "system_admin",
  AUDITOR: "auditor",
});

export const IncidentStatuses = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
});

export const AssignmentStatuses = Object.freeze({
  PENDING: "pending",
  ACKNOWLEDGED: "acknowledged",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  CLEARED: "cleared",
});

export const UnitStatuses = Object.freeze({
  AVAILABLE: "available",
  ASSIGNED: "assigned",
  EN_ROUTE: "en_route",
  ON_SCENE: "on_scene",
  UNAVAILABLE: "unavailable",
});

const INCIDENT_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND = 300 / 3.6;
const POSITION_JITTER_ALLOWANCE_METERS = 100;
const PRIVILEGED_INCIDENT_ROLES = new Set([
  Roles.DISPATCHER,
  Roles.INCIDENT_COMMANDER,
]);
const UNIT_TRANSITIONS = Object.freeze({
  [UnitStatuses.AVAILABLE]: new Set([UnitStatuses.UNAVAILABLE]),
  [UnitStatuses.ASSIGNED]: new Set([
    UnitStatuses.EN_ROUTE,
    UnitStatuses.UNAVAILABLE,
  ]),
  [UnitStatuses.EN_ROUTE]: new Set([
    UnitStatuses.ON_SCENE,
    UnitStatuses.UNAVAILABLE,
  ]),
  [UnitStatuses.ON_SCENE]: new Set([
    UnitStatuses.AVAILABLE,
    UnitStatuses.UNAVAILABLE,
  ]),
  [UnitStatuses.UNAVAILABLE]: new Set([UnitStatuses.AVAILABLE]),
});

export class DomainError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class EmergencyCore {
  #clock;
  #idFactory;
  #incidents = new Map();
  #units = new Map();
  #assignments = new Map();
  #locations = new Map();
  #auditEvents = [];
  #idempotency = new Map();

  constructor({
    clock = () => new Date(),
    idFactory = (prefix) => `${prefix}_${randomUUID()}`,
  } = {}) {
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  // Internal persistence boundary; never expose this payload through HTTP.
  exportState() {
    return structuredClone({
      version: 1,
      incidents: [...this.#incidents],
      units: [...this.#units],
      assignments: [...this.#assignments],
      locations: [...this.#locations],
      auditEvents: this.#auditEvents,
      idempotency: [...this.#idempotency],
    });
  }

  restoreState(state) {
    if (state.version !== 1)
      throw new Error("Unsupported database schema version.");
    const value = structuredClone(state);
    this.#incidents = new Map(value.incidents);
    this.#units = new Map(value.units);
    this.#assignments = new Map(value.assignments);
    this.#locations = new Map(value.locations);
    this.#auditEvents = value.auditEvents;
    this.#idempotency = new Map(value.idempotency);
  }

  updateUnit(actor, input, idempotencyKey) {
    this.#authorize(actor, [Roles.SYSTEM_ADMIN]);
    return this.#execute(actor, idempotencyKey, "unit.updated", input, () => {
      const unit = this.#getUnit(input.unitId);
      const callSign = requiredText(input.callSign, "callSign", 40);
      if (
        [...this.#units.values()].some(
          (other) =>
            other.id !== unit.id &&
            other.callSign.toLocaleLowerCase() === callSign.toLocaleLowerCase(),
        )
      ) {
        throw new DomainError(
          "conflict",
          "A unit with this call sign already exists.",
          409,
        );
      }
      const updated = Object.freeze({
        ...unit,
        callSign,
        name: requiredText(input.name, "name", 120),
        capabilities: uniqueTexts(
          input.capabilities ?? [],
          "capabilities",
          30,
          80,
        ),
        updatedAt: this.#now(),
      });
      this.#units.set(unit.id, updated);
      return updated;
    });
  }

  registerUnit(actor, input, idempotencyKey) {
    this.#authorize(actor, [Roles.DISPATCHER, Roles.SYSTEM_ADMIN]);
    return this.#execute(
      actor,
      idempotencyKey,
      "unit.registered",
      input,
      () => {
        const name = requiredText(input.name, "name", 120);
        const callSign = requiredText(input.callSign, "callSign", 40);
        const existing = [...this.#units.values()].find(
          (unit) =>
            unit.callSign.toLocaleLowerCase() === callSign.toLocaleLowerCase(),
        );
        if (existing) {
          throw new DomainError(
            "conflict",
            "A unit with this call sign already exists.",
            409,
          );
        }

        const now = this.#now();
        const unit = Object.freeze({
          id: this.#idFactory("unit"),
          name,
          callSign,
          status: UnitStatuses.AVAILABLE,
          capabilities: uniqueTexts(
            input.capabilities ?? [],
            "capabilities",
            30,
            80,
          ),
          activeAssignmentId: null,
          createdAt: now,
          updatedAt: now,
        });
        this.#units.set(unit.id, unit);
        return unit;
      },
    );
  }

  createIncident(actor, input, idempotencyKey) {
    this.#authorize(actor, [...PRIVILEGED_INCIDENT_ROLES]);
    return this.#execute(
      actor,
      idempotencyKey,
      "incident.created",
      input,
      () => {
        const title = requiredText(input.title, "title", 160);
        const description = optionalText(
          input.description,
          "description",
          4000,
        );
        const priority = requiredText(input.priority, "priority", 20);
        if (!INCIDENT_PRIORITIES.has(priority)) {
          throw new DomainError(
            "validation_error",
            `priority must be one of: ${[...INCIDENT_PRIORITIES].join(", ")}.`,
          );
        }
        const location = validateLocation(input.location, this.#now(), {
          allowOlderThanMs: 5 * 60_000,
        });
        const now = this.#now();
        const incident = Object.freeze({
          id: this.#idFactory("incident"),
          title,
          description,
          priority,
          location,
          hazards: uniqueTexts(input.hazards ?? [], "hazards", 50, 240),
          status: IncidentStatuses.OPEN,
          openedAt: now,
          closedAt: null,
          closeReason: null,
          createdBy: actor.id,
          updatedAt: now,
        });
        this.#incidents.set(incident.id, incident);
        return incident;
      },
    );
  }

  assignUnit(actor, input, idempotencyKey) {
    this.#authorize(actor, [...PRIVILEGED_INCIDENT_ROLES]);
    return this.#execute(actor, idempotencyKey, "unit.assigned", input, () => {
      const incident = this.#getIncident(input.incidentId);
      if (incident.status !== IncidentStatuses.OPEN) {
        throw new DomainError(
          "conflict",
          "Cannot assign a unit to a closed incident.",
          409,
        );
      }
      const unit = this.#getUnit(input.unitId);
      if (unit.status !== UnitStatuses.AVAILABLE || unit.activeAssignmentId) {
        throw new DomainError(
          "conflict",
          "Unit is not available for assignment.",
          409,
        );
      }

      const now = this.#now();
      const assignment = Object.freeze({
        id: this.#idFactory("assignment"),
        incidentId: incident.id,
        unitId: unit.id,
        status: AssignmentStatuses.PENDING,
        assignedAt: now,
        assignedBy: actor.id,
        respondedAt: null,
        respondedBy: null,
        rejectionReason: null,
        clearedAt: null,
        cancelledAt: null,
        cancelledBy: null,
        cancellationReason: null,
      });
      this.#assignments.set(assignment.id, assignment);
      this.#units.set(
        unit.id,
        Object.freeze({
          ...unit,
          status: UnitStatuses.ASSIGNED,
          activeAssignmentId: assignment.id,
          updatedAt: now,
        }),
      );
      return assignment;
    });
  }

  respondToAssignment(actor, input, idempotencyKey) {
    assertRecord(input);
    this.#authorize(actor, [Roles.CREW_LEADER]);
    const assignedUnitId = this.#getAssignment(input.assignmentId).unitId;
    this.#authorizeUnitActor(actor, assignedUnitId);
    const accepted = input.decision === "acknowledge";
    const eventType = accepted
      ? "assignment.acknowledged"
      : "assignment.rejected";
    return this.#execute(actor, idempotencyKey, eventType, input, () => {
      const assignment = this.#getAssignment(input.assignmentId);
      if (assignment.status !== AssignmentStatuses.PENDING) {
        throw new DomainError(
          "conflict",
          "Assignment has already been answered.",
          409,
        );
      }
      if (!["acknowledge", "reject"].includes(input.decision)) {
        throw new DomainError(
          "validation_error",
          "decision must be acknowledge or reject.",
        );
      }
      const rejectionReason = accepted
        ? null
        : requiredText(input.reason, "reason", 500);
      const now = this.#now();
      const updated = Object.freeze({
        ...assignment,
        status: accepted
          ? AssignmentStatuses.ACKNOWLEDGED
          : AssignmentStatuses.REJECTED,
        respondedAt: now,
        respondedBy: actor.id,
        rejectionReason,
      });
      this.#assignments.set(updated.id, updated);

      if (!accepted) {
        const unit = this.#getUnit(assignment.unitId);
        this.#units.set(
          unit.id,
          Object.freeze({
            ...unit,
            status: UnitStatuses.AVAILABLE,
            activeAssignmentId: null,
            updatedAt: now,
          }),
        );
      }
      return updated;
    });
  }

  cancelAssignment(actor, input, idempotencyKey) {
    this.#authorize(actor, [...PRIVILEGED_INCIDENT_ROLES]);
    return this.#execute(
      actor,
      idempotencyKey,
      "assignment.cancelled",
      input,
      () => {
        const assignment = this.#getAssignment(input.assignmentId);
        if (
          ![
            AssignmentStatuses.PENDING,
            AssignmentStatuses.ACKNOWLEDGED,
          ].includes(assignment.status)
        ) {
          throw new DomainError(
            "conflict",
            "Assignment is no longer active.",
            409,
          );
        }
        const now = this.#now();
        const updated = Object.freeze({
          ...assignment,
          status: AssignmentStatuses.CANCELLED,
          cancelledAt: now,
          cancelledBy: actor.id,
          cancellationReason: requiredText(input.reason, "reason", 500),
        });
        this.#assignments.set(updated.id, updated);
        const unit = this.#getUnit(updated.unitId);
        this.#units.set(
          unit.id,
          Object.freeze({
            ...unit,
            status: UnitStatuses.AVAILABLE,
            activeAssignmentId: null,
            updatedAt: now,
          }),
        );
        return updated;
      },
    );
  }

  updateUnitStatus(actor, input, idempotencyKey) {
    this.#authorize(actor, [Roles.CREW_LEADER, Roles.INCIDENT_COMMANDER]);
    assertRecord(input);
    const targetUnit = this.#getUnit(input.unitId);
    if (actor.role === Roles.CREW_LEADER) {
      this.#authorizeUnitActor(actor, targetUnit.id);
    }
    let clearedAssignment = null;
    const result = this.#execute(
      actor,
      idempotencyKey,
      "unit.status_changed",
      input,
      () => {
        const unit = this.#getUnit(input.unitId);
        if (!Object.values(UnitStatuses).includes(input.status)) {
          throw new DomainError("validation_error", "Unknown unit status.");
        }
        if (!UNIT_TRANSITIONS[unit.status]?.has(input.status)) {
          throw new DomainError(
            "invalid_transition",
            `Cannot transition a unit from ${unit.status} to ${input.status}.`,
            409,
          );
        }

        if (
          input.status === UnitStatuses.UNAVAILABLE &&
          unit.activeAssignmentId
        ) {
          throw new DomainError(
            "conflict",
            "An active assignment must be rejected or completed before the unit is marked unavailable.",
            409,
          );
        }

        if (
          input.status === UnitStatuses.AVAILABLE &&
          unit.activeAssignmentId &&
          unit.status !== UnitStatuses.ON_SCENE
        ) {
          throw new DomainError(
            "conflict",
            "Only an on-scene unit may clear an active assignment by becoming available.",
            409,
          );
        }

        if (unit.activeAssignmentId) {
          const assignment = this.#getAssignment(unit.activeAssignmentId);
          if (
            assignment.status === AssignmentStatuses.PENDING &&
            input.status === UnitStatuses.EN_ROUTE
          ) {
            throw new DomainError(
              "conflict",
              "The assignment must be acknowledged before the unit goes en route.",
              409,
            );
          }
        }

        const now = this.#now();
        const cleared = input.status === UnitStatuses.AVAILABLE;
        if (cleared && unit.activeAssignmentId) {
          const assignment = this.#getAssignment(unit.activeAssignmentId);
          clearedAssignment = Object.freeze({
            ...assignment,
            status: AssignmentStatuses.CLEARED,
            clearedAt: now,
          });
          this.#assignments.set(assignment.id, clearedAssignment);
        }
        const updated = Object.freeze({
          ...unit,
          status: input.status,
          activeAssignmentId: cleared ? null : unit.activeAssignmentId,
          updatedAt: now,
        });
        this.#units.set(updated.id, updated);
        return updated;
      },
    );
    if (clearedAssignment) {
      this.#appendAuditEvent(
        actor,
        requiredText(idempotencyKey, "idempotencyKey", 160),
        "assignment.cleared",
        clearedAssignment,
      );
    }
    return result;
  }

  recordLocation(actor, input, idempotencyKey) {
    this.#authorize(actor, [Roles.CREW_LEADER]);
    assertRecord(input);
    const targetUnit = this.#getUnit(input.unitId);
    this.#authorizeUnitActor(actor, targetUnit.id);
    return this.#execute(
      actor,
      idempotencyKey,
      "unit.location_recorded",
      input,
      () => {
        const unit = this.#getUnit(input.unitId);
        const receivedAt = this.#now();
        const position = validateLocation(input.position, receivedAt, {
          allowOlderThanMs: 15 * 60_000,
        });
        const previous = this.#locations.get(unit.id);
        if (
          previous &&
          Date.parse(position.capturedAt) <= Date.parse(previous.capturedAt)
        ) {
          throw new DomainError(
            "stale_location",
            "Location is not newer than the last accepted position.",
            409,
          );
        }
        if (previous && !isPlausibleMovement(previous, position)) {
          throw new DomainError(
            "implausible_location",
            "Location implies an implausible movement speed.",
            409,
          );
        }
        const location = Object.freeze({
          ...position,
          unitId: unit.id,
          receivedAt,
          source: optionalText(input.source, "source", 60) ?? "device_gnss",
        });
        this.#locations.set(unit.id, location);
        return location;
      },
    );
  }

  closeIncident(actor, input, idempotencyKey) {
    this.#authorize(actor, [...PRIVILEGED_INCIDENT_ROLES]);
    return this.#execute(
      actor,
      idempotencyKey,
      "incident.closed",
      input,
      () => {
        const incident = this.#getIncident(input.incidentId);
        if (incident.status === IncidentStatuses.CLOSED) {
          throw new DomainError("conflict", "Incident is already closed.", 409);
        }
        const activeAssignments = [...this.#assignments.values()].filter(
          (assignment) =>
            assignment.incidentId === incident.id &&
            ![
              AssignmentStatuses.CLEARED,
              AssignmentStatuses.REJECTED,
              AssignmentStatuses.CANCELLED,
            ].includes(assignment.status),
        );
        if (activeAssignments.length > 0) {
          throw new DomainError(
            "conflict",
            "All assignments must be rejected, cancelled, or cleared before incident closure.",
            409,
            { activeAssignmentIds: activeAssignments.map(({ id }) => id) },
          );
        }
        const now = this.#now();
        const updated = Object.freeze({
          ...incident,
          status: IncidentStatuses.CLOSED,
          closeReason: requiredText(input.reason, "reason", 1000),
          closedAt: now,
          updatedAt: now,
        });
        this.#incidents.set(updated.id, updated);
        return updated;
      },
    );
  }

  snapshot(actor) {
    this.#authorize(actor, Object.values(Roles));
    let incidents = [...this.#incidents.values()];
    let units = [...this.#units.values()];
    let assignments = [...this.#assignments.values()];
    let locations = [...this.#locations.values()];

    if (actor.role === Roles.CREW_LEADER) {
      if (!actor.unitId) {
        throw new DomainError(
          "forbidden",
          "Crew identity must include a unit claim.",
          403,
        );
      }
      units = units.filter(({ id }) => id === actor.unitId);
      assignments = assignments.filter(
        ({ unitId, status }) =>
          unitId === actor.unitId &&
          ![AssignmentStatuses.REJECTED, AssignmentStatuses.CANCELLED].includes(
            status,
          ),
      );
      const incidentIds = new Set(
        assignments.map(({ incidentId }) => incidentId),
      );
      incidents = incidents.filter(({ id }) => incidentIds.has(id));
      locations = locations.filter(({ unitId }) => unitId === actor.unitId);
    }

    const observedAt = this.#now();
    locations = locations.map((location) => ({
      ...location,
      freshness: locationFreshness(location, observedAt),
    }));
    return structuredClone({
      incidents,
      units,
      assignments,
      locations,
    });
  }

  auditLog(actor) {
    this.#authorize(actor, [Roles.SYSTEM_ADMIN, Roles.AUDITOR]);
    return structuredClone(this.#auditEvents);
  }

  #execute(actor, idempotencyKey, eventType, input, operation) {
    validateActor(actor);
    assertRecord(input);
    const key = requiredText(idempotencyKey, "idempotencyKey", 160);
    const scopedKey = stableStringify({
      actorId: actor.id,
      actorRole: actor.role,
      unitId: actor.unitId ?? null,
      idempotencyKey: key,
    });
    const fingerprint = stableStringify({ eventType, input });
    const existing = this.#idempotency.get(scopedKey);
    if (existing) {
      if (
        existing.eventType !== eventType ||
        existing.fingerprint !== fingerprint ||
        existing.actorRole !== actor.role
      ) {
        throw new DomainError(
          "idempotency_conflict",
          "This idempotency key was already used for a different command.",
          409,
        );
      }
      return structuredClone(existing.result);
    }

    const result = operation();
    this.#appendAuditEvent(actor, key, eventType, result);
    this.#idempotency.set(
      scopedKey,
      Object.freeze({
        actorRole: actor.role,
        eventType,
        fingerprint,
        result: structuredClone(result),
      }),
    );
    return structuredClone(result);
  }

  #appendAuditEvent(actor, idempotencyKey, eventType, result) {
    const event = Object.freeze({
      id: this.#idFactory("event"),
      sequence: this.#auditEvents.length + 1,
      type: eventType,
      actorId: actor.id,
      actorRole: actor.role,
      occurredAt: this.#now(),
      subject: subjectFor(eventType, result),
      details: auditDetailsFor(eventType, result),
      idempotencyKey,
    });
    this.#auditEvents.push(event);
  }

  #authorize(actor, allowedRoles) {
    validateActor(actor);
    if (!allowedRoles.includes(actor.role)) {
      throw new DomainError(
        "forbidden",
        "Actor is not allowed to perform this action.",
        403,
      );
    }
  }

  #authorizeUnitActor(actor, unitId) {
    if (actor.unitId !== unitId) {
      throw new DomainError(
        "forbidden",
        "Actor is not assigned to this unit.",
        403,
      );
    }
  }

  #getIncident(id) {
    const incident = this.#incidents.get(id);
    if (!incident)
      throw new DomainError("not_found", "Incident not found.", 404);
    return incident;
  }

  #getUnit(id) {
    const unit = this.#units.get(id);
    if (!unit) throw new DomainError("not_found", "Unit not found.", 404);
    return unit;
  }

  #getAssignment(id) {
    const assignment = this.#assignments.get(id);
    if (!assignment)
      throw new DomainError("not_found", "Assignment not found.", 404);
    return assignment;
  }

  #now() {
    const value = this.#clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError("clock must return a valid Date");
    }
    return value.toISOString();
  }
}

export function locationFreshness(location, now = new Date()) {
  const observedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(observedAt.getTime())) {
    throw new TypeError("now must be a valid Date or ISO timestamp");
  }
  const ageMs = observedAt.getTime() - Date.parse(location.capturedAt);
  if (ageMs <= 30_000) return "fresh";
  if (ageMs <= 120_000) return "aging";
  return "stale";
}

function validateActor(actor) {
  if (
    !actor ||
    typeof actor !== "object" ||
    typeof actor.id !== "string" ||
    actor.id.trim().length === 0 ||
    actor.id.trim().length > 160
  ) {
    throw new DomainError(
      "unauthenticated",
      "Authenticated actor is required.",
      401,
    );
  }
  if (!Object.values(Roles).includes(actor.role)) {
    throw new DomainError("unauthenticated", "Actor role is invalid.", 401);
  }
  if (actor.unitId !== undefined && actor.unitId !== null) {
    if (
      typeof actor.unitId !== "string" ||
      actor.unitId.trim().length === 0 ||
      actor.unitId.trim().length > 160
    ) {
      throw new DomainError(
        "unauthenticated",
        "Actor unit claim is invalid.",
        401,
      );
    }
  }
}

function validateLocation(value, receivedAt, { allowOlderThanMs }) {
  if (!value || typeof value !== "object") {
    throw new DomainError("validation_error", "location is required.");
  }
  const latitude = finiteNumber(value.latitude, "latitude");
  const longitude = finiteNumber(value.longitude, "longitude");
  const accuracyMeters = finiteNumber(value.accuracyMeters, "accuracyMeters");
  if (latitude < -90 || latitude > 90) {
    throw new DomainError(
      "validation_error",
      "latitude must be between -90 and 90.",
    );
  }
  if (longitude < -180 || longitude > 180) {
    throw new DomainError(
      "validation_error",
      "longitude must be between -180 and 180.",
    );
  }
  if (accuracyMeters <= 0 || accuracyMeters > 10_000) {
    throw new DomainError(
      "validation_error",
      "accuracyMeters must be greater than 0 and no more than 10000.",
    );
  }
  const capturedAt = parseRfc3339Timestamp(value.capturedAt, "capturedAt");
  const received = new Date(receivedAt);
  const skewMs = capturedAt.getTime() - received.getTime();
  if (skewMs > 30_000) {
    throw new DomainError(
      "validation_error",
      "capturedAt is too far in the future.",
    );
  }
  if (received.getTime() - capturedAt.getTime() > allowOlderThanMs) {
    throw new DomainError("stale_location", "Location is too old.", 409);
  }
  return Object.freeze({
    latitude,
    longitude,
    accuracyMeters,
    capturedAt: capturedAt.toISOString(),
  });
}

function isPlausibleMovement(previous, next) {
  const elapsedSeconds =
    (Date.parse(next.capturedAt) - Date.parse(previous.capturedAt)) / 1000;
  if (elapsedSeconds <= 0) return false;
  const uncertaintyMeters =
    previous.accuracyMeters +
    next.accuracyMeters +
    POSITION_JITTER_ALLOWANCE_METERS;
  const maximumDistanceMeters =
    uncertaintyMeters + elapsedSeconds * MAX_PLAUSIBLE_SPEED_METERS_PER_SECOND;
  return haversineDistanceMeters(previous, next) <= maximumDistanceMeters;
}

function parseRfc3339Timestamp(value, field) {
  if (typeof value !== "string") {
    throw new DomainError(
      "validation_error",
      `${field} must be an RFC 3339 timestamp string.`,
    );
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/,
  );
  if (!match) {
    throw new DomainError(
      "validation_error",
      `${field} must be an RFC 3339 timestamp string.`,
    );
  }
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    ,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute =
    offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    throw new DomainError(
      "validation_error",
      `${field} must be a valid RFC 3339 timestamp.`,
    );
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError(
      "validation_error",
      `${field} must be a valid RFC 3339 timestamp.`,
    );
  }
  return parsed;
}

function haversineDistanceMeters(from, to) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function requiredText(value, field, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DomainError("validation_error", `${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new DomainError(
      "validation_error",
      `${field} must be no more than ${maxLength} characters.`,
    );
  }
  return normalized;
}

function assertRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(
      "validation_error",
      "Request body must be a JSON object.",
    );
  }
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  return requiredText(value, field, maxLength);
}

function uniqueTexts(values, field, maxItems, maxLength) {
  if (!Array.isArray(values) || values.length > maxItems) {
    throw new DomainError(
      "validation_error",
      `${field} must be an array with no more than ${maxItems} entries.`,
    );
  }
  return Object.freeze([
    ...new Set(
      values.map((value, index) =>
        requiredText(value, `${field}[${index}]`, maxLength),
      ),
    ),
  ]);
}

function finiteNumber(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError(
      "validation_error",
      `${field} must be a finite number.`,
    );
  }
  return value;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function subjectFor(eventType, result) {
  if (eventType.startsWith("incident."))
    return { type: "incident", id: result.id };
  if (eventType.startsWith("assignment.")) {
    return { type: "assignment", id: result.id };
  }
  return { type: "unit", id: result.unitId ?? result.id };
}

function auditDetailsFor(eventType, result) {
  if (eventType === "incident.created" || eventType === "incident.closed") {
    return Object.freeze({ status: result.status, priority: result.priority });
  }
  if (
    ["unit.registered", "unit.updated", "unit.status_changed"].includes(
      eventType,
    )
  ) {
    return Object.freeze({ status: result.status, callSign: result.callSign });
  }
  if (eventType === "unit.location_recorded") {
    return Object.freeze({
      capturedAt: result.capturedAt,
      accuracyMeters: result.accuracyMeters,
      source: result.source,
    });
  }
  return Object.freeze({
    incidentId: result.incidentId,
    unitId: result.unitId,
    status: result.status,
  });
}
