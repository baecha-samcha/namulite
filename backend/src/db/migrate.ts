import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { env } from "../env.js";
import { databaseErrorSummary } from "./errors.js";

type AppliedMigration = RowDataPacket & {
  filename: string;
  checksum: string;
};

type LockRow = RowDataPacket & {
  acquired: number | null;
};

const migrationDirectory = fileURLToPath(
  new URL("../../../database/migrations/", import.meta.url)
);
const statusOnly = process.argv.includes("--status");
const lockName = "namulite_schema_migrations";

async function loadMigrations() {
  const filenames = (await fs.readdir(migrationDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right));

  for (const filename of filenames) {
    if (!/^\d{3,}_[a-z0-9_]+\.sql$/.test(filename)) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }
  }

  return Promise.all(
    filenames.map(async (filename) => {
      const contents = await fs.readFile(path.join(migrationDirectory, filename), "utf8");
      const sql = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
      return {
        filename,
        sql,
        checksum: crypto.createHash("sha256").update(sql).digest("hex")
      };
    })
  );
}

async function run() {
  const migrations = await loadMigrations();
  const connection = await mysql.createConnection({
    ...env.database,
    charset: "utf8mb4",
    multipleStatements: true
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [lockRows] = await connection.execute<LockRow[]>(
      "SELECT GET_LOCK(?, 30) AS acquired",
      [lockName]
    );
    if (lockRows[0]?.acquired !== 1) {
      throw new Error("Could not acquire the database migration lock within 30 seconds");
    }

    const [rows] = await connection.execute<AppliedMigration[]>(
      "SELECT filename, checksum FROM schema_migrations ORDER BY filename"
    );
    const applied = new Map(rows.map((row) => [row.filename, row]));

    for (const migration of migrations) {
      const existing = applied.get(migration.filename);
      if (existing && existing.checksum !== migration.checksum) {
        throw new Error(`Applied migration was modified: ${migration.filename}`);
      }
      if (statusOnly) {
        console.log(`${existing ? "applied" : "pending"}  ${migration.filename}`);
        continue;
      }
      if (existing) {
        console.log(`skipped  ${migration.filename}`);
        continue;
      }

      console.log(`applying ${migration.filename}`);
      await connection.query(migration.sql);
      await connection.execute(
        "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
        [migration.filename, migration.checksum]
      );
      console.log(`applied  ${migration.filename}`);
    }
  } finally {
    try {
      await connection.execute("SELECT RELEASE_LOCK(?)", [lockName]);
    } finally {
      await connection.end();
    }
  }
}

run().catch((error) => {
  console.error("Database migration failed", databaseErrorSummary(error));
  if (error instanceof Error && !("code" in error)) {
    console.error(error.message);
  }
  process.exitCode = 1;
});
