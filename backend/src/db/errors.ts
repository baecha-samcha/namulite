type DatabaseLikeError = {
  code?: unknown;
  errno?: unknown;
  sqlState?: unknown;
};

export function databaseErrorSummary(error: unknown) {
  const candidate = error as DatabaseLikeError | null;
  return {
    code: typeof candidate?.code === "string" ? candidate.code : "UNKNOWN_DATABASE_ERROR",
    errno: typeof candidate?.errno === "number" ? candidate.errno : undefined,
    sqlState: typeof candidate?.sqlState === "string" ? candidate.sqlState : undefined
  };
}
