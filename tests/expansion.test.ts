import assert from "node:assert/strict";
import test from "node:test";
import {
  BOONS,
  MODULES,
  PRODUCTS,
  RESOURCES,
  WORD_ON_THE_DOCKS_REWARD,
} from "../src/lib/game/constants";
import { GLOSSARY } from "../src/lib/game/glossary";
import { guideTabs, tutorialSteps } from "../src/lib/game/guide";
import {
  EFFECT,
  EXPANDED_RULES,
  FORECAST_WINDOWS,
} from "../src/lib/game/expansion";
import { buildForecasts } from "../src/lib/game/forecast";
import {
  createInitialGameState,
  type GameState,
  type OrderCard,
  type ResourceCard,
} from "../src/lib/game/types";
import {
  unlockedBoons,
  unlockedModules,
  unlockedProducts,
  unlockedResources,
} from "../src/lib/game/pools";
import {
  applyBoon,
  draftBoons,
  startBoonDrafting,
} from "../src/lib/game/engine/boons";
import { restoreBrokerWhispers } from "../src/lib/game/broker-whispers";
import {
  genRawOrder,
  poolsFor,
  purchaseCard,
  startPhase1,
} from "../src/lib/game/engine/market";
import {
  completeOrder,
  claimWordOnTheDocksReward,
  intelPurchaseCount,
  purchaseIntel,
  quoteOrder,
  startPhase2,
  whisperForOrder,
} from "../src/lib/game/engine/orders";
import {
  explainCardPrice,
  marketResourceAdjustment,
  quoteDues,
} from "../src/lib/game/engine/pricing";
import {
  hireEscort,
  quotePirateWaters,
  resolvePirateAttack,
} from "../src/lib/game/engine/pirates";
import {
  assignTask,
  hireWorker,
  payWages,
  processProduction,
  quoteRecipe,
} from "../src/lib/game/engine/workers";

const catalogBoon = (id: string) => BOONS.find((entry) => entry.id === id)!;
const catalogModule = (id: string) => MODULES.find((entry) => entry.id === id)!;
const context = { seedBase: "fixture:captain", roomSeed: "fixture" };

function expandedGame(
  round = 12,
  difficulty: GameState["difficulty"] = "monsoon",
) {
  const game = createInitialGameState(0, 1, 1, difficulty, {
    version: EXPANDED_RULES,
    forecasts: buildForecasts("fixture", 1, difficulty),
  });
  game.currentRound = round;
  game.seatSeed = context.seedBase;
  return game;
}

function cargo(id: number, type: string, port = "Ningbo Port"): ResourceCard {
  return {
    id,
    port,
    totalCost: 16,
    resources: [{ type, quantity: 2, price: 8 }],
    isProductCard: false,
  };
}

function order(id: number, ...items: string[]): OrderCard {
  return {
    id,
    demandPort: "Quanzhou Port",
    totalItems: items.length * 2,
    isProductOrder: false,
    reward: 100,
    resources: items.map((type) => ({ type, required: 2 })),
  };
}

test("New catalogues respect charters and preserve classic rooms", () => {
  assert.deepEqual(
    [RESOURCES.length, PRODUCTS.length, BOONS.length, MODULES.length],
    [13, 17, 23, 23],
  );
  assert.deepEqual(unlockedResources("fair_winds", 2, EXPANDED_RULES), [
    "Hemp",
    "Silk",
    "Tea",
  ]);
  assert.deepEqual(unlockedResources("fair_winds", 8), ["Hemp", "Silk", "Tea"]);
  assert.equal(unlockedResources("fair_winds", 8, EXPANDED_RULES).length, 5);
  assert.equal(unlockedProducts("fair_winds", 8, EXPANDED_RULES).length, 7);
  assert.ok(
    !unlockedProducts("open_waters", 4, EXPANDED_RULES).includes(
      "Lacquered Jar",
    ),
  );
  assert.ok(
    unlockedProducts("open_waters", 5, EXPANDED_RULES).includes(
      "Lacquered Jar",
    ),
  );
  assert.ok(
    !unlockedProducts("monsoon", 11, EXPANDED_RULES).includes("Lapis Pendant"),
  );
  assert.equal(unlockedProducts("monsoon", 16, EXPANDED_RULES).length, 17);
  assert.equal(unlockedBoons("monsoon", 16, EXPANDED_RULES).length, 23);
  assert.equal(unlockedModules("monsoon", 16, EXPANDED_RULES).length, 23);
});

test("Forecasts have a shared cadence and keep the staple and guaranteed orders distinct", () => {
  for (const difficulty of Object.keys(
    FORECAST_WINDOWS,
  ) as GameState["difficulty"][]) {
    const one = buildForecasts("fixture", 1, difficulty);
    assert.deepEqual(one, buildForecasts("fixture", 1, difficulty));
    assert.deepEqual(
      one.map(({ round }) => round),
      FORECAST_WINDOWS[difficulty],
    );
    for (let i = 1; i < one.length; i++) {
      assert.ok(!(one[i].kind === "seas" && one[i - 1].kind === "seas"));
    }
  }
  const game = expandedGame();
  applyBoon(game, catalogBoon("coastal_forecast"), []);
  game.forecasts = [{ round: 12, kind: "market", item: "Frankincense" }];
  game.harborPulse = { Frankincense: -0.12 };
  assert.equal(marketResourceAdjustment(game, "Frankincense"), -0.15);
  startPhase1(game, context, []);
  assert.equal(game.resourceCards[0].staple, true);
  assert.equal(game.resourceCards[1].resources[0].type, "Frankincense");
  assert.equal(game.resourceCards[1].featured, true);
  const scouted = game.scoutedOrder!;
  const { forecasts, seatSeed } = game;
  const reloaded = JSON.parse(JSON.stringify(game)) as GameState;
  assert.deepEqual(reloaded.forecasts, forecasts);
  assert.equal(reloaded.seatSeed, seatSeed);
  while (reloaded.phase2DemandTags.length) purchaseIntel(reloaded, []);
  assert.equal(reloaded.revealedIntel.length, 5);
  startPhase2(reloaded, context, []);
  assert.deepEqual(
    reloaded.customerCards.find(({ id }) => id === scouted.id),
    scouted,
  );
  assert.equal(reloaded.customerCards.find(({ id }) => id === 0)?.staple, true);
  assert.equal(
    reloaded.customerCards.filter((candidate) =>
      whisperForOrder(reloaded, candidate),
    ).length,
    5,
  );
  assert.ok(reloaded.customerCards.some(({ isMandate }) => isMandate));
});

test("Whisper bundles preserve both guild buyers and the staple on a crowded opening board", () => {
  const game = expandedGame(1);
  game.forecasts = [{ round: 1, kind: "guild", item: "Linen Clothes" }];
  game.equippedModules = [
    catalogModule("brokers_network"),
    catalogModule("ocean_relay"),
  ];
  startPhase1(game, context, []);
  assert.equal(intelPurchaseCount(game), 3);
  purchaseIntel(game, []);
  assert.equal(intelPurchaseCount(game), 0);
  startPhase2(game, context, []);
  assert.equal(game.customerCards[0].staple, true);
  const guaranteed = game.customerCards.filter((order) =>
    whisperForOrder(game, order),
  );
  assert.equal(guaranteed.length, 3);
  for (const order of game.customerCards.slice(-2)) {
    assert.equal(order.resources[0].type, "Linen Clothes");
    assert.equal(whisperForOrder(game, order), undefined);
  }
});

test("Market discounts match the charged Gold and spend only successful uses", () => {
  const game = expandedGame();
  game.phase = 1;
  game.money = 0;
  game.resourceCards = [
    cargo(0, "Bamboo"),
    cargo(1, "Bamboo"),
    cargo(2, "Lapis Lazuli"),
    cargo(3, "Lapis Lazuli"),
    cargo(4, "Lapis Lazuli"),
  ];
  game.equippedModules = [catalogModule("merchant_scales")];
  applyBoon(game, catalogBoon("bamboo_fair"), []);
  assert.equal(
    explainCardPrice(game, game.resourceCards[0]).final,
    16 - EFFECT.bambooFair - EFFECT.merchantScales,
  );
  purchaseCard(game, 0, []);
  assert.deepEqual(game.effectUses, {});
  game.money = 100;
  purchaseCard(game, 0, []);
  purchaseCard(game, 0, []);
  assert.equal(game.money, 90);
  assert.equal(explainCardPrice(game, game.resourceCards[1]).final, 16);
  applyBoon(game, catalogBoon("deep_market"), []);
  purchaseCard(game, 2, []);
  purchaseCard(game, 3, []);
  assert.equal(game.effectUses?.deep_market, 2);
  assert.equal(explainCardPrice(game, game.resourceCards[4]).final, 16);
});

test("Freight and payout effects are capped, stack, and exclude mandates and favors", () => {
  const game = expandedGame();
  game.forecasts = [{ round: 12, kind: "guild", item: "Sachet" }];
  game.phase = 2;
  game.equippedModules = [
    "cargo_net",
    "convoy_pennant",
    "ocean_exchange_ledger",
  ].map(catalogModule);
  applyBoon(game, catalogBoon("rare_cargo_charter"), []);
  game.inventory = { Frankincense: 10, Bamboo: 10 };
  game.customerCards = [
    order(0, "Frankincense", "Bamboo"),
    order(1, "Frankincense", "Bamboo"),
  ];
  const before = quoteOrder(game, game.customerCards[0]);
  assert.equal(before.reward, 118);
  assert.equal(before.freight.final, 0);
  assert.equal(
    quoteOrder(game, { ...game.customerCards[0], isMandate: true }).reward,
    100,
  );
  assert.equal(
    quoteOrder(game, { ...game.customerCards[0], isBrokerFavor: true }).bonuses
      .length,
    0,
  );
  const funds = game.money;
  completeOrder(game, 0, []);
  assert.equal(game.money, funds + before.reward - before.freight.final);
  assert.equal(quoteOrder(game, game.customerCards[1]).reward, 100);
  assert.equal(quoteOrder(game, game.customerCards[1]).freight.final, 8);
  assert.equal(quoteDues(game).maintenance, 24);

  startBoonDrafting(game, []);
  applyBoon(game, catalogBoon("reliable_buyer"), []);
  assert.equal(
    quoteOrder(game, { ...order(3, "Hemp"), staple: true }).reward,
    104,
  );
  applyBoon(game, catalogBoon("ceramic_commission"), []);
  assert.equal(quoteOrder(game, order(4, "Lacquered Jar")).reward, 108);
});

test("Recipe savings, payroll, and reserve quotes agree at settlement", () => {
  const game = expandedGame();
  game.equippedModules = [
    catalogModule("wage_ledger"),
    catalogModule("bonded_warehouse"),
  ];
  applyBoon(game, catalogBoon("guild_turnover"), []);
  hireWorker(game, "potter", []);
  hireWorker(game, "coppersmith", []);
  game.inventory["River Lacquer"] = 1;
  game.inventory["Porcelain Clay"] = 2;
  game.inventory["Iron Sand"] = 2;
  game.inventory["Copper Ore"] = 1;
  assert.equal(quoteRecipe(game, "Lacquered Jar").saved, "River Lacquer");
  assignTask(game, "potter", "Lacquered Jar", []);
  assert.equal(game.inventory["River Lacquer"], 1);
  assert.equal(quoteRecipe(game, "Inlaid Kettle").saved, undefined);
  assignTask(game, "coppersmith", "Inlaid Kettle", []);
  const due = quoteDues(game).wages;
  assert.equal(due.discount, 4);
  processProduction(game, []);
  assert.deepEqual(quoteDues(game).wages, due);
  assert.equal(game.inventory["Inlaid Kettle"], 1);
  const before = game.money;
  assert.equal(payWages(game, []), true);
  assert.equal(game.money, before - due.due);
});

test("Raid, fee, protection, and rescue effects are versioned and exact", (t) => {
  const fair = expandedGame(1, "fair_winds");
  assert.equal(quotePirateWaters(fair).raidLoss, 38);
  assert.equal(quotePirateWaters(fair).escortCost, 8);
  assert.equal(quotePirateWaters(createInitialGameState()).raidLoss, 100);
  fair.money = 10;
  assert.ok(draftBoons(fair).some(({ id }) => id === "emergency_loan"));
  applyBoon(fair, catalogBoon("emergency_loan"), []);
  fair.money = 10;
  assert.ok(!draftBoons(fair).some(({ id }) => id === "emergency_loan"));

  const game = expandedGame();
  game.money = 100;
  game.forecasts = [{ round: 12, kind: "seas" }];
  game.brokerTippedPirates = true;
  game.equippedModules = [
    "storm_shrouds",
    "storm_lantern",
    "bonded_warehouse",
  ].map(catalogModule);
  applyBoon(game, catalogBoon("false_colors"), []);
  assert.equal(quotePirateWaters(game).leak, 0);
  assert.equal(quotePirateWaters(game).chance.toFixed(2), "0.42");
  assert.equal(quotePirateWaters(game).escortCost, 12);
  const escorted = structuredClone(game);
  hireEscort(escorted, []);
  assert.equal(escorted.money, 88);
  applyBoon(game, catalogBoon("safe_anchorage"), []);
  assert.equal(quotePirateWaters(game).reserve, 13);
  assert.equal(quotePirateWaters(game).raidLoss, 47);
  game.seatSeed = undefined;
  t.mock.method(Math, "random", () => 0);
  resolvePirateAttack(game, []);
  resolvePirateAttack(game, []);
  assert.equal(game.money, 53);
});

test("A whisper marks exactly its assigned order even when another order has identical cargo and port", () => {
  for (const game of [createInitialGameState(), expandedGame()]) {
    startPhase1(game, context, []);
    purchaseIntel(game, []);
    assert.equal(game.revealedIntel.length, 1);
    startPhase2(game, context, []);
    const assigned = game.customerCards.find((candidate) =>
      whisperForOrder(game, candidate),
    )!;
    assert.ok(assigned);
    const { whisperIndex, ...identicalDemand } = assigned;
    assert.equal(whisperIndex, 0);
    const natural = { ...identicalDemand, id: 100 };
    game.customerCards.push(natural);
    game.customerCards.reverse();
    const restored = JSON.parse(JSON.stringify(game)) as GameState;
    assert.equal(
      restored.customerCards.filter((candidate) =>
        whisperForOrder(restored, candidate),
      ).length,
      1,
    );
    assert.equal(whisperForOrder(restored, natural), undefined);
    assert.equal(whisperForOrder(restored, assigned)?.orderId, assigned.id);
    assert.equal(
      whisperForOrder(restored, { ...assigned, id: 102 }),
      undefined,
    );
    delete restored.revealedIntel[0].orderId;
    const intended = restored.customerCards.find(
      ({ id }) => id === assigned.id,
    )!;
    delete intended.whisperIndex;
    restoreBrokerWhispers(restored);
    assert.equal(restored.revealedIntel[0].orderId, assigned.id);
    assert.equal(whisperForOrder(restored, natural), undefined);
  }
});

test("A revealed raw order uses its named port when calculating the payout", () => {
  const pools = poolsFor(expandedGame(1));
  const specialty = genRawOrder(() => 0.5, pools, "Hemp", 3, "Quanzhou Port");
  const ordinary = genRawOrder(() => 0.5, pools, "Hemp", 3, "Guangzhou Port");
  assert.equal(specialty.demandPort, "Quanzhou Port");
  assert.equal(ordinary.demandPort, "Guangzhou Port");
  assert.equal(ordinary.reward, specialty.reward + 3);
});

test("The shared order race reward is credited once across a saved replay", () => {
  const game = expandedGame();
  const openingGold = game.money;
  const logs: string[] = [];
  claimWordOnTheDocksReward(game, logs);
  const reloaded = JSON.parse(JSON.stringify(game)) as GameState;
  claimWordOnTheDocksReward(reloaded, logs);
  assert.equal(reloaded.money, openingGold + WORD_ON_THE_DOCKS_REWARD);
  assert.equal(logs.length, 1);
});

test("Help copy respects the voyage catalogue and expanded freight order", () => {
  const classic = JSON.stringify(tutorialSteps("fair_winds"));
  const expanded = JSON.stringify(tutorialSteps("fair_winds", EXPANDED_RULES));
  assert.doesNotMatch(classic, /Bamboo Mat|Scented Candle/);
  assert.match(expanded, /Bamboo Mat/);
  assert.match(expanded, /Scented Candle/);
  assert.doesNotMatch(expanded, /Lapis Pendant/);
  assert.match(GLOSSARY["Scented Candle"], /Sachet Maker.*1 Beeswax and 1 Tea/);
  assert.match(GLOSSARY.Weaver, /Bamboo Mat.*Waxed Canvas/);
  const guide = JSON.stringify(guideTabs("monsoon", EXPANDED_RULES));
  assert.match(guide, /Fleet of Treasures, then Cargo Net and Convoy Pennant/);
});

test("Rebalanced room plans preserve older forecasts and stage only selected cargo", async () => {
  const { buildVoyageRules, readVoyageRules } =
    await import("../src/lib/game/forecast");
  const { REBALANCED_RULES, specialtyChoices, voyageMaintenance } =
    await import("../src/lib/game/expansion");
  const { voyageRecipe } = await import("../src/lib/game/pools");
  for (const difficulty of ["fair_winds", "open_waters", "monsoon"] as const) {
    const choices = specialtyChoices(difficulty);
    for (let mask = 0; mask < 2 ** choices.length; mask++) {
      const selected = choices.map(
        (group, index) => group[(mask >> index) & 1],
      );
      const rules = buildVoyageRules("room", 1, difficulty, selected);
      assert.deepEqual(rules.specialties, selected);
      assert.deepEqual(
        readVoyageRules({
          rulesVersion: rules.version,
          forecastPlan: JSON.stringify(rules),
        }),
        rules,
      );
      const state = createInitialGameState(0, 1, 1, difficulty, rules);
      assert.equal(
        state.fixedCost,
        voyageMaintenance(difficulty, REBALANCED_RULES),
      );
      for (let round = 1; round <= state.maxRounds; round++) {
        const raw = unlockedResources(
          difficulty,
          round,
          rules.version,
          selected,
        );
        const products = unlockedProducts(
          difficulty,
          round,
          rules.version,
          selected,
        );
        for (const item of products) {
          for (const resource of Object.keys(
            voyageRecipe(item, rules.version).materials,
          ))
            assert.ok(
              raw.includes(resource),
              `${item} lacks ${resource} on round ${round}`,
            );
        }
        const forecast = rules.forecasts.find((entry) => entry.round === round);
        if (forecast?.item)
          assert.ok(
            (forecast.kind === "market" ? raw : products).includes(
              forecast.item,
            ),
          );
      }
    }
  }
  assert.deepEqual(voyageRecipe("Brocade", EXPANDED_RULES).materials, {
    Silk: 3,
  });
  assert.deepEqual(voyageRecipe("Brocade", REBALANCED_RULES).materials, {
    Silk: 2,
  });
  const old = buildForecasts("room", 1, "monsoon");
  assert.deepEqual(
    readVoyageRules({
      rulesVersion: EXPANDED_RULES,
      forecastPlan: JSON.stringify(old),
    }),
    {
      version: EXPANDED_RULES,
      forecasts: old,
    },
  );
});

test("Workshop supply and successive personal buyers survive reload and settle only once", async () => {
  const { buildVoyageRules } = await import("../src/lib/game/forecast");
  const { buyWorkshopSupply, chooseStaple, quoteWorkshopSupply, startPhase1 } =
    await import("../src/lib/game/engine/market");
  const {
    chooseWorkshopContract,
    quoteClearance,
    sellClearance,
    workshopBuyer,
  } = await import("../src/lib/game/engine/orders");
  const { assignTask, hireWorker, processProduction } =
    await import("../src/lib/game/engine/workers");
  const ctx = { roomSeed: "workshop", seedBase: "workshop:1" };
  const logs: string[] = [];
  let state = createInitialGameState(
    0,
    1,
    1,
    "fair_winds",
    buildVoyageRules(ctx.roomSeed, 1, "fair_winds", ["wax"]),
  );
  state.inventory.Hemp = 0;
  startPhase1(state, ctx, logs);
  chooseStaple(state, "Silk", logs);
  const supply = quoteWorkshopSupply(state, "Linen Clothes")!;
  assert.deepEqual(
    supply.resources.map(({ type, quantity }) => [type, quantity]),
    [["Hemp", 2]],
  );
  const balance = state.money;
  buyWorkshopSupply(state, "Linen Clothes", logs);
  buyWorkshopSupply(state, "Linen Clothes", logs);
  assert.equal(state.money, balance - supply.totalCost);
  assert.equal(state.inventory.Hemp, 2);
  state.phase = "worker_mgmt";
  hireWorker(state, "weaver", logs);
  assignTask(state, "weaver", "Linen Clothes", logs);
  chooseWorkshopContract(state, "Linen Clothes", 1, logs);
  startPhase2(state, ctx, logs);
  assert.equal(state.customerCards[0].resources[0].type, "Silk");
  assert.ok(!state.customerCards.some(({ workshop }) => workshop));
  processProduction(state, logs);

  state = JSON.parse(JSON.stringify(state));
  state.currentRound = 2;
  startPhase1(state, ctx, logs);
  state.phase = "worker_mgmt";
  chooseWorkshopContract(state, "Cotton Clothes", 2, logs);
  startPhase2(state, ctx, logs);
  const contract = state.customerCards.find(({ workshop }) => workshop)!;
  assert.equal(contract.resources[0].type, "Linen Clothes");
  assert.equal(workshopBuyer(state, 3)?.resources[0].type, "Cotton Clothes");
  const quote = quoteOrder(state, contract);
  const beforeContract = state.money;
  completeOrder(state, contract.id, logs);
  completeOrder(state, contract.id, logs);
  assert.equal(
    state.money - beforeContract,
    quote.reward - quote.freight.final,
  );
  assert.equal(state.inventory["Linen Clothes"], 0);

  state.inventory["Cotton Clothes"] = 3;
  const clearance = quoteClearance(state, "Cotton Clothes", 2)!;
  const clearanceTerms = quoteOrder(state, clearance);
  const beforeClearance = state.money;
  const orders = state.totalOrdersCompleted;
  sellClearance(state, "Cotton Clothes", 2, logs);
  state = JSON.parse(JSON.stringify(state));
  sellClearance(state, "Cotton Clothes", 1, logs);
  assert.equal(state.inventory["Cotton Clothes"], 1);
  assert.equal(state.totalOrdersCompleted, orders);
  assert.equal(
    state.money - beforeClearance,
    clearanceTerms.reward - clearanceTerms.freight.final,
  );
});

test("Rebalanced previews reserve their buyers and paid whispers keep exact terms", async () => {
  const { buildVoyageRules } = await import("../src/lib/game/forecast");
  const { startPhase1, upcomingBuyer } =
    await import("../src/lib/game/engine/market");
  const ctx = { roomSeed: "preview", seedBase: "preview:1" };
  const state = createInitialGameState(
    0,
    1,
    1,
    "open_waters",
    buildVoyageRules(ctx.roomSeed, 1, "open_waters"),
  );
  state.currentRound = 5;
  state.forecasts = [{ round: 5, kind: "guild", item: "Linen Clothes" }];
  state.modifierFlags.coastal_forecast = 1;
  const expected = [
    upcomingBuyer(state, ctx, 5)!,
    upcomingBuyer(state, ctx, 5, true)!,
  ];
  startPhase1(state, ctx, []);
  assert.deepEqual(state.scoutedOrders, expected);
  for (let index = 0; index < 9; index++) purchaseIntel(state, [], "Tea");
  const saved = JSON.parse(JSON.stringify(state)) as GameState;
  startPhase2(saved, ctx, []);
  for (const buyer of expected)
    assert.deepEqual(
      saved.customerCards.find(({ id }) => id === buyer.id),
      buyer,
    );
  assert.equal(
    saved.customerCards.filter((order) => whisperForOrder(saved, order)).length,
    saved.revealedIntel.length,
  );
  for (const intel of saved.revealedIntel) {
    const order = saved.customerCards.find(({ id }) => id === intel.orderId)!;
    assert.equal(order.reward, intel.reward);
    assert.equal(order.totalItems, intel.quantity);
    assert.equal(order.demandPort, intel.port);
    assert.equal(order.resources[0].type, intel.item);
  }
});

test("Rebalanced effect caps use the settled amounts and remain independent of module order", async () => {
  const { buildVoyageRules } = await import("../src/lib/game/forecast");
  const { quotePirateWaters, hireEscort } =
    await import("../src/lib/game/engine/pirates");
  const { getCardFinalCost } = await import("../src/lib/game/engine/pricing");
  const ctx = { roomSeed: "effects", seedBase: "effects:1" };
  const state = createInitialGameState(
    0,
    1,
    1,
    "monsoon",
    buildVoyageRules(ctx.roomSeed, 1, "monsoon", ["bamboo", "iron", "lapis"]),
  );
  state.phase = 1;
  state.currentRound = 12;
  state.money = 250;
  state.modifierFlags = { deep_market: 1 };
  state.equippedModules = MODULES.filter(({ id }) =>
    ["merchant_scales", "smugglers_hold"].includes(id),
  );
  for (let id = 0; id < 2; id++) {
    const lot = {
      id,
      port: "Dashi Port",
      resources: [{ type: "Lapis Lazuli", quantity: 6, price: 18 }],
      totalCost: 108,
      isProductCard: false,
    };
    state.resourceCards.push(lot);
    const before = state.money;
    const cost = getCardFinalCost(state, lot);
    purchaseCard(state, id, []);
    assert.equal(before - state.money, cost);
    assert.equal(state.effectUses?.deep_market, id === 0 ? 18 : 24);
    assert.equal(state.effectUses?.merchant_scales, 12);
  }
  state.effectUses = {};
  state.phase = 2;
  state.forecasts = [{ round: 12, kind: "market", item: "Lapis Lazuli" }];
  state.modifierFlags = { rare_cargo_charter: 1 };
  state.equippedModules = MODULES.filter(({ id }) =>
    ["convoy_pennant", "cargo_net", "ocean_exchange_ledger"].includes(id),
  );
  for (let id = 0; id < 3; id++) {
    const order = {
      id,
      demandPort: "Dashi Port",
      resources: [{ type: "Lapis Pendant", required: 2 }],
      reward: 200,
      totalItems: 2,
      isProductOrder: true,
    };
    state.customerCards.push(order);
    state.inventory["Lapis Pendant"] += 2;
    const quote = quoteOrder(state, order);
    state.equippedModules.reverse();
    assert.deepEqual(quoteOrder(state, order), quote);
    const before = state.money;
    completeOrder(state, id, []);
    assert.equal(state.money, before + quote.reward - quote.freight.final);
    assert.equal(
      quote.bonuses.some(({ name }) => name === "Convoy Pennant"),
      id === 0,
    );
  }
  assert.equal(state.effectUses.rare_cargo_charter, 35);
  assert.equal(state.effectUses.ocean_exchange_ledger, 20);

  state.phase = 3;
  state.modifierFlags = { safe_anchorage: 1 };
  state.equippedModules = MODULES.filter(({ id }) =>
    ["bonded_warehouse", "storm_shrouds", "storm_lantern"].includes(id),
  );
  const waters = quotePirateWaters(state);
  assert.equal(waters.reserve - waters.reservedBills, 50);
  assert.equal(waters.anchorageSavings, 5);
  assert.equal(waters.lanternSavings, 8);
  const before = state.money;
  hireEscort(state, []);
  assert.equal(before - state.money, waters.escortCost);
});

test("Rebalanced clearance never profits from immediate port resale even with stacked purchase discounts", async () => {
  const { buildVoyageRules } = await import("../src/lib/game/forecast");
  const { productPurchasePrice, recipeMaterialCost } =
    await import("../src/lib/game/engine/pricing");
  const { quoteClearance } = await import("../src/lib/game/engine/orders");
  const state = createInitialGameState(
    0,
    1,
    1,
    "monsoon",
    buildVoyageRules("clearance", 1, "monsoon", ["wax", "lacquer", "lapis"]),
  );
  state.currentRound = 15;
  state.phase = 2;
  state.shipLevel = 3;
  state.equippedModules = [
    catalogModule("smugglers_hold"),
    catalogModule("bulk_hauler"),
    catalogModule("overdrive_engine"),
  ];
  applyBoon(state, catalogBoon("merchant_charm"), []);
  for (const item of unlockedProducts(
    state.difficulty,
    state.currentRound,
    state.rulesVersion,
    state.specialties,
  )) {
    state.inventory[item] = 2;
    for (const quantity of [1, 2]) {
      const price = productPurchasePrice(
        item,
        recipeMaterialCost(item, state.rulesVersion),
        0,
        state,
      );
      const purchase = explainCardPrice(state, {
        totalCost: price * quantity,
        resources: [{ type: item, quantity, price }],
      });
      const order = quoteClearance(state, item, quantity)!;
      const sale = quoteOrder(state, order);
      assert.ok(
        sale.reward <= purchase.final,
        `${item} can be bought and cleared for profit`,
      );
    }
  }
});

test("Rebalanced production reports one bonus artisan even as assignments are cleared at settlement", async () => {
  const { buildVoyageRules } = await import("../src/lib/game/forecast");
  const { productionOutput } = await import("../src/lib/game/engine/workers");
  const state = createInitialGameState(
    0,
    1,
    1,
    "fair_winds",
    buildVoyageRules("artisans", 1, "fair_winds"),
  );
  state.phase = "worker_mgmt";
  state.equippedModules = [
    catalogModule("artisans_workshop"),
    catalogModule("wage_ledger"),
  ];
  applyBoon(state, catalogBoon("artisan_inspiration"), []);
  for (let i = 0; i < 2; i++) {
    hireWorker(state, "weaver", []);
    assignTask(state, "weaver", "Linen Clothes", []);
  }
  assert.deepEqual(
    state.workers.weaver.map((worker) => productionOutput(state, worker).total),
    [3, 1],
  );
  const due = quoteDues(state);
  assert.equal(due.wages.discount, 6);
  processProduction(state, []);
  assert.equal(state.inventory["Linen Clothes"], 4);
  assert.deepEqual(quoteDues(state), due);
  const money = state.money;
  payWages(state, []);
  assert.equal(money - state.money, due.wages.due);
  state.currentRound = state.maxRounds;
  hireWorker(state, "weaver", []);
  assignTask(state, "weaver", "Linen Clothes", []);
  assert.equal(state.workers.weaver.length, 2);
  assert.ok(state.workers.weaver.every(({ task }) => !task));
});
