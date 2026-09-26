import assert from "node:assert/strict";
import test from "node:test";
import { EmergencyCore } from "../src/domain.js";
import { SignalingHub } from "../src/signaling.js";
import { seedTraining } from "../src/training.js";

function setup() {
  const core = new EmergencyCore();
  seedTraining(core);
  const dispatch = { id: "central", role: "dispatcher" };
  const state = core.snapshot(dispatch);
  const unit = state.units[0];
  const crew = { id: "crew", role: "crew_leader", unitId: unit.id };
  return { core, dispatch, crew, state, incidentId: state.incidents[0].id };
}
test("signaling is incident-scoped, token-bound and replayable until acknowledged", () => {
  const { core, dispatch, crew, state, incidentId } = setup();
  const hub = new SignalingHub(core);
  const central = hub.join(dispatch, { incidentId }),
    team = hub.join(crew, { incidentId });
  const outsider = hub.join(dispatch, { incidentId: state.incidents[1].id });
  assert.throws(
    () => hub.join({ ...crew, unitId: state.units[1].id }, { incidentId }),
    /Solo los participantes/,
  );
  assert.throws(
    () => hub.join({ id: "admin", role: "system_admin" }, { incidentId }),
    /Solo los participantes/,
  );
  assert.throws(() => hub.poll(crew, team.peerId, "wrong"), /caducado/);
  assert.throws(
    () => hub.poll({ ...crew, id: "other" }, team.peerId, team.token),
    /caducado/,
  );
  assert.throws(
    () =>
      hub.signal(
        dispatch,
        {
          peerId: central.peerId,
          targetId: outsider.peerId,
          description: { type: "offer", sdp: "sdp" },
        },
        central.token,
      ),
    /destinatario/,
  );
  hub.signal(
    dispatch,
    {
      peerId: central.peerId,
      targetId: team.peerId,
      description: { type: "offer", sdp: "example-sdp" },
    },
    central.token,
  );
  const result = hub.poll(crew, team.peerId, team.token);
  assert.equal(result.peers.length, 1);
  assert.equal(result.signals[0].description.sdp, "example-sdp");
  assert.equal(hub.poll(crew, team.peerId, team.token).signals.length, 1);
  assert.equal(
    hub.poll(crew, team.peerId, team.token, result.cursor).signals.length,
    0,
  );
  assert.throws(
    () =>
      hub.signal(
        dispatch,
        {
          peerId: central.peerId,
          targetId: team.peerId,
          text: "Do not relay content",
        },
        central.token,
      ),
    /inválida/,
  );
  assert.throws(() => hub.poll(crew, team.peerId, team.token, NaN), /inválido/);
});

test("assignment revocation and expiry remove peers from the channel", () => {
  const { core, dispatch, crew, state, incidentId } = setup();
  let now = 1000;
  const hub = new SignalingHub(core, { clock: () => now });
  const central = hub.join(dispatch, { incidentId }),
    team = hub.join(crew, { incidentId });
  core.cancelAssignment(
    dispatch,
    { assignmentId: state.units[0].activeAssignmentId, reason: "Test recall" },
    "recall",
  );
  assert.throws(() => hub.poll(crew, team.peerId, team.token), /caducado/);
  assert.equal(
    hub.poll(dispatch, central.peerId, central.token).peers.length,
    0,
  );
  now += 31000;
  assert.throws(
    () => hub.poll(dispatch, central.peerId, central.token),
    /caducado/,
  );
});
