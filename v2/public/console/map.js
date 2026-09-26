import { escape, label, coords, time } from "./ui.js";

export class OperationsMap {
  constructor(onSelect, onPoint) {
    this.map = L.map("map", { zoomControl: false }).setView(
      [36.722, -4.423],
      14,
    );
    L.control.zoom({ position: "bottomright" }).addTo(this.map);
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    ).addTo(this.map);
    tiles.on("tileerror", () => {
      document.querySelector("#map-fallback").hidden = false;
    });
    tiles.on("tileload", () => {
      document.querySelector("#map-fallback").hidden = true;
    });
    this.layer = L.layerGroup().addTo(this.map);
    this.pendingLayer = L.layerGroup().addTo(this.map);
    this.onSelect = onSelect;
    this.map.on("click", (event) => onPoint(event.latlng));
    new ResizeObserver(() => this.map.invalidateSize()).observe(
      document.querySelector("#map"),
    );
  }
  render(state, selectedId) {
    this.layer.clearLayers();
    this.points = [];
    for (const incident of state.incidents.filter(
      (item) => item.status === "open",
    )) {
      const point = [incident.location.latitude, incident.location.longitude];
      this.points.push(point);
      const selected = incident.id === selectedId;
      const marker = L.marker(point, {
        title: incident.title,
        zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({
          className: "map-marker-wrap",
          html: `<div class="map-pin ${escape(incident.priority)} ${selected ? "selected" : ""}"><span></span></div>`,
          iconSize: [36, 44],
          iconAnchor: [18, 44],
        }),
      });
      marker.bindTooltip(escape(incident.title), {
        direction: "top",
        offset: [0, -40],
      });
      marker.on("click", () => this.onSelect(incident.id));
      marker.addTo(this.layer);
    }
    for (const unit of state.units) {
      const location = state.locations.find((item) => item.unitId === unit.id);
      if (!location) continue;
      const point = [location.latitude, location.longitude];
      this.points.push(point);
      L.marker(point, {
        title: unit.callSign,
        zIndexOffset: 500,
        icon: L.divIcon({
          className: "map-marker-wrap",
          html: `<div class="unit-pin ${escape(unit.status)} ${location.freshness === "stale" ? "stale" : ""}"><i></i>${escape(unit.callSign)}</div>`,
          iconSize: [64, 26],
          iconAnchor: [32, 13],
        }),
      })
        .bindPopup(
          `<strong>${escape(unit.callSign)}</strong> · ${escape(unit.name)}<br>${escape(label(unit.status))}<br>${escape(coords(location))}<br>${escape(label(location.freshness))} · ${time(location.capturedAt)}${location.source === "training" ? "<br>Posición de entrenamiento" : ""}`,
        )
        .addTo(this.layer);
    }
  }
  setPending(point) {
    this.pendingLayer.clearLayers();
    if (!point) return;
    L.marker(point, {
      interactive: false,
      icon: L.divIcon({
        className: "map-marker-wrap",
        html: '<div class="pending-pin"></div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      }),
    }).addTo(this.pendingLayer);
  }
  focus(location) {
    this.map.flyTo([location.latitude, location.longitude], 16, {
      duration: 0.6,
    });
  }
  fit() {
    if (this.points?.length)
      this.map.fitBounds(this.points, { padding: [45, 45], maxZoom: 15 });
  }
}
