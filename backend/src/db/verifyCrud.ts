import crypto from "node:crypto";
import { hashPassword } from "../auth/password.js";
import {
  createPage,
  deletePage,
  getPage,
  updatePage
} from "../services/pageService.js";
import { databaseErrorSummary } from "./errors.js";
import { pool } from "./pool.js";

async function verifyTemporaryTableCrud() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `CREATE TEMPORARY TABLE namulite_crud_verify (
        id INT PRIMARY KEY,
        value VARCHAR(64) NOT NULL
      ) ENGINE=InnoDB`
    );
    await connection.execute("INSERT INTO namulite_crud_verify (id, value) VALUES (1, 'created')");
    const [createdRows] = await connection.execute<any[]>("SELECT value FROM namulite_crud_verify WHERE id = 1");
    if (createdRows[0]?.value !== "created") throw new Error("Temporary table create/read verification failed");

    await connection.execute("UPDATE namulite_crud_verify SET value = 'updated' WHERE id = 1");
    const [updatedRows] = await connection.execute<any[]>("SELECT value FROM namulite_crud_verify WHERE id = 1");
    if (updatedRows[0]?.value !== "updated") throw new Error("Temporary table update verification failed");

    await connection.execute("DELETE FROM namulite_crud_verify WHERE id = 1");
    const [deletedRows] = await connection.execute<any[]>("SELECT COUNT(*) AS count FROM namulite_crud_verify");
    if (Number(deletedRows[0]?.count ?? 0) !== 0) throw new Error("Temporary table delete verification failed");
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verifyApplicationCrud() {
  const suffix = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const username = `crud_check_${suffix.replace(/-/g, "").slice(0, 16)}`;

  try {
    await pool.execute(
      `INSERT INTO users (id, username, email, password_hash, display_name)
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        username,
        `${username}@example.invalid`,
        await hashPassword(crypto.randomBytes(32).toString("hex")),
        "CRUD verification"
      ]
    );

    const created = await createPage(userId, {
      title: `CRUD verification ${suffix.slice(0, 8)}`,
      content: "created",
      visibility: "private"
    });
    if (!created) throw new Error("Create verification failed");

    const read = await getPage(userId, created.id);
    if (!read || read.content !== "created") {
      throw new Error("Read verification failed");
    }

    const updated = await updatePage(userId, created.id, {
      title: created.title,
      content: "updated",
      visibility: "private",
      baseVersion: created.version
    });
    if (!updated || updated.content !== "updated" || updated.version !== created.version + 1) {
      throw new Error("Update verification failed");
    }

    if (!(await deletePage(userId, created.id))) {
      throw new Error("Delete verification failed");
    }
    if (await getPage(userId, created.id)) {
      throw new Error("Deleted page is still readable");
    }
  } finally {
    await pool.execute("DELETE FROM users WHERE id = ?", [userId]);
  }
}

async function verifyCrud() {
  await verifyTemporaryTableCrud();
  await verifyApplicationCrud();
  console.log("MariaDB CRUD verification passed: temporary table and application tables");
}

verifyCrud()
  .catch((error) => {
    console.error("MariaDB CRUD verification failed", databaseErrorSummary(error));
    if (error instanceof Error && !("code" in error)) {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
