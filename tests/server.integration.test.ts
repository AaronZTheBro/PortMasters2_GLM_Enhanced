import {
  MAX_PLAUSIBLE_SCORE_PER_ROUND,
  plausibleCeiling,
} from "../src/lib/game/integrity";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { access, rm, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { io, type Socket } from "socket.io-client";
import {
  CURRENT_HARBOR_RULES,
  REVISED_HARBOR_RULES,
  PRE_TUNING_HARBOR_RULES,
  TUNED_HARBOR_RULES,
  type VoyageRules,
} from "../src/lib/game/expansion";
import {
  buildForecasts,
  buildVoyageRules,
  buildOpenHarborRules,
  buildClassicHarborRules,
  buildCurrentVoyageRules,
} from "../src/lib/game/forecast";
import { startPhase1 } from "../src/lib/game/engine/market";
import { nextPhase } from "../src/lib/game/engine/lifecycle";
import { hireEscort } from "../src/lib/game/engine/pirates";
import { purchaseIntel, startPhase2 } from "../src/lib/game/engine/orders";
import { computeHarborPulse } from "../src/lib/game/harborPulse";
import { unlockedResources } from "../src/lib/game/pools";
import {
  quotePortExchange,
  sellAtPortExchange,
} from "../src/lib/game/engine/orders";
import { BOONS, WORD_ON_THE_DOCKS_THRESHOLD } from "../src/lib/game/constants";
import {
  applyBarterEntries,
  type BarterUpdate,
} from "../src/lib/game/barter-ledger";
import { createInitialGameState, type GameState } from "../src/lib/game/types";
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
  { timeout: 120_000 },
  async () => {
    assert.equal(
      await waitForServerStop(10_000),
      true,
      "The test needs port 2154 and the development output to be idle",
    );
    await removeDevelopmentOutput();
    await removeDatabase();
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      NODE_ENV: "development",
      PORT: "2154",
    };

    await run(npmCommand, ["run", "db:push"], environment);

    let serverLogs = "";
    function launch() {
      serverLogs = "";
      const child = spawn(
        process.execPath,
        ["--import", "tsx", join(projectRoot, "server.ts")],
        {
          cwd: projectRoot,
          detached: process.platform !== "win32",
          env: environment,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.stdout.on("data", (chunk) => {
        serverLogs += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        serverLogs += String(chunk);
      });
      return child;
    }
    let server = launch();
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
        body: {
          name: "Integration harbor",
          isPublic: true,
          difficulty: "open_waters",
        },
      });
      const room = created.data.room as { id: string; code: string };

      const beforeJoining = await fetch(
        `${baseUrl}/api/game/state?roomId=${room.id}`,
        {
          headers: { cookie: betaCookie },
        },
      );
      assert.equal(beforeJoining.status, 404);

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

      const alphaId = alphaRegistration.data.user.id;
      const betaId = betaRegistration.data.user.id;
      const historyDb = new DatabaseSync(databasePath);
      try {
        const insertMessage = historyDb.prepare(
          "INSERT INTO Message (id, roomId, senderId, recipientId, content, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
        );
        for (let i = 0; i < 204; i++) {
          const time = new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString();
          insertMessage.run(
            `direct ${i}`,
            null,
            alphaId,
            betaId,
            `Direct ${i}`,
            time,
          );
          if (i < 104)
            insertMessage.run(
              `room ${i}`,
              room.id,
              alphaId,
              null,
              `Harbor ${i}`,
              time,
            );
        }
      } finally {
        historyDb.close();
      }

      const chatReceived = waitForEvent<{
        message: { content: string; sender: { username: string } };
      }>(
        alphaSocket,
        "chat:room",
        ({ message }) => message.content === "Ready to sail",
      );
      const delivered = await betaSocket
        .timeout(5000)
        .emitWithAck("chat:room", {
          roomId: room.id,
          content: "Ready to sail",
        });
      assert.equal(delivered, null);
      const chat = await chatReceived;
      assert.equal(chat.message.sender.username, "integration_beta");

      const roomDetail = await request(`/api/rooms/${room.id}`, {
        cookie: alphaCookie,
      });
      assert.equal(roomDetail.data.messages.at(-1).content, "Ready to sail");

      assert.equal(roomDetail.data.messages.length, 100);
      assert.equal(roomDetail.data.messages[0].content, "Harbor 5");
      const sent = await alphaSocket.timeout(5000).emitWithAck("chat:dm", {
        recipientId: betaId,
        content: "Meet at the pier",
      });
      assert.equal(sent, null);
      const direct = await request(`/api/messages/dm/${alphaId}`, {
        cookie: betaCookie,
      });
      assert.equal(direct.data.messages.length, 200);
      assert.equal(direct.data.messages[0].content, "Direct 5");
      assert.equal(direct.data.messages.at(-1).content, "Meet at the pier");

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
      alphaSocket.emit("room:start", {
        roomId: room.id,
        specialties: ["wax", "lacquer"],
      });
      const [start, otherStart] = await Promise.all([
        alphaStarted,
        betaStarted,
      ]);
      assert.deepEqual(start, otherStart);
      assert.equal(start.rules.version, CURRENT_HARBOR_RULES);
      assert.ok(start.rules.forecasts.length > 0);
      assert.equal(start.rules.specialties, undefined);
      assert.equal(start.rules.arrivals?.length, 12);
      let recoverySocket = await connectCaptain(betaRegistration.data.token);
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
      const exchange = createInitialGameState(
        0,
        1,
        start.voyageEpoch,
        "open_waters",
        start.rules,
      );
      exchange.phase = 2;
      const quoted = quotePortExchange(exchange, "Hemp", 4)!;
      const logs: string[] = [];
      assert.equal(sellAtPortExchange(exchange, quoted, logs), true);
      const sale = {
        roomId: room.id,
        data: { ...exchange, voyageLog: logs },
        revision: null,
      };
      const savedSale = await request("/api/game/state", {
        cookie: betaCookie,
        method: "PUT",
        body: sale,
      });
      assert.equal(typeof savedSale.data.revision, "number");
      const retry = await fetch(`${baseUrl}/api/game/state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: betaCookie },
        body: JSON.stringify(sale),
      });
      assert.equal(retry.status, 409);
      const settled = JSON.parse(
        (await request(statePath, { cookie: betaCookie })).data.state,
      );
      assert.equal(settled.inventory.Hemp, 4);
      assert.equal(settled.exchangeSales.Hemp, 4);
      assert.equal(settled.money, 100 + quoted.net);
      assert.deepEqual(settled.voyageLog, logs);
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

      for (const [cookie, quantities] of [
        [alphaCookie, { Hemp: 3 }],
        [betaCookie, { Silk: 2 }],
      ] as const) {
        const game = createInitialGameState(0, 1, start.voyageEpoch);
        game.currentRound = 2;
        game.phase = 5;
        game.charterId = "salt_guild";
        game.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
        game.pendingBoonId = "silk_wind";
        game.lastPurchaseTally = { round: 1, quantities };
        await request("/api/game/state", {
          cookie,
          method: "PUT",
          body: { roomId: room.id, data: game },
        });
      }
      const roundTwo = waitForEvent<Started & { round: number; phase: string }>(
        alphaSocket,
        "phase:ready_update",
        ({ round, phase }) => round === 2 && phase === "5",
      );
      alphaSocket.emit("game:status", { ...claim, round: 2, phase: 5 });
      await roundTwo;
      const pulseRelease = waitForEvent<{
        round: number;
        harborPulse: Record<string, number>;
      }>(alphaSocket, "phase:advance", ({ round }) => round === 2);
      for (const socket of [alphaSocket, recoverySocket])
        socket.emit("phase:ready", { ...claim, round: 2, phase: 5 });
      const pulse = (await pulseRelease).harborPulse;
      const totals = { Hemp: 3, Silk: 2 };
      assert.deepEqual(
        pulse,
        computeHarborPulse(
          totals,
          unlockedResources("open_waters", 1, CURRENT_HARBOR_RULES),
        ),
      );

      for (const phase of [1, "barter"] as const) {
        const checkpoint = waitForEvent<{
          round: number;
          phase: string;
          harborPulse?: Record<string, number>;
        }>(
          recoverySocket,
          "phase:ready_update",
          (entry) => entry.round === 2 && entry.phase === String(phase),
        );
        alphaSocket.emit("game:status", { ...claim, round: 2, phase });
        assert.deepEqual((await checkpoint).harborPulse, pulse);
      }

      const setupConvoyFunds = async (
        cookie: string,
        gold: number,
        tax: number,
      ) => {
        const game = createInitialGameState(
          0,
          1,
          start.voyageEpoch,
          "open_waters",
          start.rules,
        );
        game.currentRound = 2;
        game.phase = 4;
        game.money = gold;
        game.roundIncomeTaxDue = tax;
        await request("/api/game/state", {
          cookie,
          method: "PUT",
          body: { roomId: room.id, data: game },
        });
        return game;
      };

      const posted = waitForEvent<{
        ventures: { id: string; total: number }[];
      }>(
        alphaSocket,
        "venture:update",
        ({ ventures }) => ventures.length === 1,
      );
      alphaSocket.emit("venture:post", {
        roomId: room.id,
        targetGold: 150,
        deadlineRound: 4,
      });
      const venture = (await posted).ventures[0];
      const contribute = (socket: Socket, amount: number) =>
        socket.timeout(4000).emitWithAck("venture:contribute", {
          roomId: room.id,
          ventureId: venture.id,
          amount,
        }) as Promise<{ error: string | null }>;
      await setupConvoyFunds(alphaCookie, 100, 30);
      assert.match((await contribute(alphaSocket, 75)).error ?? "", /70/);
      const alphaGame = await setupConvoyFunds(alphaCookie, 125, 30);
      const betaGame = await setupConvoyFunds(betaCookie, 100, 0);
      const stake = waitForEvent<BarterUpdate>(
        recoverySocket,
        "barter:update",
        ({ entries }) =>
          entries.some(
            (entry) =>
              entry.userId === betaId && entry.changes[0]?.amount === -75,
          ),
      );
      assert.deepEqual(await contribute(recoverySocket, 75), { error: null });
      const betaStake = (await stake).entries;
      const betSave = structuredClone(betaGame);
      applyBarterEntries(betSave, betaStake, []);
      assert.equal(betSave.money, 25);
      await request("/api/game/state", {
        cookie: betaCookie,
        method: "PUT",
        body: { roomId: room.id, data: betSave },
      });
      recoverySocket.disconnect();

      const alphaPayout = waitForEvent<BarterUpdate>(
        alphaSocket,
        "barter:update",
        ({ entries }) =>
          entries.some(
            (entry) =>
              entry.userId === alphaId && entry.changes[0]?.amount === 113,
          ),
      );
      assert.deepEqual(await contribute(alphaSocket, 75), { error: null });
      assert.match(
        (await contribute(alphaSocket, 75)).error ?? "",
        /no longer open/,
      );
      const alphaEntries = (await alphaPayout).entries;
      applyBarterEntries(alphaGame, alphaEntries, []);
      applyBarterEntries(alphaGame, alphaEntries, []);
      assert.equal(alphaGame.money, 163);
      assert.equal(alphaGame.roundIncomeTaxDue, 30);

      recoverySocket = await connectCaptain(betaRegistration.data.token);
      sockets.push(recoverySocket);
      const betaPayout = waitForEvent<BarterUpdate>(
        recoverySocket,
        "barter:update",
        ({ entries }) =>
          entries.some(
            (entry) =>
              entry.userId === betaId && entry.changes[0]?.amount === 113,
          ),
      );
      const resumedVentureBoard = waitForEvent<{
        locked: boolean;
        ventures: unknown[];
      }>(recoverySocket, "venture:update");
      recoverySocket.emit("room:join", { roomId: room.id });
      const betaEntries = (await betaPayout).entries;
      const board = await resumedVentureBoard;
      assert.equal(board.locked, true);
      assert.deepEqual(board.ventures, []);
      applyBarterEntries(betSave, betaEntries, []);
      applyBarterEntries(betSave, betaEntries, []);
      assert.equal(betSave.money, 138);

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

      const resetVentures = waitForEvent<{
        locked: boolean;
        ventures: unknown[];
      }>(reconnected, "venture:update", ({ locked }) => !locked);
      reconnected.emit("room:restart", { roomId: room.id });
      assert.deepEqual((await resetVentures).ventures, []);

      const fixtures = [];
      for (let version = 1; version <= CURRENT_HARBOR_RULES; version++) {
        const difficulty = "open_waters";
        const created = await request("/api/rooms", {
          cookie: alphaCookie,
          body: { name: `Recovery ${version}`, difficulty },
        });
        const id = created.data.room.id as string;
        const ctx = { roomSeed: id, seedBase: `${id}:${alphaId}` };
        const epoch = 2;
        const rules = [
          { version: 1, forecasts: [] },
          { version: 2, forecasts: buildForecasts(id, epoch, difficulty) },
          buildVoyageRules(id, epoch, difficulty, ["wax", "lacquer"]),
          buildOpenHarborRules(id, epoch, difficulty),
          buildClassicHarborRules(id, epoch, difficulty),
          buildClassicHarborRules(id, epoch, difficulty, REVISED_HARBOR_RULES),
          buildClassicHarborRules(
            id,
            epoch,
            difficulty,
            PRE_TUNING_HARBOR_RULES,
          ),
          buildClassicHarborRules(id, epoch, difficulty, TUNED_HARBOR_RULES),
          buildCurrentVoyageRules(id, epoch, difficulty),
        ][version - 1];
        const state = createInitialGameState(0, 1, epoch, difficulty, rules);
        state.currentRound = state.maxRounds;
        state.seatSeed = ctx.seedBase;
        state.modifierFlags.transport_flat_discount = 4;
        if (version === CURRENT_HARBOR_RULES) {
          // Exercise the version 9 fields through the save and restart path.
          state.charterId = "salt_guild";
          state.favors = ["merchant_charm"];
          state.favorMarks = { merchant_charm: 3 };
          state.engines = [
            {
              id: "silk_reel",
              favorId: "silk_wind",
              moduleId: "silk_monopoly",
              rank: 2,
              fusedRound: 1,
            },
          ];
          state.heat = 3;
          state.shadowGold = 25;
        }
        const db = new DatabaseSync(databasePath);
        try {
          // Create a voyage started by the release that owned these rules.
          db.prepare(
            "UPDATE Room SET started = 1, voyageEpoch = ?, currentRound = ?, currentPhase = '2', rulesVersion = ?, forecastPlan = ? WHERE id = ?",
          ).run(
            epoch,
            state.currentRound,
            version,
            JSON.stringify(version < 3 ? rules.forecasts : rules),
            id,
          );
        } finally {
          db.close();
        }
        startPhase1(state, ctx, []);
        purchaseIntel(state, []);
        startPhase2(state, ctx, []);
        assert.ok(state.customerCards.length && state.revealedIntel.length);
        await request("/api/game/state", {
          cookie: alphaCookie,
          method: "PUT",
          body: { roomId: id, data: state, revision: null },
        });
        fixtures.push({
          id,
          rules,
          ctx,
          state: JSON.parse(JSON.stringify(state)) as GameState,
        });
      }
      for (const socket of sockets) socket.disconnect();
      signalServer(server, "SIGTERM");
      assert.ok(await waitForProcessExit(server, 15_000), serverLogs);
      assert.ok(await waitForServerStop(5_000), serverLogs);
      assert.equal(server.exitCode, 0, serverLogs);
      server = launch();
      await waitForServer(server, () => serverLogs);
      // Leave the server idle past its ordinary departure window.
      await new Promise((resolve) => setTimeout(resolve, 31_000));
      const resumed = await connectCaptain(alphaRegistration.data.token);
      sockets.push(resumed);
      for (const { id, rules, ctx, state } of fixtures) {
        const checkpoint = waitForEvent<
          Started & { round: number; phase: string }
        >(resumed, "phase:ready_update", (event) => event.roomId === id);
        resumed.emit("room:join", { roomId: id });
        const restored = await checkpoint;
        assert.deepEqual(restored.rules, rules);
        assert.equal(restored.voyageEpoch, state.voyageEpoch);
        assert.equal(restored.round, state.maxRounds);
        assert.equal(restored.phase, "2");
        const path = `/api/game/state?roomId=${id}`;
        const loaded = (await request(path, { cookie: alphaCookie })).data;
        assert.deepEqual(loaded.rules, rules);
        const game = JSON.parse(loaded.state) as GameState;
        assert.deepEqual(game, state);
        for (const captain of [game, state]) {
          nextPhase(captain, ctx, []);
          hireEscort(captain, []);
          nextPhase(captain, ctx, []);
          nextPhase(captain, ctx, []);
          assert.equal(captain.phase, "endgame");
        }
        assert.deepEqual(game, state);
        await request("/api/game/state", {
          cookie: alphaCookie,
          method: "PUT",
          body: { roomId: id, data: game, revision: loaded.revision },
        });
        const finished = (await request(path, { cookie: alphaCookie })).data;
        assert.equal(JSON.parse(finished.state).phase, "endgame");
        if (rules.version === CURRENT_HARBOR_RULES) {
          const auditDb = new DatabaseSync(databasePath);
          try {
            auditDb
              .prepare(
                "UPDATE GameState SET integritySeverity = 'impossible', integrityNote = 'Earlier finding' WHERE roomId = ? AND userId = ?",
              )
              .run(id, alphaId);
            const data = {
              ...game,
              score:
                plausibleCeiling(
                  MAX_PLAUSIBLE_SCORE_PER_ROUND,
                  game.maxRounds,
                ) / 2,
            };
            await request("/api/game/state", {
              cookie: alphaCookie,
              method: "PUT",
              body: { roomId: id, data, revision: finished.revision },
            });
            const mark = auditDb
              .prepare(
                "SELECT integritySeverity, integrityNote FROM GameState WHERE roomId = ? AND userId = ?",
              )
              .get(id, alphaId);
            assert.equal(mark?.integritySeverity, "impossible");
            assert.equal(mark?.integrityNote, "Earlier finding");
          } finally {
            auditDb.close();
          }
        }
        assert.deepEqual(finished.rules, rules);
      }
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
