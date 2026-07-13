import "dotenv/config";

import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DB_HOST: z.string().trim().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_NAME: z.string().trim().min(1),
  DB_USER: z.string().trim().min(1),
  DB_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32)
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const values = parsed.data;

export const env = {
  nodeEnv: values.NODE_ENV,
  port: values.PORT,
  frontendOrigin: values.FRONTEND_ORIGIN,
  database: {
    host: values.DB_HOST,
    port: values.DB_PORT,
    user: values.DB_USER,
    password: values.DB_PASSWORD,
    database: values.DB_NAME
  },
  sessionSecret: values.SESSION_SECRET,
  isProduction: values.NODE_ENV === "production"
};
