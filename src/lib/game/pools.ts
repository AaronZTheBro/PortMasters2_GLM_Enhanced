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
import { unlockedPool, unlockedTierFor } from "./difficulty";

export function unlockedResources(
  difficulty: unknown,
  roundNo: number,
): string[] {
  return unlockedPool<string>(
    [RESOURCES_TIER0, RESOURCES_TIER1, RESOURCES_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedProducts(
  difficulty: unknown,
  roundNo: number,
): string[] {
  return unlockedPool<string>(
    [PRODUCTS_TIER0, PRODUCTS_TIER1, PRODUCTS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedPorts(difficulty: unknown, roundNo: number): string[] {
  return unlockedPool<string>(
    [PORTS_TIER0, PORTS_TIER1, PORTS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedBoons(difficulty: unknown, roundNo: number): Boon[] {
  return unlockedPool<Boon>(
    [BOONS_TIER0, BOONS_TIER1, BOONS_TIER2],
    difficulty,
    roundNo,
  );
}

export function unlockedModules(
  difficulty: unknown,
  roundNo: number,
): Module[] {
  return unlockedPool<Module>(
    [MODULES_TIER0, MODULES_TIER1, MODULES_TIER2],
    difficulty,
    roundNo,
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
