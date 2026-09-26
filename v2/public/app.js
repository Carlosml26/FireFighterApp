"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 12_000;
const MAP_BOUNDS = Object.freeze({ north: 36.76, south: 36.66, west: -4.55, east: -4.32 });
const PRIORITY_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });
const ACTIVE_ASSIGNMENT_STATUSES = new Set(["pending", "acknowledged"]);
const KNOWN_STATUSES = new Set([
  "available",
  "assigned",
  "en_route",
  "on_scene",
  "unavailable",
  "pending",
    "acknowledged",
    "rejected",
    "cancelled",
    "cleared",
  "fresh",
  "aging",
  "stale",
  "open",
  "closed",
]);
const STATUS_TRANSITIONS = Object.freeze({
  available: ["unavailable"],
  assigned: ["en_route", "unavailable"],
  en_route: ["on_scene", "unavailable"],
  on_scene: ["available", "unavailable"],
  unavailable: ["available"],
});
const VIEW_IDENTITIES = {
  dispatcher: { id: "dispatch-console", role: "dispatcher" },
  field: { id: "crew-console", role: "crew_leader" },
  audit: { id: "audit-console", role: "auditor" },
};

const appState = {
  view: "dispatcher",
  snapshot: { incidents: [], units: [], assignments: [], locations: [] },
  unitDirectory: [],
  auditEvents: [],
  selectedIncidentId: null,
  selectedUnitId: null,
  activeUnitId: null,
  lastSyncAt: null,
  refreshSequence: 0,
  refreshing: false,
};

const dom = {};

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  const ids = [
    "connection-state",
    "refresh-button",
    "alert-region",
    "actor-id",
    "actor-role",
    "actor-unit",
    "unit-claim-row",
    "last-sync",
    "dispatcher-summary",
    "metric-incidents",
    "metric-critical",
    "metric-available",
    "metric-total-units",
    "metric-pending",
    "metric-fresh",
    "map-panel",
    "map-links",
    "map-markers",
    "map-empty",
    "map-summary",
    "incident-count",
    "unit-count",
    "incident-list",
    "unit-list",
    "selected-incident-name",
    "selected-unit-name",
    "assign-help",
    "assign-button",
    "incident-close-section",
    "close-eligibility",
    "close-incident-button",
    "close-incident-form",
    "cancel-assignment-section",
    "cancel-assignment-form",
    "cancel-assignment-help",
    "create-unit-form",
    "create-incident-form",
    "field-unit-select",
    "field-unit-summary",
    "field-assignment-status",
    "field-assignment-detail",
    "assignment-response-controls",
    "acknowledge-button",
    "reject-assignment-form",
    "current-unit-status",
    "status-actions",
    "status-help",
    "location-freshness",
    "location-summary",
    "browser-location-button",
    "manual-location-form",
    "audit-count",
    "audit-search",
    "audit-type-filter",
    "audit-list",
  ];
  for (const id of ids) dom[toCamelCase(id)] = document.getElementById(id);

  for (const tab of document.querySelectorAll("[data-view]")) {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
    tab.addEventListener("keydown", handleViewTabKeydown);
  }
  dom.refreshButton.addEventListener("click", () => refreshState());
  dom.actorId.addEventListener("change", updateActorIdentity);
  dom.actorId.addEventListener("blur", updateActorIdentity);
  dom.fieldUnitSelect.addEventListener("change", () => {
    appState.activeUnitId = dom.fieldUnitSelect.value || null;
    renderIdentity();
    refreshState();
  });
  dom.assignButton.addEventListener("click", assignSelectedUnit);
  dom.createUnitForm.addEventListener("submit", createUnit);
  dom.createIncidentForm.addEventListener("submit", createIncident);
  dom.closeIncidentForm.addEventListener("submit", closeSelectedIncident);
  dom.cancelAssignmentForm.addEventListener("submit", cancelSelectedAssignment);
  dom.acknowledgeButton.addEventListener("click", acknowledgeAssignment);
  dom.rejectAssignmentForm.addEventListener("submit", rejectAssignment);
  dom.manualLocationForm.addEventListener("submit", sendManualLocation);
  dom.browserLocationButton.addEventListener("click", sendBrowserLocation);
  dom.auditSearch.addEventListener("input", renderAuditLog);
  dom.auditTypeFilter.addEventListener("change", renderAuditLog);

  window.addEventListener("online", () => refreshState());
  window.addEventListener("offline", () => {
    setConnection("error", "Browser offline");
    showAlert("error", "Network unavailable", "The last received state remains visible and may be stale.");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && navigator.onLine) refreshState({ quiet: true });
  });

  renderIdentity();
  refreshState();
  window.setInterval(() => {
    updateSyncLabel();
    if (!document.hidden && navigator.onLine) refreshState({ quiet: true });
  }, POLL_INTERVAL_MS);

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The console remains fully usable without an installed offline shell.
    });
  }
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function handleViewTabKeydown(event) {
  const tabs = [...document.querySelectorAll("[data-view]")];
  const currentIndex = tabs.indexOf(event.currentTarget);
  let nextIndex = null;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  }
  if (nextIndex === null) return;
  event.preventDefault();
  tabs[nextIndex].focus();
  switchView(tabs[nextIndex].dataset.view);
}

function switchView(view) {
  if (!Object.hasOwn(VIEW_IDENTITIES, view) || view === appState.view) return;
  updateActorIdentity();
  appState.view = view;
  for (const tab of document.querySelectorAll("[data-view]")) {
    const active = tab.dataset.view === view;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of document.querySelectorAll(".view-panel")) {
    panel.hidden = panel.id !== `view-${view}`;
  }
  dom.dispatcherSummary.hidden = view !== "dispatcher";
  dom.mapPanel.hidden = view === "audit";
  renderIdentity();
  renderAll();
  refreshState();
}

function updateActorIdentity() {
  const trimmed = dom.actorId.value.trim();
  if (trimmed) VIEW_IDENTITIES[appState.view].id = trimmed;
  renderIdentity();
}

function renderIdentity() {
  const identity = VIEW_IDENTITIES[appState.view];
  dom.actorId.value = identity.id;
  dom.actorRole.textContent = identity.role;
  dom.unitClaimRow.hidden = appState.view !== "field";
  dom.actorUnit.textContent = appState.activeUnitId || "Not selected";
}

function requestHeaders(hasBody, idempotencyKey, identity = currentIdentity()) {
  const headers = {
    accept: "application/json",
    "x-actor-id": identity.id,
    "x-actor-role": identity.role,
  };
  if (identity.unitId) {
    headers["x-unit-id"] = identity.unitId;
  }
  if (hasBody) {
    headers["content-type"] = "application/json";
    headers["idempotency-key"] = idempotencyKey;
  }
  return headers;
}

function currentIdentity() {
  const identity = VIEW_IDENTITIES[appState.view];
  return {
    id: identity.id,
    role: identity.role,
    unitId: appState.view === "field" ? appState.activeUnitId : null,
  };
}

async function apiRequest(path, { method = "GET", body, idempotencyKey, identity } = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      method,
      headers: requestHeaders(body !== undefined, idempotencyKey, identity),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const raw = await response.text();
    let payload = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("The server returned a non-JSON response.");
      }
    }
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `Request failed with status ${response.status}.`);
      error.code = payload?.error?.code || "request_failed";
      error.details = payload?.error?.details;
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("The request timed out. Server state may be unchanged.");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function refreshState({ quiet = false } = {}) {
  if (appState.view === "field" && !appState.activeUnitId) {
    setConnection("connected", "Select a unit");
    renderAll();
    return;
  }
  const sequence = ++appState.refreshSequence;
  appState.refreshing = true;
  dom.refreshButton.disabled = true;
  if (!quiet) setConnection("loading", "Refreshing");
  try {
    const statePromise = apiRequest("/v1/state");
    const auditPromise = appState.view === "audit" ? apiRequest("/v1/audit-events") : null;
    const snapshot = await statePromise;
    const auditPayload = auditPromise ? await auditPromise : null;
    if (sequence !== appState.refreshSequence) return;
    appState.snapshot = normalizeSnapshot(snapshot);
    if (appState.view !== "field") {
      appState.unitDirectory = appState.snapshot.units;
    } else {
      appState.unitDirectory = mergeUnits(
        appState.unitDirectory,
        appState.snapshot.units,
      );
    }
    if (auditPayload) appState.auditEvents = Array.isArray(auditPayload.events) ? auditPayload.events : [];
    appState.lastSyncAt = new Date();
    chooseValidSelections();
    renderAll();
    setConnection("connected", "API connected");
  } catch (error) {
    if (sequence !== appState.refreshSequence) return;
    setConnection("error", "State unavailable");
    if (!quiet || !appState.lastSyncAt) {
      showAlert("error", "Could not refresh state", describeError(error), () => refreshState());
    }
  } finally {
    if (sequence === appState.refreshSequence) {
      appState.refreshing = false;
      dom.refreshButton.disabled = false;
      updateSyncLabel();
    }
  }
}

function normalizeSnapshot(value) {
  return {
    incidents: Array.isArray(value?.incidents) ? value.incidents : [],
    units: Array.isArray(value?.units) ? value.units : [],
    assignments: Array.isArray(value?.assignments) ? value.assignments : [],
    locations: Array.isArray(value?.locations) ? value.locations : [],
  };
}

function mergeUnits(directory, visibleUnits) {
  const units = new Map(directory.map((unit) => [unit.id, unit]));
  for (const unit of visibleUnits) units.set(unit.id, unit);
  return [...units.values()];
}

function chooseValidSelections() {
  const { incidents, units } = appState.snapshot;
  if (!incidents.some((item) => item.id === appState.selectedIncidentId)) {
    appState.selectedIncidentId = incidents.find((item) => item.status === "open")?.id ?? incidents[0]?.id ?? null;
  }
  if (!units.some((item) => item.id === appState.selectedUnitId)) {
    appState.selectedUnitId = units.find((item) => item.status === "available")?.id ?? units[0]?.id ?? null;
  }
  if (!appState.unitDirectory.some((item) => item.id === appState.activeUnitId)) {
    appState.activeUnitId = appState.unitDirectory[0]?.id ?? units[0]?.id ?? null;
  }
  renderIdentity();
}

async function runMutation(path, body, { control, successMessage, onSuccess } = {}) {
  const key = createIdempotencyKey();
  const identity = currentIdentity();
  const execute = async () => {
    if (control) control.disabled = true;
    let result;
    try {
      result = await apiRequest(path, {
        method: "POST",
        body,
        idempotencyKey: key,
        identity,
      });
    } catch (error) {
      const retryable = !error.status || error.status >= 500;
      showAlert(
        "error",
        "Command was not accepted",
        describeError(error),
        retryable ? execute : null,
      );
      if (control && !retryable) control.disabled = false;
      return null;
    }
    try {
      if (onSuccess) onSuccess(result);
      showAlert("success", "Command accepted", successMessage);
      await refreshState({ quiet: true });
    } catch (error) {
      showAlert(
        "warning",
        "Command accepted; refresh the view",
        `The server accepted the command, but the interface could not finish updating: ${describeError(error)}`,
      );
      await refreshState({ quiet: true });
    } finally {
      // Assignment availability is derived by renderDispatcher from refreshed state.
      if (control && control !== dom.assignButton) control.disabled = false;
    }
    return result;
  };
  return execute();
}

function createIdempotencyKey() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `web-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function createUnit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const body = {
    name: String(data.get("name") || ""),
    callSign: String(data.get("callSign") || ""),
    capabilities: commaSeparated(data.get("capabilities"), 30),
  };
  runMutation("/v1/units", body, {
    control: event.submitter,
    successMessage: `${body.callSign} was registered as available.`,
    onSuccess: (unit) => {
      appState.selectedUnitId = unit.id;
      form.reset();
    },
  });
}

function createIncident(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const body = {
    title: String(data.get("title") || ""),
    description: String(data.get("description") || ""),
    priority: String(data.get("priority") || "medium"),
    location: {
      latitude: Number(data.get("latitude")),
      longitude: Number(data.get("longitude")),
      accuracyMeters: Number(data.get("accuracyMeters")),
      capturedAt: new Date().toISOString(),
    },
    hazards: commaSeparated(data.get("hazards"), 50),
  };
  runMutation("/v1/incidents", body, {
    control: event.submitter,
    successMessage: `${body.title} was added to the dispatch queue.`,
    onSuccess: (incident) => {
      appState.selectedIncidentId = incident.id;
      form.reset();
    },
  });
}

function assignSelectedUnit() {
  const incident = findIncident(appState.selectedIncidentId);
  const unit = findUnit(appState.selectedUnitId);
  if (!incident || !unit) return;
  runMutation(
    "/v1/assignments",
    { incidentId: incident.id, unitId: unit.id },
    {
      control: dom.assignButton,
      successMessage: `${unit.callSign} is awaiting acknowledgement for ${incident.title}.`,
    },
  );
}

function closeSelectedIncident(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const incident = findIncident(appState.selectedIncidentId);
  if (!incident || !form.reportValidity()) return;
  const data = new FormData(form);
  runMutation(
    "/v1/incident-closures",
    { incidentId: incident.id, reason: String(data.get("reason") || "") },
    {
      control: event.submitter,
      successMessage: `${incident.title} was closed.`,
      onSuccess: () => form.reset(),
    },
  );
}

function cancelSelectedAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const incident = findIncident(appState.selectedIncidentId);
  const assignment = incident
    ? appState.snapshot.assignments.find(
        (item) => item.incidentId === incident.id && ACTIVE_ASSIGNMENT_STATUSES.has(item.status),
      )
    : null;
  if (!assignment || !form.reportValidity()) return;
  const reason = String(new FormData(form).get("reason") || "");
  runMutation(
    "/v1/assignment-cancellations",
    { assignmentId: assignment.id, reason },
    {
      control: event.submitter,
      successMessage: "The assignment was cancelled and the unit was released.",
      onSuccess: () => form.reset(),
    },
  );
}

function acknowledgeAssignment() {
  const assignment = activeAssignmentForUnit(appState.activeUnitId);
  if (!assignment) return;
  runMutation(
    "/v1/assignment-responses",
    { assignmentId: assignment.id, decision: "acknowledge" },
    { control: dom.acknowledgeButton, successMessage: "Assignment acknowledged by the selected unit." },
  );
}

function rejectAssignment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const assignment = activeAssignmentForUnit(appState.activeUnitId);
  if (!assignment || !form.reportValidity()) return;
  const reason = String(new FormData(form).get("reason") || "");
  runMutation(
    "/v1/assignment-responses",
    { assignmentId: assignment.id, decision: "reject", reason },
    {
      control: event.submitter,
      successMessage: "Assignment rejected; the unit is available again.",
      onSuccess: () => form.reset(),
    },
  );
}

function updateUnitStatus(status, control) {
  const unit = findUnit(appState.activeUnitId);
  if (!unit) return;
  runMutation(
    "/v1/unit-status",
    { unitId: unit.id, status },
    { control, successMessage: `${unit.callSign} is now ${humanize(status)}.` },
  );
}

function sendManualLocation(event) {
  event.preventDefault();
  const unit = findUnit(appState.activeUnitId);
  if (!unit || !event.currentTarget.reportValidity()) return;
  const data = new FormData(event.currentTarget);
  recordPosition(
    unit,
    {
      latitude: Number(data.get("latitude")),
      longitude: Number(data.get("longitude")),
      accuracyMeters: Number(data.get("accuracyMeters")),
      capturedAt: new Date().toISOString(),
    },
    "manual_entry",
    event.submitter,
  );
}

function sendBrowserLocation() {
  const unit = findUnit(appState.activeUnitId);
  if (!unit) return;
  if (!navigator.geolocation) {
    showAlert("error", "Location unavailable", "This browser does not provide geolocation.");
    return;
  }
  dom.browserLocationButton.disabled = true;
  dom.browserLocationButton.textContent = "Requesting position…";
  navigator.geolocation.getCurrentPosition(
    (position) => {
      recordPosition(
        unit,
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.max(position.coords.accuracy, 1),
          capturedAt: new Date(position.timestamp).toISOString(),
        },
        "browser_geolocation",
        dom.browserLocationButton,
      ).finally(resetBrowserLocationButton);
    },
    (error) => {
      resetBrowserLocationButton();
      showAlert("error", "Position not sent", geolocationMessage(error));
    },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
  );
}

function resetBrowserLocationButton() {
  dom.browserLocationButton.disabled = !appState.activeUnitId;
  dom.browserLocationButton.textContent = "Send browser position";
}

function recordPosition(unit, position, source, control) {
  return runMutation(
    "/v1/locations",
    { unitId: unit.id, position, source },
    { control, successMessage: `Position reported for ${unit.callSign}.` },
  );
}

function renderAll() {
  renderMetrics();
  renderDispatcher();
  renderFieldView();
  renderAuditFilters();
  renderAuditLog();
  renderMap();
  updateSyncLabel();
}

function renderMetrics() {
  const { incidents, units, assignments, locations } = appState.snapshot;
  const open = incidents.filter((item) => item.status === "open");
  const critical = open.filter((item) => item.priority === "critical").length;
  dom.metricIncidents.textContent = String(open.length);
  dom.metricCritical.textContent = critical ? `${critical} critical` : "No critical incidents";
  dom.metricAvailable.textContent = String(units.filter((item) => item.status === "available").length);
  dom.metricTotalUnits.textContent = `${units.length} registered total`;
  dom.metricPending.textContent = String(assignments.filter((item) => item.status === "pending").length);
  dom.metricFresh.textContent = String(locations.filter((item) => item.freshness === "fresh").length);
}

function renderDispatcher() {
  const incidents = [...appState.snapshot.incidents].sort(compareIncidents);
  const units = [...appState.snapshot.units].sort((a, b) => String(a.callSign).localeCompare(String(b.callSign)));
  dom.incidentCount.textContent = String(incidents.length);
  dom.unitCount.textContent = String(units.length);
  renderIncidentList(incidents);
  renderUnitList(units);

  const incident = findIncident(appState.selectedIncidentId);
  const unit = findUnit(appState.selectedUnitId);
  dom.selectedIncidentName.textContent = incident?.title || "Select an incident";
  dom.selectedUnitName.textContent = unit ? `${unit.callSign} · ${unit.name}` : "Select an available unit";
  const canAssign = incident?.status === "open" && unit?.status === "available" && !unit?.activeAssignmentId;
  dom.assignButton.disabled = !canAssign;
  dom.assignHelp.textContent = canAssign
    ? `Create a pending assignment for ${unit.callSign}.`
    : assignmentHelp(incident, unit);

  const isOpen = incident?.status === "open";
  dom.incidentCloseSection.hidden = !isOpen;
  if (isOpen) {
    const active = appState.snapshot.assignments.filter(
      (item) => item.incidentId === incident.id && ACTIVE_ASSIGNMENT_STATUSES.has(item.status),
    );
    const eligible = active.length === 0;
    dom.closeIncidentButton.disabled = !eligible;
    dom.closeEligibility.textContent = eligible
      ? "Eligible: no pending or acknowledged assignments remain."
      : `${active.length} active assignment${active.length === 1 ? "" : "s"} must be rejected, cancelled, or cleared first.`;
    const cancellable = active[0] ?? null;
    dom.cancelAssignmentSection.hidden = !cancellable;
    dom.cancelAssignmentHelp.textContent = cancellable
      ? `Recall ${findUnit(cancellable.unitId)?.callSign || "the assigned unit"} from this incident.`
      : "";
  } else {
    dom.cancelAssignmentSection.hidden = true;
  }
}

function renderIncidentList(incidents) {
  dom.incidentList.replaceChildren();
  if (incidents.length === 0) return dom.incidentList.append(emptyState("No incidents in this session."));
  for (const incident of incidents) {
    const button = element("button", `entity-card priority-${knownPriority(incident.priority)}`);
    button.type = "button";
    button.classList.toggle("is-selected", incident.id === appState.selectedIncidentId);
    button.setAttribute("aria-pressed", String(incident.id === appState.selectedIncidentId));
    button.append(
      element("span", "entity-title", incident.title || "Untitled incident"),
      element("span", "entity-meta", `${humanize(incident.priority)} · ${humanize(incident.status)}`),
      element("span", "entity-detail", incident.description || coordinateText(incident.location)),
    );
    button.addEventListener("click", () => {
      appState.selectedIncidentId = incident.id;
      renderDispatcher();
      renderMap();
    });
    dom.incidentList.append(button);
  }
}

function renderUnitList(units) {
  dom.unitList.replaceChildren();
  if (units.length === 0) return dom.unitList.append(emptyState("No units registered in this session."));
  for (const unit of units) {
    const location = locationForUnit(unit.id);
    const button = element("button", "entity-card");
    button.type = "button";
    button.classList.toggle("is-selected", unit.id === appState.selectedUnitId);
    button.setAttribute("aria-pressed", String(unit.id === appState.selectedUnitId));
    button.append(
      element("span", "entity-title", `${unit.callSign || "Unit"} · ${unit.name || "Unnamed"}`),
      element("span", "entity-meta", humanize(unit.status)),
      element(
        "span",
        "entity-detail",
        location ? `${humanize(location.freshness)} position · ${formatRelative(location.capturedAt)}` : "Position unknown",
      ),
    );
    button.addEventListener("click", () => {
      appState.selectedUnitId = unit.id;
      renderDispatcher();
      renderMap();
    });
    dom.unitList.append(button);
  }
}

function renderFieldView() {
  const units = [...(appState.unitDirectory.length ? appState.unitDirectory : appState.snapshot.units)].sort(
    (a, b) => String(a.callSign).localeCompare(String(b.callSign)),
  );
  const previous = appState.activeUnitId;
  dom.fieldUnitSelect.replaceChildren();
  if (units.length === 0) {
    const option = element("option", "", "No units registered");
    option.value = "";
    dom.fieldUnitSelect.append(option);
    dom.fieldUnitSelect.disabled = true;
  } else {
    dom.fieldUnitSelect.disabled = false;
    for (const unit of units) {
      const option = element("option", "", `${unit.callSign} · ${unit.name}`);
      option.value = unit.id;
      dom.fieldUnitSelect.append(option);
    }
    dom.fieldUnitSelect.value = units.some((unit) => unit.id === previous) ? previous : units[0].id;
    appState.activeUnitId = dom.fieldUnitSelect.value;
  }
  renderIdentity();
  const unit = findUnit(appState.activeUnitId);
  renderFieldUnitSummary(unit);
  renderFieldAssignment(unit);
  renderStatusActions(unit);
  renderLocation(unit);
}

function renderFieldUnitSummary(unit) {
  dom.fieldUnitSummary.replaceChildren();
  if (!unit) return dom.fieldUnitSummary.append(emptyState("Register a unit from Dispatch first."));
  dom.fieldUnitSummary.append(
    definitionRow("Call sign", unit.callSign),
    definitionRow("Name", unit.name),
    definitionRow("Capabilities", unit.capabilities?.length ? unit.capabilities.join(", ") : "None recorded"),
  );
}

function renderFieldAssignment(unit) {
  const assignment = unit ? activeAssignmentForUnit(unit.id) : null;
  dom.fieldAssignmentDetail.replaceChildren();
  dom.assignmentResponseControls.hidden = !assignment || assignment.status !== "pending";
  setStatusBadge(dom.fieldAssignmentStatus, assignment?.status || "neutral", assignment ? humanize(assignment.status) : "None");
  if (!assignment) {
    dom.fieldAssignmentDetail.append(emptyState(unit ? "No active assignment." : "Select a unit to see assignments."));
    return;
  }
  const incident = findIncident(assignment.incidentId);
  dom.fieldAssignmentDetail.append(
    element("h3", "", incident?.title || "Incident unavailable"),
    element("p", "", incident ? `${humanize(incident.priority)} priority · ${coordinateText(incident.location)}` : "Incident details unavailable"),
    element("p", "", `Assigned ${formatRelative(assignment.assignedAt)} by ${assignment.assignedBy || "unknown actor"}`),
  );
  if (incident?.hazards?.length) {
    dom.fieldAssignmentDetail.append(element("p", "", `Hazards: ${incident.hazards.join(", ")}`));
  }
}

function renderStatusActions(unit) {
  dom.statusActions.replaceChildren();
  dom.currentUnitStatus.textContent = unit ? humanize(unit.status) : "Select a unit";
  if (!unit) {
    dom.statusHelp.textContent = "Select a unit to view its allowed transitions.";
    return;
  }
  const assignment = activeAssignmentForUnit(unit.id);
  const nextStatuses = (STATUS_TRANSITIONS[unit.status] || []).filter(
    (status) => status !== "unavailable" || !unit.activeAssignmentId,
  );
  for (const nextStatus of nextStatuses) {
    const button = element("button", nextStatus === "unavailable" ? "button button-danger" : "button button-secondary", statusActionLabel(nextStatus));
    button.type = "button";
    const blockedEnRoute = nextStatus === "en_route" && assignment?.status !== "acknowledged";
    button.disabled = blockedEnRoute;
    if (blockedEnRoute) button.title = "Acknowledge the assignment before going en route.";
    button.addEventListener("click", () => updateUnitStatus(nextStatus, button));
    dom.statusActions.append(button);
  }
  dom.statusHelp.textContent = nextStatuses.length
    ? "Changing to Available from On scene also clears the active assignment."
    : "No server-supported transition is available from this state.";
}

function renderLocation(unit) {
  const location = unit ? locationForUnit(unit.id) : null;
  dom.browserLocationButton.disabled = !unit;
  if (!location) {
    setStatusBadge(dom.locationFreshness, "neutral", "Unknown");
    dom.locationSummary.textContent = unit ? "No position reported." : "Select a unit to report a position.";
    return;
  }
  setStatusBadge(dom.locationFreshness, location.freshness, humanize(location.freshness));
  dom.locationSummary.textContent = `${coordinateText(location)} ±${formatNumber(location.accuracyMeters, 0)} m · ${formatRelative(location.capturedAt)}`;
}

function renderAuditFilters() {
  const selected = dom.auditTypeFilter.value || "all";
  const types = [...new Set(appState.auditEvents.map((event) => String(event.type)))].sort();
  dom.auditTypeFilter.replaceChildren();
  const all = element("option", "", "All event types");
  all.value = "all";
  dom.auditTypeFilter.append(all);
  for (const type of types) {
    const option = element("option", "", humanize(type));
    option.value = type;
    dom.auditTypeFilter.append(option);
  }
  dom.auditTypeFilter.value = types.includes(selected) ? selected : "all";
}

function renderAuditLog() {
  if (!dom.auditList) return;
  const search = dom.auditSearch.value.trim().toLocaleLowerCase();
  const type = dom.auditTypeFilter.value || "all";
  const events = [...appState.auditEvents]
    .filter((event) => type === "all" || event.type === type)
    .filter((event) => !search || auditSearchText(event).includes(search))
    .sort((a, b) => Number(b.sequence) - Number(a.sequence));
  dom.auditCount.textContent = String(events.length);
  dom.auditList.replaceChildren();
  if (events.length === 0) {
    const item = document.createElement("li");
    item.append(emptyState(appState.auditEvents.length ? "No events match these filters." : "No audit events in this session."));
    dom.auditList.append(item);
    return;
  }
  for (const event of events) {
    const item = element("li", "audit-event");
    item.append(
      element("span", "audit-sequence", `#${event.sequence ?? "—"}`),
      groupedText("audit-primary", humanize(event.type), event.actorRole || "unknown role"),
      groupedText(
        "audit-detail",
        `${event.subject?.type || "subject"}: ${shorten(event.subject?.id || "unknown", 30)}`,
        `Actor ${event.actorId || "unknown"} · key ${shorten(event.idempotencyKey || "unknown", 22)}`,
      ),
      element("time", "audit-time", formatDateTime(event.occurredAt)),
    );
    dom.auditList.append(item);
  }
}

function renderMap() {
  dom.mapLinks.replaceChildren();
  dom.mapMarkers.replaceChildren();
  const openIncidents = appState.snapshot.incidents.filter((incident) => incident.status === "open" && validCoordinate(incident.location));
  const positionedUnits = appState.snapshot.units
    .map((unit) => ({ unit, location: locationForUnit(unit.id) }))
    .filter(({ location }) => validCoordinate(location));

  for (const assignment of appState.snapshot.assignments) {
    if (!ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)) continue;
    const incident = findIncident(assignment.incidentId);
    const location = locationForUnit(assignment.unitId);
    if (!validCoordinate(incident?.location) || !validCoordinate(location)) continue;
    const from = projectCoordinate(location);
    const to = projectCoordinate(incident.location);
    const line = svgElement("line", "map-assignment-line");
    setSvgAttributes(line, { x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    dom.mapLinks.append(line);
  }

  for (const incident of openIncidents) {
    dom.mapMarkers.append(
      createMapMarker({
        kind: "incident",
        id: incident.id,
        label: shorten(incident.title || "Incident", 18),
        description: `${humanize(incident.priority)} priority incident: ${incident.title || "Untitled"}`,
        location: incident.location,
        selected: incident.id === appState.selectedIncidentId,
        priority: knownPriority(incident.priority),
      }),
    );
  }
  for (const { unit, location } of positionedUnits) {
    dom.mapMarkers.append(
      createMapMarker({
        kind: "unit",
        id: unit.id,
        label: shorten(unit.callSign || "Unit", 14),
        description: `${unit.callSign || "Unit"}, ${humanize(unit.status)}, ${humanize(location.freshness)} position`,
        location,
        selected: unit.id === (appState.view === "field" ? appState.activeUnitId : appState.selectedUnitId),
        freshness: location.freshness,
      }),
    );
  }
  const plotted = openIncidents.length + positionedUnits.length;
  dom.mapEmpty.hidden = plotted > 0;
  dom.mapSummary.textContent = `${openIncidents.length} open incident${openIncidents.length === 1 ? "" : "s"} · ${positionedUnits.length} positioned unit${positionedUnits.length === 1 ? "" : "s"}`;
}

function createMapMarker({ kind, id, label, description, location, selected, priority, freshness }) {
  const point = projectCoordinate(location);
  const group = svgElement("g", `map-marker map-${kind}`);
  group.classList.toggle("is-selected", selected);
  group.classList.toggle("is-edge", point.clamped);
  group.classList.toggle("is-stale", freshness === "stale");
  if (kind === "incident") group.classList.add(`priority-${priority}`);
  group.setAttribute("transform", `translate(${point.x} ${point.y})`);
  group.setAttribute("role", "button");
  group.setAttribute("tabindex", "0");
  group.setAttribute("aria-label", description);
  const title = svgElement("title");
  title.textContent = description;
  const halo = svgElement("circle", "marker-halo");
  setSvgAttributes(halo, { r: 15 });
  const core = svgElement("circle", "marker-core");
  setSvgAttributes(core, { r: kind === "incident" ? 8 : 7 });
  const text = svgElement("text");
  setSvgAttributes(text, { x: 20, y: -12 });
  text.textContent = label;
  group.append(title, halo, core, text);
  const select = () => {
    if (kind === "incident") appState.selectedIncidentId = id;
    if (kind === "unit") {
      if (appState.view === "field") appState.activeUnitId = id;
      else appState.selectedUnitId = id;
    }
    renderIdentity();
    renderDispatcher();
    renderFieldView();
    renderMap();
  };
  group.addEventListener("click", select);
  group.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  });
  return group;
}

function projectCoordinate(location) {
  const rawX = ((Number(location.longitude) - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * 1000;
  const rawY = ((MAP_BOUNDS.north - Number(location.latitude)) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * 600;
  const x = clamp(rawX, 24, 976);
  const y = clamp(rawY, 24, 552);
  return { x: round(x, 2), y: round(y, 2), clamped: x !== rawX || y !== rawY };
}

function showAlert(kind, title, message, retry) {
  const alert = element("div", `alert is-${kind}`);
  alert.setAttribute("role", kind === "error" ? "alert" : "status");
  const content = document.createElement("div");
  content.append(element("strong", "", title), element("span", "", message));
  const actions = element("div", "alert-actions");
  if (retry) {
    const retryButton = element("button", "button button-small", "Retry safely");
    retryButton.type = "button";
    retryButton.addEventListener("click", retry);
    actions.append(retryButton);
  }
  const dismiss = element("button", "button button-quiet button-small", "Dismiss");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss notification");
  dismiss.addEventListener("click", () => alert.remove());
  actions.append(dismiss);
  alert.append(content, actions);
  dom.alertRegion.replaceChildren(alert);
}

function setConnection(state, text) {
  dom.connectionState.className = `connection-pill is-${state}`;
  dom.connectionState.textContent = text;
}

function updateSyncLabel() {
  if (!appState.lastSyncAt) {
    dom.lastSync.textContent = "No state received yet";
    return;
  }
  dom.lastSync.textContent = `Last server state ${formatRelative(appState.lastSyncAt)}`;
}

function setStatusBadge(node, status, label) {
  node.className = `status-badge status-${KNOWN_STATUSES.has(status) ? status : "neutral"}`;
  node.textContent = label;
}

function findIncident(id) {
  return appState.snapshot.incidents.find((item) => item.id === id) || null;
}

function findUnit(id) {
  return appState.snapshot.units.find((item) => item.id === id) || null;
}

function activeAssignmentForUnit(unitId) {
  const unit = findUnit(unitId);
  if (!unit?.activeAssignmentId) return null;
  return appState.snapshot.assignments.find((item) => item.id === unit.activeAssignmentId) || null;
}

function locationForUnit(unitId) {
  return appState.snapshot.locations.find((item) => item.unitId === unitId) || null;
}

function compareIncidents(a, b) {
  if (a.status !== b.status) return a.status === "open" ? -1 : 1;
  const priority = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
  if (priority !== 0) return priority;
  return Date.parse(b.openedAt || 0) - Date.parse(a.openedAt || 0);
}

function assignmentHelp(incident, unit) {
  if (!incident) return "Select an incident.";
  if (incident.status !== "open") return "Closed incidents cannot receive assignments.";
  if (!unit) return "Select a unit.";
  if (unit.status !== "available" || unit.activeAssignmentId) return `${unit.callSign} is not available for assignment.`;
  return "Select an open incident and available unit.";
}

function definitionRow(label, value) {
  const row = element("div", "definition-row");
  row.append(element("span", "", label), element("strong", "", value || "—"));
  return row;
}

function groupedText(className, primary, secondary) {
  const group = element("div", className);
  group.append(element("strong", "", primary), element("span", "", secondary));
  return group;
}

function emptyState(message) {
  return element("div", "empty-state", message);
}

function element(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== "") node.textContent = String(text);
  return node;
}

function svgElement(tagName, className = "") {
  const node = document.createElementNS(SVG_NS, tagName);
  if (className) node.setAttribute("class", className);
  return node;
}

function setSvgAttributes(node, attributes) {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
}

function validCoordinate(value) {
  return value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude));
}

function commaSeparated(value, limit) {
  return [...new Set(String(value || "").split(",").map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function auditSearchText(event) {
  return [event.type, event.actorId, event.actorRole, event.subject?.type, event.subject?.id]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function describeError(error) {
  const suffix = error.code ? ` (${humanize(error.code)})` : "";
  return `${error.message || "Unexpected request error."}${suffix}`;
}

function geolocationMessage(error) {
  if (error.code === 1) return "Location permission was denied. Use manual entry if operationally appropriate.";
  if (error.code === 2) return "The browser could not determine a position.";
  if (error.code === 3) return "The browser location request timed out.";
  return "The browser could not provide a position.";
}

function statusActionLabel(status) {
  const labels = {
    available: "Mark available / clear",
    en_route: "Go en route",
    on_scene: "Mark on scene",
    unavailable: "Mark unavailable",
  };
  return labels[status] || `Mark ${humanize(status)}`;
}

function coordinateText(location) {
  if (!validCoordinate(location)) return "Coordinates unavailable";
  return `${formatNumber(location.latitude, 5)}, ${formatNumber(location.longitude, 5)}`;
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function formatRelative(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "at an unknown time";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function humanize(value) {
  return String(value || "unknown").replaceAll("_", " ").replaceAll(".", " ");
}

function knownPriority(value) {
  return Object.hasOwn(PRIORITY_ORDER, value) ? value : "medium";
}

function shorten(value, maxLength) {
  const text = String(value);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
