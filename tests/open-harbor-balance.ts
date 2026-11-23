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
} from "../src/lib/game/constants";
import { DIFFICULTY_ORDER } from "../src/lib/game/difficulty";
import {
  CLASSIC_HARBOR_RULES,
  CLASSIC_RULES,
  OPEN_HARBOR_RULES,
  REBALANCED_RULES,
  harborTrading,
  openHarbor,
} from "../src/lib/game/expansion";
import {
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
  buyWorkshopSupply,
  poolsFor,
  purchaseCard,
  startPhase1,
  quoteWorkshopSupply,
  upcomingBuyer,
} from "../src/lib/game/engine/market";
import {
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
].filter((version) =>
  selectedVersion === undefined
    ? version !== REBALANCED_RULES
    : version === selectedVersion,
);
assert.ok(versions.length, "Choose a saved rules version from 1, 3, 4, or 5.");

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
    return Object.assign(
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
const mid = (item: string, game: GameState) => {
  const [lo, hi] =
    COMMODITIES[item]?.basePrice ?? productPriceRange(item, game.rulesVersion);
  return (lo + hi) / 2;
};
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
) {
  const random = Math.random;
  Math.random = createRng(`measured harbor ${seed}:legacy actions`);
  try {
    return play(difficulty, version, seed, strategy);
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
  if (version === CLASSIC_HARBOR_RULES)
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
    return {
      net,
      sales,
      netAfterBills: net - game.fixedCost,
      buyers: choices.length,
    };
  });
  const spread = (key: keyof (typeof outputs)[number]) => {
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
      netAfterBillsP10P50P90: spread("netAfterBills"),
      ordersFilledP10P50P90: spread("sales"),
      buyerCountP10P50P90: spread("buyers"),
    }),
  );
}

function play(
  difficulty: (typeof DIFFICULTY_ORDER)[number],
  version: number,
  seed: number,
  strategy: Strategy,
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
  } = engineFor(version);
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
  const craft =
    strategy === "artisan" || strategy === "mixed" || strategy === "recovery";
  let shortages = 0,
    liquidity = 0,
    rounds = 0,
    raidLoss = 0,
    raids = 0,
    exchangeNet = 0,
    resaleNet = 0,
    resaleAttempts = 0,
    resaleProfitRounds = 0,
    resaleLotsChecked = 0,
    resaleLotsPositive = 0,
    cargoCosts = 0,
    freight = 0,
    orderRevenue = 0,
    crewUnits = 0;
  const accumulatedUnsold: Record<string, number> = {};
  const peakUnsold: Record<string, number> = {};
  const finalRoundStock: Record<string, number> = {};
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
    if (strategy === "recovery" && round === 4)
      game.money = Math.floor(game.money * 0.55);
    const reserve = quoteDues(game).total;
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
    const desired = upcomingBuyer(game, ctx, round + 1, openHarbor(game))
      ?.resources[0]?.type;
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
          (desired === item ? 42 : 0) +
          (crew ? 18 : 0) -
          missing -
          game.inventory[item] * 26 +
          (mid(item, game) -
            recipeMaterialCost(item, game.rulesVersion) -
            WAGES[worker]) *
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
      (version !== CLASSIC_HARBOR_RULES ||
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
            (b in COMMODITIES ? Math.min(4, game.inventory[b]) : 1) -
          mid(a, game) *
            (a in COMMODITIES ? Math.min(4, game.inventory[a]) : 1),
      )[0];
      purchaseIntel(game, logs, tip);
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
      resaleLotsChecked += game.resourceCards.length;
      resaleLotsPositive += game.resourceCards.filter(
        (card) => immediateResale(card) > 0,
      ).length;
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
            type in COMMODITIES
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
    if (
      version === CLASSIC_HARBOR_RULES &&
      !recipe &&
      strategy !== "arbitrage"
    ) {
      const revealed = new Set(
        game.revealedIntel.map(({ orderId }) => orderId),
      );
      const leads = [
        ...(game.scoutedOrders ?? []),
        ...(game.plannedOrders ?? []).filter(({ id }) => revealed.has(id)),
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
    startPhase2(game, ctx, logs);
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
      const target =
        quoteDues(game).total * (strategy === "recovery" ? 2.7 : 1.4);
      const goods = [...PRODUCTS, ...RESOURCES]
        .filter((item) => game.inventory[item] > 0)
        .sort((a, b) => mid(b, game) - mid(a, game));
      for (const item of goods) {
        const held = game.inventory[item];
        const surplus =
          item in COMMODITIES ? Math.max(0, held - 4) : Math.max(0, held - 1);
        const amount =
          game.money < target ? Math.max(surplus, Math.min(held, 2)) : surplus;
        const quote = quotePortExchange(game, item, amount);
        if (quote && sellAtPortExchange(game, quote, logs)) {
          exchangeNet += quote.net;
          bump(sells, "exchange");
        }
      }
    } else {
      const item = current.products.find(
        (good) =>
          game.inventory[good] > 0 &&
          (game.money < reserve * 2 ||
            game.inventory[good] > 2 ||
            round === game.maxRounds),
      );
      if (item && quoteClearance(game, item, 1)) {
        sellClearance(game, item, Math.min(2, game.inventory[item]), logs);
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
    )
      hireEscort(game, logs);
    else {
      const cash = game.money;
      resolvePirateAttack(game, logs);
      if (cash > game.money) raids++;
      raidLoss += cash - game.money;
    }
    finishSettlement(game, logs);
    if (game.gameOver) break;
    if (round < game.maxRounds) {
      if (
        game.shipLevel < 3 &&
        game.money >
          quoteShipUpgrade(game).cost +
            reserve * (strategy === "recovery" ? 4 : 2.5)
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
    endRound(game, logs);
  }
  return {
    game,
    sells,
    effectValues,
    drafted,
    shortages,
    liquidity,
    rounds,
    raidLoss,
    raids,
    exchangeNet,
    resaleNet,
    resaleAttempts,
    resaleProfitRounds,
    resaleLotsChecked,
    resaleLotsPositive,
    cargoCosts,
    freight,
    orderRevenue,
    crewUnits,
    accumulatedUnsold,
    peakUnsold,
    finalRoundStock,
  };
}

for (const difficulty of DIFFICULTY_ORDER) {
  for (const version of versions) {
    measureOpening(difficulty, version);
    const groups = new Map(
      strategies.map((strategy) => [strategy, [] as ReturnType<typeof run>[]]),
    );
    const soloTopScores: Record<string, number> = {};
    for (let seed = 0; seed < seeds; seed++) {
      const outcomes = strategies.map((strategy) => ({
        strategy,
        result: run(difficulty, version, seed, strategy),
      }));
      for (const { strategy, result } of outcomes)
        groups.get(strategy)!.push(result);
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
      const sumMap = (
        read: (result: ReturnType<typeof run>) => Record<string, number>,
      ) => {
        const total: Record<string, number> = {};
        for (const result of results)
          for (const [key, value] of Object.entries(read(result)))
            bump(total, key, value);
        return total;
      };
      const builds: Record<string, number> = {};
      for (const { game } of results)
        bump(
          builds,
          game.equippedModules
            .map(({ id }) => id)
            .sort()
            .join(", ") || "no modules",
        );
      const remaining = Object.fromEntries(
        PRODUCTS.map((item) => [
          item,
          avg(({ game }) => game.inventory[item] ?? 0),
        ]).filter(([, qty]) => Number(qty) > 0),
      );
      const reachedFinalTrade = results.filter(
        ({ rounds, game }) => rounds === game.maxRounds,
      );
      const finalRoundStockBeforeExchange = Object.fromEntries(
        PRODUCTS.flatMap((item) => {
          const total = reachedFinalTrade.reduce(
            (sum, result) => sum + (result.finalRoundStock[item] ?? 0),
            0,
          );
          return total > 0
            ? [
                [
                  item,
                  Math.round((total / reachedFinalTrade.length) * 100) / 100,
                ],
              ]
            : [];
        }),
      );
      console.log(
        JSON.stringify({
          difficulty,
          version,
          strategy,
          seeds,
          finish: avg(({ game }) => Number(game.phase === "endgame")),
          score: avg(({ game }) => game.score),
          gold: avg(({ game }) => game.money),
          soloTopScores: soloTopScores[strategy] ?? 0,
          shortages: avg((r) => r.shortages),
          lowLiquidity: avg((r) => r.liquidity),
          rounds: avg((r) => r.rounds),
          raidLoss: avg((r) => r.raidLoss),
          raids: avg((r) => r.raids),
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
          cargoCosts: avg((r) => r.cargoCosts),
          freightAndAudits: avg((r) => r.freight),
          tradingCashMargin: avg(
            (r) => r.orderRevenue - r.freight + r.exchangeNet - r.cargoCosts,
          ),
          crewUnits: avg((r) => r.crewUnits),
          distinctBuilds: Object.keys(builds).length,
          commonBuilds: Object.entries(builds)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3),
          sales: sumMap((r) => r.sells),
          effects: sumMap((r) => r.effectValues),
          remaining,
          reachedFinalTrade: reachedFinalTrade.length,
          finalRoundStockBeforeExchange,
          unsoldBeforeExchange: sumMap((r) => r.accumulatedUnsold),
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
