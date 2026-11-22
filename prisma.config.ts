// PortMasters 2: Prisma CLI config
// Prisma 7 reads the CLI datasource from this file. The application reads
// the same value when it creates its SQLite driver adapter.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";
import { getDatabaseUrl } from "./src/server/environment";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  datasource: {
    url: getDatabaseUrl(projectRoot),
  },
});
