// Builds round content pools from canonical data and difficulty schedules.
import {
  BOONS,
  MODULES,
  RESOURCES,
  PRODUCTS,
  BOONS_TIER0,
  BOONS_TIER1,
  BOONS_TIER2,
  MODULES_TIER0,
  MODULES_TIER1,
  MODULES_TIER2,
  PORTS_TIER0,
  PORTS_TIER1,
  PORTS_TIER2,
  PRODUCTS_TIER0,
  PRODUCT_PRICES,
  PRODUCTS_TIER1,
  PRODUCTS_TIER2,
  RECIPES,
  RESOURCES_TIER0,
  RESOURCES_TIER1,
  RESOURCES_TIER2,
  WORKER_TYPES,
  type Boon,
  type Module,
  type WorkerType,
} from "./constants";
import { difficultyConfig, unlockedPool, unlockedTierFor } from "./difficulty";
import {
  CLASSIC_RULES,
  NEW_BOONS,
  NEW_MATERIALS,
  NEW_MODULES,
  NEW_PRODUCTS,
  REBALANCED_RULES,
  REBALANCE,
  expanded,
  OPEN_HARBOR_RULES,
  CLASSIC_HARBOR_RULES,
  harborTrading,
  isOceanMaterial,
  specialtyGoods,
  type Specialty,
} from "./expansion";

function importStage(difficulty: unknown, round: number) {
  const { rounds } = difficultyConfig(difficulty);
  return round < 3 ? 0 : round < Math.floor(rounds / 2) + 1 ? 1 : 2;
}

const EARLY_IMPORTS = ["Bamboo", "Beeswax", "Indigo", "Sea Salt"];

export function unlockedResources(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
  specialties?: readonly Specialty[],
): string[] {
  if (rulesVersion === OPEN_HARBOR_RULES) return [...RESOURCES];
  const base = unlockedPool<string>(
    [RESOURCES_TIER0, RESOURCES_TIER1, RESOURCES_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion === CLASSIC_HARBOR_RULES) {
    const stage = importStage(difficulty, roundNo);
    return stage === 2
      ? [...RESOURCES]
      : stage === 1
        ? [...base, ...EARLY_IMPORTS]
        : base;
  }
  if (!expanded({ rulesVersion })) return base;
  if (rulesVersion === REBALANCED_RULES) {
    const goods = specialtyGoods(difficulty, roundNo, specialties);
    return base.concat(
      Object.keys(NEW_MATERIALS).filter((item) => goods.has(item)),
    );
  }
  const cfg = difficultyConfig(difficulty);
  for (const [item, data] of Object.entries(NEW_MATERIALS)) {
    const opening = data.tier === 0 ? 0 : cfg.tierUnlock[data.tier];
    if (opening !== undefined && roundNo >= opening + data.round)
      base.push(item);
  }
  return base;
}

export function unlockedProducts(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
  specialties?: readonly Specialty[],
): string[] {
  if (rulesVersion === OPEN_HARBOR_RULES) return [...PRODUCTS];
  const base = unlockedPool<string>(
    [PRODUCTS_TIER0, PRODUCTS_TIER1, PRODUCTS_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion === CLASSIC_HARBOR_RULES) {
    const raw = unlockedResources(difficulty, roundNo, rulesVersion);
    return PRODUCTS.filter((item) =>
      Object.keys(RECIPES[item].materials).every((good) => raw.includes(good)),
    );
  }
  if (!expanded({ rulesVersion })) return base;
  const raw = unlockedResources(difficulty, roundNo, rulesVersion, specialties);
  const goods =
    rulesVersion === REBALANCED_RULES
      ? specialtyGoods(difficulty, roundNo, specialties)
      : undefined;
  return base.concat(
    Object.entries(NEW_PRODUCTS)
      .filter(
        ([item, recipe]) =>
          (!goods || goods.has(item)) &&
          Object.keys(recipe.materials).every((item) => raw.includes(item)),
      )
      .map(([item]) => item),
  );
}

export function unlockedPorts(
  difficulty: unknown,
  roundNo: number,
  version?: number,
): string[] {
  if (version === OPEN_HARBOR_RULES)
    return [...PORTS_TIER0, ...PORTS_TIER1, ...PORTS_TIER2];
  return unlockedPool<string>(
    [PORTS_TIER0, PORTS_TIER1, PORTS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedBoons(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
  specialties?: readonly Specialty[],
): Boon[] {
  if (rulesVersion === OPEN_HARBOR_RULES)
    return BOONS.map((boon) => voyageBoon(boon, rulesVersion));
  const base = unlockedPool<Boon>(
    [BOONS_TIER0, BOONS_TIER1, BOONS_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion === CLASSIC_HARBOR_RULES) {
    const stage = importStage(difficulty, roundNo);
    const choices =
      stage === 2
        ? BOONS
        : stage === 1
          ? [
              ...base,
              ...NEW_BOONS.filter(({ tier }) => tier === 0),
              ...BOONS.filter(({ id }) =>
                [
                  "resourceful_crew",
                  "buyers_festival",
                  "market_momentum",
                ].includes(id),
              ),
            ]
          : base;
    return choices
      .filter(
        ({ id }) =>
          id !== "false_colors" ||
          difficultyConfig(difficulty).brokerCorruption,
      )
      .map((boon) => voyageBoon(boon, rulesVersion));
  }
  if (!expanded({ rulesVersion })) return base;
  const tier = unlockedTierFor(difficulty, roundNo);
  if (rulesVersion === REBALANCED_RULES)
    return base
      .concat(NEW_BOONS.filter((boon) => boon.tier <= tier))
      .filter((boon) => {
        const goods = specialtyGoods(difficulty, roundNo, specialties);
        if (boon.id === "bamboo_fair") return goods.has("Bamboo");
        if (["deep_market", "rare_cargo_charter"].includes(boon.id))
          return goods.has("Frankincense") || goods.has("Lapis Lazuli");
        return (
          boon.id !== "false_colors" ||
          difficultyConfig(difficulty).brokerCorruption
        );
      })
      .map((boon) => voyageBoon(boon, rulesVersion));
  return base.concat(
    NEW_BOONS.filter(
      (boon) =>
        boon.tier <= tier &&
        (boon.id !== "bamboo_fair" || roundNo >= 3) &&
        (boon.id !== "false_colors" ||
          difficultyConfig(difficulty).brokerCorruption),
    ).map(
      (boon): Boon => ({ ...boon, modifiers: { ...boon.modifiers } }) as Boon,
    ),
  );
}

export function unlockedModules(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
  specialties?: readonly Specialty[],
): Module[] {
  if (rulesVersion === OPEN_HARBOR_RULES)
    return MODULES.map((module) => voyageModule(module, rulesVersion));
  const base = unlockedPool<Module>(
    [MODULES_TIER0, MODULES_TIER1, MODULES_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion === CLASSIC_HARBOR_RULES) {
    const stage = importStage(difficulty, roundNo);
    const choices =
      stage === 2
        ? MODULES
        : stage === 1
          ? [
              ...base,
              ...NEW_MODULES.filter(({ tier }) => tier === 0),
              ...MODULES.filter(({ id }) =>
                [
                  "silk_market_charter",
                  "traveling_commission",
                  "open_hold",
                  "storm_dividend",
                ].includes(id),
              ),
            ]
          : base;
    return choices.map((module) => voyageModule(module, rulesVersion));
  }
  if (!expanded({ rulesVersion })) return base;
  if (rulesVersion === REBALANCED_RULES) {
    const goods = specialtyGoods(difficulty, roundNo, specialties);
    return base
      .concat(
        NEW_MODULES.filter(
          (module) =>
            module.tier <= unlockedTierFor(difficulty, roundNo) &&
            (module.id !== "ocean_exchange_ledger" ||
              goods.has("Frankincense") ||
              goods.has("Lapis Lazuli")),
        ),
      )
      .map((module) => voyageModule(module, rulesVersion));
  }
  return base.concat(
    NEW_MODULES.filter(
      (module) => module.tier <= unlockedTierFor(difficulty, roundNo),
    ),
  );
}

// Worker definitions carry their own unlock tier.
export function unlockedWorkerTypes(
  difficulty: unknown,
  roundNo: number,
  version?: number,
): WorkerType[] {
  if (version === OPEN_HARBOR_RULES) return [...WORKER_TYPES];
  if (version === CLASSIC_HARBOR_RULES) {
    const products = unlockedProducts(difficulty, roundNo, version);
    return WORKER_TYPES.filter(({ id }) =>
      products.some((product) => canProduce(id, product)),
    );
  }
  const tier = unlockedTierFor(difficulty, roundNo);
  return WORKER_TYPES.filter((w) => w.tier <= tier);
}

export function isSilkProduct(item: string): boolean {
  return (RECIPES[item]?.materials.Silk ?? 0) > 0;
}

export function canProduce(workerId: string, product: string): boolean {
  const recipeWorker = RECIPES[product]?.worker_type;
  return (
    recipeWorker === workerId ||
    (workerId === "master" && recipeWorker === "weaver")
  );
}

export function voyageRecipe(product: string, version?: number) {
  const recipe = RECIPES[product];
  if (version !== REBALANCED_RULES) return recipe;
  if (product === "Bronze Mirror")
    return { ...recipe, materials: { "Copper Ore": 2 } };
  if (product === "Brocade") return { ...recipe, materials: { Silk: 2 } };
  if (product === "Sachet")
    return { ...recipe, materials: { Silk: 1, Tea: 1 } };
  if (product === "Incense Oil")
    return { ...recipe, materials: { Frankincense: 1, Beeswax: 1 } };
  return recipe;
}

const percent = (value: number) => Math.round(value * 100);

const BOON_REVISIONS: Record<string, string> = {
  bamboo_fair: `Save ${REBALANCE.bambooUnit} Gold per Bamboo unit bought this round, up to ${REBALANCE.bambooCap} Gold total.`,
  reliable_buyer: `Earn ${REBALANCE.reliableBuyer} extra Gold on your staple contract this round.`,
  safe_anchorage: `Shelter ${REBALANCE.safeAnchorage} more Gold from direct raids and save up to ${REBALANCE.anchorageEscort} Gold on this round's escort.`,
  ceramic_commission: `Earn ${percent(REBALANCE.ceramicRate)}% extra on ordinary Celadon Ware and Lacquered Jar sales after VAT, up to ${REBALANCE.ceramicCap} Gold this round.`,
  coastal_forecast:
    "See exact cargo, destination, and gross reward for two buyers before you shop this round.",
  guild_turnover: `Save one unit of the most expensive input on your first ${REBALANCE.guildUses} charter artisan assignments. Each assignment still needs at least one input.`,
  deep_market: `Save ${REBALANCE.deepUnit} Gold per Frankincense or Lapis Lazuli unit bought, up to ${REBALANCE.deepCap} Gold this round.`,
  rare_cargo_charter: `Earn ${percent(REBALANCE.rareRate)}% extra after VAT on the eligible share of ordinary sales of Frankincense, Lapis Lazuli, or their products, up to ${REBALANCE.rareCap} Gold this round.`,
  false_colors: "Cancel Broker leak risk and halve your escort fee this round.",
  merchants_converge:
    "Reveal one additional buyer before shopping this round. The buyer requests one finished good.",
  merchant_charm:
    "Reduces cargo lot prices by 15% this round, including Workshop Supplier lots. Module discounts apply later.",
  hemp_monopoly:
    "Reduces cargo lot prices by up to 2 Gold per Hemp unit, including Workshop Supplier lots.",
  kiln_and_forge_guild:
    "Adds 15% to the reward share for Celadon Ware and Bronze Mirror this round, after VAT. Imperial Mandates and clearance sales receive no reward bonus.",
  exotic_treasures:
    "Adds 15% to the reward share for Foreign Balm and Pearl String this round, after VAT. Imperial Mandates and clearance sales receive no reward bonus.",
  favorable_tides:
    "Save up to 4 Gold on ordinary freight after the ship level discount this round.",
  artisan_inspiration:
    "The first assigned artisan in roster order finishes one extra item this round.",
};

const MODULE_REVISIONS: Record<string, string> = {
  cargo_net: `Save up to ${REBALANCE.cargoNet} Gold in freight on every ordinary order.`,
  wage_ledger: `Save up to ${REBALANCE.wageLedger} Gold in wages in any round when an artisan finishes a task.`,
  signal_lantern:
    "See an additional buyer's exact next round terms during buying and Artisan Management.",
  merchant_scales: `Save ${REBALANCE.scalesUnit} Gold per port specialty unit in its own port, up to ${REBALANCE.scalesCap} Gold each round.`,
  bonded_warehouse: `Shelter ${REBALANCE.warehouse} more Gold from direct raids.`,
  convoy_pennant: `Save up to ${REBALANCE.convoyFreight} Gold in freight on the first ordinary order each round. During a forecast event, that order also pays ${REBALANCE.convoyReward} additional Gold.`,
  storm_shrouds: `Reduce direct raid loss severity by ${percent(REBALANCE.shrouds)} percentage points.`,
  ocean_exchange_ledger: `Earn ${percent(REBALANCE.oceanRate)}% extra after VAT on the eligible share of ordinary sales of Frankincense, Lapis Lazuli, or their products, up to ${REBALANCE.oceanCap} Gold each round.`,
  storm_lantern: `Save up to ${REBALANCE.lantern} Gold on the escort fee each round.`,
  overdrive_engine: `Freight costs up to 5 Gold less. Maintenance costs ${REBALANCE.overdriveUpkeep} Gold more each round.`,
  artisans_workshop:
    "The first assigned artisan in roster order finishes one extra item each round. Wages cost 20% more after any apprenticeship discount.",
  smugglers_hold:
    "Cargo lots cost 15% less after Merchant's Charm, Hemp Monopoly, Kiln Cellar, and Foreign Quarter Pass. This includes Workshop Supplier lots. The price rounds down before Bamboo Fair, Deep Market, and Merchant Scales. Increases calculated Income Tax by 20% before Tax Evasion Ledger.",
  kiln_cellar:
    "Cargo lots cost 2 Gold less per unit of Porcelain Clay or Copper Ore, to a minimum of zero. This includes Workshop Supplier lots.",
  foreign_quarter_pass:
    "Cargo lots cost 3 Gold less per unit of Spices or Pearls, to a minimum of zero. This includes Workshop Supplier lots.",
  silk_monopoly:
    "Raw Silk ships free. Adds 20% to the reward share for goods made with Silk, after VAT. Imperial Mandates and clearance sales receive no reward bonus.",
  bureau_token:
    "Adds 10% to the reward share for Porcelain Clay, Copper Ore, Celadon Ware, and Bronze Mirror after VAT. Imperial Mandates and clearance sales receive no reward bonus.",
};

const HARBOR_BOON_REVISIONS: Record<
  string,
  { desc: string; modifiers?: Record<string, number> }
> = {
  reliable_buyer: {
    desc: "The first ordinary merchant order you complete this round pays 12 extra Gold.",
  },
  favorable_tides: {
    desc: "Save up to 6 Gold on each ordinary order's freight this round after the ship level discount.",
    modifiers: { transport_flat_discount: 6 },
  },
  frontier_tariff_relief: {
    desc: "Halve finished good VAT and earn 12% more on ordinary finished good orders after VAT this round.",
  },
  master_apprentice: {
    desc: "Pay one quarter of the base wage for artisans hired this round, rounded down before the Artisan's Workshop adjustment.",
    modifiers: { hire_discount: 0.75 },
  },
  merchants_converge: {
    desc: "Reveal an additional ordinary commission for one finished good before shopping this round.",
  },
  kiln_and_forge_guild: {
    desc: "Earn 15% more after VAT on the share of ordinary orders for Celadon Ware or Bronze Mirror.",
  },
  exotic_treasures: {
    desc: "Earn 15% more after VAT on the share of ordinary orders for Foreign Balm or Pearl String.",
  },
  coastal_forecast: {
    desc: "See exact cargo, destination, and gross reward for two ordinary buyers before you shop this round.",
  },
  ceramic_commission: {
    desc: "Earn 20% more after VAT on the share of ordinary orders for Celadon Ware, Lacquered Jar, or Salt Glazed Bowl. Adds up to 30 Gold this round.",
  },
  tax_shelter: {
    desc: "Skip Income Tax at this round's settlement.",
    modifiers: { income_tax_override: 0 },
  },
};

const HARBOR_MODULE_REVISIONS: Record<string, string> = {
  signal_lantern:
    "See an ordinary commission's exact terms one round ahead during buying and Artisan Management.",
  silk_monopoly:
    "Raw Silk ships free on trade orders. Earn 20% more after VAT on the share of ordinary orders for goods made with Silk.",
  bureau_token:
    "Earn 10% more after VAT on the share of ordinary orders for Porcelain Clay, Copper Ore, Celadon Ware, and Bronze Mirror.",
  salvage_crane:
    "Each order with a freight charge has a 50% chance to refund that charge. The Port Exchange has fixed freight.",
  tax_evasion:
    "Halve Income Tax and VAT after other adjustments. Orders have a 15% chance of an audit that takes up to 20 Gold of available funds. Pay at most one audit per round. Exchange sales cannot be audited.",
  overdrive_engine:
    "Freight costs up to 7 Gold less on each order. Maintenance costs 3 Gold more each round.",
  kiln_cellar:
    "Save up to 2 Gold per Porcelain Clay, Copper Ore, or Tin bought from cargo lots or the Workshop Supplier.",
  foreign_quarter_pass:
    "Save up to 3 Gold per Spices, Pearls, or Sandalwood bought from cargo lots or the Workshop Supplier.",
};

export function voyageBoon(boon: Boon, version?: number): Boon {
  if (version === CLASSIC_HARBOR_RULES && boon.id === "merchants_converge")
    return {
      ...boon,
      desc: "Replace one buyer, including a guild buyer, with a finished good commission and see its terms before buying.",
    };
  if (
    harborTrading({ rulesVersion: version }) &&
    HARBOR_BOON_REVISIONS[boon.id]
  )
    return { ...boon, ...HARBOR_BOON_REVISIONS[boon.id] };
  return (version === REBALANCED_RULES ||
    harborTrading({ rulesVersion: version })) &&
    BOON_REVISIONS[boon.id]
    ? { ...boon, desc: BOON_REVISIONS[boon.id] }
    : boon;
}

export function voyageModule(module: Module, version?: number): Module {
  if (version === CLASSIC_HARBOR_RULES && module.id === "signal_lantern")
    return {
      ...module,
      desc: "See a second commission's exact terms one round ahead during buying and Artisan Management.",
    };
  if (
    harborTrading({ rulesVersion: version }) &&
    HARBOR_MODULE_REVISIONS[module.id]
  )
    return { ...module, desc: HARBOR_MODULE_REVISIONS[module.id] };
  return (version === REBALANCED_RULES ||
    harborTrading({ rulesVersion: version })) &&
    MODULE_REVISIONS[module.id]
    ? { ...module, desc: MODULE_REVISIONS[module.id] }
    : module;
}

const REVISED_SALE_PRICES: Partial<Record<string, [number, number]>> = {
  "Cotton Clothes": [46, 58],
  Brocade: [52, 64],
  Sachet: [64, 80],
  "Bamboo Mat": [41, 51],
  "Waxed Canvas": [43, 53],
  "Scented Candle": [58, 72],
  "Lapis Pendant": [96, 118],
};

export function productPriceRange(product: string, version?: number) {
  if (version === OPEN_HARBOR_RULES && product in NEW_PRODUCTS)
    return REVISED_SALE_PRICES[product] ?? PRODUCT_PRICES[product];
  return (
    (version === REBALANCED_RULES ? REVISED_SALE_PRICES[product] : undefined) ??
    PRODUCT_PRICES[product]
  );
}

export function isOceanCargo(item: string, version?: number) {
  return (
    isOceanMaterial(item) ||
    Object.keys(voyageRecipe(item, version)?.materials ?? {}).some(
      isOceanMaterial,
    )
  );
}
