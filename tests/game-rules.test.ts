import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { computeBackingResolution } from "../src/lib/game/backing";
import { applyCheckIn, checkInStatus } from "../src/lib/game/checkin";
import {
  computeAcceptedContribution,
  computeSettlements,
  computeVentureDeadlineBounds,
} from "../src/lib/game/convoy";
import {
  MANDATE_TEMPLATES,
  marketCountsFor,
  pirateChanceFor,
  unlockedTierFor,
} from "../src/lib/game/difficulty";
import {
  completeOrder,
  draftBoons,
  explainTransportCost,
  hireEscort,
  hireWorker,
  payMaintenance,
  payWages,
  purchaseIntel,
  resolvePirateAttack,
  startPhase1,
  workerWagesFor,
} from "../src/lib/game/engine";
import { applyBarterEntries } from "../src/lib/game/barter-ledger";
import { BROKERS_FAVOR_PAYOUT_CAP, MODULES } from "../src/lib/game/constants";
import { endRound } from "../src/lib/game/engine/lifecycle";
import { quoteOrder } from "../src/lib/game/engine/orders";
import { quotePirateWaters } from "../src/lib/game/engine/pirates";
import { createRng } from "../src/lib/game/rng";
import { buildPriceSnapshot } from "../src/lib/use-price-history";
import { computeHarborPulse, PULSE_CAP } from "../src/lib/game/harborPulse";
import { checkSave, plausibleCeiling } from "../src/lib/game/integrity";
import { createInitialGameState, type OrderCard } from "../src/lib/game/types";
import {
  DEFAULT_APPLICATION_PORT,
  getApplicationPort,
  getDatabaseUrl,
} from "../src/server/environment";

test("application port defaults to 2154 and accepts Railway assignment", () => {
  const previousPort = process.env.PORT;
  const previousRailwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  try {
    delete process.env.RAILWAY_ENVIRONMENT_ID;
    delete process.env.PORT;
    assert.equal(getApplicationPort(), DEFAULT_APPLICATION_PORT);

    process.env.PORT = "2154";
    assert.equal(getApplicationPort(), DEFAULT_APPLICATION_PORT);

    process.env.PORT = "4321";
    assert.throws(() => getApplicationPort(), /must be 2154/);

    process.env.RAILWAY_ENVIRONMENT_ID = "test";
    assert.equal(getApplicationPort(), 4321);

    process.env.PORT = "invalid";
    assert.throws(() => getApplicationPort(), /valid TCP port/);
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousRailwayEnvironmentId === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT_ID;
    } else {
      process.env.RAILWAY_ENVIRONMENT_ID = previousRailwayEnvironmentId;
    }
  }
});

test("Railway database storage prefers a volume and has a boot fallback", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousMountPath = process.env.RAILWAY_VOLUME_MOUNT_PATH;
  const previousRailwayEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID;
  const projectRoot = resolve(tmpdir(), "portmasters-environment-test");

  try {
    delete process.env.DATABASE_URL;
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    process.env.RAILWAY_ENVIRONMENT_ID = "test";

    assert.equal(
      getDatabaseUrl(projectRoot),
      `file:${resolve(tmpdir(), "portmasters.db")}`,
    );

    process.env.RAILWAY_VOLUME_MOUNT_PATH = "/data";
    assert.equal(getDatabaseUrl(projectRoot), "file:/data/portmasters.db");

    process.env.DATABASE_URL = "file:./explicit.db";
    assert.equal(
      getDatabaseUrl(projectRoot),
      `file:${resolve(projectRoot, "explicit.db")}`,
    );
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousMountPath === undefined) {
      delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
    } else {
      process.env.RAILWAY_VOLUME_MOUNT_PATH = previousMountPath;
    }
    if (previousRailwayEnvironmentId === undefined) {
      delete process.env.RAILWAY_ENVIRONMENT_ID;
    } else {
      process.env.RAILWAY_ENVIRONMENT_ID = previousRailwayEnvironmentId;
    }
  }
});

test("difficulty configuration controls initial voyage state", () => {
  const fairWinds = createInitialGameState(0, 1, 0, "fair_winds");
  const monsoon = createInitialGameState(12, 5, 3, "monsoon");

  assert.equal(fairWinds.money, 100);
  assert.equal(fairWinds.maxRounds, 8);
  assert.equal(fairWinds.fixedCost, 15);

  assert.equal(monsoon.money, 102);
  assert.equal(monsoon.maxRounds, 16);
  assert.equal(monsoon.fixedCost, 22);
  assert.equal(monsoon.renownLevel, 5);
  assert.equal(monsoon.voyageEpoch, 3);
});

test("seeded market generation is reproducible for one captain", () => {
  const first = createInitialGameState(0, 1, 2, "open_waters");
  const second = createInitialGameState(0, 1, 2, "open_waters");
  first.currentRound = 8;
  second.currentRound = 8;

  startPhase1(first, { seedBase: "room-1:user-1" }, []);
  startPhase1(second, { seedBase: "room-1:user-1" }, []);

  assert.deepEqual(first.resourceCards, second.resourceCards);
  assert.deepEqual(first.phase2DemandTags, second.phase2DemandTags);
  assert.equal(first.resourceCards.length, 10);
  assert.equal(unlockedTierFor("open_waters", 8), 2);
  assert.deepEqual(marketCountsFor("open_waters", 8), {
    purchase: 10,
    order: 10,
  });
});

test("difficulty changes pirate risk after the midpoint", () => {
  assert.equal(pirateChanceFor("fair_winds", 8, 8), 0.2);
  assert.equal(pirateChanceFor("open_waters", 6, 12), 0.22);
  assert.equal(pirateChanceFor("open_waters", 7, 12), 0.3);
  assert.equal(pirateChanceFor("monsoon", 9, 16), 0.38);
});

test("daily check-in advances once per UTC day and wraps after day seven", () => {
  const today = "2026-08-06";
  const claim = applyCheckIn(
    { checkInCount: 6, lastCheckInDate: "2026-08-05" },
    today,
  );

  assert.deepEqual(claim, {
    day: 7,
    xp: 150,
    next: { checkInCount: 0, lastCheckInDate: today },
  });
  assert.equal(applyCheckIn(claim!.next, today), null);
  assert.equal(checkInStatus(claim!.next, "2026-08-07").currentDay, 1);
});

test("harbor pulse is neutral for no trade and capped for a crowded good", () => {
  assert.deepEqual(computeHarborPulse(undefined), {});
  assert.deepEqual(computeHarborPulse({ Hemp: 0, Silk: 0, Tea: 0 }), {});

  const pulse = computeHarborPulse({ Hemp: 12, Silk: 0, Tea: 0 });
  assert.equal(pulse.Hemp, PULSE_CAP);
  assert.equal(pulse.Silk, -PULSE_CAP);
  assert.equal(pulse.Tea, -PULSE_CAP);
});

test("convoy contributions and settlements preserve their caps", () => {
  assert.equal(computeAcceptedContribution(70, 100, 50, 20, 0.5), 30);
  assert.equal(computeAcceptedContribution(20, 100, 50, 50, 0.5), 0);
  assert.deepEqual(computeVentureDeadlineBounds(6, 8, 1, 3), {
    minRound: 7,
    maxRound: 7,
  });
  assert.equal(computeVentureDeadlineBounds(7, 8, 1, 3), null);
  assert.deepEqual(
    computeSettlements(
      {
        a: { name: "A", amount: 40 },
        b: { name: "B", amount: 60 },
      },
      "filled",
    ),
    [
      { userId: "a", name: "A", amount: 60 },
      { userId: "b", name: "B", amount: 90 },
    ],
  );
});

test("backing only covers the unpaid part of a loan", () => {
  assert.deepEqual(computeBackingResolution(100, 70, 40), {
    calledAmount: 30,
    refundAmount: 10,
  });
  assert.deepEqual(computeBackingResolution(100, 100, 40), {
    calledAmount: 0,
    refundAmount: 40,
  });
});

test("ledger integrity distinguishes plausible and impossible saves", () => {
  assert.equal(checkSave({ money: 100, score: 50 }, 1).severity, "ok");

  const ceiling = plausibleCeiling(100, 2);
  assert.equal(ceiling, 800);

  const verdict = checkSave(
    { money: Number.MAX_SAFE_INTEGER, score: Number.MAX_SAFE_INTEGER },
    2,
  );
  assert.equal(verdict.severity, "impossible");
  assert.equal(verdict.plausible, false);
  assert.equal(verdict.findings.length, 2);
});

test("Broker Favor applies its cap after bonuses and VAT", () => {
  const game = createInitialGameState(0, 5, 0, "monsoon");
  game.currentRound = 12;
  game.shipLevel = 3;
  game.equippedModules = MODULES.filter(({ id }) => id === "silk_monopoly");
  const order: OrderCard = {
    id: 1,
    demandPort: "Quanzhou Port",
    reward: 1150,
    totalItems: 10,
    isProductOrder: true,
    isBrokerFavor: true,
    resources: [{ type: "Foreign Balm", required: 10 }],
  };
  for (const vatDiscount of [0, 0.5]) {
    game.modifierFlags = {
      exotic_order_bonus: 0.15,
      vat_discount: vatDiscount,
    };
    const quote = quoteOrder(game, order);
    assert.ok(quote.reward <= BROKERS_FAVOR_PAYOUT_CAP);
    assert.equal(
      quote.commissionBase,
      order.reward -
        quote.totalVat +
        quote.bonuses.reduce((sum, bonus) => sum + bonus.gold, 0),
    );
  }
});

test("Imperial Mandates have fixed reward and no VAT", () => {
  const game = createInitialGameState(0, 5, 0, "monsoon");
  game.equippedModules = MODULES.filter(({ id }) => id === "silk_monopoly");
  const mandate = MANDATE_TEMPLATES[1];
  const quote = quoteOrder(game, {
    id: 1,
    demandPort: mandate.port,
    resources: mandate.resources,
    reward: mandate.reward,
    totalItems: 3,
    isProductOrder: false,
    isMandate: true,
  });
  assert.equal(quote.reward, 260);
  assert.equal(quote.totalVat, 0);
  assert.equal(quote.bonuses.length, 0);
});

test("An audit spends available Gold and records the actual expense", (t) => {
  t.mock.method(Math, "random", () => 0);
  const game = createInitialGameState();
  game.phase = 2;
  game.money = 0;
  game.inventory.Hemp = 1;
  game.equippedModules = MODULES.filter(({ id }) => id === "tax_evasion");
  game.customerCards = [
    {
      id: 1,
      demandPort: "Quanzhou Port",
      totalItems: 1,
      reward: 20,
      isProductOrder: false,
      resources: [{ type: "Hemp", required: 1 }],
    },
  ];
  const logs: string[] = [];
  completeOrder(game, 1, logs);
  assert.equal(game.money, 0);
  assert.equal(game.roundCosts, 20);
  assert.equal(game.totalCosts, 20);
  assert.equal(game.score, 0);
  assert.ok(logs.some((line) => line.includes("Net Profit: 0 Gold")));
  game.money = -5;
  hireEscort(game, []);
  assert.equal(game.money, -5);
});

test("Pirate and escort quotes include the leak and both risk effects", (t) => {
  const game = createInitialGameState(0, 1, 0, "monsoon");
  game.currentRound = 12;
  game.money = 100;
  game.brokerTippedPirates = true;
  assert.equal(quotePirateWaters(game).chance, 0.46);
  assert.equal(quotePirateWaters(game).escortCost, 15);
  game.equippedModules = MODULES.filter(
    ({ id }) => id === "persian_dome_compass",
  );
  assert.equal(Number(quotePirateWaters(game).chance.toFixed(3)), 0.322);
  game.equippedModules = [];
  game.modifierFlags = { pirate_risk_discount: 0.5, escort_discount: 0.5 };
  assert.equal(quotePirateWaters(game).chance, 0.23);
  game.equippedModules = MODULES.filter(
    ({ id }) => id === "persian_dome_compass",
  );
  assert.equal(Number(quotePirateWaters(game).chance.toFixed(3)), 0.161);
  assert.equal(quotePirateWaters(game).escortCost, 7);
  t.mock.method(Math, "random", () => 0.2);
  const unescorted = structuredClone(game);
  resolvePirateAttack(unescorted, []);
  assert.equal(unescorted.money, 100);
  hireEscort(game, []);
  assert.equal(game.money, 93);
});

test("Round taxes count wages and maintenance once, with separate VAT totals", () => {
  const game = createInitialGameState(0, 1, 0, "monsoon");
  game.money = 200;
  game.roundRevenue = 200;
  game.roundCosts = 40;
  game.totalCosts = 40;
  game.modifierFlags = { income_tax_override: 0.05 };
  game.equippedModules = MODULES.filter(({ id }) => id === "overdrive_engine");
  game.maintenancePenalty = 10;
  game.vatPaid = 13;
  game.roundVatPaid = 4;
  hireWorker(game, "weaver", []);
  payWages(game, []);
  payMaintenance(game, []);
  const logs: string[] = [];
  endRound(game, logs);
  assert.equal(game.incomeTaxPaid, 6);
  assert.equal(game.totalCosts, 80);
  assert.equal(game.totalWorkerWages, 8);
  assert.equal(game.totalMaintenanceCosts, 32);
  assert.ok(logs.includes("🧾 VAT paid this round: 4 Gold"));
  const nextLogs: string[] = [];
  endRound(game, nextLogs);
  assert.equal(game.vatPaid, 13);
  assert.ok(!nextLogs.some((line) => line.includes("VAT paid this round")));
});

test("Only new hires get the apprenticeship discount", () => {
  const game = createInitialGameState();
  hireWorker(game, "weaver", []);
  game.currentRound++;
  game.modifierFlags = { hire_discount: 0.5 };
  game.equippedModules = MODULES.filter(({ id }) => id === "artisans_workshop");
  hireWorker(game, "weaver", []);
  assert.equal(workerWagesFor(game, "weaver"), 13);
  payWages(game, []);
  assert.equal(game.workerWages, 13);
  game.currentRound++;
  assert.equal(workerWagesFor(game, "weaver"), 18);
});

test("A crew of charter artisans can draw Artisan Inspiration", (t) => {
  const game = createInitialGameState(0, 1, 0, "monsoon");
  game.currentRound = 12;
  hireWorker(game, "potter", []);
  const rng = createRng("charter artisans");
  t.mock.method(Math, "random", rng);
  const drawn = Array.from({ length: 100 }, () => draftBoons(game)).flat();
  assert.ok(drawn.some(({ id }) => id === "artisan_inspiration"));
});

test("Broker bundles share one corruption roll and a finite pool of unique tips", (t) => {
  const game = createInitialGameState(0, 1, 0, "monsoon");
  game.currentRound = 12;
  game.equippedModules = MODULES.filter(({ id }) =>
    ["brokers_network", "ocean_relay"].includes(id),
  );
  game.intelCost = 2;
  game.modifierFlags = { free_intel: 1 };
  startPhase1(game, { seedBase: "broker bundle" }, []);
  assert.equal(
    new Set([
      ...game.phase2DemandTags,
      ...game.revealedIntel.map(({ item }) => item),
    ]).size,
    5,
  );
  const random = t.mock.method(Math, "random", () => 0.5);
  for (const count of [1, 2, 3]) {
    const sample = structuredClone(game);
    sample.phase2DemandTags = game.phase2DemandTags.slice(0, count);
    random.mock.resetCalls();
    purchaseIntel(sample, []);
    assert.equal(sample.revealedIntel.length, count + 1);
    assert.equal(sample.money, game.money - 2);
    assert.equal(random.mock.callCount(), 2 * count + 1);
  }
});

test("Price history separates listed market prices and buyer quotes", () => {
  const game = createInitialGameState();
  game.resourceCards = [
    {
      id: 0,
      port: "Ningbo",
      isProductCard: false,
      totalCost: 3,
      resources: [{ type: "Hemp", quantity: 1, price: 3 }],
    },
    {
      id: 1,
      port: "Quanzhou",
      isProductCard: false,
      totalCost: 5,
      resources: [{ type: "Hemp", quantity: 1, price: 5 }],
    },
  ];
  game.customerCards = [
    {
      id: 0,
      demandPort: "Hangzhou",
      totalItems: 1,
      reward: 20,
      isProductOrder: false,
      resources: [{ type: "Hemp", required: 1 }],
    },
    {
      id: 1,
      demandPort: "Ningbo",
      totalItems: 1,
      reward: 1000,
      isProductOrder: false,
      isBrokerFavor: true,
      resources: [{ type: "Hemp", required: 1 }],
    },
  ];
  assert.deepEqual(buildPriceSnapshot(game, "buy").Hemp, {
    round: 1,
    price: 4,
    port: "Ningbo, Quanzhou",
  });
  assert.deepEqual(buildPriceSnapshot(game, "sell").Hemp, {
    round: 1,
    price: 15,
    port: "Hangzhou",
  });
});

test("Freight applies flat module discounts before Silk discounts", () => {
  const game = createInitialGameState();
  game.shipLevel = 2;
  game.equippedModules = MODULES.filter(({ id }) => id === "overdrive_engine");
  game.modifierFlags = { transport_silk_discount: 0.5 };
  const quote = explainTransportCost(game, {
    totalItems: 10,
    resources: [{ type: "Silk", required: 10 }],
  });
  assert.equal(quote.final, 2);
  assert.equal(
    quote.base + quote.steps.reduce((sum, step) => sum + step.delta, 0),
    2,
  );
});

test("Replay of a committed barter ledger does not consume cargo twice", () => {
  const game = createInitialGameState();
  game.inventory.Hemp = 10;
  const entries = [
    {
      id: 2,
      userId: "captain",
      changes: [{ item: "Hemp", amount: -1 }],
      line: "Offer posted",
    },
    {
      id: 5,
      userId: "captain",
      changes: [{ item: "Hemp", amount: 1 }],
      line: "Cargo returned",
    },
  ];
  const logs: string[] = [];
  applyBarterEntries(game, entries, logs);
  applyBarterEntries(game, entries, logs);
  assert.equal(game.inventory.Hemp, 10);
  assert.deepEqual(logs, ["Offer posted", "Cargo returned"]);
  assert.equal(game.barterCursor, 5);
});
