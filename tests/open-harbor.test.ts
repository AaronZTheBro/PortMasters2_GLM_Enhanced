import assert from "node:assert/strict";
import test from "node:test";
import {
  BOONS,
  ICONS,
  ITEMS,
  MODULES,
  PRODUCTS,
  RESOURCES,
} from "../src/lib/game/constants";
import { DIFFICULTY_ORDER, type Difficulty } from "../src/lib/game/difficulty";
import {
  CLASSIC_HARBOR_RULES,
  CURRENT_HARBOR_RULES,
  REVISED_HARBOR_RULES,
  OPEN_HARBOR_RULES,
  REBALANCED_RULES,
} from "../src/lib/game/expansion";
import {
  buildClassicHarborRules,
  buildCurrentVoyageRules,
  buildOpenHarborRules,
  buildForecasts,
  buildVoyageRules,
  readVoyageRules,
} from "../src/lib/game/forecast";
import {
  productPriceRange,
  unlockedBoons,
  unlockedModules,
  unlockedPorts,
  unlockedWorkerTypes,
  voyageRecipe,
} from "../src/lib/game/pools";
import {
  createInitialGameState,
  type GameState,
  type OrderCard,
} from "../src/lib/game/types";
import {
  draftBoons,
  finalizeModuleSwap,
  handleModuleSelect,
  selectBoon,
  selectStarterModule,
  upgradeShip,
  startBoonDrafting,
  startModuleDrafting,
} from "../src/lib/game/engine/boons";
import {
  displayLedgerLine,
  finishSettlement,
  snapToCheckpoint,
  startVoyage,
  startPhase3,
} from "../src/lib/game/engine/lifecycle";
import {
  buyWorkshopSupply,
  harborArrival,
  ordinaryOrders,
  poolsFor,
  purchaseCard,
  quoteWorkshopSupply,
  startPhase1,
  upcomingBuyer,
} from "../src/lib/game/engine/market";
import {
  completeOrder,
  intelPurchaseCount,
  purchaseIntel,
  quoteOrder,
  quotePortExchange,
  sellAtPortExchange,
  startPhase2,
  whisperForOrder,
} from "../src/lib/game/engine/orders";
import {
  hireEscort,
  quotePirateWaters,
  resolvePirateAttack,
} from "../src/lib/game/engine/pirates";
import {
  assignTask,
  hireWorker,
  quoteRecipe,
} from "../src/lib/game/engine/workers";
import {
  getCardFinalCost,
  incomeTaxDue,
  quoteDues,
} from "../src/lib/game/engine/pricing";

const ctx = { roomSeed: "fixture harbor", seedBase: "fixture harbor:captain" };
function game(difficulty: Difficulty = "fair_winds") {
  const state = createInitialGameState(
    0,
    1,
    10,
    difficulty,
    buildOpenHarborRules(ctx.roomSeed, 10, difficulty),
  );
  state.seatSeed = ctx.seedBase;
  return state;
}
function equip(state: GameState, ...ids: string[]) {
  state.equippedModules = ids.map((id) =>
    MODULES.find((module) => module.id === id)!,
  );
}
function order(
  id: number,
  item: string,
  quantity = 1,
  reward = 100,
): OrderCard {
  return {
    id,
    demandPort: "Ningbo Port",
    resources: [{ type: item, required: quantity }],
    reward,
    totalItems: quantity,
    isProductOrder: (PRODUCTS as readonly string[]).includes(item),
  };
}
function bonus(state: GameState, card: OrderCard, name: string) {
  return (
    quoteOrder(state, card).bonuses.find((entry) => entry.name === name)
      ?.gold ?? 0
  );
}

test("Saved rule versions retain their recipes, prices, forecasts and settlement", () => {
  for (const difficulty of DIFFICULTY_ORDER) {
    const plans = [
      { version: 1, forecasts: [] },
      { version: 2, forecasts: buildForecasts(ctx.roomSeed, 10, difficulty) },
      buildVoyageRules(ctx.roomSeed, 10, difficulty),
      buildOpenHarborRules(ctx.roomSeed, 10, difficulty),
      buildClassicHarborRules(ctx.roomSeed, 10, difficulty),
      buildClassicHarborRules(ctx.roomSeed, 10, difficulty, REVISED_HARBOR_RULES),
      buildCurrentVoyageRules(ctx.roomSeed, 10, difficulty),
    ];
    for (const rules of plans) {
      const data = rules.version === 2 ? rules.forecasts : rules;
      const saved = readVoyageRules({
        rulesVersion: rules.version,
        forecastPlan: JSON.stringify(data),
      });
      assert.deepEqual(saved, rules);
      const state = createInitialGameState(0, 1, 10, difficulty, saved);
      state.seatSeed = ctx.seedBase;
      assert.equal(
        voyageRecipe("Sachet", rules.version).materials.Tea,
        rules.version === REBALANCED_RULES ? 1 : 2,
      );
      assert.deepEqual(
        productPriceRange("Brocade", rules.version),
        rules.version === REBALANCED_RULES ? [52, 64] : [70, 90],
      );
      assert.equal(
        poolsFor(state).resources.includes("Sea Salt"),
        rules.version === OPEN_HARBOR_RULES,
      );
      snapToCheckpoint(state, ctx, 1, "1", []);
      assert.equal(
        state.resourceCards.some((card) => card.staple),
        rules.version === 2 || rules.version === 3,
      );
      state.escortHired = true;
      state.pirateAttackResolved = true;
      const funds = state.money,
        due = quoteDues(state).total;
      startPhase3(state, []);
      finishSettlement(state, []);
      assert.equal(state.money, funds - due);
    }
  }
});

test("Shared arrivals, events and demand are reproducible and all catalog goods have sale routes", () => {
  for (const difficulty of DIFFICULTY_ORDER) {
    const state = game(difficulty);
    const peer = { ...ctx, seedBase: ctx.seedBase + " peer" };
    assert.deepEqual(state.forecasts, game(difficulty).forecasts);
    assert.equal(new Set(state.forecasts!.map(({ kind }) => kind)).size, 7);
    assert.equal(state.arrivals?.length, state.maxRounds);
    assert.deepEqual(poolsFor(state).resources, [...RESOURCES]);
    assert.deepEqual(poolsFor(state).products, [...PRODUCTS]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 35; seed++) {
      const personal = { ...ctx, seedBase: `${ctx.seedBase} ${seed}` };
      for (let round = 1; round <= state.maxRounds; round++) {
        state.currentRound = round;
        state.inventory = Object.fromEntries(ITEMS.map((item) => [item, 5]));
        state.modifierFlags = { coastal_forecast: 1 };
        state.equippedModules = [];
        state.effectUses = {};
        startPhase1(state, personal, []);
        for (const lot of state.resourceCards)
          for (const item of lot.resources) seen.add(item.type);
        assert.ok(
          state.resourceCards.length >= 7 && state.resourceCards.length <= 9,
        );
        assert.equal(
          state.resourceCards.some((card) => card.staple),
          false,
        );
        const personalOrders = ordinaryOrders(state, personal).cards;
        assert.deepEqual(personalOrders, ordinaryOrders(state, personal).cards);
        assert.notDeepEqual(personalOrders, ordinaryOrders(state, peer).cards);
        startPhase2(state, personal, []);
        assert.deepEqual(
          state.customerCards.slice(-personalOrders.length),
          personalOrders,
        );
        for (const report of state.scoutedOrders ?? []) {
          assert.deepEqual(
            state.customerCards.find(({ id }) => id === report.id),
            report,
          );
        }
        for (const item of ITEMS) {
          const quote = quotePortExchange(state, item, 5)!;
          assert.ok(quote.net >= 5);
          assert.equal(quote.port, state.arrivals![round - 1]);
        }
      }
    }
    for (const material of RESOURCES) assert.ok(seen.has(material), material);
    for (const product of PRODUCTS) {
      assert.ok(seen.has(product), product);
      const recipe = voyageRecipe(product, OPEN_HARBOR_RULES);
      assert.ok(
        unlockedWorkerTypes(difficulty, 1, OPEN_HARBOR_RULES).some(
          ({ id }) => id === recipe.worker_type,
        ),
      );
      assert.ok(Object.keys(recipe.materials).every((item) => seen.has(item)));
    }
    assert.equal(
      unlockedModules(difficulty, 1, OPEN_HARBOR_RULES).length,
      MODULES.length,
    );
    assert.equal(
      unlockedBoons(difficulty, 1, OPEN_HARBOR_RULES).length,
      BOONS.length,
    );
    assert.equal(new Set(ITEMS.map((item) => ICONS[item])).size, ITEMS.length);
  }
});

test("Exchange quotes settle the same amount after VAT and freight and reject saved retries", () => {
  const state = game();
  state.phase = 2;
  const logs: string[] = [];
  state.inventory.Sachet = 7;
  equip(state, "tax_evasion", "salvage_crane", "silk_market_charter");
  const batch = quotePortExchange(state, "Sachet", 7)!;
  const initial = state.money;
  assert.equal(batch.tiers[0].quantity, 3);
  assert.equal(batch.tiers[1].quantity, 4);
  assert.ok(batch.tiers[0].unitPrice > batch.tiers[1].unitPrice);
  const split = structuredClone(state);
  const first = quotePortExchange(split, "Sachet", 2)!;
  assert.ok(sellAtPortExchange(split, first, logs));
  const second = quotePortExchange(split, "Sachet", 5)!;
  assert.ok(sellAtPortExchange(split, second, logs));
  assert.equal(first.net + second.net, batch.net);
  assert.equal(sellAtPortExchange(state, batch, logs), true);
  const resumed: GameState = JSON.parse(JSON.stringify(state));
  assert.equal(sellAtPortExchange(resumed, batch, logs), false);
  assert.equal(resumed.money, initial + batch.net);
  assert.equal(resumed.vatPaid, batch.vat);
  assert.equal(resumed.roundCosts, batch.freight);
  assert.equal(resumed.roundRevenue, batch.gross - batch.vat);
  assert.equal(resumed.totalOrdersCompleted, 0);
  assert.equal(resumed.score, 0);
  assert.ok(logs.some((line) => line.includes(`Net ${batch.net} Gold`)));
  for (const amount of [0, -1, 0.5, Infinity, NaN, 20])
    assert.equal(quotePortExchange(state, "Hemp", amount), undefined);
});

test("Broker adds exact personal orders and each rumor maps to one buyer", () => {
  const state = game("monsoon");
  state.modifierFlags.free_intel = 1;
  equip(state, "brokers_network", "ocean_relay");
  startPhase1(state, ctx, []);
  purchaseIntel(state, [], "Silk");
  assert.equal(state.revealedIntel.length, 4);
  assert.equal(intelPurchaseCount(state), 0);
  const afterPurchase = state.money;
  const bundleLogs: string[] = [];
  purchaseIntel(state, bundleLogs, "Tea");
  assert.equal(state.money, afterPurchase);
  assert.equal(state.revealedIntel.length, 4);
  assert.match(bundleLogs[0], /already purchased/);
  const originals = ordinaryOrders(state, ctx).cards;
  startPhase2(state, ctx, []);
  assert.deepEqual(state.customerCards.slice(0, originals.length), originals);
  const linked = state.customerCards.filter((entry) =>
    whisperForOrder(state, entry),
  );
  assert.equal(linked.length, 4);
  assert.equal(new Set(linked.map((entry) => entry.id)).size, 4);
  for (const entry of linked) {
    const whisper = whisperForOrder(state, entry)!;
    assert.equal(entry.demandPort, whisper.port);
    assert.equal(entry.resources[0].type, whisper.item);
    assert.equal(entry.totalItems, whisper.quantity);
    assert.equal(entry.reward, whisper.reward);
  }
});

test("Starter choice unlocks the Boon draft and later Shipyard swaps consume one draft", () => {
  const state = game();
  startBoonDrafting(state, []);
  const starting = state._draftChoices![0];
  selectBoon(state, ctx, state.boonChoices[0].id, []);
  assert.equal(state.phase, 5);
  selectStarterModule(state, starting.id, []);
  const restored: GameState = JSON.parse(JSON.stringify(state));
  selectBoon(restored, ctx, restored.boonChoices[0].id, []);
  assert.equal(restored.phase, 1);
  assert.equal(restored.equippedModules[0].id, starting.id);
  restored.phase = 4;
  startModuleDrafting(restored);
  const replacement = restored._draftChoices![0];
  handleModuleSelect(restored, 0, []);
  assert.equal(restored.phase, "module_swap");
  startModuleDrafting(restored);
  assert.equal(restored.phase, "module_draft");
  handleModuleSelect(restored, 0, []);
  finalizeModuleSwap(restored, 0, []);
  assert.equal(restored.phase, 4);
  assert.equal(restored.equippedModules[0].id, replacement.id);
  startModuleDrafting(restored);
  assert.equal(restored.phase, 4);
});

for (const [version, makeGame] of [
  [4, game],
  [5, classicHarborGame],
  [6, currentHarborGame],
] as const) {
  test(
    "Silk modifiers are additive and capped, and match the ledger" +
      ` under version ${version}`,
    () => {
      const state = makeGame();
      const logs: string[] = [];
      state.phase = 2;
      state.inventory.Silk = 10;
      equip(state, "silk_monopoly", "silk_market_charter");
      state.modifierFlags.buyers_festival = 1;
      const first = order(1, "Silk", 4, 48);
      const next = order(2, "Silk", 4, 48);
      const mandate = { ...order(3, "Silk", 1, 60), isMandate: true };
      state.customerCards = [first, next, mandate];
      const funds = state.money;
      const quote = quoteOrder(state, first);
      assert.equal(quote.reward, 69);
      assert.equal(quote.freight.final, 0);
      completeOrder(state, first.id, logs);
      completeOrder(state, first.id, logs);
      assert.equal(state.money, funds + 69);
      assert.equal(bonus(state, next, "Buyer's Festival"), 9);
      completeOrder(state, next.id, logs);
      assert.equal(bonus(state, next, "Buyer's Festival"), 0);
      assert.equal(quoteOrder(state, mandate).bonuses.length, 0);
      assert.ok(
        logs.includes("Silk Market Charter added 12 Gold to the reward"),
      );
      assert.ok(logs.includes("Buyer's Festival added 9 Gold to the reward"));
    },
  );
}

for (const [version, makeGame] of [
  [4, game],
  [5, classicHarborGame],
  [6, currentHarborGame],
] as const) {
  test(
    "Open Hold and Market Momentum trigger separately from the Exchange" +
      ` under version ${version}`,
    () => {
      const state = makeGame();
      state.phase = 2;
      state.modifierFlags.market_momentum = 1;
      equip(state, "open_hold");
      state.inventory.Sachet = 3;
      const mixed: OrderCard = {
        ...order(1, "Hemp", 1, 30),
        totalItems: 2,
        resources: [
          { type: "Hemp", required: 1 },
          { type: "Tea", required: 1 },
        ],
        buyer: "mixed",
      };
      const product = order(2, "Sachet");
      state.customerCards = [mixed, product];
      const logs: string[] = [];
      assert.ok(
        sellAtPortExchange(state, quotePortExchange(state, "Hemp", 1)!, logs),
      );
      assert.equal(bonus(state, product, "Market Momentum"), 0);
      assert.equal(bonus(state, mixed, "Open Hold"), 10);
      assert.equal(
        bonus(
          state,
          { ...mixed, resources: [mixed.resources[0], mixed.resources[0]] },
          "Open Hold",
        ),
        0,
      );
      completeOrder(state, 1, logs);
      const q = quoteOrder(state, product);
      assert.equal(
        bonus(state, product, "Market Momentum"),
        Math.floor((product.reward - q.totalVat) * 0.2),
      );
      completeOrder(state, 2, logs);
      assert.equal(bonus(state, mixed, "Open Hold"), 0);
      assert.equal(bonus(state, product, "Market Momentum"), 0);
      assert.ok(logs.some((line) => line.includes("Market Momentum added")));
    },
  );
}

for (const [version, makeGame] of [
  [4, game],
  [5, classicHarborGame],
  [6, currentHarborGame],
] as const) {
  test(
    "Traveling Commission, Storm Dividend and Collector's Seal preserve their timing across saves" +
      ` under version ${version}`,
    () => {
      const state = makeGame("monsoon");
      state.phase = 2;
      equip(state, "traveling_commission", "storm_dividend", "collectors_seal");
      const logs: string[] = [];
      for (const item of ["Celadon Ware", "Lacquered Jar", "Salt Glazed Bowl"])
        state.inventory[item] = 3;
      const first = order(1, "Celadon Ware");
      const same = order(2, "Celadon Ware");
      const distinct = order(3, "Lacquered Jar");
      state.customerCards = [first, same, distinct];
      assert.equal(bonus(state, first, "Collector's Seal"), 0);
      completeOrder(state, 1, logs);
      assert.equal(state.effectUses?.collectors_seal, undefined);
      const midRound: GameState = JSON.parse(JSON.stringify(state));
      assert.equal(bonus(midRound, same, "Collector's Seal"), 0);
      completeOrder(state, 2, logs);
      assert.equal(state.travelingCommissionRound, undefined);
      completeOrder(state, 3, logs);
      assert.equal(state.travelingCommissionRound, 2);
      state.phase = 3;
      resolvePirateAttack(state, logs);
      assert.equal(state.directPassageRound, 1);
      const loaded: GameState = JSON.parse(JSON.stringify(state));
      loaded.currentRound = 2;
      startBoonDrafting(loaded, logs);
      loaded.phase = 2;
      const final = order(4, "Salt Glazed Bowl");
      loaded.customerCards = [final];
      assert.equal(bonus(loaded, final, "Collector's Seal"), 10);
      assert.ok(bonus(loaded, final, "Traveling Commission") > 0);
      assert.ok(bonus(loaded, final, "Storm Dividend") > 0);
      completeOrder(loaded, 4, logs);
      assert.equal(bonus(loaded, final, "Traveling Commission"), 0);
      assert.equal(bonus(loaded, final, "Storm Dividend"), 0);
      assert.equal(bonus(loaded, final, "Collector's Seal"), 0);
      assert.equal(loaded.ceramicCollection!.length, 3);
      loaded.phase = 3;
      hireEscort(loaded, logs);
      assert.equal(loaded.directPassageRound, 1);
      loaded.currentRound = 3;
      startBoonDrafting(loaded, logs);
      startPhase2(loaded, ctx, logs);
      assert.equal(bonus(loaded, final, "Collector's Seal"), 15);
      assert.equal(bonus(loaded, final, "Storm Dividend"), 0);
      loaded.currentRound = loaded.maxRounds;
      loaded.finishedSales = ["Celadon Ware"];
      loaded.travelingCommissionRound = undefined;
      loaded.customerCards = [final];
      completeOrder(loaded, final.id, logs);
      assert.equal(loaded.travelingCommissionRound, undefined);
    },
  );
}

for (const [version, makeGame] of [
  [4, game],
  [5, classicHarborGame],
  [6, currentHarborGame],
] as const) {
  test(
    "Resourceful Crew saves two distinct recipes and Workshop Supplier honors the same inputs" +
      ` under version ${version}`,
    () => {
      const state = makeGame();
      equip(state, "artisans_workshop");
      state.inventory.Hemp = 1;
      state.inventory.Silk = 0;
      state.modifierFlags.resourceful_crew = 1;
      const logs: string[] = [];
      startPhase1(state, ctx, logs);
      const supplier = quoteWorkshopSupply(state, "Cotton Clothes")!;
      assert.deepEqual(
        supplier.resources.map(({ type, quantity }) => [type, quantity]),
        [["Hemp", 1]],
      );
      const before = state.money;
      buyWorkshopSupply(state, "Cotton Clothes", logs);
      assert.equal(state.money, before - getCardFinalCost(state, supplier));
      assert.equal(quoteWorkshopSupply(state, "Brocade"), undefined);
      state.inventory.Hemp = 10;
      state.inventory.Silk = 10;
      state.phase = "worker_mgmt";
      for (let i = 0; i < 3; i++) hireWorker(state, "weaver", logs);
      assignTask(state, "weaver", "Cotton Clothes", logs);
      assert.deepEqual(quoteRecipe(state, "Cotton Clothes").inputs, {
        Hemp: 2,
        Silk: 1,
      });
      assignTask(state, "weaver", "Linen Clothes", logs);
      assert.ok(
        logs.includes("Resourceful Crew saved one Silk on Cotton Clothes."),
      );
      assert.ok(
        logs.includes("Resourceful Crew saved one Hemp on Linen Clothes."),
      );
      assert.equal(quoteRecipe(state, "Brocade").saved, undefined);
      startPhase3(state, logs);
      assert.equal(state.inventory["Cotton Clothes"], 2);
      assert.equal(state.inventory["Linen Clothes"], 1);
    },
  );
}

test("Signal Lantern previews the eventual commission, and weather and tariff terms are reflected in quotes", () => {
  const state = game("fair_winds");
  equip(state, "signal_lantern");
  const report = upcomingBuyer(state, ctx, 2, true);
  assert.ok(report);
  state.currentRound = 2;
  startPhase2(state, ctx, []);
  assert.deepEqual(
    state.customerCards.find(({ id }) => id === report.id),
    report,
  );
  state.forecasts = [{ round: 2, kind: "seas" }];
  assert.equal(quotePirateWaters(state).weather, 0.06);
  state.modifierFlags.income_tax_override = 0;
  state.roundRevenue = 200;
  state.roundCosts = 10;
  assert.equal(incomeTaxDue(state), 0);
  state.modifierFlags.vat_discount = 0.5;
  const sale = order(90, "Sachet");
  assert.ok(bonus(state, sale, "Frontier Tariff Relief") > 0);
  assert.equal(
    bonus(state, { ...sale, isMandate: true }, "Frontier Tariff Relief"),
    0,
  );
  assert.equal(
    bonus(state, { ...sale, isBrokerFavor: true }, "Frontier Tariff Relief"),
    0,
  );
});

test("The strongest legal Exchange resale stacks stay bounded by finite lots and price tiers", (t) => {
  const relevant = [
    "smugglers_hold",
    "merchant_scales",
    "kiln_cellar",
    "foreign_quarter_pass",
    "tax_evasion",
  ];
  const combinations = relevant.flatMap((first, i) =>
    relevant
      .slice(i + 1)
      .flatMap((second, offset) =>
        relevant.slice(i + offset + 2).map((third) => [first, second, third]),
      ),
  );
  const discounts = BOONS.filter(({ modifiers }) =>
    [
      "purchase_discount",
      "hemp_price_reduction",
      "bamboo_fair",
      "deep_market",
      "vat_discount",
    ].some((key) => key in modifiers),
  );
  let best = 0;
  let classicBest = 0;
  let classicQuotes = 0;
  let quotes = 0;
  const logs: string[] = [];
  for (const difficulty of DIFFICULTY_ORDER) {
    for (let seed = 0; seed < 50; seed++) {
      const state = game(difficulty);
      state.seatSeed = `resale ${seed}`;
      state.currentRound = (seed % state.maxRounds) + 1;
      state.money = 2000;
      startPhase1(state, { ...ctx, seedBase: state.seatSeed }, []);
      for (const lot of state.resourceCards) {
        const cargo = Object.fromEntries(
          lot.resources.map(({ type, quantity }) => [type, quantity!]),
        );
        let maximum = {
          profit: -Infinity,
          ids: [] as string[],
          flags: {} as GameState["modifierFlags"],
        };
        for (const ids of combinations) {
          equip(state, ...ids);
          for (const boon of discounts) {
            state.modifierFlags = boon.modifiers;
            const cost = getCardFinalCost(state, lot);
            assert.ok(cost >= 0);
            const payout = lot.resources.reduce(
              (sum, { type, quantity }) =>
                sum +
                quotePortExchange(
                  { ...state, phase: 2, inventory: cargo },
                  type,
                  quantity!,
                )!.net,
              0,
            );
            const profit = payout - cost;
            if (profit > maximum.profit)
              maximum = { profit, ids, flags: boon.modifiers };
            quotes++;
          }
        }
        best = Math.max(best, maximum.profit);
        const purchased = structuredClone(state);
        equip(purchased, ...maximum.ids);
        purchased.modifierFlags = maximum.flags;
        purchased.inventory = {};
        const initial = purchased.money;
        purchaseCard(purchased, lot.id, logs);
        purchaseCard(purchased, lot.id, logs);
        assert.equal(purchased.purchaseCount, 1);
        purchased.phase = 2;
        for (const { type, quantity } of lot.resources) {
          const quote = quotePortExchange(purchased, type, quantity!)!;
          assert.equal(sellAtPortExchange(purchased, quote, logs), true);
          assert.equal(sellAtPortExchange(purchased, quote, logs), false);
          assert.equal(purchased.inventory[type], 0);
        }
        assert.equal(purchased.money - initial, maximum.profit);
        logs.length = 0;
      }
    }
  }
  for (const difficulty of DIFFICULTY_ORDER) {
    const phase2 = 2 as const;
    for (let seed = 0; seed < 50; seed++) {
      const state = classicHarborGame(difficulty);
      const late = Math.floor(state.maxRounds / 2) + 1;
      state.currentRound = late + (seed % (state.maxRounds + 1 - late));
      state.shipLevel = 3;
      state.seatSeed = `classic resale ${seed}`;
      const context = { ...ctx, seedBase: state.seatSeed };
      startPhase1(state, context, []);
      const eligible = unlockedModules(
        difficulty,
        state.currentRound,
        CLASSIC_HARBOR_RULES,
      );
      const paidBoons = unlockedBoons(
        difficulty,
        state.currentRound,
        CLASSIC_HARBOR_RULES,
      );
      for (const ids of combinations) {
        if (!ids.every((id) => eligible.some((module) => module.id === id)))
          continue;
        equip(state, ...ids);
        for (const boon of paidBoons.filter(({ id }) =>
          discounts.some((candidate) => candidate.id === id),
        )) {
          state.modifierFlags = boon.modifiers;
          for (const lot of state.resourceCards) {
            const value = lot.resources.reduce(
              (gold, { type, quantity = 0 }) => {
                const sale = quotePortExchange(
                  { ...state, phase: phase2, inventory: { [type]: quantity } },
                  type,
                  quantity,
                );
                assert.ok(sale);
                return gold + sale.net;
              },
              0,
            );
            classicBest = Math.max(
              classicBest,
              value - getCardFinalCost(state, lot),
            );
            classicQuotes++;
          }
        }
      }
    }
  }
  assert.ok(classicQuotes > 10_000);
  assert.ok(classicBest <= 45);
  t.diagnostic(
    `Version 5 strongest observed resale: ${classicBest} Gold across ${classicQuotes} quotes.`,
  );
  assert.ok(combinations.length === 10 && quotes >= 50_000);
  assert.ok(
    best > 0 && best <= 45,
    `Largest observed lot profit was ${best} Gold`,
  );
});

function classicHarborGame(difficulty: Difficulty = "fair_winds") {
  const state = createInitialGameState(
    0,
    1,
    10,
    difficulty,
    buildClassicHarborRules(ctx.roomSeed, 10, difficulty),
  );
  state.seatSeed = ctx.seedBase;
  return state;
}

for (const version of [CLASSIC_HARBOR_RULES, REVISED_HARBOR_RULES, CURRENT_HARBOR_RULES]) {
  test(`Rules version ${version} preserves the original opening lots, buyers and prices`, () => {
    for (const [index, difficulty] of DIFFICULTY_ORDER.entries()) {
      const rules = buildClassicHarborRules(ctx.roomSeed, 10, difficulty, version);
      const state = createInitialGameState(0, 1, 10, difficulty, rules);
      state.seatSeed = ctx.seedBase;
      assert.equal(state.money, [100, 100, 90][index]);
      assert.equal(state.fixedCost, [15, 18, 22][index]);
      assert.equal(state.maxRounds, [8, 12, 16][index]);
      assert.deepEqual(state.arrivals?.length, state.maxRounds);
      state.arrivals?.forEach((port, round) =>
        assert.ok(unlockedPorts(difficulty, round + 1).includes(port)),
      );
      assert.deepEqual(state.shipUpgradeCost, [15, 25, 40]);
      assert.equal(state.shipLevel, 0);
      assert.equal(state.specialties, undefined);
      startBoonDrafting(state, []);
      assert.equal(state.phase, 5);
      assert.equal(state.equippedModules.length, 0);
      startPhase1(state, ctx, []);
      const original = createInitialGameState(0, 1, 10, difficulty);
      startPhase1(original, ctx, []);
      assert.deepEqual(state.resourceCards, original.resourceCards);
      assert.equal(state.resourceCards.length, 6);
      assert.deepEqual(poolsFor(state).products, poolsFor(original).products);
      assert.deepEqual(poolsFor(state).resources, ["Hemp", "Silk", "Tea"]);
      startPhase2(state, ctx, []);
      startPhase2(original, ctx, []);
      assert.equal(state.customerCards.length, 6);
      assert.deepEqual(
        state.customerCards.map(({ buyer: _classification, ...buyer }) => buyer),
        original.customerCards,
      );
    }
  });
}

test("Classic recipes and sale ranges remain the same while imports rotate into existing slots", () => {
  const examples = [
    ["Linen Clothes", { Hemp: 2 }, [30, 42]],
    ["Cotton Clothes", { Hemp: 2, Silk: 1 }, [50, 65]],
    ["Brocade", { Silk: 3 }, [70, 90]],
    ["Sachet", { Silk: 1, Tea: 2 }, [95, 120]],
    ["Bronze Mirror", { "Copper Ore": 3 }, [55, 72]],
    ["Celadon Ware", { "Porcelain Clay": 3 }, [78, 100]],
  ] as const;
  for (const [item, ingredients, range] of examples) {
    assert.deepEqual(
      voyageRecipe(item, CLASSIC_HARBOR_RULES).materials,
      ingredients,
    );
    assert.deepEqual(productPriceRange(item, CLASSIC_HARBOR_RULES), range);
  }
  for (const difficulty of DIFFICULTY_ORDER) {
    const seen = new Set<string>();
    for (let seed = 0; seed < 42; seed++) {
      const context = {
        roomSeed: `rotations ${seed}`,
        seedBase: `rotations ${seed}:captain`,
      };
      const state = classicHarborGame(difficulty);
      state.arrivals = buildClassicHarborRules(
        context.roomSeed,
        10,
        difficulty,
      ).arrivals;
      for (let round = 2; round <= state.maxRounds; round++) {
        state.currentRound = round;
        startPhase1(state, context, []);
        const original = createInitialGameState(0, 1, 10, difficulty);
        original.currentRound = round;
        startPhase1(original, context, []);
        assert.equal(state.resourceCards.length, original.resourceCards.length);
        assert.equal(
          state.plannedOrders?.length,
          ordinaryOrders(original, context).cards.length,
        );
        for (const lot of state.resourceCards) {
          for (const { type } of lot.resources) seen.add(type);
        }
      }
    }
    for (const item of RESOURCES)
      assert.ok(seen.has(item), `${difficulty}: ${item}`);
  }
});

test("Broker, Farsight, and Coastal Forecast reveal distinct terms from the frozen board", () => {
  const state = classicHarborGame("monsoon");
  state.currentRound = 6;
  equip(state, "brokers_network", "ocean_relay", "signal_lantern");
  state.modifierFlags = { free_intel: 1, coastal_forecast: 1, extra_order: 1 };
  startPhase1(state, ctx, []);
  const board = structuredClone(state.plannedOrders!);
  const next = upcomingBuyer(state, ctx, 7)!;
  const lantern = upcomingBuyer(state, ctx, 7, true)!;
  assert.notEqual(next.id, lantern.id);
  const quote = state.money;
  const restored = JSON.parse(JSON.stringify(state)) as GameState;
  restored.inventory.Hemp += 50;
  restored.inventory.Silk = 0;
  purchaseIntel(restored, [], "Sachet");
  const after = restored.money;
  assert.equal(quote - after, 2);
  purchaseIntel(restored, [], "Hemp");
  assert.equal(restored.money, after);
  const scouted = new Set(restored.scoutedOrders?.map(({ id }) => id));
  const whisperIds = new Set(
    restored.revealedIntel.map(({ orderId }) => orderId),
  );
  assert.equal(whisperIds.size, restored.revealedIntel.length);
  assert.ok(
    [...whisperIds].every((id) => id !== undefined && !scouted.has(id)),
  );
  startPhase2(restored, ctx, []);
  assert.deepEqual(
    restored.customerCards
      .filter((card) => !card.isMandate)
      .map(({ whisperIndex: _whisper, ...card }) => card),
    board,
  );
  for (const card of restored.customerCards) {
    const whisper = whisperForOrder(restored, card);
    assert.equal(Boolean(whisper), whisperIds.has(card.id));
    if (whisper) {
      assert.deepEqual(whisper.cargo, card.resources);
      assert.equal(whisper.port, card.demandPort);
      assert.equal(whisper.reward, card.reward);
    }
  }
  restored.currentRound = 7;
  startPhase1(restored, ctx, []);
  assert.deepEqual(
    restored.plannedOrders?.find(({ id }) => id === next.id),
    next,
  );
  assert.deepEqual(
    restored.plannedOrders?.find(({ id }) => id === lantern.id),
    lantern,
  );
});

test("Announced commissions survive a Shipyard swap and cannot be sold as new intel", () => {
  for (const hadLantern of [false, true]) {
    const state = createInitialGameState(
      0,
      1,
      10,
      "fair_winds",
      buildCurrentVoyageRules(ctx.roomSeed, 10, "fair_winds"),
    );
    if (hadLantern) equip(state, "signal_lantern");
    startPhase1(state, ctx, []);
    const commission = upcomingBuyer(state, ctx, 2)!;
    const lantern = upcomingBuyer(state, ctx, 2, true);
    assert.equal(Boolean(lantern), hadLantern);
    const known = lantern ? [commission, lantern] : [commission];
    startPhase2(state, ctx, []);
    equip(
      state,
      ...(hadLantern ? [] : ["signal_lantern"]),
      "brokers_network",
      "ocean_relay",
    );
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    restored.currentRound = 2;
    startBoonDrafting(restored, []);
    restored.modifierFlags = { free_intel: 1 };
    startPhase1(restored, ctx, []);
    for (const buyer of known) {
      assert.deepEqual(
        restored.scoutedOrders?.find(({ id }) => id === buyer.id),
        buyer,
      );
    }
    const available = intelPurchaseCount(restored);
    assert.equal(available, hadLantern ? 1 : 2);
    purchaseIntel(restored, [], commission.resources[0].type);
    assert.equal(restored.revealedIntel.length, available + 1);
    startPhase2(restored, ctx, []);
    for (const buyer of known) {
      const actual = restored.customerCards.find(({ id }) => id === buyer.id)!;
      assert.deepEqual(actual, buyer);
      assert.equal(whisperForOrder(restored, actual), undefined);
    }
    restored.currentRound = restored.maxRounds;
    startPhase1(restored, ctx, []);
    assert.equal(restored.announcedBuyers, undefined);
  }
});

test("Market Day announces an existing mixed buyer for the featured import", () => {
  for (const difficulty of DIFFICULTY_ORDER) {
    const rules = buildCurrentVoyageRules(ctx.roomSeed, 10, difficulty);
    const state = createInitialGameState(0, 1, 10, difficulty, rules);
    const round = Math.floor(state.maxRounds / 2) + 1;
    state.currentRound = round - 1;
    state.forecasts = [{ round, kind: "market", item: "Lapis Lazuli" }];
    equip(state, "signal_lantern", "open_hold");
    startPhase1(state, ctx, []);
    const mixed = upcomingBuyer(state, ctx, round)!;
    assert.equal(mixed.buyer, "mixed");
    assert.equal(mixed.resources.length, 2);
    assert.ok(mixed.resources.some(({ type }) => type === "Lapis Lazuli"));
    const extra = upcomingBuyer(state, ctx, round, true)!;
    assert.equal(extra.buyer, "commission");
    state.currentRound = round;
    startBoonDrafting(state, []);
    startPhase1(state, ctx, []);
    assert.ok(
      state.resourceCards.some(
        (lot) =>
          lot.featured &&
          lot.resources.some(({ type }) => type === "Lapis Lazuli"),
      ),
    );
    assert.deepEqual(
      state.scoutedOrders?.filter(({ id }) => id === mixed.id),
      [mixed],
    );
    purchaseIntel(state, [], "Lapis Lazuli");
    startPhase2(state, ctx, []);
    assert.deepEqual(
      state.customerCards.find(({ id }) => id === mixed.id),
      mixed,
    );
    for (const { type, required } of mixed.resources)
      state.inventory[type] = required!;
    const quote = quoteOrder(state, mixed);
    assert.equal(bonus(state, mixed, "Open Hold"), 10);
    const cash = state.money;
    const logs: string[] = [];
    completeOrder(state, mixed.id, logs);
    assert.equal(state.money - cash, quote.reward - quote.freight.final);
    assert.ok(logs.includes("Open Hold added 10 Gold to the reward"));
  }
});

test("Exchange quotes every commodity and local freight matches the ledger", () => {
  for (const difficulty of DIFFICULTY_ORDER) {
    const state = classicHarborGame(difficulty);
    startPhase1(state, ctx, []);
    assert.ok(
      state.resourceCards.every(
        (lot) =>
          lot.totalCost >
          lot.resources.reduce((net, { type, quantity = 0 }) => {
            const holding = {
              ...state,
              phase: 2 as const,
              inventory: { ...state.inventory, [type]: quantity },
            };
            return net + (quotePortExchange(holding, type, quantity)?.net ?? 0);
          }, 0),
      ),
    );
    state.currentRound = 2;
    startPhase1(state, ctx, []);
    startPhase2(state, ctx, []);
    for (const item of ITEMS) {
      state.inventory[item] = 4;
      const quote = quotePortExchange(state, item, 4)!;
      assert.ok(quote?.net >= 4);
      const before = state.money;
      const ledger: string[] = [];
      assert.ok(sellAtPortExchange(state, quote, ledger));
      assert.equal(state.money - before, quote.net);
      assert.match(ledger[0], new RegExp(`Net ${quote.net} Gold`));
      assert.equal(sellAtPortExchange(state, quote, ledger), false);
    }
    const merchant = state.customerCards[0];
    assert.equal(merchant.demandPort, harborArrival(state));
    const { type, required = 0 } = merchant.resources[0];
    state.inventory[type] = required;
    const quote = quoteOrder(state, merchant);
    assert.equal(
      quote.freight.steps.find(({ label }) => label === "Local delivery")
        ?.delta,
      -3,
    );
    const cash = state.money;
    const ledger: string[] = [];
    completeOrder(state, merchant.id, ledger);
    assert.equal(state.money - cash, quote.reward - quote.freight.final);
    assert.match(
      ledger.join(" "),
      new RegExp(`Freight: ${quote.freight.final} Gold`),
    );
  }
});

test("The first module needs a paid Shipyard upgrade", () => {
  const state = classicHarborGame();
  state.phase = 4;
  startModuleDrafting(state);
  assert.equal(state.phase, 4);
  const cash = state.money;
  upgradeShip(state, []);
  assert.equal(state.money, cash - 15);
  startModuleDrafting(state);
  handleModuleSelect(state, 0, []);
  assert.equal(state.equippedModules.length, 1);
  assert.equal(state._draftChoices?.length, 0);
});

test("Historical ledger losses display as words without altering their saved entries", () => {
  assert.equal(
    displayLedgerLine("📈 Profit before tax: -9 Gold"),
    "📈 Loss before tax: 9 Gold",
  );
  assert.equal(displayLedgerLine("Net Proceeds: −6 Gold"), "Net Cost: 6 Gold");
  assert.equal(
    displayLedgerLine("Captain North-West arrived"),
    "Captain North-West arrived",
  );
});

for (const [version, makeGame] of [
  [4, game],
  [5, classicHarborGame],
  [6, currentHarborGame],
] as const) {
  test(
    "First sale effects are consumed when a percentage bonus rounds to zero" +
      ` under version ${version}`,
    () => {
      const state = makeGame();
      state.phase = 2;
      state.currentRound = 2;
      state.money = 100;
      state.inventory["Linen Clothes"] = 2;
      state.modifierFlags.market_momentum = 1;
      state.effectUses = { momentum_ready: 1 };
      state.travelingCommissionRound = 2;
      state.directPassageRound = 1;
      equip(state, "traveling_commission", "storm_dividend");
      const first = order(1, "Linen Clothes", 1, 1);
      const later = order(2, "Linen Clothes", 1, 100);
      state.customerCards = [first, later];
      const logs: string[] = [];
      assert.equal(bonus(state, first, "Traveling Commission"), 0);
      assert.equal(bonus(state, first, "Storm Dividend"), 0);
      assert.equal(bonus(state, first, "Market Momentum"), 0);
      completeOrder(state, first.id, logs);
      const restored = JSON.parse(JSON.stringify(state)) as GameState;
      assert.equal(restored.effectUses?.traveling_commission, 1);
      assert.equal(restored.effectUses?.storm_dividend, 1);
      assert.equal(restored.effectUses?.market_momentum, 1);
      assert.equal(bonus(restored, later, "Traveling Commission"), 0);
      assert.equal(bonus(restored, later, "Storm Dividend"), 0);
      assert.equal(bonus(restored, later, "Market Momentum"), 0);
    },
  );
}

function currentHarborGame(difficulty: Difficulty = "fair_winds") {
  const state = createInitialGameState(
    0,
    1,
    10,
    difficulty,
    buildCurrentVoyageRules(ctx.roomSeed, 10, difficulty),
  );
  state.seatSeed = ctx.seedBase;
  return state;
}

test("A late draft only offers modules with a remaining opportunity to pay", () => {
  const state = currentHarborGame();
  assert.equal(state.rulesVersion, CURRENT_HARBOR_RULES);
  state.currentRound = state.maxRounds - 1;
  state.shipLevel = 1;
  const draw = () => {
    const seen = new Set<string>();
    for (let i = 0; i < 96; i++) {
      state.phase = 4;
      state._draftChoices = undefined;
      state.seatSeed = `late draft ${i}`;
      startModuleDrafting(state);
      const choices = (state as GameState)._draftChoices;
      assert.equal(choices?.length, 3);
      choices?.forEach(({ id }) => seen.add(id));
    }
    return seen;
  };
  const first = draw();
  for (const id of [
    "artisans_workshop",
    "wage_ledger",
    "signal_lantern",
    "traveling_commission",
    "storm_dividend",
    "collectors_seal",
  ])
    assert.ok(!first.has(id), id);
  assert.ok(first.has("open_hold"));
  state.directPassageRound = state.currentRound;
  state.ceramicCollection = ["Celadon Ware"];
  state.travelingCommissionRound = state.maxRounds;
  const returning = draw();
  for (const id of [
    "storm_dividend",
    "collectors_seal",
    "traveling_commission",
  ])
    assert.ok(returning.has(id), id);
});

test("Artisan Boons use the actual hire wage and keep already employed artisans eligible", () => {
  const state = currentHarborGame();
  state.currentRound = 6;
  state.money = state.fixedCost + 2;
  const draw = () => {
    const seen = new Set<string>();
    for (let i = 0; i < 192; i++) {
      state.seatSeed = `artisan draft ${i}`;
      for (const { id } of draftBoons(state)) seen.add(id);
    }
    return seen;
  };
  const before = draw();
  assert.ok(before.has("master_apprentice"));
  assert.ok(!before.has("guild_turnover") && !before.has("resourceful_crew"));
  state.workers.potter.push({ task: null, isSkilled: false, producedCount: 0 });
  const staffed = draw();
  assert.ok(staffed.has("guild_turnover") && staffed.has("resourceful_crew"));
  state.currentRound = state.maxRounds;
  const final = draw();
  for (const id of ["master_apprentice", "guild_turnover", "resourceful_crew"])
    assert.ok(!final.has(id));
});

test("A harbor waiting on an older release starts with the new opening and keeps its Renown allowance", () => {
  const old = buildOpenHarborRules(ctx.roomSeed, 10, "monsoon");
  const rules = buildCurrentVoyageRules(ctx.roomSeed, 10, "monsoon");
  for (const savedVersion of [old.version, rules.version]) {
    const waiting = createInitialGameState(15, 3, 10, "monsoon", old);
    assert.equal(waiting.shipLevel, 1);
    waiting.rulesVersion = savedVersion;
    startVoyage(waiting, ctx, rules, 15, []);
    assert.equal(waiting.money, 105);
    assert.equal(waiting.fixedCost, 22);
    assert.equal(waiting.shipLevel, 0);
    assert.equal(waiting.rulesVersion, CURRENT_HARBOR_RULES);
    assert.deepEqual(waiting.arrivals, rules.arrivals);
    assert.equal(waiting.phase, 5);
    const underway = structuredClone(waiting);
    startVoyage(waiting, ctx, old, 0, []);
    assert.deepEqual(waiting, underway);
  }
});
