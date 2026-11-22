// The web app and realtime service deliberately share one HTTP server.
// Run `npm run dev` for local work or `npm run start` after a production build.
import { createServer } from "http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";
import { db } from "./src/lib/db";
import { getApplicationPort } from "./src/server/environment";
import { attachRealtime } from "./src/server/realtime";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// HTTP, API, and realtime traffic share the configured port.
const PORT = getApplicationPort();
const SHUTDOWN_TIMEOUT_MS = 10_000;
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, dir: projectRoot, webpack: true });
const handle = app.getRequestHandler();

async function withDeadline<T>(work: Promise<T>, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(message)),
          SHUTDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

app
  .prepare()
  .then(() => {
    const httpServer = createServer((req, res) => handle(req, res));
    const io = attachRealtime(httpServer);
    let closing = false;

    async function stopHttpServer() {
      if (!httpServer.listening) return;

      await new Promise<void>((resolveStop, rejectStop) => {
        httpServer.close((error) => {
          if (error) rejectStop(error);
          else resolveStop();
        });
        httpServer.closeIdleConnections();
      });
    }

    async function shutdown(exitCode = 0) {
      if (closing) return;
      closing = true;

      try {
        await withDeadline(
          (async () => {
            const socketResults = await Promise.allSettled([io.close()]);
            const results = await Promise.allSettled([
              stopHttpServer(),
              app.close(),
              db.$disconnect(),
            ]);
            results.push(...socketResults);
            const failure = results.find(
              (result) => result.status === "rejected",
            );
            if (failure?.status === "rejected") throw failure.reason;
          })(),
          `Shutdown exceeded ${SHUTDOWN_TIMEOUT_MS} ms`,
        );
        process.exit(exitCode);
      } catch (error) {
        httpServer.closeAllConnections();
        console.error("PortMasters 2 shutdown failed:", error);
        process.exit(1);
      }
    }

    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    httpServer.once("error", (error) => {
      console.error("PortMasters 2 could not start:", error);
      void shutdown(1);
    });

    httpServer.listen(
      PORT,
      process.env.RENDER_SERVICE_ID ? "0.0.0.0" : undefined,
      () => {
        console.log(`> PortMasters 2 ready on http://localhost:${PORT}`);
      },
    );
  })
  .catch(async (error) => {
    console.error("PortMasters 2 preparation failed:", error);
    try {
      await withDeadline(
        Promise.allSettled([app.close(), db.$disconnect()]).then((results) => {
          const failure = results.find(
            (result) => result.status === "rejected",
          );
          if (failure?.status === "rejected") throw failure.reason;
        }),
        `Preparation cleanup exceeded ${SHUTDOWN_TIMEOUT_MS} ms`,
      );
    } catch (cleanupError) {
      console.error("PortMasters 2 preparation cleanup failed:", cleanupError);
      process.exit(1);
    }
    process.exit(1);
  });
