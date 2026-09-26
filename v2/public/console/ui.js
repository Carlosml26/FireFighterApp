export const $ = (selector) => document.querySelector(selector);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const labels = {
  available: "Disponible",
  assigned: "Asignado",
  en_route: "En camino",
  on_scene: "En el lugar",
  unavailable: "No disponible",
  open: "Activa",
  closed: "Cerrada",
  pending: "Pendiente de confirmar",
  acknowledged: "Confirmada",
  rejected: "Rechazada",
  cancelled: "Retirada",
  cleared: "Finalizada",
  critical: "Crítica",
  high: "Alta",
  medium: "Media",
  low: "Baja",
  fresh: "Reciente",
  stale: "Antigua",
  unknown: "Desconocida",
  dispatcher: "Central",
  system_admin: "Administración",
  crew_leader: "Equipo",
  incident_commander: "Mando",
  auditor: "Auditoría",
};
export const label = (value) => labels[value] || value;
export const badge = (value) =>
  `<span class="badge ${escape(value)}"><i></i>${escape(label(value))}</span>`;
export const time = (value) =>
  value
    ? new Intl.DateTimeFormat("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
export const date = (value) =>
  new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
/** Short elapsed time, e.g. "12 min" or "2 h 05". */
export const since = (value) => {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value)) / 60000),
  );
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.floor(hours / 24)} d`;
};
export const coords = (p) =>
  p
    ? `${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)}`
    : "Sin posición";
/** Great-circle distance in kilometres. */
export const distance = (a, b) => {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
export const km = (value) =>
  value < 1
    ? `${Math.round(value * 1000)} m`
    : `${value.toLocaleString("es-ES", { maximumFractionDigits: 1 })} km`;
export const directions = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(p.latitude)},${Number(p.longitude)}`;
export const empty = (title, text = "", symbol = "shield") =>
  `<div class="empty"><span class="empty-symbol">${icon(symbol)}</span><strong>${escape(title)}</strong><p>${escape(text)}</p></div>`;
export const icons = {
  dispatch:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  field:
    '<path d="M2 17V8h11v9M13 11h4.5l3.5 3.5V17h-8"/><circle cx="6.5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/><path d="M4 11h6"/>',
  radio:
    '<rect x="7" y="8" width="10" height="14" rx="2"/><path d="M9 8V2m2 10h2m-3 4h4M16 2a7 7 0 0 1 5 6M15 5a3 3 0 0 1 3 3"/>',
  admin:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4"/>',
  history:
    '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  pin: '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  flame:
    '<path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.2-5.6-3.6-7.3-.4 1.8-1.3 3-2.4 3.3.4-3.4-1-6.6-4-9 0 3.4-4 6.2-4 11 0 5.3 3 9 7 9Z"/><path d="M12 22c-1.7 0-3-1.3-3-3.2 0-2 1.6-3.1 2.2-4.8 1.6 1.2 3.8 2.6 3.8 4.8 0 1.9-1.3 3.2-3 3.2Z"/>',
  alert:
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  route:
    '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  locate:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield:
    '<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
/** Original emblem: shield in Málaga purple and green with a fire-service flame. */
export const logo = () =>
  `<svg class="logo" viewBox="0 0 48 56" aria-hidden="true"><defs><clipPath id="logo-shield"><path d="M24 2 44 9v17c0 14-9 23.5-20 28C13 49.5 4 40 4 26V9Z"/></clipPath></defs><g clip-path="url(#logo-shield)"><rect width="48" height="56" fill="#6d2a86"/><path d="M48 0v56H0Z" fill="#0b8a47"/><path d="M0 44 48 26v6L0 50Z" fill="#fff" opacity=".18"/></g><path d="M24 2 44 9v17c0 14-9 23.5-20 28C13 49.5 4 40 4 26V9Z" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M24 44c6 0 10-4 10-10 0-5-3-8-5-10.5-.6 2.6-1.9 4.3-3.5 4.8.6-5-1.4-9.6-5.8-13 0 5-5.7 8.9-5.7 15.8C14 38.6 18 44 24 44Z" fill="#e3261d" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M24 44c-2.5 0-4.3-1.9-4.3-4.6 0-2.9 2.3-4.4 3.2-6.8 2.3 1.7 5.4 3.7 5.4 6.8 0 2.7-1.8 4.6-4.3 4.6Z" fill="#ffc53d"/></svg>`;
let toastTimer;
export function toast(message, error = false) {
  clearTimeout(toastTimer);
  $("#toast").hidden = false;
  $("#toast").classList.toggle("error", error);
  $("#toast").textContent = message;
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 6500);
}
