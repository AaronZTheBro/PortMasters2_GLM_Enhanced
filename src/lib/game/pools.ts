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
  EXPANDED_RULES,
  NEW_BOONS,
  NEW_MATERIALS,
  NEW_MODULES,
  NEW_PRODUCTS,
} from "./expansion";

export function unlockedResources(
  difficulty: unknown,
  roundNo: number,
  rulesVersion = CLASSIC_RULES,
): string[] {
  const base = unlockedPool<string>(
    [RESOURCES_TIER0, RESOURCES_TIER1, RESOURCES_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion !== EXPANDED_RULES) return base;
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
): string[] {
  const base = unlockedPool<string>(
    [PRODUCTS_TIER0, PRODUCTS_TIER1, PRODUCTS_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion !== EXPANDED_RULES) return base;
  const raw = unlockedResources(difficulty, roundNo, rulesVersion);
  return base.concat(
    Object.entries(NEW_PRODUCTS)
      .filter(([, recipe]) =>
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
): Boon[] {
  const base = unlockedPool<Boon>(
    [BOONS_TIER0, BOONS_TIER1, BOONS_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion !== EXPANDED_RULES) return base;
  const tier = unlockedTierFor(difficulty, roundNo);
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
): Module[] {
  const base = unlockedPool<Module>(
    [MODULES_TIER0, MODULES_TIER1, MODULES_TIER2],
    difficulty,
    roundNo,
  );
  if (rulesVersion !== EXPANDED_RULES) return base;
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
