const dispatch = { id: "training-central", role: "dispatcher" };

/** Explicit fictional training data, inserted once into an empty repository. */
export function seedTraining(core) {
  if (
    core.snapshot(dispatch).units.length ||
    core.snapshot(dispatch).incidents.length
  )
    return false;
  const capturedAt = new Date().toISOString();
  const position = (latitude, longitude) => ({
    latitude,
    longitude,
    capturedAt,
    accuracyMeters: 15,
  });
  const units = [
    [
      "B-01",
      "Bomba urbana · Martiricos",
      ["Extinción", "Rescate"],
      36.7326,
      -4.4291,
    ],
    ["B-02", "Bomba urbana · Centro", ["Extinción"], 36.7203, -4.4246],
    ["E-01", "Autoescala · Litoral", ["Altura", "Rescate"], 36.7138, -4.4335],
    ["R-01", "Rescate · Teatinos", ["Rescate", "Asistencia"], 36.7235, -4.457],
    ["B-03", "Bomba urbana · Este", ["Extinción"], 36.7232, -4.395],
  ].map(([callSign, name, capabilities, lat, lng], index) => {
    const unit = core.registerUnit(
      dispatch,
      { callSign, name, capabilities },
      `training-unit-${index}`,
    );
    core.recordLocation(
      { id: `training-${unit.id}`, role: "crew_leader", unitId: unit.id },
      { unitId: unit.id, position: position(lat, lng), source: "training" },
      `training-location-${index}`,
    );
    return unit;
  });
  const incidents = [
    [
      "Incendio en vivienda",
      "Ejercicio ficticio · Calle Carretería. Humo en segunda planta; comprobar accesos y ocupación.",
      "high",
      36.7245,
      -4.4241,
      ["Humo en escalera"],
    ],
    [
      "Asistencia en vía pública",
      "Ejercicio ficticio · Paseo del Parque. Asegurar la zona y valorar la intervención.",
      "medium",
      36.7189,
      -4.4161,
      [],
    ],
    [
      "Revisión preventiva",
      "Ejercicio ficticio · Entorno de La Malagueta. Inspección de un aviso sin confirmar.",
      "low",
      36.7195,
      -4.4074,
      [],
    ],
  ].map(([title, description, priority, lat, lng, hazards], index) =>
    core.createIncident(
      dispatch,
      { title, description, priority, location: position(lat, lng), hazards },
      `training-incident-${index}`,
    ),
  );
  const assignment = core.assignUnit(
    dispatch,
    { incidentId: incidents[0].id, unitId: units[0].id },
    "training-dispatch",
  );
  const crew = {
    id: `training-${units[0].id}`,
    role: "crew_leader",
    unitId: units[0].id,
  };
  core.respondToAssignment(
    crew,
    { assignmentId: assignment.id, decision: "acknowledge" },
    "training-ack",
  );
  core.updateUnitStatus(
    crew,
    { unitId: units[0].id, status: "en_route" },
    "training-en-route",
  );
  return true;
}
