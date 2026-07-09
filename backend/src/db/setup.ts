import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { env } from "../env.js";

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

const serverConnection = await mysql.createConnection({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  multipleStatements: true
});

await serverConnection.query(
  `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(env.mysql.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
);
await serverConnection.end();

const schemaPath = fileURLToPath(new URL("../../../database/schema.sql", import.meta.url));
const schemaSql = await fs.readFile(schemaPath, "utf8");

const databaseConnection = await mysql.createConnection({
  host: env.mysql.host,
  port: env.mysql.port,
  user: env.mysql.user,
  password: env.mysql.password,
  database: env.mysql.database,
  multipleStatements: true
});

await databaseConnection.query(schemaSql);
await databaseConnection.end();

console.log(`Database '${env.mysql.database}' is ready.`);