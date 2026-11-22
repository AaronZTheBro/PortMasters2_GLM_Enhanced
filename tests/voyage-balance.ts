import assert from "node:assert/strict";
import { DIFFICULTY_ORDER } from "../src/lib/game/difficulty";
import { EXPANDED_RULES } from "../src/lib/game/expansion";
import { buildForecasts } from "../src/lib/game/forecast";
import { createInitialGameState, type GameState } from "../src/lib/game/types";
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
import { purchaseCard } from "../src/lib/game/engine/market";
import {
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
const seeds = Number(process.argv[2] ?? 5000);
assert.ok(Number.isInteger(seeds) && seeds > 0);

function completedVoyage(game: GameState) {
  return game.phase === "endgame";
}

for (const difficulty of DIFFICULTY_ORDER) {
  const rates = Object.fromEntries(
    strategies.map((strategy) => [
      strategy,
      { voyages: 0, finished: 0, bankruptcyRound: 0 },
    ]),
  );
  let openings = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const strategy = strategies[seed % strategies.length];
    const result = rates[strategy];
    const roomSeed = `balance ${seed}`;
    const ctx = { roomSeed, seedBase: `${roomSeed}:0` };
    const game = createInitialGameState(0, 1, 1, difficulty, {
      version: EXPANDED_RULES,
      forecasts: buildForecasts(roomSeed, 1, difficulty),
    });
    game.seatSeed = ctx.seedBase;
    result.voyages++;
    for (let round = 1; round <= game.maxRounds; round++) {
      const logs: string[] = [];
      startBoonDrafting(game, logs);
      const priorities = [
        "emergency_loan",
        strategy === "artisan" ? "artisan_inspiration" : "reliable_buyer",
        "merchant_charm",
        "bamboo_fair",
        "safe_anchorage",
      ];
      const chosen =
        priorities
          .map((id) => game.boonChoices.find((boon) => boon.id === id))
          .find(Boolean) ?? game.boonChoices[0];
      selectBoon(game, ctx, chosen.id, logs);

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
          if (game.money >= cost && (game.inventory[item] ?? 0) < 5)
            purchaseCard(game, card.id, logs);
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
        )
          purchaseCard(game, card.id, logs);
      }
      game.phase = "worker_mgmt";
      if (strategy === "artisan") {
        const canWeave = Object.entries(
          quoteRecipe(game, "Linen Clothes").inputs,
        ).every(([item, quantity]) => game.inventory[item] >= quantity);
        if (canWeave && !game.workers.weaver.length && game.money > upkeep + 23)
          hireWorker(game, "weaver", logs);
        if (canWeave) assignTask(game, "weaver", "Linen Clothes", logs);
      }
      startPhase2(game, ctx, logs);
      if (round === 1) {
        const baseline = game.customerCards.find((card) => card.staple)!;
        const quote = quoteOrder(game, baseline);
        assert.ok(quote.reward - quote.freight.final > openingCost);
        assert.equal(baseline.resources[0].type, staple.resources[0].type);
        openings++;
      }
      const orders = [...game.customerCards].sort(
        (left, right) =>
          quoteOrder(game, right).reward -
          quoteOrder(game, right).freight.final -
          quoteOrder(game, left).reward +
          quoteOrder(game, left).freight.final,
      );
      for (const order of orders) {
        if (
          order.resources.every(
            ({ type, required }) => game.inventory[type] >= required!,
          )
        )
          completeOrder(game, order.id, logs);
      }

      startPhase3(game, logs);
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
      )
        hireEscort(game, logs);
      else resolvePirateAttack(game, logs);
      finishSettlement(game, logs);
      if (game.gameOver) {
        result.bankruptcyRound += round;
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
        if (first) handleModuleSelect(game, first.i, logs);
      }
      endRound(game, logs);
      if (completedVoyage(game)) {
        result.finished++;
        break;
      }
    }
  }
  assert.equal(openings, seeds);
  const metrics = Object.fromEntries(
    strategies.map((strategy) => {
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
