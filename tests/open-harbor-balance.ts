import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRng } from "../src/lib/game/rng";
import {
  COMMODITIES,
  PRODUCTS,
  RESOURCES,
  WAGES,
  TIDEWATCH_SURGE_THRESHOLD,
} from "../src/lib/game/constants";
import { DIFFICULTY_ORDER } from "../src/lib/game/difficulty";
import {
  CLASSIC_HARBOR_RULES,
  CLASSIC_RULES,
  REVISED_HARBOR_RULES,
  PRE_TUNING_HARBOR_RULES,
  CURRENT_HARBOR_RULES,
  OPEN_HARBOR_RULES,
  REBALANCED_RULES,
  classicHarbor,
  harborTrading,
  openHarbor,
} from "../src/lib/game/expansion";
import {
  buildClassicHarborRules,
  buildCurrentVoyageRules,
  buildOpenHarborRules,
  buildVoyageRules,
} from "../src/lib/game/forecast";
import {
  canProduce,
  productPriceRange,
  voyageRecipe,
} from "../src/lib/game/pools";
import {
  createInitialGameState,
  type GameState,
  type OrderCard,
  type ResourceCard,
} from "../src/lib/game/types";
import {
  finalizeModuleSwap,
  handleModuleSelect,
  selectBoon,
  selectStarterModule,
  startBoonDrafting,
  startModuleDrafting,
  upgradeShip,
} from "../src/lib/game/engine/boons";
import {
  endRound,
  finishSettlement,
  startPhase3,
} from "../src/lib/game/engine/lifecycle";
import {
  applyTidewatchSurge,
  buyWorkshopSupply,
  poolsFor,
  purchaseCard,
  startPhase1,
  quoteWorkshopSupply,
  upcomingBuyer,
} from "../src/lib/game/engine/market";
import {
  claimWordOnTheDocksReward,
  chooseWorkshopContract,
  completeOrder,
  purchaseIntel,
  quoteClearance,
  quoteOrder,
  quotePortExchange,
  sellAtPortExchange,
  sellClearance,
  startPhase2,
} from "../src/lib/game/engine/orders";
import {
  hireEscort,
  quotePirateWaters,
  resolvePirateAttack,
} from "../src/lib/game/engine/pirates";
import {
  getCardFinalCost,
  quoteDues,
  quoteShipUpgrade,
  recipeMaterialCost,
} from "../src/lib/game/engine/pricing";
import {
  assignTask,
  hireWorker,
  quoteRecipe,
} from "../src/lib/game/engine/workers";

import {
  computeHarborPulse,
  tallyPurchasesByResource,
} from "../src/lib/game/harborPulse";

const strategies = [
  "raw",
  "artisan",
  "mixed",
  "arbitrage",
  "information",
  "risk",
  "recovery",
] as const;
type Strategy = (typeof strategies)[number];
const seeds = Number(process.argv[2] ?? 150);
assert.ok(Number.isSafeInteger(seeds) && seeds > 0);
const selectedVersion =
  process.argv[3] === undefined ? undefined : Number(process.argv[3]);
const versions = [
  CLASSIC_RULES,
  REBALANCED_RULES,
  OPEN_HARBOR_RULES,
  CLASSIC_HARBOR_RULES,
  REVISED_HARBOR_RULES,
  PRE_TUNING_HARBOR_RULES,
  CURRENT_HARBOR_RULES,
].filter((version) =>
  selectedVersion === undefined
    ? version !== REBALANCED_RULES
    : version === selectedVersion,
);
assert.ok(
  versions.length,
  "Choose a saved rules version from 1, 3, 4, 5, 6, 7, or 8.",
);

const modern = {
  createInitialGameState,
  startPhase1,
  poolsFor,
  purchaseCard,
  quoteOrder,
  completeOrder,
  purchaseIntel,
  startPhase2,
  startBoonDrafting,
  startModuleDrafting,
  selectBoon,
  upgradeShip,
  handleModuleSelect,
  finalizeModuleSwap,
  startPhase3,
  finishSettlement,
  endRound,
  assignTask,
  hireWorker,
  quotePirateWaters,
  hireEscort,
  resolvePirateAttack,
  getCardFinalCost,
  dueGold: (state: GameState) => quoteDues(state).total,
  upgradeGold: (state: GameState) => quoteShipUpgrade(state).cost,
  nextPulse: (state: GameState) =>
    computeHarborPulse(
      tallyPurchasesByResource(state),
      poolsFor(state).resources,
    ),
  applyTidewatchSurge,
  claimWordOnTheDocksReward,
  surgeThreshold: TIDEWATCH_SURGE_THRESHOLD,
  canProduce,
  voyageRecipe,
  quoteRecipe,
  recipeMaterialCost,
  wages: WAGES,
  materialPrices: COMMODITIES,
  productPriceRange,
};

function loadOriginal(): typeof modern {
  const source = mkdtempSync(join(tmpdir(), "portmasters-original."));
  const commit = "773df1c";
  try {
    const archive = execFileSync("git", ["archive", commit, "src/lib/game"]);
    execFileSync("tar", ["-xf", "-", "-C", source], { input: archive });
    const localRequire = createRequire(
      join(source, "src/lib/game", "types.ts"),
    );
    const core = localRequire("./engine/core.ts");
    const pricing = localRequire("./engine/pricing.ts");
    const market = localRequire("./engine/market.ts");
    const pirates = localRequire("./engine/pirates.ts");
    const pulse = localRequire("./harborPulse.ts");
    const constants = localRequire("./constants.ts");
    return Object.assign(
      {},
      localRequire("./types.ts"),
      ...[
        "market",
        "orders",
        "boons",
        "lifecycle",
        "workers",
        "pirates",
        "pricing",
      ].map((name) => localRequire(`./engine/${name}.ts`)),
      {
        dueGold: (state: GameState) =>
          state.fixedCost +
          core.maintenanceSurcharge(state) +
          Object.keys(state.workers).reduce(
            (total, type) => total + pricing.workerWagesFor(state, type),
            0,
          ),
        upgradeGold: (state: GameState) =>
          state.shipUpgradeCost[state.shipLevel] +
          core.shipUpgradeSurcharge(state),
        quotePirateWaters: (state: GameState) => ({
          ...pirates.quotePirateWaters(state),
          raidLoss: Math.max(0, state.money),
        }),
        nextPulse: (state: GameState) =>
          pulse.computeHarborPulse(market.tallyPurchasesByResource(state)),
        surgeThreshold: constants.TIDEWATCH_SURGE_THRESHOLD,
        canProduce: localRequire("./pools.ts").canProduce,
        voyageRecipe: (item: string) => constants.RECIPES[item],
        quoteRecipe: (_state: GameState, item: string) => ({
          inputs: constants.RECIPES[item].materials,
        }),
        wages: constants.WAGES,
        materialPrices: constants.COMMODITIES,
        productPriceRange: (item: string) => constants.PRODUCT_PRICES[item],
      },
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
  }
}

const original = versions.includes(CLASSIC_RULES) ? loadOriginal() : undefined;
const engineFor = (version: number) =>
  version === CLASSIC_RULES ? original! : modern;

const bump = (target: Record<string, number>, key: string, amount = 1) =>
  (target[key] = (target[key] ?? 0) + amount);
const preferences: Record<Strategy, string[]> = {
  raw: [
    "silk_market_charter",
    "silk_monopoly",
    "brokers_network",
    "merchant_scales",
    "cargo_net",
    "smugglers_hold",
  ],
  artisan: [
    "artisans_workshop",
    "traveling_commission",
    "wage_ledger",
    "signal_lantern",
    "collectors_seal",
  ],
  mixed: ["open_hold", "cargo_net", "convoy_pennant", "bulk_hauler"],
  arbitrage: [
    "smugglers_hold",
    "silk_monopoly",
    "merchant_scales",
    "foreign_quarter_pass",
    "kiln_cellar",
  ],
  information: [
    "brokers_network",
    "signal_lantern",
    "ocean_relay",
    "smugglers_hold",
  ],
  risk: [
    "storm_dividend",
    "storm_shrouds",
    "bonded_warehouse",
    "persian_dome_compass",
    "cargo_net",
  ],
  recovery: [
    "brokers_network",
    "wage_ledger",
    "bonded_warehouse",
    "storm_lantern",
  ],
};

function run(
  difficulty: (typeof DIFFICULTY_ORDER)[number],
  version: number,
  seed: number,
  strategy: Strategy,
  cashShock = strategy === "recovery",
) {
  const random = Math.random;
  Math.random = createRng(`measured harbor ${seed}:legacy actions`);
  try {
    return play(difficulty, version, seed, strategy, cashShock);
  } finally {
    Math.random = random;
  }
}

function rulesFor(
  version: number,
  roomSeed: string,
  difficulty: (typeof DIFFICULTY_ORDER)[number],
  seed: number,
) {
  if (version === CLASSIC_RULES) return;
  if (
    version === CLASSIC_HARBOR_RULES ||
    version === REVISED_HARBOR_RULES ||
    version === PRE_TUNING_HARBOR_RULES
  )
    return buildClassicHarborRules(roomSeed, 1, difficulty, version);
  if (version === CURRENT_HARBOR_RULES)
    return buildCurrentVoyageRules(roomSeed, 1, difficulty);
  if (version === OPEN_HARBOR_RULES)
    return buildOpenHarborRules(roomSeed, 1, difficulty);
  return buildVoyageRules(roomSeed, 1, difficulty, [
    seed % 2 ? "bamboo" : "wax",
    seed % 3 ? "iron" : "lacquer",
    seed % 2 ? "incense" : "lapis",
  ]);
}

function measureOpening(
  difficulty: (typeof DIFFICULTY_ORDER)[number],
  version: number,
  originalTerms?: string[],
) {
  const engine = engineFor(version);
  const outputs = Array.from({ length: seeds }, (_, seed) => {
    const roomSeed = `measured harbor ${seed}`;
    const ctx = { roomSeed, seedBase: `${roomSeed}:captain` };
    const game = engine.createInitialGameState(
      0,
      1,
      1,
      difficulty,
      rulesFor(version, roomSeed, difficulty, seed),
    );
    game.seatSeed = ctx.seedBase;
    engine.startPhase1(game, ctx, []);
    engine.startPhase2(game, ctx, []);
    const choices = game.customerCards.map((order) => {
      const { reward, freight } = engine.quoteOrder(game, order);
      return { net: reward - freight.final, cargo: order.resources };
    });
    function best(
      index: number,
      inventory: GameState["inventory"],
    ): [number, number] {
      const order = choices[index];
      if (!order) return [0, 0];
      const skip = best(index + 1, inventory);
      if (
        order.net <= 0 ||
        order.cargo.some(
          ({ type, required = 0 }) => (inventory[type] ?? 0) < required,
        )
      )
        return skip;
      const after = { ...inventory };
      for (const { type, required = 0 } of order.cargo) after[type] -= required;
      const [gold, count] = best(index + 1, after);
      return gold + order.net > skip[0] ? [gold + order.net, count + 1] : skip;
    }
    const [net, sales] = best(0, game.inventory);
    const terms = JSON.stringify({
      gold: game.money,
      upkeep: game.fixedCost,
      ship: game.shipLevel,
      rounds: game.maxRounds,
      inventory: Object.entries(game.inventory).filter(([, qty]) => qty > 0),
      lots: game.resourceCards.map((lot) => [
        lot.port,
        lot.resources.map(({ type, quantity, price }) => [
          type,
          quantity,
          price,
        ]),
        engine.getCardFinalCost(game, lot),
      ]),
      buyers: game.customerCards.map((order) => {
        const { reward, freight } = engine.quoteOrder(game, order);
        return [
          order.demandPort,
          order.resources,
          order.reward,
          reward,
          freight.final,
        ];
      }),
    });
    if (originalTerms && version >= CLASSIC_HARBOR_RULES) {
      assert.equal(
        terms,
        originalTerms[seed],
        `Opening differs from the original for ${difficulty} seed ${seed}`,
      );
    }
    return {
      net,
      sales,
      terms,
      netLessBaseUpkeep: net - game.fixedCost,
      buyers: choices.length,
    };
  });
  const spread = (key: "net" | "netLessBaseUpkeep" | "sales" | "buyers") => {
    const values = outputs.map((row) => row[key]).sort((a, b) => a - b);
    return [0.1, 0.5, 0.9].map(
      (p) => values[Math.max(0, Math.ceil(seeds * p) - 1)],
    );
  };
  console.log(
    JSON.stringify({
      comparison: "opening starting cargo",
      difficulty,
      version,
      seeds,
      netGoldP10P50P90: spread("net"),
      netLessBaseUpkeepP10P50P90: spread("netLessBaseUpkeep"),
      ordersFilledP10P50P90: spread("sales"),
      buyerCountP10P50P90: spread("buyers"),
      openingsMatchedToOriginal:
        originalTerms && version >= CLASSIC_HARBOR_RULES ? seeds : undefined,
    }),
  );
  const ordered = outputs.map(({ net }) => net).sort((a, b) => a - b);
  const lowerQuartile = ordered[Math.ceil(seeds / 4) - 1];
  return {
    terms: outputs.map((row) => row.terms),
    lowerQuartile,
    poorOpeningSeeds: outputs.flatMap((row, seed) =>
      row.net <= lowerQuartile ? [seed] : [],
    ),
  };
}

function play(
  difficulty: (typeof DIFFICULTY_ORDER)[number],
  version: number,
  seed: number,
  strategy: Strategy,
  cashShock: boolean,
) {
  const {
    createInitialGameState,
    poolsFor,
    purchaseCard,
    quoteOrder,
    completeOrder,
    purchaseIntel,
    startPhase2,
    startBoonDrafting,
    startModuleDrafting,
    selectBoon,
    upgradeShip,
    handleModuleSelect,
    finalizeModuleSwap,
    startPhase3,
    finishSettlement,
    endRound,
    assignTask,
    hireWorker,
    quotePirateWaters,
    hireEscort,
    resolvePirateAttack,
    getCardFinalCost,
    dueGold,
    upgradeGold,
    nextPulse,
    applyTidewatchSurge,
    claimWordOnTheDocksReward,
    surgeThreshold,
    canProduce,
    voyageRecipe,
    quoteRecipe,
    recipeMaterialCost,
    wages,
    materialPrices,
    productPriceRange,
  } = engineFor(version);
  const mid = (item: string, state: GameState) => {
    const [lo, hi] =
      materialPrices[item]?.basePrice ??
      productPriceRange(item, state.rulesVersion);
    return (lo + hi) / 2;
  };
  const roomSeed = `measured harbor ${seed}`;
  const ctx = { roomSeed, seedBase: `${roomSeed}:captain` };
  const game = createInitialGameState(
    0,
    1,
    1,
    difficulty,
    rulesFor(version, roomSeed, difficulty, seed),
  );
  game.seatSeed = ctx.seedBase;
  const sells: Record<string, number> = {},
    effectValues: Record<string, number> = {},
    drafted: Record<string, number> = {};
  const modules = preferences[strategy];
  let shockPaid = 0;
  let cashBeforeShock: number | undefined;
  let recoveredByRoundFive = false;
  let escorts = 0;
  let escortGold = 0;
  let brokerFees = 0;
  let wagesPaid = 0;
  let belowBillsBeforeTrading = 0;
  let lowestCashBeforeTrading = game.money;
  const craft =
    strategy === "artisan" || strategy === "mixed" || strategy === "recovery";
  let shortages = 0,
    liquidity = 0,
    rounds = 0,
    raidLoss = 0,
    raids = 0,
    exchangeNet = 0,
    clearanceNet = 0,
    resaleNet = 0,
    resaleAttempts = 0,
    resaleProfitRounds = 0,
    resaleLotsChecked = 0,
    resaleLotsPositive = 0,
    resaleLotsEven = 0,
    cargoCosts = 0,
    freight = 0,
    orderRevenue = 0,
    crewUnits = 0;
  const accumulatedUnsold: Record<string, number> = {};
  const peakUnsold: Record<string, number> = {};
  const finalRoundStock: Record<string, number> = {};
  let finalInventoryBeforeSales: Record<string, number> = {};
  const chooseModule = () => {
    const choices = game._draftChoices ?? [];
    const desired = modules
      .map((id) => choices.findIndex((module) => module.id === id))
      .find((idx) => idx >= 0);
    return desired ?? (game.equippedModules.length >= game.shipLevel ? -1 : 0);
  };
  const trade = (order: OrderCard, logs: string[]) => {
    const q = quoteOrder(game, order);
    if (
      q.reward <= q.freight.final ||
      !order.resources.every(
        ({ type, required }) => game.inventory[type] >= required!,
      )
    )
      return;
    const income = (state: GameState) => {
      const quote = quoteOrder(state, order);
      return quote.reward - quote.freight.final;
    };
    bump(
      effectValues,
      "quoted Boons",
      income(game) - income({ ...game, modifierFlags: {} }),
    );
    bump(
      effectValues,
      "quoted modules",
      income(game) - income({ ...game, equippedModules: [] }),
    );
    const previousCost = game.totalCosts;
    const previousRevenue = game.totalRevenue;
    completeOrder(game, order.id, logs);
    if (game.completedOrders.includes(order.id)) {
      if (game._pendingDocksClaim) {
        claimWordOnTheDocksReward(game, logs);
        game._pendingDocksClaim = undefined;
      }
      if (game.score >= surgeThreshold) applyTidewatchSurge(game, logs);
      orderRevenue += game.totalRevenue - previousRevenue;
      freight += game.totalCosts - previousCost;
      bump(
        sells,
        order.isMandate
          ? "mandate"
          : order.whisperIndex !== undefined
            ? "broker"
            : (order.buyer ??
              (order.staple
                ? "staple"
                : order.workshop
                  ? "workshop"
                  : order.isProductOrder
                    ? "commission"
                    : "merchant")),
      );
    }
  };
  for (let round = 1; round <= game.maxRounds && !game.gameOver; round++) {
    const logs: string[] = [];
    rounds++;
    if (cashShock && round === 4) {
      cashBeforeShock = game.money;
      shockPaid = Math.max(0, Math.min(35, game.money));
      game.money -= shockPaid;
    }
    const reserve = dueGold(game);
    if (game.money < reserve * 1.5) liquidity++;
    if (round === 1) {
      startBoonDrafting(game, logs);
      if (openHarbor(game))
        selectStarterModule(game, game._draftChoices![chooseModule()].id, logs);
    }
    const priority = [
      "emergency_loan",
      ...(craft
        ? ["artisan_inspiration", "resourceful_crew", "master_apprentice"]
        : []),
      ...(strategy === "information"
        ? ["farsight", "coastal_forecast", "merchants_converge"]
        : []),
      ...(strategy === "risk"
        ? ["safe_anchorage", "deep_sea_escort_pact"]
        : []),
      ...(strategy === "arbitrage"
        ? ["merchant_charm", "hemp_monopoly", "deep_market"]
        : []),
      "buyers_festival",
      "merchant_charm",
      "reliable_buyer",
      "favorable_tides",
    ];
    const boon =
      priority
        .map((id) => game.boonChoices.find((choice) => choice.id === id))
        .find(Boolean) ?? game.boonChoices[0];
    selectBoon(game, ctx, boon.id, logs);
    bump(drafted, boon.id);
    bump(effectValues, "quoted Boons", boon.modifiers.instant_gold ?? 0);

    const initialStock = { ...game.inventory };
    const current = poolsFor(game);
    const advertisedProducts = new Set(
      (version === CLASSIC_RULES
        ? []
        : [
            upcomingBuyer(game, ctx, round + 1),
            ...(game.equippedModules.some(({ id }) => id === "signal_lantern")
              ? [upcomingBuyer(game, ctx, round + 1, true)]
              : []),
          ]
      ).flatMap((order) => order?.resources.map(({ type }) => type) ?? []),
    );
    const candidates = current.products.filter(
      (item) =>
        !["mixed", "recovery"].includes(strategy) ||
        [
          "Linen Clothes",
          "Cotton Clothes",
          "Brocade",
          "Sachet",
          "Bronze Mirror",
          "Indigo Sailcloth",
          "Bamboo Mat",
        ].includes(item),
    );
    let recipe: string | undefined;
    if (craft && round < game.maxRounds) {
      const rank = (item: string) => {
        const worker = voyageRecipe(item, game.rulesVersion)
          .worker_type as keyof GameState["workers"];
        const crew = Object.entries(game.workers).some(
          ([job, list]) => list.length && canProduce(job, item),
        );
        const missing = Object.entries(quoteRecipe(game, item).inputs).reduce(
          (sum, [good, qty]) =>
            sum + mid(good, game) * Math.max(0, qty - game.inventory[good]),
          0,
        );
        return (
          (advertisedProducts.has(item) ? 42 : 0) +
          (crew ? 18 : 0) -
          missing -
          game.inventory[item] * 26 +
          (mid(item, game) -
            recipeMaterialCost(item, game.rulesVersion) -
            wages[worker]) *
            0.25
        );
      };
      recipe = candidates.sort((a, b) => rank(b) - rank(a))[0];
    }
    if (
      ["information", "raw", "risk", "artisan", "recovery"].includes(
        strategy,
      ) &&
      game.money > reserve + (strategy === "information" ? 15 : 10) &&
      (!classicHarbor(game) ||
        (strategy === "information" && game.money > reserve * 3) ||
        !game.scoutedOrders?.some((order) =>
          order.resources.every(
            ({ type, required = 0 }) =>
              game.inventory[type] >= required ||
              game.resourceCards.some((lot) =>
                lot.resources.some(
                  (entry) =>
                    entry.type === type &&
                    game.inventory[type] + (entry.quantity ?? 0) >= required,
                ),
              ),
          ),
        ))
    ) {
      const held = current.resources
        .filter((item) => game.inventory[item] >= 2)
        .concat(current.products.filter((item) => game.inventory[item] > 0));
      const tip = held.sort(
        (a, b) =>
          mid(b, game) *
            (b in materialPrices ? Math.min(4, game.inventory[b]) : 1) -
          mid(a, game) *
            (a in materialPrices ? Math.min(4, game.inventory[a]) : 1),
      )[0];
      const cash = game.money;
      purchaseIntel(game, logs, tip);
      brokerFees += cash - game.money;
    }
    const requirements = recipe ? quoteRecipe(game, recipe).inputs : {};
    const known = [
      ...game.revealedIntel.flatMap(
        ({ item, cargo, quantity = 2, reward = 0 }) =>
          cargo
            ? cargo.map(({ type, required }) => ({
                item: type,
                quantity: required ?? 0,
                reward: reward / cargo.length,
              }))
            : [{ item, quantity, reward }],
      ),
      ...(game.scoutedOrders ?? []).flatMap((order) =>
        order.resources.map(({ type, required }) => ({
          item: type,
          quantity: required!,
          reward: order.reward / order.resources.length,
        })),
      ),
    ];
    const budget = Math.max(
      0,
      game.money - (reserve + (craft && round > 1 ? 5 : 0)),
    );
    let spent = 0;
    const immediateResale = (card: ResourceCard) =>
      card.resources.reduce(
        (sum, { type, quantity = 0 }) =>
          sum +
          (quotePortExchange(
            { ...game, phase: 2, inventory: { [type]: quantity } },
            type,
            quantity,
          )?.net ?? 0),
        0,
      ) - getCardFinalCost(game, card);
    if (strategy === "arbitrage" && harborTrading(game)) {
      for (const card of game.resourceCards) {
        const net = immediateResale(card);
        resaleLotsChecked++;
        if (net > 0) resaleLotsPositive++;
        if (net === 0) resaleLotsEven++;
      }
    }
    const scoreLot = (card: ResourceCard) => {
      const cost = getCardFinalCost(game, card);
      if (strategy === "arbitrage")
        return harborTrading(game) ? immediateResale(card) : -cost;
      const utility = card.resources.reduce(
        (sum, { type, quantity: qty = 0 }) => {
          const held = game.inventory[type] ?? 0;
          const coverage = Math.min(
            qty,
            Math.max(0, (requirements[type] ?? 0) - held),
          );
          const prepared = known.find((entry) => entry.item === type);
          const knownUnits = prepared
            ? Math.min(qty, Math.max(0, prepared.quantity - held))
            : 0;
          const target =
            type in materialPrices
              ? strategy === "mixed"
                ? held > 0
                  ? 2
                  : 3
                : strategy === "raw"
                  ? 3
                  : 2
              : 0;
          const desiredUnits = Math.min(qty, Math.max(0, target - held));
          return (
            sum +
            mid(type, game) * Math.max(coverage * 1.65, desiredUnits * 1.15) +
            (prepared && knownUnits
              ? ((knownUnits * prepared.reward) / prepared.quantity) * 0.8
              : 0)
          );
        },
        0,
      );
      return (
        utility -
        cost +
        (card.staple && game.inventory[card.resources[0].type] < 4 ? 8 : 0)
      );
    };
    const remaining = [...game.resourceCards];
    if (harborTrading(game) && !recipe && strategy !== "arbitrage") {
      const leads = [
        ...(game.scoutedOrders ?? []),
        ...game.revealedIntel.flatMap((tip, index): OrderCard[] => {
          const cargo =
            tip.cargo ??
            (tip.quantity ? [{ type: tip.item, required: tip.quantity }] : []);
          if (!cargo.length || tip.reward === undefined) return [];
          return [
            {
              id: tip.orderId ?? 200 + index,
              whisperIndex: index,
              resources: cargo,
              totalItems: cargo.reduce(
                (sum, { required = 0 }) => sum + required,
                0,
              ),
              isProductOrder: cargo.some(
                ({ type }) => !(type in materialPrices),
              ),
              demandPort: tip.port,
              reward: tip.reward,
            },
          ];
        }),
      ];
      let best: { value: number; cards: ResourceCard[] } | undefined;
      for (const lead of leads) {
        if (
          lead.resources.every(
            ({ type, required = 0 }) => game.inventory[type] >= required,
          )
        )
          continue;
        const lotOptions = remaining.filter((lot) =>
          lot.resources.some(({ type }) =>
            lead.resources.some(
              (item) =>
                item.type === type &&
                game.inventory[type] < (item.required ?? 0),
            ),
          ),
        );
        for (const [index, first] of lotOptions.entries()) {
          for (const second of [undefined, ...lotOptions.slice(index + 1)]) {
            const cards = second ? [first, second] : [first];
            const cost = cards.reduce(
              (sum, card) => sum + getCardFinalCost(game, card),
              0,
            );
            if (cost > game.money) continue;
            if (
              !lead.resources.every(
                ({ type, required = 0 }) =>
                  game.inventory[type] +
                    cards.reduce(
                      (sum, card) =>
                        sum +
                        (card.resources.find((item) => item.type === type)
                          ?.quantity ?? 0),
                      0,
                    ) >=
                  required,
              )
            )
              continue;
            const quote = quoteOrder(game, lead);
            const net = quote.reward - quote.freight.final;
            const value = net - cost;
            if (value <= 0 || game.money + value < reserve + 4) continue;
            if (!best || value > best.value) best = { value, cards };
          }
        }
      }
      for (const card of best?.cards ?? []) {
        const cost = getCardFinalCost(game, card);
        purchaseCard(game, card.id, logs);
        spent += cost;
        cargoCosts += cost;
        remaining.splice(remaining.indexOf(card), 1);
      }
    }
    while (remaining.length) {
      remaining.sort((a, b) => scoreLot(b) - scoreLot(a));
      const lot = remaining.shift()!;
      const cost = getCardFinalCost(game, lot);
      if (scoreLot(lot) <= 0 || cost + spent > budget || cost > game.money)
        continue;
      bump(
        effectValues,
        "quoted Boons",
        getCardFinalCost({ ...game, modifierFlags: {} }, lot) - cost,
      );
      bump(
        effectValues,
        "quoted modules",
        getCardFinalCost({ ...game, equippedModules: [] }, lot) - cost,
      );
      purchaseCard(game, lot.id, logs);
      spent += cost;
      cargoCosts += cost;
    }
    if (recipe) {
      const supply = quoteWorkshopSupply(game, recipe);
      if (supply && getCardFinalCost(game, supply) + spent <= budget) {
        const previous = game.money;
        buyWorkshopSupply(game, recipe, logs);
        cargoCosts += previous - game.money;
      }
      game.phase = "worker_mgmt";
      const type = voyageRecipe(recipe, game.rulesVersion)
        .worker_type as keyof GameState["workers"];
      const job = Object.entries(game.workers).find(
        ([id, list]) => list.length && canProduce(id, recipe),
      )?.[0] as typeof type | undefined;
      const ready = Object.entries(quoteRecipe(game, recipe).inputs).every(
        ([item, amount]) => game.inventory[item] >= amount,
      );
      if (!ready) shortages++;
      else if (
        job ||
        Object.values(game.workers).flat().length <
          (strategy === "artisan" ? 2 : 1)
      ) {
        if (!job) hireWorker(game, type, logs);
        if (game.workers[job ?? type].length) {
          assignTask(game, job ?? type, recipe, logs);
          if (version === REBALANCED_RULES)
            chooseWorkshopContract(game, recipe, 1, logs);
        }
      }
    }
    if (game.money < dueGold(game)) belowBillsBeforeTrading++;
    lowestCashBeforeTrading = Math.min(lowestCashBeforeTrading, game.money);
    startPhase2(game, ctx, logs);
    if (round === game.maxRounds)
      finalInventoryBeforeSales = { ...game.inventory };
    const orders = game.customerCards.slice().sort((a, b) => {
      if (
        game.modifierFlags.market_momentum &&
        a.isProductOrder !== b.isProductOrder
      )
        return Number(a.isProductOrder) - Number(b.isProductOrder);
      return (
        (quoteOrder(game, b).reward - quoteOrder(game, b).freight.final) /
          b.totalItems -
        (quoteOrder(game, a).reward - quoteOrder(game, a).freight.final) /
          a.totalItems
      );
    });
    if (strategy === "arbitrage" && harborTrading(game)) {
      const resaleBefore = resaleNet;
      for (const item of [...RESOURCES, ...PRODUCTS]) {
        const amount = game.inventory[item] - initialStock[item];
        const quote = quotePortExchange(game, item, amount);
        if (quote && sellAtPortExchange(game, quote, logs)) {
          resaleNet += quote.net;
          exchangeNet += quote.net;
          bump(sells, "exchange");
        }
      }
      resaleNet -= spent;
      if (spent > 0) {
        resaleAttempts++;
        if (resaleNet > resaleBefore) resaleProfitRounds++;
      }
    }
    for (const order of orders) trade(order, logs);
    for (const product of PRODUCTS) {
      const held = game.inventory[product];
      if (!held || held <= 0) continue;
      bump(accumulatedUnsold, product, held);
      if (round === game.maxRounds) finalRoundStock[product] = held;
      peakUnsold[product] = Math.max(peakUnsold[product] ?? 0, held);
    }
    if (harborTrading(game)) {
      const target = dueGold(game) * (strategy === "recovery" ? 2.7 : 1.4);
      const goods = [...PRODUCTS, ...RESOURCES]
        .filter((item) => game.inventory[item] > 0)
        .sort((a, b) => mid(b, game) - mid(a, game));
      for (const item of goods) {
        const held = game.inventory[item];
        const surplus =
          item in materialPrices
            ? Math.max(0, held - 4)
            : Math.max(0, held - 1);
        const amount =
          game.money < target ? Math.max(surplus, Math.min(held, 2)) : surplus;
        const quote = quotePortExchange(game, item, amount);
        if (quote && sellAtPortExchange(game, quote, logs)) {
          exchangeNet += quote.net;
          bump(sells, "exchange");
        }
      }
    } else if (version === REBALANCED_RULES) {
      const item = current.products.find(
        (good) =>
          game.inventory[good] > 0 &&
          (game.money < reserve * 2 ||
            game.inventory[good] > 2 ||
            round === game.maxRounds),
      );
      if (item && quoteClearance(game, item, 1)) {
        const cash = game.money;
        sellClearance(game, item, Math.min(2, game.inventory[item]), logs);
        clearanceNet += game.money - cash;
        bump(sells, "clearance");
      }
    }
    const beforeProduction = PRODUCTS.reduce(
      (sum, item) => sum + (game.inventory[item] ?? 0),
      0,
    );
    startPhase3(game, logs);
    crewUnits +=
      PRODUCTS.reduce((sum, item) => sum + (game.inventory[item] ?? 0), 0) -
      beforeProduction;
    const risk = quotePirateWaters(game);
    if (
      strategy !== "risk" &&
      risk.escortCost <= risk.raidLoss * risk.chance * 1.25
    ) {
      const before = game.money;
      hireEscort(game, logs);
      escorts++;
      escortGold += before - game.money;
    } else {
      const cash = game.money;
      resolvePirateAttack(game, logs);
      if (cash > game.money) raids++;
      raidLoss += cash - game.money;
    }
    finishSettlement(game, logs);
    wagesPaid += game.workerWages;
    if (game.gameOver) break;
    if (round < game.maxRounds) {
      if (
        game.shipLevel < 3 &&
        game.money >
          upgradeGold(game) + reserve * (strategy === "recovery" ? 4 : 2.5)
      )
        upgradeShip(game, logs);
      if (game.shipLevel > 0) startModuleDrafting(game);
      const index = chooseModule();
      if (index >= 0 && game.phase === "module_draft") {
        handleModuleSelect(game, index, logs);
        if ((game.phase as GameState["phase"]) === "module_swap") {
          const weak = (id: string) =>
            modules.includes(id) ? modules.indexOf(id) : modules.length;
          const victim = game.equippedModules.reduce(
            (worst, mod, idx) =>
              weak(mod.id) > weak(game.equippedModules[worst].id) ? idx : worst,
            0,
          );
          if (weak(game._newModule!.id) < weak(game.equippedModules[victim].id))
            finalizeModuleSwap(game, victim, logs);
        }
      }
    }
    const pulse = nextPulse(game);
    endRound(game, logs);
    game.harborPulse = pulse;
    if (round === 5 && cashBeforeShock !== undefined)
      recoveredByRoundFive =
        game.money >= Math.max(cashBeforeShock, dueGold(game));
  }
  return {
    game,
    sells,
    effectValues,
    drafted,
    shortages,
    shockPaid,
    cashBeforeShock,
    recoveredByRoundFive,
    escorts,
    escortGold,
    brokerFees,
    wagesPaid,
    belowBillsBeforeTrading,
    lowestCashBeforeTrading,
    liquidity,
    rounds,
    raidLoss,
    raids,
    exchangeNet,
    clearanceNet,
    resaleNet,
    resaleAttempts,
    resaleProfitRounds,
    resaleLotsChecked,
    resaleLotsPositive,
    resaleLotsEven,
    cargoCosts,
    freight,
    orderRevenue,
    crewUnits,
    accumulatedUnsold,
    peakUnsold,
    finalRoundStock,
    finalInventoryBeforeSales,
  };
}

for (const difficulty of DIFFICULTY_ORDER) {
  let originalOpening: string[] | undefined;
  for (const version of versions) {
    const opening = measureOpening(difficulty, version, originalOpening);
    if (version === CLASSIC_RULES) originalOpening = opening.terms;
    const groups = new Map(
      strategies.map((strategy) => [strategy, [] as ReturnType<typeof run>[]]),
    );
    const unshockedRecovery: ReturnType<typeof run>[] = [];
    const soloTopScores: Record<string, number> = {};
    for (let seed = 0; seed < seeds; seed++) {
      const outcomes = strategies.map((strategy) => ({
        strategy,
        result: run(difficulty, version, seed, strategy),
      }));
      for (const { strategy, result } of outcomes)
        groups.get(strategy)!.push(result);
      unshockedRecovery.push(run(difficulty, version, seed, "recovery", false));
      const solvent = outcomes.filter(
        ({ result }) => result.game.phase === "endgame",
      );
      const best = Math.max(...solvent.map(({ result }) => result.game.score));
      const winners = solvent.filter(
        ({ result }) => result.game.score === best,
      );
      for (const { strategy } of winners)
        bump(soloTopScores, strategy, 1 / winners.length);
    }
    for (const [strategy, results] of groups) {
      const avg = (value: (result: ReturnType<typeof run>) => number) =>
        Math.round(
          (results.reduce((sum, result) => sum + value(result), 0) / seeds) *
            100,
        ) / 100;
      const margin = (r: ReturnType<typeof run>) =>
        r.orderRevenue -
        r.freight +
        r.exchangeNet +
        r.clearanceNet -
        r.cargoCosts;
      const median = (
        value: (result: ReturnType<typeof run>) => number,
        sample = results,
      ) => {
        const sorted = sample.map(value).sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2;
      };
      const sumMap = (
        read: (result: ReturnType<typeof run>) => Record<string, number>,
      ) => {
        const total: Record<string, number> = {};
        for (const result of results)
          for (const [key, value] of Object.entries(read(result)))
            bump(total, key, value);
        return total;
      };
      const builds = new Map<string, typeof results>();
      for (const result of results) {
        const key =
          result.game.equippedModules
            .map(({ id }) => id)
            .sort()
            .join(", ") || "no modules";
        const sample = builds.get(key);
        if (sample) sample.push(result);
        else builds.set(key, [result]);
      }
      const remaining = Object.fromEntries(
        PRODUCTS.map((item) => [
          item,
          avg(({ game }) => game.inventory[item] ?? 0),
        ]).filter(([, qty]) => Number(qty) > 0),
      );
      const reachedFinalTrade = results.filter(
        ({ rounds, game }) => rounds === game.maxRounds,
      );
      const meanFinalStock = (
        read: (result: ReturnType<typeof run>) => Record<string, number>,
      ) => {
        const totals: Record<string, number> = {};
        for (const result of reachedFinalTrade)
          for (const [item, amount] of Object.entries(read(result)))
            if (amount > 0) bump(totals, item, amount);
        return Object.fromEntries(
          Object.entries(totals).map(([item, total]) => [
            item,
            Math.round((100 * total) / reachedFinalTrade.length) / 100,
          ]),
        );
      };
      const exposed = results.filter(
        (result) => result.cashBeforeShock !== undefined,
      );
      const solvent = results.filter(
        ({ game }) => game.phase === "endgame",
      ).length;
      const recovery =
        strategy === "recovery"
          ? {
              fixedShockGold: 35,
              reachedShock: exposed.length,
              paidFullShock: exposed.filter(({ shockPaid }) => shockPaid === 35)
                .length,
              regainedCashAndOneBillByEndOfRoundFive: exposed.filter(
                ({ recoveredByRoundFive }) => recoveredByRoundFive,
              ).length,
              solventWithShock: solvent,
              solventWithoutShock: unshockedRecovery.filter(
                ({ game }) => game.phase === "endgame",
              ).length,
              naturalPoorOpening: {
                startingSaleGoldAtMost: opening.lowerQuartile,
                voyages: opening.poorOpeningSeeds.length,
                solventWithoutShock: opening.poorOpeningSeeds.filter(
                  (seed) => unshockedRecovery[seed].game.phase === "endgame",
                ).length,
              },
            }
          : undefined;
      console.log(
        JSON.stringify({
          difficulty,
          version,
          strategy,
          seeds,
          solvent,
          finish: avg(({ game }) => Number(game.phase === "endgame")),
          score: avg(({ game }) => game.score),
          gold: avg(({ game }) => game.money),
          soloTopScores: soloTopScores[strategy] ?? 0,
          shortages: avg((r) => r.shortages),
          lowLiquidity: avg((r) => r.liquidity),
          roundsBelowBillsBeforeTrading: avg((r) => r.belowBillsBeforeTrading),
          medianLowestCashBeforeTrading: median(
            (r) => r.lowestCashBeforeTrading,
          ),
          rounds: avg((r) => r.rounds),
          raidLoss: avg((r) => r.raidLoss),
          raids: avg((r) => r.raids),
          escorts: avg((r) => r.escorts),
          escortGold: avg((r) => r.escortGold),
          brokerFees: avg((r) => r.brokerFees),
          recovery,
          exchangeNet: avg((r) => r.exchangeNet),
          resaleNet: avg((r) => r.resaleNet),
          resaleAttempts: avg((r) => r.resaleAttempts),
          resaleProfitRounds: avg((r) => r.resaleProfitRounds),
          resaleLotsChecked: results.reduce(
            (sum, result) => sum + result.resaleLotsChecked,
            0,
          ),
          resaleLotsPositive: results.reduce(
            (sum, result) => sum + result.resaleLotsPositive,
            0,
          ),
          resaleLotsEven: results.reduce(
            (sum, result) => sum + result.resaleLotsEven,
            0,
          ),
          cargoCosts: avg((r) => r.cargoCosts),
          freightAndAudits: avg((r) => r.freight),
          tradingCashMargin: avg(margin),
          medianTradingCashMargin: median(margin),
          wagesPaid: avg((r) => r.wagesPaid),
          medianMarginAfterWages: median((r) => margin(r) - r.wagesPaid),
          crewUnits: avg((r) => r.crewUnits),
          distinctBuilds: builds.size,
          commonBuilds: [...builds]
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 3)
            .map(([modules, sample]) => ({
              modules,
              voyages: sample.length,
              solvent: sample.filter(({ game }) => game.phase === "endgame")
                .length,
              medianMarginAfterWages: median(
                (r) => margin(r) - r.wagesPaid,
                sample,
              ),
            })),
          sales: sumMap((r) => r.sells),
          effects: sumMap((r) => r.effectValues),
          boonPicks: sumMap((r) => r.drafted),
          remaining,
          reachedFinalTrade: reachedFinalTrade.length,
          finalInventoryBeforeSales: meanFinalStock(
            (r) => r.finalInventoryBeforeSales,
          ),
          finalProductStockBeforeFallback: meanFinalStock(
            (r) => r.finalRoundStock,
          ),
          unsoldBeforeFallback: sumMap((r) => r.accumulatedUnsold),
          peakUnsold: Object.fromEntries(
            PRODUCTS.flatMap((item) => {
              const peak = Math.max(
                ...results.map((result) => result.peakUnsold[item] ?? 0),
              );
              return peak > 0 ? [[item, peak]] : [];
            }),
          ),
        }),
      );
    }
  }
}
