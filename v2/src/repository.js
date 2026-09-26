import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Single-process local repository. State, audit and replay keys commit together. */
export class SqliteRepository {
  constructor(filename) {
    if (filename !== ":memory:")
      mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS application_state (
        id INTEGER PRIMARY KEY CHECK(id = 1), payload TEXT NOT NULL
      );`);
  }

  load(core) {
    const row = this.db
      .prepare("SELECT payload FROM application_state WHERE id = 1")
      .get();
    if (row) core.restoreState(JSON.parse(row.payload));
  }

  execute(core, operation) {
    const previous = core.exportState();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db
        .prepare(
          `INSERT INTO application_state(id, payload) VALUES (1, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload`,
        )
        .run(JSON.stringify(core.exportState()));
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      core.restoreState(previous);
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}
