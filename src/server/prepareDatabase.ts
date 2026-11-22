import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getDatabaseFilePath, getDatabaseUrl } from "./environment";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function prepareDatabase() {
  const databasePath = getDatabaseFilePath(getDatabaseUrl(projectRoot));
  await mkdir(dirname(databasePath), { recursive: true });
  const databaseFile = await open(databasePath, "a");
  await databaseFile.close();
}

prepareDatabase().catch((error) => {
  console.error("Database preparation failed:", error);
  process.exitCode = 1;
});
