import { Api } from "./api.js";
import { OperationsMap } from "./map.js";
import { PeerRadio } from "./radio.js";
import {
  $,
  escape as e,
  label,
  badge,
  time,
  date,
  since,
  coords,
  distance,
  km,
  directions,
  empty,
  icon,
  logo,
  toast,
} from "./ui.js";

const api = new Api();
const state = { incidents: [], units: [], assignments: [], locations: [] };
let context = { units: [] },
  selectedId = "",
  view = "dispatch",
  filter = "open",
  search = "",
  revision = 0;
let activeCommand = false,
  editorSubmit,
  editorKey,
  pendingPoint = null,
  polling = false;
let lastSnapshot = "",
  lastMessages = "",
  knownAssignments = null,
  historyEvents = [],
  historySearch = "";
const nav = [
  ["dispatch", "Central de operaciones", "Central"],
  ["field", "Mi equipo", "Mi equipo"],
  ["radio", "Comunicaciones", "Radio"],
  ["admin", "Administración", "Admin"],
  ["history", "Registro de actividad", "Registro"],
];
const PRIORITIES = { critical: 0, high: 1, medium: 2, low: 3 };
/** Quick-start templates for the most common call types. */
const INCIDENT_TYPES = [
  ["Incendio en vivienda", "high", "Humo, Posibles atrapados"],
  ["Incendio forestal", "critical", "Viento, Propagación"],
  ["Incendio de vehículo", "medium", "Combustible"],
  ["Accidente de tráfico", "high", "Atrapados, Tráfico"],
  ["Rescate en altura", "high", "Altura"],
  ["Persona atrapada en ascensor", "medium", ""],
  ["Fuga de gas", "critical", "Gas, Explosión"],
  ["Inundación / achique", "medium", "Agua, Electricidad"],
  ["Árbol o elemento caído", "low", "Tráfico"],
  ["Rescate en el mar", "critical", "Agua"],
];
/** Approximate district centres to place an incident without the map. */
const ZONES = [
  ["Centro Histórico", 36.7213, -4.4214],
  ["Soho / Puerto", 36.7163, -4.4236],
  ["La Malagueta", 36.7196, -4.4089],
  ["El Palo / Pedregalejo", 36.7215, -4.3645],
  ["Ciudad Jardín", 36.7431, -4.4198],
  ["Bailén-Miraflores", 36.7329, -4.4386],
  ["Cruz de Humilladero", 36.7188, -4.4466],
  ["Carretera de Cádiz", 36.7033, -4.4497],
  ["Teatinos-Universidad", 36.7229, -4.4764],
  ["Puerto de la Torre", 36.7458, -4.4906],
  ["Churriana", 36.6666, -4.5039],
  ["Campanillas", 36.7314, -4.5405],
  ["Aeropuerto", 36.6749, -4.4991],
];
const radio = new PeerRadio(api, renderRadio);
const map = new OperationsMap(
  (id) => {
    selectedId = id;
    renderOperational();
  },
  (point) => {
    if (api.actor.role !== "dispatcher" || view !== "dispatch") return;
    pendingPoint = point;
    map.setPending(point);
    toast(
      `Ubicación fijada (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}). Pulsa «Nueva intervención» para crear el aviso aquí.`,
    );
  },
);

$("#brand-logo").innerHTML = logo();
$("#mobile-logo").innerHTML = logo();
$("#search-icon").innerHTML = icon("search");
$("#navigation").innerHTML = nav
  .map(
    ([id, title, short]) =>
      `<a href="#${id}" data-view="${id}" aria-label="${title}">${icon(id)}<span class="nav-long">${title}</span><span class="nav-short">${short}</span>${id === "radio" ? '<i class="nav-dot"></i>' : ""}</a>`,
  )
  .join("");
$("#fit-map").onclick = () => map.fit();
$("#incident-search").oninput = (event) => {
  search = event.target.value;
  renderList();
};
$("#incident-filters").onclick = (event) => {
  const button = event.target.closest("[data-filter]");
  if (button) {
    filter = button.dataset.filter;
    renderList();
  }
};
$("#profile").onchange = async (event) => {
  await setProfile(event.target.value);
  location.hash =
    api.actor.role === "crew_leader"
      ? "#field"
      : api.actor.role === "system_admin"
        ? "#admin"
        : "#dispatch";
  await refresh();
  render();
};
window.addEventListener("hashchange", () => changeView());
window.addEventListener("offline", () => {
  $("#connection").textContent = "Sin conexión";
  $("#connection").classList.add("offline");
});
window.addEventListener("online", () => refresh());
window.addEventListener("keydown", (event) => {
  if ($("#editor").open || event.metaKey || event.ctrlKey || event.altKey)
    return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (view !== "dispatch") return;
  if (event.key === "/") {
    event.preventDefault();
    $("#incident-search").focus();
  } else if (
    event.key.toLowerCase() === "n" &&
    api.actor.role === "dispatcher"
  ) {
    event.preventDefault();
    editIncident();
  }
});
$("#close-editor").onclick = $("#cancel-editor").onclick = () =>
  $("#editor").close();
$("#editor-form").onsubmit = async (event) => {
  event.preventDefault();
  if (activeCommand) return;
  activeCommand = true;
  $("#save-editor").disabled = true;
  $("#form-error").textContent = "";
  try {
    await editorSubmit(
      Object.fromEntries(new FormData(event.target)),
      editorKey,
    );
    $("#editor").close();
    await refresh();
    toast("Cambios guardados.");
  } catch (error) {
    $("#form-error").textContent = error.message;
  } finally {
    activeCommand = false;
    $("#save-editor").disabled = false;
  }
};
// A changed payload is a new command; an unchanged retry retains the same key.
$("#editor-form").addEventListener("input", () => {
  editorKey = crypto.randomUUID();
});

/* Theme: dark control-room by default, day mode for tablets in sunlight. */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#theme-toggle").innerHTML =
    theme === "light"
      ? `${icon("moon")}<span>Modo noche</span>`
      : `${icon("sun")}<span>Modo día</span>`;
  $("#theme-toggle").setAttribute(
    "aria-label",
    theme === "light" ? "Cambiar a modo noche" : "Cambiar a modo día",
  );
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", theme === "light" ? "#f4f5f8" : "#0d1117");
}
let theme = "dark";
try {
  theme = localStorage.getItem("brigada-theme") || "dark";
} catch {
  /* Storage can be blocked; the default theme still applies. */
}
applyTheme(theme);
$("#theme-toggle").onclick = () => {
  theme = theme === "light" ? "dark" : "light";
  applyTheme(theme);
  try {
    localStorage.setItem("brigada-theme", theme);
  } catch {
    /* Preference is optional. */
  }
};

function tick() {
  const now = new Date();
  $("#clock").textContent = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  $("#clock-date").textContent = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  document.querySelectorAll("[data-since]").forEach((node) => {
    node.textContent = since(node.dataset.since);
  });
}
tick();
setInterval(tick, 1000);

async function setProfile(profile) {
  ++revision;
  await radio.disconnect();
  api.setProfile(profile);
  selectedId = "";
  knownAssignments = null;
  Object.assign(state, {
    incidents: [],
    units: [],
    assignments: [],
    locations: [],
  });
  $("#profile").value = profile;
}

async function changeView() {
  if (location.hash === "#main") return;
  const next = location.hash.slice(1);
  view = nav.some(([id]) => id === next) ? next : "dispatch";
  if (view === "field" && api.actor.role !== "crew_leader") {
    if (context.units.length) await setProfile(`unit:${context.units[0].id}`);
  } else if (
    ["admin", "history"].includes(view) &&
    api.actor.role !== "system_admin"
  )
    await setProfile("system_admin");
  else if (view === "dispatch" && api.actor.role !== "dispatcher")
    await setProfile("dispatcher");
  if (view !== "dispatch") {
    pendingPoint = null;
    map.setPending(null);
  }
  render();
  await refresh();
}

async function refresh() {
  if (polling) return;
  polling = true;
  const current = revision;
  try {
    const [snapshot, local] = await Promise.all([
      api.request("/v1/state"),
      api.request("/v1/local-context"),
    ]);
    if (current !== revision) return;
    const signature = JSON.stringify({ snapshot, local, revision, view });
    const changed = signature !== lastSnapshot;
    lastSnapshot = signature;
    Object.assign(state, snapshot);
    context = local;
    if (!state.incidents.some((item) => item.id === selectedId))
      selectedId = sortedIncidents()[0]?.id || "";
    const profile = api.actor.unitId
      ? `unit:${api.actor.unitId}`
      : api.actor.role;
    const options =
      '<option value="dispatcher">Central · coordinación</option><option value="system_admin">Administración</option>' +
      context.units
        .map(
          (u) =>
            `<option value="unit:${e(u.id)}">${e(u.callSign)} · equipo</option>`,
        )
        .join("");
    if ($("#profile").innerHTML !== options) {
      $("#profile").innerHTML = options;
      $("#profile").value = profile;
    }
    $("#connection").textContent = "Servidor conectado";
    $("#connection").classList.remove("offline");
    $("#sync-label").textContent = `Sincronizado a las ${time(new Date())}`;
    $("#notice").classList.remove("error");
    $("#notice").textContent = context.training
      ? "Entrenamiento"
      : "Espacio local";
    $("#notice").title =
      `Perfiles de desarrollo · ${context.persistent ? "datos guardados en SQLite" : "datos en memoria"}. No introduzcas datos reales.`;
    announceAssignmentChanges();
    if (changed) render();
    if (view === "history" && changed) await renderHistory();
  } catch (error) {
    if (current !== revision) return;
    $("#connection").textContent = "Sin conexión al servidor";
    $("#connection").classList.add("offline");
    $("#notice").classList.add("error");
    $("#notice").textContent = "Datos posiblemente desactualizados";
    $("#notice").title = error.message;
  } finally {
    polling = false;
  }
}

/** Alerts the dispatcher about rejections and the crew about new calls. */
function announceAssignmentChanges() {
  const current = new Map(state.assignments.map((a) => [a.id, a.status]));
  if (knownAssignments) {
    for (const assignment of state.assignments) {
      const before = knownAssignments.get(assignment.id);
      if (before === assignment.status) continue;
      const unit = state.units.find((u) => u.id === assignment.unitId);
      if (api.actor.role === "dispatcher" && assignment.status === "rejected")
        toast(
          `${unit?.callSign || "Un equipo"} ha rechazado la asignación${assignment.rejectionReason ? `: ${assignment.rejectionReason}` : "."}`,
          true,
        );
      if (api.actor.role === "crew_leader" && assignment.status === "pending")
        alertCrew();
    }
  }
  knownAssignments = current;
}
function alertCrew() {
  navigator.vibrate?.([300, 120, 300, 120, 600]);
  try {
    const audio = new AudioContext();
    [0, 0.35, 0.7].forEach((offset) => {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.type = "square";
      tone.frequency.value = 880;
      gain.gain.value = 0.06;
      tone.connect(gain).connect(audio.destination);
      tone.start(audio.currentTime + offset);
      tone.stop(audio.currentTime + offset + 0.22);
    });
    setTimeout(() => audio.close(), 1500);
  } catch {
    /* Audio may be blocked until the user interacts with the page. */
  }
}

function sortedIncidents() {
  return [...state.incidents].sort(
    (a, b) =>
      (a.status === "closed") - (b.status === "closed") ||
      PRIORITIES[a.priority] - PRIORITIES[b.priority] ||
      b.openedAt.localeCompare(a.openedAt),
  );
}
function currentIncident() {
  return state.incidents.find((item) => item.id === selectedId);
}
function activeAssignments(incidentId) {
  return state.assignments.filter(
    (a) =>
      a.incidentId === incidentId &&
      ["pending", "acknowledged"].includes(a.status),
  );
}
function currentUnit() {
  return state.units.find((unit) => unit.id === api.actor.unitId);
}
function unitLocation(unitId) {
  return state.locations.find((p) => p.unitId === unitId);
}
function incidentNumber(incident) {
  const index = [...state.incidents]
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .indexOf(incident);
  return `INT-${String(index + 1).padStart(3, "0")}`;
}

function render() {
  const titles = {
    dispatch: ["Coordinación en tiempo real", "Central de operaciones"],
    field: ["Contigo sobre el terreno", "Mi equipo"],
    radio: ["Canal directo de intervención", "Comunicaciones"],
    admin: ["Dotaciones y recursos", "Administración"],
    history: ["Trazabilidad de operaciones", "Registro de actividad"],
  };
  const [eyebrow, title] = titles[view];
  document.body.dataset.view = view;
  $("#eyebrow").textContent = eyebrow;
  $("#page-title").textContent = title;
  document.querySelectorAll("[data-view]").forEach((item) => {
    if (item === document.body) return;
    item.classList.toggle("active", item.dataset.view === view);
    if (item.dataset.view === view) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  $(".nav-dot").classList.toggle("live", Boolean(radio.session));
  $("#page-actions").innerHTML =
    view === "dispatch" && api.actor.role === "dispatcher"
      ? `<button class="button primary" id="new-incident" title="Atajo: N" aria-label="Nueva intervención">${icon("plus")}<span>Nueva intervención</span></button>`
      : view === "admin"
        ? `<button class="button primary" id="new-unit" aria-label="Registrar equipo">${icon("plus")}<span>Registrar equipo</span></button>`
        : "";
  if ($("#new-incident")) $("#new-incident").onclick = editIncident;
  if ($("#new-unit")) $("#new-unit").onclick = () => editUnit();
  $("#operational-layout").hidden = !["dispatch", "field"].includes(view);
  $("#field-panel").hidden = view !== "field";
  $("#admin-panel").hidden = view !== "admin";
  $("#history-panel").hidden = view !== "history";
  $("#radio-panel").hidden = view !== "radio";
  $("#stats").hidden = !["dispatch", "admin"].includes(view);
  renderStats();
  renderOperational();
  if (view === "field") renderField();
  if (view === "admin") renderAdmin();
  if (view === "radio") renderRadio();
}

function renderStats() {
  const active = state.incidents.filter((i) => i.status === "open");
  const available = state.units.filter((u) => u.status === "available");
  const busy = state.units.filter((u) =>
    ["assigned", "en_route", "on_scene"].includes(u.status),
  );
  const pending = state.assignments.filter((a) => a.status === "pending");
  const stale = state.locations.filter((p) => p.freshness === "stale");
  const byPriority = ["critical", "high", "medium", "low"]
    .map((p) => [p, active.filter((i) => i.priority === p).length])
    .filter(([, count]) => count)
    .map(
      ([p, count]) =>
        `<span class="mini ${p}">${count} ${label(p).toLowerCase()}</span>`,
    )
    .join("");
  const stats = [
    [
      "Intervenciones activas",
      active.length,
      byPriority || "Sin avisos abiertos",
      "flame",
      active.some((i) => i.priority === "critical") ? "alarm" : "",
    ],
    [
      "Dotaciones disponibles",
      `${available.length}<small>/${state.units.length}</small>`,
      "Listas para salir",
      "field",
      available.length ? "" : "warn",
    ],
    [
      "En servicio",
      busy.length,
      "Asignadas, en camino o en el lugar",
      "route",
      "",
    ],
    [
      "Pendientes de confirmar",
      pending.length,
      "Esperando respuesta del equipo",
      "clock",
      pending.length ? "warn" : "",
    ],
    [
      "Posiciones antiguas",
      stale.length,
      "Revisar comunicación con la dotación",
      "locate",
      stale.length ? "warn" : "",
    ],
  ];
  $("#stats").innerHTML = stats
    .map(
      ([name, count, hint, image, tone]) =>
        `<article class="stat ${tone}"><span class="stat-icon">${icon(image)}</span><div><span class="stat-label">${name}</span><strong>${count}</strong><small>${hint}</small></div></article>`,
    )
    .join("");
}

function renderOperational() {
  renderList();
  renderDetail();
  renderUnitBoard();
  map.render(state, selectedId);
}
function renderList() {
  const incidents = sortedIncidents().filter(
    (i) =>
      (filter === "all" || i.status === filter) &&
      `${i.title} ${i.description}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );
  $("#incident-count").textContent = String(incidents.length);
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === filter);
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === filter),
    );
  });
  $("#incident-list").innerHTML = incidents.length
    ? incidents
        .map((incident) => {
          const units = activeAssignments(incident.id)
            .map((a) => state.units.find((u) => u.id === a.unitId))
            .filter(Boolean);
          const open = incident.status === "open";
          return `<button class="incident-card p-${e(incident.priority)} ${incident.id === selectedId ? "selected" : ""} ${open ? "" : "is-closed"}" data-incident="${e(incident.id)}" aria-pressed="${incident.id === selectedId}"><div class="card-top"><span class="record-number">${incidentNumber(incident)}</span>${open ? badge(incident.priority) : badge("closed")}</div><h3>${e(incident.title)}</h3><p>${e(incident.description)}</p><div class="card-bottom"><span class="unit-chips">${units.length ? units.map((u) => `<span class="chip s-${e(u.status)}">${e(u.callSign)}</span>`).join("") : open ? '<span class="chip warn">Sin dotación</span>' : ""}</span>${open ? `<span class="elapsed">${icon("clock")}<span data-since="${e(incident.openedAt)}">${since(incident.openedAt)}</span></span>` : `<span class="elapsed">${time(incident.closedAt || incident.openedAt)}</span>`}</div>${incident.hazards.length ? `<div class="card-hazard">${icon("alert")}${e(incident.hazards.join(" · "))}</div>` : ""}</button>`;
        })
        .join("")
    : empty(
        "Sin intervenciones",
        search
          ? "Prueba otra búsqueda."
          : "Los avisos de este espacio aparecerán aquí.",
      );
  $("#incident-list")
    .querySelectorAll("[data-incident]")
    .forEach((button) => {
      button.onclick = () => {
        selectedId = button.dataset.incident;
        renderOperational();
        map.focus(currentIncident().location);
      };
    });
}

function renderDetail() {
  const incident = currentIncident();
  if (!incident) {
    $("#detail").innerHTML = empty(
      "Todo bajo control",
      "Selecciona o crea una intervención para ver sus detalles.",
    );
    return;
  }
  const assignments = activeAssignments(incident.id);
  const dispatcher = api.actor.role === "dispatcher";
  const open = incident.status === "open";
  const available = state.units
    .filter((u) => u.status === "available")
    .map((unit) => {
      const position = unitLocation(unit.id);
      return {
        unit,
        km: position ? distance(position, incident.location) : Infinity,
      };
    })
    .sort((a, b) => a.km - b.km);
  const nearest = available[0];
  $("#detail").innerHTML =
    `<div class="detail-heading p-${e(incident.priority)}">
    <div class="detail-tags"><span class="record-number">${incidentNumber(incident)}</span>${badge(incident.priority)}${badge(incident.status)}</div>
    <h2>${e(incident.title)}</h2>
    <div class="detail-meta">${icon("clock")} Abierta a las ${time(incident.openedAt)}${open ? ` · hace <strong data-since="${e(incident.openedAt)}">${since(incident.openedAt)}</strong>` : ""}</div>
  </div>
  <div class="detail-body">
    <p class="detail-description">${e(incident.description || "Sin observaciones adicionales.")}</p>
    ${incident.hazards.length ? `<div class="hazards">${icon("alert")}<div><strong>Riesgos</strong><span>${incident.hazards.map((h) => `<span class="hazard-chip">${e(h)}</span>`).join("")}</span></div></div>` : ""}
    <div class="location-row">${icon("pin")}<span class="mono">${coords(incident.location)}</span><button class="text-button" id="locate-incident">Ver en mapa</button><a class="text-button" href="${directions(incident.location)}" target="_blank" rel="noreferrer">Cómo llegar ↗</a></div>
    ${incident.closeReason ? `<div class="close-reason"><strong>Cierre:</strong> ${e(incident.closeReason)}</div>` : ""}
    <div class="section-label">Dotaciones asignadas</div>
    ${
      assignments.length
        ? assignments
            .map((a) => {
              const unit = state.units.find((u) => u.id === a.unitId);
              const position = unitLocation(a.unitId);
              return `<div class="assignment-row"><span class="unit-avatar s-${e(unit?.status)}">${icon("field")}</span><div class="assignment-unit"><strong>${e(unit?.callSign || "Equipo")}</strong><small>${e(label(unit?.status))}${position ? ` · a ${km(distance(position, incident.location))}` : ""}</small></div>${badge(a.status)}${dispatcher ? `<button class="text-button danger" data-recall="${e(a.id)}">Retirar</button>` : ""}</div>`;
            })
            .join("")
        : '<p class="muted small-text">Todavía no hay dotaciones asignadas.</p>'
    }
    ${
      dispatcher && open
        ? `<div class="assign-box">${nearest ? `<button class="suggestion" id="suggest-unit" data-unit="${e(nearest.unit.id)}">${icon("target")}<span>Más cercana: <strong>${e(nearest.unit.callSign)}</strong>${Number.isFinite(nearest.km) ? ` a ${km(nearest.km)}` : ""}</span></button>` : '<p class="muted small-text">No hay dotaciones disponibles ahora mismo.</p>'}<div class="assign-controls"><select id="assign-unit" aria-label="Equipo a asignar"><option value="">Seleccionar dotación disponible</option>${available.map(({ unit, km: d }) => `<option value="${e(unit.id)}">${e(unit.callSign)} · ${e(unit.name)}${Number.isFinite(d) ? ` · ${km(d)}` : ""}</option>`).join("")}</select><button class="button primary small" id="assign-button" ${available.length ? "" : "disabled"}>Asignar</button></div></div>`
        : ""
    }
  </div>
  <div class="detail-footer">${open ? `<button id="open-channel" class="button secondary small">${icon("radio")} Abrir canal directo</button>` : ""}${dispatcher && open ? `<button id="close-incident" class="button ghost-danger small" ${assignments.length ? 'disabled title="Retira o finaliza las asignaciones antes de cerrar"' : ""}>Cerrar intervención</button>` : ""}</div>`;
  $("#locate-incident").onclick = () => map.focus(incident.location);
  if ($("#suggest-unit"))
    $("#suggest-unit").onclick = () => {
      $("#assign-unit").value = $("#suggest-unit").dataset.unit;
      $("#assign-button").focus();
    };
  if ($("#assign-button"))
    $("#assign-button").onclick = async () => {
      const unitId = $("#assign-unit").value;
      if (!unitId) return toast("Selecciona una dotación disponible.", true);
      await command(
        "/v1/assignments",
        { incidentId: incident.id, unitId },
        "Dotación asignada. Esperando confirmación.",
      );
    };
  $("#detail")
    .querySelectorAll("[data-recall]")
    .forEach((button) => {
      button.onclick = () =>
        reasonDialog(
          "Retirar equipo",
          "Motivo de la retirada",
          "/v1/assignment-cancellations",
          { assignmentId: button.dataset.recall },
        );
    });
  if ($("#close-incident"))
    $("#close-incident").onclick = () =>
      reasonDialog(
        "Cerrar intervención",
        "Resumen y motivo del cierre",
        "/v1/incident-closures",
        { incidentId: incident.id },
      );
  if ($("#open-channel"))
    $("#open-channel").onclick = async () => {
      if (radio.session && radio.incidentId !== incident.id)
        await radio.disconnect();
      if ($("#channel-select")) $("#channel-select").value = incident.id;
      location.hash = "radio";
    };
}

function renderUnitBoard() {
  if (view !== "dispatch") return;
  const order = [
    "available",
    "assigned",
    "en_route",
    "on_scene",
    "unavailable",
  ];
  const units = [...state.units].sort(
    (a, b) =>
      order.indexOf(a.status) - order.indexOf(b.status) ||
      a.callSign.localeCompare(b.callSign),
  );
  $("#unit-board").innerHTML =
    `<div class="panel-heading"><strong>Dotaciones</strong><span class="board-summary">${order
      .map((status) => [
        status,
        state.units.filter((u) => u.status === status).length,
      ])
      .filter(([, count]) => count)
      .map(
        ([status, count]) =>
          `<span class="mini s-${status}">${count} ${label(status).toLowerCase()}</span>`,
      )
      .join("")}</span></div><div class="unit-grid">${
      units
        .map((unit) => {
          const position = unitLocation(unit.id);
          const assignment = state.assignments.find(
            (a) => a.id === unit.activeAssignmentId,
          );
          const mission = state.incidents.find(
            (i) => i.id === assignment?.incidentId,
          );
          return `<button class="unit-tile s-${e(unit.status)}" data-unit-focus="${e(unit.id)}" ${position ? "" : "disabled"}><span class="unit-tile-top"><strong>${e(unit.callSign)}</strong><span class="status-text">${e(label(unit.status))}</span></span><small>${e(mission ? mission.title : unit.name)}</small>${position?.freshness === "stale" ? '<span class="stale-flag">Posición antigua</span>' : ""}</button>`;
        })
        .join("") ||
      '<p class="muted small-text">Sin dotaciones registradas.</p>'
    }</div>`;
  $("#unit-board")
    .querySelectorAll("[data-unit-focus]")
    .forEach((button) => {
      button.onclick = () => {
        const position = unitLocation(button.dataset.unitFocus);
        if (position) map.focus(position);
      };
    });
}

function renderField() {
  const unit = currentUnit();
  if (!unit) {
    $("#field-panel").innerHTML = empty(
      "Selecciona un equipo",
      "Registra equipos desde Administración y elige un perfil en la parte superior.",
      "field",
    );
    return;
  }
  const assignment = state.assignments.find(
    (a) => a.id === unit.activeAssignmentId,
  );
  const mission = state.incidents.find(
    (item) => item.id === assignment?.incidentId,
  );
  const position = unitLocation(unit.id);
  const pending = assignment?.status === "pending";
  const transitions = {
    available: ["unavailable"],
    unavailable: ["available"],
    assigned: assignment?.status === "acknowledged" ? ["en_route"] : [],
    en_route: ["on_scene"],
    on_scene: ["available"],
  };
  const actions = {
    available: "Finalizar y quedar disponible",
    unavailable: "Marcar no disponible",
    en_route: "Iniciar salida",
    on_scene: "Confirmar llegada",
  };
  if (unit.status === "unavailable")
    actions.available = "Volver a estar disponible";
  const steps = [
    ["Aviso", ["assigned"].includes(unit.status) && pending],
    ["Confirmado", unit.status === "assigned" && !pending],
    ["En camino", unit.status === "en_route"],
    ["En el lugar", unit.status === "on_scene"],
  ];
  const currentStep = steps.findIndex(([, on]) => on);
  document.title = pending
    ? "¡Nuevo aviso! · Brigada Málaga"
    : "Brigada Málaga · Centro de mando";
  const statusButtons = (transitions[unit.status] || [])
    .map((status) => {
      const tone =
        status === "unavailable"
          ? "secondary"
          : status === "available" && unit.status === "on_scene"
            ? "success"
            : "primary";
      return `<button class="button ${tone} xl" data-status="${status}">${actions[status]}</button>`;
    })
    .join("");
  $("#field-panel").innerHTML = `<div class="field-grid">
    <section class="panel unit-card s-${e(unit.status)}">
      <div class="unit-card-head"><span class="unit-avatar big s-${e(unit.status)}">${icon("field")}</span><div><span class="eyebrow">Tu dotación</span><h2>${e(unit.callSign)}</h2><p class="muted">${e(unit.name)}</p></div><span class="status-pill s-${e(unit.status)}">${e(label(unit.status))}</span></div>
      <div class="capabilities">${unit.capabilities.map((c) => `<span class="tag">${e(c)}</span>`).join("")}</div>
      ${mission ? `<ol class="stepper">${steps.map(([name], index) => `<li class="${index < currentStep ? "done" : index === currentStep ? "current" : ""}"><span>${index < currentStep ? icon("check") : index + 1}</span>${name}</li>`).join("")}</ol>` : ""}
    </section>
    ${
      mission
        ? `<section class="panel mission-card ${pending ? "alerting" : ""} p-${e(mission.priority)}">
      ${pending ? `<div class="alert-strip">${icon("alert")} NUEVA ASIGNACIÓN · confirma o rechaza</div>` : ""}
      <div class="mission-head"><div><span class="eyebrow">Misión actual · ${incidentNumber(mission)}</span><h2>${e(mission.title)}</h2></div>${badge(mission.priority)}</div>
      <p>${e(mission.description || "Sin observaciones adicionales.")}</p>
      ${mission.hazards.length ? `<div class="hazards">${icon("alert")}<div><strong>Riesgos</strong><span>${mission.hazards.map((h) => `<span class="hazard-chip">${e(h)}</span>`).join("")}</span></div></div>` : ""}
      <div class="mission-meta"><span>${icon("clock")} Aviso a las ${time(mission.openedAt)} · hace <strong data-since="${e(mission.openedAt)}">${since(mission.openedAt)}</strong></span>${position ? `<span>${icon("route")} A ${km(distance(position, mission.location))}</span>` : ""}</div>
      <div class="mission-links"><a class="button secondary" href="${directions(mission.location)}" target="_blank" rel="noreferrer">${icon("route")} Cómo llegar</a><a class="button secondary" href="#radio">${icon("radio")} Abrir comunicaciones</a></div>
    </section>`
        : `<section class="panel mission-card idle"><span class="idle-icon">${icon("shield")}</span><h2>${unit.status === "unavailable" ? "Fuera de servicio" : "En espera, sin misión"}</h2><p class="muted">${unit.status === "unavailable" ? "Vuelve a estar disponible cuando la dotación esté lista." : "Recibirás un aviso sonoro y visual en cuanto la central te asigne una intervención."}</p></section>`
    }
    <section class="panel field-actions">
      ${pending ? '<button class="button success xl" id="ack-assignment">Confirmar asignación</button><button class="button secondary xl" id="reject-assignment">Rechazar con motivo</button>' : ""}
      ${statusButtons}
      <button class="button secondary xl" id="share-location">${icon("locate")} Compartir mi posición</button>
      <small class="position-note">${position ? `${icon("pin")} ${coords(position)} · ${label(position.freshness)} · ${time(position.capturedAt)}${position.source === "training" ? " · Entrenamiento" : ""}` : "Posición todavía no comunicada"}</small>
    </section>
  </div>`;
  if ($("#ack-assignment"))
    $("#ack-assignment").onclick = () =>
      command(
        "/v1/assignment-responses",
        { assignmentId: assignment.id, decision: "acknowledge" },
        "Asignación confirmada.",
      );
  if ($("#reject-assignment"))
    $("#reject-assignment").onclick = () =>
      reasonDialog(
        "Rechazar asignación",
        "Motivo del rechazo",
        "/v1/assignment-responses",
        { assignmentId: assignment.id, decision: "reject" },
      );
  $("#field-panel")
    .querySelectorAll("[data-status]")
    .forEach((button) => {
      button.onclick = () =>
        command(
          "/v1/unit-status",
          { unitId: unit.id, status: button.dataset.status },
          "Estado actualizado.",
        );
    });
  $("#share-location").onclick = () => {
    if (!navigator.geolocation)
      return toast("La geolocalización no está disponible.", true);
    $("#share-location").disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        command(
          "/v1/locations",
          {
            unitId: unit.id,
            source: "browser_gnss",
            position: {
              latitude: p.coords.latitude,
              longitude: p.coords.longitude,
              accuracyMeters: Math.max(1, p.coords.accuracy),
              capturedAt: new Date(p.timestamp).toISOString(),
            },
          },
          "Posición compartida.",
        ),
      () => {
        toast(
          "No se pudo obtener la posición. Revisa el permiso de ubicación del navegador.",
          true,
        );
        renderField();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };
}

function renderAdmin() {
  $("#admin-panel").innerHTML =
    `<section class="panel"><div class="panel-heading"><div><strong>Directorio de dotaciones</strong><span class="muted"> · recursos de la organización</span></div><span class="count">${state.units.length}</span></div><div class="table-scroll"><table><thead><tr><th>Indicativo / dotación</th><th>Capacidades</th><th>Estado</th><th>Posición</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${state.units
      .map((unit) => {
        const position = unitLocation(unit.id);
        return `<tr><td><div class="unit-identity"><span class="unit-avatar s-${e(unit.status)}">${icon("field")}</span><div><strong>${e(unit.callSign)}</strong><small>${e(unit.name)}</small></div></div></td><td>${unit.capabilities.map((c) => `<span class="tag">${e(c)}</span>`).join("") || "—"}</td><td>${badge(unit.status)}</td><td>${position ? `${badge(position.freshness)}<small class="mono">${coords(position)}</small>` : '<span class="muted">Sin posición</span>'}</td><td><button class="button secondary small" data-edit-unit="${e(unit.id)}">Editar</button></td></tr>`;
      })
      .join(
        "",
      )}</tbody></table>${state.units.length ? "" : empty("Prepara tu primera dotación", "Registra su indicativo, nombre y capacidades.", "field")}</div></section><div class="admin-notes"><article class="panel"><span class="eyebrow">Datos y continuidad</span><h3>Un registro que permanece</h3><p>Intervenciones, dotaciones y actividad se conservan al reiniciar. Las posiciones muestran su antigüedad y cada cambio queda registrado.</p><a class="text-button" href="#history">Consultar actividad →</a></article><article class="panel"><span class="eyebrow">Acceso local</span><h3>Perfiles para probar cada rol</h3><p>El selector superior permite recorrer central, administración y equipos. Es una identidad de desarrollo; el acceso real requiere integrar autenticación antes de publicar.</p></article></div>`;
  $("#admin-panel")
    .querySelectorAll("[data-edit-unit]")
    .forEach((button) => {
      button.onclick = () =>
        editUnit(state.units.find((u) => u.id === button.dataset.editUnit));
    });
}

const eventNames = {
  "unit.registered": "Equipo registrado",
  "unit.updated": "Equipo actualizado",
  "incident.created": "Intervención creada",
  "unit.assigned": "Equipo asignado",
  "assignment.acknowledged": "Asignación confirmada",
  "assignment.rejected": "Asignación rechazada",
  "assignment.cancelled": "Equipo retirado",
  "assignment.cleared": "Asignación finalizada",
  "unit.status_changed": "Estado actualizado",
  "unit.location_recorded": "Posición compartida",
  "incident.closed": "Intervención cerrada",
};
const eventTone = (type) =>
  type.startsWith("incident.")
    ? "incident"
    : type.startsWith("assignment.") || type === "unit.assigned"
      ? "assignment"
      : "unit";
async function renderHistory() {
  const current = revision;
  const { events } = await api.request("/v1/audit-events");
  if (current !== revision || view !== "history") return;
  historyEvents = events;
  if (!$("#history-rows")) {
    $("#history-panel").innerHTML =
      `<section class="panel"><div class="panel-heading"><div><strong>Actividad registrada</strong><span class="muted" id="history-count"></span></div><div class="history-tools"><label class="search-field compact">${icon("search")}<input id="history-search" type="search" placeholder="Filtrar eventos…" aria-label="Filtrar eventos"></label><button class="button secondary small" id="export-audit">${icon("download")} Exportar JSON</button></div></div><div class="table-scroll"><table><thead><tr><th>Nº</th><th>Acción</th><th>Perfil</th><th>Fecha y hora</th></tr></thead><tbody id="history-rows"></tbody></table></div></section>`;
    $("#history-search").oninput = (event) => {
      historySearch = event.target.value;
      renderHistoryRows();
    };
    $("#export-audit").onclick = () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(historyEvents, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "brigada-actividad.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  }
  renderHistoryRows();
}
function renderHistoryRows() {
  const query = historySearch.toLocaleLowerCase("es");
  const rows = [...historyEvents]
    .reverse()
    .filter((event) =>
      `${eventNames[event.type] || event.type} ${event.subject.id} ${label(event.actorRole)} ${event.actorId}`
        .toLocaleLowerCase("es")
        .includes(query),
    );
  $("#history-count").textContent =
    ` · ${rows.length} de ${historyEvents.length} eventos · más recientes primero`;
  $("#history-rows").innerHTML = rows
    .map(
      (event) =>
        `<tr><td><span class="record-number">#${String(event.sequence).padStart(4, "0")}</span></td><td><span class="event-dot ${eventTone(event.type)}"></span><strong>${e(eventNames[event.type] || event.type)}</strong><small class="mono">${e(event.subject.id)}</small></td><td>${e(label(event.actorRole))}<small>${e(event.actorId)}</small></td><td class="mono">${date(event.occurredAt)}</td></tr>`,
    )
    .join("");
}

const QUICK_MESSAGES = [
  "Recibido",
  "En camino",
  "Llegamos al lugar",
  "Solicito refuerzos",
  "Solicito sanitarios",
  "Situación controlada",
];
function renderRadio() {
  if ($(".nav-dot"))
    $(".nav-dot").classList.toggle("live", Boolean(radio.session));
  if (view !== "radio") return;
  if (!$("#channel-select")) {
    lastMessages = "";
    $("#radio-panel").innerHTML =
      `<div class="radio-layout"><aside class="panel channel-settings"><span class="eyebrow">Canal de intervención</span><h2>Central y dotaciones en la misma conversación</h2><label class="field-label">Intervención<select id="channel-select" aria-label="Intervención"></select></label><div class="channel-buttons"><button id="connect-channel" class="button primary">Conectar al canal</button><button id="disconnect-channel" class="button secondary">Desconectar</button></div><div class="channel-status"><span class="live-dot"></span><strong id="radio-status"></strong></div><div id="peer-list" class="peer-list"></div><p class="channel-help">Abre otra pestaña con una dotación asignada a esta intervención y conecta ambas al canal. Texto y voz viajan entre navegadores.</p><p class="muted small-text">Las conversaciones son temporales. La emisora sigue siendo el canal oficial; las decisiones se registran desde Central o Mi equipo.</p></aside><section class="panel conversation"><div class="panel-heading"><strong>Conversación directa</strong><span class="badge fresh"><i></i>WebRTC</span></div><div id="messages" class="messages" aria-live="polite" aria-label="Mensajes del canal"></div><div class="quick-messages" id="quick-messages" aria-label="Mensajes rápidos">${QUICK_MESSAGES.map((text) => `<button type="button" class="quick" data-quick="${e(text)}">${e(text)}</button>`).join("")}</div><form id="message-form" class="message-form"><label class="sr-only" for="message-text">Mensaje</label><input id="message-text" maxlength="4000" placeholder="Escribe a los participantes…" autocomplete="off"><button id="record-voice" type="button" class="button secondary" aria-label="Grabar nota de voz">● Voz</button><button id="send-message" class="button primary">Enviar</button></form><div class="conversation-footer">Cifrado de transporte WebRTC · confirmación de recepción · notas de voz de hasta 20 s</div></section></div>`;
    $("#connect-channel").onclick = async () => {
      try {
        if (!$("#channel-select").value)
          throw new Error("Selecciona una intervención abierta.");
        await radio.connect($("#channel-select").value);
      } catch (error) {
        toast(error.message, true);
      }
    };
    $("#disconnect-channel").onclick = () => radio.disconnect();
    $("#message-form").onsubmit = async (event) => {
      event.preventDefault();
      const input = $("#message-text");
      try {
        await radio.send(input.value);
        input.value = "";
      } catch (error) {
        toast(error.message, true);
      }
    };
    $("#quick-messages").onclick = async (event) => {
      const button = event.target.closest("[data-quick]");
      if (!button) return;
      try {
        await radio.send(button.dataset.quick);
      } catch (error) {
        toast(error.message, true);
      }
    };
    $("#record-voice").onclick = async () => {
      try {
        if (radio.recording) radio.stopRecording();
        else await radio.startRecording();
      } catch (error) {
        toast(`No se pudo grabar: ${error.message}`, true);
      }
    };
  }
  const select = $("#channel-select");
  const previous = select.value || selectedId;
  const options = state.incidents.filter(
    (incident) =>
      incident.status === "open" &&
      (api.actor.role !== "crew_leader" ||
        activeAssignments(incident.id).some(
          (a) => a.unitId === api.actor.unitId,
        )),
  );
  const html =
    '<option value="">Selecciona una intervención</option>' +
    options
      .map((i) => `<option value="${e(i.id)}">${e(i.title)}</option>`)
      .join("");
  if (select.innerHTML !== html) {
    select.innerHTML = html;
    select.value = radio.incidentId || previous;
  }
  select.disabled = Boolean(radio.session);
  $("#connect-channel").disabled =
    Boolean(radio.session) ||
    !options.length ||
    api.actor.role === "system_admin";
  $("#disconnect-channel").disabled = !radio.session;
  $("#radio-status").textContent = radio.status;
  $(".channel-status").classList.toggle("on", Boolean(radio.session));
  const peers = [...radio.peers.values()];
  $("#peer-list").innerHTML = peers
    .map(
      (p) =>
        `<div class="peer"><span class="unit-avatar">${icon("radio")}</span><div><strong>${e(p.label)}</strong><small>${p.channel?.readyState === "open" ? "Conexión directa" : "Conectando…"}</small></div></div>`,
    )
    .join("");
  const connected = peers.some((p) => p.channel?.readyState === "open");
  $("#send-message").disabled = !connected;
  $("#record-voice").disabled = !connected;
  $("#record-voice").classList.toggle("recording", Boolean(radio.recording));
  $("#record-voice").textContent = radio.recording ? "■ Enviar nota" : "● Voz";
  document
    .querySelectorAll("[data-quick]")
    .forEach((button) => (button.disabled = !connected));
  const messages = radio.messages.length
    ? radio.messages
        .map(
          (m) =>
            `<article class="message ${m.own ? "own" : ""}"><div class="message-meta">${e(m.sender)} <time>${time(m.sentAt)}</time></div>${m.audio ? `<audio controls preload="metadata" src="${e(m.audio)}"></audio>` : `<p>${e(m.text)}</p>`}<small>${e(m.status)}</small></article>`,
        )
        .join("")
    : empty(
        "El canal está listo",
        "Conecta dos participantes para enviar el primer mensaje.",
        "radio",
      );
  if (lastMessages !== messages) {
    lastMessages = messages;
    $("#messages").innerHTML = messages;
    $("#messages").scrollTop = $("#messages").scrollHeight;
  }
}

async function command(path, body, success) {
  if (activeCommand) return;
  activeCommand = true;
  const key = crypto.randomUUID();
  try {
    await api.request(path, { body, key });
    await refresh();
    toast(success);
  } catch (error) {
    toast(error.message, true);
  } finally {
    activeCommand = false;
  }
}
function editor(title, fields, submit, action = "Guardar") {
  editorSubmit = submit;
  editorKey = crypto.randomUUID();
  $("#editor-title").textContent = title;
  $("#editor-fields").innerHTML = fields;
  $("#form-error").textContent = "";
  $("#save-editor").textContent = action;
  $("#editor").showModal();
}
function textField(name, title, value = "", max = 120) {
  return `<label>${title}<input name="${name}" value="${e(value)}" maxlength="${max}" required></label>`;
}
function reasonDialog(title, field, path, payload) {
  editor(
    title,
    `<label>${field}<textarea name="reason" required maxlength="500" rows="4"></textarea></label>`,
    (values, key) =>
      api.request(path, { body: { ...payload, reason: values.reason }, key }),
    "Confirmar",
  );
}
function editIncident() {
  const point = pendingPoint || { lat: 36.7213, lng: -4.4214 };
  const capturedAt = new Date().toISOString();
  editor(
    "Nueva intervención",
    `<div class="type-picker" role="group" aria-label="Tipo de aviso"><span class="field-caption">Tipo de aviso</span><div class="type-chips">${INCIDENT_TYPES.map(([name, priority], index) => `<button type="button" class="type-chip p-${priority}" data-type="${index}">${e(name)}</button>`).join("")}</div></div>${textField("title", "Título del aviso", "", 160)}<label>Descripción<textarea name="description" rows="3" maxlength="4000" placeholder="Dirección, situación, personas afectadas, accesos…"></textarea></label><div class="form-row"><label>Prioridad<select name="priority"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label>Riesgos<input name="hazards" maxlength="1000" placeholder="Separados por comas"></label></div><label>Zona de Málaga<select id="zone-select"><option value="">${pendingPoint ? "Punto marcado en el mapa" : "Elegir zona para rellenar coordenadas…"}</option>${ZONES.map(([name], index) => `<option value="${index}">${e(name)}</option>`).join("")}</select></label><div class="form-row"><label>Latitud<input name="latitude" type="number" step="any" min="-90" max="90" value="${point.lat.toFixed(5)}" required></label><label>Longitud<input name="longitude" type="number" step="any" min="-180" max="180" value="${point.lng.toFixed(5)}" required></label></div><p class="form-hint">${pendingPoint ? "Usando el punto que marcaste en el mapa." : "Consejo: pulsa en el mapa antes de abrir este formulario para fijar la ubicación exacta."}</p>`,
    async (values, key) => {
      const result = await api.request("/v1/incidents", {
        body: {
          title: values.title,
          description: values.description,
          priority: values.priority,
          hazards: values.hazards
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          location: {
            latitude: Number(values.latitude),
            longitude: Number(values.longitude),
            accuracyMeters: 20,
            capturedAt,
          },
        },
        key,
      });
      selectedId = result.id;
      filter = "open";
      pendingPoint = null;
      map.setPending(null);
      map.focus(result.location);
    },
    "Crear intervención",
  );
  const form = $("#editor-form");
  form.querySelectorAll("[data-type]").forEach((button) => {
    button.onclick = () => {
      const [name, priority, hazards] = INCIDENT_TYPES[button.dataset.type];
      form.elements.title.value = name;
      form.elements.priority.value = priority;
      form.elements.hazards.value = hazards;
      form
        .querySelectorAll("[data-type]")
        .forEach((b) => b.classList.toggle("active", b === button));
      editorKey = crypto.randomUUID();
      form.elements.description.focus();
    };
  });
  $("#zone-select").onchange = (event) => {
    const zone = ZONES[event.target.value];
    if (!zone) return;
    form.elements.latitude.value = zone[1].toFixed(5);
    form.elements.longitude.value = zone[2].toFixed(5);
    editorKey = crypto.randomUUID();
  };
}
function editUnit(unit) {
  editor(
    unit ? "Editar equipo" : "Registrar equipo",
    `${textField("callSign", "Indicativo", unit?.callSign || "", 40)}${textField("name", "Nombre del equipo", unit?.name || "")}<label>Capacidades<input name="capabilities" maxlength="1000" value="${e(unit?.capabilities.join(", ") || "")}" placeholder="Extinción, Rescate, Altura…"></label><p class="form-hint">Separa las capacidades por comas. El indicativo debe ser único.</p>`,
    (values, key) =>
      api.request(unit ? "/v1/unit-details" : "/v1/units", {
        body: {
          ...values,
          ...(unit ? { unitId: unit.id } : {}),
          capabilities: values.capabilities
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        key,
      }),
  );
}

// Remove the old reference shell worker: it otherwise serves a stale root page.
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .getRegistrations()
    .then((items) => Promise.all(items.map((item) => item.unregister())))
    .catch(() => {});
async function start() {
  await refresh();
  const profile = new URLSearchParams(location.search).get("unit");
  if (profile && context.units.some((unit) => unit.id === profile)) {
    await setProfile(`unit:${profile}`);
    location.hash = "field";
  }
  await changeView();
  setInterval(refresh, 3000);
}
start().catch((error) => toast(error.message, true));
