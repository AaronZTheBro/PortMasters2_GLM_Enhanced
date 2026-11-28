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
  explainExpectedPrice,
  explainTransportCost,
  hireEscort,
  hireWorker,
  handleModuleSelect,
  finalizeModuleSwap,
  payMaintenance,
  payWages,
  purchaseIntel,
  resolvePirateAttack,
  selectBoon,
  shipUpgradeSurcharge,
  startPhase1,
  whisperCost,
  workerWagesFor,
} from "../src/lib/game/engine";
import { applyBarterEntries } from "../src/lib/game/barter-ledger";
import {
  BOONS,
  BROKERS_FAVOR_PAYOUT_CAP,
  MODULES,
} from "../src/lib/game/constants";
import { endRound } from "../src/lib/game/engine/lifecycle";
import { quoteOrder } from "../src/lib/game/engine/orders";
import { quotePirateWaters } from "../src/lib/game/engine/pirates";
import { createRng } from "../src/lib/game/rng";
import { buildPriceSnapshot } from "../src/lib/use-price-history";
import {
  computeHarborPulse,
  PULSE_CAP,
  savedPurchaseTotals,
} from "../src/lib/game/harborPulse";
import { checkSave, plausibleCeiling } from "../src/lib/game/integrity";
import { createInitialGameState, type OrderCard } from "../src/lib/game/types";
import {
  DEFAULT_APPLICATION_PORT,
  getApplicationPort,
  getDatabaseUrl,
} from "../src/server/environment";

test("Application port defaults to 2154 and accepts valid custom ports", () => {
  const previousPort = process.env.PORT;
  try {
    delete process.env.PORT;
    assert.equal(getApplicationPort(), DEFAULT_APPLICATION_PORT);

    for (const port of [1, 2154, 4321, 65535]) {
      process.env.PORT = String(port);
      assert.equal(getApplicationPort(), port);
    }

    for (const invalidPort of ["", "0", "4321.5", "65536", "invalid"]) {
      process.env.PORT = invalidPort;
      assert.throws(() => getApplicationPort(), /valid TCP port/);
    }
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
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

test("Daily check in advances once per UTC day and wraps after day seven", () => {
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
  assert.ok(logs.some((line) => line.includes("Net Proceeds: 0 Gold")));
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

test("The previous boon is recorded after its effects expire", () => {
  const game = createInitialGameState();
  const loan = BOONS.find(({ id }) => id === "emergency_loan")!;
  const shelter = BOONS.find(({ id }) => id === "tax_shelter")!;
  const ctx = { seedBase: "boon history" };
  game.phase = 5;
  game.boonChoices = [loan];
  selectBoon(game, ctx, shelter.id, []);
  assert.equal(game.phase, 5);
  selectBoon(game, ctx, loan.id, []);
  assert.equal(game.money, 140);
  selectBoon(game, ctx, loan.id, []);
  assert.equal(game.money, 140);
  endRound(game, []);
  assert.deepEqual(game.modifierFlags, {});
  assert.equal(game.lastBoonId, loan.id);
});

test("Module swaps change costs based on the installed module", () => {
  const game = createInitialGameState();
  const findModule = (id: string) => MODULES.find((m) => m.id === id)!;
  game.shipLevel = 1;
  game._draftChoices = [
    findModule("brokers_network"),
    findModule("bulk_hauler"),
  ];
  game.phase = "module_draft";
  handleModuleSelect(game, 0, []);
  assert.equal(whisperCost(game), 2);
  game.phase = "module_draft";
  handleModuleSelect(game, 0, []);
  finalizeModuleSwap(game, 8, []);
  assert.equal(whisperCost(game), 2);
  finalizeModuleSwap(game, 0, []);
  assert.equal(whisperCost(game), 5);
  assert.equal(shipUpgradeSurcharge(game), 15);
  assert.deepEqual(
    game.equippedModules.map(({ id }) => id),
    ["bulk_hauler"],
  );
});

test("Finished good price ranges and later weighted draws match the market", () => {
  const game = createInitialGameState();
  const quote = explainExpectedPrice(game, "Linen Clothes");
  assert.equal(quote.min, 30);
  assert.equal(quote.max, 30);

  let hempFirst = 0;
  let silkSecond = 0;
  for (let seed = 0; seed < 300; seed++) {
    startPhase1(game, { seedBase: `weighted:${seed}` }, []);
    for (const card of game.resourceCards) {
      const [first, second] = card.resources;
      if (first.type !== "Hemp" || !second) continue;
      hempFirst++;
      if (second.type === "Silk") silkSecond++;
    }
  }
  assert.ok(hempFirst > 250);
  assert.ok(Math.abs(silkSecond / hempFirst - 35 / 60) < 0.06);
});

test("Broker bundles share one corruption roll and a finite pool of unique tips", (t) => {
  const game = createInitialGameState(0, 1, 0, "monsoon");
  game.currentRound = 12;
  game.equippedModules = MODULES.filter(({ id }) =>
    ["brokers_network", "ocean_relay"].includes(id),
  );
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

test("Harbor Pulse uses saved receipts after the round clears its market", () => {
  const game = createInitialGameState(0, 1, 7);
  game.resourceCards = [
    {
      id: 1,
      port: "Quanzhou Port",
      resources: [{ type: "Hemp", quantity: 3 }],
      totalCost: 9,
      isProductCard: false,
    },
    {
      id: 2,
      port: "Quanzhou Port",
      resources: [{ type: "Linen Clothes", quantity: 2 }],
      totalCost: 45,
      isProductCard: true,
    },
  ];
  game.purchasedCards = [1, 1, 2];
  const earlyExit = JSON.stringify({ ...game, purchasedCards: [1] });
  endRound(game, []);
  assert.deepEqual(game.resourceCards, []);
  const tally = savedPurchaseTotals(
    [
      JSON.stringify(game),
      earlyExit,
      JSON.stringify({ ...game, voyageEpoch: 6 }),
      JSON.stringify({
        ...game,
        lastPurchaseTally: { round: 4, quantities: { Hemp: 100 } },
      }),
    ],
    7,
    1,
  );
  assert.deepEqual(tally, { Hemp: 6 });
  assert.deepEqual(computeHarborPulse(tally, ["Hemp", "Silk", "Tea"]), {
    Hemp: PULSE_CAP,
    Silk: -PULSE_CAP,
    Tea: -PULSE_CAP,
  });
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
  game.resourceCards.push({
    id: 100,
    port: "Workshop Supplier",
    workshopSupply: true,
    totalCost: 99,
    isProductCard: false,
    resources: [{ type: "Hemp", quantity: 1, price: 99 }],
  });
  assert.deepEqual(buildPriceSnapshot(game, "buy").Hemp, {
    round: 1,
    price: 4,
    port: "Ningbo, Quanzhou",
  });
  const order = game.customerCards[0];
  game.customerCards.push(
    {
      ...order,
      id: 100,
      demandPort: "Clearance Buyer",
      clearance: true,
      reward: 99,
    },
    {
      ...order,
      id: 50,
      demandPort: "Quanzhou Port",
      workshop: true,
      reward: 99,
    },
  );
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

test("Price breakdown renders savings without a minus sign", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PriceBreakdownTooltip } =
    await import("../src/components/portmasters/game/PriceTooltips");
  const markup = renderToStaticMarkup(
    createElement(PriceBreakdownTooltip, {
      breakdown: {
        base: 34,
        final: 28,
        steps: [{ label: "Merchant's Charm", delta: -6 }],
      },
    }),
  );
  assert.match(markup, /Save.*6.*Gold/);
  assert.doesNotMatch(markup, /-6/);
});

test("Gold proceeds describe costs without a minus sign", async () => {
  const { formatGoldProceeds } = await import("../src/lib/utils");
  assert.equal(formatGoldProceeds(-6), "cost 6 Gold");
  assert.equal(formatGoldProceeds(0), "proceeds 0 Gold");
  assert.equal(formatGoldProceeds(15), "proceeds 15 Gold");
});

test("The advisor describes a costly Broker order without a minus sign", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { StrategyAdvisor } =
    await import("../src/components/portmasters/StrategyAdvisor");
  const { callBrokersFavor } = await import("../src/lib/game/engine/orders");
  const { buildCurrentVoyageRules } = await import("../src/lib/game/forecast");
  const game = createInitialGameState(
    0,
    5,
    1,
    "fair_winds",
    buildCurrentVoyageRules("test", 1, "fair_winds"),
  );
  game.phase = 2;
  game.seatSeed = "t";
  game.money = 1000;
  game.inventory.Hemp = 100;
  game.shipLevel = 0;
  callBrokersFavor(game, "Hemp", 100, []);
  const quote = quoteOrder(game, game.customerCards[0]);
  const cost = quote.freight.final - quote.reward;
  assert.ok(cost > 0);
  const markup = renderToStaticMarkup(
    createElement(StrategyAdvisor, {
      game,
      userId: "captain",
      roomId: "harbor",
    }),
  );
  assert.match(markup, new RegExp(`quoted cost ${cost} Gold`));
  assert.doesNotMatch(markup, new RegExp(`payout of -${cost}`));
});

test("Negative Reputation remains readable across score views", async () => {
  const { formatReputation } = await import("../src/lib/utils");
  const { displayLedgerLine } =
    await import("../src/lib/game/engine/lifecycle");
  assert.equal(formatReputation(-8), "8 below zero");
  assert.equal(formatReputation(0), "0");
  assert.equal(formatReputation(12), "12");
  assert.equal(
    displayLedgerLine("🏆 Final Reputation: -8"),
    "🏆 Final Reputation: 8 below zero",
  );
});

test("Score comparisons use the record before the voyage award", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { TooltipProvider } = await import("../src/components/ui/tooltip");
  const { Endgame } =
    await import("../src/components/portmasters/game/phases/Endgame");
  const { DEFAULT_LEGACY_SUMMARY } = await import("../src/lib/game/legacy");
  const game = createInitialGameState();
  const row = {
    userId: "captain",
    displayName: "Captain",
    avatarHue: 0,
    reputation: 0,
    gold: 100,
    crowned: false,
    bankrupt: false,
    renownLevel: 1,
    renownTitle: "Deckhand",
    xpGained: 0,
    leveledUp: false,
    brokersFavorUnlocked: false,
    newMerits: [],
  };
  function render(score: number, previousBestScore?: number) {
    game.score = score;
    game.totalCosts = 9;
    return renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(Endgame, {
          game,
          isHost: false,
          onRestart() {},
          myUserId: row.userId,
          voyageResult: {
            roomId: "room",
            voyageEpoch: 0,
            winnerId: null,
            standings: [{ ...row, reputation: score, previousBestScore }],
          },
          myLegacy: {
            ...DEFAULT_LEGACY_SUMMARY,
            bestScore: Math.max(0, score),
            voyagesCompleted: 1,
          },
        }),
      ),
    ).replace(/<[^>]+>/g, "");
  }
  const record = render(70, 20);
  assert.match(record, /New Personal Best! \+50 Rep/);
  const loss = render(-8, 0);
  assert.match(loss, /Loss 9 Gold/);
  assert.match(loss, /8 Rep below your best/);
  assert.doesNotMatch(loss, /[-\u2013\u2014]/);
  assert.match(render(0, 0), /Tied your best/);
  assert.doesNotMatch(render(70), /Tied your best|New Personal Best/);
});

test("Activity summaries preserve signed Reputation and keep awards in their harbor", async () => {
  const { buildVoyageLog } =
    await import("../src/components/portmasters/CaptainProfileDialog");
  const { reputationActivityText } = await import("../src/lib/utils");
  const event = (id: string, type: string, detail: string, roomId: string) => ({
    id,
    type,
    detail,
    roomId,
    createdAt: new Date(0).toISOString(),
  });
  const logs = buildVoyageLog([
    event("crown", "sea_master", "-8 Reputation", "a"),
    event("merit", "merit_earned", "First Landfall", "a"),
    event("closed", "voyage_complete", "14 Reputation", "b"),
    event("start", "voyage_start", "host set sail", "b"),
    event("open", "voyage_start", "monsoon", "a"),
    event("done", "voyage_complete", "-8 Reputation", "a"),
  ]);
  const first = logs.find(({ id }) => id === "done")!;
  assert.equal(first.reputation, -8);
  assert.equal(first.crowned, true);
  assert.equal(first.difficulty, "Monsoon Season");
  assert.deepEqual(
    first.merits.map(({ id }) => id),
    ["first_voyage"],
  );
  const other = logs.find(({ id }) => id === "closed")!;
  assert.equal(other.crowned, false);
  assert.equal(other.difficulty, null);
  assert.equal(
    reputationActivityText("-8 Reputation"),
    "Reputation 8 below zero",
  );
});

test("Economic reports and the guide show readable losses and shortfalls", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { PriceHistory } =
    await import("../src/components/portmasters/PriceHistory");
  const { Settlement } =
    await import("../src/components/portmasters/game/phases/Settlement");
  const { deriveChronicleEvents } =
    await import("../src/components/portmasters/game/GameStatusPanel");
  const { guideTabs, tipsGroups, tutorialSteps } =
    await import("../src/lib/game/guide");
  const { CURRENT_HARBOR_RULES } =
    await import("../src/lib/game/rules-version");
  const { DIFFICULTY_ORDER } = await import("../src/lib/game/difficulty");
  const game = createInitialGameState();
  game.money = 2;
  const prices = (values: number[]) =>
    values.map((price, i) => ({ round: i + 1, price, port: "Ningbo Port" }));
  const history = renderToStaticMarkup(
    createElement(PriceHistory, {
      game,
      observations: {
        buy: {
          Silk: prices([100, 92]),
          Tea: prices([-10, -5]),
          Hemp: prices([0, 1]),
        },
        sell: {},
      },
    }),
  ).replace(/<[^>]+>/g, "");
  assert.match(history, /Down 8 percent/);
  assert.match(history, /Up 50 percent/);
  assert.match(history, /Cost 5/);
  assert.doesNotMatch(
    history,
    /No items selected|NaN|Infinity|[-\u2013\u2014]/,
  );
  const noop = () => {};
  const settlement = () =>
    renderToStaticMarkup(
      createElement(Settlement, {
        game,
        act: noop,
        members: [],
        myUserId: "captain",
        aid: {
          requests: [],
          error: null,
          clearError: noop,
          post: noop,
          cancel: noop,
          help: noop,
          repay: async () => false,
        },
        backing: {
          loans: [],
          error: null,
          clearError: noop,
          offer: noop,
          redirect: noop,
        },
        phaseSync: {
          waiting: false,
          ready: null,
          readyCount: 0,
          requiredCount: 0,
          markReady: async () => {},
          cancelReady: async () => {},
          startGame: noop,
          restartVoyage: noop,
          startError: null,
        },
      }),
    ).replace(/<[^>]+>/g, "");
  assert.match(settlement(), /short by 13 Gold/);
  game.pirateAttackResolved = true;
  assert.match(settlement(), /Short by 13 Gold/);
  const lines = [
    "📈 Profit before tax: -4 Gold",
    "🏆 Final Reputation: -8",
    "Captain Northwind arrived",
  ];
  assert.deepEqual(
    deriveChronicleEvents(lines, 1).map((entry) => entry.description),
    [
      "📈 Loss before tax: 4 Gold",
      "🏆 Final Reputation: 8 below zero",
      lines[2],
    ],
  );
  for (const waters of DIFFICULTY_ORDER) {
    for (let version = 1; version <= CURRENT_HARBOR_RULES; version++) {
      const text = JSON.stringify([
        guideTabs(waters, version),
        tipsGroups(waters, version),
        tutorialSteps(waters, version),
      ]).replace(/<[^>]+>/g, "");
      assert.doesNotMatch(text, /[-\u2013\u2014]/);
    }
  }
});

test("Current order previews and receipts agree across the Boon and module catalog", async (t) => {
  const { buildCurrentVoyageRules } = await import("../src/lib/game/forecast");
  const { voyageBoon, voyageModule } = await import("../src/lib/game/pools");
  const { voyageRandom } = await import("../src/lib/game/voyage-rng");
  const base = createInitialGameState(
    0,
    1,
    1,
    "monsoon",
    buildCurrentVoyageRules("matrix", 1, "monsoon"),
  );
  const modules = MODULES.map((m) => voyageModule(m, base.rulesVersion));
  const fits = [
    [],
    ...modules.map((m) => [m]),
    ...modules.flatMap((m, index) =>
      modules.slice(index + 1).map((other) => [m, other]),
    ),
  ];
  const goods = [
    { cargo: ["Silk", "Lapis Lazuli"], gross: 76 },
    { cargo: ["Celadon Ware"], gross: 89 },
    { cargo: ["Salt Glazed Bowl"], gross: 98 },
    { cargo: ["Sachet"], gross: 107 },
    { cargo: ["Sachet"], gross: 200, mandate: true },
    { cargo: ["Silk"], gross: 50, favor: true },
  ];
  base.phase = 2;
  base.currentRound = 12;
  base.shipLevel = 2;
  base.money = 100;
  base.ceramicCollection = ["Lacquered Jar"];
  base.directPassageRound = base.currentRound - 1;
  base.travelingCommissionRound = base.currentRound;
  base.customerCards = goods.map(({ cargo, gross, mandate, favor }, id) => ({
    id,
    resources: cargo.map((type) => ({ type, required: 1 })),
    totalItems: cargo.length,
    isProductOrder: id > 0 && !favor,
    isMandate: mandate,
    isBrokerFavor: favor,
    buyer: id === 0 ? "mixed" : "commission",
    demandPort: "Quanzhou Port",
    reward: gross,
  }));
  for (const { cargo } of goods)
    for (const item of cargo) base.inventory[item] = 6;
  let settlements = 0;
  for (const boon of [undefined, ...BOONS]) {
    for (const equipped of fits) {
      const game = structuredClone(base);
      game.seatSeed = [boon?.id ?? "plain", ...equipped.map((m) => m.id)].join(
        ":",
      );
      game.modifierFlags = boon
        ? voyageBoon(boon, game.rulesVersion).modifiers
        : {};
      game.equippedModules = equipped;
      for (const order of game.customerCards) {
        const logs: string[] = [];
        const quote = quoteOrder(game, order);
        const draw = voyageRandom(game, `settleOrder:${order.id}`);
        const freight =
          quote.salvageChance && draw() < quote.salvageChance
            ? 0
            : quote.freight.final;
        const audit =
          quote.auditChance && draw() < quote.auditChance
            ? Math.min(20, game.money + quote.reward - freight)
            : 0;
        const net = quote.reward - freight - audit;
        const wallet = game.money;
        const score = game.score;
        completeOrder(game, order.id, logs);
        assert.equal(order.settledGold, net, game.seatSeed);
        assert.equal(game.money - wallet, net);
        assert.equal(game.score - score, net);
        for (const bonus of quote.bonuses) {
          assert.ok(
            logs.includes(
              `${bonus.name} added ${bonus.gold} Gold to the reward`,
            ),
          );
        }
        assert.ok(
          logs.some(
            (line) =>
              line.includes(`Freight: ${freight} Gold`) &&
              line.includes(`${Math.abs(net)} Gold`),
          ),
        );
        assert.doesNotMatch(logs.join(" "), /[-\u2013\u2014]/);
        const after = game.money;
        completeOrder(game, order.id, logs);
        assert.equal(game.money, after);
        settlements++;
      }
    }
  }
  t.diagnostic(
    `${fits.length} module loadouts, ${BOONS.length} Boons plus no Boon, ${settlements} order settlements and retries`,
  );
});

test("Voyage milestones survive spending and reload and reset for a new voyage", async () => {
  const { recordVoyageMilestones } = await import("../src/lib/game/milestones");
  const { restartGame } = await import("../src/lib/game/engine/lifecycle");
  const state = createInitialGameState();
  recordVoyageMilestones(state);
  assert.equal(state.milestones, undefined);
  state.phase = 1;
  state.money = 500;
  state.inventory["Linen Clothes"] = 1;
  recordVoyageMilestones(state);
  const saved = structuredClone(state.milestones);
  assert.deepEqual(saved, ["gold_100", "gold_500", "first_product"]);
  state.money = 0;
  state.inventory["Linen Clothes"] = 0;
  recordVoyageMilestones(state);
  const restored = JSON.parse(JSON.stringify(state)) as typeof state;
  restored.money = 500;
  recordVoyageMilestones(restored);
  assert.deepEqual(restored.milestones, saved);
  restartGame(restored, [], 0, 1, 1);
  recordVoyageMilestones(restored);
  assert.equal(restored.milestones, undefined);
});
