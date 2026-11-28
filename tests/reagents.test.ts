import assert from "node:assert/strict";
import test from "node:test";
import { BOONS, MODULES } from "../src/lib/game/constants";
import { buildCurrentVoyageRules } from "../src/lib/game/forecast";
import {
  createInitialGameState,
  type GameState,
  type OrderCard,
} from "../src/lib/game/types";
import {
  explainCardPrice,
  incomeTaxDue,
  quoteDues,
} from "../src/lib/game/engine/pricing";
import {
  buyWorkshopSupply,
  purchaseCard,
  quoteCardPayment,
  startPhase1,
} from "../src/lib/game/engine/market";
import {
  draftFavors,
  handleModuleSelect,
  selectFavor,
  selectStarterModule,
  startBoonDrafting,
} from "../src/lib/game/engine/boons";
import {
  canAdvancePhase,
  endRound,
  nextPhase,
} from "../src/lib/game/engine/lifecycle";
import {
  chooseWorkshopContract,
  completeOrder,
  quoteOrder,
  quotePortExchange,
  sellAtPortExchange,
  startPhase2,
  workshopBuyer,
} from "../src/lib/game/engine/orders";
import {
  assignTask,
  hireWorker,
  processProduction,
  productionOutput,
} from "../src/lib/game/engine/workers";
import { unlockedResources, unlockedWorkerTypes } from "../src/lib/game/pools";
import { quotePirateWaters } from "../src/lib/game/engine/pirates";
import {
  bribeHeat,
  canLockFavor,
  charterProgress,
  engineSlots,
  engineUsesFavor,
  favorDescription,
  favorDraftHasNoPick,
  favorDraftPool,
  favorMarksFor,
  favorRankFor,
  favorSlots,
  fuseEngine,
  readyDraftIsLegal,
  refreshFavorModifiers,
  repairSavedRack,
  selectCharter,
  settleCharterAct,
  settleEngines,
  settleFavorMarks,
  tagsForFavor,
} from "../src/lib/game/reagents";

const ctx = { roomSeed: "reagent tests", seedBase: "reagent tests:captain" };

function reagentGame(): GameState {
  const state = createInitialGameState(
    0,
    1,
    10,
    "open_waters",
    buildCurrentVoyageRules(ctx.roomSeed, 10, "open_waters"),
  );
  state.seatSeed = ctx.seedBase;
  return state;
}

function fairWindsReagentGame(): GameState {
  const state = createInitialGameState(
    0,
    1,
    0,
    "fair_winds",
    buildCurrentVoyageRules(ctx.roomSeed, 0, "fair_winds"),
  );
  state.seatSeed = ctx.seedBase;
  return state;
}

function openDraft(state: GameState, favorIds: string[]) {
  startBoonDrafting(state, []);
  const starter = state._draftChoices?.[0];
  if (starter) selectStarterModule(state, starter.id, []);
  state.boonChoices = BOONS.filter(({ id }) => favorIds.includes(id));
}

test("A Favor needs a Patron Charter and persists into the next draft", () => {
  const state = reagentGame();
  openDraft(state, ["silk_wind"]);
  selectFavor(state, ctx, "silk_wind", []);
  assert.equal(state.favors?.length ?? 0, 0);
  assert.equal(state.phase, 5);
  selectCharter(state, "silk_court", []);
  selectFavor(state, ctx, "silk_wind", []);
  assert.deepEqual(state.favors, ["silk_wind"]);
  assert.equal(state.phase, 1);
  assert.equal(favorSlots(state), 1);
  state.currentRound = 2;
  startBoonDrafting(state, []);
  assert.deepEqual(state.favors, ["silk_wind"]);
});

test("Settlement marks and a duplicate raise a Favor to rank 2", () => {
  const state = reagentGame();
  selectCharter(state, "silk_court", []);
  state.phase = 5;
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 0 };
  settleFavorMarks(state);
  assert.equal(favorMarksFor(state, "silk_wind"), 1);
  state.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
  selectFavor(state, ctx, "silk_wind", []);
  assert.equal(favorMarksFor(state, "silk_wind"), 3);
  assert.equal(favorRankFor(state, "silk_wind"), 2);
  assert.deepEqual(state.favors, ["silk_wind"]);
});

test("Attunement stops at six marks", () => {
  const state = reagentGame();
  selectCharter(state, "silk_court", []);
  state.phase = 5;
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 5 };
  state.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
  selectFavor(state, ctx, "silk_wind", []);
  assert.equal(favorMarksFor(state, "silk_wind"), 6);
  assert.equal(favorRankFor(state, "silk_wind"), 3);
  settleFavorMarks(state);
  assert.equal(favorMarksFor(state, "silk_wind"), 6);
});

test("A full Rack swaps the Favor in the chosen slot", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  state.currentRound = 9;
  state.phase = 5;
  state.favors = ["silk_wind", "merchant_charm", "farsight"];
  state.boonChoices = BOONS.filter(({ id }) => id === "safe_anchorage");
  assert.equal(favorSlots(state), 3);
  assert.equal(canLockFavor(state, "safe_anchorage"), false);
  state.pendingFavorSlot = 1;
  assert.equal(canLockFavor(state, "safe_anchorage"), true);
  selectFavor(state, ctx, "safe_anchorage", []);
  assert.deepEqual(state.favors, ["silk_wind", "safe_anchorage", "farsight"]);
});

test("A met Charter pays at the act gate and a missed one withholds it", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  state.currentRound = 1;
  state.goodsSold = { Hemp: 12 };
  state.money = 100;
  state.score = 0;
  settleCharterAct(state, []);
  assert.equal(state.charterActsSettled ?? 0, 0);
  assert.equal(state.money, 100);
  state.currentRound = 4;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  assert.equal(state.money, 120);
  assert.equal(state.score, 6);
  const missed = reagentGame();
  selectCharter(missed, "silk_court", []);
  missed.currentRound = 4;
  missed.goodsSold = { Hemp: 6 };
  missed.money = 100;
  missed.score = 10;
  settleCharterAct(missed, []);
  assert.equal(missed.charterMarks ?? 0, 0);
  assert.equal(missed.money, 100);
  assert.equal(missed.score, 6);
});

test("The Silk Court counts raw Silk and Silk recipes, not other textiles", () => {
  const state = reagentGame();
  selectCharter(state, "silk_court", []);
  state.goodsSold = {
    Silk: 1,
    Brocade: 2,
    "Linen Clothes": 3,
    "Bamboo Mat": 4,
  };
  assert.equal(charterProgress(state), 3);
});

test("Favorable Tides and Tax Shelter match the Rack at each rank", () => {
  const state = reagentGame();
  state.favors = ["favorable_tides"];
  state.favorMarks = { favorable_tides: 0 };
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.transport_flat_discount, 4);
  state.favorMarks.favorable_tides = 3;
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.transport_flat_discount, 5);
  state.favorMarks.favorable_tides = 6;
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.transport_flat_discount, 6);

  state.favors = ["tax_shelter"];
  state.favorMarks = { tax_shelter: 0 };
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.income_tax_override, 0.05);
  state.favorMarks.tax_shelter = 3;
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.income_tax_override, 0.03);
  state.favorMarks.tax_shelter = 6;
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.income_tax_override, 0);

  const tides = BOONS.find(({ id }) => id === "favorable_tides")!;
  const text = favorDescription(tides);
  assert.ok(text.includes("4 Gold"));
  assert.ok(!text.includes("6 Gold"));
});

test("Safe Anchorage protection rises with each rank", () => {
  const state = reagentGame();
  state.money = 1000;
  state.modifierFlags.safe_anchorage = 1;
  const rank1 = quotePirateWaters(state).reserve;
  state.favors = ["safe_anchorage"];
  state.favorMarks = { safe_anchorage: 3 };
  refreshFavorModifiers(state);
  const rank2 = quotePirateWaters(state).reserve;
  state.favorMarks.safe_anchorage = 6;
  refreshFavorModifiers(state);
  const rank3 = quotePirateWaters(state).reserve;
  assert.equal(rank2 - rank1, 10);
  assert.equal(rank3 - rank2, 10);
});

test("A saved Rack drops unknown and Engine held entries", () => {
  const state = reagentGame();
  state.charterId = "lost_patron";
  state.favors = ["silk_wind", "not_a_favor"];
  state.favorMarks = { silk_wind: 9.7, not_a_favor: 4, broken: NaN };
  state.engines = [
    {
      id: "silk_reel",
      favorId: "wrong",
      moduleId: "wrong",
      rank: 1,
      fusedRound: 1,
    },
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 3,
      fusedRound: 2,
    },
    {
      id: "not_an_engine",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  repairSavedRack(state);
  assert.equal(state.charterId, undefined);
  assert.deepEqual(state.favors, []);
  assert.deepEqual(state.favorMarks, {});
  assert.equal(state.engines?.length, 1);
  assert.deepEqual(state.engines?.[0], {
    id: "silk_reel",
    favorId: "silk_wind",
    moduleId: "silk_monopoly",
    rank: 2,
    fusedRound: 1,
    dormantUntilRound: undefined,
  });
});

test("An Engine keeps its source module out of the draft", () => {
  const state = reagentGame();
  state.phase = 4;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  state.money = 100;
  state._draftChoices = MODULES.filter(({ id }) => id === "silk_monopoly");
  handleModuleSelect(state, 0, []);
  assert.equal(state.equippedModules.length, 0);
  assert.equal(state.money, 100);

  const repaired = reagentGame();
  repaired.engines = state.engines;
  repaired.equippedModules = MODULES.filter(({ id }) => id === "silk_monopoly");
  repairSavedRack(repaired);
  assert.equal(repaired.equippedModules.length, 0);
});

test("A Favor with no rank rule is not offered as a duplicate", () => {
  const state = reagentGame();
  state.favors = ["reliable_buyer"];
  state.favorMarks = { reliable_buyer: 1 };
  assert.ok(
    !favorDraftPool(state, BOONS).some(({ id }) => id === "reliable_buyer"),
  );
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 1 };
  assert.ok(favorDraftPool(state, BOONS).some(({ id }) => id === "silk_wind"));
});

test("A replaced Favor starts over with no marks", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  state.currentRound = 9;
  state.phase = 5;
  state.favors = ["silk_wind", "merchant_charm", "farsight"];
  state.favorMarks = { silk_wind: 6, merchant_charm: 3, farsight: 1 };
  state.boonChoices = BOONS.filter(({ id }) => id === "safe_anchorage");
  state.pendingFavorSlot = 0;
  selectFavor(state, ctx, "safe_anchorage", []);
  assert.deepEqual(state.favors, [
    "safe_anchorage",
    "merchant_charm",
    "farsight",
  ]);
  assert.equal(state.favorMarks?.silk_wind, undefined);
  assert.ok(favorDraftPool(state, BOONS).some(({ id }) => id === "silk_wind"));
});

test("The Bond Table consumes the Favor and the module", () => {
  const state = reagentGame();
  state.phase = 4;
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 3 };
  const piece = MODULES.find(({ id }) => id === "silk_monopoly")!;
  state.equippedModules = [piece];
  state.money = 100;
  fuseEngine(state, "silk_reel", []);
  assert.equal(state.engines?.length, 1);
  assert.equal(state.engines?.[0].rank, 2);
  assert.deepEqual(state.favors, []);
  assert.equal(state.equippedModules.length, 0);
  assert.equal(state.money, 88);
  assert.equal(state.heat, 1);
  assert.ok(engineUsesFavor(state, "silk_wind"));
});

test("A rank 1 Favor cannot be bonded", () => {
  const state = reagentGame();
  state.phase = 4;
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 2 };
  state.equippedModules = MODULES.filter(({ id }) => id === "silk_monopoly");
  state.money = 100;
  fuseEngine(state, "silk_reel", []);
  assert.equal(state.engines?.length ?? 0, 0);
  assert.deepEqual(state.favors, ["silk_wind"]);
  assert.equal(state.equippedModules.length, 1);
  assert.equal(state.money, 100);
});

test("An Engine charges upkeep and the Silk Reel turns raw Silk into Brocade", () => {
  const state = reagentGame();
  state.currentRound = 2;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  state.money = 50;
  state.silkShippedThisRound = 7;
  state.heat = 0;
  settleEngines(state, []);
  assert.equal(state.money, 44);
  assert.equal(state.inventory.Brocade, 2);
  assert.equal(state.silkShippedThisRound, 0);
});

test("A Silk Reel bonded this round does not count earlier Silk shipments", () => {
  const state = reagentGame();
  state.currentRound = 4;
  state.money = 50;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 4,
    },
  ];
  state.silkShippedThisRound = 6;
  settleEngines(state, []);
  assert.equal(state.inventory.Brocade ?? 0, 0);
});

test("An Engine still works on the settlement that puts it to rest", () => {
  const state = reagentGame();
  state.currentRound = 2;
  state.phase = 4;
  state.money = 0;
  state.silkShippedThisRound = 6;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  settleEngines(state, []);
  assert.equal(state.inventory.Brocade, 2);
  assert.equal(state.engines[0].dormantUntilRound, 4);
});

test("Engine upkeep counts in Bills Due and the tax base", () => {
  const state = reagentGame();
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  state.fixedCost = 18;
  state.roundRevenue = 1000;
  state.roundCosts = 0;
  assert.equal(quoteDues(state).upkeep, 6);
  assert.equal(quoteDues(state).total, 24);
  assert.equal(incomeTaxDue(state), 99);
  state.money = 100;
  settleEngines(state, []);
  assert.equal(state.engineUpkeepCosts, 6);
  assert.equal(incomeTaxDue(state), 99);
  state.currentRound = 3;
  state.engines[0].dormantUntilRound = 4;
  assert.equal(quoteDues(state).upkeep, 0);
});

test("An unpaid Engine rests for one full round", () => {
  const state = reagentGame();
  state.currentRound = 2;
  state.phase = 4;
  state.money = 0;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  settleEngines(state, []);
  assert.equal(state.engines[0].dormantUntilRound, 4);
  assert.equal(state.heat, 2);
  state.money = 50;
  state.currentRound = 3;
  settleEngines(state, []);
  assert.equal(state.money, 50);
  state.currentRound = 4;
  settleEngines(state, []);
  assert.equal(state.money, 44);
});

test("A fully attuned Favor leaves the draft pool", () => {
  const state = reagentGame();
  state.favors = ["silk_wind"];
  state.favorMarks = { silk_wind: 6 };
  assert.ok(!favorDraftPool(state, BOONS).some(({ id }) => id === "silk_wind"));
  state.favorMarks = { silk_wind: 5 };
  assert.ok(favorDraftPool(state, BOONS).some(({ id }) => id === "silk_wind"));
});

test("A Rack held by Engines passes the draft instead of stalling", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  state.currentRound = 4;
  state.phase = 5;
  state.favors = [];
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 2,
    },
  ];
  state.boonChoices = BOONS.slice(0, 3);
  assert.equal(favorSlots(state), 1);
  assert.equal(canLockFavor(state, state.boonChoices[0].id), false);
  assert.equal(favorDraftHasNoPick(state), true);
  assert.equal(canAdvancePhase(state), true);
  nextPhase(state, ctx, []);
  assert.equal(state.phase, 1);

  const replaceable = reagentGame();
  selectCharter(replaceable, "salt_guild", []);
  replaceable.currentRound = 4;
  replaceable.phase = 5;
  replaceable.favors = ["silk_wind"];
  replaceable.boonChoices = BOONS.filter(({ id }) => id !== "silk_wind");
  assert.equal(favorDraftHasNoPick(replaceable), false);
  assert.equal(canAdvancePhase(replaceable), false);
});

test("The saved draft decision must hold a Favor or pass", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  state.currentRound = 4;
  state.phase = 5;
  state.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
  assert.equal(readyDraftIsLegal(state), false);
  state.pendingBoonId = "silk_wind";
  assert.equal(readyDraftIsLegal(state), true);

  const full = reagentGame();
  selectCharter(full, "salt_guild", []);
  full.currentRound = 4;
  full.phase = 5;
  full.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 2,
    },
  ];
  full.boonChoices = BOONS.slice(0, 3);
  assert.equal(readyDraftIsLegal(full), true);
  full.pendingBoonId = full.boonChoices[0].id;
  assert.equal(readyDraftIsLegal(full), false);
});

test("The shop rail caps discounts at 60 percent and floors a unit at 1 Gold", () => {
  const state = reagentGame();
  state.modifierFlags = { purchase_discount: 0.8 };
  const capped = explainCardPrice(state, {
    totalCost: 100,
    resources: [{ type: "Hemp", quantity: 1 }],
  });
  assert.equal(capped.final, 40);
  const floored = explainCardPrice(state, {
    totalCost: 10,
    resources: [{ type: "Hemp", quantity: 4 }],
  });
  assert.equal(floored.final, 4);
  assert.ok(floored.steps.some(({ label }) => label.includes("Discount rail")));
});

test("Heat raises raid risk and a bribe lowers it", () => {
  const state = reagentGame();
  state.phase = 4;
  state.money = 30;
  state.heat = 2;
  bribeHeat(state, []);
  assert.equal(state.heat, 1);
  assert.equal(state.money, 20);
  state.money = 5;
  bribeHeat(state, []);
  assert.equal(state.heat, 1);
  assert.equal(state.money, 5);
});

test("The Bond fee and bribe leave the Income Tax reserve alone", () => {
  const bribe = reagentGame();
  bribe.phase = 4;
  bribe.money = 20;
  bribe.heat = 2;
  bribeHeat(bribe, [], 15);
  assert.equal(bribe.heat, 2);
  assert.equal(bribe.money, 20);
  bribeHeat(bribe, [], 5);
  assert.equal(bribe.heat, 1);
  assert.equal(bribe.money, 10);

  const bond = reagentGame();
  bond.phase = 4;
  bond.favors = ["silk_wind"];
  bond.favorMarks = { silk_wind: 3 };
  bond.equippedModules = MODULES.filter(({ id }) => id === "silk_monopoly");
  bond.money = 20;
  fuseEngine(bond, "silk_reel", [], 10);
  assert.equal(bond.engines?.length ?? 0, 0);
  assert.equal(bond.money, 20);
  fuseEngine(bond, "silk_reel", [], 5);
  assert.equal(bond.engines?.length, 1);
  assert.equal(bond.money, 8);
});

test("A Reagent voyage drafts through all three acts", () => {
  const state = reagentGame();
  startBoonDrafting(state, []);
  const starter = state._draftChoices?.[0];
  assert.ok(starter);
  selectStarterModule(state, starter.id, []);
  selectCharter(state, "road_wardens", []);
  state.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
  selectFavor(state, ctx, "silk_wind", []);
  assert.equal(state.phase, 1);

  const gates: number[] = [];
  while (!state.gameOver && state.currentRound <= state.maxRounds) {
    const round = state.currentRound;
    state.phase = 4;
    endRound(state, []);
    if (round === 1) assert.equal(state.charterActsSettled ?? 0, 0);
    if (round === 4) assert.equal(state.charterActsSettled, 1);
    if (round === 8) assert.equal(state.charterActsSettled, 2);
    if (state.gameOver) break;
    assert.equal(state.phase, 5);
    if ([4, 8].includes(round) || round === state.maxRounds)
      gates.push(state.charterActsSettled ?? 0);

    state.boonChoices = BOONS.filter(({ id }) => id === "silk_wind");
    selectFavor(state, ctx, "silk_wind", []);
    assert.equal(state.phase, 1);
  }

  assert.ok(state.gameOver);
  assert.equal(state.currentRound, state.maxRounds + 1);
  assert.equal(state.charterActsSettled, 3);
  assert.equal(state.charterMisses, 3);
  assert.ok((state.favorMarks?.silk_wind ?? 0) >= 3);
  assert.ok(gates.length >= 2);
});

test("The Reagent draft offers three tagged Favors from the unlock pool", () => {
  const state = reagentGame();
  const picks = draftFavors(state);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map(({ id }) => id)).size, 3);
  for (const boon of picks) {
    assert.ok(tagsForFavor(boon.id).length >= 1);
    assert.notEqual(boon.id, "emergency_loan");
  }
});

test("The Bond Table opens a second slot in Act II", () => {
  const state = reagentGame();
  state.currentRound = 1;
  assert.equal(engineSlots(state), 1);
  state.currentRound = 4;
  assert.equal(engineSlots(state), 1);
  state.currentRound = 5;
  assert.equal(engineSlots(state), 2);
});

test("Unpaid shadow debt stays on the books after settlement", () => {
  const state = reagentGame();
  state.currentRound = 3;
  state.phase = 4;
  state.money = 4;
  state.shadowGold = 10;
  settleEngines(state, []);
  assert.equal(state.money, 0);
  assert.equal(state.shadowGold, 6);
  assert.equal(state.heat, 1);
});

test("Unpaid shadow debt costs Reputation at the voyage close", () => {
  const state = reagentGame();
  state.currentRound = state.maxRounds;
  state.phase = 4;
  state.money = 4;
  state.score = 20;
  state.shadowGold = 10;
  settleEngines(state, []);
  assert.equal(state.money, 0);
  assert.equal(state.shadowGold, 6);
  assert.equal(state.score, 14);
  assert.equal(state.heat, 1);
});

test("Shadow debt counts in total dues but not the Phase 3 bill", () => {
  const state = reagentGame();
  state.fixedCost = 18;
  state.shadowGold = 10;
  const due = quoteDues(state);
  assert.equal(due.phaseDue, 18);
  assert.equal(due.shadow, 10);
  assert.equal(due.total, 28);
});

test("The False Manifest keeps the port discount after a Bond", () => {
  const state = reagentGame();
  state.engines = [
    {
      id: "false_manifest",
      favorId: "merchant_charm",
      moduleId: "smugglers_hold",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const quote = explainCardPrice(state, {
    totalCost: 100,
    resources: [{ type: "Hemp", quantity: 1 }],
  });
  assert.equal(quote.final, 85);
  assert.ok(quote.steps.some(({ label }) => label.includes("False Manifest")));
});

test("The False Manifest defers a fifth of a lot price", () => {
  const card = {
    id: 702,
    port: "Guangzhou",
    resources: [{ type: "Hemp", quantity: 1 }],
    totalCost: 100,
    isProductCard: false,
  };
  const state = reagentGame();
  state.phase = 1;
  state.money = 200;
  state.resourceCards = [card];
  state.engines = [
    {
      id: "false_manifest",
      favorId: "merchant_charm",
      moduleId: "smugglers_hold",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const { final } = explainCardPrice(state, card);
  const deferred = Math.floor(final * 0.2);
  purchaseCard(state, card.id, []);
  assert.equal(state.money, 200 - (final - deferred));
  assert.equal(state.shadowGold, deferred);
  assert.equal(state.materialCosts, final);
  assert.equal(state.roundCosts, final);
  state.engines = [];
  settleEngines(state, []);
  assert.equal(state.shadowGold, 0);
  assert.equal(state.materialCosts, final);
  assert.equal(state.roundCosts, final);
});

test("The deferral lets a lot be bought with less than its full price", () => {
  const card = {
    id: 704,
    port: "Guangzhou",
    resources: [{ type: "Hemp", quantity: 1 }],
    totalCost: 100,
    isProductCard: false,
  };
  const state = reagentGame();
  state.phase = 1;
  state.resourceCards = [card];
  state.engines = [
    {
      id: "false_manifest",
      favorId: "merchant_charm",
      moduleId: "smugglers_hold",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const payment = quoteCardPayment(state, card);
  state.money = payment.paid;
  purchaseCard(state, card.id, []);
  assert.equal(state.money, 0);
  assert.equal(state.shadowGold, payment.deferred);
  assert.equal(state.roundCosts, payment.cost);
});

test("The False Manifest does not defer while debt is unpaid", () => {
  const card = {
    id: 701,
    port: "Guangzhou",
    resources: [{ type: "Hemp", quantity: 1 }],
    totalCost: 100,
    isProductCard: false,
  };
  const state = reagentGame();
  state.phase = 1;
  state.money = 200;
  state.resourceCards = [card];
  state.engines = [
    {
      id: "false_manifest",
      favorId: "merchant_charm",
      moduleId: "smugglers_hold",
      rank: 2,
      fusedRound: 1,
    },
  ];
  state.shadowGold = 10;
  const { final } = explainCardPrice(state, card);
  purchaseCard(state, card.id, []);
  assert.equal(state.money, 200 - final);
  assert.equal(state.shadowGold, 10);
});

test("The False Manifest closes new deferrals in the final round", () => {
  const card = {
    id: 703,
    port: "Guangzhou",
    resources: [{ type: "Hemp", quantity: 1 }],
    totalCost: 100,
    isProductCard: false,
  };
  const state = reagentGame();
  state.currentRound = state.maxRounds;
  state.phase = 1;
  state.money = 200;
  state.resourceCards = [card];
  state.engines = [
    {
      id: "false_manifest",
      favorId: "merchant_charm",
      moduleId: "smugglers_hold",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const { final } = explainCardPrice(state, card);
  purchaseCard(state, card.id, []);
  assert.equal(state.shadowGold, 0);
  assert.equal(state.money, 200 - final);
});

test("An unpaid Engine in the final round costs Reputation", () => {
  const state = reagentGame();
  state.currentRound = state.maxRounds;
  state.phase = 4;
  state.money = 0;
  state.score = 20;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const logs: string[] = [];
  settleEngines(state, logs);
  assert.equal(state.score, 14);
  assert.equal(state.heat, 2);
  assert.ok(logs.some((line) => line.includes("Reputation falls by 6")));
});

test("An unpaid Engine in the penultimate round also costs Reputation", () => {
  const state = reagentGame();
  state.currentRound = state.maxRounds - 1;
  state.phase = 4;
  state.money = 0;
  state.score = 20;
  state.engines = [
    {
      id: "silk_reel",
      favorId: "silk_wind",
      moduleId: "silk_monopoly",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const logs: string[] = [];
  settleEngines(state, logs);
  assert.equal(state.score, 14);
  assert.equal(state.heat, 2);
  assert.ok(
    logs.some((line) => line.includes("too late for the Engine to return")),
  );
});

test("The Workhouse improves both artisan assignments and raises wages", () => {
  const state = reagentGame();
  state.engines = [
    {
      id: "workhouse",
      favorId: "resourceful_crew",
      moduleId: "artisans_workshop",
      rank: 2,
      fusedRound: 1,
    },
  ];
  refreshFavorModifiers(state);
  assert.equal(state.modifierFlags.worker_bonus_production, 1);
  assert.equal(state.modifierFlags.favor_artisan_second, 1);
  assert.equal(state.modifierFlags.favor_recipe_cap, 2);
  assert.equal(state.modifierFlags.engine_wage_surcharge, 0.2);
});

test("The second artisan preview matches settlement", () => {
  const state = reagentGame();
  state.phase = "worker_mgmt";
  state.workers.weaver = [
    { task: "Linen Clothes", producedCount: 0, isSkilled: false },
    { task: "Linen Clothes", producedCount: 0, isSkilled: false },
  ];
  state.modifierFlags.favor_artisan_second = 1;
  assert.deepEqual(
    state.workers.weaver.map((worker) => productionOutput(state, worker).total),
    [1, 2],
  );
  processProduction(state, []);
  assert.equal(state.inventory["Linen Clothes"], 3);
  assert.deepEqual(state.producedLastRound, { "Linen Clothes": 3 });
});

test("The Kiln's first act grants its mark without a payout or fee", () => {
  const state = reagentGame();
  selectCharter(state, "kiln_consortium", []);
  state.currentRound = 4;
  state.money = 100;
  state.score = 10;
  state.heat = 2;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  assert.equal(state.money, 100);
  assert.equal(state.score, 10);
  assert.equal(state.heat, 2);
});

test("The Kiln reaches rank two at one ceramic sale and completes at four", () => {
  const state = reagentGame();
  selectCharter(state, "kiln_consortium", []);
  state.currentRound = 4;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  state.goodsSold = { "Celadon Ware": 1 };
  state.currentRound = 8;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 2);
  state.goodsSold = { "Celadon Ware": 4 };
  state.currentRound = 12;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 3);
  assert.equal(state.charterComplete, true);
});

test("The opening hold alone cannot finish the Salt Guild", () => {
  const state = reagentGame();
  selectCharter(state, "salt_guild", []);
  // The opening hold is 8 Hemp, 5 Silk and 3 Tea.
  const hold = Object.entries(state.inventory)
    .filter(([item]) => ["Hemp", "Silk", "Tea"].includes(item))
    .reduce((sum, [, count]) => sum + count, 0);
  assert.ok(hold < 36);
  state.goodsSold = { Hemp: 8, Silk: 5, Tea: 3 };
  state.currentRound = 4;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  state.currentRound = 8;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  state.currentRound = 12;
  settleCharterAct(state, []);
  assert.equal(state.charterMarks, 1);
  assert.equal(state.charterComplete, false);
  assert.equal(state.charterMisses, 2);
});

test("A version 9 workshop contract books a ceramic buyer", () => {
  const state = reagentGame();
  state.phase = "worker_mgmt";
  state.currentRound = 4;
  state.workers.potter = [{ task: null, producedCount: 0, isSkilled: false }];
  const logs: string[] = [];
  chooseWorkshopContract(state, "Celadon Ware", 2, logs);
  assert.equal(state.workshopContracts?.length, 1);
  const buyer = workshopBuyer(state, 5);
  assert.equal(buyer?.resources[0].type, "Celadon Ware");
  assert.equal(buyer?.resources[0].required, 2);
  assert.ok(logs.some((line) => line.includes("Workshop buyer booked")));
});

test("A Fair Winds Kiln run fires its first ceramic sale in round 6", () => {
  const logs: string[] = [];
  const state = fairWindsReagentGame();
  selectCharter(state, "kiln_consortium", []);
  state.currentRound = 3;
  settleCharterAct(state, logs);
  assert.equal(state.charterMarks, 1);

  // Clay and potters are locked before round five on an eight round voyage.
  assert.ok(
    !unlockedResources("fair_winds", 4, state.rulesVersion).includes(
      "Porcelain Clay",
    ),
  );
  assert.ok(
    unlockedResources("fair_winds", 5, state.rulesVersion).includes(
      "Porcelain Clay",
    ),
  );
  assert.ok(
    !unlockedWorkerTypes("fair_winds", 4, state.rulesVersion).some(
      ({ id }) => id === "potter",
    ),
  );
  assert.ok(
    unlockedWorkerTypes("fair_winds", 5, state.rulesVersion).some(
      ({ id }) => id === "potter",
    ),
  );

  state.currentRound = 5;
  state.money = 200;
  state.phase = 1;
  startPhase1(state, ctx, logs);
  buyWorkshopSupply(state, "Celadon Ware", logs);
  state.phase = "worker_mgmt";
  hireWorker(state, "potter", logs);
  assignTask(state, "potter", "Celadon Ware", logs);
  chooseWorkshopContract(state, "Celadon Ware", 1, logs);
  processProduction(state, logs);
  assert.equal(state.inventory["Celadon Ware"], 1);

  state.currentRound = 6;
  startPhase2(state, ctx, logs);
  const contract = state.customerCards.find((card) => card.workshop);
  assert.ok(contract);
  assert.equal(contract.resources[0].type, "Celadon Ware");
  assert.equal(contract.resources[0].required, 1);
  completeOrder(state, contract.id, logs);
  assert.equal(state.goodsSold?.["Celadon Ware"], 1);
  settleCharterAct(state, logs);
  assert.equal(state.charterMarks, 2);
  assert.equal(state.charterMisses, 0);
});

test("A contract booked before the final round still delivers in it", () => {
  const state = fairWindsReagentGame();
  state.currentRound = 7;
  state.phase = "worker_mgmt";
  state.workers.potter = [{ task: null, producedCount: 0, isSkilled: false }];
  state.inventory["Celadon Ware"] = 1;
  const logs: string[] = [];
  chooseWorkshopContract(state, "Celadon Ware", 1, logs);
  state.currentRound = 8;
  startPhase2(state, ctx, logs);
  const contract = state.customerCards.find((card) => card.workshop);
  assert.ok(contract);
  completeOrder(state, contract.id, logs);
  assert.equal(state.inventory["Celadon Ware"], 0);
  assert.equal(state.goodsSold?.["Celadon Ware"], 1);
});

test("Heat carries raid risk past the old half ceiling", () => {
  const state = reagentGame();
  state.difficulty = "monsoon";
  state.currentRound = 10;
  state.heat = 10;
  state.money = 0;
  state.engines = [
    {
      id: "quiet_port",
      favorId: "farsight",
      moduleId: "brokers_network",
      rank: 2,
      fusedRound: 1,
    },
  ];
  const chance = quotePirateWaters(state).chance;
  assert.ok(chance > 0.5);
  assert.ok(chance <= 0.75);
});

test("Tidewatch ignores Port Exchange revenue", () => {
  const state = reagentGame();
  state.phase = 2;
  state.inventory.Silk = 2;
  const quote = quotePortExchange(state, "Silk", 2);
  assert.ok(quote);
  assert.equal(state.bestRoundRevenue ?? 0, 0);
  assert.equal(sellAtPortExchange(state, quote, []), true);
  assert.ok(state.roundRevenue > 0);
  assert.equal(state.bestRoundRevenue ?? 0, 0);
  assert.equal(state.roundOrderRevenue ?? 0, 0);
});

test("Tidewatch counts completed order revenue in the best round", () => {
  const order: OrderCard = {
    id: 901,
    demandPort: "Quanzhou",
    resources: [{ type: "Hemp", required: 1 }],
    reward: 60,
    totalItems: 1,
    isProductOrder: false,
  };
  const state = reagentGame();
  state.phase = 2;
  state.inventory.Hemp = 1;
  state.customerCards = [order];
  completeOrder(state, order.id, []);
  assert.ok((state.roundOrderRevenue ?? 0) > 0);
  assert.equal(state.roundOrderRevenue, state.bestRoundRevenue);
});

test("Patron's Favor lifts a sale of a good the artisans made three times", () => {
  const order: OrderCard = {
    id: 900,
    demandPort: "Quanzhou",
    resources: [{ type: "Brocade", required: 1 }],
    reward: 100,
    totalItems: 1,
    isProductOrder: true,
  };
  const state = reagentGame();
  state.engines = [
    {
      id: "patrons_favor",
      favorId: "artisan_inspiration",
      moduleId: "silk_market_charter",
      rank: 2,
      fusedRound: 1,
    },
  ];
  state.producedLastRound = { Brocade: 3 };
  const boosted = quoteOrder(state, order);
  assert.ok(boosted.bonuses.some(({ name }) => name === "Patron's Favor"));

  const short = reagentGame();
  short.engines = state.engines;
  short.producedLastRound = { Brocade: 2 };
  const plain = quoteOrder(short, order);
  assert.ok(!plain.bonuses.some(({ name }) => name === "Patron's Favor"));
});
