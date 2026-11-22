import { tmpdir } from "node:os";
import { isAbsolute, resolve } from "node:path";

export const DEFAULT_APPLICATION_PORT = 2154;

const BUILD_LIFECYCLE_EVENTS = new Set(["build", "postinstall"]);
const RAILWAY_RUNTIME_VARIABLES = [
  "RAILWAY_PROJECT_ID",
  "RAILWAY_ENVIRONMENT_ID",
  "RAILWAY_SERVICE_ID",
] as const;

function isRailwayRuntime() {
  return RAILWAY_RUNTIME_VARIABLES.some((name) => Boolean(process.env[name]));
}

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function loadProjectEnvironment(projectRoot: string) {
  for (const envFile of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(resolve(projectRoot, envFile));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }
}

export function resolveDatabaseUrl(value: string, projectRoot: string) {
  if (!value.startsWith("file:")) return value;

  const body = value.slice("file:".length);
  const suffixIndex = body.search(/[?#]/);
  const databasePath = suffixIndex === -1 ? body : body.slice(0, suffixIndex);
  const suffix = suffixIndex === -1 ? "" : body.slice(suffixIndex);

  if (!databasePath || isAbsolute(databasePath)) return value;
  return `file:${resolve(projectRoot, databasePath)}${suffix}`;
}

function getRailwayDatabaseUrl() {
  const mountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  if (mountPath) return `file:${resolve(mountPath, "portmasters.db")}`;
  if (isRailwayRuntime()) {
    return `file:${resolve(tmpdir(), "portmasters.db")}`;
  }
  return undefined;
}

function getBuildDatabaseUrl() {
  const lifecycleEvent = process.env.npm_lifecycle_event;
  if (!lifecycleEvent || !BUILD_LIFECYCLE_EVENTS.has(lifecycleEvent)) {
    return undefined;
  }
  return `file:${resolve(tmpdir(), "portmastersBuild.db")}`;
}

export function getDatabaseUrl(projectRoot: string) {
  loadProjectEnvironment(projectRoot);
  const value =
    getBuildDatabaseUrl() ??
    process.env.DATABASE_URL ??
    getRailwayDatabaseUrl();
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env.local or attach a Railway volume.",
    );
  }
  return resolveDatabaseUrl(value, projectRoot);
}

export function getApplicationPort() {
  const value = process.env.PORT;
  if (value === undefined) return DEFAULT_APPLICATION_PORT;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a valid TCP port.");
  }
  if (!isRailwayRuntime() && port !== DEFAULT_APPLICATION_PORT) {
    throw new Error(`PORT must be ${DEFAULT_APPLICATION_PORT}.`);
  }
  return port;
}

export function getDatabaseFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use a file URL for SQLite.");
  }

  const body = databaseUrl.slice("file:".length);
  const suffixIndex = body.search(/[?#]/);
  const databasePath = suffixIndex === -1 ? body : body.slice(0, suffixIndex);
  if (!databasePath) throw new Error("DATABASE_URL must name a SQLite file.");
  return databasePath;
}
