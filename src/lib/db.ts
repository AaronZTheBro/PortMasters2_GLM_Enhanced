import { PrismaClient } from "../../generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseUrl } from "../server/environment";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const databaseUrl = getDatabaseUrl(projectRoot);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma connects to SQLite through the official driver adapter.
const adapter = new PrismaBetterSqlite3({ url: databaseUrl });

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    // Query logs are optional because long sessions retain noisy parameter data.
    ...(process.env.DEBUG_PRISMA === "1" ? { log: ["query"] } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Central public user projection shared by API and socket paths. Keeping this
// allowlist here avoids importing request only Next modules into the socket server.
export const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarHue: true,
} as const;
