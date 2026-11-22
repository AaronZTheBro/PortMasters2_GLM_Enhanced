import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, rm, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import test from "node:test";
import { io, type Socket } from "socket.io-client";
import { EXPANDED_RULES, type VoyageRules } from "../src/lib/game/expansion";
import { WORD_ON_THE_DOCKS_THRESHOLD } from "../src/lib/game/constants";
import { createInitialGameState } from "../src/lib/game/types";
import type { VoyageCompleteEvent } from "../src/lib/realtime";

const projectRoot = resolve(import.meta.dirname, "..");
const databasePath = join(projectRoot, "prisma", "integration.db");
const databaseUrl = "file:./prisma/integration.db";
const baseUrl = "http://127.0.0.1:2154";
const basePort = 2154;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const developmentLockPath = join(projectRoot, ".next", "dev", "lock");
const developmentOutputPath = join(projectRoot, ".next", "dev");

async function removeDatabase() {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    await unlink(`${databasePath}${suffix}`).catch(() => {});
  }
}

async function removeDevelopmentOutput() {
  await rm(developmentOutputPath, { recursive: true, force: true });
}

async function canBindPort() {
  return new Promise<boolean>((resolvePort) => {
    const probe = createServer();
    probe.once("error", () => resolvePort(false));
    probe.once("listening", () => {
      probe.close(() => resolvePort(true));
    });
    probe.listen(basePort, "::");
  });
}

async function run(command: string, args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    output += String(chunk);
  });
  const [code] = (await once(child, "exit")) as [number | null];
  assert.equal(code, 0, output);
}

async function waitForServer(server: ChildProcess, logs: () => string) {
  const deadline = Date.now() + 30_000;
  const readyLine = "> PortMasters 2 ready on http://localhost:2154";
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited before readiness\n${logs()}`);
    }
    if (!logs().includes(readyLine)) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      continue;
    }
    try {
      const response = await fetch(`${baseUrl}/api`);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Server did not become ready\n${logs()}`);
}

async function request(
  path: string,
  options: { body?: unknown; cookie?: string; method?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  assert.equal(response.ok, true, `${response.status} ${text}`);
  return { data, response };
}

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie");
  assert.ok(header, "Registration must set a session cookie");
  return header.split(";", 1)[0];
}

function waitForEvent<T>(
  socket: Socket,
  event: string,
  predicate: (payload: T) => boolean = () => true,
  timeoutMs = 8_000,
) {
  return new Promise<T>((resolveEvent, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolveEvent(payload);
    };
    socket.on(event, listener);
  });
}

async function connectCaptain(token: string) {
  const socket = io(baseUrl, {
    autoConnect: false,
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  const connected = waitForEvent(socket, "connect");
  socket.connect();
  await connected;
  const authenticated = waitForEvent<{ user: { username: string } }>(
    socket,
    "auth:ok",
  );
  socket.emit("auth", { token });
  await authenticated;
  return socket;
}

function signalServer(server: ChildProcess, signal: NodeJS.Signals) {
  if (!server.pid) return;
  if (process.platform === "win32") {
    server.kill(signal);
    return;
  }
  try {
    process.kill(-server.pid, signal);
  } catch {
    server.kill(signal);
  }
}

async function waitForServerStop(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const lockPresent = await access(developmentLockPath).then(
      () => true,
      () => false,
    );
    if ((await canBindPort()) && !lockPresent) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return false;
}

async function waitForProcessExit(server: ChildProcess, timeoutMs: number) {
  if (server.exitCode !== null || server.signalCode !== null) return true;

  return new Promise<boolean>((resolveExit) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    const timer = setTimeout(() => {
      server.off("exit", onExit);
      resolveExit(false);
    }, timeoutMs);
    server.once("exit", onExit);
  });
}

test(
  "HTTP, authentication, rooms, persistence, and realtime share port 2154",
  { timeout: 60_000 },
  async () => {
    await removeDevelopmentOutput();
    await removeDatabase();
    assert.equal(
      await waitForServerStop(10_000),
      true,
      "Port 2154 is already in use before integration test start",
    );
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "development",
      PORT: "2154",
    };

    await run(npmCommand, ["run", "db:push"], environment);

    const server: ChildProcess = spawn(
      process.execPath,
      ["--import", "tsx", join(projectRoot, "server.ts")],
      {
        cwd: projectRoot,
        detached: process.platform !== "win32",
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let serverLogs = "";
    server.stdout?.on("data", (chunk) => {
      serverLogs += String(chunk);
    });
    server.stderr?.on("data", (chunk) => {
      serverLogs += String(chunk);
    });

    const sockets: Socket[] = [];
    try {
      const health = await waitForServer(server, () => serverLogs);
      assert.deepEqual(health, {
        status: "ok",
        service: "portmasters2",
        port: 2154,
      });

      const alphaRegistration = await request("/api/auth/register", {
        body: {
          username: "integration_alpha",
          password: "localonly",
          displayName: "Alpha",
        },
      });
      const betaRegistration = await request("/api/auth/register", {
        body: {
          username: "integration_beta",
          password: "localonly",
          displayName: "Beta",
        },
      });
      const alphaCookie = sessionCookie(alphaRegistration.response);
      const betaCookie = sessionCookie(betaRegistration.response);

      const created = await request("/api/rooms", {
        cookie: alphaCookie,
        body: { name: "Integration harbor", isPublic: true },
      });
      const room = created.data.room as { id: string; code: string };

      const joined = await request("/api/rooms/join", {
        cookie: betaCookie,
        body: { code: room.code },
      });
      assert.equal(joined.data.room.memberCount, 2);

      const alphaSocket = await connectCaptain(alphaRegistration.data.token);
      const betaSocket = await connectCaptain(betaRegistration.data.token);
      sockets.push(alphaSocket, betaSocket);

      const oneMemberRoster = waitForEvent<{ members: unknown[] }>(
        alphaSocket,
        "room:members",
        ({ members }) => members.length === 1,
      );
      alphaSocket.emit("room:join", { roomId: room.id });
      await oneMemberRoster;

      const twoMemberRoster = waitForEvent<{ members: unknown[] }>(
        alphaSocket,
        "room:members",
        ({ members }) => members.length === 2,
      );
      betaSocket.emit("room:join", { roomId: room.id });
      await twoMemberRoster;

      const chatReceived = waitForEvent<{
        message: { content: string; sender: { username: string } };
      }>(
        alphaSocket,
        "chat:room",
        ({ message }) => message.content === "Ready to sail",
      );
      betaSocket.emit("chat:room", {
        roomId: room.id,
        content: "Ready to sail",
      });
      const chat = await chatReceived;
      assert.equal(chat.message.sender.username, "integration_beta");

      const roomDetail = await request(`/api/rooms/${room.id}`, {
        cookie: alphaCookie,
      });
      assert.equal(roomDetail.data.messages.at(-1).content, "Ready to sail");

      const activeRoom = await request("/api/rooms/active", {
        cookie: betaCookie,
      });
      assert.equal(activeRoom.data.room.id, room.id);

      type Started = {
        roomId: string;
        voyageEpoch: number;
        rules: VoyageRules;
      };
      const alphaStarted = waitForEvent<Started>(
        alphaSocket,
        "room:started",
        ({ roomId }) => roomId === room.id,
      );
      const betaStarted = waitForEvent<Started>(
        betaSocket,
        "room:started",
        ({ roomId }) => roomId === room.id,
      );
      alphaSocket.emit("room:start", { roomId: room.id });
      const [start, otherStart] = await Promise.all([
        alphaStarted,
        betaStarted,
      ]);
      assert.deepEqual(start, otherStart);
      assert.equal(start.rules.version, EXPANDED_RULES);
      assert.ok(start.rules.forecasts.length > 0);
      const recoverySocket = await connectCaptain(betaRegistration.data.token);
      sockets.push(recoverySocket);
      const checkpoint = waitForEvent<Started & { phase: string }>(
        recoverySocket,
        "phase:ready_update",
        ({ roomId }) => roomId === room.id,
      );
      betaSocket.disconnect();
      recoverySocket.emit("room:join", { roomId: room.id });
      const recovered = await checkpoint;
      assert.equal(recovered.phase, "5");
      assert.equal(recovered.voyageEpoch, start.voyageEpoch);
      assert.deepEqual(recovered.rules, start.rules);
      const savedRules = await request(`/api/game/state?roomId=${room.id}`, {
        cookie: betaCookie,
      });
      assert.deepEqual(savedRules.data.rules, start.rules);
      assert.equal(savedRules.data.checkpoint.voyageEpoch, start.voyageEpoch);

      const alphaAdvanced = waitForEvent<{
        roomId: string;
        round: number;
        phase: string;
      }>(
        alphaSocket,
        "phase:advance",
        (payload) =>
          payload.roomId === room.id &&
          payload.round === 1 &&
          String(payload.phase) === "5",
      );
      const betaAdvanced = waitForEvent<{
        roomId: string;
        round: number;
        phase: string;
      }>(
        recoverySocket,
        "phase:advance",
        (payload) =>
          payload.roomId === room.id &&
          payload.round === 1 &&
          String(payload.phase) === "5",
      );
      alphaSocket.emit("phase:ready", {
        roomId: room.id,
        round: 1,
        phase: "5",
        voyageEpoch: start.voyageEpoch,
      });
      recoverySocket.emit("phase:ready", {
        roomId: room.id,
        round: 1,
        phase: "5",
        voyageEpoch: start.voyageEpoch,
      });
      await Promise.all([alphaAdvanced, betaAdvanced]);

      const startedRoom = await request(`/api/rooms/${room.id}`, {
        cookie: alphaCookie,
      });
      assert.equal(startedRoom.data.room.started, true);

      const claim = { roomId: room.id, voyageEpoch: start.voyageEpoch };
      const claimDocks = (socket: Socket) =>
        socket.timeout(4000).emitWithAck("docks:claim", claim);
      assert.equal(await claimDocks(alphaSocket), false);
      const statePath = `/api/game/state?roomId=${room.id}`;
      for (const cookie of [alphaCookie, betaCookie]) {
        const game = createInitialGameState(0, 1, start.voyageEpoch);
        game.totalOrdersCompleted = WORD_ON_THE_DOCKS_THRESHOLD;
        await request("/api/game/state", {
          cookie,
          method: "PUT",
          body: { roomId: room.id, data: game },
        });
      }
      const docks = waitForEvent<{ winnerId: string }>(
        recoverySocket,
        "docks:won",
      );
      assert.equal(await claimDocks(alphaSocket), true);
      assert.equal((await docks).winnerId, alphaRegistration.data.user.id);
      assert.equal(await claimDocks(recoverySocket), true);
      assert.equal(
        (await request(statePath, { cookie: alphaCookie })).data.docksWon,
        true,
      );
      assert.equal(
        (await request(statePath, { cookie: betaCookie })).data.docksWon,
        false,
      );

      const surge = waitForEvent<{ voyageEpoch: number }>(
        recoverySocket,
        "tidewatch:surge",
      );
      alphaSocket.emit("game:status", {
        ...claim,
        round: 1,
        phase: 1,
        reputation: 280,
      });
      recoverySocket.emit("game:status", {
        ...claim,
        round: 1,
        phase: 1,
        reputation: 220,
      });
      assert.equal((await surge).voyageEpoch, start.voyageEpoch);
      assert.equal(
        (await request(statePath, { cookie: betaCookie })).data.tidewatchSurge,
        true,
      );

      const completed = waitForEvent<VoyageCompleteEvent>(
        alphaSocket,
        "room:voyage_complete",
      );
      const status = {
        roomId: room.id,
        voyageEpoch: 0,
        round: 8,
        gameOver: true,
      };
      alphaSocket.emit("game:status", {
        ...status,
        phase: "endgame",
        reputation: 90,
      });
      recoverySocket.emit("game:status", {
        ...status,
        phase: "bankruptcy",
        reputation: 120,
      });
      const result = await completed;
      assert.equal(result.winnerId, alphaRegistration.data.user.id);
      assert.equal(result.standings[0].bankrupt, true);

      const reconnected = await connectCaptain(alphaRegistration.data.token);
      sockets.push(reconnected);
      const restored = waitForEvent<VoyageCompleteEvent>(
        reconnected,
        "room:voyage_complete",
        ({ replayed }) => replayed === true,
      );
      const restoredSurge = waitForEvent<{ voyageEpoch: number }>(
        reconnected,
        "tidewatch:surge",
      );
      const restoredDocks = waitForEvent<{ winnerId: string }>(
        reconnected,
        "docks:won",
      );
      reconnected.emit("room:join", { roomId: room.id });
      assert.deepEqual(await restored, { ...result, replayed: true });
      assert.equal((await restoredSurge).voyageEpoch, start.voyageEpoch);
      assert.equal(
        (await restoredDocks).winnerId,
        alphaRegistration.data.user.id,
      );
      reconnected.emit("game:status", {
        ...status,
        phase: "endgame",
        reputation: 90,
      });
      const legacy = await request("/api/legacy", { cookie: alphaCookie });
      assert.equal(legacy.data.legacy.voyagesCompleted, 1);
      assert.equal(legacy.data.legacy.seaMasterCrowns, 1);
    } finally {
      for (const socket of sockets) socket.disconnect();
      let forced = false;
      try {
        signalServer(server, "SIGTERM");
        let stopped = await waitForServerStop(15_000);
        if (!stopped) {
          forced = true;
          signalServer(server, "SIGKILL");
          stopped = await waitForServerStop(5_000);
        }

        let exited = await waitForProcessExit(server, 12_000);
        if (!exited) {
          forced = true;
          signalServer(server, "SIGKILL");
          exited = await waitForProcessExit(server, 5_000);
        }

        assert.equal(
          stopped,
          true,
          `Server did not release port 2154 cleanly\n${serverLogs}`,
        );
        assert.equal(
          exited,
          true,
          `Server process did not exit\n${serverLogs}`,
        );
        assert.equal(
          forced,
          false,
          `Server required a forced stop\n${serverLogs}`,
        );
        assert.equal(server.signalCode, null, serverLogs);
        assert.equal(server.exitCode, 0, serverLogs);
        assert.doesNotMatch(serverLogs, /PortMasters 2 shutdown failed/);
      } finally {
        if (server.exitCode === null && server.signalCode === null) {
          signalServer(server, "SIGKILL");
          await waitForProcessExit(server, 5_000);
        }
        server.stdout?.destroy();
        server.stderr?.destroy();
        server.unref();
        await removeDevelopmentOutput();
        await removeDatabase();
      }
    }
  },
);
