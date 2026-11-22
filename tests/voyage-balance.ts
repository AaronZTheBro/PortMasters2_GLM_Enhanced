import assert from "node:assert/strict";
import { PRODUCTS } from "../src/lib/game/constants";
import { DIFFICULTY_ORDER } from "../src/lib/game/difficulty";
import { voyageRecipe } from "../src/lib/game/pools";
import { EXPANDED_RULES } from "../src/lib/game/expansion";
import { buildForecasts, buildVoyageRules } from "../src/lib/game/forecast";
import {
  createInitialGameState,
  type GameState,
  type ResourceCard,
  type OrderCard,
} from "../src/lib/game/types";
import {
  handleModuleSelect,
  selectBoon,
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
  chooseStaple,
  purchaseCard,
  quoteWorkshopSupply,
} from "../src/lib/game/engine/market";
import {
  chooseWorkshopContract,
  quoteClearance,
  sellClearance,
  completeOrder,
  purchaseIntel,
  quoteOrder,
  startPhase2,
} from "../src/lib/game/engine/orders";
import { getCardFinalCost, quoteDues } from "../src/lib/game/engine/pricing";
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

const strategies = [
  "reference",
  "conservative",
  "artisan",
  "aggressive",
] as const;
const extraStrategies = ["mixed", "recovery"] as const;
const advanced = process.argv[4] === "advanced";
const activeStrategies = advanced ? extraStrategies : strategies;
const seeds = Number(process.argv[2] ?? 5000);
const revised = process.argv[3] === "rebalanced";
assert.ok(Number.isInteger(seeds) && seeds > 0);

function netQuote(game: GameState, order: OrderCard) {
  const quote = quoteOrder(game, order);
  return quote.reward - quote.freight.final;
}

function completedVoyage(game: GameState) {
  return game.phase === "endgame";
}

for (const difficulty of DIFFICULTY_ORDER) {
  const rates = Object.fromEntries(
    activeStrategies.map((strategy) => [
      strategy,
      {
        voyages: 0,
        finished: 0,
        bankruptcyRound: 0,
        contracts: 0,
        shortages: 0,
        surplus: 0,
        gold: 0,
        clearance: 0,
        produced: 0,
        roundCount: 0,
        netTrade: 0,
        missedBuyers: 0,
        lowLiquidity: 0,
        quotedBoonGold: 0,
        quotedModuleGold: 0,
        tradingProfitAfterIncomeTax: 0,
        surplusByProduct: {} as Record<string, number>,
      },
    ]),
  );
  let openings = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const strategy = activeStrategies[seed % activeStrategies.length];
    const result = rates[strategy];
    const roomSeed = `balance ${seed}`;
    const stockItem = advanced
      ? ["Cotton Clothes", "Brocade", "Sachet"][seed % 3]
      : "Linen Clothes";
    const ctx = { roomSeed, seedBase: `${roomSeed}:0` };
    const rules = revised
      ? buildVoyageRules(roomSeed, 1, difficulty, [
          seed % 2 ? "wax" : "bamboo",
          seed % 3 ? "iron" : "lacquer",
          seed % 5 ? "incense" : "lapis",
        ])
      : {
          version: EXPANDED_RULES,
          forecasts: buildForecasts(roomSeed, 1, difficulty),
        };
    const game = createInitialGameState(0, 1, 1, difficulty, rules);
    game.seatSeed = ctx.seedBase;
    const measure = (value: (state: GameState) => number) => {
      const current = value(game);
      if (game.lastBoonId)
        result.quotedBoonGold +=
          current - value({ ...game, modifierFlags: {} });
      if (game.equippedModules.length)
        result.quotedModuleGold +=
          current - value({ ...game, equippedModules: [] });
    };
    const measurePurchase = (card: ResourceCard) =>
      measure((state) => -getCardFinalCost(state, card));
    const measureEnd = () => {
      result.surplus += game.inventory[stockItem];
      result.tradingProfitAfterIncomeTax +=
        game.totalRevenue - game.totalCosts - game.incomeTaxPaid;
      for (const item of PRODUCTS) {
        const held = game.inventory[item];
        if (held > 0)
          result.surplusByProduct[item] =
            (result.surplusByProduct[item] ?? 0) + held;
      }
    };
    result.voyages++;
    for (let round = 1; round <= game.maxRounds; round++) {
      const logs: string[] = [];
      result.roundCount++;
      if (strategy === "recovery" && round === 4)
        game.money = Math.floor(game.money * 0.65);
      const makesGoods =
        strategy === "artisan" ||
        strategy === "mixed" ||
        strategy === "recovery";
      const product = stockItem;
      const tradeWorker = voyageRecipe(product, game.rulesVersion)
        .worker_type as keyof GameState["workers"];
      startBoonDrafting(game, logs);
      const priorities = [
        "emergency_loan",
        makesGoods ? "artisan_inspiration" : "reliable_buyer",
        "merchant_charm",
        "bamboo_fair",
        "safe_anchorage",
      ];
      const chosen =
        priorities
          .map((id) => game.boonChoices.find((boon) => boon.id === id))
          .find(Boolean) ?? game.boonChoices[0];
      selectBoon(game, ctx, chosen.id, logs);
      result.quotedBoonGold += chosen.modifiers.instant_gold ?? 0;

      if (revised && strategy === "aggressive")
        chooseStaple(game, "Silk", logs);
      const staple = game.resourceCards.find((card) => card.staple)!;
      const openingCost = getCardFinalCost(game, staple);
      const upkeep = quoteDues(game).total;
      if (round === 1) assert.ok(game.money - openingCost >= upkeep);

      if (strategy !== "conservative" && game.money > upkeep + 12)
        purchaseIntel(game, logs);
      const signals = new Set(game.revealedIntel.map(({ item }) => item));
      for (const resource of game.scoutedOrder?.resources ?? [])
        signals.add(resource.type);
      const capitalReserve =
        upkeep *
        (strategy === "conservative"
          ? 1.7
          : strategy === "aggressive"
            ? 0.85
            : 1.25);
      const budget =
        strategy === "aggressive"
          ? 0.58
          : strategy === "conservative"
            ? 0.27
            : 0.42;
      const limits = Math.max(0, (game.money - capitalReserve) * budget);
      const maxCoverage = strategy === "conservative" ? 3 : 5;
      for (const card of game.resourceCards) {
        const cost = getCardFinalCost(game, card);
        if (card.id === staple.id) {
          const item = staple.resources[0].type;
          if (game.money >= cost && (game.inventory[item] ?? 0) < 5) {
            measurePurchase(card);
            purchaseCard(game, card.id, logs);
          }
          continue;
        }
        const relevant = card.resources.some(
          ({ type }) =>
            signals.has(type) && (game.inventory[type] ?? 0) < maxCoverage,
        );
        const rawValue =
          !card.isProductCard &&
          card.resources.every(({ type, price }) => {
            const acceptable =
              type === "Hemp" || type === "Bamboo"
                ? 5
                : type === "Silk"
                  ? 7
                  : 0;
            return (
              (price ?? 0) <= acceptable &&
              (game.inventory[type] ?? 0) < maxCoverage
            );
          });
        if (
          (relevant || rawValue) &&
          cost <= limits &&
          game.money - cost >= capitalReserve
        ) {
          measurePurchase(card);
          purchaseCard(game, card.id, logs);
        }
      }
      if (revised && makesGoods) {
        const supply = quoteWorkshopSupply(game, product);
        if (
          supply &&
          game.money - getCardFinalCost(game, supply) >= upkeep + 16
        ) {
          measurePurchase(supply);
          buyWorkshopSupply(game, product, logs);
        }
      }
      game.phase = "worker_mgmt";
      if (makesGoods && (!revised || round < game.maxRounds)) {
        const canWeave = Object.entries(
          quoteRecipe(game, product).inputs,
        ).every(([item, quantity]) => game.inventory[item] >= quantity);
        if (
          canWeave &&
          !game.workers[tradeWorker].length &&
          game.money > upkeep + 23
        )
          hireWorker(game, tradeWorker, logs);
        if (!canWeave) result.shortages++;
        if (canWeave) assignTask(game, tradeWorker, product, logs);
        if (
          revised &&
          game.workers[tradeWorker].some(({ task }) => task === product)
        )
          chooseWorkshopContract(
            game,
            product,
            game.workers[tradeWorker][0].isSkilled ? 2 : 1,
            logs,
          );
      }
      startPhase2(game, ctx, logs);
      if (round === 1) {
        const baseline = game.customerCards.find((card) => card.staple)!;
        const quote = quoteOrder(game, baseline);
        assert.ok(quote.reward - quote.freight.final > openingCost);
        assert.equal(baseline.resources[0].type, staple.resources[0].type);
        openings++;
      }
      const orders = game.customerCards
        .map((order) => [order, netQuote(game, order)] as const)
        .sort(([, left], [, right]) => right - left)
        .map(([order]) => order);
      for (const order of orders) {
        if (
          order.resources.every(
            ({ type, required }) => game.inventory[type] >= required!,
          )
        ) {
          const before = game.money;
          measure((state) => netQuote(state, order));
          completeOrder(game, order.id, logs);
          result.netTrade += game.money - before;
          if (order.workshop && game.completedOrders.includes(order.id))
            result.contracts++;
        } else if (order.workshop) {
          result.missedBuyers++;
        }
      }

      if (revised && makesGoods) {
        const quantity = Math.min(2, game.inventory[product]);
        const clearance = quoteClearance(game, product, quantity);
        if (clearance) {
          measure((state) => netQuote(state, clearance));
          sellClearance(game, product, quantity, logs);
          result.clearance += quantity;
        }
      }
      const stock = game.inventory[product];
      startPhase3(game, logs);
      result.produced += game.inventory[product] - stock;
      const raid = quotePirateWaters(game);
      const due = quoteDues(game).total;
      const expected = raid.raidLoss * raid.chance;
      const safety =
        strategy === "aggressive"
          ? 1.6
          : strategy === "conservative"
            ? 0.65
            : 1;
      if (
        game.money - raid.escortCost >= due &&
        raid.escortCost > 0 &&
        (raid.escortCost <= expected * safety ||
          game.money - raid.raidLoss < due)
      ) {
        measure((state) => -quotePirateWaters(state).escortCost);
        hireEscort(game, logs);
      } else resolvePirateAttack(game, logs);
      if (game.money < due * 2) result.lowLiquidity++;
      measure((state) => -quoteDues(state).total);
      finishSettlement(game, logs);
      if (game.gameOver) {
        result.bankruptcyRound += round;
        measureEnd();
        break;
      }
      if (
        game.shipLevel < 3 &&
        game.money >= game.shipUpgradeCost[game.shipLevel] + upkeep * 2 + 15
      ) {
        upgradeShip(game, logs);
      }
      if (game.equippedModules.length < game.shipLevel) {
        startModuleDrafting(game);
        const priority = (id: string) =>
          [
            "cargo_net",
            "storm_lantern",
            "merchant_scales",
            "brokers_network",
            "bonded_warehouse",
            "wage_ledger",
          ].indexOf(id);
        const choices = game._draftChoices ?? [];
        const first = choices
          .map((module, i) => ({ i, value: priority(module.id) }))
          .filter(({ value }) => value >= 0)
          .sort((a, b) => a.value - b.value)[0];
        if (first || (revised && choices.length))
          handleModuleSelect(game, first?.i ?? 0, logs);
      }
      endRound(game, logs);
      if (completedVoyage(game)) {
        result.finished++;
        result.gold += game.money;
        measureEnd();
        break;
      }
    }
  }
  assert.equal(openings, seeds);
  const metrics = Object.fromEntries(
    activeStrategies.map((strategy) => {
      const result = rates[strategy];
      return [
        strategy,
        {
          ...result,
          solventPercent: Number(
            ((result.finished / result.voyages) * 100).toFixed(1),
          ),
        },
      ];
    }),
  );
  console.log(
    JSON.stringify({ difficulty, profitableOpenings: openings, metrics }),
  );
}
