import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { EmergencyCore } from "../src/domain.js";
import { SqliteRepository } from "../src/repository.js";
import { seedTraining } from "../src/training.js";

const admin = { id: "admin-test", role: "system_admin" };
test("SQLite preserves full state, audit and idempotency across process-style reopen", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "brigada-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "state.sqlite");
  let repository = new SqliteRepository(path),
    core = new EmergencyCore();
  repository.execute(core, () => seedTraining(core));
  const body = { callSign: "T-01", name: "Training" };
  const unit = repository.execute(core, () =>
    core.registerUnit(admin, body, "replay"),
  );
  const original = core.exportState();
  repository.close();
  core = new EmergencyCore();
  repository = new SqliteRepository(path);
  t.after(() => repository.close());
  repository.load(core);
  assert.deepEqual(core.exportState(), original);
  assert.equal(
    repository.execute(core, () => seedTraining(core)),
    false,
  );
  assert.deepEqual(
    repository.execute(core, () => core.registerUnit(admin, body, "replay")),
    unit,
  );
  assert.equal(core.auditLog(admin).length, original.auditEvents.length);
  assert.throws(
    () =>
      repository.execute(core, () =>
        core.registerUnit(admin, { ...body, name: "Different" }, "replay"),
      ),
    /different command/,
  );
});

test("failed disk transaction rolls back memory, audit and replay keys together", (t) => {
  const repository = new SqliteRepository(":memory:");
  t.after(() => repository.close());
  const core = new EmergencyCore();
  const before = core.exportState();
  repository.db.exec(
    "CREATE TRIGGER simulate_full_disk BEFORE INSERT ON application_state BEGIN SELECT RAISE(ABORT, 'disk failure'); END;",
  );
  assert.throws(
    () =>
      repository.execute(core, () =>
        core.registerUnit(admin, { callSign: "B-1", name: "Test" }, "one"),
      ),
    /disk failure/,
  );
  assert.deepEqual(core.exportState(), before);
  repository.db.exec("DROP TRIGGER simulate_full_disk");
  const saved = repository.execute(core, () =>
    core.registerUnit(admin, { callSign: "B-1", name: "Test" }, "one"),
  );
  assert.equal(saved.callSign, "B-1");
  assert.equal(core.auditLog(admin).length, 1);
});

test("only admins edit unit metadata, preserving live assignment and unique call signs", () => {
  const core = new EmergencyCore();
  seedTraining(core);
  const unit = core.snapshot(admin).units[0];
  const originalAssignment = unit.activeAssignmentId;
  const input = {
    unitId: unit.id,
    callSign: "B-90",
    name: "Updated team",
    capabilities: ["Rescate"],
  };
  assert.throws(
    () =>
      core.updateUnit({ id: "dispatch", role: "dispatcher" }, input, "update"),
    /not allowed/,
  );
  const updated = core.updateUnit(admin, input, "update");
  assert.equal(updated.activeAssignmentId, originalAssignment);
  assert.equal(updated.status, unit.status);
  assert.equal(updated.name, "Updated team");
  assert.throws(
    () => core.updateUnit(admin, { ...input, callSign: "B-02" }, "duplicate"),
    /already exists/,
  );
  assert.equal(core.auditLog(admin).at(-1).type, "unit.updated");
});
