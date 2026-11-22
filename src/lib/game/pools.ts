// Builds round content pools from canonical data and difficulty schedules.
import {
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
  isOceanMaterial,
  specialtyGoods,
  type Specialty,
} from "./expansion";

export function unlockedResources(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
  specialties?: readonly Specialty[],
): string[] {
  const base = unlockedPool<string>(
    [RESOURCES_TIER0, RESOURCES_TIER1, RESOURCES_TIER2],
    difficulty,
    roundNo,
  );
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
  const base = unlockedPool<string>(
    [PRODUCTS_TIER0, PRODUCTS_TIER1, PRODUCTS_TIER2],
    difficulty,
    roundNo,
  );
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

export function unlockedPorts(difficulty: unknown, roundNo: number): string[] {
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
  const base = unlockedPool<Boon>(
    [BOONS_TIER0, BOONS_TIER1, BOONS_TIER2],
    difficulty,
    roundNo,
  );
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
  const base = unlockedPool<Module>(
    [MODULES_TIER0, MODULES_TIER1, MODULES_TIER2],
    difficulty,
    roundNo,
  );
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
): WorkerType[] {
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
  favorable_tides:
    "Save up to 4 Gold on ordinary freight after the ship level discount this round.",
  artisan_inspiration:
    "One assigned artisan finishes an extra item this round.",
};

const MODULE_REVISIONS: Record<string, string> = {
  cargo_net: `Save up to ${REBALANCE.cargoNet} Gold in freight on every ordinary order.`,
  wage_ledger: `Save up to ${REBALANCE.wageLedger} Gold in wages in any round when an artisan finishes a task.`,
  signal_lantern:
    "See an additional buyer's exact next round terms during Artisan Management.",
  merchant_scales: `Save ${REBALANCE.scalesUnit} Gold per port specialty unit in its own port, up to ${REBALANCE.scalesCap} Gold each round.`,
  bonded_warehouse: `Shelter ${REBALANCE.warehouse} more Gold from direct raids.`,
  convoy_pennant: `Save up to ${REBALANCE.convoyFreight} Gold in freight on the first ordinary order each round. During a forecast event, that order also pays ${REBALANCE.convoyReward} additional Gold.`,
  storm_shrouds: `Reduce direct raid loss severity by ${percent(REBALANCE.shrouds)} percentage points.`,
  ocean_exchange_ledger: `Earn ${percent(REBALANCE.oceanRate)}% extra after VAT on the eligible share of ordinary sales of Frankincense, Lapis Lazuli, or their products, up to ${REBALANCE.oceanCap} Gold each round.`,
  storm_lantern: `Save up to ${REBALANCE.lantern} Gold on the escort fee each round.`,
  overdrive_engine: `Freight costs up to 5 Gold less. Maintenance costs ${REBALANCE.overdriveUpkeep} Gold more each round.`,
  artisans_workshop:
    "One assigned artisan finishes an extra item each round. Wages cost 20% more after any apprenticeship discount.",
};

export function voyageBoon(boon: Boon, version?: number): Boon {
  return version === REBALANCED_RULES && BOON_REVISIONS[boon.id]
    ? { ...boon, desc: BOON_REVISIONS[boon.id] }
    : boon;
}

export function voyageModule(module: Module, version?: number): Module {
  return version === REBALANCED_RULES && MODULE_REVISIONS[module.id]
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
